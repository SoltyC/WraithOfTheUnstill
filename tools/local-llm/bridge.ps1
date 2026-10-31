param(
  [ValidateSet('start','stop','status','request')][string]$Action,
  [Parameter(Mandatory=$true)][string]$Root,
  [string]$RequestPath,
  [string]$ResponsePath
)
$ErrorActionPreference = 'Stop'
$endpoint = 'http://127.0.0.1:8089'
$pidFile = Join-Path $Root 'server-pid.json'
$exe = Join-Path $Root 'runtime\llama-server.exe'
$model = Join-Path $Root 'models\qwen2.5-coder-7b-instruct-q4_k_m.gguf'
function Get-OwnedServer {
  if (!(Test-Path $pidFile)) { return $null }
  $saved = Get-Content -Raw $pidFile | ConvertFrom-Json
  $process = Get-CimInstance Win32_Process -Filter "ProcessId=$($saved.pid)"
  if ($process -and $process.ExecutablePath -eq $exe -and $process.CommandLine.Contains($model) -and $process.CommandLine.Contains('8089')) { return $process }
  return $null
}
switch ($Action) {
  'start' {
    if (!(Test-Path $exe) -or !(Test-Path $model)) { throw 'Runtime or model is missing' }
    $owned = Get-OwnedServer
    if (!$owned) {
      $arguments = @('--model', ('"' + $model + '"'), '--alias','local-coder','--ctx-size','8192','--n-gpu-layers','99','--threads','8','--parallel','1','--port','8089','--host','127.0.0.1','--flash-attn','on','--jinja')
      $process = Start-Process -FilePath $exe -WorkingDirectory (Split-Path $exe) -ArgumentList $arguments -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $Root 'server-out.log') -RedirectStandardError (Join-Path $Root 'server-error.log')
      @{pid=$process.Id} | ConvertTo-Json | Set-Content -Encoding UTF8 $pidFile
    }
    $ready = $false
    for ($attempt=0; $attempt -lt 180; $attempt++) {
      try { $health = Invoke-RestMethod "$endpoint/health" -TimeoutSec 2; if ($health.status -eq 'ok') { $ready=$true; break } } catch {}
      if (!(Get-OwnedServer)) { throw 'Server exited; inspect server-error.log' }
      Start-Sleep -Milliseconds 500
    }
    if (!$ready) { throw 'Server readiness timed out' }
    $health | ConvertTo-Json -Compress
  }
  'stop' {
    $owned = Get-OwnedServer
    if ($owned) { Stop-Process -Id $owned.ProcessId -Force }
    if (Test-Path $pidFile) { Remove-Item $pidFile }
    '{"stopped":true}'
  }
  'status' {
    if (Get-OwnedServer) { Invoke-RestMethod "$endpoint/health" -TimeoutSec 3 | ConvertTo-Json -Compress }
    else { '{"status":"stopped"}' }
  }
  'request' {
    if (!(Get-OwnedServer)) { throw 'Start the local worker first' }
    $body = [System.IO.File]::ReadAllText($RequestPath)
    $result = Invoke-WebRequest -UseBasicParsing "$endpoint/v1/chat/completions" -Method Post -ContentType 'application/json; charset=utf-8' -Body ([System.Text.Encoding]::UTF8.GetBytes($body)) -TimeoutSec 600
    [System.IO.File]::WriteAllText($ResponsePath, $result.Content, (New-Object System.Text.UTF8Encoding($false)))
    '{"saved":true}'
  }
}
