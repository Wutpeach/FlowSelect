param(
  [string]$Version,
  [switch]$SkipBuild,
  [switch]$SkipYtdlpUpdate
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-PortableSha256 {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  if (Get-Command Get-FileHash -ErrorAction SilentlyContinue) {
    return (Get-FileHash -Path $Path -Algorithm SHA256).Hash
  }

  $stream = [System.IO.File]::OpenRead($Path)
  try {
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    try {
      $hashBytes = $sha256.ComputeHash($stream)
      return ([System.BitConverter]::ToString($hashBytes)).Replace("-", "")
    } finally {
      $sha256.Dispose()
    }
  } finally {
    $stream.Dispose()
  }
}

function Expand-PortableZip {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ZipPath,
    [Parameter(Mandatory = $true)]
    [string]$DestinationPath
  )

  if (Get-Command Expand-Archive -ErrorAction SilentlyContinue) {
    Expand-Archive -Path $ZipPath -DestinationPath $DestinationPath -Force -ErrorAction Stop
    return
  }

  & tar -xf $ZipPath -C $DestinationPath
  if ($LASTEXITCODE -ne 0) {
    throw "tar extraction failed with exit code $LASTEXITCODE"
  }
}

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
  Copy-Item $unpackedDir $stagingAppDir -Recurse -Force -ErrorAction Stop

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
      try {
        Remove-Item $portableDir -Recurse -Force -ErrorAction Stop
      } catch {
        throw "Failed to remove FlowSelect_portable directory. Close all running portable instances and retry to avoid stale validation artifacts."
      }
    }
    Copy-Item $stagingAppDir $portableDir -Recurse -Force -ErrorAction Stop
  } finally {
    if (Test-Path $stagingDir) {
      Remove-Item $stagingDir -Recurse -Force
    }
  }

  $zipHash = Get-PortableSha256 -Path $portableZip
  $verificationRoot = Join-Path $portableRoot "verification"
  if (-not (Test-Path $verificationRoot)) {
    New-Item -ItemType Directory -Force -Path $verificationRoot | Out-Null
  }
  $verificationDirName = "FlowSelect_portable_verify_{0:yyyyMMdd_HHmmss}" -f (Get-Date)
  $verificationDir = Join-Path $verificationRoot $verificationDirName
  if (Test-Path $verificationDir) {
    Remove-Item $verificationDir -Recurse -Force
  }
  New-Item -ItemType Directory -Force -Path $verificationDir | Out-Null
  try {
    Expand-PortableZip -ZipPath $portableZip -DestinationPath $verificationDir
  } catch {
    Remove-Item $verificationDir -Recurse -Force -ErrorAction SilentlyContinue
    throw "Failed to expand portable ZIP for verification ($portableZip): $_"
  }
  $freshExtractionRoot = Join-Path $verificationDir "FlowSelect_portable"
  if (-not (Test-Path $freshExtractionRoot)) {
    throw "Verification extraction missing FlowSelect_portable directory: $freshExtractionRoot"
  }

  $portableVerificationInfo = @{
    version = $Version
    generatedAt = (Get-Date).ToString("s")
    zipPath = (Resolve-Path $portableZip).Path
    zipSha256 = $zipHash
    mirrorPath = (Resolve-Path $portableDir).Path
    verificationPath = (Resolve-Path $freshExtractionRoot).Path
  }
  $portableVerificationJson = Join-Path $portableRoot "portable-verification.json"
  $portableVerificationInfo | ConvertTo-Json -Depth 3 | Set-Content -Path $portableVerificationJson -Encoding UTF8

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
  Write-Host ">>> SHA256: $zipHash"
  Write-Host ">>> Browser extension package ready:"
  Write-Host ">>> Path: $($browserExtensionArtifact.FullName)"
  Write-Host ">>> Size: $($browserExtensionArtifact.Length) bytes"
  Write-Host ">>> Portable mirror refreshed at: $($portableVerificationInfo.mirrorPath)"
  Write-Host ">>> Fresh verification extraction: $($portableVerificationInfo.verificationPath)"
  Write-Host ">>> Portable verification metadata: $portableVerificationJson"
} finally {
  Pop-Location
}
