'use strict';
// SSH-over-WebSocket bridge (CLIENT) — Node v22, tanpa dependency npm.
// Menghubungkan TCP lokal (PuTTY/ssh biasa) ke WebSocket publik (link *.sg.agentos-app.run).
//
// Mode:
//   1) listener (default): dengar 127.0.0.1:<port>, tiap koneksi dial WS.
//       node ssh-ws-bridge.js [wsUrl] [port]
//   2) --stdio (ProxyCommand): stdin/stdout <-> WS.
//       node ssh-ws-bridge.js --stdio [wsUrl]
//
// DEFAULT_URL di bawah sudah diisi shareLink permanen + path /ssh.

const net = require('net');
const DEFAULT_URL = 'wss://a7c0028048df7127e.sg.agentos-app.run/ssh';
const WS = globalThis.WebSocket || require('ws'); // Node v22 ada global; <22 butuh npm i ws
const OPEN = (WS && WS.OPEN) || 1;

function isOpen(ws) {
  const R = ws ? ws.readyState : 0;
  return R === OPEN || R === 1;
}

function attach(ws, onOpen, onData, onEnd, onErr) {
  if (ws.addEventListener) {
    ws.addEventListener('open', onOpen);
    ws.addEventListener('message', (e) => onData(Buffer.from(e.data)));
    ws.addEventListener('close', () => onEnd());
    ws.addEventListener('error', () => onErr());
  } else {
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

function stdioMode(url) {
  const ws = dial(url);
  const pending = [];
  let opened = false;

  process.stdin.on('data', (d) => {
    if (!opened) { pending.push(d); return; }
    try { if (isOpen(ws)) ws.send(d); } catch {}
  });
  process.stdin.on('end', () => { try { ws.close(); } catch {} });
  process.stdin.on('error', () => { try { ws.close(); } catch {} });

  attach(
    ws,
    () => { // onOpen: flush buffered stdin
      opened = true;
      while (pending.length) {
        try { ws.send(pending.shift()); } catch {}
      }
    },
    (d) => { try { process.stdout.write(d); } catch {} }, // onData
    () => process.exit(0), // onEnd
    () => process.exit(1), // onErr
  );
}

function listenMode(url, port) {
  const tcp = net.createServer((sock) => {
    const ws = dial(url);
    attach(
      ws,
      () => { // onOpen
        sock.on('data', (d) => { try { if (isOpen(ws)) ws.send(d); } catch {} });
        sock.on('end', () => { try { ws.close(); } catch {} });
        sock.on('error', () => { try { ws.close(); } catch {} });
      },
      (d) => { try { sock.write(d); } catch {} }, // onData
      () => { try { sock.end(); } catch {} },     // onEnd
      () => { try { sock.destroy(); } catch {} },  // onErr
    );
  });
  tcp.listen(port, '127.0.0.1', () => {
    console.log(`ssh-ws-bridge: dengar 127.0.0.1:${port} -> ${url}`);
    console.log(`PuTTY/ssh: connect ke 127.0.0.1 port ${port} (user: root)`);
  });
}

const a = process.argv.slice(2);
if (a[0] === '--stdio') stdioMode(a[1] || DEFAULT_URL);
else listenMode(a[0] || DEFAULT_URL, Number(a[1] || 2222));
