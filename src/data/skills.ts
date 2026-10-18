import type { StatusId } from '../core/types';

export type Target = 'enemy' | 'self' | 'ally' | 'tile' | 'area';
export type Delivery = 'melee' | 'projectile' | 'nova' | 'self' | 'dash' | 'beam';

export interface SkillDef {
  id: string;
  name: string;
  short: string;
  sprite: string;
  cost: number;
  cooldown: number;
  /** minimum player level to unlock */
  level: number;
  desc: string;
  target: Target;
  delivery: Delivery;
  power: number;
  range: number;
  radius?: number;
  status?: { id: StatusId; turns: number; power: number; chance?: number };
  heal?: number;
  critBonus?: number;
  lifesteal?: number;
  steps?: number;
}

export const SKILLS: SkillDef[] = [
  {
    id: 'cleave', name: '大薙ぎ', short: '薙', sprite: 'cleave',
    cost: 3, cooldown: 3, level: 1,
    desc: '前方に踏み込みながら刃を振る。射程1の敵に強い一撃。',
    target: 'enemy', delivery: 'melee', power: 1.65, range: 1,
  },
  {
    id: 'ember_bolt', name: '燠火弾', short: '燠', sprite: 'ember',
    cost: 4, cooldown: 4, level: 1,
    desc: '熾火の礫を放つ。遠距離の敵を炎で焼く。',
    target: 'enemy', delivery: 'projectile', power: 1.35, range: 6,
    status: { id: 'burn', turns: 4, power: 4, chance: 0.65 },
  },
  {
    id: 'guard_up', name: '構え直し', short: '守', sprite: 'guard',
    cost: 3, cooldown: 8, level: 2,
    desc: '防御を固め、HPを少量回復する。3ターン被ダメージ-40%。',
    target: 'self', delivery: 'self', power: 0, range: 0, heal: 12,
    status: { id: 'guard', turns: 4, power: 40 },
  },
  {
    id: 'twin_fang', name: '双牙', short: '牙', sprite: 'fang',
    cost: 5, cooldown: 5, level: 3,
    desc: '二連撃。会心率が高い。出血を負わせる。',
    target: 'enemy', delivery: 'melee', power: 1.15, range: 1, critBonus: 25,
    status: { id: 'bleed', turns: 4, power: 5, chance: 0.7 },
  },
  {
    id: 'spirit_nova', name: '精霊の環', short: '環', sprite: 'nova',
    cost: 6, cooldown: 7, level: 4,
    desc: '周囲2マスを森の精霊が薙ぐ。複数の敵に有効。',
    target: 'area', delivery: 'nova', power: 1.2, range: 2, radius: 2,
  },
  {
    id: 'shadow_step', name: '影渡り', short: '影', sprite: 'step',
    cost: 4, cooldown: 6, level: 5,
    desc: '射程4まで瞬時に踏み込み、到達点の敵を斬る。',
    target: 'enemy', delivery: 'dash', power: 1.45, range: 4,
  },
  {
    id: 'mend_wounds', name: '癒しの手', short: '癒', sprite: 'heal',
    cost: 7, cooldown: 9, level: 6,
    desc: '傷を癒し、毒と出血を取り除く。HPを35%回復。',
    target: 'self', delivery: 'self', power: 0, range: 0, heal: 0.35,
    status: { id: 'regen', turns: 6, power: 6 },
  },
  {
    id: 'warcry', name: '抗戦の叫び', short: '叫', sprite: 'cry',
    cost: 5, cooldown: 12, level: 8,
    desc: '気力を漲らせる。10ターン攻撃力+30%。',
    target: 'self', delivery: 'self', power: 0, range: 0,
    status: { id: 'might', turns: 10, power: 30 },
  },
  {
    id: 'thorn_lance', name: '茨の槍', short: '茨', sprite: 'thorn',
    cost: 6, cooldown: 6, level: 10,
    desc: '直線8マスを貫く棘。並んだ敵をまとめて刺す。',
    target: 'enemy', delivery: 'beam', power: 1.8, range: 8,
    status: { id: 'bleed', turns: 3, power: 6, chance: 0.8 },
  },
  {
    id: 'last_light', name: '最期の灯', short: '灯', sprite: 'light',
    cost: 10, cooldown: 20, level: 14,
    desc: '森の名残の光を放ち、周囲3マスを浄化する。大ダメージ。',
    target: 'area', delivery: 'nova', power: 2.4, range: 3, radius: 3,
    lifesteal: 30,
  },
];

export const SKILL_BY_ID: Record<string, SkillDef> = Object.fromEntries(SKILLS.map((s) => [s.id, s]));

export function skillsForLevel(level: number): SkillDef[] {
  return SKILLS.filter((s) => s.level <= level);
}
