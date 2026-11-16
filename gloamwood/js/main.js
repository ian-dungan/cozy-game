// Browser client: rendering, input and UI. The server (server/sim.js) owns the world.
import * as THREE from '../vendor/three.module.min.js';
import { RACES, CLASSES, SPELLS, ITEMS, SKILLS, TIERS } from './data.js';
import { ZONES } from './zones.js';
import { makeGrid } from './grid.js';
import { buildWorld, makeModel, animModel, makeLabel } from './world.js';

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const cap = s => s[0].toUpperCase() + s.slice(1);
const MAXLVL = 20, SLOTS = ['primary', 'secondary', 'head', 'chest', 'legs', 'hands', 'feet', 'neck', 'ring'];

let ws = null, P = null, Z = null, G = null, T = 0, ST = 0, gtime = 540, zseq = 0, loading = false, dirty = true;
let pickSpell = null, hudT = 0, posT = 0, lastPos = '';
const ents = new Map(), grids = {}, keys = {}, lastWarn = {};
const send = o => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); };
const tgt = () => P.target ? ents.get(P.target) : null;

// ---------- renderer ----------
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
const scene = new THREE.Scene(); scene.fog = new THREE.Fog(0, 10, 100); scene.background = new THREE.Color(0);
const camera = new THREE.PerspectiveCamera(65, 1, .1, 400); camera.rotation.order = 'YXZ';
const amb = new THREE.AmbientLight(0xffffff, 1), sun = new THREE.DirectionalLight(0xfff0d8, 1), torch = new THREE.PointLight(0xffc880, 0, 34, 1);
sun.position.set(.5, 1, .3);
const cDay = new THREE.Color(), cNight = new THREE.Color(0x070a14), cAmbN = new THREE.Color(0x7080c0), cWhite = new THREE.Color(0xffffff);
function resize() {
  const w = innerWidth, h = innerHeight, k = Math.max(1, Math.round(h / 400));
  renderer.setSize(Math.ceil(w / k), Math.ceil(h / k), false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

// ---------- messages, sound ----------
const CLS = { 'c-cast': 'c-spell', 'c-fizzle': 'c-spell', 'c-heal': 'c-spell', 'c-coin': 'c-loot', 'c-ding': 'c-sys', 'c-dead': 'c-hit' };
function msg(t, cls = 'c-sys') {
  const d = document.createElement('div'); d.className = CLS[cls] || cls; d.textContent = t;
  const l = $('log'); l.appendChild(d); while (l.children.length > 200) l.firstChild.remove(); l.scrollTop = l.scrollHeight;
}
function warn(t) { if (T - (lastWarn[t] ?? -9) > 2.5) { lastWarn[t] = T; msg(t, 'c-miss'); } }
const fmtCoin = c => [[1000, 'p'], [100, 'g'], [10, 's'], [1, 'c']].map(([v, n]) => { const k = Math.floor(c / v); c -= k * v; return k ? k + n : ''; }).filter(Boolean).join(' ') || '0c';
let actx;
function snd(f, d = .08, type = 'square', v = .04, slide = 0, delay = 0) {
  try {
    actx = actx || new AudioContext(); const t0 = actx.currentTime + delay, o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t0); if (slide) o.frequency.linearRampToValueAtTime(f + slide, t0 + d);
    g.gain.setValueAtTime(v, t0); g.gain.linearRampToValueAtTime(0, t0 + d); o.connect(g).connect(actx.destination); o.start(t0); o.stop(t0 + d);
  } catch (e) { /* audio unavailable */ }
}
const SND = {
  'c-hit': () => snd(110, .07, 'sawtooth', .05), 'c-dmg': () => snd(180 + Math.random() * 40, .05, 'square', .03), 'c-cast': () => snd(330, .3, 'sine', .03, 220),
  'c-fizzle': () => snd(150, .2, 'sawtooth', .03, -80), 'c-heal': () => snd(660, .3, 'sine', .04, 330), 'c-coin': () => snd(900, .05, 'square', .02),
  'c-ding': () => [523, 659, 784, 1047].forEach((f, i) => snd(f, .18, 'triangle', .06, 0, i * .11)), 'c-dead': () => snd(200, .8, 'sawtooth', .06, -150), 'c-tell': () => snd(880, .1, 'sine', .04),
};

// ---------- shared rules needed for display ----------
const need = n => Math.round(150 * n * n * (1 + n / 10));
function conOf(l) {
  const d = l - P.lvl, gr = P.lvl < 8 ? -4 : P.lvl < 16 ? -6 : -8;
  return d >= 3 ? ['red', 'fighting it would be suicide'] : d >= 1 ? ['yellow', 'it looks like more than a match for you'] : d === 0 ? ['white', 'it looks like an even fight']
    : d > gr + 1 ? ['blue', 'you would probably win this fight'] : d > gr ? ['lblue', 'it looks fairly easy'] : ['green', 'it would be no challenge at all'];
}
function weapon() {
  const it = ITEMS[P.eq.primary]; if (it && it.dmg) return it;
  return P.cls === 'brawler' ? { dmg: 3 + Math.floor(P.lvl / 2), delay: 20 } : { dmg: 2, delay: 30 };
}
function itemTip(it) {
  const p = [it.name];
  if (it.dmg) p.push(`Damage ${it.dmg}   Delay ${it.delay}   (${SKILLS[it.wt]})`);
  if (it.ac) p.push(`AC ${it.ac}`);
  for (const k of ['hp', 'mana', 'str', 'sta', 'agi', 'int', 'wis']) if (it[k]) p.push(`${k.toUpperCase()} +${it[k]}`);
  if (it.arm !== undefined) p.push(`${TIERS[it.arm]} armor`);
  if (it.spell) { const s = SPELLS[it.spell]; p.push(`${CLASSES[s.cls].name}, level ${s.lvl}`, s.d); }
  if (it.val) p.push(`Value ${fmtCoin(it.val)}`);
  return p.join('\n');
}
const cantUse = it => { const C = CLASSES[P.cls]; return (it.dmg && !C.weps.includes(it.wt)) || (it.arm !== undefined && it.arm > C.armor); };

// ---------- network ----------
function connect(first) {
  $('cerr').textContent = 'Connecting...';
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  ws.onopen = () => { $('cerr').textContent = ''; send(first); };
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (NET[m.t]) NET[m.t](m); };
  ws.onclose = () => {
    const e = $('cerr');
    if (P) { P = null; $('ui').classList.add('hidden'); $('create').classList.remove('hidden'); e.textContent = e.textContent || 'Disconnected from the server.'; }
    else if (!e.textContent || e.textContent === 'Connecting...') e.textContent = 'Could not reach the server.';
    ws = null;
  };
}
const NET = {
  err(m) { $('cerr').textContent = m.m; },
  zone(m) {
    const first = !P;
    if (first) { P = { pitch: 0, vy: 0, yoff: 0, autorun: false }; $('create').classList.add('hidden'); $('ui').classList.remove('hidden'); $('cerr').textContent = ''; try { localStorage.setItem('gloamwood_name', m.me.name); } catch (e) { /* storage unavailable */ } }
    loading = true; $('loadtext').textContent = `Entering ${ZONES[m.zone].name}...`; $('loading').classList.remove('hidden');
    scene.traverse(o => { if (o.geometry) o.geometry.dispose(); }); scene.clear(); ents.clear();
    Z = ZONES[m.zone]; G = grids[m.zone] || (grids[m.zone] = makeGrid(Z)); buildWorld(Z, scene, G); scene.add(amb, sun, torch);
    applyMe(m.me); P.x = m.x; P.z = m.z; P.yaw = m.yaw; P.pitch = 0; P.autorun = false; zseq = m.q; ST = m.T; gtime = m.tm;
    m.ents.forEach(addEnt);
    setTimeout(() => { loading = false; $('loading').classList.add('hidden'); if (first && P && P.lvl === 1 && !P.xp) openWin('help'); }, first ? 100 : 600);
  },
  s(m) {
    if (!P) return;
    ST = m.T; gtime = m.tm; m.a.forEach(addEnt);
    for (const [id, x, z, y, h, sw, f] of m.e) {
      const e = ents.get(id); if (!e) continue;
      e.tx = x; e.tz = z; e.tyaw = y; e.hp = h; e.fl = f;
      if (sw !== e.swingN) { if (e.swingN !== undefined) e.swing = 1; e.swingN = sw; }
    }
    m.r.forEach(id => { const e = ents.get(id); if (e) { scene.remove(e.model); ents.delete(id); } });
  },
  me(m) { if (P) applyMe(m.me); },
  m(m) { for (const [t, c] of m.l) { msg(t, c); if (SND[c] && !(c === 'c-dmg' && /has taken/.test(t))) SND[c](); } },
};
function applyMe(me) {
  const hadLoot = P.loot, hadShop = P.shop;
  Object.assign(P, me);
  if (P.loot && !hadLoot) openWin('loot'); else if (!P.loot) $('loot').classList.add('hidden');
  if (P.shop && !hadShop) { openWin('shop'); openWin('inv'); } else if (!P.shop) $('shop').classList.add('hidden');
  dirty = true;
}
function addEnt(d) {
  const old = ents.get(d.id); if (old) scene.remove(old.model);
  if (d.id === P.id) return;
  const e = { id: d.id, kind: d.k, name: d.n, lvl: d.l, x: d.x, z: d.z, yaw: d.y, tx: d.x, tz: d.z, tyaw: d.y, hp: d.h, fl: d.f, aggro: d.ag, npc: d.npc != null ? Z.npcs[d.npc] : null, swing: 0, swingN: old ? old.swingN : undefined };
  e.model = makeModel(d.m); e.model.userData.ent = e;
  const u = e.model.userData; e.label = makeLabel(d.n, d.c, .36 / u.s); e.label.position.y = (u.hgt + .4) / u.s; e.model.add(e.label);
  scene.add(e.model); ents.set(e.id, e); place(e, 1);
}
function place(e, dt) {
  const k = Math.min(1, dt * 12), u = e.model.userData, dx = e.tx - e.x, dz = e.tz - e.z;
  e.moving = Math.hypot(dx, dz) > .08; e.x += dx * k; e.z += dz * k;
  if (e.npc && !e.npc.guard && dist(e, P) < 10) e.tyaw = Math.atan2(P.x - e.x, P.z - e.z);
  const dy = e.tyaw - e.yaw; e.yaw += Math.atan2(Math.sin(dy), Math.cos(dy)) * k;
  const lie = !!(e.fl & 2), sw = e.swing > 0 && !u.arms.length ? e.swing * .5 : 0;
  if (lie !== !!e.lie) { e.lie = lie; e.model.rotation.z = lie ? Math.PI / 2 : 0; e.label.position.set(lie ? 1.3 / u.s : 0, lie ? 0 : (u.hgt + .4) / u.s, 0); }
  e.model.position.set(e.x + Math.sin(e.yaw) * sw, G.heightAt(e.x, e.z) + (u.fly ? Math.sin(T * 3 + e.id) * .15 : 0) + (lie ? .3 : e.fl & 1 ? -.45 : 0), e.z + Math.cos(e.yaw) * sw);
  e.model.rotation.y = e.yaw; e.label.visible = dist(e, P) > 2.4;
  if (e.swing > 0) e.swing = Math.max(0, e.swing - dt * 3);
  if (!lie) animModel(e.model, T + e.id, e.moving && !(e.fl & 1), e.swing);
}

// ---------- UI ----------
const el = (tag, cls, text) => { const d = document.createElement(tag); if (cls) d.className = cls; if (text !== undefined) d.textContent = text; return d; };
function openWin(id) { $(id).classList.remove('hidden'); dirty = true; }
function closeWin(id) {
  $(id).classList.add('hidden');
  if (id === 'shop' && P && P.shop) { P.shop = null; send({ t: 'closeshop' }); }
  if (id === 'loot' && P && P.loot) { P.loot = null; send({ t: 'closeloot' }); }
}
function toggleWin(id) { $(id).classList.contains('hidden') ? openWin(id) : closeWin(id); }
const isOpen = id => !$(id).classList.contains('hidden');
let gemEls = [];
function refresh() {
  dirty = false;
  $('pname').textContent = `${P.name}  -  ${CLASSES[P.cls].name} ${P.lvl}`;
  const g = $('gems'); g.textContent = ''; gemEls = [];
  P.gems.forEach((id, i) => {
    const sp = SPELLS[id], d = el('div', 'gem' + (sp ? (sp.abil ? ' abil' : '') : ' empty') + (pickSpell ? ' pick' : ''), sp ? sp.name : '-');
    d.append(el('i', '', i + 1)); const u = el('u'); d.append(u); gemEls.push([u, id]);
    if (sp) d.title = `${sp.name}\n${sp.d}${sp.mana ? `\nMana ${sp.mana}   Cast ${sp.cast}s` : ''}${sp.recast ? `\nRecast ${sp.recast}s` : ''}`;
    d.onclick = () => castGem(i); d.oncontextmenu = ev => { ev.preventDefault(); send({ t: 'clr', i }); };
    g.append(d);
  });
  $('b-attack').classList.toggle('on', P.autoAtk); $('b-sit').textContent = P.sitting ? 'Stand (X)' : 'Sit (X)';
  const t = tgt(); $('twin').classList.toggle('hidden', !t);
  if (t) { $('tname').textContent = cap(t.name); $('tname').className = t.kind === 'mob' ? 'con-' + conOf(t.lvl)[0] : ''; }
  const gr = $('group'); gr.textContent = '';
  (P.group || []).forEach(m => { const d = el('div', '', `${m.n} (${m.l} ${CLASSES[m.c].name})`), b = el('div', 'bar thin'), f = el('div', 'fill hp'); f.style.width = m.h + '%'; b.append(f); d.title = m.z; d.append(b); gr.append(d); });
  if (isOpen('inv')) {
    const eq = $('eqslots'); eq.textContent = '';
    SLOTS.forEach(sl => { const it = ITEMS[P.eq[sl]], d = el('div'); d.append(el('b', '', cap(sl)), it ? it.name : '-'); if (it) { d.title = itemTip(it); d.onclick = () => send({ t: 'uneq', s: sl }); } eq.append(d); });
    const bag = $('bag'); bag.textContent = '';
    P.inv.forEach((s, i) => { const d = el('div', 'slot', s ? ITEMS[s.id].name : ''); if (s) { d.title = itemTip(ITEMS[s.id]); if (s.n > 1) d.append(el('em', '', s.n)); d.onclick = () => send({ t: 'bag', i }); } bag.append(d); });
    $('coin').textContent = 'Coin: ' + fmtCoin(P.coin);
    const s = P.st, w = weapon();
    $('stats').textContent = `${RACES[P.race].name} ${CLASSES[P.cls].name}\nLevel ${P.lvl}\nXP  ${Math.floor(P.xp / need(P.lvl) * 100)}%\n\nHP   ${P.hp}/${P.maxhp}\nMana ${P.mana}/${P.maxmana}\nAC   ${P.ac}\nATK  ${w.dmg}/${w.delay}\n\nSTR ${s.str}  STA ${s.sta}\nAGI ${s.agi}  INT ${s.int}\nWIS ${s.wis}\n\n` +
      Object.keys(P.skills).map(k => `${SKILLS[k].padEnd(13)}${P.skills[k]}`).join('\n');
  }
  if (isOpen('book')) {
    const b = $('booklist'); b.textContent = '';
    P.book.map(id => SPELLS[id]).sort((a, c) => a.lvl - c.lvl).forEach(sp => {
      const d = el('div', 'row' + (pickSpell === sp.id ? ' sel' : '')); d.append(el('span', '', sp.name), el('small', '', `Lv ${sp.lvl}${sp.mana ? '  ' + sp.mana + ' mana' : ''}`));
      d.title = sp.d; d.onclick = () => { pickSpell = pickSpell === sp.id ? null : sp.id; dirty = true; }; b.append(d);
    });
    Object.values(SPELLS).filter(s => s.cls === P.cls && !P.book.includes(s.id)).sort((a, c) => a.lvl - c.lvl).forEach(sp => {
      const d = el('div', 'row dim'); d.append(el('span', '', sp.name), el('small', '', `Lv ${sp.lvl}  ${sp.abil ? 'learned by experience' : 'scroll'}`)); d.title = sp.d; b.append(d);
    });
  }
  if (P.loot) {
    $('lootname').textContent = cap(P.loot.n); const l = $('lootlist'); l.textContent = '';
    P.loot.items.forEach(id => { const d = el('div', 'row', ITEMS[id].name); d.title = itemTip(ITEMS[id]); d.onclick = () => send({ t: 'loot', item: id }); l.append(d); });
  }
  const shop = P.shop && ents.get(P.shop);
  if (shop && shop.npc) {
    const l = $('shoplist'), n = shop.npc; l.textContent = ''; $('shopname').textContent = shop.name;
    let stock = n.sells; if (n.classes) stock = stock.filter(id => SPELLS[ITEMS[id].spell].cls === P.cls);
    if (!stock.length) l.append(el('div', 'hint', n.classes ? 'This guild has nothing to teach you.' : 'Nothing for sale, but your goods are welcome.'));
    stock.forEach(id => {
      const it = ITEMS[id], sp = SPELLS[it.spell], known = sp && P.book.includes(sp.id), d = el('div', 'row' + (known || cantUse(it) || (sp && sp.lvl > P.lvl) ? ' dim' : ''));
      d.append(el('span', '', it.name + (sp ? `  (Lv ${sp.lvl})` : '')), el('small', '', known ? 'known' : fmtCoin(it.val))); d.title = itemTip(it); if (!known) d.onclick = () => send({ t: 'buy', item: id }); l.append(d);
    });
  }
  renderBuffs();
}
function renderBuffs() {
  const b = $('buffs'); b.textContent = '';
  if (P.sitting) b.append(el('div', 'buff', 'Resting'));
  if (P.feign) b.append(el('div', 'buff', 'Playing dead'));
  P.buffs.forEach(f => { const t = Math.max(0, f.e - ST); b.append(el('div', 'buff', `${f.n} ${t > 90 ? Math.ceil(t / 60) + 'm' : Math.ceil(t) + 's'}`)); });
}
const setW = (id, f) => { $(id).style.width = clamp(f * 100, 0, 100) + '%'; };
function clock() { const h = Math.floor(gtime / 60), m = Math.floor(gtime % 60); return `${(h + 11) % 12 + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; }
function hud(dt) {
  setW('hpbar', P.hp / P.maxhp); $('hptxt').textContent = `${P.hp} / ${P.maxhp}`;
  $('mpbar').parentElement.classList.toggle('hidden', !P.maxmana);
  if (P.maxmana) { setW('mpbar', P.mana / P.maxmana); $('mptxt').textContent = `${P.mana} / ${P.maxmana}`; }
  setW('xpbar', P.lvl >= MAXLVL ? 1 : P.xp / need(P.lvl));
  const t = tgt(); if (t) setW('thp', t.kind === 'corpse' || t.kind === 'pcorpse' ? 0 : t.hp / 100);
  const c = P.casting; $('castbar').classList.toggle('hidden', !c); if (c) { setW('castfill', (ST - c.s) / (c.e - c.s)); $('castname').textContent = c.n; }
  for (const [u, id] of gemEls) { const cd = P.cd[id], left = cd ? cd[0] - ST : 0; u.style.width = left > 0 ? clamp(left / cd[1] * 100, 0, 100) + '%' : '0'; }
  $('petrow').classList.toggle('hidden', !P.pet); if (P.pet) { $('petname').textContent = cap(P.pet.n); setW('petbar', P.pet.h / 100); }
  if ((hudT -= dt) <= 0) {
    hudT = .5; renderBuffs();
    const a = ((-P.yaw * 180 / Math.PI) % 360 + 360) % 360;
    $('zoneinfo').textContent = `${Z.name}  |  ${clock()}  |  ${['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(a / 45) % 8]}`;
  }
}

// ---------- actions and input ----------
function setTarget(e) { P.target = e ? e.id : null; send({ t: 'tgt', id: P.target }); dirty = true; }
function tabTarget() {
  const l = [...ents.values()].filter(e => e.kind === 'mob' && dist(P, e) < 70 && G.los(P, e)).sort((a, b) => dist(P, a) - dist(P, b));
  if (l.length) setTarget(l[(l.indexOf(tgt()) + 1) % l.length]);
}
function consider() {
  const t = tgt(); if (!t) return warn('You must first select a target.');
  if (t.kind === 'mob') { const [c, text] = conOf(t.lvl); msg(`${cap(t.name)} ${t.aggro ? 'glares at you threateningly' : 'pays you little mind'} -- ${text}.`, 'con-' + c); }
  else if (t.kind === 'npc') msg(`${t.name} nods to you -- you would not survive picking this fight.`, 'con-red');
  else if (t.kind === 'player') msg(`${t.name} is a level ${t.lvl} adventurer, and a friend.`, 'con-lblue');
  else if (t.kind === 'pet') msg(`${cap(t.name)} obeys its master.`, 'con-lblue');
  else msg('It is quite dead.', 'c-miss');
}
function castGem(i) {
  if (pickSpell) { send({ t: 'mem', i, id: pickSpell }); pickSpell = null; dirty = true; return; }
  if (P.gems[i]) send({ t: 'cast', i });
}
function command(v) {
  const c = v.toLowerCase().split(/\s+/)[0];
  if (c === '/loc') msg(`Your location is ${(P.x / Z.cell).toFixed(1)}, ${(P.z / Z.cell).toFixed(1)}`);
  else if (c === '/time') msg(`It is ${clock()} in ${Z.name}.`);
  else if (c === '/help') openWin('help');
  else if (c === '/con' || c === '/consider') consider();
  else send({ t: 'cmd', v });
}
const acts = {
  attack() { send({ t: 'atk' }); }, sit() { send({ t: 'sit' }); }, inv() { toggleWin('inv'); }, book() { toggleWin('book'); pickSpell = null; }, con: consider,
  hail() {
    let t = tgt(); if (!t || t.kind !== 'npc') t = [...ents.values()].filter(e => e.kind === 'npc' && dist(P, e) < 10).sort((a, b) => dist(P, a) - dist(P, b))[0];
    if (t) send({ t: 'hail', id: t.id }); else warn('There is no one nearby to hail.');
  },
  help() { toggleWin('help'); },
};
const KEYMAP = { KeyF: 'attack', Backquote: 'attack', KeyX: 'sit', KeyI: 'inv', KeyB: 'book', KeyC: 'con', KeyH: 'hail' };
const WINS = ['loot', 'shop', 'inv', 'book', 'help'];
addEventListener('keydown', e => {
  if (!P) return;
  const inp = document.activeElement === $('cmd');
  if (e.code === 'Enter') { e.preventDefault(); if (inp) { const v = $('cmd').value.trim(); $('cmd').value = ''; $('cmd').blur(); if (v) command(v); } else $('cmd').focus(); return; }
  if (inp) { if (e.code === 'Escape') $('cmd').blur(); return; }
  if (e.code === 'Slash') { $('cmd').focus(); return; }
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
  if (e.repeat || loading) return;
  keys[e.code] = true;
  if (e.code === 'Tab') tabTarget();
  else if (e.code === 'Escape') { if (pickSpell) pickSpell = null; else if (WINS.some(isOpen)) WINS.forEach(closeWin); else setTarget(null); dirty = true; }
  else if (e.code === 'KeyR') P.autorun = !P.autorun;
  else if (/^Digit[1-8]$/.test(e.code)) castGem(+e.code[5] - 1);
  else if (KEYMAP[e.code] && !P.dead) acts[KEYMAP[e.code]]();
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
$('btns').onclick = e => { const a = e.target.dataset.act; if (a && P && !P.dead) acts[a](); e.target.blur(); };
document.querySelectorAll('[data-close]').forEach(x => x.onclick = () => closeWin(x.dataset.close));
const ray = new THREE.Raycaster(); ray.far = 140;
function pick(cx, cy) {
  ray.setFromCamera(new THREE.Vector2(cx / innerWidth * 2 - 1, -(cy / innerHeight) * 2 + 1), camera);
  for (const h of ray.intersectObjects([...ents.values()].map(e => e.model), true)) { let o = h.object; while (o && !o.userData.ent) o = o.parent; if (o) return o.userData.ent; }
  return null;
}
let drag = null;
canvas.addEventListener('mousedown', e => { drag = { moved: 0, b: e.button }; if (document.activeElement) document.activeElement.blur(); });
addEventListener('mousemove', e => {
  if (!drag || !P) return; drag.moved += Math.abs(e.movementX) + Math.abs(e.movementY);
  if (drag.moved > 4) { P.yaw -= e.movementX * .005; P.pitch = clamp(P.pitch - e.movementY * .005, -1.2, 1.2); }
});
addEventListener('mouseup', e => {
  if (!drag) return; const d = drag; drag = null; if (d.moved > 4 || !P || loading || P.dead) return;
  const ent = pick(e.clientX, e.clientY); if (!ent) return;
  if (d.b === 2) { P.target = ent.id; dirty = true; send({ t: 'use', id: ent.id }); } else setTarget(ent);
});
canvas.addEventListener('contextmenu', e => e.preventDefault());

// Touch: drag the left half to move, drag the right half to look, tap to target, press and hold to loot or talk.
const joy = { f: 0, s: 0 }, touches = {};
canvas.addEventListener('touchstart', e => {
  e.preventDefault(); if (document.activeElement) document.activeElement.blur();
  for (const t of e.changedTouches) touches[t.identifier] = { x0: t.clientX, y0: t.clientY, x: t.clientX, y: t.clientY, t: performance.now(), moved: 0, mv: t.clientX < innerWidth / 2 };
}, { passive: false });
canvas.addEventListener('touchmove', e => {
  e.preventDefault(); if (!P) return;
  for (const t of e.changedTouches) {
    const o = touches[t.identifier]; if (!o) continue;
    const dx = t.clientX - o.x, dy = t.clientY - o.y; o.x = t.clientX; o.y = t.clientY; o.moved += Math.abs(dx) + Math.abs(dy);
    if (o.mv) { joy.f = clamp((o.y0 - o.y) / 40, -1, 1); joy.s = clamp((o.x - o.x0) / 40, -1, 1); }
    else if (o.moved > 8) { P.yaw -= dx * .007; P.pitch = clamp(P.pitch - dy * .007, -1.2, 1.2); }
  }
}, { passive: false });
const touchEnd = e => {
  e.preventDefault();
  for (const t of e.changedTouches) {
    const o = touches[t.identifier]; if (!o) continue; delete touches[t.identifier];
    if (o.mv) joy.f = joy.s = 0;
    if (o.moved > 10 || !P || loading || P.dead) continue;
    const ent = pick(o.x, o.y); if (!ent) continue;
    if (performance.now() - o.t > 400) { P.target = ent.id; dirty = true; send({ t: 'use', id: ent.id }); } else setTarget(ent);
  }
};
canvas.addEventListener('touchend', touchEnd, { passive: false }); canvas.addEventListener('touchcancel', touchEnd, { passive: false });

// ---------- main loop ----------
function updPlayer(dt) {
  if (P.dead) return;
  const k = keys;
  P.yaw += ((k.KeyA || k.ArrowLeft ? 1 : 0) - (k.KeyD || k.ArrowRight ? 1 : 0)) * 2.3 * dt;
  let f = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0), s = (k.KeyE ? 1 : 0) - (k.KeyQ ? 1 : 0);
  if (Math.abs(joy.f) > .35) f = Math.sign(joy.f); if (Math.abs(joy.s) > .35) s = Math.sign(joy.s);
  if (f < 0) P.autorun = false; if (P.autorun && !f) f = 1;
  if (f || s) {
    P.sitting = false; P.feign = false;
    let sp = 7 * (1 + P.st.speed); if (f < 0) sp *= .55; if (G.cellAt(P.x, P.z) === '~') sp *= .6;
    const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw); let dx = fx * f - fz * s, dz = fz * f + fx * s; const l = Math.hypot(dx, dz); dx /= l; dz /= l;
    [P.x, P.z] = G.slide(P.x, P.z, P.x + dx * sp * dt, P.z + dz * sp * dt, .6);
  }
  if (k.Space && P.yoff === 0) P.vy = 6.5;
  P.yoff += P.vy * dt; P.vy -= 19 * dt; if (P.yoff <= 0) { P.yoff = 0; P.vy = 0; }
  if ((posT -= dt) <= 0) {
    posT = .1; const s2 = `${P.x.toFixed(2)},${P.z.toFixed(2)},${P.yaw.toFixed(2)}`;
    if (s2 !== lastPos) { lastPos = s2; send({ t: 'pos', q: zseq, x: +P.x.toFixed(2), z: +P.z.toFixed(2), y: +P.yaw.toFixed(2) }); }
  }
}
function light() {
  const h = gtime / 60, L = Z.outdoor ? clamp(Math.sin((h - 6) / 14 * Math.PI) * 1.8, 0, 1) : 0;
  const vis = RACES[P.race].vision, lo = Z.outdoor ? (vis ? .34 : .16) : (vis ? .4 : .24);
  amb.intensity = (lo + L * (.72 - lo)) * Math.PI; amb.color.copy(cAmbN).lerp(cWhite, Z.outdoor ? L : .5);
  sun.intensity = L * 1.5;
  torch.intensity = Z.outdoor ? (1 - L) * 5 : 8; torch.position.copy(camera.position);
  scene.background.copy(cNight).lerp(cDay.set(Z.sky), Z.outdoor ? L : 1); scene.fog.color.copy(scene.background);
  scene.fog.near = Z.fog[0]; scene.fog.far = Z.fog[1] * (Z.outdoor ? .5 + .5 * L : 1);
}
const clk = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(.1, clk.getDelta());
  if (!P || !G || loading) return;
  T += dt; ST += dt;
  updPlayer(dt);
  for (const e of ents.values()) place(e, dt);
  camera.position.set(P.x, G.heightAt(P.x, P.z) + (P.dead || P.feign ? .35 : P.sitting ? .95 : 1.7) + P.yoff, P.z);
  camera.rotation.set(P.pitch, P.yaw, P.dead ? .6 : 0);
  light(); hud(dt); if (dirty) refresh();
  renderer.render(scene, camera);
}

// ---------- login and character creation ----------
(function initCreate() {
  let race = 'human', cls = 'bulwark';
  const draw = () => {
    for (const [box, data, cur, set] of [['races', RACES, race, v => race = v], ['classes', CLASSES, cls, v => cls = v]]) {
      const b = $(box); b.textContent = '';
      for (const k in data) { const bt = el('button', k === cur ? 'on' : '', data[k].name); bt.onclick = () => { set(k); draw(); }; b.append(bt); }
    }
    const C = CLASSES[cls], m = RACES[race].mods;
    $('cdesc').textContent = `${RACES[race].name}: ${RACES[race].desc} ${Object.keys(m).map(k => `${k.toUpperCase()} ${m[k] > 0 ? '+' : ''}${m[k]}`).join(', ')}\n${C.name} (${C.role}): ${C.desc}`;
    $('cdesc').style.whiteSpace = 'pre-line';
  };
  draw();
  try { $('cname').value = localStorage.getItem('gloamwood_name') || ''; } catch (e) { /* storage unavailable */ }
  const go = t => {
    const o = { t, name: $('cname').value.trim(), pass: $('cpass').value, race, cls };
    if (ws && ws.readyState === 1) send(o); else connect(o);
  };
  $('login').onclick = () => go('login'); $('enter').onclick = () => go('create');
  $('cpass').addEventListener('keydown', e => { if (e.code === 'Enter') go('login'); });
})();
frame();

// Handles for debugging from the browser console.
window.G = { get P() { return P; }, get ents() { return ents; }, get Z() { return Z; }, send, setTarget };
