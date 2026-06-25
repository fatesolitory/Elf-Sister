$ErrorActionPreference = "Stop"

$releaseDir = Join-Path $PSScriptRoot "..\release"
$sourceDir = Join-Path $releaseDir "win-unpacked"
$targetDir = Join-Path $releaseDir "Elf Sister"
$version = "26.06.24.1.7"
$versionDir = Join-Path $releaseDir $version
$versionTargetDir = Join-Path $versionDir "Elf Sister"
$sourceExe = Join-Path $sourceDir "electron.exe"
$targetExe = Join-Path $sourceDir "Elf Sister.exe"

if (Test-Path $sourceExe) {
  Rename-Item -LiteralPath $sourceExe -NewName "Elf Sister.exe" -Force
}

New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
robocopy $sourceDir $targetDir /MIR /R:2 /W:1 /NFL /NDL /NJH /NJS /NP
if ($LASTEXITCODE -gt 7) {
  throw "robocopy failed with exit code $LASTEXITCODE"
}

$dataDir = Join-Path $targetDir "data"
$logsDir = Join-Path $targetDir "logs"
New-Item -ItemType Directory -Force -Path (Join-Path $dataDir "backups") | Out-Null
New-Item -ItemType Directory -Force -Path $logsDir | Out-Null

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Join-Path $dataDir "conversations.json"), "[]`n", $utf8NoBom)
[System.IO.File]::WriteAllText((Join-Path $dataDir "key-points.json"), "[]`n", $utf8NoBom)
[System.IO.File]::WriteAllText((Join-Path $dataDir "model-context.json"), "[]`n", $utf8NoBom)
[System.IO.File]::WriteAllText((Join-Path $dataDir "model-secrets.json"), "{ `"apiKey`": `"`", `"visionApiKey`": `"`" }`n", $utf8NoBom)
[System.IO.File]::WriteAllText((Join-Path $logsDir "app-events.jsonl"), "", $utf8NoBom)
[System.IO.File]::WriteAllText((Join-Path $targetDir "VERSION.txt"), "26.06.24.1.7`n", $utf8NoBom)

if (!(Test-Path (Join-Path $targetDir "Elf Sister.exe"))) {
  throw "Elf Sister.exe was not created."
}

$iconPath = Join-Path $PSScriptRoot "..\assets\icons\elf-sister.ico"
$rceditPath = Join-Path $PSScriptRoot "..\node_modules\rcedit\bin\rcedit-x64.exe"
if ((Test-Path $iconPath) -and (Test-Path $rceditPath)) {
  & $rceditPath (Join-Path $targetDir "Elf Sister.exe") --set-icon $iconPath
  if ($LASTEXITCODE -ne 0) {
    throw "rcedit failed with exit code $LASTEXITCODE"
  }
}

New-Item -ItemType Directory -Force -Path $versionTargetDir | Out-Null
robocopy $targetDir $versionTargetDir /MIR /R:2 /W:1 /NFL /NDL /NJH /NJS /NP
if ($LASTEXITCODE -gt 7) {
  throw "version robocopy failed with exit code $LASTEXITCODE"
}
