// Minimal LSP client for test-lsp-launcher.sh: runs `node lsp/launch.js <program>` with a PATH that lacks the
// program, drives initialize / notifications / unknown request / shutdown / exit, prints one JSON result.
import { spawn } from 'node:child_process';

const [launcher, program, pathDir] = process.argv.slice(2);
const child = spawn(process.execPath, [launcher, program], {
  env: { ...process.env, PATH: pathDir },
  stdio: ['pipe', 'pipe', 'pipe'],
});
let out = Buffer.alloc(0);
let stderr = '';
child.stderr.on('data', (d) => { stderr += d; });
child.stdout.on('data', (d) => { out = Buffer.concat([out, d]); });
const send = (msg) => {
  const body = Buffer.from(JSON.stringify({ jsonrpc: '2.0', ...msg }));
  child.stdin.write(Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`), body]));
};
send({ id: 1, method: 'initialize', params: { capabilities: {} } });
send({ method: 'initialized', params: {} });
send({ method: 'textDocument/didOpen', params: {} });
send({ id: 2, method: 'textDocument/hover', params: {} });
send({ id: 3, method: 'shutdown' });
send({ method: 'exit' });
const timer = setTimeout(() => { child.kill('SIGKILL'); }, 10000);
child.on('close', (code, signal) => {
  clearTimeout(timer);
  // stdout must be nothing but Content-Length framed messages.
  const msgs = [];
  let clean = true;
  let buf = out;
  while (buf.length) {
    const end = buf.indexOf('\r\n\r\n');
    const m = end < 0 ? null : /^Content-Length: (\d+)$/i.exec(buf.subarray(0, end).toString());
    if (!m || buf.length < end + 4 + Number(m[1])) { clean = false; break; }
    msgs.push(JSON.parse(buf.subarray(end + 4, end + 4 + Number(m[1])).toString()));
    buf = buf.subarray(end + 4 + Number(m[1]));
  }
  console.log(JSON.stringify({ code, signal, clean, msgs, stderr }));
});
