# Remove only inactive automation profiles in the user's normal temporary folder.
# Called after the matching Chrome processes stop. Captures and personal browser profiles are separate.
param([Parameter(Mandatory=$true)][ValidatePattern('^wraith-(bot|shots)-[0-9]+-$')][string]$Prefix)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'Temp'))
$commands=@(Get-CimInstance Win32_Process -Filter "name='chrome.exe'" | ForEach-Object {$_.CommandLine})
$script:failed=0
function Remove-ProfileTree([string]$Path){
 $absolute=[IO.Path]::GetFullPath($Path)
 if(!$absolute.StartsWith($root+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Profile left the temporary root'}
 try{$entries=[IO.Directory]::GetFileSystemEntries($absolute)}catch{$script:failed++;return}
 foreach($entry in $entries){try{
  $attrs=[IO.File]::GetAttributes($entry)
  if($attrs -band [IO.FileAttributes]::ReparsePoint){$script:failed++;continue}
  if($attrs -band [IO.FileAttributes]::Directory){Remove-ProfileTree $entry}
  else{[IO.File]::SetAttributes($entry,[IO.FileAttributes]::Normal);[IO.File]::Delete($entry)}
 }catch{$script:failed++}}
 for($attempt=0;$attempt -lt 3;$attempt++){
  try{[IO.File]::SetAttributes($absolute,[IO.FileAttributes]::Normal);[IO.Directory]::Delete($absolute,$false);return}catch{if($attempt -lt 2){Start-Sleep -Milliseconds 100}}
 }
 $script:failed++
}
$count=0
foreach($candidate in Get-ChildItem -LiteralPath $root -Directory -Filter ($Prefix+'*')){
 if($candidate.Name -notmatch ('^'+[regex]::Escape($Prefix)+'[0-9]+$')){continue}
 if($candidate.Attributes -band [IO.FileAttributes]::ReparsePoint){continue}
 if($commands | Where-Object{$_ -and $_.Contains($candidate.Name)}){continue}
 $absolute=[IO.Path]::GetFullPath($candidate.FullName)
 if(!$absolute.StartsWith($root+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Unexpected profile path'}
 if(!(Test-Path -LiteralPath ($absolute+'\Local State') -PathType Leaf) -or !(Test-Path -LiteralPath ($absolute+'\Default') -PathType Container)){continue}
 Remove-ProfileTree $absolute;$count++
}
Write-Output "Processed $count inactive profiles; locked/skipped entries $script:failed"
