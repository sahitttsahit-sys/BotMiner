'use strict';
// Klien SSH-over-WebSocket (Node v22, tanpa dependency npm).
// Menghubungkan WebSocket publik (Caddy L7 HTTPS) ke TCP lokal agar PuTTY/ssh
// biasa bisa login ke sandbox lewat 127.0.0.1:<port>.
//
// DEFAULT_URL diisi dari shareLink langkah publish + path /ssh.
const net = require('net');

const DEFAULT_URL = 'wss://a3ee6df549e940f53.sg.agentos-app.run/ssh';
const WS = globalThis.WebSocket || require('ws'); // Node v22 punya global; <22 butuh npm i ws
const OPEN = (WS && WS.OPEN) || 1;

// Normalisasi http(s):// -> ws(s):// agar shareLink HTTPS bisa langsung dipakai.
function normalizeUrl(u) {
  if (typeof u !== 'string' || !u) return u;
  if (u.startsWith('https://')) return 'wss://' + u.slice('https://'.length);
  if (u.startsWith('http://')) return 'ws://' + u.slice('http://'.length);
  return u;
}

function isOpen(ws){ const R = ws ? ws.readyState : 0; return R === OPEN || R === 1; }

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
}

const a = process.argv.slice(2);
const argsMode = a[0]==='--stdio';
const urlIn = argsMode ? (a[1]||DEFAULT_URL) : (a[0]||DEFAULT_URL);
const url = normalizeUrl(urlIn);
const port = Number(a[argsMode?2:1] || 2222);
if (argsMode) stdioMode(url); else listenMode(url, port);
