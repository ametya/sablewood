/* Shared types for the Sablewood simulation. Rendering-agnostic. */

export type Dir = 'down' | 'up' | 'left' | 'right';

export interface Stats {
  str: number; // 力
  dex: number; // 敏捷
  con: number; // 体力
  int: number; // 知性
  wil: number; // 意志
  per: number; // 知覚
}

export const STAT_KEYS: (keyof Stats)[] = ['str', 'dex', 'con', 'int', 'wil', 'per'];
export const STAT_LABEL: Record<keyof Stats, [string, string]> = {
  str: ['STR', '力'],
  dex: ['DEX', '敏捷'],
  con: ['CON', '体力'],
  int: ['INT', '知性'],
  wil: ['WIL', '意志'],
  per: ['PER', '知覚'],
};

/* ---------------------------------------------------------------- tiles */

export const T = {
  Void: 0,
  Floor: 1, // 石畳
  Wall: 2,
  Grass: 3,
  Dirt: 4,
  Water: 5,
  Rock: 6,
  Door: 7,
  StairsDown: 8,
  StairsUp: 9,
  Wood: 10,
  Sand: 11,
  Moss: 12,
  Bridge: 13,
  Rug: 14,
} as const;
export type TileKindValue = (typeof T)[keyof typeof T];

export const TILE_INFO: Record<number, { blocked: boolean; opaque: boolean; name: string }> = {
  [T.Void]: { blocked: true, opaque: true, name: '虚無' },
  [T.Floor]: { blocked: false, opaque: false, name: '石畳' },
  [T.Wall]: { blocked: true, opaque: true, name: '壁' },
  [T.Grass]: { blocked: false, opaque: false, name: '草' },
  [T.Dirt]: { blocked: false, opaque: false, name: '土' },
  [T.Water]: { blocked: true, opaque: false, name: '水' },
  [T.Rock]: { blocked: true, opaque: true, name: '岩' },
  [T.Door]: { blocked: false, opaque: false, name: '扉' },
  [T.StairsDown]: { blocked: false, opaque: false, name: '下り階段' },
  [T.StairsUp]: { blocked: false, opaque: false, name: '上り階段' },
  [T.Wood]: { blocked: false, opaque: false, name: '板' },
  [T.Sand]: { blocked: false, opaque: false, name: '砂' },
  [T.Moss]: { blocked: false, opaque: false, name: '苔' },
  [T.Bridge]: { blocked: false, opaque: false, name: '橋' },
  [T.Rug]: { blocked: false, opaque: false, name: '絨毯' },
};

/* ---------------------------------------------------------------- items */

export type Slot = 'weapon' | 'body' | 'head' | 'shield' | 'ring' | 'charm' | 'none';
export const SLOT_LABEL: Record<Slot, string> = {
  weapon: '武器',
  body: '体',
  head: '頭',
  shield: '盾',
  ring: '指輪',
  charm: '護符',
  none: '—',
};
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legend';
export const RARITY_LABEL: Record<Rarity, string> = {
  common: '並',
  uncommon: '良',
  rare: '希少',
  epic: '秘宝',
  legend: '伝承',
};

export type ItemKind = 'weapon' | 'armor' | 'consumable' | 'material' | 'quest';

export interface ConsumableEffect {
  heal?: number;
  sp?: number;
  cure?: string[];
  buff?: { name: string; turns: number; atk?: number; def?: number; crit?: number };
  teleport?: 'town';
  xp?: number;
}

export interface ItemBase {
  id: string;
  name: string;
  kind: ItemKind;
  slot: Slot;
  sprite: string;
  weight: number;
  value: number;
  desc: string;
  atk?: number;
  hit?: number;
  crit?: number;
  def?: number;
  range?: number;
  strReq?: number;
  stats?: Partial<Stats>;
  hp?: number;
  sp?: number;
  effect?: ConsumableEffect;
  stack?: number;
  rarityHint?: Rarity;
  twoHanded?: boolean;
}

export interface Affix {
  id: string;
  name: string;
  /** English-ish suffix form for ordering; only Japanese is shown. */
  tier: number;
  atk?: number;
  atkPct?: number;
  hit?: number;
  crit?: number;
  def?: number;
  hp?: number;
  sp?: number;
  eva?: number;
  lifesteal?: number;
  stats?: Partial<Stats>;
  element?: 'fire' | 'poison' | 'frost';
  /** multiplier used when computing item value */
  valueMul: number;
}

export interface Item {
  uid: number;
  base: string;
  prefix?: Affix;
  suffix?: Affix;
  upgrade: number;
  qty: number;
}

/* ---------------------------------------------------------------- status */

export type StatusId = 'poison' | 'burn' | 'bleed' | 'stun' | 'slow' | 'regen' | 'might' | 'guard' | 'weak' | 'focus' | 'bless';

export interface Status {
  id: StatusId;
  turns: number;
  power: number;
}

export const STATUS_LABEL: Record<StatusId, { name: string; floor: string; color: string }> = {
  poison: { name: '毒', floor: '毒を受けている', color: '#7fb069' },
  burn: { name: '炎上', floor: '燃えている', color: '#e08a3c' },
  bleed: { name: '出血', floor: '血が流れている', color: '#bf4438' },
  stun: { name: '硬直', floor: '動けない', color: '#d8c46a' },
  slow: { name: '鈍足', floor: '足が重い', color: '#6f8fb0' },
  regen: { name: '再生', floor: '傷が癒えていく', color: '#7fc9a0' },
  might: { name: '激昂', floor: '力が漲る', color: '#e0705f' },
  guard: { name: '防御', floor: '身を守っている', color: '#8ab6f0' },
  weak: { name: '虚弱', floor: '力が抜けている', color: '#9b8fb0' },
  focus: { name: '集中', floor: '精神が研ぎ澄まされている', color: '#b3a6ef' },
  bless: { name: '加護', floor: '加護に包まれている', color: '#f4d190' },
};

/* ---------------------------------------------------------------- entity */

export type EntityKind = 'player' | 'enemy' | 'npc' | 'prop' | 'item';

export type AiKind = 'melee' | 'erratic' | 'ranged' | 'pack' | 'boss' | 'idle';

export interface Entity {
  id: number;
  kind: EntityKind;
  x: number;
  y: number;
  /** render position in tile units, eased toward x/y */
  rx: number;
  ry: number;
  facing: Dir;
  name: string;
  sprite: string;
  palette?: string;

  hp: number;
  maxHp: number;
  sp: number;
  maxSp: number;
  stats: Stats;
  level: number;
  xp: number;

  atk: number;
  def: number;
  hit: number;
  eva: number;
  crit: number;
  statuses: Status[];

  alive: boolean;

  // enemies
  ai?: AiKind;
  xpReward?: number;
  goldMin?: number;
  goldMax?: number;
  aggro?: boolean;
  homeX?: number;
  homeY?: number;
  leash?: number;
  ranged?: boolean;
  rangedRange?: number;
  bossPhase?: number;
  minFloor?: number;
  maxFloor?: number;
  elite?: boolean;
  abilityCd?: number;
  /** boss-only: current telegraph */
  telegraph?: { kind: 'slam' | 'summon' | 'wave'; turns: number };

  // npc
  npcId?: string;
  dialogue?: string;

  // props
  solid?: boolean;
  propKind?: string;
  renderOffsetY?: number;
  /** tree/rock chop hp */
  breakable?: boolean;

  // ground items
  item?: Item;

  /** animation bookkeeping (cosmetic only) */
  animT?: number;
  flash?: number;
  lunge?: number;
  lungeDir?: Dir;
  dying?: number;
}

/* ---------------------------------------------------------------- map */

export interface GameMap {
  w: number;
  h: number;
  tiles: Uint8Array;
  seen: Uint8Array;
  visible: Uint8Array;
  kind: 'town' | 'dungeon';
  floor: number;
  /** spawn point of the player */
  spawnX: number;
  spawnY: number;
  name: string;
}

/* ---------------------------------------------------------------- events */

export type GameEvent =
  | { t: 'log'; text: string; cls?: 'good' | 'bad' | 'gold' | 'magic' | 'dim' }
  | { t: 'dmg'; x: number; y: number; amount: number; kind: 'phys' | 'crit' | 'fire' | 'poison' | 'frost' | 'heal' | 'miss' | 'sp' }
  | { t: 'shake'; amount: number }
  | { t: 'hitstop'; ms: number }
  | { t: 'sfx'; id: string }
  | { t: 'flash'; color: string; alpha: number }
  | { t: 'levelup'; level: number }
  | { t: 'banner'; text: string; sub?: string }
  | { t: 'step'; x: number; y: number; dust: boolean }
  | { t: 'particles'; x: number; y: number; kind: 'blood' | 'spark' | 'heal' | 'dust' | 'death' | 'gold' | 'magic'; n?: number }
  | { t: 'refresh' }
  | { t: 'death' }
  | { t: 'victory' }
  | { t: 'toast'; text: string; cls?: string };

/* ---------------------------------------------------------------- game */

export type Screen = 'title' | 'play' | 'dead' | 'won';

export interface QuestState {
  id: string;
  progress: number;
  done: boolean;
  claimed: boolean;
}

export interface WorldTime {
  day: number;
  /** 0..1 through the day; 0 = dawn */
  phase: number;
}

export interface PlayerState extends Entity {
  gold: number;
  /** unspent stat points */
  points: number;
  equip: Record<Exclude<Slot, 'none'>, number | null>;
  inventory: Item[];
  skills: string[];
  cooldowns: Record<string, number>;
  hunger: number;
  kills: number;
  deepest: number;
  quests: QuestState[];
  visitedTown: boolean;
}

export interface SaveData {
  v: number;
  seed: string;
  player: PlayerState;
  map: GameMap;
  entities: Entity[];
  time: WorldTime;
  stairsUpFloor: number;
  townSnapshot?: { entities: Entity[] };
  stats: { steps: number; kills: number; goldEarned: number; startedAt: number; playMs: number };
}
