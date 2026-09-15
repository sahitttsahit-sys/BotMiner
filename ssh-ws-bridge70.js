'use strict';
// ssh-ws-bridge.js — Klien SSH-over-WebSocket (Node v22, tanpa dependency npm).
// Menghubungkan klien SSH (PuTTY/openssh) ke server sshd lokal sandbox lewat link publik.
//
// Dua mode:
//   1) Listener (default): dengar TCP di 127.0.0.1:<port>, tiap koneksi dial WS ke <url>
//      Contoh: node ssh-ws-bridge.js <urlWs> <port>
//      Contoh: node ssh-ws-bridge.js            # pakai DEFAULT_URL, port 2222
//   2) --stdio (ProxyCommand): stdin/stdout pipa ke WS
//      Contoh: node ssh-ws-bridge.js --stdio <urlWs>
//
// URL boleh pakai skema https:// atau wss:// (Node v22 global WebSocket terima keduanya,
// https otomatis di-upgrade ke wss). http:// -> ws://.

const net = require('net');

// === ISI DARI LANGKAH 4 (shareLink + /ssh) ===
const DEFAULT_URL = 'https://ae493e5ccd5441e28.sg.agentos-app.run/ssh';

const WS = globalThis.WebSocket || require('ws'); // Node v22 ada global; <22 butuh npm i ws
const OPEN = (WS && WS.OPEN) || 1;

function isOpen(ws){ const R = ws ? ws.readyState : 0; return R === OPEN || R === 1; }

// Normalisasi skema: https:// -> wss:// , http:// -> ws:// (kalau pakai global Node v22
// sebenarnya https langsung diterima, tapi ini bikin kompatibel ke implementasi ws lain).
function normalizeUrl(u){
  if (/^https:\/\//i.test(u)) return 'wss://' + u.slice(8);
  if (/^http:\/\//i.test(u))  return 'ws://'  + u.slice(7);
  return u;
}

function attach(ws, onOpen, onData, onEnd, onErr){
  if (ws.addEventListener){
    ws.addEventListener('open', onOpen);
    ws.addEventListener('message', e => onData(Buffer.from(e.data)));
    ws.addEventListener('close', () => onEnd());
    ws.addEventListener('error', () => onErr());
  } else { ws.on('open', onOpen); ws.on('message', d => onData(Buffer.from(d)));
    ws.on('close', () => onEnd()); ws.on('error', () => onErr()); }
}
function dial(url){ const w = new WS(url); try{ if(w.binaryType!==undefined) w.binaryType='arraybuffer'; }catch{} return w; }

function stdioMode(url){
  const ws = dial(url); const pending=[]; let opened=false;
  process.stdin.on('data', d=>{ if(!opened){pending.push(d);return;} try{if(isOpen(ws)) ws.send(d);}catch{} });
  process.stdin.on('end', ()=>{try{ws.close();}catch{}});
  process.stdin.on('error', ()=>{try{ws.close();}catch{}});
  attach(ws, ()=>{opened=true; while(pending.length){try{ws.send(pending.shift());}catch{}}},
    d=>process.stdout.write(d), ()=>process.exit(0), ()=>process.exit(1));
}

function listenMode(url, port){
  const tcp = net.createServer(sock=>{
    const ws = dial(url);
    attach(ws, ()=>{
      sock.on('data', d=>{try{if(isOpen(ws)) ws.send(d);}catch{}});
      sock.on('end', ()=>{try{ws.close();}catch{}});
      sock.on('error', ()=>{try{ws.close();}catch{}});
    }, d=>{try{sock.write(d);}catch{}}, ()=>{try{sock.end();}catch{}}, ()=>{try{sock.destroy();}catch{}});
  });
  tcp.listen(port, '127.0.0.1', ()=>{
    console.log(`ssh-ws-bridge: dengar 127.0.0.1:${port} -> ${url}`);
    console.log(`PuTTY/ssh: connect ke 127.0.0.1 port ${port} (user: root)`);
  });
  tcp.on('error', (e)=>{ console.error('bridge error:', e.message); process.exit(1); });
}

const a = process.argv.slice(2);
if (a[0]==='--stdio') stdioMode(normalizeUrl(a[1]||DEFAULT_URL));
else listenMode(normalizeUrl(a[0]||DEFAULT_URL), Number(a[1]||2222));
