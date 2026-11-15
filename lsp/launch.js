#!/usr/bin/env node
// Launcher for the plugin.json lspServers entries.
//   node launch.js <program> [args...]
// If <program> is on PATH it is run as-is (stdio inherited, signals forwarded, exit status propagated).
// If not, this process answers as a minimal no-op LSP server so Claude Code does not report
// "its program wasn't found" on hosts that do not have the language server installed.
'use strict';
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function findOnPath(program) {
  if (program.includes('/') || program.includes(path.sep)) {
    return isExecutable(program) ? program : null;
  }
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, program);
    if (isExecutable(candidate)) return candidate;
  }
  return null;
}

function isExecutable(file) {
  try {
    if (!fs.statSync(file).isFile()) return false;
    fs.accessSync(file, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function runProgram(file, args) {
  const child = spawn(file, args, { stdio: 'inherit' });
  for (const sig of ['SIGTERM', 'SIGINT']) {
    process.on(sig, () => child.kill(sig));
  }
  child.on('error', (err) => {
    process.stderr.write(`lsp-launch: cannot run ${file}: ${err.message}\n`);
    process.exit(127);
  });
  child.on('exit', (code, signal) => {
    if (signal) {
      process.removeAllListeners(signal);
      process.kill(process.pid, signal);
    } else {
      process.exit(code ?? 0);
    }
  });
}

function runStub(program) {
  process.stderr.write(`lsp-launch: ${program} not found on PATH; running as a no-op language server\n`);
  const send = (msg) => {
    const body = Buffer.from(JSON.stringify({ jsonrpc: '2.0', ...msg }));
    process.stdout.write(Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`), body]));
  };
  const handle = (msg) => {
    const hasId = msg.id !== undefined && msg.id !== null;
    if (msg.method === 'exit') process.exit(0);
    if (!hasId || typeof msg.method !== 'string') return; // notification or a response to us: ignore
    if (msg.method === 'initialize') {
      send({ id: msg.id, result: { capabilities: {}, serverInfo: { name: `${program} (not installed)` } } });
    } else if (msg.method === 'shutdown') {
      send({ id: msg.id, result: null });
    } else {
      send({ id: msg.id, error: { code: -32601, message: `${msg.method} not supported: ${program} is not installed` } });
    }
  };

  let buf = Buffer.alloc(0);
  process.stdin.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      const end = buf.indexOf('\r\n\r\n');
      if (end < 0) return;
      const m = /content-length:\s*(\d+)/i.exec(buf.subarray(0, end).toString('latin1'));
      if (!m) { // malformed header block: drop it and resync
        buf = buf.subarray(end + 4);
        continue;
      }
      const start = end + 4;
      const len = Number(m[1]);
      if (buf.length < start + len) return;
      const raw = buf.subarray(start, start + len).toString('utf8');
      buf = buf.subarray(start + len);
      let msg;
      try { msg = JSON.parse(raw); } catch { continue; }
      if (msg && typeof msg === 'object') handle(msg);
    }
  });
  process.stdin.on('end', () => process.exit(0));
  process.stdout.on('error', () => process.exit(0));
}

const [program, ...args] = process.argv.slice(2);
if (!program) {
  process.stderr.write('usage: launch.js <program> [args...]\n');
  process.exit(2);
}
const found = findOnPath(program);
if (found) runProgram(found, args);
else runStub(program);
