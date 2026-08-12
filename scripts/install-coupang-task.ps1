param(
  [string]$DailyAt = '05:30',
  [switch]$RunNow
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$bundledNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$nodePath = if ($nodeCommand) { $nodeCommand.Source } elseif (Test-Path -LiteralPath $bundledNode) { $bundledNode } else { throw 'Node.js 실행 파일을 찾을 수 없습니다.' }
$scriptPath = Join-Path $projectRoot 'scripts\coupang-local-sync.js'
$taskName = 'Harin-Coupang-Sync'
$workerScriptPath = Join-Path $projectRoot 'scripts\coupang-local-worker.js'
$workerTaskName = 'Harin-Coupang-Worker'
$powerShellPath = (Get-Command powershell.exe -ErrorAction Stop).Source

if (-not (Test-Path -LiteralPath $scriptPath)) {
  throw "동기화 실행기를 찾을 수 없습니다: $scriptPath"
}

$dailyCommand = "& '$nodePath' '$scriptPath'"
$action = New-ScheduledTaskAction -Execute $powerShellPath -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -Command "{0}"' -f $dailyCommand) -WorkingDirectory $projectRoot
$dailyTrigger = New-ScheduledTaskTrigger -Daily -At $DailyAt
$settings = New-ScheduledTaskSettingsSet -Hidden -StartWhenAvailable -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 5) -ExecutionTimeLimit (New-TimeSpan -Hours 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $dailyTrigger -Settings $settings -Principal $principal -Description '하린식품 쿠팡 WING 데이터를 매일 한 번 숨김 상태로 자동 동기화합니다.' -Force | Out-Null

$workerCommand = "& '$nodePath' '$workerScriptPath' --watch --quiet"
$workerAction = New-ScheduledTaskAction -Execute $powerShellPath -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -Command "{0}"' -f $workerCommand) -WorkingDirectory $projectRoot
$workerTrigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$workerSettings = New-ScheduledTaskSettingsSet -Hidden -StartWhenAvailable -MultipleInstances IgnoreNew -RestartCount 20 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Seconds 0) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $workerTaskName -Action $workerAction -Trigger $workerTrigger -Settings $workerSettings -Principal $principal -Description '하린식품 허브의 수동 쿠팡 수집 요청을 이벤트로 받아 숨김 상태에서 즉시 처리합니다.' -Force | Out-Null

if ($RunNow) {
  Start-ScheduledTask -TaskName $taskName
}
Start-ScheduledTask -TaskName $workerTaskName

$task = Get-ScheduledTask -TaskName $taskName
[pscustomobject]@{
  TaskName = $task.TaskName
  State = $task.State
  DailyAt = $DailyAt
  ProjectRoot = $projectRoot
  WorkerTaskName = $workerTaskName
}
