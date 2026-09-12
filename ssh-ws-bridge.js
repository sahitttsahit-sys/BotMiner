'use strict';
// ssh-ws-bridge.js — Klien SSH-over-WebSocket, TANPA dependency npm
// (pakai WebSocket global bawaan Node.js >= 22).
//
// MODE A — pendengar lokal (untuk PuTTY / ssh biasa):
//   node ssh-ws-bridge.js                       # dengar 127.0.0.1:2222
//   node ssh-ws-bridge.js URL 2322              # dengar 127.0.0.1:2322
//   lalu:  PuTTY/ssh -> 127.0.0.1:2222  (user root)
//
// MODE B — ProxyCommand (stdin/stdout) untuk `ssh -o ProxyCommand=...`:
//   node ssh-ws-bridge.js --stdio URL
//
// URL default = link permanen publik (sandbox).

const net = require('net');
const DEFAULT_URL = 'wss://a6012ca0b071ce6b7.sg.agentos-app.run/ssh';

let WS = globalThis.WebSocket || null;
if (!WS) { try { WS = require('ws'); } catch {} }
if (!WS) { console.error('WebSocket tidak ada. Pakai Node.js >= 22, atau: npm i ws'); process.exit(1); }

function isOpen(ws) { const R = ws.readyState; return R === 1 || R === (WebSocket.OPEN ?? 1); }

function attach(ws, onOpen, onData, onEnd, onError) {
  if (ws.addEventListener) {
    ws.addEventListener('open', onOpen);
    ws.addEventListener('message', (ev) => onData(Buffer.from(ev.data)));
    ws.addEventListener('close', () => onEnd());
    ws.addEventListener('error', () => onError());
  } else {
    ws.on('open', onOpen);
    ws.on('message', (d) => onData(Buffer.from(d)));
    ws.on('close', () => onEnd());
    ws.on('error', () => onError());
  }
}

function dial(url) {
  const ws = new WS(url);
  try { if (ws.binaryType !== undefined) ws.binaryType = 'arraybuffer'; } catch {}
  return ws;
}

// ---- MODE B: stdio / ProxyCommand ----
function stdioMode(url) {
  const ws = dial(url);
  const pending = [];
  let opened = false;
  process.stdin.on('data', (d) => { if (!opened) { pending.push(d); return; } try { if (isOpen(ws)) ws.send(d); } catch {} });
  process.stdin.on('end', () => { try { ws.close(); } catch {} });
  process.stdin.on('error', () => { try { ws.close(); } catch {} });
  attach(ws,
    () => { opened = true; while (pending.length) { try { ws.send(pending.shift()); } catch {} } },
    (d) => { process.stdout.write(d); },
    () => process.exit(0),
    () => process.exit(1),
  );
}

// ---- MODE A: pendengar lokal ----
function listenMode(url, port) {
  const tcp = net.createServer((sock) => {
    const ws = dial(url);
    attach(ws,
      () => {
        sock.on('data', (d) => { try { if (isOpen(ws)) ws.send(d); } catch {} });
        sock.on('end', () => { try { ws.close(); } catch {} });
        sock.on('error', () => { try { ws.close(); } catch {} });
      },
      (d) => { try { sock.write(d); } catch {} },
      () => { try { sock.end(); } catch {} },
      () => { try { sock.destroy(); } catch {} },
    );
  });
  tcp.listen(port, '127.0.0.1', () => {
    console.log(`ssh-ws-bridge: dengar 127.0.0.1:${port}  ->  ${url}`);
    console.log(`PuTTY/ssh: connect ke 127.0.0.1 port ${port}  (user: root)`);
  });
}

// ---- arg parsing ----
const argv = process.argv.slice(2);
if (argv[0] === '--stdio') {
  stdioMode(argv[1] || DEFAULT_URL);
} else if (argv[0] && argv[0].startsWith('-')) {
  console.error('arg tidak dikenal: ' + argv[0]);
  process.exit(2);
} else {
  const url = argv[0] || DEFAULT_URL;
  const port = Number(argv[1] || 2222);
  listenMode(url, port);
}
