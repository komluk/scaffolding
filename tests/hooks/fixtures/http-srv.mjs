#!/usr/bin/env node
// Fake MCP endpoint for the memory-recall tests (plain ESM, node: built-ins only).
//
//   node http-srv.mjs --port-file F [--hits F | --config F] [--log F]
//
// Listens on 127.0.0.1:<free port> and writes the port to --port-file once it accepts connections.
//   --hits F    MCP mode (tests/hooks/test-memory-recall.sh): answers a tools/call with the contents of F as the
//               text of an SSE message; `isError` is true unless the request carries `Authorization: Bearer tok`
//               and project_id scaffold:0123456789abcdef.
//   --config F  raw mode (parity runner): answers EVERY request with the JSON in F, re-read per request:
//               { status?: 200, headers?: {}, body?: "text", body_b64?: "base64", delay_ms?: 0, drip_parts?: 0, drip_ms?: 0 }
//               drip_parts N: the body is sent in N pieces, drip_ms apart (headers first, after delay_ms)
//   --log F     appends one block per request: "<METHOD> <path>", the authorization / content-type / accept headers
//               ("(none)" when absent) and the raw body, so request bytes can be compared.
import fs from 'node:fs';
import http from 'node:http';

const argv = process.argv.slice(2);
const opt = (f) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : undefined);
const portFile = opt('--port-file');
const hitsFile = opt('--hits');
const configFile = opt('--config');
const logFile = opt('--log');
if (!portFile || (!hitsFile && !configFile)) {
  console.error('usage: http-srv.mjs --port-file F (--hits F | --config F) [--log F]');
  process.exit(2);
}

const header = (req, name) => req.headers[name] ?? '(none)';
const srv = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const raw = Buffer.concat(chunks);
    const body = raw.toString('utf8');
    if (logFile) {
      fs.appendFileSync(
        logFile,
        `${req.method} ${req.url}\nauthorization: ${header(req, 'authorization')}\ncontent-type: ${header(req, 'content-type')}\n` +
          `accept: ${header(req, 'accept')}\nbody: ${body}\n`,
      );
    }
    let status = 200;
    let headers = {};
    let out;
    let delay = 0;
    let parts = 0;
    let dripMs = 0;
    if (configFile) {
      const cfg = JSON.parse(fs.readFileSync(configFile, 'utf8'));
      status = cfg.status ?? 200;
      headers = cfg.headers ?? {};
      out = cfg.body_b64 !== undefined ? Buffer.from(cfg.body_b64, 'base64') : Buffer.from(cfg.body ?? '', 'utf8');
      delay = cfg.delay_ms ?? 0;
      parts = cfg.drip_parts ?? 0;
      dripMs = cfg.drip_ms ?? 0;
    } else {
      let ok = false;
      try {
        const msg = JSON.parse(body);
        ok = req.headers.authorization === 'Bearer tok' && msg.params.arguments.project_id === 'scaffold:0123456789abcdef';
      } catch {
        /* not JSON: isError */
      }
      const result = { content: [{ type: 'text', text: fs.readFileSync(hitsFile, 'utf8') }], isError: !ok };
      out = Buffer.from(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: 1, result })}\n\n`);
      headers = { 'Content-Type': 'text/event-stream' };
    }
    setTimeout(() => {
      res.writeHead(status, { 'Content-Length': out.length, ...headers });
      if (parts < 2) {
        res.end(out);
        return;
      }
      const size = Math.ceil(out.length / parts);
      let at = 0;
      const next = () => {
        res.write(out.subarray(at, at + size));
        at += size;
        if (at >= out.length) res.end();
        else setTimeout(next, dripMs);
      };
      next();
    }, delay);
  });
});
srv.listen(0, '127.0.0.1', () => {
  const tmp = `${portFile}.tmp`;
  fs.writeFileSync(tmp, String(srv.address().port));
  fs.renameSync(tmp, portFile); // appears atomically
});
