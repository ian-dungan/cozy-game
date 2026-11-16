// Gloamwood server: serves the game files and runs the shared world over WebSockets.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import * as sim from './sim.js';
import { RACES, CLASSES } from '../js/data.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = +process.env.PORT || 8080, MAX = +process.env.MAX_PLAYERS || 50;
const DATA = process.env.DATA_DIR || path.join(ROOT, 'data'), FILE = path.join(DATA, 'characters.json');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png' };

// Characters: lowercase name -> { salt, hash, data }
let accounts = {};
try { accounts = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { /* first run */ }
function persist() {
  for (const p of sim.online.values()) accounts[p.name.toLowerCase()].data = sim.dataOf(p);
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(FILE + '.tmp', JSON.stringify(accounts)); fs.renameSync(FILE + '.tmp', FILE);
}
const hash = (pass, salt) => crypto.scryptSync(pass, salt, 32).toString('hex');
sim.init(Object.values(accounts).map(a => a.data));

const server = http.createServer((req, res) => {
  let u = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (u === '/') u = '/index.html';
  const file = path.join(ROOT, path.normalize(u));
  if (!/^\/(index\.html|js\/|css\/|vendor\/)/.test(u) || !file.startsWith(ROOT + path.sep)) { res.writeHead(404); return res.end('Not found'); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(buf);
  });
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });
wss.on('connection', ws => {
  let p = null, tries = 0;
  const send = s => { if (ws.readyState === 1) ws.send(s); };
  const fail = m => send(JSON.stringify({ t: 'err', m }));
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m !== 'object') return;
    try {
      if (p) return sim.handle(p, m);
      if (m.t !== 'login' && m.t !== 'create') return;
      if (++tries > 8) return ws.close();
      const name = String(m.name || '').trim(), pass = String(m.pass || ''), key = name.toLowerCase();
      if (!/^[A-Za-z]{3,14}$/.test(name)) return fail('Names are 3 to 14 letters, with no spaces or numbers.');
      if (pass.length < 4 || pass.length > 64) return fail('Passwords need at least 4 characters.');
      let acc = accounts[key];
      if (m.t === 'create') {
        if (acc) return fail('That name is already taken. Use Log In if it is yours.');
        if (!RACES[m.race] || !CLASSES[m.cls]) return fail('Choose a race and a class.');
        const salt = crypto.randomBytes(16).toString('hex'), nice = name[0].toUpperCase() + name.slice(1).toLowerCase();
        acc = accounts[key] = { salt, hash: hash(pass, salt), data: sim.newChar(nice, m.race, m.cls) };
      } else {
        if (!acc) return fail('No character has that name. Choose a race and class, then Create Character.');
        if (!crypto.timingSafeEqual(Buffer.from(hash(pass, acc.salt)), Buffer.from(acc.hash))) return fail('Wrong password.');
      }
      const old = sim.online.get(key);
      if (old) { acc.data = sim.dataOf(old); const kick = old.send; sim.leave(old); kick(JSON.stringify({ t: 'err', m: 'This character logged in from somewhere else.', bye: 1 })); if (old.ws) old.ws.close(); }
      else if (sim.online.size >= MAX) return fail('The world is full. Try again shortly.');
      p = sim.join(acc.data, send); p.ws = ws; delete acc.data.fresh;
      console.log(`+ ${p.name} (${sim.online.size} online)`);
    } catch (e) { console.error('message error', e); }
  });
  ws.on('close', () => {
    if (!p || sim.online.get(p.name.toLowerCase()) !== p) return;
    accounts[p.name.toLowerCase()].data = sim.dataOf(p); sim.leave(p); console.log(`- ${p.name} (${sim.online.size} online)`);
    try { persist(); } catch (e) { console.error('save failed', e); }
  });
  ws.on('error', () => {});
});

let last = Date.now();
setInterval(() => {
  const now = Date.now(), dt = Math.min(.25, (now - last) / 1000); last = now;
  try { sim.tick(dt); } catch (e) { console.error('tick error', e); }
}, 100);
setInterval(() => { try { persist(); } catch (e) { console.error('save failed', e); } for (const c of wss.clients) c.ping(); }, 30000);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { try { persist(); } catch (e) { console.error(e); } process.exit(0); });

server.listen(PORT, () => console.log(`Gloamwood is running. Open http://localhost:${PORT} (room for ${MAX} players)`));
