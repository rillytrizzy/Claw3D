param(
  [ValidateSet('Verify', 'Apply')]
  [string]$Mode = 'Verify',
  [string]$RepoRoot = 'C:\Users\b_bar\claw3d',
  [string]$HookRoot = 'C:\tools\rtos-hooks',
  [string]$HermesApiUrl = 'http://localhost:8642',
  [int]$AdapterPort = 18789
)

$ErrorActionPreference = 'Stop'

function Read-EnvFile {
  param([string]$Path)
  $values = [ordered]@{}
  if (-not (Test-Path -LiteralPath $Path)) { return $values }
  foreach ($line in Get-Content -LiteralPath $Path) {
    if ($line -notmatch '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$') { continue }
    $values[$Matches[1]] = $Matches[2].Trim().Trim('"').Trim("'")
  }
  return $values
}

function New-SharedSecret {
  $bytes = [byte[]]::new(32)
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($bytes)
  } finally {
    $rng.Dispose()
  }
  return [Convert]::ToBase64String($bytes)
}

function Write-EnvLocal {
  param(
    [string]$Path,
    [System.Collections.IDictionary]$Existing,
    [string]$Secret
  )
  $lines = @(
    'CLAW3D_GATEWAY_ADAPTER_TYPE=hermes',
    'CLAW3D_GATEWAY_URL=ws://localhost:18789',
    'DEBUG=false',
    'HERMES_ADAPTER_PORT=18789',
    'HERMES_ACTION_REMOTE_ALLOWLIST=127.0.0.1,::1',
    'HERMES_ACTION_ORIGIN_ALLOWLIST=localhost,127.0.0.1',
    "HERMES_ACTION_SHARED_SECRET=$Secret"
  )

  $preserveKeys = @(
    'HERMES_API_URL',
    'HERMES_API_KEY',
    'HERMES_MODEL',
    'HERMES_AGENT_NAME',
    'HERMES_HEALTH_CORS_ALLOW_ORIGINS'
  )
  foreach ($key in $preserveKeys) {
    if ($Existing.Contains($key) -and $Existing[$key]) {
      $lines += "$key=$($Existing[$key])"
    }
  }

  Set-Content -LiteralPath $Path -Value $lines -Encoding utf8
}

function Assert-File {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Missing required file: $Path"
  }
}

function Stop-AdapterPortOwner {
  param([int]$Port)
  $processIds = @()
  try {
    $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop
    $processIds += $connections | ForEach-Object { $_.OwningProcess }
  } catch {
    $processIds += (& netstat.exe -ano -p tcp) |
      Select-String -Pattern "LISTENING\s+(\d+)$" |
      ForEach-Object {
        $line = $_.Line.Trim()
        if ($line -match "[:\.]$Port\s+.*LISTENING\s+(\d+)$") { $Matches[1] }
      }
  }

  foreach ($processId in ($processIds | Sort-Object -Unique)) {
    if (-not $processId) { continue }
    $process = Get-Process -Id ([int]$processId) -ErrorAction SilentlyContinue
    if (-not $process) { continue }
    Stop-Process -Id $process.Id -Force
  }
}

$envLocalPath = Join-Path $RepoRoot '.env.local'
$configPath = Join-Path $HookRoot 'rtos.config.json'
$restartScript = Join-Path $HookRoot 'restart-hermes-adapter.ps1'
$requiredHooks = @(
  'autonomic-baseline.ps1',
  'log-activity.ps1',
  'memory-recall.ps1',
  'rtos-ledger-rotate.ps1',
  'session-closeout.ps1',
  'vault-stamp.ps1'
)

Assert-File (Join-Path $RepoRoot 'server\hermes-gateway-adapter.js')
Assert-File $configPath
Assert-File $restartScript
foreach ($hook in $requiredHooks) {
  Assert-File (Join-Path $HookRoot $hook)
}

$node = Get-Command node -ErrorAction Stop
$npm = Get-Command npm -ErrorAction Stop
$existing = Read-EnvFile -Path $envLocalPath
$secret = if ($existing.Contains('HERMES_ACTION_SHARED_SECRET') -and $existing['HERMES_ACTION_SHARED_SECRET']) {
  $existing['HERMES_ACTION_SHARED_SECRET']
} else {
  New-SharedSecret
}
$secretState = if ($existing.Contains('HERMES_ACTION_SHARED_SECRET') -and $existing['HERMES_ACTION_SHARED_SECRET']) {
  'present'
} else {
  'generated'
}

if ($Mode -eq 'Apply') {
  Write-EnvLocal -Path $envLocalPath -Existing $existing -Secret $secret
  Stop-AdapterPortOwner -Port $AdapterPort
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $restartScript
}

$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
$expectedHealth = "http://127.0.0.1:$AdapterPort/health"
if ($config.gateway_health_uri -ne $expectedHealth) {
  throw "Unexpected gateway_health_uri: $($config.gateway_health_uri)"
}

$hermesReachable = $false
try {
  $response = Invoke-WebRequest -UseBasicParsing -Uri "$HermesApiUrl/v1/models" -TimeoutSec 5
  $hermesReachable = [int]$response.StatusCode -lt 500
} catch {
  $hermesReachable = $false
}

$adapterHealth = $null
try {
  $adapterHealth = Invoke-RestMethod -Uri $expectedHealth -TimeoutSec 5
} catch {
  $adapterHealth = $null
}

[pscustomobject]@{
  mode = $Mode
  envLocal = $envLocalPath
  secret = $secretState
  node = $node.Source
  npm = $npm.Source
  hookRoot = $HookRoot
  configPath = $configPath
  hermesApiReachable = $hermesReachable
  adapterHealthJson = [bool]$adapterHealth
  adapterHealthUri = $expectedHealth
} | ConvertTo-Json -Depth 4
