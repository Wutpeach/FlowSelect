param(
  [string]$Version,
  [switch]$SkipBuild,
  [switch]$SkipYtdlpUpdate
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-BinaryVersion {
  param([string]$BinaryPath)

  if (-not (Test-Path $BinaryPath)) {
    return $null
  }

  try {
    $raw = & $BinaryPath "--version" 2>$null | Select-Object -First 1
    if (-not $raw) {
      return $null
    }
    return $raw.ToString().Trim()
  } catch {
    return $null
  }
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Push-Location $repoRoot

try {
  $ytdlpSource = "src-tauri/binaries/yt-dlp-x86_64-pc-windows-msvc.exe"
  $runtimeProxyFileName = "flowselect-cli-proxy-x86_64-pc-windows-msvc.exe"
  $runtimeProxySource = "src-tauri/binaries/$runtimeProxyFileName"
  $ytdlpDownloadUrl = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe"

  if (-not (Test-Path $ytdlpSource)) {
    throw "Cannot find yt-dlp source binary: $ytdlpSource"
  }

  if (-not $SkipYtdlpUpdate) {
    $currentYtdlpVersion = Get-BinaryVersion $ytdlpSource
    if ($currentYtdlpVersion) {
      Write-Host ">>> Current yt-dlp version: $currentYtdlpVersion"
    }

    $tempYtdlpPath = Join-Path ([System.IO.Path]::GetTempPath()) ("flowselect-ytdlp-{0}.tmp" -f [Guid]::NewGuid().ToString("N"))
    try {
      Write-Host ">>> Updating yt-dlp source binary..."
      Invoke-WebRequest -Uri $ytdlpDownloadUrl -OutFile $tempYtdlpPath
      if (-not (Test-Path $tempYtdlpPath)) {
        throw "yt-dlp download failed: temp file not created"
      }
      $downloadedSize = (Get-Item $tempYtdlpPath).Length
      if ($downloadedSize -le 0) {
        throw "yt-dlp download failed: temp file is empty"
      }
      Move-Item -Path $tempYtdlpPath -Destination $ytdlpSource -Force
    } finally {
      if (Test-Path $tempYtdlpPath) {
        Remove-Item $tempYtdlpPath -Force
      }
    }

    $updatedYtdlpVersion = Get-BinaryVersion $ytdlpSource
    if ($updatedYtdlpVersion) {
      Write-Host ">>> Updated yt-dlp version: $updatedYtdlpVersion"
    }
  } else {
    Write-Host ">>> Skip yt-dlp update (SkipYtdlpUpdate=true)"
  }

  if (-not $SkipBuild) {
    Write-Host ">>> Building Tauri app (no bundle)..."
    npx tauri build --no-bundle
    if ($LASTEXITCODE -ne 0) {
      throw "Tauri build failed with exit code $LASTEXITCODE"
    }
  }

  if (-not (Test-Path $runtimeProxySource)) {
    throw "Cannot find runtime proxy source binary: $runtimeProxySource. Run npm run build:runtime-proxies or package without -SkipBuild."
  }

  if (-not $Version) {
    $Version = (Get-Content "package.json" -Raw | ConvertFrom-Json).version
  }

  $portableRoot = "src-tauri/target/release/bundle/portable"
  $portableDir = Join-Path $portableRoot "FlowSelect_portable"
  $stagingDir = Join-Path $portableRoot ("FlowSelect_portable_staging_{0}" -f $PID)
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
  if (Test-Path $stagingDir) {
    Remove-Item $stagingDir -Recurse -Force
  }
  New-Item -ItemType Directory -Force -Path $stagingDir | Out-Null
  New-Item -ItemType Directory -Force -Path (Join-Path $stagingDir "binaries") | Out-Null

  Copy-Item $appExe (Join-Path $stagingDir "FlowSelect.exe") -Force
  Copy-Item $ytdlpSource (Join-Path $stagingDir "binaries/yt-dlp-x86_64-pc-windows-msvc.exe") -Force
  Copy-Item $runtimeProxySource (Join-Path $stagingDir "binaries/$runtimeProxyFileName") -Force

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
    Copy-Item $stagingDir $portableDir -Recurse -Force
  } catch {
    Write-Warning "Failed to refresh FlowSelect_portable directory (likely in use). Zip artifact is updated."
  } finally {
    if (Test-Path $stagingDir) {
      Remove-Item $stagingDir -Recurse -Force
    }
  }

  $artifact = Get-Item $portableZip
  Write-Host ">>> Portable package ready:"
  Write-Host ">>> Path: $($artifact.FullName)"
  Write-Host ">>> Size: $($artifact.Length) bytes"
} finally {
  Pop-Location
}
