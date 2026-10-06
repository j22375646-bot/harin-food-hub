$ErrorActionPreference='Stop'
. D:\GPT\enter-moaon.ps1
$updaterRoot='D:\GPT\deps\moaon-updater-runtime\node_modules\electron-updater'
if((Get-Content (Join-Path $updaterRoot 'package.json') -Raw|ConvertFrom-Json).version -ne '6.8.9'){throw 'Review updater version before rebuilding'}
& npm exec --cache D:\GPT\cache\npm --yes --package=esbuild@0.25.12 -- esbuild (Join-Path $updaterRoot 'out\NsisUpdater.js') --bundle --platform=node --format=cjs --external:electron --external:original-fs --outfile=desktop/updater-runtime.cjs --legal-comments=eof --metafile=D:/GPT/tmp/updater-bundle-meta.json
if($LASTEXITCODE -ne 0){throw 'Updater bundling failed'}
& node (Join-Path $PSScriptRoot 'updater-licenses.cjs')
if($LASTEXITCODE -ne 0){throw 'Updater license generation failed'}
