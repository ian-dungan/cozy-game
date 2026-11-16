// Game data: races, classes, spells/abilities, items, monsters, pets.

export const RACES = {
  human: { name: 'Human', mods: {}, vision: 0, desc: 'Adaptable and stubborn. Sees poorly in the dark.' },
  elf: { name: 'Elf', mods: { agi: 3, wis: 2, sta: -2 }, vision: 1, desc: 'Quick and keen-eyed, but slight of frame.' },
  dwarf: { name: 'Dwarf', mods: { sta: 4, str: 2, agi: -3 }, vision: 1, desc: 'Stout and tireless. At home under stone.' },
  smallfolk: { name: 'Smallfolk', mods: { agi: 4, str: -3, wis: 1 }, vision: 0, desc: 'Nimble, lucky and frequently underfoot.' },
  ogrekin: { name: 'Ogrekin', mods: { str: 6, sta: 3, int: -4, agi: -2 }, vision: 0, desc: 'Enormous strength; little patience for books.' },
};

// hp/mp per level, cast = casting stat, armor = best armor tier (0 cloth..3 plate)
export const CLASSES = {
  bulwark: { name: 'Bulwark', role: 'Tank', hp: 14, mp: 0, cast: null, armor: 3, weps: ['slash', 'blunt', 'pierce'], start: ['rusty_sword', 'a0_chest'],
    desc: 'A wall of steel. Holds a foe\'s attention and outlasts it.' },
  brawler: { name: 'Brawler', role: 'Melee', hp: 11, mp: 0, cast: null, armor: 1, weps: ['fist', 'blunt'], start: ['a0_chest'],
    desc: 'Fights bare-handed, shrugs off wounds and can play dead.' },
  prowler: { name: 'Prowler', role: 'Melee', hp: 10, mp: 0, cast: null, armor: 1, weps: ['pierce', 'slash'], start: ['worn_dagger', 'a0_chest'],
    desc: 'Strikes hardest from behind. Slips away when it goes wrong.' },
  warden: { name: 'Warden', role: 'Hybrid', hp: 11, mp: 5, cast: 'wis', armor: 2, weps: ['slash', 'pierce'], start: ['rusty_sword', 'a0_chest'],
    desc: 'Woodland fighter with a bow, snares and a little healing.' },
  mender: { name: 'Mender', role: 'Healer', hp: 9, mp: 10, cast: 'wis', armor: 2, weps: ['blunt'], start: ['knotted_club', 'a0_chest'],
    desc: 'Heals, blesses and smites the restless dead.' },
  stormcaller: { name: 'Stormcaller', role: 'Caster', hp: 6, mp: 10, cast: 'int', armor: 0, weps: ['blunt', 'pierce'], start: ['cracked_staff', 'a0_chest'],
    desc: 'Enormous burst damage. Roots foes, then runs out of mana.' },
  hexwright: { name: 'Hexwright', role: 'Caster', hp: 6, mp: 10, cast: 'int', armor: 0, weps: ['blunt', 'pierce'], start: ['worn_dagger', 'a0_chest'],
    desc: 'Raises a servant, rots foes slowly and drinks their life.' },
  lullsinger: { name: 'Lullsinger', role: 'Caster', hp: 6, mp: 10, cast: 'int', armor: 0, weps: ['blunt', 'pierce'], start: ['cracked_staff', 'a0_chest'],
    desc: 'Controls the fight: entrances, slows and hastens.' },
};

export const SKILLS = { off: 'Offense', def: 'Defense', slash: 'Slashing', blunt: 'Bludgeoning', pierce: 'Piercing', fist: 'Hand to Hand',
  evo: 'Evocation', mnd: 'Mending', wrd: 'Warding', aff: 'Affliction', cnj: 'Conjuring', med: 'Meditation' };

export const SPELLS = {};
const sp = (id, name, cls, lvl, o) => { SPELLS[id] = Object.assign({ id, name, cls, lvl, mana: 0, cast: 0, recast: 0, range: 0, school: 'evo', tgt: 'enemy' }, o); };
const A = { abil: true, range: 5 }, S = { tgt: 'self' };

// Bulwark
sp('slam', 'Shield Slam', 'bulwark', 1, { ...A, recast: 10, strike: 1.2, stun: 1.5, d: 'A heavy blow that briefly stuns.' });
sp('goad', 'Goad', 'bulwark', 1, { abil: true, range: 30, recast: 6, taunt: 1, d: 'Forces a foe to attack you.' });
sp('brace', 'Brace', 'bulwark', 4, { abil: true, ...S, recast: 90, buff: { ac: 15, t: 30 }, d: 'Greatly raises armor for a short time.' });
sp('cleave', 'Cleave', 'bulwark', 8, { ...A, recast: 12, strike: 2, d: 'A powerful two-handed swing.' });
sp('rally', 'Rallying Shout', 'bulwark', 12, { abil: true, ...S, recast: 180, buff: { hp: 40, regen: 3, t: 120 }, d: 'Bolsters health and recovery.' });
sp('hamstring', 'Hamstring', 'bulwark', 16, { ...A, recast: 20, strike: 1.3, snare: { p: .5, t: 20 }, d: 'Wounds the legs, slowing a fleeing foe.' });
sp('laststand', 'Last Stand', 'bulwark', 20, { abil: true, ...S, recast: 600, healPct: .5, buff: { ac: 40, t: 20 }, d: 'Restores half your health and hardens you.' });
// Brawler
sp('snapkick', 'Snap Kick', 'brawler', 1, { ...A, recast: 6, strike: 1.4, d: 'A quick kick.' });
sp('breath', 'Steady Breath', 'brawler', 1, { abil: true, ...S, recast: 120, healPct: .25, d: 'Mends a quarter of your wounds.' });
sp('playdead', 'Play Dead', 'brawler', 4, { abil: true, ...S, recast: 12, feign: .85, d: 'Collapse convincingly. Foes may lose interest.' });
sp('flurry', 'Flurry', 'brawler', 8, { abil: true, ...S, recast: 90, buff: { haste: 30, t: 24 }, d: 'Attack much faster for a short time.' });
sp('sweep', 'Leg Sweep', 'brawler', 12, { ...A, recast: 20, strike: 1, stun: 3, d: 'Knocks a foe flat.' });
sp('ironskin', 'Iron Skin', 'brawler', 16, { abil: true, ...S, recast: 180, buff: { ac: 25, t: 60 }, d: 'Hardens the body against blows.' });
sp('skyfall', 'Skyfall Kick', 'brawler', 20, { ...A, recast: 30, strike: 3.5, d: 'A devastating leaping kick.' });
// Prowler
sp('ambush', 'Ambush', 'prowler', 1, { ...A, recast: 8, strike: 1.2, behind: 2.8, d: 'Deals far more damage from behind.' });
sp('slip', 'Slip Away', 'prowler', 1, { abil: true, ...S, recast: 20, invis: 40, d: 'Vanish from sight until you act.' });
sp('cheapshot', 'Cheap Shot', 'prowler', 4, { ...A, recast: 20, strike: .8, stun: 2.5, d: 'A dirty blow that stuns.' });
sp('envenom', 'Envenom', 'prowler', 8, { ...A, recast: 20, school: 'aff', dot: { d: 14, t: 30 }, d: 'Poisons the target.' });
sp('evade', 'Evade', 'prowler', 12, { abil: true, ...S, recast: 30, fade: 1, d: 'Foes may forget you entirely.' });
sp('cripple', 'Cripple', 'prowler', 16, { ...A, recast: 40, strike: 1, slow: { p: .3, t: 30 }, snare: { p: .5, t: 30 }, d: 'Slows a foe\'s attacks and movement.' });
sp('eviscerate', 'Eviscerate', 'prowler', 20, { ...A, recast: 20, strike: 2, behind: 4.5, d: 'A savage strike, deadliest from behind.' });
// Warden
sp('quickshot', 'Quickshot', 'warden', 1, { abil: true, range: 70, recast: 7, shot: [3, 7], d: 'Looses an arrow at range.' });
sp('mossbind', 'Mossbind', 'warden', 1, { mana: 8, cast: 2, range: 60, school: 'aff', snare: { p: .45, t: 60 }, d: 'Slows the target\'s movement.' });
sp('sap', 'Soothing Sap', 'warden', 4, { ...S, mana: 12, cast: 2.5, school: 'mnd', heal: [14, 20], d: 'A minor heal.' });
sp('bramble', 'Brambleskin', 'warden', 4, { ...S, mana: 15, cast: 3, school: 'wrd', buff: { ds: 2, ac: 4, t: 600 }, d: 'Thorns wound those who strike you.' });
sp('thornlash', 'Thornlash', 'warden', 8, { mana: 24, cast: 2.5, range: 60, dd: [26, 34], d: 'Lashes the target with thorns.' });
sp('trailstride', 'Trailstride', 'warden', 12, { ...S, mana: 30, cast: 4, school: 'wrd', buff: { speed: .35, t: 600 }, d: 'You run much faster.' });
sp('rootsnare', 'Rootsnare', 'warden', 12, { mana: 30, cast: 2.5, range: 60, school: 'aff', root: 40, d: 'Roots the target in place.' });
sp('sap2', 'Verdant Sap', 'warden', 16, { ...S, mana: 48, cast: 3, school: 'mnd', heal: [70, 90], d: 'A strong heal.' });
sp('volley', 'Volley', 'warden', 20, { abil: true, range: 70, recast: 20, shot: [60, 90], d: 'A punishing flight of arrows.' });
// Mender
sp('mend1', 'Minor Mending', 'mender', 1, { ...S, mana: 8, cast: 2, school: 'mnd', heal: [10, 14], d: 'A minor heal.' });
sp('hearth', 'Hearthblessing', 'mender', 1, { ...S, mana: 10, cast: 3, school: 'wrd', buff: { ac: 5, hp: 10, t: 900 }, d: 'Raises armor and health.' });
sp('rebuke', 'Rebuke', 'mender', 1, { mana: 8, cast: 2, range: 60, dd: [5, 8], d: 'Strikes with holy force.' });
sp('prayer', 'Homeward Prayer', 'mender', 4, { ...S, mana: 20, cast: 7, school: 'cnj', gate: 1, d: 'Returns you to Lanternhold.' });
sp('banish', 'Banish Rot', 'mender', 4, { mana: 14, cast: 2, range: 60, dd: [28, 36], undead: 1, d: 'Heavy damage, undead only.' });
sp('mend2', 'Mending', 'mender', 8, { ...S, mana: 24, cast: 2.5, school: 'mnd', heal: [40, 52], d: 'A solid heal.' });
sp('stillword', 'Word of Stillness', 'mender', 8, { mana: 22, cast: 1.5, recast: 12, range: 40, school: 'aff', dd: [10, 14], stun: 4, d: 'Stuns the target.' });
sp('vigil', 'Vigil', 'mender', 12, { ...S, mana: 40, cast: 4, school: 'wrd', buff: { regen: 4, ac: 10, hp: 30, t: 900 }, d: 'Armor, health and steady regeneration.' });
sp('hammer', 'Radiant Hammer', 'mender', 12, { mana: 42, cast: 2.8, range: 60, dd: [60, 74], d: 'A hammer of light.' });
sp('mend3', 'Greater Mending', 'mender', 16, { ...S, mana: 52, cast: 3, school: 'mnd', heal: [110, 135], d: 'A powerful heal.' });
sp('respite', 'Divine Respite', 'mender', 20, { ...S, mana: 110, cast: 9, school: 'mnd', healPct: 1, d: 'A long prayer that heals you fully.' });
// Stormcaller
sp('spark', 'Spark', 'stormcaller', 1, { mana: 8, cast: 1.8, range: 70, dd: [6, 9], d: 'A crackling bolt.' });
sp('mageward', 'Mage Ward', 'stormcaller', 1, { ...S, mana: 10, cast: 3, school: 'wrd', buff: { ac: 6, hp: 8, t: 900 }, d: 'A protective shell.' });
sp('shackle', 'Frost Shackle', 'stormcaller', 4, { mana: 14, cast: 2, range: 70, school: 'aff', root: 30, d: 'Freezes the target in place.' });
sp('lance', 'Static Lance', 'stormcaller', 4, { mana: 14, cast: 2.2, range: 70, dd: [16, 22], d: 'A lance of lightning.' });
sp('recall', 'Recall', 'stormcaller', 4, { ...S, mana: 20, cast: 7, school: 'cnj', gate: 1, d: 'Returns you to Lanternhold.' });
sp('shockwave', 'Shockwave', 'stormcaller', 8, { mana: 28, cast: 2.4, range: 70, dd: [36, 46], stun: 1, d: 'Damages and briefly stuns.' });
sp('mindspring', 'Mindspring', 'stormcaller', 12, { ...S, mana: 30, cast: 4, school: 'wrd', buff: { mregen: 3, t: 900 }, d: 'Mana returns faster.' });
sp('cinder', 'Cinder Burst', 'stormcaller', 12, { mana: 42, cast: 2.8, range: 70, dd: [74, 90], d: 'An eruption of embers.' });
sp('thunderhead', 'Thunderhead', 'stormcaller', 16, { mana: 70, cast: 5, range: 70, dd: [150, 180], d: 'Slow to cast. Hits like a falling sky.' });
sp('tempest', 'Tempest', 'stormcaller', 20, { mana: 78, cast: 3, range: 70, dd: [170, 200], d: 'The storm itself.' });
// Hexwright
sp('husk1', 'Raise Husk', 'hexwright', 1, { ...S, mana: 15, cast: 6, school: 'cnj', pet: { k: 'husk', cap: 5 }, d: 'Raises a servant to fight for you.' });
sp('leech', 'Leech Touch', 'hexwright', 1, { mana: 8, cast: 1.8, range: 60, tap: [4, 6], d: 'Steals a little life.' });
sp('rot', 'Rot', 'hexwright', 1, { mana: 7, cast: 2, range: 60, school: 'aff', dot: { d: 3, t: 36 }, d: 'Damage over time.' });
sp('dread', 'Dread', 'hexwright', 4, { mana: 14, cast: 2, range: 60, school: 'aff', fear: 18, d: 'The target flees in terror.' });
sp('chill', 'Grave Chill', 'hexwright', 4, { mana: 18, cast: 2.2, range: 60, school: 'aff', dot: { d: 6, t: 36 }, snare: { p: .35, t: 36 }, d: 'Damage over time and slowed movement.' });
sp('shadowstep', 'Shadowstep Home', 'hexwright', 4, { ...S, mana: 20, cast: 7, school: 'cnj', gate: 1, d: 'Returns you to Lanternhold.' });
sp('husk2', 'Raise Ghoul', 'hexwright', 8, { ...S, mana: 40, cast: 6, school: 'cnj', pet: { k: 'husk', cap: 12 }, d: 'Raises a stronger servant.' });
sp('siphon', 'Siphon', 'hexwright', 8, { mana: 28, cast: 2.4, range: 60, tap: [26, 34], d: 'Steals life.' });
sp('wither', 'Wither', 'hexwright', 12, { mana: 44, cast: 2.5, range: 60, school: 'aff', dot: { d: 26, t: 36 }, d: 'Heavy damage over time.' });
sp('pact', 'Pact of Dusk', 'hexwright', 12, { ...S, mana: 10, cast: 3, school: 'wrd', buff: { mregen: 5, regen: -4, t: 600 }, d: 'Trade your health for mana.' });
sp('pallor', 'Deathly Pallor', 'hexwright', 16, { ...S, mana: 20, cast: 1.5, school: 'aff', feign: .9, d: 'Feign death.' });
sp('husk3', 'Raise Revenant', 'hexwright', 16, { ...S, mana: 80, cast: 6, school: 'cnj', pet: { k: 'husk', cap: 19 }, d: 'Raises a fearsome servant.' });
sp('soulrend', 'Soulrend', 'hexwright', 20, { mana: 78, cast: 2.8, range: 60, tap: [110, 135], d: 'Tears life from the target.' });
// Lullsinger
sp('enthrall', 'Enthrall', 'lullsinger', 1, { mana: 10, cast: 2, range: 60, school: 'aff', mez: { t: 24, max: 10 }, d: 'Entrances a foe until it is harmed.' });
sp('jab', 'Mind Jab', 'lullsinger', 1, { mana: 8, cast: 1.8, range: 60, dd: [5, 8], d: 'A stab of thought.' });
sp('blade1', 'Dancing Blade', 'lullsinger', 1, { ...S, mana: 15, cast: 6, school: 'cnj', pet: { k: 'blade', cap: 5 }, d: 'Animates a sword to fight for you.' });
sp('veil', 'Shimmer Veil', 'lullsinger', 4, { ...S, mana: 15, cast: 3, school: 'wrd', invis: 120, d: 'Unseen until you act.' });
sp('quicken', 'Quicken', 'lullsinger', 4, { ...S, mana: 20, cast: 3, school: 'wrd', buff: { haste: 20, t: 600 }, d: 'You attack faster.' });
sp('tanglestep', 'Tanglestep', 'lullsinger', 4, { mana: 14, cast: 2, range: 60, school: 'aff', root: 30, d: 'Roots the target in place.' });
sp('lullaby', 'Lullaby of Home', 'lullsinger', 4, { ...S, mana: 20, cast: 7, school: 'cnj', gate: 1, d: 'Returns you to Lanternhold.' });
sp('lethargy', 'Lethargy', 'lullsinger', 8, { mana: 25, cast: 2.5, range: 60, school: 'aff', slow: { p: .35, t: 90 }, d: 'The target attacks much more slowly.' });
sp('blade2', 'Dancing Blades', 'lullsinger', 8, { ...S, mana: 40, cast: 6, school: 'cnj', pet: { k: 'blade', cap: 12 }, d: 'Animates a stronger weapon.' });
sp('lucid', 'Lucid Dream', 'lullsinger', 12, { ...S, mana: 35, cast: 4, school: 'wrd', buff: { mregen: 4, t: 900 }, d: 'Mana returns faster.' });
sp('discord', 'Discord', 'lullsinger', 12, { mana: 42, cast: 2.6, range: 60, dd: [62, 76], stun: 1.5, d: 'Damages and stuns.' });
sp('deepthrall', 'Deep Enthrall', 'lullsinger', 16, { mana: 30, cast: 2.5, range: 60, school: 'aff', mez: { t: 48, max: 20 }, d: 'A long, deep trance.' });
sp('shatter', 'Shatter Thought', 'lullsinger', 16, { mana: 58, cast: 2.8, range: 60, dd: [110, 130], d: 'Breaks the mind.' });
sp('blade3', 'Phantom Armory', 'lullsinger', 20, { ...S, mana: 90, cast: 6, school: 'cnj', pet: { k: 'blade', cap: 19 }, d: 'Animates a masterwork weapon.' });

export const ITEMS = {};
const it = (id, name, slot, o = {}) => { ITEMS[id] = { id, name, slot, val: 0, ...o }; };

// Shop armor: four tiers x five pieces
export const TIERS = ['Linen', 'Hide', 'Ringmail', 'Ironplate'];
[['head', 'Cap', 2], ['chest', 'Tunic', 4], ['legs', 'Leggings', 3], ['hands', 'Gloves', 1], ['feet', 'Boots', 1]].forEach(([slot, pn, base]) =>
  TIERS.forEach((tn, t) => { const ac = base * (t + 1); it(`a${t}_${slot}`, `${tn} ${pn}`, slot, { ac, arm: t, val: ac * ac * 12 + 20 }); }));

// Weapons: dmg / delay (tenths of a second)
it('worn_dagger', 'Worn Dagger', 'primary', { dmg: 3, delay: 22, wt: 'pierce', val: 8 });
it('rusty_sword', 'Rusty Sword', 'primary', { dmg: 4, delay: 28, wt: 'slash', val: 10 });
it('cracked_staff', 'Cracked Staff', 'primary', { dmg: 4, delay: 32, wt: 'blunt', val: 8 });
it('knotted_club', 'Knotted Club', 'primary', { dmg: 4, delay: 30, wt: 'blunt', val: 8 });
it('iron_dagger', 'Iron Dagger', 'primary', { dmg: 5, delay: 21, wt: 'pierce', val: 150 });
it('iron_sword', 'Iron Shortsword', 'primary', { dmg: 6, delay: 26, wt: 'slash', val: 220 });
it('iron_mace', 'Iron Mace', 'primary', { dmg: 7, delay: 30, wt: 'blunt', val: 220 });
it('oak_staff', 'Oak Staff', 'primary', { dmg: 7, delay: 31, wt: 'blunt', val: 200 });
it('hand_wraps', 'Studded Wraps', 'primary', { dmg: 6, delay: 21, wt: 'fist', val: 200 });
it('stiletto', 'Stiletto', 'primary', { dmg: 7, delay: 19, wt: 'pierce', val: 650 });
it('longsword', 'Longsword', 'primary', { dmg: 9, delay: 29, wt: 'slash', val: 700 });
it('warhammer', 'Warhammer', 'primary', { dmg: 10, delay: 33, wt: 'blunt', val: 700 });
it('iron_knuckles', 'Iron Knuckles', 'primary', { dmg: 9, delay: 20, wt: 'fist', val: 700 });
it('buckler', 'Buckler', 'secondary', { ac: 4, arm: 1, val: 180 });
it('kite_shield', 'Kite Shield', 'secondary', { ac: 8, arm: 2, val: 700 });
// Dropped gear
it('cutlass', 'Brigand Cutlass', 'primary', { dmg: 8, delay: 27, wt: 'slash', val: 300 });
it('skinning_knife', "Gristle's Skinning Knife", 'primary', { dmg: 8, delay: 18, wt: 'pierce', agi: 3, val: 600 });
it('silk_choker', "Silkmother's Choker", 'neck', { ac: 2, agi: 4, hp: 10, val: 700 });
it('antler_crown', 'Hollow Antler Crown', 'head', { ac: 6, wis: 4, int: 4, hp: 20, arm: 0, val: 2500 });
it('shade_wrap', 'Shadewoven Wrap', 'hands', { ac: 2, int: 2, wis: 2, mana: 10, arm: 0, val: 400 });
it('mire_spear', 'Mirefolk Spear', 'primary', { dmg: 11, delay: 30, wt: 'pierce', val: 500 });
it('mud_maul', 'Mud-caked Maul', 'primary', { dmg: 13, delay: 36, wt: 'blunt', val: 600 });
it('mire_vest', 'Mirefolk Scale Vest', 'chest', { ac: 10, sta: 2, arm: 1, val: 900 });
it('mire_greaves', 'Mirefolk Scale Greaves', 'legs', { ac: 8, arm: 1, val: 700 });
it('bog_gloves', 'Bogleather Gloves', 'hands', { ac: 3, agi: 2, str: 1, arm: 1, val: 500 });
it('caller_cowl', "Mudcaller's Cowl", 'head', { ac: 3, int: 3, wis: 3, mana: 15, arm: 0, val: 900 });
it('croak_ring', 'Croakstone Ring', 'ring', { ac: 3, hp: 15, val: 1200 });
it('warden_plate', 'Keepwarden Breastplate', 'chest', { ac: 18, sta: 3, hp: 10, arm: 3, val: 2600 });
it('warden_mail', 'Keepwarden Hauberk', 'chest', { ac: 14, sta: 2, agi: 2, arm: 2, val: 2200 });
it('ulg_hammer', "Ulg's Lash-hammer", 'primary', { dmg: 14, delay: 32, wt: 'blunt', str: 3, val: 2000 });
it('ulg_fists', "Taskmaster's Knuckles", 'primary', { dmg: 12, delay: 19, wt: 'fist', str: 2, val: 2000 });
it('seer_staff', "Seer's Driftwood Staff", 'primary', { dmg: 9, delay: 28, wt: 'blunt', int: 5, wis: 5, mana: 20, val: 2400 });
it('seer_fang', 'Bog-glass Fang', 'primary', { dmg: 11, delay: 18, wt: 'pierce', agi: 4, val: 2400 });
it('brood_cleaver', "Broodking's Cleaver", 'primary', { dmg: 18, delay: 30, wt: 'slash', str: 5, hp: 20, val: 6000 });
it('brood_signet', "Broodking's Signet", 'ring', { ac: 4, hp: 25, mana: 25, sta: 3, val: 6000 });
it('service_chain', 'Lanternhold Service Chain', 'neck', { ac: 2, hp: 10, wis: 2, int: 2, str: 2, val: 0 });
// Trade goods and quest items
const junk = (id, name, val) => it(id, name, 'misc', { val, stack: true });
junk('rat_tail', 'Moss Rat Tail', 3); junk('moth_dust', 'Moth Dust', 4); junk('beetle_shell', 'Beetle Shell', 6);
junk('thorn_hide', 'Thornback Hide', 14); junk('adder_fang', 'Adder Fang', 18); junk('bone_chips', 'Bone Chips', 12);
junk('wisp_ember', 'Wisp Ember', 60); junk('wolf_pelt', 'Duskfang Pelt', 35); junk('spider_silk', 'Lurker Silk', 45);
junk('claw_pelt', 'Greatclaw Pelt', 150); junk('shade_essence', 'Shade Essence', 110); junk('tally_knot', 'Mirefolk Tally-knot', 20);
junk('bog_pearl', 'Bog Pearl', 400);
// Spell scrolls
Object.values(SPELLS).filter(s => !s.abil && s.lvl > 1).forEach(s => it('sc_' + s.id, 'Scroll: ' + s.name, 'scroll', { spell: s.id, val: s.lvl * s.lvl * 8 + 10 }));

export const MOBS = {};
const mob = (id, name, lv, model, o = {}) => { MOBS[id] = { id, name, lv, model, ...o }; };
const frog = (c, o = {}) => ['human', { frog: 1, skin: c, top: 0x4a4030, bot: 0x39402c, ...o }];

// The Gloamwood
mob('moss_rat', 'a moss rat', [1, 1], ['quad', { c: 0x6b6a4a, s: .45 }], { loot: [['rat_tail', .7]] });
mob('dusk_moth', 'a dusk moth', [1, 2], ['flyer', { c: 0x8d7fa8, s: .7 }], { loot: [['moth_dust', .6]] });
mob('gloam_beetle', 'a gloam beetle', [1, 2], ['bug', { c: 0x2e3d4f, s: .6 }], { loot: [['beetle_shell', .6]] });
mob('thornback', 'a young thornback', [2, 3], ['quad', { c: 0x5a4634, s: .75, w: .6, h: .6 }], { loot: [['thorn_hide', .6]] });
mob('fen_adder', 'a fen adder', [3, 4], ['snake', { c: 0x4d6b2f }], { aggro: 1, agR: 9, loot: [['adder_fang', .5]] });
mob('restless', 'a restless skeleton', [3, 5], ['human', { bones: 1, skin: 0xd8d2bc, top: 0xd8d2bc, bot: 0xc8c2ac }], { aggro: 1, undead: 1, coin: 1, loot: [['bone_chips', .8], ['rusty_sword', .08], ['a0_head', .05]] });
mob('wisp', 'a lantern wisp', [4, 5], ['flyer', { c: 0xfff0a0, glow: 1 }], { loot: [['wisp_ember', .5]] });
mob('dusk_wolf', 'a duskfang wolf', [4, 6], ['quad', { c: 0x555a66, s: .85, tail: 1 }], { aggro: 1, social: 'wolf', speed: 7.3, loot: [['wolf_pelt', .5]] });
mob('brigand', 'a Hollow Road brigand', [5, 7], ['human', { top: 0x5a2f2a, bot: 0x2c2c30, wep: 1, hat: 0x2c2c30 }], { aggro: 1, social: 'brig', flee: 1, coin: 1, loot: [['iron_dagger', .05], ['cutlass', .04], ['a1_hands', .05], ['a1_feet', .05]] });
mob('gristle', 'Gristle the Poacher', [9, 9], ['human', { top: 0x3f4a2a, bot: 0x2c2c30, wep: 1, hat: 0x5a4634, s: 1.1 }], { aggro: 1, social: 'brig', named: 1, hp: 1.6, coin: 1, loot: [['skinning_knife', .5], ['wolf_pelt', 1], ['a1_chest', .25]] });
mob('web_lurker', 'a web lurker', [6, 7], ['bug', { c: 0x3a2f2a, s: 1, legs: 8 }], { aggro: 1, social: 'spider', loot: [['spider_silk', .6]] });
mob('mother_silk', 'Mother Silk', [10, 10], ['bug', { c: 0x5a1f2a, s: 1.8, legs: 8 }], { aggro: 1, social: 'spider', named: 1, hp: 1.8, loot: [['silk_choker', .6], ['spider_silk', 1]], spells: [{ name: 'Venom Spit', dd: [18, 30], cd: 14 }] });
mob('greatclaw', 'an old greatclaw', [8, 9], ['quad', { c: 0x4a3626, s: 1.5, w: .8, h: .8 }], { hp: 1.3, loot: [['claw_pelt', .7]] });
mob('mire_scout', 'a Mirefolk scout', [6, 8], frog(0x5f8a4a, { wep: 1 }), { aggro: 1, social: 'mire', flee: 1, coin: 1, loot: [['tally_knot', .4], ['mire_spear', .03]] });
mob('gloam_shade', 'a gloam shade', [7, 9], ['human', { skin: 0x15131c, top: 0x15131c, bot: 0x15131c }], { aggro: 1, undead: 1, night: 1, loot: [['shade_essence', .5], ['shade_wrap', .06]] });
mob('hollow_stag', 'the Hollow Stag', [15, 15], ['quad', { c: 0x8a8576, s: 1.7, antler: 1, lh: .8 }], { aggro: 1, agR: 22, named: 1, hp: 1.5, speed: 6.6, loot: [['antler_crown', .5], ['claw_pelt', .5]] });
// Drownstone Keep
const mire = (id, name, lv, c, o, loot) => mob(id, name, lv, frog(c, o), { aggro: 1, social: 'mire', coin: 1, flee: 1, ...loot });
mire('mire_grunt', 'a Mirefolk grunt', [8, 10], 0x5f8a4a, {}, { loot: [['tally_knot', .45], ['bog_gloves', .03]] });
mire('mire_spear', 'a Mirefolk spearman', [10, 12], 0x4f7a5a, { wep: 1 }, { loot: [['tally_knot', .45], ['mire_spear', .08], ['mire_greaves', .04]] });
mire('mire_caller', 'a Mirefolk mudcaller', [11, 13], 0x7a8a3a, { hat: 0x4a3a5a }, { loot: [['tally_knot', .45], ['caller_cowl', .06], ['bog_pearl', .1]],
  spells: [{ name: 'Mud Bolt', dd: [20, 34], cd: 11 }, { name: 'Murk Mend', heal: [60, 90], cd: 22 }] });
mire('mire_brute', 'a Mirefolk brute', [13, 15], 0x3f6a3a, { s: 1.3 }, { hp: 1.3, dmg: 1.2, flee: 0, loot: [['tally_knot', .5], ['mud_maul', .08], ['mire_vest', .05]] });
mire('mire_warden', 'a Mirefolk keepwarden', [15, 17], 0x3a5a6a, { s: 1.15, wep: 1, hat: 0x7a7a80 }, { flee: 0, loot: [['tally_knot', .6], ['croak_ring', .04], ['warden_plate', .03], ['warden_mail', .03]] });
mob('bog_hound', 'a bog hound', [9, 11], ['quad', { c: 0x3f4a35, s: .9, tail: 1 }], { aggro: 1, social: 'mire', speed: 7.3, loot: [['wolf_pelt', .3]] });
mire('ulg', 'Taskmaster Ulg', [14, 14], 0x8a6a3a, { s: 1.35, wep: 1 }, { named: 1, hp: 1.8, dmg: 1.2, flee: 0, loot: [['ulg_hammer', .4], ['ulg_fists', .4], ['tally_knot', 1]] });
mire('morbwa', 'Seer Morbwa', [16, 16], 0x9a8ac0, { s: 1.1, hat: 0x2a1a3a }, { named: 1, hp: 1.6, flee: 0, loot: [['seer_staff', .45], ['seer_fang', .45], ['bog_pearl', 1]],
  spells: [{ name: 'Drowning Hex', dd: [45, 70], cd: 9 }, { name: 'Murk Mend', heal: [150, 200], cd: 25 }] });
mire('grolm', 'Broodking Grolm', [20, 20], 0x8a3a3a, { s: 1.7, wep: 1, hat: 0xd8b84a }, { named: 1, hp: 2.5, dmg: 1.35, flee: 0, loot: [['brood_cleaver', .5], ['brood_signet', .5], ['bog_pearl', 1], ['croak_ring', .3]] });

export const PETS = {
  husk: { name: 'a risen husk', model: ['human', { bones: 1, skin: 0x9aa58a, top: 0x6a7560, bot: 0x4a5540 }], hp: .9, dmg: 1 },
  blade: { name: 'a dancing blade', model: ['blade', {}], hp: .7, dmg: 1.15 },
};
