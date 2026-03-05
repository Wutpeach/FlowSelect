param(
  [string]$Version,
  [switch]$SkipBuild
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Push-Location $repoRoot

try {
  if (-not $SkipBuild) {
    Write-Host ">>> Building Tauri app (no bundle)..."
    npx tauri build --no-bundle
    if ($LASTEXITCODE -ne 0) {
      throw "Tauri build failed with exit code $LASTEXITCODE"
    }
  }

  if (-not $Version) {
    $Version = (Get-Content "package.json" -Raw | ConvertFrom-Json).version
  }

  $portableRoot = "src-tauri/target/release/bundle/portable"
  $portableDir = Join-Path $portableRoot "FlowSelect_portable"
  $portableZip = Join-Path $portableRoot ("FlowSelect_{0}_x64_portable.zip" -f $Version)

  $appExeCandidates = @(
    "src-tauri/target/release/flowselect.exe",
    "src-tauri/target/release/FlowSelect.exe"
  )
  $appExe = $appExeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
  if (-not $appExe) {
    throw "Cannot find app executable in src-tauri/target/release/"
  }

  if (-not (Test-Path $portableRoot)) {
    New-Item -ItemType Directory -Force -Path $portableRoot | Out-Null
  }
  if (Test-Path $portableDir) {
    Remove-Item $portableDir -Recurse -Force
  }
  New-Item -ItemType Directory -Force -Path $portableDir | Out-Null
  New-Item -ItemType Directory -Force -Path (Join-Path $portableDir "binaries") | Out-Null

  Copy-Item $appExe (Join-Path $portableDir "FlowSelect.exe") -Force
  Copy-Item "src-tauri/binaries/yt-dlp-x86_64-pc-windows-msvc.exe" (Join-Path $portableDir "binaries/yt-dlp-x86_64-pc-windows-msvc.exe") -Force
  Copy-Item "src-tauri/binaries/deno.exe" (Join-Path $portableDir "binaries/deno.exe") -Force
  Copy-Item "src-tauri/binaries/yt-dlp-x86_64-pc-windows-msvc.exe" (Join-Path $portableDir "yt-dlp-x86_64-pc-windows-msvc.exe") -Force
  Copy-Item "src-tauri/binaries/deno.exe" (Join-Path $portableDir "deno.exe") -Force

  if (Test-Path $portableZip) {
    Remove-Item $portableZip -Force
  }

  try {
    Write-Host ">>> Packaging with Compress-Archive..."
    Compress-Archive -Path (Join-Path $portableDir "*") -DestinationPath $portableZip -CompressionLevel Optimal -ErrorAction Stop
  } catch {
    Write-Warning "Compress-Archive failed, fallback to tar zip packaging."
    & tar -a -c -f $portableZip -C $portableDir .
    if ($LASTEXITCODE -ne 0) {
      throw "tar packaging failed with exit code $LASTEXITCODE"
    }
  }

  $artifact = Get-Item $portableZip
  Write-Host ">>> Portable package ready:"
  Write-Host ">>> Path: $($artifact.FullName)"
  Write-Host ">>> Size: $($artifact.Length) bytes"
} finally {
  Pop-Location
}
