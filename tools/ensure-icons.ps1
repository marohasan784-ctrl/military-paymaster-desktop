$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$iconPath = Join-Path $projectRoot 'build\icons\icon.ico'
if (Test-Path $iconPath -PathType Leaf) {
    Write-Output 'Application icon already exists.'
    exit 0
}

$generatorPath = Join-Path $PSScriptRoot 'generate-icons.ps1'
& $generatorPath
if (-not (Test-Path $iconPath -PathType Leaf)) {
    throw 'تعذر إنشاء build\icons\icon.ico.'
}
