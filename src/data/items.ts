import type { Affix, Item, ItemBase, Rarity, Slot, Stats } from '../core/types';
import { RNG } from '../core/rng';

/* ============================================================
   Base items
   ============================================================ */

export const BASES: Record<string, ItemBase> = {};
function base(b: ItemBase & { scale?: 'str' | 'dex' | 'mixed' }) {
  BASES[b.id] = b;
}

/* --- weapons ------------------------------------------------- */
base({ id: 'rusty_dagger', name: '錆びた短剣', kind: 'weapon', slot: 'weapon', sprite: 'dagger', scale: 'dex',
  weight: 2, value: 10, atk: 4, hit: 6, crit: 4, desc: '刃こぼれした旅人の得物。しかし無いよりはましだ。' });
base({ id: 'iron_dagger', name: '鉄の短剣', kind: 'weapon', slot: 'weapon', sprite: 'dagger', scale: 'dex',
  weight: 2.4, value: 46, atk: 7, hit: 9, crit: 7, desc: '急所を狙うための軽量な刃。' });
base({ id: 'hunters_bow', name: '狩人の弓', kind: 'weapon', slot: 'weapon', sprite: 'bow', scale: 'dex',
  weight: 3, value: 68, atk: 7, hit: 6, crit: 5, range: 4, desc: '森の民が使う短弓。離れた敵を射抜く。', twoHanded: true });
base({ id: 'short_spear', name: '短槍', kind: 'weapon', slot: 'weapon', sprite: 'spear', scale: 'str',
  weight: 4.5, value: 52, atk: 8, hit: 5, crit: 3, range: 2, desc: '間合いの広い刺突武器。' });
base({ id: 'traveler_sword', name: '旅人の剣', kind: 'weapon', slot: 'weapon', sprite: 'sword', scale: 'str',
  weight: 5, value: 74, atk: 10, hit: 5, crit: 4, desc: '使い込まれた片手剣。信頼できる相棒。' });
base({ id: 'iron_longsword', name: '鉄の長剣', kind: 'weapon', slot: 'weapon', sprite: 'sword', scale: 'str',
  weight: 6.5, value: 150, atk: 14, hit: 6, crit: 5, strReq: 9, desc: '重厚な刀身。振るうには力が要る。' });
base({ id: 'war_axe', name: '戦斧', kind: 'weapon', slot: 'weapon', sprite: 'axe', scale: 'str',
  weight: 8, value: 190, atk: 19, hit: 2, crit: 8, strReq: 12, desc: '木を割る斧ではない。人を割る斧だ。' });
base({ id: 'oak_staff', name: '樫の杖', kind: 'weapon', slot: 'weapon', sprite: 'staff', scale: 'mixed',
  weight: 3.5, value: 96, atk: 7, hit: 7, crit: 3, sp: 4, desc: '森の巡礼者が持つ杖。気力を宿す。' });
base({ id: 'ritual_dagger', name: '儀式の短剣', kind: 'weapon', slot: 'weapon', sprite: 'dagger', scale: 'dex',
  weight: 2, value: 210, atk: 11, hit: 12, crit: 16, desc: '血を吸うように黒い刃。会心の一撃を呼ぶ。' });
base({ id: 'silver_rapier', name: '銀の細剣', kind: 'weapon', slot: 'weapon', sprite: 'rapier', scale: 'dex',
  weight: 3, value: 380, atk: 17, hit: 14, crit: 12, strReq: 7, desc: '貴族の護身用。針のように鋭い。' });
base({ id: 'hollow_blade', name: '虚ろの大剣', kind: 'weapon', slot: 'weapon', sprite: 'greatsword', scale: 'str',
  weight: 11, value: 720, atk: 27, hit: 4, crit: 10, strReq: 16, twoHanded: true, desc: '森の奥で眠っていた、苔むした大剣。' });

/* --- body ---------------------------------------------------- */
base({ id: 'cloth_tunic', name: '布の服', kind: 'armor', slot: 'body', sprite: 'armor', weight: 2, value: 12, def: 1,
  desc: '旅立ちの日に着た服。' });
base({ id: 'leather_vest', name: '革の胴着', kind: 'armor', slot: 'body', sprite: 'armor', weight: 4, value: 58, def: 4,
  desc: 'なめした獣皮。軽くて動きやすい。' });
base({ id: 'chain_mail', name: '鎖帷子', kind: 'armor', slot: 'body', sprite: 'armor', weight: 8, value: 170, def: 8,
  strReq: 8, desc: '細かな輪を編んだ鎧。斬撃に強い。' });
base({ id: 'forest_robe', name: '森のローブ', kind: 'armor', slot: 'body', sprite: 'robe', weight: 3, value: 140, def: 3,
  sp: 6, stats: { wil: 1 }, desc: '苔の匂いがする。気力の巡りが良くなる。' });
base({ id: 'iron_cuirass', name: '鉄の胸甲', kind: 'armor', slot: 'body', sprite: 'plate', weight: 12, value: 340, def: 14,
  strReq: 11, desc: '厚い鉄板。重いが頼もしい。' });

/* --- head ---------------------------------------------------- */
base({ id: 'traveler_hood', name: '旅人のフード', kind: 'armor', slot: 'head', sprite: 'hood', weight: 1, value: 16, def: 1,
  desc: '雨と視線を遮る。' });
base({ id: 'leather_cap', name: '革の帽子', kind: 'armor', slot: 'head', sprite: 'helm', weight: 1.2, value: 34, def: 2,
  desc: 'ありふれた帽子。' });
base({ id: 'iron_helm', name: '鉄兜', kind: 'armor', slot: 'head', sprite: 'helm', weight: 3, value: 120, def: 5,
  strReq: 7, desc: '頭を守る鉄の器。' });
base({ id: 'sage_circlet', name: '賢者のサークレット', kind: 'armor', slot: 'head', sprite: 'circlet', weight: 0.5,
  value: 260, def: 2, sp: 5, stats: { int: 1, wil: 1 }, desc: '銀の輪。思考を澄ませる。' });

/* --- shield -------------------------------------------------- */
base({ id: 'wood_shield', name: '木の盾', kind: 'armor', slot: 'shield', sprite: 'shield', weight: 4, value: 40, def: 3,
  desc: '樫の板を束ねた盾。' });
base({ id: 'iron_shield', name: '鉄の盾', kind: 'armor', slot: 'shield', sprite: 'shield', weight: 7, value: 150, def: 7,
  strReq: 8, desc: '頑丈な鉄の盾。' });

/* --- ring / charm ------------------------------------------- */
base({ id: 'ring_str', name: '力の指輪', kind: 'armor', slot: 'ring', sprite: 'ring', weight: 0.2, value: 180,
  stats: { str: 2 }, desc: '嵌めると腕が漲る。' });
base({ id: 'ring_dex', name: '俊敏の指輪', kind: 'armor', slot: 'ring', sprite: 'ring', weight: 0.2, value: 180,
  stats: { dex: 2 }, desc: '指先が軽くなる。' });
base({ id: 'ring_con', name: '守りの指輪', kind: 'armor', slot: 'ring', sprite: 'ring', weight: 0.2, value: 180,
  stats: { con: 2 }, desc: '体の芯が温かい。' });
base({ id: 'ring_wis', name: '賢者の指輪', kind: 'armor', slot: 'ring', sprite: 'ring', weight: 0.2, value: 200,
  stats: { int: 1, wil: 1 }, sp: 3, desc: '囁きが聞こえる気がする。' });
base({ id: 'charm_ward', name: '森の護符', kind: 'armor', slot: 'charm', sprite: 'charm', weight: 0.4, value: 220,
  hp: 12, stats: { con: 1 }, desc: '森の民の加護が宿る木片。' });
base({ id: 'charm_fang', name: '狼の牙', kind: 'armor', slot: 'charm', sprite: 'charm', weight: 0.3, value: 240,
  crit: 5, desc: 'かつて獲物を裂いた牙。' });

/* --- consumables -------------------------------------------- */
base({ id: 'potion_small', name: '回復薬（小）', kind: 'consumable', slot: 'none', sprite: 'potion', weight: 0.5,
  value: 25, stack: 9, effect: { heal: 30 }, desc: '赤い雫。HPを30回復する。' });
base({ id: 'potion_large', name: '回復薬（大）', kind: 'consumable', slot: 'none', sprite: 'potion2', weight: 0.7,
  value: 78, stack: 9, effect: { heal: 85 }, desc: '濃い赤。HPを85回復する。' });
base({ id: 'sp_potion', name: '気力薬', kind: 'consumable', slot: 'none', sprite: 'sp_potion', weight: 0.5,
  value: 42, stack: 9, effect: { sp: 6 }, desc: '青い雫。気力を6回復する。' });
base({ id: 'antidote', name: '毒消し草', kind: 'consumable', slot: 'none', sprite: 'herb', weight: 0.3,
  value: 18, stack: 9, effect: { cure: ['poison', 'bleed'] }, desc: '苦い。毒と出血を治す。' });
base({ id: 'grilled_meat', name: '焼き肉', kind: 'consumable', slot: 'none', sprite: 'meat', weight: 0.6,
  value: 30, stack: 9, effect: { heal: 18, buff: { name: '満腹', turns: 60, atk: 2 } }, desc: '香ばしい。しばらく攻撃力が上がる。' });
base({ id: 'elixir', name: 'エリクサー', kind: 'consumable', slot: 'none', sprite: 'elixir', weight: 0.4,
  value: 260, stack: 5, effect: { heal: 999, sp: 99, cure: ['poison', 'bleed', 'burn', 'weak', 'slow'] },
  desc: '全てを癒す黄金の雫。' });
base({ id: 'return_scroll', name: '帰還の巻物', kind: 'consumable', slot: 'none', sprite: 'scroll', weight: 0.2,
  value: 90, stack: 5, effect: { teleport: 'town' }, desc: 'ソーンベリ村へ一瞬で戻る。' });

/* --- materials ---------------------------------------------- */
base({ id: 'iron_ore', name: '鉄鉱石', kind: 'material', slot: 'none', sprite: 'ore', weight: 1.2, value: 16, stack: 99,
  desc: '鍛えれば武器になる。' });
base({ id: 'wood', name: '木材', kind: 'material', slot: 'none', sprite: 'wood', weight: 1, value: 8, stack: 99,
  desc: '乾いた薪。' });
base({ id: 'pelt', name: '獣の皮', kind: 'material', slot: 'none', sprite: 'pelt', weight: 0.8, value: 14, stack: 99,
  desc: 'なめせば防具になる。' });
base({ id: 'bone_shard', name: '骨片', kind: 'material', slot: 'none', sprite: 'bone', weight: 0.4, value: 9, stack: 99,
  desc: '白く乾いた骨。' });
base({ id: 'mana_shard', name: '魔力の欠片', kind: 'material', slot: 'none', sprite: 'shard', weight: 0.3, value: 46,
  stack: 99, desc: '淡く光る結晶。' });
base({ id: 'spider_silk', name: '蜘蛛の糸', kind: 'material', slot: 'none', sprite: 'silk', weight: 0.2, value: 12,
  stack: 99, desc: '粘り強い糸。' });
base({ id: 'hollow_ember', name: '虚ろの残り火', kind: 'material', slot: 'none', sprite: 'ember', weight: 0.2, value: 320,
  stack: 20, desc: 'ボスの名残。鍛冶師が欲しがる。' });

/* ============================================================
   Affixes
   ============================================================ */

export const PREFIXES: Affix[] = [
  { id: 'sharp', name: '鋭利な', tier: 1, atk: 2, hit: 2, valueMul: 1.25 },
  { id: 'heavy', name: '重厚な', tier: 1, atk: 4, hit: -3, valueMul: 1.2 },
  { id: 'fine', name: '精巧な', tier: 1, hit: 5, crit: 2, valueMul: 1.3 },
  { id: 'burning', name: '燃える', tier: 2, atk: 3, element: 'fire', valueMul: 1.5 },
  { id: 'venom', name: '毒の', tier: 2, atk: 2, element: 'poison', valueMul: 1.5 },
  { id: 'frost', name: '凍てつく', tier: 2, atk: 2, element: 'frost', valueMul: 1.5 },
  { id: 'warded', name: '守りの', tier: 1, def: 3, valueMul: 1.25 },
  { id: 'swift', name: '疾風の', tier: 2, eva: 6, valueMul: 1.4 },
  { id: 'vampiric', name: '血吸いの', tier: 3, lifesteal: 4, atk: 2, valueMul: 1.8 },
  { id: 'ancient', name: '古の', tier: 3, atk: 5, hp: 10, valueMul: 2.0 },
];

export const SUFFIXES: Affix[] = [
  { id: 'of_str', name: '力の', tier: 1, stats: { str: 1 }, valueMul: 1.25 },
  { id: 'of_dex', name: '敏捷の', tier: 1, stats: { dex: 1 }, valueMul: 1.25 },
  { id: 'of_con', name: '体力の', tier: 1, stats: { con: 1 }, hp: 4, valueMul: 1.25 },
  { id: 'of_wil', name: '意志の', tier: 1, stats: { wil: 1 }, sp: 2, valueMul: 1.25 },
  { id: 'of_per', name: '感知の', tier: 1, stats: { per: 1 }, crit: 2, valueMul: 1.25 },
  { id: 'of_wolf', name: '狼の', tier: 2, crit: 4, valueMul: 1.4 },
  { id: 'of_bear', name: '熊の', tier: 2, hp: 14, valueMul: 1.4 },
  { id: 'of_owl', name: '梟の', tier: 2, hit: 4, stats: { per: 1 } as Partial<Stats>, valueMul: 1.4 },
  { id: 'of_ember', name: '残り火の', tier: 3, atk: 4, element: 'fire', valueMul: 1.9 },
  { id: 'of_hollow', name: '虚ろの', tier: 3, atk: 6, hp: -6, valueMul: 2.1 },
];

const ALL_AFFIX = [...PREFIXES, ...SUFFIXES];

/* ============================================================
   Item construction
   ============================================================ */

export function getBase(id: string): ItemBase {
  const b = BASES[id];
  if (!b) throw new Error(`unknown item base: ${id}`);
  return b;
}

export function itemName(it: Item): string {
  const b = getBase(it.base);
  let n = '';
  if (it.prefix) n += it.prefix.name;
  n += b.name;
  if (it.suffix) n += '・' + it.suffix.name;
  if (it.upgrade > 0) n += ` +${it.upgrade}`;
  return n;
}

export function itemRarity(it: Item): Rarity {
  const b = getBase(it.base);
  let score = 0;
  if (it.prefix) score += it.prefix.tier;
  if (it.suffix) score += it.suffix.tier;
  score += Math.min(3, Math.floor(it.upgrade / 2));
  if (it.prefix && it.suffix) score += 1;
  if (score === 0) return b.rarityHint ?? 'common';
  if (score <= 1) return 'uncommon';
  if (score <= 3) return 'rare';
  if (score <= 5) return 'epic';
  return 'legend';
}

export interface AggregatedStats {
  atk: number;
  hit: number;
  crit: number;
  def: number;
  eva: number;
  hp: number;
  sp: number;
  lifesteal: number;
  stats: Partial<Stats>;
  element?: 'fire' | 'poison' | 'frost';
  range: number;
  weight: number;
}

export function itemStats(it: Item): AggregatedStats {
  const b = getBase(it.base);
  const agg: AggregatedStats = {
    atk: b.atk ?? 0,
    hit: b.hit ?? 0,
    crit: b.crit ?? 0,
    def: b.def ?? 0,
    eva: 0,
    hp: b.hp ?? 0,
    sp: b.sp ?? 0,
    lifesteal: 0,
    stats: { ...(b.stats ?? {}) },
    range: b.range ?? 1,
    weight: b.weight,
  };
  agg.atk += Math.round(it.upgrade * 1.6);
  agg.def += Math.round(it.upgrade * 1.1);
  agg.hit += it.upgrade;

  for (const af of [it.prefix, it.suffix]) {
    if (!af) continue;
    if (af.atk) agg.atk += af.atk;
    if (af.hit) agg.hit += af.hit;
    if (af.crit) agg.crit += af.crit;
    if (af.def) agg.def += af.def;
    if (af.eva) agg.eva += af.eva;
    if (af.hp) agg.hp += af.hp;
    if (af.sp) agg.sp += af.sp;
    if (af.lifesteal) agg.lifesteal += af.lifesteal;
    if (af.element) agg.element = af.element;
    if (af.stats) {
      for (const k of Object.keys(af.stats) as (keyof Stats)[]) {
        agg.stats[k] = (agg.stats[k] ?? 0) + (af.stats[k] ?? 0);
      }
    }
  }
  return agg;
}

export function itemValue(it: Item): number {
  const b = getBase(it.base);
  let mul = 1;
  if (it.prefix) mul *= it.prefix.valueMul;
  if (it.suffix) mul *= it.suffix.valueMul;
  mul *= 1 + it.upgrade * 0.22;
  return Math.max(1, Math.round(b.value * mul * (b.stack ? it.qty : 1)));
}

export function makeItem(id: string, qty = 1): Item {
  const b = getBase(id);
  return { uid: 0, base: id, upgrade: 0, qty: Math.min(qty, b.stack ?? 1) };
}

/* ============================================================
   Loot generation
   ============================================================ */

const WEAPON_POOL_BY_TIER: string[][] = [
  ['rusty_dagger', 'traveler_sword', 'wood_shield', 'cloth_tunic', 'traveler_hood'],
  ['iron_dagger', 'short_spear', 'traveler_sword', 'leather_vest', 'leather_cap', 'wood_shield'],
  ['hunters_bow', 'iron_longsword', 'oak_staff', 'chain_mail', 'iron_helm', 'iron_shield', 'forest_robe'],
  ['ritual_dagger', 'war_axe', 'iron_cuirass', 'sage_circlet', 'ring_str', 'ring_dex', 'charm_ward'],
  ['silver_rapier', 'hollow_blade', 'charm_fang', 'ring_wis', 'charm_ward'],
];

export interface LootOpts {
  level?: number;
  slot?: Slot;
  forceAffix?: number;
}

export function rollGear(rng: RNG, opts: LootOpts = {}): Item {
  const lvl = opts.level ?? 1;
  const maxTier = Math.min(4, Math.floor((lvl + 1) / 3));
  const tier = rng.int(Math.max(0, maxTier - 1), maxTier);
  let pool = WEAPON_POOL_BY_TIER[tier];
  if (opts.slot) {
    const filtered = pool.filter((id) => BASES[id].slot === opts.slot);
    if (filtered.length) pool = filtered;
  }
  const id = rng.pick(pool);
  const it = makeItem(id);

  const b = getBase(id);
  const affixBudget =
    opts.forceAffix !== undefined ? opts.forceAffix : rng.chance(0.62) ? 1 : rng.chance(0.35) ? 2 : 0;
  if (affixBudget > 0 && b.kind === 'armor' || b.kind === 'weapon') {
    const nPrefix = rng.chance(0.55) ? 1 : 0;
    const nSuffix = affixBudget - nPrefix;
    if (nPrefix) it.prefix = pickAffix(rng, PREFIXES, lvl);
    if (nSuffix > 0) it.suffix = pickAffix(rng, SUFFIXES, lvl);
    if (!it.prefix && !it.suffix && affixBudget > 0) it.prefix = pickAffix(rng, PREFIXES, lvl);
  }
  if (rng.chance(0.12 + lvl * 0.01)) it.upgrade = Math.min(5, rng.int(1, 1 + Math.floor(lvl / 6)));
  return it;
}

function pickAffix(rng: RNG, pool: Affix[], lvl: number): Affix {
  const maxTier = lvl < 4 ? 1 : lvl < 9 ? 2 : 3;
  const f = pool.filter((a) => a.tier <= maxTier);
  return rng.pick(f.length ? f : pool);
}

export function rollConsumable(rng: RNG, lvl: number): Item {
  const pool = ['potion_small', 'potion_small', 'sp_potion', 'antidote', 'grilled_meat'];
  if (lvl >= 3) pool.push('potion_large');
  if (lvl >= 6) pool.push('return_scroll');
  if (lvl >= 10) pool.push('elixir');
  return makeItem(rng.pick(pool));
}

export function rollMaterial(rng: RNG, lvl: number): Item {
  const pool = ['wood', 'pelt', 'bone_shard', 'spider_silk', 'iron_ore'];
  if (lvl >= 4) pool.push('mana_shard', 'iron_ore');
  return makeItem(rng.pick(pool), rng.int(1, 2));
}

export function rollLoot(rng: RNG, lvl: number, goldBias = 1): Item[] {
  const out: Item[] = [];
  const rolls = rng.chance(0.35) ? 2 : 1;
  for (let i = 0; i < rolls; i++) {
    const r = rng.next();
    if (r < 0.34) out.push(rollGear(rng, { level: lvl }));
    else if (r < 0.72) out.push(rollConsumable(rng, lvl));
    else out.push(rollMaterial(rng, lvl));
  }
  if (rng.chance(0.12 * goldBias)) out.push(makeItem('iron_ore', rng.int(1, 2)));
  return out;
}

export function allAffixes(): Affix[] {
  return ALL_AFFIX;
}

export function sellPrice(it: Item): number {
  return Math.max(1, Math.floor(itemValue(it) * 0.45));
}

export function buyPrice(it: Item): number {
  return Math.ceil(itemValue(it) * 1.15);
}
