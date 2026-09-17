param(
    [string]$OutDir = ""
)

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

$extDir = Join-Path $repoRoot "extension"
$manifestPath = Join-Path $extDir "manifest.json"
if (-not (Test-Path $manifestPath)) {
    Write-Error "extension/manifest.json not found"
    exit 1
}

$manifest = Get-Content -Raw -Encoding UTF8 $manifestPath | ConvertFrom-Json
$version = [string]$manifest.version
if (-not $version) {
    Write-Error "manifest.json missing version"
    exit 1
}

if (-not $OutDir) {
    $OutDir = Join-Path $repoRoot "dist"
}
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$zipName = "deepseek-text-picker-$version.zip"
$zipPath = Join-Path $OutDir $zipName
if (Test-Path $zipPath) {
    Remove-Item -Force $zipPath
}

# Zip root = extension contents (manifest.json at archive root)
$staging = Join-Path $OutDir ("_pack_staging_" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $staging | Out-Null
try {
    Copy-Item -Path (Join-Path $extDir "*") -Destination $staging -Recurse -Force
    Compress-Archive -Path (Join-Path $staging "*") -DestinationPath $zipPath -CompressionLevel Optimal
} finally {
    Remove-Item -Recurse -Force $staging -ErrorAction SilentlyContinue
}

Write-Host "packed: $zipPath"
Write-Host "version: $version"
