$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'Temp'))
$token=[DateTimeOffset]::Now.ToUnixTimeMilliseconds().ToString()
$remove=Join-Path $root ('wraith-bot-4999-'+$token)
$keep=Join-Path $root ('wraith-cleanup-keep-'+$token)
foreach($folder in @($remove,$keep)){
 if(![IO.Path]::GetFullPath($folder).StartsWith($root+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Fixture outside temporary root'}
 New-Item -ItemType Directory -Path ($folder+'\Default\Cache') -Force | Out-Null
 [IO.File]::WriteAllText(($folder+'\Local State'),'{}')
 [IO.File]::WriteAllText(($folder+'\Default\Cache\fixture.txt'),'disposable test cache')
}
try{
 & (Join-Path $PSScriptRoot 'cleanup-profiles.ps1') -Prefix 'wraith-bot-4999-'
 if(Test-Path -LiteralPath $remove){throw 'Owned inactive fixture was not removed'}
 if(!(Test-Path -LiteralPath ($keep+'\Default\Cache\fixture.txt'))){throw 'Unrelated fixture was touched'}
 $rejected=$false;try{& (Join-Path $PSScriptRoot 'cleanup-profiles.ps1') -Prefix '../'}catch{$rejected=$true}
 if(!$rejected){throw 'Malformed prefix was accepted'}
 Write-Output 'PASS: owned profile cleared, unrelated data preserved, malformed scope rejected'
}finally{
 foreach($folder in @($remove,$keep)){
  if(![IO.Path]::GetFullPath($folder).StartsWith($root+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Fixture cleanup outside root'}
  if(Test-Path -LiteralPath $folder){Remove-Item -LiteralPath $folder -Recurse -Force}
 }
}
