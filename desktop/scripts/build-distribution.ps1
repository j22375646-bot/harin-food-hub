param([string]$ChannelConfig)
$ErrorActionPreference='Stop'
. D:\GPT\enter-moaon.ps1
$desktopRoot=Split-Path $PSScriptRoot -Parent
if(-not $ChannelConfig){$candidate=Join-Path $desktopRoot 'update-channel.json';if((Get-Content $candidate -Raw|ConvertFrom-Json).enabled){$ChannelConfig=$candidate}}
$taskStamp=Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$stage=Join-Path 'D:\GPT\tmp' ('moaon-distribution-'+$taskStamp)
$output=Join-Path $desktopRoot ('dist\distribution-'+$taskStamp)
$prepareArgs=@((Join-Path $PSScriptRoot 'prepare-distribution.cjs'),$stage)
if($ChannelConfig){$prepareArgs+=(Resolve-Path -LiteralPath $ChannelConfig).Path}
& node @prepareArgs
if($LASTEXITCODE -ne 0){throw 'Distribution preparation failed'}
& node (Join-Path $desktopRoot 'node_modules\electron-builder\cli.js') --projectDir $stage --win nsis --x64 --publish never --config.npmRebuild=false --config.electronDist=D:\GPT\deps\moaon-desktop-runtime\node_modules\electron\dist "--config.directories.output=$output"
if($LASTEXITCODE -ne 0){throw 'Installer build failed'}
$installer=Get-ChildItem -LiteralPath $output -Filter '*-Setup.exe'
if(@($installer).Count -ne 1){throw 'Exactly one installer required'}
$signature=Get-AuthenticodeSignature -LiteralPath $installer.FullName
$channel=if($ChannelConfig){Get-Content -LiteralPath $ChannelConfig -Raw|ConvertFrom-Json}else{$null}
if($ChannelConfig -and $channel.mode -ne 'ed25519' -and $signature.Status -ne 'Valid'){throw 'Signed release blocked: installer signature is not valid'}
if($channel.mode -eq 'ed25519'){& node (Join-Path $PSScriptRoot 'update-signing.cjs') sign $installer.FullName ((Get-Content (Join-Path $stage 'package.json') -Raw|ConvertFrom-Json).version) $output;if($LASTEXITCODE -ne 0){throw 'Release signature failed'}}
$manifest=@{version=(Get-Content (Join-Path $stage 'package.json') -Raw|ConvertFrom-Json).version;file=$installer.Name;bytes=$installer.Length;sha256=(Get-FileHash -LiteralPath $installer.FullName -Algorithm SHA256).Hash;signature=$signature.Status.ToString();automaticUpdates=[bool]$ChannelConfig;published=$false}
$manifest|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $output 'distribution.json') -Encoding utf8
$manifest|ConvertTo-Json
Write-Output "Output: $output"
