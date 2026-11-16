import * as THREE from '../vendor/three.module.min.js';
import { RACES, CLASSES, SPELLS, ITEMS, MOBS, PETS, SKILLS, TIERS } from './data.js';
import { ZONES } from './zones.js';
import { buildWorld, makeModel, animModel, makeLabel } from './world.js';

const $ = id => document.getElementById(id);
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const cap = s => s[0].toUpperCase() + s.slice(1);
const SAVE = 'gloamwood_save_v1', MAXLVL = 20;
const SLOTS = ['primary', 'secondary', 'head', 'chest', 'legs', 'hands', 'feet', 'neck', 'ring'];
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

let P = null, Z = null, W = null, ents = [], spawns = [], T = 0, tickT = 0, loading = false, dirty = true;
let pickSpell = null, shopNpc = null, lootEnt = null, flowCell = -1, saveT = 0, hudT = 0;
const keys = {}, lastWarn = {};

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
function msg(t, cls = 'c-sys') {
  const d = document.createElement('div'); d.className = cls; d.textContent = t;
  const l = $('log'); l.appendChild(d); while (l.children.length > 150) l.firstChild.remove(); l.scrollTop = l.scrollHeight;
}
function warn(t) { if (T - (lastWarn[t] ?? -9) > 2.5) { lastWarn[t] = T; msg(t, 'c-miss'); } }
const say = (e, t) => msg(`${e.name} says, '${t}'`, 'c-npc');
const fmtCoin = c => [[1000, 'p'], [100, 'g'], [10, 's'], [1, 'c']].map(([v, n]) => { const k = Math.floor(c / v); c -= k * v; return k ? k + n : ''; }).filter(Boolean).join(' ') || '0c';
let actx;
function snd(f, d = .08, type = 'square', v = .04, slide = 0, delay = 0) {
  try {
    actx = actx || new AudioContext(); const t0 = actx.currentTime + delay, o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t0); if (slide) o.frequency.linearRampToValueAtTime(f + slide, t0 + d);
    g.gain.setValueAtTime(v, t0); g.gain.linearRampToValueAtTime(0, t0 + d); o.connect(g).connect(actx.destination); o.start(t0); o.stop(t0 + d);
  } catch (e) { /* audio unavailable */ }
}

// ---------- player ----------
const KEEP = ['name', 'race', 'cls', 'lvl', 'xp', 'hp', 'mana', 'x', 'z', 'yaw', 'zone', 'coin', 'inv', 'eq', 'book', 'gems', 'skills', 'corpses', 'quest', 'pet', 'time'];
function save() { if (!P || P.dead || loading) return; const o = {}; KEEP.forEach(k => o[k] = P[k]); try { localStorage.setItem(SAVE, JSON.stringify(o)); } catch (e) { /* storage unavailable */ } }
function loadSave() { try { return JSON.parse(localStorage.getItem(SAVE)); } catch (e) { return null; } }
function initRuntime() {
  Object.assign(P, { kind: 'player', r: .5, pitch: 0, buffs: [], gemCd: {}, gemMax: {}, target: null, casting: null, autoAtk: false, sitting: false, feign: false, dead: false, swingT: 0, vy: 0, yoff: 0, autorun: false, petE: null });
}
function newPlayer(name, race, cls) {
  P = { name, race, cls, lvl: 1, xp: 0, hp: 1, mana: 0, x: 0, z: 0, yaw: 0, zone: 'city', coin: 25, inv: Array(16).fill(null), eq: {}, book: [], gems: Array(8).fill(null), skills: {}, corpses: [], quest: {}, pet: null, time: 9 * 60 };
  initRuntime();
  CLASSES[cls].start.forEach(id => { P.eq[ITEMS[id].slot] = id; });
  learnLevel(true); recalc(); P.hp = P.maxhp; P.mana = P.maxmana;
}
function recalc() {
  const C = CLASSES[P.cls], s = { str: 10, sta: 10, agi: 10, int: 10, wis: 10, ac: 0, hp: 0, mana: 0, haste: 0, regen: 0, mregen: 0, ds: 0, speed: 0 };
  const mods = RACES[P.race].mods; for (const k in mods) s[k] += mods[k];
  for (const sl of SLOTS) { const it = ITEMS[P.eq[sl]]; if (it) for (const k in s) if (it[k]) s[k] += it[k]; }
  for (const b of P.buffs) if (b.stats) for (const k in b.stats) { if (k === 'haste' || k === 'speed') s[k] = Math.max(s[k], b.stats[k]); else s[k] += b.stats[k]; }
  P.st = s;
  P.maxhp = Math.round(20 + P.lvl * C.hp + (s.sta - 10) * P.lvl * .3 + s.hp);
  P.maxmana = C.cast ? Math.round(P.lvl * C.mp + s[C.cast] * (1 + P.lvl / 4) + s.mana) : 0;
  P.ac = s.ac + Math.floor(s.agi / 3);
  P.hp = Math.min(P.hp, P.maxhp); P.mana = Math.min(P.mana, P.maxmana);
}
function learn(id, silent) {
  if (P.book.includes(id)) return false;
  P.book.push(id); const i = P.gems.indexOf(null); if (i >= 0) P.gems[i] = id;
  if (!silent) msg(`You have learned ${SPELLS[id].name}!`, 'c-spell');
  dirty = true; return true;
}
function learnLevel(silent) { Object.values(SPELLS).filter(s => s.cls === P.cls && s.lvl <= P.lvl && (s.abil || s.lvl === 1)).forEach(s => learn(s.id, silent)); }
function skillUp(k, ch) { const v = P.skills[k] || 0; if (v < P.lvl * 5 + 5 && Math.random() < ch) { P.skills[k] = v + 1; msg(`You have become better at ${SKILLS[k]}! (${v + 1})`, 'c-skill'); } }
const need = n => Math.round(150 * n * n * (1 + n / 10));
function gainXp(xp) {
  if (P.lvl >= MAXLVL || xp <= 0) return;
  P.xp += xp; msg('You gain experience!');
  while (P.lvl < MAXLVL && P.xp >= need(P.lvl)) {
    P.xp -= need(P.lvl); P.lvl++; recalc();
    msg(`You have gained a level! Welcome to level ${P.lvl}!`); [523, 659, 784, 1047].forEach((f, i) => snd(f, .18, 'triangle', .06, 0, i * .11));
    learnLevel();
    if (Object.values(SPELLS).some(s => s.cls === P.cls && s.lvl === P.lvl && !s.abil)) msg('New scrolls await you at your guild in Lanternhold.', 'c-spell');
  }
}
function conOf(l) {
  const d = l - P.lvl, gr = P.lvl < 8 ? -4 : P.lvl < 16 ? -6 : -8;
  return d >= 3 ? ['red', 'fighting it would be suicide', 1.2] : d >= 1 ? ['yellow', 'it looks like more than a match for you', 1.1] : d === 0 ? ['white', 'it looks like an even fight', 1]
    : d > gr + 1 ? ['blue', 'you would probably win this fight', 1 + d * .06] : d > gr ? ['lblue', 'it looks fairly easy', .4] : ['green', 'it would be no challenge at all', 0];
}
function sit() { if (P.dead || P.casting) return; P.sitting = true; P.feign = false; P.autoAtk = false; P.autorun = false; dirty = true; }
function stand() { if (P.sitting || P.feign) { P.sitting = false; P.feign = false; dirty = true; } }
function breakInvis() { if (has(P, 'invis')) { P.buffs = P.buffs.filter(b => !b.invis); msg('You are visible again.', 'c-spell'); dirty = true; } }

// ---------- inventory ----------
function addItem(id, n = 1) {
  if (ITEMS[id].stack) { const s = P.inv.find(s => s && s.id === id); if (s) { s.n += n; dirty = true; return true; } }
  const i = P.inv.indexOf(null); if (i < 0) return false;
  P.inv[i] = { id, n }; dirty = true; return true;
}
const countItem = id => P.inv.reduce((a, s) => a + (s && s.id === id ? s.n : 0), 0);
function removeItem(id, n) { P.inv.forEach((s, i) => { if (s && s.id === id && n > 0) { const k = Math.min(n, s.n); s.n -= k; n -= k; if (!s.n) P.inv[i] = null; } }); dirty = true; }
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
function canUse(it) {
  const C = CLASSES[P.cls];
  if (it.dmg && !C.weps.includes(it.wt)) return `A ${C.name} cannot wield that.`;
  if (it.arm !== undefined && it.arm > C.armor) return `A ${C.name} cannot wear ${TIERS[it.arm].toLowerCase()} armor.`;
  return null;
}
function clickBag(i) {
  const s = P.inv[i]; if (!s) return; const it = ITEMS[s.id];
  if (shopNpc) {
    if (!it.val) { say(shopNpc, 'I have no use for that.'); return; }
    const v = Math.max(1, Math.floor(it.val * .4)); P.coin += v; if (--s.n <= 0) P.inv[i] = null;
    msg(`You sell ${it.name} for ${fmtCoin(v)}.`, 'c-loot'); snd(900, .05, 'square', .02);
  } else if (it.slot === 'scroll') {
    const sp = SPELLS[it.spell];
    if (sp.cls !== P.cls) return msg('You cannot make sense of this scroll.', 'c-miss');
    if (P.lvl < sp.lvl) return msg(`You are not yet experienced enough to scribe this. (Level ${sp.lvl})`, 'c-miss');
    if (P.book.includes(sp.id)) return msg('You already know this spell.', 'c-miss');
    P.inv[i] = null; msg(`You scribe ${sp.name} into your spellbook.`, 'c-spell'); learn(sp.id, true);
  } else if (it.slot === 'misc') msg('You cannot use that. A merchant might buy it.', 'c-miss');
  else {
    const why = canUse(it); if (why) return msg(why, 'c-miss');
    const old = P.eq[it.slot]; P.eq[it.slot] = it.id; P.inv[i] = old ? { id: old, n: 1 } : null; recalc(); msg(`You equip ${it.name}.`, 'c-loot');
  }
  dirty = true;
}
function unequip(sl) { const id = P.eq[sl]; if (!id) return; if (!addItem(id)) return msg('Your bags are full.', 'c-miss'); delete P.eq[sl]; recalc(); dirty = true; }

// ---------- zones and entities ----------
const isNight = () => P.time < 6 * 60 || P.time >= 20 * 60;
const mobHp = l => 14 + l * 9 + l * l * 1.2;
function enterZone(id, at, quick) {
  loading = true; $('loadtext').textContent = `Entering ${ZONES[id].name}...`; $('loading').classList.remove('hidden');
  closeWin('loot'); closeWin('shop');
  setTimeout(() => { buildZone(id, at); $('loading').classList.add('hidden'); loading = false; msg(`You have entered ${Z.name}.`); save(); }, quick ? 30 : 700);
}
function buildZone(id, at) {
  scene.traverse(o => { if (o.geometry) o.geometry.dispose(); }); scene.clear(); ents = []; spawns = [];
  Z = ZONES[id]; W = buildWorld(Z, scene); scene.add(amb, sun, torch);
  const c = Z.cell;
  P.zone = id; P.x = at.x * c; P.z = at.y * c; P.yaw = (at.yaw || 0) + .03; P.pitch = 0; P.target = null; P.casting = null; P.petE = null; flowCell = -1;
  Z.npcs.forEach(n => {
    const [x, y] = typeof n.at === 'string' ? Z.marks[n.at] : [n.at[0] + .5, n.at[1] + .5];
    const e = { kind: 'npc', def: n, name: n.name, lvl: 30, x: x * c, z: y * c, yaw: 0, hp: 9999, maxhp: 9999, r: .5, buffs: [], hate: new Map(), home: { x: x * c, z: y * c }, atkT: 0 };
    attach(e, n.model, '#a8d8ff');
  });
  Z.spawns.forEach(s => { for (let i = 0; i < s.n; i++) { const sp = { s, e: null, t: 0 }; spawns.push(sp); spawnMob(sp, true); } });
  P.corpses.filter(k => k.zone === id).forEach(addPCorpse);
  if (P.pet) summonPet(P.pet.k, P.pet.lvl, true);
  dirty = true;
}
function attach(e, model, color) { e.model = makeModel(model); e.model.userData.ent = e; setLabel(e, e.name, color); scene.add(e.model); ents.push(e); place(e); }
function setLabel(e, text, color) {
  if (e.label) e.model.remove(e.label);
  const u = e.model.userData; e.label = makeLabel(text, color, .36 / u.s); e.label.position.y = (u.hgt + .4) / u.s; e.model.add(e.label);
}
function place(e) {
  const u = e.model.userData, sw = e.swing > 0 && !u.arms.length ? e.swing * .5 : 0;
  e.model.position.set(e.x + Math.sin(e.yaw) * sw, W.heightAt(e.x, e.z) + (u.fly ? Math.sin(T * 3 + e.x) * .15 : 0) + (e.lying ? .3 : 0), e.z + Math.cos(e.yaw) * sw);
  e.model.rotation.y = e.yaw; e.label.visible = dist(e, P) > 2.4;
}
function remove(e) {
  e.gone = true; scene.remove(e.model); const i = ents.indexOf(e); if (i >= 0) ents.splice(i, 1);
  if (P.target === e) { P.target = null; dirty = true; }
  if (lootEnt === e) closeWin('loot');
}
function lay(e, text, color) { e.lying = true; e.model.rotation.z = Math.PI / 2; setLabel(e, text, color); e.label.position.set(1.3 / e.model.userData.s, 0, 0); }
function spawnMob(sp, initial) {
  const s = sp.s; let id = s.m; if (s.rare && Math.random() < s.rare[1]) id = s.rare[0];
  const def = MOBS[id], c = Z.cell;
  if (def.night && !isNight()) { sp.t = 30; return; }
  let x, z, tries = 0;
  do { const a = Math.random() * 6.28, r = Math.random() * s.r * c; x = (s.at[0] + .5) * c + Math.cos(a) * r; z = (s.at[1] + .5) * c + Math.sin(a) * r; } while (++tries < 30 && !W.free(x, z, 1));
  if (!W.free(x, z, 1)) { sp.t = 10; return; }
  if (!initial && Math.hypot(x - P.x, z - P.z) < 14) { sp.t = 5; return; }
  const lvl = rnd(def.lv[0], def.lv[1]);
  const e = { kind: 'mob', def, name: def.name, lvl, x, z, yaw: Math.random() * 6.28, r: .45 * (def.model[1].s || 1) + .15, buffs: [], hate: new Map(), home: { x, z }, sp, atkT: 0, wt: Math.random() * 8, cd: rnd(3, 8), wp: 0 };
  e.maxhp = e.hp = Math.round(mobHp(lvl) * (def.hp || 1)); sp.e = e;
  attach(e, def.model, def.named ? '#ffd0a0' : '#e8e0d0');
}
function addPCorpse(k) {
  const e = { kind: 'pcorpse', name: `${P.name}'s corpse`, k, x: k.x, z: k.z, yaw: 0, r: .5, buffs: [], dead: true };
  attach(e, ['human', { top: 0x5a5a6a }], '#f0e070'); lay(e, e.name, '#f0e070');
}
function summonPet(k, lvl, quiet) {
  if (P.petE) remove(P.petE);
  const d = PETS[k], e = { kind: 'pet', def: d, name: d.name, lvl, x: P.x + 1.5, z: P.z + 1.5, yaw: 0, r: .5, buffs: [], hate: new Map(), atkT: 0, name0: d.name };
  [e.x, e.z] = W.slide(P.x, P.z, e.x, e.z, .5);
  e.maxhp = e.hp = Math.round(mobHp(lvl) * d.hp * .8); P.pet = { k, lvl }; P.petE = e;
  attach(e, d.model, '#a8e8a8'); if (!quiet) msg(`${cap(d.name)} rises to serve you.`, 'c-spell'); dirty = true;
}
function dismissPet(text) { if (!P.petE) return; if (text) msg(text, 'c-spell'); remove(P.petE); P.petE = null; P.pet = null; dirty = true; }

// ---------- effects ----------
const has = (e, k) => e.buffs.some(b => b[k]);
const fxv = (e, k) => e.buffs.reduce((m, b) => Math.max(m, b[k] || 0), 0);
function addBuff(e, id, name, t, o) { e.buffs = e.buffs.filter(b => b.id !== id); e.buffs.push({ id, name, t, ...o }); if (e === P) { recalc(); dirty = true; } }
function updBuffs(e, dt) {
  for (let i = e.buffs.length - 1; i >= 0; i--) {
    const b = e.buffs[i]; b.t -= dt;
    if (b.t <= 0) { e.buffs.splice(i, 1); if (e === P) { msg(`Your ${b.name} fades.`, 'c-spell'); recalc(); dirty = true; } }
  }
}
function addHate(m, src, amt, noAssist) {
  if (m.kind !== 'mob' || m.dead) return;
  const first = !m.hate.size; m.hate.set(src, (m.hate.get(src) || 0) + amt);
  if (first && !noAssist && m.def.social) for (const o of ents) if (o.kind === 'mob' && o !== m && !o.dead && o.def.social === m.def.social && !o.hate.size && dist(o, m) < 18) addHate(o, src, 1, true);
}
function hurt(t, amt, src) {
  if (t.dead) return;
  t.hp -= amt; if (t.buffs.length) t.buffs = t.buffs.filter(b => !b.mez);
  if (t.kind === 'mob') addHate(t, src, amt);
  if (t.hp <= 0) kill(t, src);
}
function hurtPlayer(amt, src) {
  if (P.dead) return;
  P.hp -= amt; snd(110, .07, 'sawtooth', .05); stand();
  if (!P.target && src.kind === 'mob') setTarget(src);
  if (P.casting) { if (Math.random() < .3) { msg('Your spell is interrupted.', 'c-spell'); P.casting = null; } else warn('You regain your concentration.'); }
  if (P.hp <= 0) die(src);
}
function kill(e, src) {
  e.dead = true;
  if (e.kind === 'mob') {
    msg(src === P ? `You have slain ${e.name}!` : `${cap(e.name)} has been slain by ${src.name}!`);
    if (src === P || src === P.petE) { const m = conOf(e.lvl)[2]; gainXp(Math.round((15 * e.lvl * e.lvl + 10) * m * (e.def.named ? 2 : 1))); }
    const d = e.def; e.kind = 'corpse'; e.hate.clear(); e.buffs = []; e.moving = false; e.casting = null;
    e.loot = (d.loot || []).filter(([, p]) => Math.random() < p).map(([id]) => id);
    e.coin = d.coin ? rnd(e.lvl, e.lvl * e.lvl * 3 + e.lvl * 4) : 0;
    e.decay = e.loot.length || e.coin ? 200 : 45;
    lay(e, `${e.name}'s corpse`, '#9a9a9a');
    e.sp.e = null; e.sp.t = Z.respawn * (e.sp.s.slow || 1) * (.8 + Math.random() * .4);
    if (P.target === e) dirty = true;
  } else if (e.kind === 'pet') { msg(`${cap(e.name)} has been slain by ${src.name}!`, 'c-hit'); remove(e); P.petE = null; P.pet = null; }
}
function die(src) {
  P.dead = true; P.hp = 0; P.autoAtk = false; P.casting = null; P.sitting = false; P.feign = false; P.buffs = []; P.target = null;
  msg(`You have been slain by ${src.name}!`, 'c-hit'); snd(200, .8, 'sawtooth', .06, -150);
  if (P.lvl >= 5) {
    P.xp = Math.max(0, P.xp - Math.round(need(P.lvl) * .08)); msg('You have lost experience.', 'c-hit');
    if (P.inv.some(Boolean) || P.coin) {
      P.corpses.push({ zone: Z.id, x: P.x, z: P.z, inv: P.inv.filter(Boolean), coin: P.coin });
      P.inv = Array(16).fill(null); P.coin = 0; msg(`Your belongings remain with your corpse in ${Z.name}.`, 'c-hit');
    }
  }
  if (P.petE) { remove(P.petE); P.petE = null; P.pet = null; }
  closeWin('loot'); closeWin('shop'); dirty = true;
  setTimeout(() => {
    recalc(); P.dead = false; P.hp = Math.ceil(P.maxhp / 2); P.mana = Math.floor(P.maxmana / 4);
    enterZone('city', ZONES.city.start); msg('You wake in Lanternhold, sore but alive.');
  }, 3500);
}

// ---------- melee ----------
function weapon() {
  const it = ITEMS[P.eq.primary]; if (it && it.dmg) return it;
  return P.cls === 'brawler' ? { dmg: 3 + Math.floor(P.lvl / 2), delay: 20, wt: 'fist' } : { dmg: 2, delay: 30, wt: 'fist' };
}
const VERB = { slash: 'slash', blunt: 'crush', pierce: 'pierce', fist: 'punch' };
function meleeHit(t, w, mult, label) {
  const sk = (P.skills[w.wt] || 0) / (P.lvl * 5 + 5);
  const p = clamp(.8 + (P.lvl - t.lvl) * .04 - (1 - sk) * .15, .15, .95);
  skillUp(w.wt, .12); skillUp('off', .06);
  if (Math.random() > p) { msg(label ? `Your ${label} misses ${t.name}!` : `You try to ${VERB[w.wt]} ${t.name}, but miss!`, 'c-miss'); addHate(t, P, 1); snd(260, .05, 'triangle', .02, -100); return 0; }
  const dmg = Math.max(1, Math.round((rnd(1, w.dmg * 2) * (1 + P.lvl * .08 + (P.st.str - 10) / 100) + P.lvl / 4) * mult));
  msg(label ? `Your ${label} hits ${t.name} for ${dmg} points of damage.` : `You ${VERB[w.wt]} ${t.name} for ${dmg} point${dmg > 1 ? 's' : ''} of damage.`, 'c-dmg');
  snd(180 + Math.random() * 40, .05, 'square', .03); hurt(t, dmg, P); return dmg;
}
const facing = t => -Math.sin(P.yaw) * (t.x - P.x) - Math.cos(P.yaw) * (t.z - P.z) > 0;
const isBehind = t => Math.sin(t.yaw) * (P.x - t.x) + Math.cos(t.yaw) * (P.z - t.z) < 0;
function playerSwing(dt) {
  if (P.swingT > 0) P.swingT -= dt;
  if (!P.autoAtk || P.dead || P.casting || has(P, 'stun') || P.swingT > 0) return;
  const t = P.target; if (!t || t.kind !== 'mob' || t.dead) return;
  if (dist(P, t) > t.r + 3.4) { warn('Your target is too far away, get closer!'); P.swingT = .4; return; }
  if (!facing(t)) { warn('You cannot see your target.'); P.swingT = .4; return; }
  const w = weapon(); P.swingT = w.delay / 10 / (1 + P.st.haste / 100);
  breakInvis(); stand(); meleeHit(t, w, 1);
}

// ---------- spells and abilities ----------
function castGem(i) {
  if (pickSpell) return memorize(i);
  const id = P.gems[i]; if (!id || P.dead) return; const sp = SPELLS[id];
  if (P.casting) return warn('You are already casting.');
  if (has(P, 'stun')) return warn('You are stunned!');
  if ((P.gemCd[id] || 0) > 0) return warn(`${sp.name} is not ready yet.`);
  if (P.mana < sp.mana) return warn('Insufficient mana to cast this spell!');
  let t = P;
  if (sp.tgt === 'enemy') {
    t = P.target; if (!t || t.kind !== 'mob' || t.dead) return warn('You must first select a target for this.');
    if (dist(P, t) > sp.range + t.r) return warn('Your target is out of range, get closer!');
    if (!W.los(P, t)) return warn('You cannot see your target.');
  }
  stand();
  if (sp.abil || !sp.cast) return fire(sp, t);
  P.casting = { sp, t: 0, tgt: t, x: P.x, z: P.z }; msg(`You begin casting ${sp.name}.`, 'c-spell'); snd(330, .3, 'sine', .03, 220);
}
function updCast(dt) {
  const c = P.casting; if (!c) return;
  if (Math.hypot(P.x - c.x, P.z - c.z) > 1.2) { msg('Your spell is interrupted.', 'c-spell'); P.casting = null; return; }
  c.t += dt; if (c.t < c.sp.cast) return;
  P.casting = null; const sp = c.sp;
  if (sp.tgt === 'enemy' && (c.tgt.dead || c.tgt.kind !== 'mob')) return msg('Your target is gone.', 'c-spell');
  const sk = (P.skills[sp.school] || 0) / (P.lvl * 5 + 5); skillUp(sp.school, .2);
  if (Math.random() < clamp(.16 - sk * .14, .03, .16)) { msg('Your spell fizzles!', 'c-spell'); P.mana -= Math.ceil(sp.mana / 2); setCd(sp.id, 1.5); snd(150, .2, 'sawtooth', .03, -80); return; }
  fire(sp, c.tgt);
}
function setCd(id, t) { P.gemCd[id] = P.gemMax[id] = t; }
function fire(sp, t) { P.mana -= sp.mana; setCd(sp.id, Math.max(sp.recast, sp.abil ? 1 : 2.2)); doSpell(sp, t); dirty = true; }
function doSpell(sp, t) {
  const fx = (k, name, dur, o) => addBuff(t, sp.id + k, sp.name, dur, o);
  if (sp.tgt === 'enemy') {
    breakInvis();
    if (sp.undead && !t.def.undead) return msg('Your spell has no effect on this creature.', 'c-spell');
    if (sp.strike !== undefined) { if (!meleeHit(t, weapon(), sp.behind && isBehind(t) ? sp.behind : sp.strike, sp.name) || t.dead) return; }
    else if (!sp.shot && !sp.taunt && Math.random() < clamp(.06 + (t.lvl - P.lvl) * .06, .02, .7)) { msg(`${cap(t.name)} resisted your ${sp.name}!`, 'c-spell'); addHate(t, P, 10); return; }
    addHate(t, P, sp.mana + 8);
    if (sp.shot) { const d = rnd(...sp.shot) + Math.round(P.lvl * 1.2); msg(`Your arrow strikes ${t.name} for ${d} points of damage.`, 'c-dmg'); snd(700, .06, 'triangle', .03, -400); hurt(t, d, P); }
    if (sp.dd) { const d = rnd(...sp.dd); msg(`${cap(t.name)} was hit by ${sp.name} for ${d} points of damage.`, 'c-dmg'); snd(520, .15, 'sawtooth', .03, -300); hurt(t, d, P); }
    if (sp.tap) { const d = rnd(...sp.tap); msg(`You drain ${d} points of life from ${t.name}.`, 'c-dmg'); P.hp = Math.min(P.maxhp, P.hp + d); hurt(t, d, P); }
    if (t.dead) return;
    const said = [];
    if (sp.dot) { fx('d', 0, sp.dot.t, { dot: sp.dot.d }); said.push('sickens'); }
    if (sp.root) { fx('r', 0, sp.root, { root: 1 }); said.push('is rooted in place'); }
    if (sp.snare) { fx('s', 0, sp.snare.t, { snare: sp.snare.p }); said.push('is slowed'); }
    if (sp.slow) { fx('l', 0, sp.slow.t, { slow: sp.slow.p }); said.push('moves sluggishly'); }
    if (sp.stun) { fx('t', 0, sp.stun, { stun: 1 }); t.casting = null; said.push('is stunned'); }
    if (sp.fear) { fx('f', 0, sp.fear, { fear: 1 }); said.push('flees in terror'); }
    if (sp.mez) { if (t.lvl > sp.mez.max) msg(`${cap(t.name)} is too powerful to be entranced.`, 'c-spell'); else { fx('m', 0, sp.mez.t, { mez: 1 }); said.push('is entranced'); } }
    if (sp.taunt) { t.hate.set(P, Math.max(...t.hate.values(), 0) + 20); said.push('turns on you in a rage'); }
    if (said.length) msg(`${cap(t.name)} ${said.join(' and ')}.`, 'c-spell');
  } else {
    if (sp.heal || sp.healPct) { const a = sp.heal ? rnd(...sp.heal) : Math.round(P.maxhp * sp.healPct), b = Math.min(a, P.maxhp - P.hp); P.hp += b; msg(`You feel your wounds close. (${b})`, 'c-spell'); snd(660, .3, 'sine', .04, 330); }
    if (sp.buff) { const { t: dur, ...stats } = sp.buff; addBuff(P, sp.id, sp.name, dur, { stats }); msg(`You are wrapped in ${sp.name}.`, 'c-spell'); }
    if (sp.pet) summonPet(sp.pet.k, Math.max(1, Math.min(P.lvl, sp.pet.cap) - 1));
    if (sp.invis) { addBuff(P, sp.id, sp.name, sp.invis, { invis: 1 }); msg('You fade from view.', 'c-spell'); }
    if (sp.feign) {
      P.autoAtk = false;
      if (Math.random() < sp.feign) { P.feign = true; P.sitting = false; msg('You collapse to the ground.', 'c-spell'); } else msg('Your ruse fools no one!', 'c-hit');
    }
    if (sp.fade) { let n = 0; for (const e of ents) if (e.kind === 'mob' && e.hate.has(P) && Math.random() < .8) { e.hate.delete(P); n++; } msg(n ? 'You slip from your enemies\' attention.' : 'No one was paying you any mind.', 'c-spell'); }
    if (sp.gate) { msg('The world folds around you.', 'c-spell'); enterZone('city', ZONES.city.start); }
  }
}
function memorize(i) {
  const id = pickSpell, sp = SPELLS[id]; pickSpell = null;
  const old = P.gems.indexOf(id); if (old >= 0) P.gems[old] = null;
  P.gems[i] = id;
  if (!sp.abil) { setCd(id, 4); sit(); msg(`You sit and begin memorizing ${sp.name}.`, 'c-spell'); }
  dirty = true;
}

// ---------- monster AI ----------
function stepToward(e, tx, tz, spd, dt) {
  const dx = tx - e.x, dz = tz - e.z, d = Math.hypot(dx, dz); if (d < .05) return d;
  const m = Math.min(d, spd * dt);
  [e.x, e.z] = W.slide(e.x, e.z, e.x + dx / d * m, e.z + dz / d * m, e.r);
  e.yaw = Math.atan2(dx, dz); e.moving = true; return d;
}
function chase(e, t, sp, dt) {
  if (t === P && !W.los(e, t)) {
    const c = Z.cell, cx = Math.floor(e.x / c), cy = Math.floor(e.z / c); let best = W.dist[cy * Z.W + cx], bx = -1, by = -1;
    if (best > 0) for (const [dx, dy] of DIRS) {
      const xx = cx + dx, yy = cy + dy; if (xx < 0 || yy < 0 || xx >= Z.W || yy >= Z.H) continue;
      const d = W.dist[yy * Z.W + xx]; if (d >= 0 && d < best) { best = d; bx = xx; by = yy; }
    }
    if (bx >= 0) return stepToward(e, (bx + .5) * c, (by + .5) * c, sp, dt);
  }
  stepToward(e, t.x, t.z, sp, dt);
}
function mobSwing(e, t) {
  e.atkT = (e.def.delay || 2.2) / (1 - fxv(e, 'slow')); e.swing = 1;
  const max = Math.max(1, Math.round((2 + e.lvl * 1.3) * (e.def.dmg || 1)));
  if (t === P) {
    const ac = P.ac, p = clamp(.9 - ac / (ac + 30 + e.lvl * 10) * .7 + (e.lvl - P.lvl) * .03, .2, .95);
    skillUp('def', .05);
    if (Math.random() > p) return msg(`${cap(e.name)} tries to hit YOU, but misses!`, 'c-miss');
    const dmg = Math.max(1, Math.round(rnd(1, max) * (1 - Math.min(.4, ac / (ac + 60 + e.lvl * 15)))));
    msg(`${cap(e.name)} hits YOU for ${dmg} point${dmg > 1 ? 's' : ''} of damage.`, 'c-hit');
    hurtPlayer(dmg, e);
    if (P.st.ds && !P.dead) hurt(e, P.st.ds, P);
  } else if (Math.random() < .75) hurt(t, rnd(1, max), e);
}
function updMob(e, dt) {
  e.moving = false; if (e.atkT > 0) e.atkT -= dt; if (e.cd > 0) e.cd -= dt;
  if (has(e, 'mez') || has(e, 'stun')) return;
  let t = null, top = -1;
  for (const [k, v] of e.hate) { if (k.dead || k.gone || (k === P && P.feign)) { e.hate.delete(k); continue; } if (v > top) { top = v; t = k; } }
  if (e.casting) {
    if ((e.casting.t -= dt) <= 0) {
      const s = e.casting.s; e.casting = null;
      if (s.heal) { e.hp = Math.min(e.maxhp, e.hp + rnd(...s.heal)); msg(`${cap(e.name)} is bathed in a murky glow.`, 'c-spell'); }
      else if (t && dist(e, t) < 55) {
        const d = rnd(...s.dd);
        if (t !== P) hurt(t, d, e);
        else if (Math.random() < .15) msg(`You resist the ${s.name}!`, 'c-spell');
        else { msg(`${cap(e.name)} hits you with ${s.name} for ${d} points of damage.`, 'c-hit'); hurtPlayer(d, e); }
      }
    }
    return;
  }
  const spd = has(e, 'root') ? 0 : (e.def.speed || 6.2) * (1 - fxv(e, 'snare'));
  if (!t) {
    if (e.def.aggro && !P.dead && !P.feign && !has(P, 'invis') && dist(e, P) < (e.def.agR || 15) * (P.sitting ? 1.4 : 1) && W.los(e, P)) return addHate(e, P, 1);
    if (e.def.aggro && P.petE && dist(e, P.petE) < 8) return addHate(e, P.petE, 1);
    if (e.hp < e.maxhp) e.hp = Math.min(e.maxhp, e.hp + e.maxhp * .04 * dt);
    const path = e.sp.s.path, c = Z.cell;
    if (path) { const w = path[e.wp]; if (stepToward(e, (w[0] + .5) * c, (w[1] + .5) * c, spd * .45, dt) < 2) e.wp = (e.wp + 1) % path.length; return; }
    if (dist(e, e.home) > e.sp.s.r * c + 6) { stepToward(e, e.home.x, e.home.z, spd, dt); e.wt = 3; return; }
    if ((e.wt -= dt) <= 0) { const a = Math.random() * 6.28, r = Math.random() * (e.sp.s.r * c * .5 + 2); e.wx = e.home.x + Math.cos(a) * r; e.wz = e.home.z + Math.sin(a) * r; e.wt = 5 + Math.random() * 10; e.wn = 4; }
    if (e.wn > 0) { e.wn -= dt; if (stepToward(e, e.wx, e.wz, 1.6, dt) < .3) e.wn = 0; }
    return;
  }
  if (has(e, 'fear') || (e.def.flee && e.hp < e.maxhp * .2)) {
    if (!e.fled && !has(e, 'fear')) { e.fled = true; msg(`${cap(e.name)} turns to flee!`, 'c-other'); }
    const dx = e.x - t.x, dz = e.z - t.z, d = Math.hypot(dx, dz) || 1; stepToward(e, e.x + dx / d * 8, e.z + dz / d * 8, spd * .75, dt); return;
  }
  const d = dist(e, t), reach = e.r + (t.r || .5) + 1.4;
  if (d > reach) { if (spd > 0) chase(e, t, spd, dt); } else e.yaw = Math.atan2(t.x - e.x, t.z - e.z);
  if (e.def.spells && e.cd <= 0 && d < 45) {
    const s = e.def.spells.find(s => s.heal ? e.hp < e.maxhp * .5 : W.los(e, t));
    if (s) { e.casting = { s, t: 2.5 }; e.cd = s.cd; msg(`${cap(e.name)} begins to cast a spell.`, 'c-spell'); return; }
  }
  if (d <= reach + .3 && e.atkT <= 0) mobSwing(e, t);
}
function updGuard(e, dt) {
  e.moving = false; if (e.atkT > 0) e.atkT -= dt;
  let t = e.tgt;
  if (!t || t.dead || t.kind !== 'mob' || dist(e, t) > 40) {
    t = null; let bd = 26; for (const m of ents) if (m.kind === 'mob' && !m.dead && m.def.aggro) { const d = dist(e, m); if (d < bd) { bd = d; t = m; } }
    e.tgt = t; if (t) msg(`${e.name} shouts, 'For Lanternhold!'`, 'c-npc');
  }
  if (t) {
    const d = dist(e, t), reach = e.r + t.r + 1.4;
    if (d > reach) stepToward(e, t.x, t.z, 8, dt);
    else { e.yaw = Math.atan2(t.x - e.x, t.z - e.z); if (e.atkT <= 0) { e.atkT = 1.4; e.swing = 1; const dmg = rnd(25, 60); msg(`${e.name} hits ${t.name} for ${dmg} points of damage.`, 'c-other'); hurt(t, dmg, e); } }
  } else if (dist(e, e.home) > 1) stepToward(e, e.home.x, e.home.z, 4, dt);
  else if (dist(e, P) < 10) e.yaw = Math.atan2(P.x - e.x, P.z - e.z);
}
function updPet(e, dt) {
  e.moving = false; if (e.atkT > 0) e.atkT -= dt;
  let t = e.tgt; if (t && (t.dead || t.kind !== 'mob')) t = e.tgt = null;
  if (!t) t = ents.find(m => m.kind === 'mob' && !m.dead && (m.hate.has(P) || m.hate.has(e)));
  if (t) {
    const d = dist(e, t), reach = e.r + t.r + 1.4;
    if (d > reach) stepToward(e, t.x, t.z, 8, dt);
    else {
      e.yaw = Math.atan2(t.x - e.x, t.z - e.z);
      if (e.atkT <= 0) {
        e.atkT = 2; e.swing = 1;
        if (Math.random() < .8) { const dmg = rnd(1, Math.max(1, Math.round((2 + e.lvl * 1.3) * e.def.dmg))); msg(`${cap(e.name)} hits ${t.name} for ${dmg} point${dmg > 1 ? 's' : ''} of damage.`, 'c-other'); hurt(t, dmg, e); }
        else addHate(t, e, 1);
      }
    }
  } else if (dist(e, P) > 4) stepToward(e, P.x, P.z, dist(e, P) > 40 ? 30 : 8.5, dt);
}

// ---------- interaction ----------
function setTarget(e) { P.target = e; dirty = true; }
function tabTarget() {
  const l = ents.filter(e => e.kind === 'mob' && !e.dead && dist(P, e) < 70 && W.los(P, e)).sort((a, b) => dist(P, a) - dist(P, b));
  if (!l.length) return; setTarget(l[(l.indexOf(P.target) + 1) % l.length]);
}
function consider() {
  const t = P.target; if (!t) return warn('You must first select a target.');
  if (t.kind === 'mob') { const [c, text] = conOf(t.lvl); msg(`${cap(t.name)} ${t.def.aggro ? 'glares at you threateningly' : 'pays you little mind'} -- ${text}.`, 'con-' + c); }
  else if (t.kind === 'npc') msg(`${t.name} nods to you -- you would not survive picking this fight.`, 'con-red');
  else msg('It is quite dead.', 'c-miss');
}
function interact(e) {
  if (P.dead) return;
  if (e.kind === 'npc') return hail(e);
  if (e.kind !== 'corpse' && e.kind !== 'pcorpse') return;
  if (dist(P, e) > 7) return warn('You are too far away to loot that corpse.');
  stand();
  if (e.kind === 'corpse') return openLoot(e);
  const k = e.k; k.inv = k.inv.filter(s => !addItem(s.id, s.n)); P.coin += k.coin; k.coin = 0;
  if (k.inv.length) return msg('Your bags are full. Some of your belongings remain on the corpse.', 'c-miss');
  P.corpses.splice(P.corpses.indexOf(k), 1); remove(e); msg('You recover your belongings.', 'c-loot'); dirty = true;
}
function hail(e) {
  if (!e || e.kind !== 'npc') return warn('There is no one to hail. Target a townsperson first.');
  if (dist(P, e) > 10) return warn('You are too far away.');
  const n = e.def, q = n.quest; msg(`You say, 'Hail, ${e.name}'`, 'c-say'); setTarget(e);
  if (q && countItem(q.item) >= q.n) {
    removeItem(q.item, q.n); say(e, q.done); P.coin += q.coin; msg(`You receive ${fmtCoin(q.coin)}.`, 'c-loot'); gainXp(q.xp);
    if (q.reward && !P.quest[q.reward] && addItem(q.reward)) { P.quest[q.reward] = 1; msg(`You receive ${ITEMS[q.reward].name}!`, 'c-loot'); }
    dirty = true; return;
  }
  say(e, q ? q.ask : n.say);
  if (n.sells) { shopNpc = e; $('shopname').textContent = e.name; openWin('shop'); openWin('inv'); }
}
function openLoot(e) {
  lootEnt = e; $('lootname').textContent = cap(e.name) + "'s corpse";
  if (e.coin) { P.coin += e.coin; msg(`You receive ${fmtCoin(e.coin)} from the corpse.`, 'c-loot'); snd(1000, .05, 'square', .02); e.coin = 0; }
  if (!e.loot.length) { msg('There is nothing left on the corpse.', 'c-miss'); e.decay = Math.min(e.decay, 20); lootEnt = null; return; }
  openWin('loot');
}
function takeLoot(i) {
  const e = lootEnt, id = e.loot[i]; if (!addItem(id)) return msg('Your bags are full.', 'c-miss');
  e.loot.splice(i, 1); msg(`You have looted ${ITEMS[id].name}.`, 'c-loot');
  if (!e.loot.length) { e.decay = Math.min(e.decay, 20); closeWin('loot'); }
  dirty = true;
}
function buy(id) {
  const it = ITEMS[id]; if (P.coin < it.val) return msg('You cannot afford that.', 'c-miss');
  if (!addItem(id)) return msg('Your bags are full.', 'c-miss');
  P.coin -= it.val; msg(`You buy ${it.name} for ${fmtCoin(it.val)}.`, 'c-loot'); snd(900, .05, 'square', .02);
}
function command(v) {
  if (v[0] !== '/') return msg(`You say, '${v}'`, 'c-say');
  const [c, a] = v.slice(1).toLowerCase().split(/\s+/);
  if (c === 'sit') sit(); else if (c === 'stand') stand(); else if (c === 'con' || c === 'consider') consider();
  else if (c === 'loc') msg(`Your location is ${(P.x / Z.cell).toFixed(1)}, ${(P.z / Z.cell).toFixed(1)}`);
  else if (c === 'time') msg(`It is ${clock()} in ${Z.name}.`);
  else if (c === 'who') msg(`There is 1 adventurer in ${Z.name}: [${P.lvl} ${CLASSES[P.cls].name}] ${P.name} (${RACES[P.race].name})`);
  else if (c === 'camp') { save(); msg('Your progress has been saved. It is safe to close the window.'); }
  else if (c === 'help') openWin('help');
  else if (c === 'pet') {
    const e = P.petE; if (!e) return msg('You have no pet.', 'c-miss');
    if (a === 'attack') { if (P.target && P.target.kind === 'mob') { e.tgt = P.target; addHate(P.target, e, 1); msg(`${cap(e.name)} moves to attack ${P.target.name}.`, 'c-other'); } else warn('You must first select a target.'); }
    else if (a === 'back') { e.tgt = null; msg(`${cap(e.name)} returns to your side.`, 'c-other'); }
    else if (a === 'dismiss') dismissPet(`${cap(e.name)} crumbles away.`);
    else msg('Usage: /pet attack, /pet back, /pet dismiss', 'c-miss');
  } else msg('That is not a valid command. Try /help.', 'c-miss');
}

// ---------- UI ----------
const el = (tag, cls, text) => { const d = document.createElement(tag); if (cls) d.className = cls; if (text !== undefined) d.textContent = text; return d; };
function openWin(id) { $(id).classList.remove('hidden'); dirty = true; }
function closeWin(id) { $(id).classList.add('hidden'); if (id === 'shop') shopNpc = null; if (id === 'loot') lootEnt = null; }
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
    d.onclick = () => castGem(i); d.oncontextmenu = ev => { ev.preventDefault(); P.gems[i] = null; dirty = true; };
    g.append(d);
  });
  $('b-attack').classList.toggle('on', P.autoAtk); $('b-sit').textContent = P.sitting ? 'Stand (X)' : 'Sit (X)';
  const t = P.target; $('twin').classList.toggle('hidden', !t);
  if (t) { $('tname').textContent = cap(t.name) + (t.kind === 'corpse' ? "'s corpse" : ''); $('tname').className = t.kind === 'mob' ? 'con-' + conOf(t.lvl)[0] : ''; }
  if (isOpen('inv')) {
    const eq = $('eqslots'); eq.textContent = '';
    SLOTS.forEach(sl => { const it = ITEMS[P.eq[sl]], d = el('div'); d.append(el('b', '', cap(sl)), it ? it.name : '-'); if (it) { d.title = itemTip(it); d.onclick = () => unequip(sl); } eq.append(d); });
    const bag = $('bag'); bag.textContent = '';
    P.inv.forEach((s, i) => { const d = el('div', 'slot', s ? ITEMS[s.id].name : ''); if (s) { d.title = itemTip(ITEMS[s.id]); if (s.n > 1) d.append(el('em', '', s.n)); d.onclick = () => clickBag(i); } bag.append(d); });
    $('coin').textContent = 'Coin: ' + fmtCoin(P.coin);
    const s = P.st, w = weapon();
    $('stats').textContent = `${RACES[P.race].name} ${CLASSES[P.cls].name}\nLevel ${P.lvl}\nXP  ${Math.floor(P.xp / need(P.lvl) * 100)}%\n\nHP   ${Math.ceil(P.hp)}/${P.maxhp}\nMana ${Math.floor(P.mana)}/${P.maxmana}\nAC   ${P.ac}\nATK  ${w.dmg}/${w.delay}\n\nSTR ${s.str}  STA ${s.sta}\nAGI ${s.agi}  INT ${s.int}\nWIS ${s.wis}\n\n` +
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
  if (lootEnt) { const l = $('lootlist'); l.textContent = ''; lootEnt.loot.forEach((id, i) => { const d = el('div', 'row', ITEMS[id].name); d.title = itemTip(ITEMS[id]); d.onclick = () => takeLoot(i); l.append(d); }); }
  if (shopNpc) {
    const l = $('shoplist'), n = shopNpc.def; l.textContent = '';
    let stock = n.sells; if (n.classes) stock = stock.filter(id => SPELLS[ITEMS[id].spell].cls === P.cls);
    if (!stock.length) l.append(el('div', 'hint', n.classes ? 'This guild has nothing to teach you.' : 'Nothing for sale, but your goods are welcome.'));
    stock.forEach(id => {
      const it = ITEMS[id], sp = SPELLS[it.spell], known = sp && P.book.includes(sp.id), d = el('div', 'row' + (known || canUse(it) || (sp && sp.lvl > P.lvl) ? ' dim' : ''));
      d.append(el('span', '', it.name + (sp ? `  (Lv ${sp.lvl})` : '')), el('small', '', known ? 'known' : fmtCoin(it.val))); d.title = itemTip(it); if (!known) d.onclick = () => buy(id); l.append(d);
    });
  }
  renderBuffs();
}
function renderBuffs() {
  const b = $('buffs'); b.textContent = '';
  if (P.sitting) b.append(el('div', 'buff', 'Resting'));
  if (P.feign) b.append(el('div', 'buff', 'Playing dead'));
  P.buffs.forEach(f => b.append(el('div', 'buff', `${f.name} ${f.t > 90 ? Math.ceil(f.t / 60) + 'm' : Math.ceil(f.t) + 's'}`)));
}
const setW = (id, f) => { $(id).style.width = clamp(f * 100, 0, 100) + '%'; };
function clock() { const h = Math.floor(P.time / 60), m = Math.floor(P.time % 60); return `${(h + 11) % 12 + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; }
function hud(dt) {
  setW('hpbar', P.hp / P.maxhp); $('hptxt').textContent = `${Math.max(0, Math.ceil(P.hp))} / ${P.maxhp}`;
  $('mpbar').parentElement.classList.toggle('hidden', !P.maxmana);
  if (P.maxmana) { setW('mpbar', P.mana / P.maxmana); $('mptxt').textContent = `${Math.floor(P.mana)} / ${P.maxmana}`; }
  setW('xpbar', P.lvl >= MAXLVL ? 1 : P.xp / need(P.lvl));
  const t = P.target; if (t && t.maxhp) setW('thp', t.kind === 'corpse' ? 0 : t.hp / t.maxhp);
  const c = P.casting; $('castbar').classList.toggle('hidden', !c); if (c) { setW('castfill', c.t / c.sp.cast); $('castname').textContent = c.sp.name; }
  for (const [u, id] of gemEls) { const cd = P.gemCd[id] || 0; u.style.width = cd > 0 ? clamp(cd / (P.gemMax[id] || 1) * 100, 0, 100) + '%' : '0'; }
  $('petrow').classList.toggle('hidden', !P.petE); if (P.petE) { $('petname').textContent = cap(P.petE.name); setW('petbar', P.petE.hp / P.petE.maxhp); }
  if ((hudT -= dt) <= 0) {
    hudT = .5; renderBuffs();
    const a = ((-P.yaw * 180 / Math.PI) % 360 + 360) % 360;
    $('zoneinfo').textContent = `${Z.name}  |  ${clock()}  |  ${['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(a / 45) % 8]}`;
  }
}

// ---------- input ----------
const acts = {
  attack() { P.autoAtk = !P.autoAtk; if (P.autoAtk) stand(); msg(P.autoAtk ? 'Auto attack is on.' : 'Auto attack is off.', 'c-miss'); dirty = true; },
  sit() { P.sitting ? stand() : sit(); }, inv() { toggleWin('inv'); }, book() { toggleWin('book'); pickSpell = null; }, con: consider,
  hail() { let t = P.target; if (!t || t.kind !== 'npc') t = ents.filter(e => e.kind === 'npc' && dist(P, e) < 10).sort((a, b) => dist(P, a) - dist(P, b))[0]; hail(t); },
  help() { toggleWin('help'); },
};
const KEYMAP = { KeyF: 'attack', Backquote: 'attack', KeyX: 'sit', KeyI: 'inv', KeyB: 'book', KeyC: 'con', KeyH: 'hail' };
addEventListener('keydown', e => {
  if (!P || !$('create').classList.contains('hidden')) return;
  const inp = document.activeElement === $('cmd');
  if (e.code === 'Enter') { e.preventDefault(); if (inp) { const v = $('cmd').value.trim(); $('cmd').value = ''; $('cmd').blur(); if (v) command(v); } else $('cmd').focus(); return; }
  if (inp) { if (e.code === 'Escape') $('cmd').blur(); return; }
  if (e.code === 'Slash') { $('cmd').focus(); return; }
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
  if (e.repeat || loading) return;
  keys[e.code] = true;
  if (e.code === 'Tab') tabTarget();
  else if (e.code === 'Escape') { if (pickSpell) pickSpell = null; else if (['loot', 'shop', 'inv', 'book', 'help'].some(isOpen)) ['loot', 'shop', 'inv', 'book', 'help'].forEach(closeWin); else P.target = null; dirty = true; }
  else if (e.code === 'KeyR') P.autorun = !P.autorun;
  else if (/^Digit[1-8]$/.test(e.code)) castGem(+e.code[5] - 1);
  else if (KEYMAP[e.code]) acts[KEYMAP[e.code]]();
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
$('btns').onclick = e => { const a = e.target.dataset.act; if (a && P && !P.dead) acts[a](); e.target.blur(); };
document.querySelectorAll('[data-close]').forEach(x => x.onclick = () => closeWin(x.dataset.close));
const ray = new THREE.Raycaster(); ray.far = 140;
function pick(cx, cy) {
  ray.setFromCamera(new THREE.Vector2(cx / innerWidth * 2 - 1, -(cy / innerHeight) * 2 + 1), camera);
  for (const h of ray.intersectObjects(ents.map(e => e.model), true)) { let o = h.object; while (o && !o.userData.ent) o = o.parent; if (o) return o.userData.ent; }
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
  setTarget(ent); if (d.b === 2) interact(ent);
});
canvas.addEventListener('contextmenu', e => e.preventDefault());

// ---------- main loop ----------
function updPlayer(dt) {
  if (P.dead) return;
  const k = keys, stuck = has(P, 'root') || has(P, 'stun');
  P.yaw += ((k.KeyA || k.ArrowLeft ? 1 : 0) - (k.KeyD || k.ArrowRight ? 1 : 0)) * 2.3 * dt;
  let f = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0); const s = (k.KeyE ? 1 : 0) - (k.KeyQ ? 1 : 0);
  if (f < 0) P.autorun = false; if (P.autorun && !f) f = 1;
  if ((f || s) && !stuck) {
    stand();
    let sp = 7 * (1 + P.st.speed) * (1 - fxv(P, 'snare')); if (f < 0) sp *= .55; if (W.cellAt(P.x, P.z) === '~') sp *= .6;
    const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw); let dx = fx * f - fz * s, dz = fz * f + fx * s; const l = Math.hypot(dx, dz); dx /= l; dz /= l;
    [P.x, P.z] = W.slide(P.x, P.z, P.x + dx * sp * dt, P.z + dz * sp * dt, .6);
  }
  if (k.Space && P.yoff === 0 && !stuck) { stand(); P.vy = 6.5; }
  P.yoff += P.vy * dt; P.vy -= 19 * dt; if (P.yoff <= 0) { P.yoff = 0; P.vy = 0; }
  const ch = W.cellAt(P.x, P.z);
  if (ch >= '0' && ch <= '9' && Z.lines[ch]) { const l = Z.lines[ch]; enterZone(l.to, l); }
}
function light() {
  const h = P.time / 60, L = Z.outdoor ? clamp(Math.sin((h - 6) / 14 * Math.PI) * 1.8, 0, 1) : 0;
  const vis = RACES[P.race].vision, lo = Z.outdoor ? (vis ? .34 : .16) : (vis ? .4 : .24);
  amb.intensity = (lo + L * (.72 - lo)) * Math.PI; amb.color.copy(cAmbN).lerp(cWhite, Z.outdoor ? L : .5);
  sun.intensity = L * 1.5;
  torch.intensity = Z.outdoor ? (1 - L) * 5 : 8; torch.position.copy(camera.position);
  scene.background.copy(cNight).lerp(cDay.set(Z.sky), Z.outdoor ? L : 1); scene.fog.color.copy(scene.background);
  scene.fog.near = Z.fog[0]; scene.fog.far = Z.fog[1] * (Z.outdoor ? .5 + .5 * L : 1);
}
function update(dt) {
  T += dt; P.time = (P.time + dt / 1.5) % 1440;
  updPlayer(dt); if (loading) return;
  updCast(dt); playerSwing(dt); updBuffs(P, dt);
  for (const k in P.gemCd) if (P.gemCd[k] > 0) P.gemCd[k] -= dt;
  const fc = Math.floor(P.z / Z.cell) * Z.W + Math.floor(P.x / Z.cell); if (fc !== flowCell) { flowCell = fc; W.flow(P.x, P.z); }
  for (const e of ents.slice()) {
    if (e.gone) continue;
    if (e.kind === 'mob') { updBuffs(e, dt); updMob(e, dt); }
    else if (e.kind === 'pet') updPet(e, dt);
    else if (e.kind === 'npc') { if (e.def.guard) updGuard(e, dt); else if (dist(e, P) < 10) e.yaw = Math.atan2(P.x - e.x, P.z - e.z); }
    else if (e.kind === 'corpse' && (e.decay -= dt) <= 0) { remove(e); continue; }
    if (e.gone) continue;
    if (e.swing > 0) e.swing = Math.max(0, e.swing - dt * 3);
    place(e); if (!e.lying) animModel(e.model, T + e.x, e.moving, e.swing || 0);
  }
  for (const sp of spawns) if (!sp.e && (sp.t -= dt) <= 0) spawnMob(sp);
  if ((tickT += dt) >= 6) { tickT -= 6; tick(); }
  if (shopNpc && dist(P, shopNpc) > 12) closeWin('shop');
  if (lootEnt && dist(P, lootEnt) > 9) closeWin('loot');
  if ((saveT += dt) > 20) { saveT = 0; save(); }
}
function tick() {
  if (!P.dead) {
    const L = P.lvl, s = P.st;
    P.hp = clamp(P.hp + (P.sitting ? 2 + Math.floor(L / 3) : 1 + Math.floor(L / 10)) + s.regen, 1, P.maxhp);
    if (P.maxmana) { if (P.sitting && P.mana < P.maxmana) skillUp('med', .25); P.mana = Math.min(P.maxmana, P.mana + (P.sitting ? 3 + Math.floor(L / 2) + Math.floor((P.skills.med || 0) / 15) : 1) + s.mregen); }
  }
  for (const e of ents.slice()) {
    if (e.dead || e.gone) continue;
    if (e.kind === 'mob') for (const b of e.buffs.slice()) if (b.dot && !e.dead) { msg(`${cap(e.name)} has taken ${b.dot} damage from your ${b.name}.`, 'c-dmg'); hurt(e, b.dot, P); }
    if (e.kind === 'pet') e.hp = Math.min(e.maxhp, e.hp + Math.ceil(e.maxhp * .04));
  }
}
const clk = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(.1, clk.getDelta());
  if (!P || !W) return;
  if (!loading) update(dt);
  if (loading || !W) return;
  camera.position.set(P.x, W.heightAt(P.x, P.z) + (P.dead || P.feign ? .35 : P.sitting ? .95 : 1.7) + P.yoff, P.z);
  camera.rotation.set(P.pitch, P.yaw, P.dead ? .6 : 0);
  light(); hud(dt); if (dirty) refresh();
  renderer.render(scene, camera);
}

// ---------- character creation ----------
function startGame(first) {
  $('create').classList.add('hidden'); $('ui').classList.remove('hidden'); recalc();
  const c = ZONES[P.zone].cell;
  enterZone(P.zone, first ? ZONES.city.start : { x: P.x / c, y: P.z / c, yaw: P.yaw }, true);
  msg(first ? `Welcome to Lanternhold, ${P.name}. Press Enter and type /help, or click Help.` : `Welcome back, ${P.name}.`);
  if (first) { msg('The east gate leads to the Gloamwood. Consider (C) a creature before you fight it.'); openWin('help'); }
}
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
  const sv = loadSave();
  if (sv && CLASSES[sv.cls] && ZONES[sv.zone]) {
    $('cont').classList.remove('hidden'); $('cont').textContent = `Continue as ${sv.name}, level ${sv.lvl} ${CLASSES[sv.cls].name}`;
    $('cont').onclick = () => { P = sv; initRuntime(); startGame(false); };
  }
  $('enter').onclick = () => {
    const name = ($('cname').value.trim().replace(/[^A-Za-z' -]/g, '') || 'Wayfarer').slice(0, 14);
    if (sv && !confirm('Starting a new character replaces your saved one. Continue?')) return;
    newPlayer(cap(name), race, cls); startGame(true);
  };
})();
addEventListener('beforeunload', save);
frame();

// Handles for debugging from the browser console.
window.G = { get P() { return P; }, get ents() { return ents; }, get Z() { return Z; }, get W() { return W; }, enterZone, gainXp, addItem, castGem, setTarget, interact, hail, recalc, need, kill, hurt };
