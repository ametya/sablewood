import type { AiKind, Entity, Stats } from '../core/types';

export interface EnemyBase {
  id: string;
  name: string;
  sprite: string;
  palette?: string;
  ai: AiKind;
  hp: number;
  atk: number;
  def: number;
  hit: number;
  eva: number;
  crit: number;
  xp: number;
  speed: number; // 1 = normal, 2 = double action
  minFloor: number;
  maxFloor: number;
  range?: number;
  stats: Stats;
  solid?: boolean;
  gold?: [number, number];
}

const S = (str: number, dex: number, con: number, int: number, wil: number, per: number): Stats => ({
  str, dex, con, int, wil, per,
});

export const ENEMIES: EnemyBase[] = [
  {
    id: 'rat', name: '森鼠', sprite: 'rat', ai: 'erratic',
    hp: 12, atk: 3, def: 0, hit: 5, eva: 8, crit: 2, xp: 4, speed: 1, minFloor: 1, maxFloor: 3,
    stats: S(3, 6, 3, 1, 2, 5), gold: [0, 3],
  },
  {
    id: 'slime', name: '苔スライム', sprite: 'slime', ai: 'melee',
    hp: 20, atk: 4, def: 2, hit: 4, eva: 1, crit: 0, xp: 6, speed: 1, minFloor: 1, maxFloor: 4,
    stats: S(4, 2, 8, 1, 2, 2), gold: [0, 4],
  },
  {
    id: 'beetle', name: '甲虫', sprite: 'beetle', ai: 'melee',
    hp: 26, atk: 6, def: 4, hit: 6, eva: 2, crit: 2, xp: 9, speed: 1, minFloor: 1, maxFloor: 5,
    stats: S(6, 3, 9, 1, 3, 3), gold: [1, 5],
  },
  {
    id: 'wolf', name: '灰狼', sprite: 'wolf', ai: 'pack',
    hp: 30, atk: 8, def: 2, hit: 10, eva: 10, crit: 6, xp: 14, speed: 1, minFloor: 2, maxFloor: 6,
    stats: S(8, 10, 6, 2, 4, 8), gold: [2, 8],
  },
  {
    id: 'bat', name: '洞蝙蝠', sprite: 'bat', ai: 'erratic',
    hp: 22, atk: 7, def: 1, hit: 9, eva: 18, crit: 4, xp: 12, speed: 1, minFloor: 3, maxFloor: 8,
    stats: S(5, 14, 4, 2, 4, 12), gold: [1, 7],
  },
  {
    id: 'spider', name: '巣蜘蛛', sprite: 'spider', ai: 'ranged',
    hp: 34, atk: 9, def: 3, hit: 11, eva: 9, crit: 5, xp: 18, speed: 1, minFloor: 4, maxFloor: 9,
    range: 4, stats: S(8, 12, 6, 3, 4, 10), gold: [3, 10],
  },
  {
    id: 'bandit', name: '野盗', sprite: 'bandit', ai: 'melee',
    hp: 46, atk: 13, def: 6, hit: 13, eva: 8, crit: 8, xp: 26, speed: 1, minFloor: 5, maxFloor: 12,
    stats: S(12, 10, 10, 4, 5, 7), gold: [12, 26], solid: true,
  },
  {
    id: 'wisp', name: '鬼火', sprite: 'wisp', ai: 'ranged',
    hp: 30, atk: 11, def: 6, hit: 12, eva: 22, crit: 4, xp: 24, speed: 1, minFloor: 6, maxFloor: 13,
    range: 5, stats: S(5, 14, 5, 8, 10, 12), gold: [4, 14],
  },
  {
    id: 'treant_sapling', name: '若木の精', sprite: 'sapling', ai: 'melee',
    hp: 66, atk: 15, def: 12, hit: 8, eva: 0, crit: 3, xp: 34, speed: 1, minFloor: 7, maxFloor: 14,
    stats: S(16, 3, 18, 3, 8, 4), gold: [6, 18],
  },
  {
    id: 'hollow', name: '虚ろ人', sprite: 'hollow', ai: 'melee',
    hp: 74, atk: 19, def: 9, hit: 15, eva: 11, crit: 10, xp: 44, speed: 1, minFloor: 9, maxFloor: 18,
    stats: S(15, 13, 12, 6, 8, 10), gold: [10, 30],
  },
  {
    id: 'knight_of_rot', name: '朽ちた騎士', sprite: 'knight', ai: 'melee',
    hp: 128, atk: 24, def: 19, hit: 17, eva: 4, crit: 12, xp: 80, speed: 1, minFloor: 12, maxFloor: 99,
    stats: S(22, 8, 20, 5, 10, 8), gold: [22, 55], solid: true,
  },
  {
    id: 'grave_warden', name: '墓守', sprite: 'warden', ai: 'boss',
    hp: 210, atk: 21, def: 12, hit: 15, eva: 6, crit: 10, xp: 140, speed: 1, minFloor: 3, maxFloor: 99,
    stats: S(18, 10, 16, 8, 14, 12), gold: [60, 90], solid: true,
  },
  {
    id: 'oak_heart', name: '樫の心', sprite: 'heart', ai: 'boss',
    hp: 360, atk: 28, def: 20, hit: 17, eva: 2, crit: 12, xp: 320, speed: 1, minFloor: 8, maxFloor: 99,
    stats: S(28, 8, 24, 12, 18, 10), gold: [120, 170], solid: true,
  },
  {
    id: 'hollow_mother', name: '虚ろの母', sprite: 'mother', ai: 'boss',
    hp: 720, atk: 41, def: 27, hit: 22, eva: 8, crit: 16, xp: 900, speed: 1, minFloor: 18, maxFloor: 99,
    stats: S(40, 16, 34, 20, 28, 18), gold: [300, 420], solid: true,
  },
];

export const ENEMY_BY_ID: Record<string, EnemyBase> = Object.fromEntries(ENEMIES.map((e) => [e.id, e]));

export function eligibleEnemies(floor: number): EnemyBase[] {
  return ENEMIES.filter((e) => e.ai !== 'boss' && floor >= e.minFloor && floor <= e.maxFloor);
}

export function makeEnemy(base: EnemyBase, id: number, x: number, y: number, floor: number): Entity {
  // scaling: flat hp growth, mild atk/def growth
  const f = Math.max(0, floor - base.minFloor);
  const hp = Math.round(base.hp * (1 + f * 0.09));
  const atk = Math.round(base.atk * (1 + f * 0.06));
  const def = Math.round(base.def * (1 + f * 0.05));
  return {
    id, kind: 'enemy', x, y, rx: x, ry: y, facing: 'down',
    name: base.name, sprite: base.sprite, palette: base.palette,
    hp, maxHp: hp, sp: 0, maxSp: 0,
    stats: { ...base.stats },
    level: floor, xp: 0,
    atk, def, hit: base.hit, eva: base.eva, crit: base.crit,
    statuses: [], alive: true,
    ai: base.ai,
    xpReward: Math.round(base.xp * (1 + f * 0.07)),
    goldMin: base.gold?.[0] ?? 0, goldMax: base.gold?.[1] ?? 0,
    homeX: x, homeY: y, leash: 9,
    ranged: base.ai === 'ranged',
    rangedRange: base.range ?? 1,
    solid: base.solid,
    animT: 0,
    abilityCd: 0,
  };
}

/** Difficulty curve of a floor: how much xp/gold a clear is worth. */
export function floorLabel(floor: number): string {
  if (floor >= 25) return '深淵';
  if (floor >= 18) return '虚ろの底';
  if (floor >= 13) return '朽ちた回廊';
  if (floor >= 8) return '苔の陵';
  if (floor >= 4) return '根の迷路';
  return '森の入口';
}
