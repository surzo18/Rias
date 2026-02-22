param(
  [Parameter(Mandatory = $true)]
  [string]$ZipPath
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$quarantineRoot = Join-Path $repoRoot "quarantine"
$extractDir = Join-Path $quarantineRoot "EsdeathOV2Super"

if (-not (Test-Path $ZipPath)) {
  throw "ZIP not found: $ZipPath"
}

New-Item -ItemType Directory -Force $quarantineRoot | Out-Null
New-Item -ItemType Directory -Force $extractDir | Out-Null

Write-Host "== SHA256 =="
Get-FileHash $ZipPath -Algorithm SHA256

Write-Host ""
Write-Host "== ZIP CONTENTS =="
tar -tf $ZipPath

Write-Host ""
Write-Host "== EXTRACT =="
tar -xf $ZipPath -C $extractDir

Write-Host ""
Write-Host "== DANGEROUS FILE EXTENSIONS =="
$bad = Get-ChildItem -Path $extractDir -Recurse -File | Where-Object {
  $_.Extension -in ".exe", ".dll", ".bat", ".cmd", ".ps1", ".js", ".vbs", ".scr", ".msi", ".com"
}
if ($bad) {
  $bad | ForEach-Object { $_.FullName }
} else {
  Write-Host "none"
}

Write-Host ""
Write-Host "== DEFENDER SCAN =="
Start-MpScan -ScanType CustomScan -ScanPath $extractDir

Write-Host ""
Write-Host "Done. Extracted to: $extractDir"
