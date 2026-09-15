'use strict';
// ssh-ws-bridge.js — Klien SSH-over-WebSocket (Node v22, tanpa dependency npm)
// Menghubungkan klien SSH lokal (PuTTY/Terminal) ke sshd sandbox lewat link publik.
//
// Pemakaian:
//   Mode listener (default):  node ssh-ws-bridge.js [url] [portLokal]
//       -> dengar 127.0.0.1:<portLokal> (default 2222), teruskan ke <url>
//   Mode ProxyCommand:        node ssh-ws-bridge.js --stdio [url]
//       -> stdin/stdout pipa ke ws (untuk ssh -o ProxyCommand=...)
//
// DEFAULT_URL diisi shareLink publik + path /ssh (skema wss://).

const net = require('net');

// ShareLink dari publish: https://ac19466bd3e674c69.sg2.agentos-app.run
// WebSocket endpoint: wss://.../ssh
const DEFAULT_URL = 'wss://ac19466bd3e674c69.sg2.agentos-app.run/ssh';

// WebSocket global Node v22; untuk <22 butuh `npm i ws` (fallback).
const WS = globalThis.WebSocket || require('ws');
const OPEN = (WS && WS.OPEN) || 1;

function isOpen(ws) {
  const R = ws ? ws.readyState : 0;
  return R === OPEN || R === 1;
}

function normalizeUrl(url) {
  // Terima http(s):// dan ubah ke ws(s):// supaya valid untuk WebSocket.
  if (url.startsWith('https://')) return url.replace(/^https:\/\//, 'wss://');
  if (url.startsWith('http://')) return url.replace(/^http:\/\//, 'ws://');
  return url;
}

function attach(ws, onOpen, onData, onEnd, onErr) {
  if (ws.addEventListener) {
    // WebSocket global (browser-like API Node v22)
    ws.addEventListener('open', onOpen);
    ws.addEventListener('message', (e) => onData(Buffer.from(e.data)));
    ws.addEventListener('close', () => onEnd());
    ws.addEventListener('error', () => onErr());
  } else {
    // ws npm package API
    ws.on('open', onOpen);
    ws.on('message', (d) => onData(Buffer.from(d)));
    ws.on('close', () => onEnd());
    ws.on('error', () => onErr());
  }
}

function dial(url) {
  const w = new WS(url);
  try { if (w.binaryType !== undefined) w.binaryType = 'arraybuffer'; } catch {}
  return w;
}

// Mode ProxyCommand: stdin -> ws -> stdout
function stdioMode(url) {
  const ws = dial(url);
  const pending = [];
  let opened = false;
  process.stdin.on('data', (d) => {
    if (!opened) { pending.push(d); return; } // buffer stdin sampai ws open (hindari "Bad packet length")
    try { if (isOpen(ws)) ws.send(d); } catch {}
  });
  process.stdin.on('end', () => { try { ws.close(); } catch {} });
  process.stdin.on('error', () => { try { ws.close(); } catch {} });
  attach(ws,
    () => {
      opened = true;
      while (pending.length) { try { ws.send(pending.shift()); } catch {} }
    },
    (d) => process.stdout.write(d),
    () => process.exit(0),
    () => process.exit(1)
  );
}

// Mode listener: TCP 127.0.0.1:<port> -> ws
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
      () => { try { sock.destroy(); } catch {} }
    );
  });
  tcp.listen(port, '127.0.0.1', () => {
    console.log(`ssh-ws-bridge: dengar 127.0.0.1:${port} -> ${url}`);
    console.log(`PuTTY/ssh: connect ke 127.0.0.1 port ${port} (user: root)`);
  });
}

const a = process.argv.slice(2);
if (a[0] === '--stdio') {
  stdioMode(a[1] ? normalizeUrl(a[1]) : DEFAULT_URL);
} else {
  listenMode(a[0] ? normalizeUrl(a[0]) : DEFAULT_URL, Number(a[1] || 2222));
}
