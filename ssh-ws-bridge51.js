'use strict';
// ssh-ws-bridge.js — KLIEN (Node v22+, tanpa dependency npm)
// Menghubungkan TCP lokal (PuTTY/ssh) <-> WebSocket publik (link publish).
//
// Mode:
//   1) listener (default): dengar 127.0.0.1:PORT, tiap koneksi dijembatani ke WS
//        node ssh-ws-bridge.js [url] [port]          # default url=DEFAULT_URL, port=2222
//   2) --stdio: ProxyCommand (stdin/stdout <-> WS)
//        node ssh-ws-bridge.js --stdio [url]
//
// URL boleh https://... atau wss://... (dalamormalisasi otomatis ke ws/wss).

const net = require('net');

// === ISI DENGAN SHARELINK PUBLISH + /ssh ===
const DEFAULT_URL = 'wss://a99490805da312f2e.sg.agentos-app.run/ssh';

const WS = globalThis.WebSocket || require('ws'); // Node v22 punya global; <v22 butuh npm i ws
const OPEN = (WS && WS.OPEN) || 1;

function normalizeUrl(u) {
  if (!u) return DEFAULT_URL;
  if (u.startsWith('https://')) return 'wss://' + u.slice(8);
  if (u.startsWith('http://')) return 'ws://' + u.slice(7);
  return u;
}
function isOpen(ws) {
  const R = ws ? ws.readyState : 0;
  return R === OPEN || R === 1;
}
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

function stdioMode(url) {
  const ws = dial(url);
  const pending = [];
  let opened = false;
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
    () => process.exit(1),
  );
}

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
      () => { try { sock.destroy(); } catch {} },
    );
  });
  tcp.listen(port, '127.0.0.1', () => {
    console.log(`ssh-ws-bridge: dengar 127.0.0.1:${port} -> ${url}`);
    console.log(`PuTTY/ssh: connect ke 127.0.0.1 port ${port} (user: root)`);
  });
}

const a = process.argv.slice(2);
if (a[0] === '--stdio') stdioMode(normalizeUrl(a[1]));
else listenMode(normalizeUrl(a[0]), Number(a[1] || 2222));
