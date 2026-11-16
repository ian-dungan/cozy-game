// Authoritative world simulation: zones, monsters, combat, spells, loot, groups.
import { RACES, CLASSES, SPELLS, ITEMS, MOBS, PETS, SKILLS, TIERS } from '../js/data.js';
import { ZONES } from '../js/zones.js';
import { makeGrid } from '../js/grid.js';

const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const cap = s => s[0].toUpperCase() + s.slice(1);
const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;
const MAXLVL = 20, SLOTS = ['primary', 'secondary', 'head', 'chest', 'legs', 'hands', 'feet', 'neck', 'ring'], DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const KEEP = ['name', 'race', 'cls', 'lvl', 'xp', 'hp', 'mana', 'x', 'z', 'yaw', 'zone', 'coin', 'inv', 'eq', 'book', 'gems', 'skills', 'corpses', 'quest', 'pet'];
const CLS_COL = { bulwark: 0x8a8f9a, brawler: 0xa86a3a, prowler: 0x33333a, warden: 0x3f6a3a, mender: 0xe0d8c0, stormcaller: 0x3a4a9a, hexwright: 0x5a2a6a, lullsinger: 0xb04a8a };
const RACE_LOOK = { human: { s: 1 }, elf: { s: .96, skin: 0xf0d0b0 }, dwarf: { s: .8, skin: 0xc89070 }, smallfolk: { s: .7 }, ogrekin: { s: 1.25, skin: 0x9aa080 } };

let T = 0, time = 9 * 60, nextId = 1, tickT = 0;
const zones = {};
export const online = new Map();   // lowercase name -> player
for (const id in ZONES) zones[id] = { id, Z: ZONES[id], G: makeGrid(ZONES[id]), ents: new Map(), players: new Set(), spawns: [], adds: [], rms: [] };

// ---------- messaging ----------
const tell = (p, t, c = 'c-sys') => { if (p.kind === 'player') p.out.push([t, c]); };
function warn(p, t) { if (T - (p.warnAt[t] ?? -9) > 2.5) { p.warnAt[t] = T; tell(p, t, 'c-miss'); } }
function around(e, t, c = 'c-other', except, range = 45) { for (const q of e.zn.players) if (q !== except && dist(q, e) < range) tell(q, t, c); }
const fmtCoin = c => [[1000, 'p'], [100, 'g'], [10, 's'], [1, 'c']].map(([v, n]) => { const k = Math.floor(c / v); c -= k * v; return k ? k + n : ''; }).filter(Boolean).join(' ') || '0c';
const npcSay = (p, e, t) => tell(p, `${e.name} says, '${t}'`, 'c-npc');

// ---------- entities ----------
const hpPct = e => e.maxhp ? clamp(Math.ceil(e.hp / e.maxhp * 100), 0, 100) : 0;
const flags = e => (e.sitting ? 1 : 0) | (e.lying || e.feign || e.dead ? 2 : 0);
const desc = e => ({ id: e.id, k: e.kind, n: e.name, l: e.lvl, m: e.model, x: r1(e.x), z: r1(e.z), y: r2(e.yaw), h: hpPct(e), f: flags(e), c: e.color, ag: e.def && e.def.aggro ? 1 : 0, npc: e.npcI });
function addEnt(zn, e) { e.id = nextId++; e.zn = zn; e.gone = false; e.sig = ''; zn.ents.set(e.id, e); zn.adds.push(e); return e; }
function remEnt(e) {
  if (e.gone) return; e.gone = true; const zn = e.zn; zn.ents.delete(e.id); zn.rms.push(e.id);
  for (const q of zn.players) { if (q.target === e) q.target = null; if (q.lootEnt === e) q.lootEnt = null; if (q.shop === e) q.shop = null; }
}
const isNight = () => time < 6 * 60 || time >= 20 * 60;
const mobHp = l => 14 + l * 9 + l * l * 1.2;
function spawnMob(zn, sp, initial) {
  const s = sp.s; let id = s.m; if (s.rare && Math.random() < s.rare[1]) id = s.rare[0];
  const def = MOBS[id], c = zn.G.c;
  if (def.night && !isNight()) { sp.t = 30; return; }
  let x, z, tries = 0;
  do { const a = Math.random() * 6.28, r = Math.random() * s.r * c; x = (s.at[0] + .5) * c + Math.cos(a) * r; z = (s.at[1] + .5) * c + Math.sin(a) * r; } while (++tries < 30 && !zn.G.free(x, z, 1));
  if (!zn.G.free(x, z, 1)) { sp.t = 10; return; }
  if (!initial) for (const q of zn.players) if (Math.hypot(x - q.x, z - q.z) < 14) { sp.t = 5; return; }
  const lvl = rnd(def.lv[0], def.lv[1]);
  const e = { kind: 'mob', def, name: def.name, lvl, model: def.model, color: def.named ? '#ffd0a0' : '#e8e0d0', x, z, yaw: Math.random() * 6.28, r: .45 * (def.model[1].s || 1) + .15,
    buffs: [], hate: new Map(), dmg: new Map(), home: { x, z }, sp, atkT: 0, wt: Math.random() * 8, cd: rnd(3, 8), wp: 0, swingN: 0 };
  e.maxhp = e.hp = Math.round(mobHp(lvl) * (def.hp || 1)); sp.e = e; addEnt(zn, e);
}
function addPCorpse(owner, k) {
  const zn = zones[k.zone]; if (!zn) return;
  addEnt(zn, { kind: 'pcorpse', name: `${owner}'s corpse`, owner, k, x: k.x, z: k.z, yaw: 0, r: .5, lvl: 0, lying: true, buffs: [], model: ['human', { top: 0x5a5a6a }], color: '#f0e070' });
}
export function init(allChars) {
  for (const zn of Object.values(zones)) {
    const c = zn.G.c;
    zn.Z.npcs.forEach((n, i) => {
      const [x, y] = typeof n.at === 'string' ? zn.Z.marks[n.at] : [n.at[0] + .5, n.at[1] + .5];
      addEnt(zn, { kind: 'npc', def: n, npcI: i, name: n.name, lvl: 30, model: n.model, color: '#a8d8ff', x: x * c, z: y * c, yaw: 0, hp: 9999, maxhp: 9999, r: .5, buffs: [], hate: new Map(), home: { x: x * c, z: y * c }, atkT: 0, swingN: 0 });
    });
    zn.Z.spawns.forEach(s => { for (let i = 0; i < s.n; i++) { const sp = { s, e: null, t: 0 }; zn.spawns.push(sp); spawnMob(zn, sp, true); } });
  }
  for (const d of allChars) (d.corpses || []).forEach(k => addPCorpse(d.name, k));
}

// ---------- players ----------
export function newChar(name, race, cls) {
  const d = { name, race, cls, lvl: 1, xp: 0, hp: 1, mana: 0, x: 0, z: 0, yaw: 0, zone: 'city', coin: 25, inv: Array(16).fill(null), eq: {}, book: [], gems: Array(8).fill(null), skills: {}, corpses: [], quest: {}, pet: null, fresh: true };
  CLASSES[cls].start.forEach(id => { d.eq[ITEMS[id].slot] = id; });
  return d;
}
export const dataOf = p => { const o = {}; KEEP.forEach(k => o[k] = p[k]); return o; };
export function join(d, send) {
  const look = RACE_LOOK[d.race];
  const p = { ...d, kind: 'player', r: .5, buffs: [], gemCd: {}, target: null, casting: null, autoAtk: false, sitting: false, feign: false, dead: false, swingAt: 0, petE: null, out: [], send, lastMe: '', warnAt: {}, group: null, swingN: 0, zseq: 0, color: '#9ad0ff',
    model: ['human', { top: CLS_COL[d.cls], bot: 0x3a3630, ...look }] };
  learnLevel(p, true); recalc(p);
  const c = ZONES[p.zone].cell, st = ZONES.city.start;
  if (d.fresh) { p.hp = p.maxhp; p.mana = p.maxmana; enterZone(p, 'city', st); tell(p, `Welcome to Lanternhold, ${p.name}. Click Help to learn the ropes.`); tell(p, 'The east gate leads to the Gloamwood. Consider (C) a creature before you fight it.'); }
  else { p.hp = clamp(p.hp, 1, p.maxhp); enterZone(p, p.zone, { x: p.x / c, y: p.z / c, yaw: p.yaw }); tell(p, `Welcome back, ${p.name}.`); }
  online.set(p.name.toLowerCase(), p);
  for (const q of online.values()) if (q !== p) tell(q, `${p.name} has entered the world.`, 'c-other');
  return p;
}
export function leave(p) {
  online.delete(p.name.toLowerCase()); leaveGroup(p);
  if (p.petE) { remEnt(p.petE); p.petE = null; }
  for (const e of p.zn.ents.values()) if (e.hate) e.hate.delete(p);
  p.zn.players.delete(p); remEnt(p); p.send = null;
  for (const q of online.values()) tell(q, `${p.name} has left the world.`, 'c-other');
}
function enterZone(p, id, at) {
  if (p.zn) {
    if (p.petE) { remEnt(p.petE); p.petE = null; }
    for (const e of p.zn.ents.values()) if (e.hate) e.hate.delete(p);
    p.zn.players.delete(p); remEnt(p);
  }
  const zn = zones[id], c = zn.G.c;
  p.zone = id; p.x = at.x * c; p.z = at.y * c; p.yaw = (at.yaw || 0) + .03; p.target = null; p.casting = null; p.lootEnt = null; p.shop = null; p.zseq++;
  addEnt(zn, p); zn.players.add(p);
  if (p.pet) summonPet(p, p.pet.k, p.pet.lvl, true);
  p.send(JSON.stringify({ t: 'zone', zone: id, q: p.zseq, x: p.x, z: p.z, yaw: p.yaw, T, tm: time, ents: [...zn.ents.values()].map(desc), me: meState(p) }));
  p.lastMe = ''; tell(p, `You have entered ${zn.Z.name}.`);
}
function meState(p) {
  return { id: p.id, name: p.name, race: p.race, cls: p.cls, lvl: p.lvl, xp: p.xp, hp: Math.max(0, Math.ceil(p.hp)), maxhp: p.maxhp, mana: Math.floor(p.mana), maxmana: p.maxmana, ac: p.ac, st: p.st, coin: p.coin,
    inv: p.inv, eq: p.eq, book: p.book, gems: p.gems, skills: p.skills, buffs: p.buffs.map(b => ({ n: b.name, e: r1(b.end) })), cd: p.gemCd,
    casting: p.casting && { n: p.casting.sp.name, s: r2(p.casting.start), e: r2(p.casting.end) }, target: p.target && p.target.id, autoAtk: p.autoAtk, sitting: p.sitting, feign: p.feign, dead: p.dead,
    pet: p.petE && { n: p.petE.name, h: hpPct(p.petE) }, loot: p.lootEnt && { id: p.lootEnt.id, n: p.lootEnt.name, items: p.lootEnt.loot }, shop: p.shop && p.shop.id,
    group: p.group && p.group.m.filter(q => q !== p).map(q => ({ n: q.name, l: q.lvl, c: q.cls, h: hpPct(q), z: q.zn.Z.name })) };
}
function recalc(p) {
  const C = CLASSES[p.cls], s = { str: 10, sta: 10, agi: 10, int: 10, wis: 10, ac: 0, hp: 0, mana: 0, haste: 0, regen: 0, mregen: 0, ds: 0, speed: 0 };
  const mods = RACES[p.race].mods; for (const k in mods) s[k] += mods[k];
  for (const sl of SLOTS) { const it = ITEMS[p.eq[sl]]; if (it) for (const k in s) if (it[k]) s[k] += it[k]; }
  for (const b of p.buffs) if (b.stats) for (const k in b.stats) { if (k === 'haste' || k === 'speed') s[k] = Math.max(s[k], b.stats[k]); else s[k] += b.stats[k]; }
  p.st = s;
  p.maxhp = Math.round(20 + p.lvl * C.hp + (s.sta - 10) * p.lvl * .3 + s.hp);
  p.maxmana = C.cast ? Math.round(p.lvl * C.mp + s[C.cast] * (1 + p.lvl / 4) + s.mana) : 0;
  p.ac = s.ac + Math.floor(s.agi / 3);
  p.hp = Math.min(p.hp, p.maxhp); p.mana = Math.min(p.mana, p.maxmana);
}
function learn(p, id, silent) {
  if (p.book.includes(id)) return;
  p.book.push(id); const i = p.gems.indexOf(null); if (i >= 0) p.gems[i] = id;
  if (!silent) tell(p, `You have learned ${SPELLS[id].name}!`, 'c-spell');
}
function learnLevel(p, silent) { Object.values(SPELLS).filter(s => s.cls === p.cls && s.lvl <= p.lvl && (s.abil || s.lvl === 1)).forEach(s => learn(p, s.id, silent)); }
function skillUp(p, k, ch) { const v = p.skills[k] || 0; if (v < p.lvl * 5 + 5 && Math.random() < ch) { p.skills[k] = v + 1; tell(p, `You have become better at ${SKILLS[k]}! (${v + 1})`, 'c-skill'); } }
const need = n => Math.round(150 * n * n * (1 + n / 10));
function gainXp(p, xp) {
  if (p.lvl >= MAXLVL || xp <= 0) return;
  p.xp += xp; tell(p, 'You gain experience!');
  while (p.lvl < MAXLVL && p.xp >= need(p.lvl)) {
    p.xp -= need(p.lvl); p.lvl++; recalc(p);
    tell(p, `You have gained a level! Welcome to level ${p.lvl}!`, 'c-ding'); around(p, `${p.name} has gained a level!`, 'c-sys', p, 200);
    learnLevel(p);
    if (Object.values(SPELLS).some(s => s.cls === p.cls && s.lvl === p.lvl && !s.abil)) tell(p, 'New scrolls await you at your guild in Lanternhold.', 'c-spell');
  }
}
function xpMod(p, l) {
  const d = l - p.lvl, gr = p.lvl < 8 ? -4 : p.lvl < 16 ? -6 : -8;
  return d >= 3 ? 1.2 : d >= 1 ? 1.1 : d === 0 ? 1 : d > gr + 1 ? 1 + d * .06 : d > gr ? .4 : 0;
}
function sit(p) { if (p.dead || p.casting) return; p.sitting = true; p.feign = false; p.autoAtk = false; }
function stand(p) { p.sitting = false; p.feign = false; }
function breakInvis(p) { if (has(p, 'invis')) { p.buffs = p.buffs.filter(b => !b.invis); tell(p, 'You are visible again.', 'c-spell'); } }

// ---------- inventory ----------
function addItem(p, id, n = 1) {
  if (ITEMS[id].stack) { const s = p.inv.find(s => s && s.id === id); if (s) { s.n += n; return true; } }
  const i = p.inv.indexOf(null); if (i < 0) return false;
  p.inv[i] = { id, n }; return true;
}
const countItem = (p, id) => p.inv.reduce((a, s) => a + (s && s.id === id ? s.n : 0), 0);
function removeItem(p, id, n) { p.inv.forEach((s, i) => { if (s && s.id === id && n > 0) { const k = Math.min(n, s.n); s.n -= k; n -= k; if (!s.n) p.inv[i] = null; } }); }
function canUse(p, it) {
  const C = CLASSES[p.cls];
  if (it.dmg && !C.weps.includes(it.wt)) return `A ${C.name} cannot wield that.`;
  if (it.arm !== undefined && it.arm > C.armor) return `A ${C.name} cannot wear ${TIERS[it.arm].toLowerCase()} armor.`;
  return null;
}
function clickBag(p, i) {
  const s = p.inv[i]; if (!s) return; const it = ITEMS[s.id];
  if (p.shop) {
    if (!it.val) return npcSay(p, p.shop, 'I have no use for that.');
    const v = Math.max(1, Math.floor(it.val * .4)); p.coin += v; if (--s.n <= 0) p.inv[i] = null;
    tell(p, `You sell ${it.name} for ${fmtCoin(v)}.`, 'c-coin');
  } else if (it.slot === 'scroll') {
    const sp = SPELLS[it.spell];
    if (sp.cls !== p.cls) return tell(p, 'You cannot make sense of this scroll.', 'c-miss');
    if (p.lvl < sp.lvl) return tell(p, `You are not yet experienced enough to scribe this. (Level ${sp.lvl})`, 'c-miss');
    if (p.book.includes(sp.id)) return tell(p, 'You already know this spell.', 'c-miss');
    p.inv[i] = null; tell(p, `You scribe ${sp.name} into your spellbook.`, 'c-spell'); learn(p, sp.id, true);
  } else if (it.slot === 'misc') tell(p, 'You cannot use that. A merchant might buy it.', 'c-miss');
  else {
    const why = canUse(p, it); if (why) return tell(p, why, 'c-miss');
    const old = p.eq[it.slot]; p.eq[it.slot] = it.id; p.inv[i] = old ? { id: old, n: 1 } : null; recalc(p); tell(p, `You equip ${it.name}.`, 'c-loot');
  }
}

// ---------- effects ----------
const has = (e, k) => e.buffs.some(b => b[k]);
const fxv = (e, k) => e.buffs.reduce((m, b) => Math.max(m, b[k] || 0), 0);
function addBuff(e, id, name, t, o) { e.buffs = e.buffs.filter(b => b.id !== id); e.buffs.push({ id, name, end: T + t, ...o }); if (e.kind === 'player') recalc(e); }
function updBuffs(e) {
  for (let i = e.buffs.length - 1; i >= 0; i--) if (e.buffs[i].end <= T) {
    const b = e.buffs.splice(i, 1)[0]; if (e.kind === 'player') { tell(e, `Your ${b.name} fades.`, 'c-spell'); recalc(e); }
  }
}
function addHate(m, src, amt, noAssist) {
  if (m.kind !== 'mob' || m.dead) return;
  const first = !m.hate.size; m.hate.set(src, (m.hate.get(src) || 0) + amt);
  if (first && !noAssist && m.def.social) for (const o of m.zn.ents.values()) if (o.kind === 'mob' && o !== m && !o.dead && o.def.social === m.def.social && !o.hate.size && dist(o, m) < 18) addHate(o, src, 1, true);
}
const ownerOf = e => e.kind === 'player' ? e : e.kind === 'pet' ? e.owner : null;
function hurt(t, amt, src) {
  if (t.dead || t.gone) return;
  t.hp -= amt; if (t.buffs.length) t.buffs = t.buffs.filter(b => !b.mez);
  if (t.kind === 'mob') { addHate(t, src, amt); const o = ownerOf(src); if (o) t.dmg.set(o, (t.dmg.get(o) || 0) + amt); }
  else if (t.kind === 'player') {
    stand(t); if (!t.target && src.kind === 'mob') t.target = src;
    if (t.casting) { if (Math.random() < .3) { tell(t, 'Your spell is interrupted.', 'c-spell'); t.casting = null; } else warn(t, 'You regain your concentration.'); }
  }
  if (t.hp <= 0) kill(t, src);
}
function kill(e, src) {
  if (e.kind === 'player') return die(e, src);
  e.dead = true;
  if (e.kind === 'mob') {
    let killer = null, top = 0, total = 0; for (const [q, d] of e.dmg) { total += d; if (d > top && q.zn === e.zn && q.send) { top = d; killer = q; } }
    if (total < e.maxhp * .4) killer = null;   // guards did most of the work: no credit
    const k = ownerOf(src);
    for (const q of e.zn.players) if (dist(q, e) < 60) tell(q, q === k ? `You have slain ${e.name}!` : `${cap(e.name)} has been slain by ${src.name}!`);
    e.rights = new Set(); e.freeAt = T + 120;
    if (killer) {
      const mem = (killer.group ? killer.group.m : [killer]).filter(q => q.zn === e.zn && !q.dead && dist(q, e) < 150), n = mem.length || 1;
      const base = (15 * e.lvl * e.lvl + 10) * (e.def.named ? 2 : 1) * (1 + .2 * (n - 1)) / n;
      for (const q of mem) { gainXp(q, Math.round(base * xpMod(q, e.lvl))); e.rights.add(q.name); }
      e.rights.add(killer.name);
    }
    const d = e.def; e.kind = 'corpse'; e.name = `${e.name}'s corpse`; e.color = '#9a9a9a'; e.lying = true; e.hate.clear(); e.buffs = []; e.casting = null;
    e.loot = (d.loot || []).filter(([, p]) => Math.random() < p).map(([id]) => id);
    e.coin = d.coin ? rnd(e.lvl, e.lvl * e.lvl * 3 + e.lvl * 4) : 0;
    e.decay = e.loot.length || e.coin ? 200 : 45;
    e.sp.e = null; e.sp.t = e.zn.Z.respawn * (e.sp.s.slow || 1) * (.8 + Math.random() * .4);
    e.zn.adds.push(e);
  } else if (e.kind === 'pet') { tell(e.owner, `${cap(e.name)} has been slain by ${src.name}!`, 'c-hit'); e.owner.petE = null; e.owner.pet = null; remEnt(e); }
}
function die(p, src) {
  p.dead = true; p.hp = 0; p.autoAtk = false; p.casting = null; p.sitting = false; p.feign = false; p.buffs = []; p.target = null; p.lootEnt = null; p.shop = null;
  tell(p, `You have been slain by ${src.name}!`, 'c-dead'); around(p, `${p.name} has been slain by ${src.name}!`, 'c-hit', p, 200);
  if (p.lvl >= 5) {
    p.xp = Math.max(0, p.xp - Math.round(need(p.lvl) * .08)); tell(p, 'You have lost experience.', 'c-hit');
    if (p.inv.some(Boolean) || p.coin) {
      const k = { zone: p.zone, x: p.x, z: p.z, inv: p.inv.filter(Boolean), coin: p.coin };
      p.corpses.push(k); addPCorpse(p.name, k); p.inv = Array(16).fill(null); p.coin = 0;
      tell(p, `Your belongings remain with your corpse in ${p.zn.Z.name}.`, 'c-hit');
    }
  }
  if (p.petE) { remEnt(p.petE); p.petE = null; p.pet = null; }
  recalc(p); p.respawnAt = T + 4;
}
function summonPet(p, k, lvl, quiet) {
  if (p.petE) remEnt(p.petE);
  const d = PETS[k], e = { kind: 'pet', def: d, owner: p, name: `${p.name}'s ${d.name.replace(/^a /, '')}`, lvl, model: d.model, color: '#a8e8a8', yaw: 0, r: .5, buffs: [], atkT: 0, swingN: 0 };
  [e.x, e.z] = p.zn.G.slide(p.x, p.z, p.x + 1.5, p.z + 1.5, .5);
  e.maxhp = e.hp = Math.round(mobHp(lvl) * d.hp * .8); p.pet = { k, lvl }; p.petE = e; addEnt(p.zn, e);
  if (!quiet) tell(p, `${cap(d.name)} rises to serve you.`, 'c-spell');
}

// ---------- melee ----------
function weapon(p) {
  const it = ITEMS[p.eq.primary]; if (it && it.dmg) return it;
  return p.cls === 'brawler' ? { dmg: 3 + Math.floor(p.lvl / 2), delay: 20, wt: 'fist' } : { dmg: 2, delay: 30, wt: 'fist' };
}
const VERB = { slash: ['slash', 'slashes'], blunt: ['crush', 'crushes'], pierce: ['pierce', 'pierces'], fist: ['punch', 'punches'] };
function meleeHit(p, t, w, mult, label) {
  const sk = (p.skills[w.wt] || 0) / (p.lvl * 5 + 5);
  const ch = clamp(.8 + (p.lvl - t.lvl) * .04 - (1 - sk) * .15, .15, .95);
  skillUp(p, w.wt, .12); skillUp(p, 'off', .06); p.swingN++;
  if (Math.random() > ch) { tell(p, label ? `Your ${label} misses ${t.name}!` : `You try to ${VERB[w.wt][0]} ${t.name}, but miss!`, 'c-miss'); addHate(t, p, 1); return 0; }
  const dmg = Math.max(1, Math.round((rnd(1, w.dmg * 2) * (1 + p.lvl * .08 + (p.st.str - 10) / 100) + p.lvl / 4) * mult));
  tell(p, label ? `Your ${label} hits ${t.name} for ${dmg} points of damage.` : `You ${VERB[w.wt][0]} ${t.name} for ${dmg} point${dmg > 1 ? 's' : ''} of damage.`, 'c-dmg');
  around(p, `${p.name} ${label ? 'hits' : VERB[w.wt][1]} ${t.name} for ${dmg} point${dmg > 1 ? 's' : ''} of damage.`, 'c-other', p);
  hurt(t, dmg, p); return dmg;
}
const facing = (p, t) => -Math.sin(p.yaw) * (t.x - p.x) - Math.cos(p.yaw) * (t.z - p.z) > 0;
const isBehind = (p, t) => Math.sin(t.yaw) * (p.x - t.x) + Math.cos(t.yaw) * (p.z - t.z) < 0;
function playerSwing(p) {
  if (!p.autoAtk || p.casting || has(p, 'stun') || p.swingAt > T) return;
  const t = p.target; if (!t || t.kind !== 'mob' || t.dead) return;
  if (dist(p, t) > t.r + 3.4) { warn(p, 'Your target is too far away, get closer!'); p.swingAt = T + .4; return; }
  if (!facing(p, t)) { warn(p, 'You cannot see your target.'); p.swingAt = T + .4; return; }
  const w = weapon(p); p.swingAt = T + w.delay / 10 / (1 + p.st.haste / 100);
  breakInvis(p); stand(p); meleeHit(p, t, w, 1);
}

// ---------- spells and abilities ----------
const setCd = (p, id, t) => { p.gemCd[id] = [r2(T + t), t]; };
function castGem(p, i) {
  const id = p.gems[i]; if (!id || p.dead) return; const sp = SPELLS[id], G = p.zn.G;
  if (p.casting) return warn(p, 'You are already casting.');
  if (has(p, 'stun')) return warn(p, 'You are stunned!');
  if (p.gemCd[id] && p.gemCd[id][0] > T) return warn(p, `${sp.name} is not ready yet.`);
  if (p.mana < sp.mana) return warn(p, 'Insufficient mana to cast this spell!');
  let t = p;
  if (sp.tgt === 'enemy') {
    t = p.target; if (!t || t.kind !== 'mob' || t.dead) return warn(p, 'You must first select a target for this.');
    if (dist(p, t) > sp.range + t.r) return warn(p, 'Your target is out of range, get closer!');
    if (!G.los(p, t)) return warn(p, 'You cannot see your target.');
  } else if (!sp.abil && (sp.heal || sp.healPct || (sp.buff && !(sp.buff.regen < 0))) && p.target && p.target.kind === 'player' && p.target !== p && !p.target.dead) {
    t = p.target;
    if (dist(p, t) > 60) return warn(p, 'Your target is out of range, get closer!');
    if (!G.los(p, t)) return warn(p, 'You cannot see your target.');
  }
  stand(p);
  if (sp.abil || !sp.cast) return fire(p, sp, t);
  p.casting = { sp, start: T, end: T + sp.cast, tgt: t, x: p.x, z: p.z }; tell(p, `You begin casting ${sp.name}.`, 'c-cast'); around(p, `${p.name} begins to cast a spell.`, 'c-other', p);
}
function updCast(p) {
  const c = p.casting; if (!c) return;
  if (Math.hypot(p.x - c.x, p.z - c.z) > 1.2) { tell(p, 'Your spell is interrupted.', 'c-spell'); p.casting = null; return; }
  if (T < c.end) return;
  p.casting = null; const sp = c.sp, t = c.tgt;
  if (t.gone || t.zn !== p.zn || (sp.tgt === 'enemy' ? t.dead || t.kind !== 'mob' : t.dead)) return tell(p, 'Your target is gone.', 'c-spell');
  const sk = (p.skills[sp.school] || 0) / (p.lvl * 5 + 5); skillUp(p, sp.school, .2);
  if (Math.random() < clamp(.16 - sk * .14, .03, .16)) { tell(p, 'Your spell fizzles!', 'c-fizzle'); p.mana -= Math.ceil(sp.mana / 2); setCd(p, sp.id, 1.5); return; }
  fire(p, sp, t);
}
function fire(p, sp, t) { p.mana -= sp.mana; setCd(p, sp.id, Math.max(sp.recast, sp.abil ? 1 : 2.2)); doSpell(p, sp, t); }
function doSpell(p, sp, t) {
  const fx = (k, dur, o) => addBuff(t, sp.id + k, sp.name, dur, { src: p, ...o });
  if (sp.tgt === 'enemy') {
    breakInvis(p);
    if (sp.undead && !t.def.undead) return tell(p, 'Your spell has no effect on this creature.', 'c-spell');
    if (sp.strike !== undefined) { if (!meleeHit(p, t, weapon(p), sp.behind && isBehind(p, t) ? sp.behind : sp.strike, sp.name) || t.dead) return; }
    else if (!sp.shot && !sp.taunt && Math.random() < clamp(.06 + (t.lvl - p.lvl) * .06, .02, .7)) { tell(p, `${cap(t.name)} resisted your ${sp.name}!`, 'c-spell'); addHate(t, p, 10); return; }
    addHate(t, p, sp.mana + 8);
    const hit = (d, mine) => { tell(p, mine, 'c-dmg'); around(p, `${p.name} hits ${t.name} with ${sp.name} for ${d} points of damage.`, 'c-other', p); hurt(t, d, p); };
    if (sp.shot) { const d = rnd(...sp.shot) + Math.round(p.lvl * 1.2); hit(d, `Your arrow strikes ${t.name} for ${d} points of damage.`); }
    if (sp.dd) { const d = rnd(...sp.dd); hit(d, `${cap(t.name)} was hit by ${sp.name} for ${d} points of damage.`); }
    if (sp.tap) { const d = rnd(...sp.tap); p.hp = Math.min(p.maxhp, p.hp + d); hit(d, `You drain ${d} points of life from ${t.name}.`); }
    if (t.dead) return;
    const said = [];
    if (sp.dot) { fx('d', sp.dot.t, { dot: sp.dot.d }); said.push('sickens'); }
    if (sp.root) { fx('r', sp.root, { root: 1 }); said.push('is rooted in place'); }
    if (sp.snare) { fx('s', sp.snare.t, { snare: sp.snare.p }); said.push('is slowed'); }
    if (sp.slow) { fx('l', sp.slow.t, { slow: sp.slow.p }); said.push('moves sluggishly'); }
    if (sp.stun) { fx('t', sp.stun, { stun: 1 }); t.casting = null; said.push('is stunned'); }
    if (sp.fear) { fx('f', sp.fear, { fear: 1 }); said.push('flees in terror'); }
    if (sp.mez) { if (t.lvl > sp.mez.max) tell(p, `${cap(t.name)} is too powerful to be entranced.`, 'c-spell'); else { fx('m', sp.mez.t, { mez: 1 }); said.push('is entranced'); } }
    if (sp.taunt) { t.hate.set(p, Math.max(...t.hate.values(), 0) + 20); said.push(`turns on ${p.name} in a rage`); }
    if (said.length) { const m = `${cap(t.name)} ${said.join(' and ')}.`; tell(p, m, 'c-spell'); around(p, m, 'c-other', p); }
  } else {
    const other = t !== p;
    if (sp.heal || sp.healPct) {
      const a = sp.heal ? rnd(...sp.heal) : Math.round(t.maxhp * sp.healPct), b = Math.max(0, Math.min(a, t.maxhp - t.hp)); t.hp += b;
      tell(t, `You feel your wounds close. (${b})`, 'c-heal'); if (other) tell(p, `You heal ${t.name} for ${b} points.`, 'c-heal');
    }
    if (sp.buff) { const { t: dur, ...stats } = sp.buff; addBuff(t, sp.id, sp.name, dur, { stats }); tell(t, `You are wrapped in ${sp.name}.`, 'c-spell'); if (other) tell(p, `${t.name} is wrapped in ${sp.name}.`, 'c-spell'); }
    if (sp.pet) summonPet(p, sp.pet.k, Math.max(1, Math.min(p.lvl, sp.pet.cap) - 1));
    if (sp.invis) { addBuff(p, sp.id, sp.name, sp.invis, { invis: 1 }); tell(p, 'You fade from view.', 'c-spell'); }
    if (sp.feign) {
      p.autoAtk = false;
      if (Math.random() < sp.feign) { p.feign = true; p.sitting = false; tell(p, 'You collapse to the ground.', 'c-spell'); around(p, `${p.name} collapses to the ground.`, 'c-other', p); } else tell(p, 'Your ruse fools no one!', 'c-hit');
    }
    if (sp.fade) { let n = 0; for (const e of p.zn.ents.values()) if (e.kind === 'mob' && e.hate.has(p) && Math.random() < .8) { e.hate.delete(p); n++; } tell(p, n ? 'You slip from your enemies\' attention.' : 'No one was paying you any mind.', 'c-spell'); }
    if (sp.gate) { tell(p, 'The world folds around you.', 'c-spell'); around(p, `${p.name} fades away.`, 'c-other', p); enterZone(p, 'city', ZONES.city.start); }
  }
}

// ---------- monster AI ----------
function stepToward(e, tx, tz, spd, dt) {
  const dx = tx - e.x, dz = tz - e.z, d = Math.hypot(dx, dz); if (d < .05) return d;
  const m = Math.min(d, spd * dt);
  [e.x, e.z] = e.zn.G.slide(e.x, e.z, e.x + dx / d * m, e.z + dz / d * m, e.r);
  e.yaw = Math.atan2(dx, dz); return d;
}
function flowOf(p) {
  const G = p.zn.G, cell = Math.floor(p.z / G.c) * G.W + Math.floor(p.x / G.c);
  if (p.flowZ !== p.zn) { p.flow = new Int16Array(G.W * G.H); p.flowZ = p.zn; p.flowCell = -1; }
  if (p.flowCell !== cell) { p.flowCell = cell; G.flow(p.x, p.z, p.flow); }
  return p.flow;
}
function chase(e, t, sp, dt) {
  const G = e.zn.G;
  if (t.kind === 'player' && !G.los(e, t)) {
    const f = flowOf(t), c = G.c, cx = Math.floor(e.x / c), cy = Math.floor(e.z / c); let best = f[cy * G.W + cx], bx = -1, by = -1;
    if (best > 0) for (const [dx, dy] of DIRS) {
      const xx = cx + dx, yy = cy + dy; if (xx < 0 || yy < 0 || xx >= G.W || yy >= G.H) continue;
      const d = f[yy * G.W + xx]; if (d >= 0 && d < best) { best = d; bx = xx; by = yy; }
    }
    if (bx >= 0) return stepToward(e, (bx + .5) * c, (by + .5) * c, sp, dt);
  }
  stepToward(e, t.x, t.z, sp, dt);
}
function mobSwing(e, t) {
  e.atkT = (e.def.delay || 2.2) / (1 - fxv(e, 'slow')); e.swingN++;
  const max = Math.max(1, Math.round((2 + e.lvl * 1.3) * (e.def.dmg || 1)));
  if (t.kind === 'player') {
    const ac = t.ac, ch = clamp(.9 - ac / (ac + 30 + e.lvl * 10) * .7 + (e.lvl - t.lvl) * .03, .2, .95);
    skillUp(t, 'def', .05);
    if (Math.random() > ch) return tell(t, `${cap(e.name)} tries to hit YOU, but misses!`, 'c-miss');
    const dmg = Math.max(1, Math.round(rnd(1, max) * (1 - Math.min(.4, ac / (ac + 60 + e.lvl * 15)))));
    tell(t, `${cap(e.name)} hits YOU for ${dmg} point${dmg > 1 ? 's' : ''} of damage.`, 'c-hit'); around(t, `${cap(e.name)} hits ${t.name} for ${dmg} point${dmg > 1 ? 's' : ''} of damage.`, 'c-other', t);
    hurt(t, dmg, e);
    if (t.st.ds && !t.dead) hurt(e, t.st.ds, t);
  } else if (Math.random() < .75) hurt(t, rnd(1, max), e);
}
function updMob(e, dt) {
  const zn = e.zn, G = zn.G;
  if (e.atkT > 0) e.atkT -= dt; if (e.cd > 0) e.cd -= dt;
  if (has(e, 'mez') || has(e, 'stun')) return;
  let t = null, top = -1;
  for (const [k, v] of e.hate) { if (k.dead || k.gone || k.zn !== zn || k.feign) { e.hate.delete(k); continue; } if (v > top) { top = v; t = k; } }
  if (e.casting) {
    if ((e.casting.t -= dt) <= 0) {
      const s = e.casting.s; e.casting = null;
      if (s.heal) { e.hp = Math.min(e.maxhp, e.hp + rnd(...s.heal)); around(e, `${cap(e.name)} is bathed in a murky glow.`, 'c-spell'); }
      else if (t && dist(e, t) < 55) {
        const d = rnd(...s.dd);
        if (t.kind !== 'player') hurt(t, d, e);
        else if (Math.random() < .15) tell(t, `You resist the ${s.name}!`, 'c-spell');
        else { tell(t, `${cap(e.name)} hits you with ${s.name} for ${d} points of damage.`, 'c-hit'); around(t, `${cap(e.name)} hits ${t.name} with ${s.name} for ${d} points of damage.`, 'c-other', t); hurt(t, d, e); }
      }
    }
    return;
  }
  const spd = has(e, 'root') ? 0 : (e.def.speed || 6.2) * (1 - fxv(e, 'snare'));
  if (!t) {
    if (e.def.aggro) {
      let best = null, bd = 1e9;
      for (const q of zn.players) { if (q.dead || q.feign || has(q, 'invis')) continue; const d = dist(e, q); if (d < bd && d < (e.def.agR || 15) * (q.sitting ? 1.4 : 1) && G.los(e, q)) { best = q; bd = d; } }
      if (best) return addHate(e, best, 1);
      for (const q of zn.players) if (q.petE && dist(e, q.petE) < 8) return addHate(e, q.petE, 1);
    }
    if (e.hp < e.maxhp) e.hp = Math.min(e.maxhp, e.hp + e.maxhp * .04 * dt);
    if (e.dmg.size && e.hp >= e.maxhp) e.dmg.clear();
    const path = e.sp.s.path, c = G.c;
    if (path) { const w = path[e.wp]; if (stepToward(e, (w[0] + .5) * c, (w[1] + .5) * c, spd * .45, dt) < 2) e.wp = (e.wp + 1) % path.length; return; }
    if (dist(e, e.home) > e.sp.s.r * c + 6) { stepToward(e, e.home.x, e.home.z, spd, dt); e.wt = 3; return; }
    if ((e.wt -= dt) <= 0) { const a = Math.random() * 6.28, r = Math.random() * (e.sp.s.r * c * .5 + 2); e.wx = e.home.x + Math.cos(a) * r; e.wz = e.home.z + Math.sin(a) * r; e.wt = 5 + Math.random() * 10; e.wn = 4; }
    if (e.wn > 0) { e.wn -= dt; if (stepToward(e, e.wx, e.wz, 1.6, dt) < .3) e.wn = 0; }
    return;
  }
  if (has(e, 'fear') || (e.def.flee && e.hp < e.maxhp * .2)) {
    if (!e.fled && !has(e, 'fear')) { e.fled = true; around(e, `${cap(e.name)} turns to flee!`, 'c-other'); }
    const dx = e.x - t.x, dz = e.z - t.z, d = Math.hypot(dx, dz) || 1; stepToward(e, e.x + dx / d * 8, e.z + dz / d * 8, spd * .75, dt); return;
  }
  const d = dist(e, t), reach = e.r + (t.r || .5) + 1.4;
  if (d > reach) { if (spd > 0) chase(e, t, spd, dt); } else e.yaw = Math.atan2(t.x - e.x, t.z - e.z);
  if (e.def.spells && e.cd <= 0 && d < 45) {
    const s = e.def.spells.find(s => s.heal ? e.hp < e.maxhp * .5 : G.los(e, t));
    if (s) { e.casting = { s, t: 2.5 }; e.cd = s.cd; around(e, `${cap(e.name)} begins to cast a spell.`, 'c-spell'); return; }
  }
  if (d <= reach + .3 && e.atkT <= 0) mobSwing(e, t);
}
function updGuard(e, dt) {
  if (e.atkT > 0) e.atkT -= dt;
  let t = e.tgt;
  if (!t || t.dead || t.gone || t.kind !== 'mob' || dist(e, t) > 40) {
    t = null; let bd = 26; for (const m of e.zn.ents.values()) if (m.kind === 'mob' && !m.dead && m.def.aggro) { const d = dist(e, m); if (d < bd) { bd = d; t = m; } }
    e.tgt = t; if (t) around(e, `${e.name} shouts, 'For Lanternhold!'`, 'c-npc');
  }
  if (t) {
    const d = dist(e, t), reach = e.r + t.r + 1.4;
    if (d > reach) stepToward(e, t.x, t.z, 8, dt);
    else { e.yaw = Math.atan2(t.x - e.x, t.z - e.z); if (e.atkT <= 0) { e.atkT = 1.4; e.swingN++; const dmg = rnd(25, 60); around(e, `${e.name} hits ${t.name} for ${dmg} points of damage.`); hurt(t, dmg, e); } }
  } else if (dist(e, e.home) > 1) stepToward(e, e.home.x, e.home.z, 4, dt);
}
function updPet(e, dt) {
  const p = e.owner; if (e.atkT > 0) e.atkT -= dt;
  let t = e.tgt; if (t && (t.dead || t.gone || t.kind !== 'mob')) t = e.tgt = null;
  if (!t) for (const m of e.zn.ents.values()) if (m.kind === 'mob' && !m.dead && (m.hate.has(p) || m.hate.has(e))) { t = m; break; }
  if (t) {
    const d = dist(e, t), reach = e.r + t.r + 1.4;
    if (d > reach) stepToward(e, t.x, t.z, 8, dt);
    else {
      e.yaw = Math.atan2(t.x - e.x, t.z - e.z);
      if (e.atkT <= 0) {
        e.atkT = 2; e.swingN++;
        if (Math.random() < .8) { const dmg = rnd(1, Math.max(1, Math.round((2 + e.lvl * 1.3) * e.def.dmg))); tell(p, `${cap(e.name)} hits ${t.name} for ${dmg} point${dmg > 1 ? 's' : ''} of damage.`, 'c-other'); hurt(t, dmg, e); }
        else addHate(t, e, 1);
      }
    }
  } else if (dist(e, p) > 4) stepToward(e, p.x, p.z, dist(e, p) > 40 ? 30 : 8.5, dt);
}

// ---------- interaction ----------
function interact(p, e) {
  if (p.dead) return;
  if (e.kind === 'npc') return hail(p, e);
  if (e.kind !== 'corpse' && e.kind !== 'pcorpse') return;
  if (dist(p, e) > 7) return warn(p, 'You are too far away to loot that corpse.');
  stand(p);
  if (e.kind === 'corpse') {
    if (!e.rights.has(p.name) && T < e.freeAt && e.rights.size) return warn(p, 'You may not loot this corpse yet.');
    if (e.coin) { p.coin += e.coin; tell(p, `You receive ${fmtCoin(e.coin)} from the corpse.`, 'c-coin'); e.coin = 0; }
    if (!e.loot.length) { tell(p, 'There is nothing left on the corpse.', 'c-miss'); e.decay = Math.min(e.decay, 20); return; }
    p.lootEnt = e; return;
  }
  if (e.owner !== p.name) return warn(p, 'That is not your corpse.');
  const k = e.k; k.inv = k.inv.filter(s => !addItem(p, s.id, s.n)); p.coin += k.coin; k.coin = 0;
  if (k.inv.length) return tell(p, 'Your bags are full. Some of your belongings remain on the corpse.', 'c-miss');
  p.corpses.splice(p.corpses.indexOf(k), 1); remEnt(e); tell(p, 'You recover your belongings.', 'c-loot');
}
function hail(p, e) {
  if (!e || e.kind !== 'npc') return warn(p, 'There is no one to hail. Target a townsperson first.');
  if (dist(p, e) > 10) return warn(p, 'You are too far away.');
  const n = e.def, q = n.quest; tell(p, `You say, 'Hail, ${e.name}'`, 'c-say'); p.target = e;
  if (q && countItem(p, q.item) >= q.n) {
    removeItem(p, q.item, q.n); npcSay(p, e, q.done); p.coin += q.coin; tell(p, `You receive ${fmtCoin(q.coin)}.`, 'c-coin'); gainXp(p, q.xp);
    if (q.reward && !p.quest[q.reward] && addItem(p, q.reward)) { p.quest[q.reward] = 1; tell(p, `You receive ${ITEMS[q.reward].name}!`, 'c-loot'); }
    return;
  }
  npcSay(p, e, q ? q.ask : n.say);
  if (n.sells) p.shop = e;
}
function leaveGroup(p) {
  const g = p.group; if (!g) return;
  g.m = g.m.filter(q => q !== p); p.group = null; tell(p, 'You have left the group.');
  g.m.forEach(q => tell(q, `${p.name} has left the group.`));
  if (g.m.length < 2) g.m.forEach(q => { q.group = null; tell(q, 'Your group has disbanded.'); });
}
const findPlayer = n => n && online.get(n.toLowerCase());
function command(p, v) {
  v = v.slice(0, 200);
  if (v[0] !== '/') {
    tell(p, `You say, '${v}'`, 'c-say'); return around(p, `${p.name} says, '${v}'`, 'c-say', p, 60);
  }
  const sp = v.indexOf(' '), c = (sp < 0 ? v.slice(1) : v.slice(1, sp)).toLowerCase(), rest = sp < 0 ? '' : v.slice(sp + 1).trim(), a = rest.split(/\s+/)[0];
  if (c === 'sit') sit(p); else if (c === 'stand') stand(p);
  else if (c === 'shout') { for (const q of p.zn.players) tell(q, q === p ? `You shout, '${rest}'` : `${p.name} shouts, '${rest}'`, 'c-shout'); }
  else if (c === 'ooc') { for (const q of online.values()) tell(q, `${p.name} says out of character, '${rest}'`, 'c-ooc'); }
  else if (c === 'tell' || c === 't') {
    const q = findPlayer(a), m = rest.slice(a.length).trim(); if (!q) return tell(p, `${a || 'That player'} is not online.`, 'c-miss');
    tell(q, `${p.name} tells you, '${m}'`, 'c-tell'); tell(p, `You told ${q.name}, '${m}'`, 'c-tell');
  } else if (c === 'g' || c === 'gsay') {
    if (!p.group) return tell(p, 'You are not in a group.', 'c-miss');
    p.group.m.forEach(q => tell(q, q === p ? `You tell your party, '${rest}'` : `${p.name} tells the group, '${rest}'`, 'c-group'));
  } else if (c === 'who') {
    tell(p, `Adventurers in the world: ${online.size}`);
    for (const q of online.values()) tell(p, `[${q.lvl} ${CLASSES[q.cls].name}] ${q.name} (${RACES[q.race].name})  ${q.zn.Z.name}`, 'c-say');
  } else if (c === 'invite') {
    const q = findPlayer(a) || (p.target && p.target.kind === 'player' ? p.target : null);
    if (!q || q === p) return tell(p, 'Invite whom? Target a player or use /invite Name.', 'c-miss');
    if (q.group) return tell(p, `${q.name} is already in a group.`, 'c-miss');
    if (p.group && p.group.m.length >= 6) return tell(p, 'Your group is full.', 'c-miss');
    q.invite = { from: p, until: T + 60 }; tell(p, `You invite ${q.name} to join your group.`); tell(q, `${p.name} invites you to join a group. Type /accept to join.`, 'c-group');
  } else if (c === 'accept') {
    const iv = p.invite; p.invite = null;
    if (!iv || iv.until < T || !iv.from.send) return tell(p, 'You have no pending invitation.', 'c-miss');
    if (p.group) return tell(p, 'You are already in a group. /disband first.', 'c-miss');
    const g = iv.from.group || (iv.from.group = { m: [iv.from] }); if (g.m.length >= 6) return tell(p, 'That group is full.', 'c-miss');
    g.m.forEach(q => tell(q, `${p.name} has joined the group.`, 'c-group')); g.m.push(p); p.group = g; tell(p, 'You have joined the group.', 'c-group');
  } else if (c === 'disband' || c === 'leave') leaveGroup(p);
  else if (c === 'camp') tell(p, 'Your character is saved automatically. It is safe to close the window.');
  else if (c === 'pet') {
    const e = p.petE; if (!e) return tell(p, 'You have no pet.', 'c-miss');
    if (a === 'attack') { if (p.target && p.target.kind === 'mob') { e.tgt = p.target; addHate(p.target, e, 1); tell(p, `${cap(e.name)} moves to attack ${p.target.name}.`, 'c-other'); } else warn(p, 'You must first select a target.'); }
    else if (a === 'back') { e.tgt = null; tell(p, `${cap(e.name)} returns to your side.`, 'c-other'); }
    else if (a === 'dismiss') { tell(p, `${cap(e.name)} crumbles away.`, 'c-spell'); remEnt(e); p.petE = null; p.pet = null; }
    else tell(p, 'Usage: /pet attack, /pet back, /pet dismiss', 'c-miss');
  } else if (c === 'gm' && (process.env.GM_NAMES || '').toLowerCase().split(',').includes(p.name.toLowerCase())) {
    // Game-master helpers for whoever runs the server: /gm level 10, /gm coin 5000
    const n = parseInt(rest.split(/\s+/)[1], 10) || 0;
    if (a === 'level') { p.lvl = clamp(n, 1, MAXLVL); p.xp = 0; recalc(p); p.hp = p.maxhp; p.mana = p.maxmana; learnLevel(p); tell(p, `You are now level ${p.lvl}.`); }
    else if (a === 'coin') { p.coin += Math.max(0, n); tell(p, `You conjure ${fmtCoin(Math.max(0, n))}.`); }
    else tell(p, 'Usage: /gm level N, /gm coin N', 'c-miss');
  } else tell(p, 'That is not a valid command. Click Help for the list.', 'c-miss');
}

// Messages from a connected client.
const num = v => typeof v === 'number' && isFinite(v);
export function handle(p, m) {
  const zn = p.zn, ent = id => zn.ents.get(id);
  switch (m.t) {
    case 'pos': {
      if (m.q !== p.zseq || p.dead || !num(m.x) || !num(m.z) || !num(m.y)) return;
      const x = clamp(m.x, 0, zn.G.W * zn.G.c), z = clamp(m.z, 0, zn.G.H * zn.G.c);
      if (Math.hypot(x - p.x, z - p.z) > .05 && (p.sitting || p.feign)) stand(p);
      p.x = x; p.z = z; p.yaw = m.y;
      const ch = zn.G.cellAt(x, z), l = zn.Z.lines[ch]; if (ch >= '0' && ch <= '9' && l) enterZone(p, l.to, l);
      return;
    }
    case 'tgt': { const e = ent(m.id); p.target = e && e !== p ? e : null; return; }
    case 'cmd': if (typeof m.v === 'string' && m.v.trim()) command(p, m.v.trim()); return;
  }
  if (p.dead) return;
  switch (m.t) {
    case 'atk': p.autoAtk = !p.autoAtk; if (p.autoAtk) stand(p); tell(p, p.autoAtk ? 'Auto attack is on.' : 'Auto attack is off.', 'c-miss'); break;
    case 'sit': p.sitting ? stand(p) : sit(p); break;
    case 'cast': if (m.i >= 0 && m.i < 8) castGem(p, m.i | 0); break;
    case 'mem': {
      const sp = SPELLS[m.id], i = m.i | 0; if (!sp || !p.book.includes(m.id) || i < 0 || i > 7) break;
      const old = p.gems.indexOf(m.id); if (old >= 0) p.gems[old] = null; p.gems[i] = m.id;
      if (!sp.abil) { setCd(p, m.id, 4); sit(p); tell(p, `You sit and begin memorizing ${sp.name}.`, 'c-spell'); }
      break;
    }
    case 'clr': if (m.i >= 0 && m.i < 8) p.gems[m.i | 0] = null; break;
    case 'use': { const e = ent(m.id); if (e) { p.target = e; interact(p, e); } break; }
    case 'hail': hail(p, ent(m.id)); break;
    case 'loot': {
      const e = p.lootEnt, i = e ? e.loot.indexOf(m.item) : -1; if (i < 0) break;
      if (!addItem(p, m.item)) { tell(p, 'Your bags are full.', 'c-miss'); break; }
      e.loot.splice(i, 1); tell(p, `You have looted ${ITEMS[m.item].name}.`, 'c-loot'); around(p, `${p.name} has looted ${ITEMS[m.item].name}.`, 'c-other', p);
      if (!e.loot.length) { e.decay = Math.min(e.decay, 20); for (const q of zn.players) if (q.lootEnt === e) q.lootEnt = null; }
      break;
    }
    case 'closeloot': p.lootEnt = null; break;
    case 'closeshop': p.shop = null; break;
    case 'buy': {
      const n = p.shop && p.shop.def, it = ITEMS[m.item]; if (!n || !it || !n.sells.includes(m.item)) break;
      if (p.coin < it.val) { tell(p, 'You cannot afford that.', 'c-miss'); break; }
      if (!addItem(p, m.item)) { tell(p, 'Your bags are full.', 'c-miss'); break; }
      p.coin -= it.val; tell(p, `You buy ${it.name} for ${fmtCoin(it.val)}.`, 'c-coin'); break;
    }
    case 'bag': if (m.i >= 0 && m.i < 16) clickBag(p, m.i | 0); break;
    case 'uneq': { const id = p.eq[m.s]; if (!id || !SLOTS.includes(m.s)) break; if (!addItem(p, id)) { tell(p, 'Your bags are full.', 'c-miss'); break; } delete p.eq[m.s]; recalc(p); break; }
  }
}

// ---------- main tick ----------
function sixSecondTick() {
  for (const zn of Object.values(zones)) {
    for (const p of zn.players) if (!p.dead) {
      const L = p.lvl, s = p.st;
      p.hp = clamp(p.hp + (p.sitting ? 2 + Math.floor(L / 3) : 1 + Math.floor(L / 10)) + s.regen, 1, p.maxhp);
      if (p.maxmana) { if (p.sitting && p.mana < p.maxmana) skillUp(p, 'med', .25); p.mana = Math.min(p.maxmana, p.mana + (p.sitting ? 3 + Math.floor(L / 2) + Math.floor((p.skills.med || 0) / 15) : 1) + s.mregen); }
    }
    for (const e of [...zn.ents.values()]) {
      if (e.dead || e.gone) continue;
      if (e.kind === 'mob') for (const b of e.buffs.slice()) if (b.dot && !e.dead) { if (b.src.send && b.src.zn === zn) tell(b.src, `${cap(e.name)} has taken ${b.dot} damage from your ${b.name}.`, 'c-dmg'); hurt(e, b.dot, b.src); }
      if (e.kind === 'pet') e.hp = Math.min(e.maxhp, e.hp + Math.ceil(e.maxhp * .04));
    }
  }
}
export function tick(dt) {
  T += dt; time = (time + dt / 1.5) % 1440;
  for (const zn of Object.values(zones)) {
    if (!zn.players.size) continue;
    for (const p of [...zn.players]) {
      if (p.dead) { if (T >= p.respawnAt) { p.dead = false; p.hp = Math.ceil(p.maxhp / 2); p.mana = Math.floor(p.maxmana / 4); enterZone(p, 'city', ZONES.city.start); tell(p, 'You wake in Lanternhold, sore but alive.'); } continue; }
      updBuffs(p); updCast(p); playerSwing(p);
      if (p.shop && dist(p, p.shop) > 12) p.shop = null;
      if (p.lootEnt && dist(p, p.lootEnt) > 9) p.lootEnt = null;
    }
    for (const e of [...zn.ents.values()]) {
      if (e.gone) continue;
      if (e.kind === 'mob') { updBuffs(e); updMob(e, dt); }
      else if (e.kind === 'pet') updPet(e, dt);
      else if (e.kind === 'npc') { if (e.def.guard) updGuard(e, dt); }
      else if (e.kind === 'corpse' && (e.decay -= dt) <= 0) remEnt(e);
    }
    for (const sp of zn.spawns) if (!sp.e && (sp.t -= dt) <= 0) spawnMob(zn, sp);
  }
  if ((tickT += dt) >= 6) { tickT -= 6; sixSecondTick(); }
  // Broadcast what changed
  const tm = Math.floor(time);
  for (const zn of Object.values(zones)) {
    if (!zn.players.size) { zn.adds = []; zn.rms = []; continue; }
    const ch = [];
    for (const e of zn.ents.values()) {
      const sig = `${r1(e.x)},${r1(e.z)},${r2(e.yaw)},${hpPct(e)},${e.swingN || 0},${flags(e)}`;
      if (sig !== e.sig) { e.sig = sig; ch.push([e.id, r1(e.x), r1(e.z), r2(e.yaw), hpPct(e), e.swingN || 0, flags(e)]); }
    }
    const s = JSON.stringify({ t: 's', T: r2(T), tm, a: zn.adds.filter(e => !e.gone).map(desc), e: ch, r: zn.rms });
    zn.adds = []; zn.rms = [];
    for (const p of zn.players) p.send(s);
  }
  for (const p of online.values()) {
    if (p.out.length) { p.send(JSON.stringify({ t: 'm', l: p.out })); p.out = []; }
    const me = JSON.stringify(meState(p)); if (me !== p.lastMe) { p.lastMe = me; p.send('{"t":"me","me":' + me + '}'); }
  }
}
