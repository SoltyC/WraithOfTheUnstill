// Drive the Windows Chrome (real GPU) from WSL: Playwright connects to ws://127.0.0.1:<client>;
// for each connection the broker spawns PowerShell (bridge-one.ps1), which dials back into the
// broker's dial port and opens Chrome's DevTools port on the Windows side, and pipes the two.
import net from 'node:net';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export function startBroker({ client = 9445, dial = 9444, chrome = 9333 } = {}) {
  const waiting = [];
  const ps1 = execWinPath(path.join(HERE, 'bridge-one.ps1'));
  const dialServer = net.createServer((sock) => {
    const c = waiting.shift();
    if (!c) { sock.destroy(); return; }
    c.pipe(sock); sock.pipe(c); c.resume();
    const end = () => { c.destroy(); sock.destroy(); };
    c.on('close', end); sock.on('close', end); c.on('error', end); sock.on('error', end);
  }).listen(dial, '127.0.0.1');
  const clientServer = net.createServer((c) => {
    c.pause(); waiting.push(c);
    spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1, '-WslPort', String(dial), '-ChromePort', String(chrome)], { stdio: 'ignore' });
  }).listen(client, '127.0.0.1');
  return { close() { dialServer.close(); clientServer.close(); } };
}
function execWinPath(p) {
  // /home/... → \\wsl.localhost\<distro>\home\...
  const distro = process.env.WSL_DISTRO_NAME || 'Ubuntu';
  return '\\\\wsl.localhost\\' + distro + p.replace(/\//g, '\\');
}
