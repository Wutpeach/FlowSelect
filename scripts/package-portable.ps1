param(
  [string]$Version,
  [switch]$SkipBuild,
  [switch]$SkipYtdlpUpdate
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Push-Location $repoRoot

try {
  if ($SkipYtdlpUpdate) {
    Write-Host ">>> Ignore legacy SkipYtdlpUpdate flag for Electron portable packaging"
  }

  if (-not $SkipBuild) {
    Write-Host ">>> Building Electron Windows app (unpacked)..."
    npm run package:win:dir
    if ($LASTEXITCODE -ne 0) {
      throw "Electron Windows unpacked build failed with exit code $LASTEXITCODE"
    }
  }

  if (-not $Version) {
    $Version = (Get-Content "package.json" -Raw | ConvertFrom-Json).version
  }

  $builderOutputRoot = "dist-release"
  $unpackedDir = Join-Path $builderOutputRoot "win-unpacked"
  $portableRoot = Join-Path $builderOutputRoot "portable"
  $portableDir = Join-Path $portableRoot "FlowSelect_portable"
  $stagingDir = Join-Path $portableRoot ("FlowSelect_portable_staging_{0}" -f $PID)
  $stagingAppDir = Join-Path $stagingDir "FlowSelect_portable"
  $portableZip = Join-Path $portableRoot ("FlowSelect_{0}_windows_x64_portable.zip" -f $Version)
  $browserExtensionZip = Join-Path $portableRoot ("FlowSelect_{0}_browser_extension.zip" -f $Version)
  $unpackedExe = Join-Path $unpackedDir "FlowSelect.exe"

  if (-not (Test-Path $unpackedExe)) {
    throw "Cannot find Electron portable executable: $unpackedExe. Run npm run package:win:dir or package without -SkipBuild."
  }

  if (-not (Test-Path $portableRoot)) {
    New-Item -ItemType Directory -Force -Path $portableRoot | Out-Null
  }
  if (Test-Path $stagingDir) {
    Remove-Item $stagingDir -Recurse -Force
  }
  New-Item -ItemType Directory -Force -Path $stagingDir | Out-Null
  Copy-Item $unpackedDir $stagingAppDir -Recurse -Force

  if (Test-Path $portableZip) {
    Remove-Item $portableZip -Force
  }

  try {
    Write-Host ">>> Packaging with Compress-Archive..."
    Compress-Archive -Path (Join-Path $stagingDir "*") -DestinationPath $portableZip -CompressionLevel Optimal -ErrorAction Stop
  } catch {
    Write-Warning "Compress-Archive failed, fallback to tar zip packaging."
    & tar -a -c -f $portableZip -C $stagingDir .
    if ($LASTEXITCODE -ne 0) {
      throw "tar packaging failed with exit code $LASTEXITCODE"
    }
  }

  try {
    if (Test-Path $portableDir) {
      Remove-Item $portableDir -Recurse -Force
    }
    Copy-Item $stagingAppDir $portableDir -Recurse -Force
  } catch {
    Write-Warning "Failed to refresh FlowSelect_portable directory (likely in use). Zip artifact is updated."
  } finally {
    if (Test-Path $stagingDir) {
      Remove-Item $stagingDir -Recurse -Force
    }
  }

  Write-Host ">>> Packaging browser extension ZIP..."
  node ./scripts/package-browser-extension.mjs --version $Version --output-dir $portableRoot
  if ($LASTEXITCODE -ne 0) {
    throw "Browser extension packaging failed with exit code $LASTEXITCODE"
  }
  if (-not (Test-Path $browserExtensionZip)) {
    throw "Cannot find browser extension package: $browserExtensionZip"
  }

  $artifact = Get-Item $portableZip
  $browserExtensionArtifact = Get-Item $browserExtensionZip
  Write-Host ">>> Portable package ready:"
  Write-Host ">>> Path: $($artifact.FullName)"
  Write-Host ">>> Size: $($artifact.Length) bytes"
  Write-Host ">>> Browser extension package ready:"
  Write-Host ">>> Path: $($browserExtensionArtifact.FullName)"
  Write-Host ">>> Size: $($browserExtensionArtifact.Length) bytes"
} finally {
  Pop-Location
}
