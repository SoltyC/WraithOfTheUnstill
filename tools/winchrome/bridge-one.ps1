# One tunnelled connection: dial the WSL broker, then Chrome's DevTools port, and copy both ways
# until either side closes. Spawned per connection by broker.mjs (WSL cannot reach Windows
# localhost; Windows can reach WSL's).
param([int]$WslPort = 9444, [int]$ChromePort = 9333)
$a = New-Object System.Net.Sockets.TcpClient('127.0.0.1', $WslPort)
$b = New-Object System.Net.Sockets.TcpClient('127.0.0.1', $ChromePort)
$sa = $a.GetStream(); $sb = $b.GetStream()
$t1 = $sa.CopyToAsync($sb, 65536); $t2 = $sb.CopyToAsync($sa, 65536)
[System.Threading.Tasks.Task]::WaitAny(@($t1, $t2)) | Out-Null
$a.Close(); $b.Close()
