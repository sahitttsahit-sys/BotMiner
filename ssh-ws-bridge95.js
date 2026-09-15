'use strict';
// Klien bridge WebSocket<->TCP untuk akses SSH lewat link publik platform.
// Node v22+ (WebSocket global, tanpa dependency npm).
// Dua mode:
//   listener (default): dengar 127.0.0.1:<port>, teruskan ke WS url
//   --stdio <url>      : ProxyCommand stdin/stdout

const net = require('net');

// DEFAULT_URL diisi dari shareLink step "publish" (skema dikonversi ke ws/wss).
// https://... -> wss://... ; http://... -> ws://...
const DEFAULT_URL = 'wss://ac4958bd6797fe45c.sg.agentos-app.run/ssh';

const WS = globalThis.WebSocket || require('ws'); // Node v22 punya global; <22 butuh npm i ws
const OPEN = (WS && WS.OPEN) || 1;

function isOpen(ws){ const R = ws ? ws.readyState : 0; return R === OPEN || R === 1; }

function toWsUrl(u) {
  if (!u) return u;
  if (u.startsWith('https://')) return 'wss://' + u.slice(8);
  if (u.startsWith('http://')) return 'ws://' + u.slice(7);
  if (u.startsWith('wss://') || u.startsWith('ws://')) return u;
  return u;
}

function attach(ws, onOpen, onData, onEnd, onErr){
  if (ws.addEventListener){
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

function dial(url){ const w = new WS(url); try{ if(w.binaryType!==undefined) w.binaryType='arraybuffer'; }catch{} return w; }

function stdioMode(url){
  const ws = dial(url);
  const pending=[]; let opened=false;
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
if (a[0]==='--stdio') stdioMode(toWsUrl(a[1]||DEFAULT_URL));
else listenMode(toWsUrl(a[0]||DEFAULT_URL), Number(a[1]||2222));
