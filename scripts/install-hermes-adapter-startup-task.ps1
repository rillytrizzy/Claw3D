param(
  [string]$TaskName = 'Claw3D Hermes Gateway Adapter',
  [string]$RepoRoot = 'C:\Users\b_bar\claw3d',
  [string]$RestartScript = 'C:\tools\rtos-hooks\restart-hermes-adapter.ps1'
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $RestartScript)) {
  throw "Missing restart script: $RestartScript"
}
if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot '.env.local'))) {
  throw "Missing .env.local. Run scripts\secure-hermes-onboarding.ps1 -Mode Apply first."
}

$action = New-ScheduledTaskAction `
  -Execute 'powershell.exe' `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$RestartScript`"" `
  -WorkingDirectory $RepoRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 5) `
  -Hidden

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Force | Out-Null

[pscustomobject]@{
  taskName = $TaskName
  workingDirectory = $RepoRoot
  restartScript = $RestartScript
  verificationCommand = 'Invoke-RestMethod -Uri http://127.0.0.1:18789/health'
} | ConvertTo-Json -Depth 3
