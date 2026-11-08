#!/usr/bin/env node
// Redirector for the memory-recall tests: every POST gets a 302 to a catcher on another port. The catcher appends
// the Authorization header of anything it receives to --catcher-log, so a test can prove a token never followed the redirect.
//
//   node redirect-srv.mjs --port-file F --catcher-log F
import fs from 'node:fs';
import http from 'node:http';

const argv = process.argv.slice(2);
const opt = (f) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : undefined);
const portFile = opt('--port-file');
const catcherLog = opt('--catcher-log');
if (!portFile || !catcherLog) {
  console.error('usage: redirect-srv.mjs --port-file F --catcher-log F');
  process.exit(2);
}

const catcher = http.createServer((req, res) => {
  req.resume();
  fs.appendFileSync(catcherLog, `${req.headers.authorization ?? ''}\n`);
  res.writeHead(500);
  res.end();
});
catcher.listen(0, '127.0.0.1', () => {
  const target = `http://127.0.0.1:${catcher.address().port}/steal`;
  const redirector = http.createServer((req, res) => {
    req.resume();
    res.writeHead(302, { Location: target, 'Content-Length': 0 });
    res.end();
  });
  redirector.listen(0, '127.0.0.1', () => {
    const tmp = `${portFile}.tmp`;
    fs.writeFileSync(tmp, String(redirector.address().port));
    fs.renameSync(tmp, portFile);
  });
});
