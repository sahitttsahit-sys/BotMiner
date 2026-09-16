'use strict';
// ssh-ws-bridge.js — Klien SSH-over-WebSocket (Node v22, tanpa dependency npm)
// Memakai WebSocket GLOBAL Node v22 (globalThis.WebSocket). Untuk Node <22 butuh: npm i ws
//
// Cara pakai:
//   1) Mode listener (default): dengar TCP lokal, arahkan ke WS publik.
//        node ssh-ws-bridge.js [wss-url] [portLokal]
//        lalu: ssh -p <portLokal> root@127.0.0.1   (atau PuTTY ke 127.0.0.1:<portLokal>)
//
//   2) Mode stdio (ProxyCommand):
//        node ssh-ws-bridge.js --stdio [wss-url]
//        ssh -o ProxyCommand="node ssh-ws-bridge.js --stdio <url>" root@<host-jaga>
//
// URL default di bawah = shareLink permanen + /ssh.
// Skema WAJIB ws:// atau wss:// (https:// otomatis dikonversi ke wss://).

const net = require('net');

// shareLink dari publish: https://aa64f9f35689209e8.sg2.agentos-app.run
// -> endpoint WebSocket: wss://.../ssh
const DEFAULT_URL = 'wss://aa64f9f35689209e8.sg2.agentos-app.run/ssh';

const WS = globalThis.WebSocket || require('ws'); // Node v22 ada global; <22 butuh npm i ws
const OPEN = (WS && WS.OPEN) || 1;

function normalizeUrl(u) {
  if (!u) return DEFAULT_URL;
  if (u.startsWith('https://')) return u.replace(/^https:\/\//, 'wss://');
  if (u.startsWith('http://')) return u.replace(/^http:\/\//, 'ws://');
  return u;
}

function isOpen(ws) { const R = ws ? ws.readyState : 0; return R === OPEN || R === 1; }

function attach(ws, onOpen, onData, onEnd, onErr) {
  if (ws.addEventListener) {
    ws.addEventListener('open', onOpen);
    ws.addEventListener('message', e => onData(Buffer.from(e.data)));
    ws.addEventListener('close', () => onEnd());
    ws.addEventListener('error', () => onErr());
  } else {
    ws.on('open', onOpen);
    ws.on('message', d => onData(Buffer.from(d)));
    ws.on('close', () => onEnd());
    ws.on('error', () => onErr());
  }
}

function dial(url) {
  const w = new WS(url);
  try { if (w.binaryType !== undefined) w.binaryType = 'arraybuffer'; } catch {}
  return w;
}

// Mode ProxyCommand: stdin/stdout <-> ws
function stdioMode(url) {
  const ws = dial(url);
  const pending = [];
  let opened = false;
  // WAJIB: jangan resume stdin sebelum ws 'open' -> data bisa hilang -> "Bad packet length"
  process.stdin.on('data', d => {
    if (!opened) { pending.push(d); return; }
    try { if (isOpen(ws)) ws.send(d); } catch {}
  });
  process.stdin.on('end', () => { try { ws.close(); } catch {} });
  process.stdin.on('error', () => { try { ws.close(); } catch {} });
  attach(ws,
    () => { opened = true; while (pending.length) { try { ws.send(pending.shift()); } catch {} } },
    d => process.stdout.write(d),
    () => process.exit(0),
    () => process.exit(1)
  );
}

// Mode listener: TCP lokal <-> ws
function listenMode(url, port) {
  const tcp = net.createServer(sock => {
    const ws = dial(url);
    attach(ws,
      () => {
        sock.on('data', d => { try { if (isOpen(ws)) ws.send(d); } catch {} });
        sock.on('end', () => { try { ws.close(); } catch {} });
        sock.on('error', () => { try { ws.close(); } catch {} });
      },
      d => { try { sock.write(d); } catch {} },
      () => { try { sock.end(); } catch {} },
      () => { try { sock.destroy(); } catch {} }
    );
  });
  tcp.listen(port, '127.0.0.1', () => {
    console.log(`ssh-ws-bridge: dengar 127.0.0.1:${port} -> ${url}`);
    console.log(`PuTTY/ssh: connect ke 127.0.0.1 port ${port} (user: root)`);
  });
}

const a = process.argv.slice(2);
if (a[0] === '--stdio') stdioMode(normalizeUrl(a[1]) || DEFAULT_URL);
else listenMode(normalizeUrl(a[0]) || DEFAULT_URL, Number(a[1] || 2222));
