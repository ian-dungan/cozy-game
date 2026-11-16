// Zone maps. Grid chars: # wall, . ground, = path, , indoor floor, ~ water, T tree, ^ rock,
// digits = zone lines, any other letter = marker (lowercase markers are indoors).
import { ITEMS, SPELLS } from './data.js';

const rng = seed => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const grid = (w, h, ch) => Array.from({ length: h }, () => Array(w).fill(ch));
const rect = (g, x, y, w, h, ch) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (g[j] && g[j][i] !== undefined) g[j][i] = ch; };
const disc = (g, cx, cy, r, ch) => { for (let j = cy - r; j <= cy + r; j++) for (let i = cx - r; i <= cx + r; i++) if (g[j] && g[j][i] !== undefined && Math.hypot(i - cx, j - cy) <= r + .3) g[j][i] = ch; };
const line = (g, x1, y1, x2, y2, ch, th = 1) => { const n = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)); for (let i = 0; i <= n; i++) rect(g, Math.round(x1 + (x2 - x1) * i / n), Math.round(y1 + (y2 - y1) * i / n), th, th, ch); };

function cityGrid() {
  const road = '#' + '='.repeat(38) + '1';
  const rows = [
    '########################################',
    '#......................................#',
    '#..#########...##########...########...#',
    '#..#,,,,,,,#...#,,,,,,,,#...#,,,,,,#...#',
    '#..#,,,a,,,#...#,,,,b,,,#...#,,,c,,#...#',
    '#..#,,,,,,,#...#,,,,,,,,#...#,,,,,,#...#',
    '#..####,####...####,,####...###,,###...#',
    '#......=..........==..........==.......#',
    '#...T..=..........==..........==....T..#',
    '#......=..........==..........==.......#',
    '#......=.......~~~==..........==.......#',
    '#......=.......~~~==......S...==.......#',
    '#......=..........==..........==.......#',
    '#......=..........==..........==....H..#',
    road, road,
    '#......=..........==..........==....I..#',
    '#......=..........==..G.......==.......#',
    '#...T..=..........==..........==....T..#',
    '#......=..........==..........==.......#',
    '#..####,####...####,,####...###,,###...#',
    '#..#,,,,,,,#...#,,,,,,,,#...#,,,,,,#...#',
    '#..#,,,d,,,#...#,,,,e,,,#...#,,,f,,#...#',
    '#..#,,,,,,,#...#,,,,,,,,#...#,,,,,,#...#',
    '#..#########...##########...########...#',
    '#......................................#',
    '########################################',
  ];
  return rows.map(r => r.padEnd(40, '#').split(''));
}

function forestGrid() {
  const W = 120, H = 120, g = grid(W, H, '.'), R = rng(7);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const blob = (Math.sin(x * .13) + Math.cos(y * .11) + Math.sin((x + y) * .07)) / 3;
    const r = R();
    if (r < .12 + .08 * blob) g[y][x] = 'T'; else if (r > .994) g[y][x] = '^';
  }
  // clearings
  [[60, 55, 6], [40, 95, 5], [30, 20, 5], [60, 15, 6], [96, 26, 4], [106, 32, 4], [8, 60, 7], [112, 12, 5]].forEach(([x, y, r]) => disc(g, x, y, r, '.'));
  disc(g, 74, 100, 9, '~');
  // paths
  [[1, 60, 40, 60], [40, 60, 60, 55], [60, 55, 85, 35], [85, 35, 112, 11], [112, 11, 118, 10], [60, 55, 62, 88], [62, 88, 42, 94], [60, 55, 60, 18]]
    .forEach(([a, b, c, d]) => line(g, a, b, c, d, '=', 2));
  // standing stones at the crossroads, ruin walls in the north
  [[57, 52], [63, 52], [57, 58], [63, 58]].forEach(([x, y]) => g[y][x] = '^');
  rect(g, 55, 11, 4, 1, '#'); rect(g, 62, 11, 4, 1, '#'); rect(g, 55, 11, 1, 4, '#'); rect(g, 65, 11, 1, 3, '#'); rect(g, 57, 19, 3, 1, '#');
  // border cliffs
  rect(g, 0, 0, W, 1, '#'); rect(g, 0, H - 1, W, 1, '#'); rect(g, 0, 0, 1, H, '#'); rect(g, W - 1, 0, 1, H, '#');
  g[60][0] = g[61][0] = '1'; g[10][W - 1] = g[11][W - 1] = '2';
  return g;
}

function keepGrid() {
  const g = grid(50, 50, '#');
  rect(g, 25, 42, 2, 7, '.');            // entry corridor
  rect(g, 18, 34, 15, 8, '.');           // A courtyard
  rect(g, 14, 37, 4, 2, '.'); rect(g, 4, 30, 10, 9, '.');   // B barracks
  rect(g, 33, 37, 3, 2, '.'); rect(g, 36, 32, 10, 9, '.');  // C kennels
  rect(g, 25, 28, 2, 6, '.'); rect(g, 17, 19, 17, 9, '.');  // D great hall
  rect(g, 13, 23, 4, 2, '.'); rect(g, 3, 17, 10, 10, '.');  // E pens
  rect(g, 34, 23, 3, 2, '.'); rect(g, 37, 18, 10, 10, '.'); // F shrine
  rect(g, 25, 13, 2, 6, '.'); rect(g, 15, 3, 21, 10, '.');  // G throne room
  rect(g, 20, 37, 3, 3, '~'); rect(g, 40, 21, 4, 4, '~'); rect(g, 17, 4, 4, 3, '~'); rect(g, 30, 4, 4, 3, '~');
  [[21, 21], [29, 21], [21, 25], [29, 25], [20, 8], [31, 8]].forEach(([x, y]) => g[y][x] = '#'); // pillars
  g[49][25] = g[49][26] = '1';
  return g;
}

const armor = (...tiers) => tiers.flatMap(t => ['head', 'chest', 'legs', 'hands', 'feet'].map(s => `a${t}_${s}`));
const scrolls = (...cls) => Object.values(SPELLS).filter(s => cls.includes(s.cls) && ITEMS['sc_' + s.id]).sort((a, b) => a.lvl - b.lvl).map(s => 'sc_' + s.id);
const guard = (name, at) => ({ name, at, guard: 1, model: ['human', { top: 0x8a8f9a, bot: 0x4a4f5a, hat: 0x8a8f9a, wep: 1, s: 1.05 }], say: 'Stay on the road, and keep clear of Drownstone Keep unless you are ready for it.' });

export const ZONES = {
  city: {
    id: 'city', name: 'Lanternhold', grid: cityGrid(), cell: 4, amp: 0, wallH: 7, ceilH: 5, outdoor: true,
    sky: 0x86b3d9, fog: [30, 170], floorCol: [.5, .48, .44], pathCol: [.58, .52, .42], wallCol: 0xb8ad98, respawn: 60,
    lines: { 1: { to: 'forest', x: 2.6, y: 61.1, yaw: -Math.PI / 2 } },
    start: { x: 26.5, y: 11.5, yaw: Math.PI },
    labels: [{ t: 'To the Gloamwood', x: 38, y: 15, h: 5 }, { t: 'Hall of Arms', x: 7.5, y: 6.6, h: 5.6 }, { t: 'The Arcanum', x: 20, y: 6.6, h: 5.6 }, { t: 'Chapel of the Hearth', x: 32, y: 6.6, h: 5.6 },
      { t: 'Tannery', x: 7.5, y: 20.4, h: 5.6 }, { t: 'Smithy', x: 20, y: 20.4, h: 5.6 }, { t: 'The Guttering Lamp', x: 32, y: 20.4, h: 5.6 }],
    npcs: [
      { name: 'Armsmaster Brenn', at: 'a', model: ['human', { top: 0x7a2f2a, bot: 0x3a3a40, wep: 1 }], sells: ['iron_dagger', 'iron_sword', 'iron_mace', 'oak_staff', 'hand_wraps', 'stiletto', 'longsword', 'warhammer', 'iron_knuckles'],
        say: 'Steel is cheap; skill is not. A fighter\'s techniques come with experience, not from scrolls. Have a look at my racks.' },
      { name: 'Magister Elowen', at: 'b', model: ['human', { top: 0x3a3a7a, bot: 0x2a2a5a, hat: 0x3a3a7a }], sells: scrolls('stormcaller', 'hexwright', 'lullsinger'), classes: ['stormcaller', 'hexwright', 'lullsinger'],
        say: 'The Arcanum keeps scrolls for Stormcallers, Hexwrights and Lullsingers. Study what you can afford; scribe it when you are able.' },
      { name: 'Sister Halda', at: 'c', model: ['human', { top: 0xd8d2bc, bot: 0xa89a7a }], sells: scrolls('mender', 'warden'), classes: ['mender', 'warden'],
        say: 'The Hearth teaches Menders and Wardens. Take what prayers you are ready for.' },
      { name: 'Tanner Ysolde', at: 'd', model: ['human', { top: 0x6a4a2a, bot: 0x4a3a2a }], sells: armor(0, 1), say: 'Linen for the bookish, hide for the quick. I buy pelts, too.' },
      { name: 'Smith Dorgan', at: 'e', model: ['human', { top: 0x3a3a3a, bot: 0x2a2a2a, skin: 0xb07a5a, s: 1.1 }], sells: [...armor(2, 3), 'buckler', 'kite_shield'], say: 'Ringmail and plate, made to last. Not cheap. Not sorry.' },
      { name: 'Innkeeper Maud', at: 'f', model: ['human', { top: 0x8a5a7a, bot: 0x5a3a4a }], sells: [],
        quest: { item: 'rat_tail', n: 4, xp: 60, coin: 30, ask: 'Moss rats are into my cellar again. Bring me four of their tails and I will make it worth your while.', done: 'Ha! Four fewer in my flour. Here, for your trouble.' },
        say: 'Welcome to the Guttering Lamp. I will buy whatever odds and ends you drag out of the wood.' },
      { name: 'Captain Verrick', at: 'G', model: ['human', { top: 0x8a8f9a, bot: 0x4a4f5a, hat: 0xd8b84a, wep: 1, s: 1.1 }],
        quest: { item: 'tally_knot', n: 4, xp: 900, coin: 400, reward: 'service_chain', ask: 'The Mirefolk of Drownstone Keep grow bold. Each of them carries a tally-knot. Bring me four and Lanternhold will reward you.', done: 'Four knots. Four fewer raiders. Lanternhold thanks you.' },
        say: 'Keep your blade loose out there.' },
      guard('Guard Tolan', 'H'), guard('Guard Merrin', 'I'),
    ],
    spawns: [],
  },
  forest: {
    id: 'forest', name: 'The Gloamwood', grid: forestGrid(), cell: 4, amp: 3, wallH: 12, cliff: true, outdoor: true,
    sky: 0x7fa6b8, fog: [18, 115], floorCol: [.33, .5, .24], pathCol: [.5, .42, .3], wallCol: 0x6a6a62, wallTex: 'rock', respawn: 100,
    lines: { 1: { to: 'city', x: 37.4, y: 15.1, yaw: Math.PI / 2 }, 2: { to: 'keep', x: 26.1, y: 46.4, yaw: 0 } },
    labels: [{ t: 'To Lanternhold', x: 1.5, y: 61, h: 5 }, { t: 'Drownstone Keep', x: 118.5, y: 11, h: 5 }],
    npcs: [guard('Guard Pell', [5, 58])],
    spawns: [
      { m: 'moss_rat', at: [12, 55], r: 9, n: 6 }, { m: 'moss_rat', at: [14, 68], r: 9, n: 5 }, { m: 'dusk_moth', at: [20, 50], r: 10, n: 5 },
      { m: 'gloam_beetle', at: [22, 70], r: 10, n: 5 }, { m: 'dusk_moth', at: [26, 62], r: 8, n: 3 },
      { m: 'thornback', at: [36, 50], r: 10, n: 5 }, { m: 'thornback', at: [34, 74], r: 10, n: 5 }, { m: 'fen_adder', at: [44, 66], r: 9, n: 4 }, { m: 'fen_adder', at: [46, 44], r: 8, n: 3 },
      { m: 'wisp', at: [60, 55], r: 14, n: 4 }, { m: 'dusk_wolf', at: [56, 70], r: 9, n: 4 }, { m: 'dusk_wolf', at: [72, 48], r: 9, n: 4 }, { m: 'dusk_wolf', at: [50, 34], r: 8, n: 3 },
      { m: 'restless', at: [60, 15], r: 6, n: 6 }, { m: 'gloam_shade', at: [60, 22], r: 8, n: 3 }, { m: 'gloam_shade', at: [84, 60], r: 10, n: 3 },
      { m: 'brigand', at: [40, 95], r: 5, n: 5, rare: ['gristle', .2] }, { m: 'brigand', at: [54, 90], r: 6, n: 2 },
      { m: 'web_lurker', at: [30, 20], r: 7, n: 6 }, { m: 'mother_silk', at: [28, 18], r: 2, n: 1, slow: 4 },
      { m: 'greatclaw', at: [86, 96], r: 10, n: 2 }, { m: 'greatclaw', at: [20, 100], r: 8, n: 1 },
      { m: 'mire_scout', at: [96, 26], r: 4, n: 4 }, { m: 'mire_scout', at: [106, 32], r: 4, n: 4 }, { m: 'mire_scout', at: [112, 13], r: 4, n: 3 },
      { m: 'hollow_stag', at: [84, 36], r: 1, n: 1, slow: 5, path: [[84, 36], [60, 55], [61, 86], [60, 55], [42, 60], [60, 55]] },
    ],
  },
  keep: {
    id: 'keep', name: 'Drownstone Keep', grid: keepGrid(), cell: 4, amp: 0, wallH: 6, ceiling: true, outdoor: false,
    sky: 0x05070a, fog: [6, 60], floorCol: [.34, .37, .32], wallCol: 0x6f7a6a, respawn: 200,
    lines: { 1: { to: 'forest', x: 116.9, y: 11.1, yaw: Math.PI / 2 } },
    labels: [{ t: 'To the Gloamwood', x: 26, y: 48.6, h: 4.5 }],
    npcs: [],
    spawns: [
      { m: 'mire_grunt', at: [25, 38], r: 5, n: 4 }, { m: 'bog_hound', at: [28, 36], r: 4, n: 2 },
      { m: 'mire_grunt', at: [9, 34], r: 4, n: 3 }, { m: 'mire_spear', at: [8, 33], r: 4, n: 3 },
      { m: 'bog_hound', at: [41, 36], r: 4, n: 5 },
      { m: 'mire_spear', at: [25, 23], r: 6, n: 4 }, { m: 'mire_caller', at: [25, 22], r: 6, n: 3 },
      { m: 'mire_brute', at: [8, 22], r: 4, n: 4 }, { m: 'ulg', at: [6, 20], r: 1, n: 1, slow: 4 },
      { m: 'mire_caller', at: [42, 23], r: 4, n: 3 }, { m: 'mire_brute', at: [41, 25], r: 3, n: 2 }, { m: 'morbwa', at: [43, 20], r: 1, n: 1, slow: 4 },
      { m: 'mire_warden', at: [25, 8], r: 7, n: 5 }, { m: 'mire_brute', at: [25, 10], r: 6, n: 2 }, { m: 'grolm', at: [25, 5], r: 1, n: 1, slow: 5 },
    ],
  },
};

for (const z of Object.values(ZONES)) {
  z.H = z.grid.length; z.W = z.grid[0].length; z.marks = {};
  z.grid.forEach((row, y) => row.forEach((ch, x) => { if (/[A-Za-z]/.test(ch) && ch !== 'T') z.marks[ch] = [x + .5, y + .5]; }));
}
