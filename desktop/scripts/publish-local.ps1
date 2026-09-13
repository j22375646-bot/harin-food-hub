param([Parameter(Mandatory=$true)][string]$PackageRoot)
$ErrorActionPreference='Stop'
$repo=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$source=(Resolve-Path -LiteralPath $PackageRoot).Path
$archive=Join-Path $source 'resources\app.asar'
$verified=& node (Join-Path $PSScriptRoot 'verify-package.cjs') $archive | ConvertFrom-Json
if($LASTEXITCODE -ne 0 -or $verified.status -ne 'PASS'){throw 'Package verification failed'}
$version=$verified.version
if($version -notmatch '^\d+\.\d+\.\d+$'){throw 'Invalid version'}
$root='D:\GPT\Apps\Moaon'
New-Item -ItemType Directory -Path $root -Force | Out-Null
if((Get-Item -LiteralPath $root).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Release root cannot be a link'}
$releases=Join-Path $root 'releases'
New-Item -ItemType Directory -Path $releases -Force | Out-Null
if((Get-Item -LiteralPath $releases).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Releases cannot be a link'}
$target=Join-Path $releases $version
$stateFile=Join-Path $root 'current.json'
if(Test-Path -LiteralPath $stateFile){$old=Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json;if([version]$version -lt [version]$old.version){throw 'Downgrade blocked'}}
if(Test-Path -LiteralPath $target){throw 'Version already staged; no overwrite'}
$links=Get-ChildItem -LiteralPath $source -Recurse -Force | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }
if($links){throw 'Package links are not accepted'}
Copy-Item -LiteralPath $source -Destination $target -Recurse
$copyCheck=& node (Join-Path $PSScriptRoot 'verify-package.cjs') (Join-Path $target 'resources\app.asar') | ConvertFrom-Json
if($LASTEXITCODE -ne 0 -or $copyCheck.sha256 -ne $verified.sha256){throw 'Copied package verification failed; shortcut unchanged'}
@{owner='moaon-managed-release-v1';version=$version;sha256=$verified.sha256} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $target '.moaon-release.json') -Encoding utf8
$desktop=[Environment]::GetFolderPath('Desktop')
$shell=New-Object -ComObject WScript.Shell
$shortcut=$shell.CreateShortcut((Join-Path $desktop '모아온.lnk'))
$shortcut.TargetPath=Join-Path $target 'MoaonPreview.exe'
$shortcut.WorkingDirectory=$target
# Preserve the user's launch arguments. A missing right monitor must not be
# forced by a release refresh; window placement is the user's preference.
$shortcut.Save()
# Update existing launchers together; otherwise a pinned old release wins the
# single-instance lock and reopens the old version after an update.
$launcherFolders=@((Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'),(Join-Path $env:APPDATA 'Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar'))
foreach($folder in $launcherFolders){foreach($name in @('모아온.lnk','Moaon Preview.lnk')){
 $linkPath=Join-Path $folder $name
 if(-not(Test-Path -LiteralPath $linkPath)){continue}
 $link=$shell.CreateShortcut($linkPath)
 if([IO.Path]::GetFileName($link.TargetPath) -ine 'MoaonPreview.exe'){continue}
 $link.TargetPath=Join-Path $target 'MoaonPreview.exe'
 $link.WorkingDirectory=$target
 $link.Save()
}}

@{version=$version;path=$target;previous=$old.version} | ConvertTo-Json | Set-Content -LiteralPath $stateFile -Encoding utf8
# Remove only the obsolete app shortcut, never unrelated desktop items.
$legacy=Join-Path $desktop 'Moaon Preview.lnk'
if(Test-Path -LiteralPath $legacy){$link=$shell.CreateShortcut($legacy);if($link.TargetPath -eq 'C:\Users\a\AppData\Local\Programs\Moaon Preview\MoaonPreview.exe'){Remove-Item -LiteralPath $legacy}}
# Explorer merges the personal and public desktops. A public legacy link can
# otherwise keep launching the old installation under the same visible name.
$publicDesktop=[Environment]::GetFolderPath('CommonDesktopDirectory')
foreach($name in @('모아온.lnk','Moaon Preview.lnk')){
 $publicLink=Join-Path $publicDesktop $name
 if(-not(Test-Path -LiteralPath $publicLink)){continue}
 $link=$shell.CreateShortcut($publicLink)
 if($link.TargetPath -ne 'C:\Users\a\AppData\Local\Programs\Moaon Preview\MoaonPreview.exe'){continue}
 $backup=Join-Path $root ('shortcut-backups\'+[Guid]::NewGuid().ToString())
 New-Item -ItemType Directory -Path $backup | Out-Null
 Copy-Item -LiteralPath $publicLink -Destination (Join-Path $backup $name)
 Remove-Item -LiteralPath $publicLink
}
$running=@(Get-CimInstance Win32_Process -Filter "Name='MoaonPreview.exe'" | ForEach-Object {$_.ExecutablePath})
$kept=@($version,$old.version)
foreach($dir in Get-ChildItem -LiteralPath $releases -Directory){
 $full=[IO.Path]::GetFullPath($dir.FullName)
 if(-not $full.StartsWith($releases+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Cleanup path escaped root'}
 if($dir.Attributes -band [IO.FileAttributes]::ReparsePoint){continue}
 $marker=Join-Path $full '.moaon-release.json'
 if(-not(Test-Path -LiteralPath $marker)){continue}
 $meta=Get-Content -LiteralPath $marker -Raw | ConvertFrom-Json
 if($meta.owner -ne 'moaon-managed-release-v1' -or $meta.version -ne $dir.Name -or $dir.Name -in $kept){continue}
 if($running | Where-Object {$_ -and $_.StartsWith($full+'\',[StringComparison]::OrdinalIgnoreCase)}){continue}
 if(Get-ChildItem -LiteralPath $full -Recurse -Force | Where-Object {$_.Attributes -band [IO.FileAttributes]::ReparsePoint}){continue}
 Remove-Item -LiteralPath $full -Recurse -Force
}
[pscustomobject]@{version=$version;path=$target;shortcut=(Join-Path $desktop '모아온.lnk');retention='current + previous + running'} | ConvertTo-Json
