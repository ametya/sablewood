import { RNG, clamp, dist2 } from './rng';
import type {
  Entity, GameEvent, GameMap, Item, PlayerState, SaveData, Screen, Slot, Stats, Status, StatusId, WorldTime, Dir,
} from './types';
import { T, STATUS_LABEL } from './types';
import { computeFov, genFloor, genTown, isBlocked, pruneUnreachable, tileAt, newEntityId, resetEntityIds } from '../world/mapgen';
import {
  BASES, buyPrice, getBase, itemName, itemRarity, itemStats, itemValue, makeItem,
  rollConsumable, rollGear, rollLoot, rollMaterial, sellPrice,
} from '../data/items';
import type { AggregatedStats } from '../data/items';
import { SKILL_BY_ID, skillsForLevel, type SkillDef } from '../data/skills';
import { ENEMIES, makeEnemy } from '../data/enemies';

export const INVENTORY_SLOTS = 24;
const SAVE_KEY = 'sablewood.save.v1';
const SAVE_VERSION = 1;

const DIRS: Record<Dir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

export interface QuestDef {
  id: string;
  name: string;
  text: string;
  goal: number;
  reward: number;
  kind: 'floor' | 'kills' | 'item' | 'boss';
  target?: string;
}

export const QUESTS: QuestDef[] = [
  {
    id: 'q_first_step', name: '森の入口', kind: 'floor', goal: 4, reward: 80,
    text: '森の下に眠る墓所へ降り、4層まで辿り着く。',
  },
  {
    id: 'q_wolves', name: '群れを割る', kind: 'kills', goal: 6, target: 'wolf', reward: 120,
    text: '灰狼を6体倒す。狩人ガレスが牙を欲しがっている。',
  },
  {
    id: 'q_ore', name: '鉄の支度', kind: 'item', goal: 4, target: 'iron_ore', reward: 100,
    text: '鉄鉱石を4つ集める。鍛冶師ハルドが待っている。',
  },
  {
    id: 'q_warden', name: '墓守を越えて', kind: 'boss', goal: 1, target: 'grave_warden', reward: 300,
    text: '4層の主、墓守を倒す。',
  },
  {
    id: 'q_depth', name: '樫の心', kind: 'floor', goal: 9, reward: 400,
    text: '森の深部、9層へ到達する。',
  },
  {
    id: 'q_mother', name: '虚ろを閉じる', kind: 'boss', goal: 1, target: 'hollow_mother', reward: 1500,
    text: '20層の虚ろの母を倒し、森の傷を閉じる。',
  },
];

/* ============================================================
   Game
   ============================================================ */

export class Game {
  seed: string;
  rng: RNG;
  screen: Screen = 'title';
  time: WorldTime = { day: 1, phase: 0 };
  map: GameMap;
  entities: Entity[] = [];
  player: PlayerState;
  events: GameEvent[] = [];
  turn = 0;
  autosaveBlocked = false;
  stats = { steps: 0, kills: 0, goldEarned: 0, startedAt: Date.now(), playMs: 0 };
  /** last town state so returning is cheap and stable */
  private townSnapshot: { entities: Entity[] } | null = null;
  paused = false;
  busy = false;

  constructor(seed = 'sablewood') {
    this.seed = seed;
    this.rng = new RNG(seed);
    this.map = genTown(this.rng).map;
    this.player = createPlayer('旅人');
    this.push({ t: 'refresh' });
  }

  /* ---------------------------------------------------------- setup */

  newGame(name: string, seed?: string): void {
    this.seed = seed && seed.trim() ? seed.trim() : `w${Date.now().toString(36)}`;
    this.rng = new RNG(this.seed);
    resetEntityIds(1);
    this.entities = [];
    this.player = createPlayer(name || '旅人');
    this.time = { day: 1, phase: 0 };
    this.turn = 0;
    this.stats = { steps: 0, kills: 0, goldEarned: 0, startedAt: Date.now(), playMs: 0 };
    this.townSnapshot = null;
    this.screen = 'play';
    this.enterTown(true);
    this.push({ t: 'log', text: 'ソーンベリ村。霧の向こうで森がざわめいている。', cls: 'magic' });
    this.push({ t: 'banner', text: 'ソーンベリ村', sub: '第1日 朝' });
    this.save();
  }

  /** Rebuild the village. `fresh` places the player at the spawn. */
  enterTown(fresh = false): void {
    const gen = genTown(new RNG(this.seed + ':town'));
    this.map = gen.map;
    this.entities = gen.entities;
    this.townSnapshot = { entities: this.entities.map((e) => ({ ...e })) };
    const p = this.player;
    if (fresh) {
      p.x = gen.map.spawnX;
      p.y = gen.map.spawnY;
    }
    p.rx = p.x;
    p.ry = p.y;
    this.recomputeDerived();
    computeFov(this.map, p.x, p.y, 9);
    this.push({ t: 'refresh' });
  }

  descend(): void {
    const p = this.player;
    const next = this.map.kind === 'town' ? 1 : this.map.floor + 1;
    if (next > 20) {
      this.push({ t: 'log', text: 'これ以上は降りられない。……森の底は、ここで終わっている。', cls: 'magic' });
      return;
    }
    if (this.map.kind === 'town') this.townSnapshot = { entities: this.entities.map((e) => ({ ...e })) };

    const gen = genFloor(new RNG(`${this.seed}:f${next}`), next);
    this.map = gen.map;
    this.entities = gen.entities;
    pruneUnreachable(this.map, gen.upX, gen.upY);
    p.x = gen.upX;
    p.y = gen.upY;
    p.rx = p.x;
    p.ry = p.y;
    p.deepest = Math.max(p.deepest, next);
    this.recomputeDerived();
    computeFov(this.map, p.x, p.y, 9);

    this.push({ t: 'banner', text: `${next}層`, sub: this.map.name });
    this.push({ t: 'log', text: `${this.map.name}へ降りた。`, cls: 'magic' });
    this.progressQuest('floor', next);
    this.save();
  }

  ascend(): void {
    const p = this.player;
    if (this.map.kind === 'town') return;
    if (this.map.floor <= 1) {
      this.enterTown(false);
      if (this.townSnapshot) this.entities = this.townSnapshot.entities.map((e) => ({ ...e }));
      p.x = 23;
      p.y = 19;
      p.rx = p.x;
      p.ry = p.y;
      computeFov(this.map, p.x, p.y, 9);
      this.push({ t: 'banner', text: 'ソーンベリ村', sub: 'ただいま' });
      p.visitedTown = true;
      this.save();
      return;
    }
    const prevFloor = this.map.floor - 1;
    const gen = genFloor(new RNG(`${this.seed}:f${prevFloor}`), prevFloor);
    this.map = gen.map;
    this.entities = gen.entities;
    pruneUnreachable(this.map, gen.downX, gen.downY);
    p.x = gen.downX;
    p.y = gen.downY;
    p.rx = p.x;
    p.ry = p.y;
    this.recomputeDerived();
    computeFov(this.map, p.x, p.y, 9);
    this.push({ t: 'banner', text: `${prevFloor}層`, sub: this.map.name });
    this.save();
  }

  /* ---------------------------------------------------------- derived */

  get equipStats(): AggregatedStats {
    const sum: AggregatedStats = {
      atk: 0, hit: 0, crit: 0, def: 0, eva: 0, hp: 0, sp: 0, lifesteal: 0, stats: {}, range: 1, weight: 0,
    };
    for (const slot of ['weapon', 'body', 'head', 'shield', 'ring', 'charm'] as const) {
      const uid = this.player.equip[slot];
      if (uid == null) continue;
      const it = this.player.inventory.find((i) => i.uid === uid);
      if (!it) continue;
      const s = itemStats(it);
      sum.atk += s.atk;
      sum.hit += s.hit;
      sum.crit += s.crit;
      sum.def += s.def;
      sum.eva += s.eva;
      sum.hp += s.hp;
      sum.sp += s.sp;
      sum.lifesteal += s.lifesteal;
      sum.weight += s.weight;
      if (slot === 'weapon') sum.range = Math.max(1, s.range);
      for (const k of Object.keys(s.stats) as (keyof Stats)[]) sum.stats[k] = (sum.stats[k] ?? 0) + (s.stats[k] ?? 0);
    }
    return sum;
  }

  get totalStats(): Stats {
    const eq = this.equipStats;
    const s = { ...this.player.stats };
    for (const k of Object.keys(eq.stats) as (keyof Stats)[]) s[k] += eq.stats[k] ?? 0;
    return s;
  }

  recomputeDerived(): void {
    const p = this.player;
    const eq = this.equipStats;
    const s = this.totalStats;
    const lvl = p.level;
    p.maxHp = 24 + s.con * 4 + lvl * 7 + eq.hp;
    p.maxSp = 5 + s.wil * 2 + Math.floor(lvl / 2) + eq.sp;
    p.atk = eq.atk + Math.floor(s.str * 0.7);
    p.hit = 10 + Math.floor(s.dex * 0.8) + eq.hit;
    p.eva = 4 + Math.floor(s.dex * 0.45) + eq.eva;
    p.crit = 3 + Math.floor(s.per * 0.4) + eq.crit;
    p.def = eq.def + Math.floor(s.con * 0.4);
    p.hp = Math.min(p.hp || p.maxHp, p.maxHp);
    p.sp = Math.min(p.sp || p.maxSp, p.maxSp);
    if (p.hp <= 0 && p.alive) p.hp = 1;
  }

  get xpToNext(): number {
    return Math.round(16 * Math.pow(this.player.level, 1.5)) + 8 * this.player.level;
  }

  /* ---------------------------------------------------------- events */

  push(e: GameEvent) {
    this.events.push(e);
  }

  drainEvents(): GameEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  log(text: string, cls?: 'good' | 'bad' | 'gold' | 'magic' | 'dim') {
    this.push({ t: 'log', text, cls });
  }

  /* ---------------------------------------------------------- queries */

  entityAt(x: number, y: number): Entity | undefined {
    for (const e of this.entities) {
      if (e.alive && e.x === x && e.y === y) return e;
    }
    return undefined;
  }

  enemiesIn(radius: number, cx = this.player.x, cy = this.player.y): Entity[] {
    const r2 = radius * radius;
    return this.entities.filter((e) => e.alive && e.kind === 'enemy' && dist2(e.x, e.y, cx, cy) <= r2);
  }

  nearestEnemy(maxRange: number): Entity | null {
    let best: Entity | null = null;
    let bestD = Infinity;
    for (const e of this.entities) {
      if (!e.alive || e.kind !== 'enemy') continue;
      const d = Math.max(Math.abs(e.x - this.player.x), Math.abs(e.y - this.player.y));
      if (d <= maxRange && d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  /** nearest enemy along a straight-ish line for auto-targeting */
  autoTarget(range: number): Entity | null {
    const cands = this.entities.filter(
      (e) => e.alive && e.kind === 'enemy' && dist2(e.x, e.y, this.player.x, this.player.y) <= range * range,
    );
    if (!cands.length) return null;
    cands.sort((a, b) => {
      const da = Math.abs(a.x - this.player.x) + Math.abs(a.y - this.player.y);
      const db = Math.abs(b.x - this.player.x) + Math.abs(b.y - this.player.y);
      return da - db;
    });
    return cands[0];
  }

  /* ---------------------------------------------------------- movement */

  canWalk(x: number, y: number): boolean {
    if (isBlocked(this.map, x, y)) return false;
    const t = tileAt(this.map, x, y);
    if (t === T.Void) return false;
    return true;
  }

  /** Player tries to step. Returns true if a turn was consumed. */
  step(dx: number, dy: number): boolean {
    if (this.busy || this.screen !== 'play') return false;
    const p = this.player;
    p.facing = dx > 0 ? 'right' : dx < 0 ? 'left' : dy > 0 ? 'down' : 'up';
    const nx = p.x + dx, ny = p.y + dy;

    const target = this.entityAt(nx, ny);
    if (target) {
      if (target.kind === 'enemy') {
        this.playerAttack(target);
        this.endTurn();
        return true;
      }
      if (target.kind === 'npc') {
        this.push({ t: 'toast', text: `${target.name} — Eで話す` });
        return false;
      }
      if (target.kind === 'prop') {
        if (target.propKind === 'chest') { this.openChest(target); return true; }
        if (target.propKind === 'loot') { this.pickupGround(target); return true; }
        if (target.breakable && target.propKind === '木') { this.chop(target); this.endTurn(); return true; }
        if (target.propKind === '骨の山') { this.searchBones(target); return true; }
        this.log(`${target.name}が行く手を阻んでいる。`, 'dim');
        return false;
      }
      return false;
    }

    if (!this.canWalk(nx, ny)) {
      // walking into water or wall: no turn
      return false;
    }

    p.x = nx;
    p.y = ny;
    p.facing = dx > 0 ? 'right' : dx < 0 ? 'left' : dy > 0 ? 'down' : 'up';
    this.stats.steps++;
    this.push({ t: 'step', x: nx, y: ny, dust: this.map.kind === 'town' });
    this.afterPlayerMove();
    this.endTurn();
    return true;
  }

  private afterPlayerMove() {
    const p = this.player;
    computeFov(this.map, p.x, p.y, 9);
    const t = tileAt(this.map, p.x, p.y);
    if (t === T.StairsDown && this.map.kind === 'town') {
      this.push({ t: 'toast', text: 'Eで森へ降りる' });
    } else if (t === T.StairsDown) {
      this.push({ t: 'toast', text: 'Eでさらに深くへ' });
    } else if (t === T.StairsUp) {
      this.push({ t: 'toast', text: this.map.floor <= 1 ? 'Eで村へ戻る' : 'Eで上へ' });
    }
    for (const e of this.entities) {
      if (e.alive && e.kind === 'enemy' && dist2(e.x, e.y, p.x, p.y) <= 1 && !e.aggro) {
        e.aggro = true;
        this.log(`${e.name}が気づいた。`, 'bad');
      }
    }
  }

  interact(): void {
    const p = this.player;
    const t = tileAt(this.map, p.x, p.y);
    if (t === T.StairsDown) { this.descend(); return; }
    if (t === T.StairsUp) { this.ascend(); return; }
    // face tile first
    const [dx, dy] = DIRS[p.facing];
    const target = this.entityAt(p.x + dx, p.y + dy) ?? this.entityAt(p.x, p.y);
    if (target?.kind === 'npc') {
      this.push({ t: 'log', text: `${target.name}「${target.dialogue ?? '……'}」`, cls: 'magic' });
      this.openNpc(target);
      return;
    }
    if (target?.kind === 'prop') {
      if (target.propKind === 'chest') { this.openChest(target); return; }
      if (target.propKind === 'loot') { this.pickupGround(target); return; }
      if (target.propKind === '骨の山') { this.searchBones(target); return; }
    }
    const here = this.entityAt(p.x, p.y);
    if (here?.item) { this.pickupGround(here); return; }
    this.log('何もない。', 'dim');
  }

  openNpc(npc: Entity): void {
    if (npc.npcId === 'merchant') this.push({ t: 'toast', text: '商人 — 売買はIキーの持ち物から' });
    if (npc.npcId === 'smith') this.push({ t: 'toast', text: '鍛冶師 — Iキーの持ち物で強化できる' });
    if (npc.npcId === 'innkeeper') this.push({ t: 'toast', text: '宿 — Rキーで休む（20金）' });
    this.log(`${npc.name}「${npc.dialogue ?? '……'}」`, 'magic');
  }

  /* ---------------------------------------------------------- props */

  private openChest(prop: Entity): void {
    prop.propKind = 'chest_open';
    prop.sprite = 'chest_open';
    const p = this.player;
    const gold = this.rng.int(8, 18) + this.map.floor * 7;
    p.gold += gold;
    this.stats.goldEarned += gold;
    this.log(`宝箱を開けた。${gold}金。`, 'gold');
    const items = rollLoot(this.rng, Math.max(1, this.map.floor + 1), 1.4);
    for (const it of items) {
      this.giveItem(it);
      this.log(`${itemName(it)}を手に入れた。`, 'good');
    }
    this.push({ t: 'particles', x: prop.x, y: prop.y, kind: 'gold', n: 14 });
    this.push({ t: 'sfx', id: 'chest' });
    this.save();
  }

  private pickupGround(prop: Entity): void {
    if (!prop.item) {
      prop.alive = false;
      return;
    }
    this.giveItem(prop.item);
    this.log(`${itemName(prop.item)}を拾った。`, 'good');
    prop.alive = false;
    this.push({ t: 'sfx', id: 'pickup' });
  }

  private chop(prop: Entity): void {
    const dmg = this.player.atk + this.rng.int(1, 4);
    prop.hp -= dmg;
    this.push({ t: 'particles', x: prop.x, y: prop.y, kind: 'dust', n: 8 });
    this.push({ t: 'sfx', id: 'chop' });
    if (prop.hp <= 0) {
      prop.alive = false;
      this.log('木を切り倒した。木材を手に入れた。', 'good');
      this.giveItem(makeItem('wood', this.rng.int(1, 2)));
      this.push({ t: 'particles', x: prop.x, y: prop.y, kind: 'death', n: 10 });
    }
  }

  private searchBones(prop: Entity): void {
    prop.alive = false;
    this.push({ t: 'sfx', id: 'pickup' });
    if (this.rng.chance(0.62)) {
      const it = rollMaterial(this.rng, this.map.floor);
      this.giveItem(it);
      this.log(`骨の山から${itemName(it)}を見つけた。`, 'good');
    } else {
      this.log('骨の山を漁ったが、何も残っていなかった。', 'dim');
    }
  }

  /* ---------------------------------------------------------- inventory */

  giveItem(it: Item): boolean {
    if (it.uid === 0) it.uid = newEntityId();
    const p = this.player;
    const b = getBase(it.base);
    if (b.stack && b.stack > 1) {
      const same = p.inventory.find((i) => i.base === it.base && i.prefix === it.prefix && i.suffix === it.suffix);
      if (same && same.qty < b.stack) {
        const room = b.stack - same.qty;
        const moved = Math.min(room, it.qty);
        same.qty += moved;
        it.qty -= moved;
        if (it.qty <= 0) return true;
      }
    }
    if (p.inventory.length >= INVENTORY_SLOTS) {
      this.log('持ち物がいっぱいだ。', 'bad');
      return false;
    }
    p.inventory.push(it);
    return true;
  }

  equip(uid: number): void {
    const p = this.player;
    const it = p.inventory.find((i) => i.uid === uid);
    if (!it) return;
    const b = getBase(it.base);
    if (b.kind !== 'weapon' && b.kind !== 'armor') return;
    const slot = b.slot as Exclude<Slot, 'none'>;
    p.equip[slot] = uid;
    this.recomputeDerived();
    this.log(`${itemName(it)}を装備した。`, 'good');
    this.push({ t: 'sfx', id: 'equip' });
    this.save();
  }

  unequip(slot: Exclude<Slot, 'none'>): void {
    this.player.equip[slot] = null;
    this.recomputeDerived();
    this.save();
  }

  isEquipped(uid: number): boolean {
    return Object.values(this.player.equip).some((v) => v === uid);
  }

  useItem(uid: number): boolean {
    const p = this.player;
    const it = p.inventory.find((i) => i.uid === uid);
    if (!it) return false;
    const b = getBase(it.base);
    if (b.kind !== 'consumable' || !b.effect) return false;
    const e = b.effect;
    let did = false;
    if (e.heal) {
      const before = p.hp;
      p.hp = Math.min(p.maxHp, p.hp + e.heal);
      const gained = p.hp - before;
      if (gained > 0) {
        this.push({ t: 'dmg', x: p.x, y: p.y, amount: gained, kind: 'heal' });
        did = true;
      }
    }
    if (e.sp) {
      const before = p.sp;
      p.sp = Math.min(p.maxSp, p.sp + e.sp);
      if (p.sp > before) did = true;
    }
    if (e.cure) {
      for (const s of e.cure) {
        if (p.statuses.some((x) => x.id === s)) {
          p.statuses = p.statuses.filter((x) => x.id !== s);
          did = true;
        }
      }
    }
    if (e.buff) {
      this.applyStatus(p, e.buff.name === '満腹' ? 'might' : 'might', e.buff.turns, 10);
      did = true;
    }
    if (e.xp) { this.gainXp(e.xp); did = true; }
    if (e.teleport === 'town') {
      this.enterTown(false);
      p.x = 23; p.y = 19; p.rx = p.x; p.ry = p.y;
      computeFov(this.map, p.x, p.y, 9);
      this.push({ t: 'banner', text: 'ソーンベリ村', sub: '帰還' });
      did = true;
    }
    if (!did) {
      this.log('今は必要ない。', 'dim');
      return false;
    }
    it.qty--;
    if (it.qty <= 0) {
      p.inventory = p.inventory.filter((i) => i.uid !== uid);
      for (const slot of Object.keys(p.equip) as (keyof typeof p.equip)[]) {
        if (p.equip[slot] === uid) p.equip[slot] = null;
      }
    }
    this.log(`${b.name}を使った。`, 'good');
    this.push({ t: 'particles', x: p.x, y: p.y, kind: e.heal ? 'heal' : 'magic', n: 10 });
    this.push({ t: 'sfx', id: 'drink' });
    this.recomputeDerived();
    this.endTurn();
    return true;
  }

  dropItem(uid: number): void {
    const p = this.player;
    const it = p.inventory.find((i) => i.uid === uid);
    if (!it) return;
    p.inventory = p.inventory.filter((i) => i.uid !== uid);
    if (this.isEquipped(uid)) {
      for (const slot of Object.keys(p.equip) as (keyof typeof p.equip)[]) {
        if (p.equip[slot] === uid) p.equip[slot] = null;
      }
    }
    const ground: Entity = {
      id: newEntityId(), kind: 'prop', x: p.x, y: p.y, rx: p.x, ry: p.y, facing: 'down',
      name: itemName(it), sprite: 'bag', hp: 1, maxHp: 1, sp: 0, maxSp: 0,
      stats: { str: 0, dex: 0, con: 0, int: 0, wil: 0, per: 0 },
      level: 1, xp: 0, atk: 0, def: 0, hit: 0, eva: 0, crit: 0,
      statuses: [], alive: true, solid: false, propKind: 'loot', item: it,
    };
    this.entities.push(ground);
    this.recomputeDerived();
    this.log(`${itemName(it)}を置いた。`, 'dim');
    this.save();
  }

  /* ---------------------------------------------------------- shop */

  buy(baseId: string): boolean {
    const p = this.player;
    const b = BASES[baseId];
    if (!b) return false;
    const it = makeItem(baseId, 1);
    const price = buyPrice(it);
    if (p.gold < price) { this.log('金が足りない。', 'bad'); return false; }
    if (!this.giveItem(it)) return false;
    p.gold -= price;
    this.log(`${itemName(it)}を${price}金で買った。`, 'gold');
    this.push({ t: 'sfx', id: 'coin' });
    this.save();
    return true;
  }

  sell(uid: number): boolean {
    const p = this.player;
    const it = p.inventory.find((i) => i.uid === uid);
    if (!it) return false;
    if (this.isEquipped(uid)) { this.log('装備中だ。外してから売ろう。', 'bad'); return false; }
    const price = sellPrice(it);
    p.gold += price;
    this.stats.goldEarned += price;
    p.inventory = p.inventory.filter((i) => i.uid !== uid);
    this.log(`${itemName(it)}を${price}金で売った。`, 'gold');
    this.push({ t: 'sfx', id: 'coin' });
    this.save();
    return true;
  }

  upgradeCost(it: Item): { gold: number; ore: number } | null {
    if (it.upgrade >= 5) return null;
    return { gold: 40 + it.upgrade * 55 + getBase(it.base).value, ore: 1 + it.upgrade };
  }

  upgrade(uid: number): boolean {
    const p = this.player;
    const it = p.inventory.find((i) => i.uid === uid);
    if (!it) return false;
    const cost = this.upgradeCost(it);
    if (!cost) { this.log('これ以上は鍛えられない。', 'bad'); return false; }
    const ore = p.inventory.find((i) => i.base === 'iron_ore');
    if (p.gold < cost.gold || !ore || ore.qty < cost.ore) {
      this.log('金か鉄鉱石が足りない。', 'bad');
      return false;
    }
    p.gold -= cost.gold;
    ore.qty -= cost.ore;
    if (ore.qty <= 0) p.inventory = p.inventory.filter((i) => i.uid !== ore.uid);
    it.upgrade++;
    this.recomputeDerived();
    this.log(`${itemName(it)}を鍛えた。`, 'gold');
    this.push({ t: 'sfx', id: 'anvil' });
    this.push({ t: 'particles', x: p.x, y: p.y, kind: 'spark', n: 14 });
    this.save();
    return true;
  }

  rest(): boolean {
    const p = this.player;
    const cost = 20;
    if (p.gold < cost) { this.log('金が足りない。', 'bad'); return false; }
    p.gold -= cost;
    p.hp = p.maxHp;
    p.sp = p.maxSp;
    p.statuses = [];
    p.hunger = 100;
    this.time.day++;
    this.time.phase = 0;
    this.log('ぐっすり眠った。HPと気力が回復した。', 'good');
    this.push({ t: 'banner', text: `${this.time.day}日目`, sub: '朝' });
    this.push({ t: 'sfx', id: 'rest' });
    this.save();
    return true;
  }

  /* ---------------------------------------------------------- combat */

  private attackRoll(atkHit: number, atkCrit: number, baseDmg: number, target: Entity, element?: AggregatedStats['element']) {
    const hitChance = clamp(0.62 + (atkHit - target.eva) * 0.018, 0.28, 0.97);
    if (!this.rng.chance(hitChance)) return { hit: false, dmg: 0, crit: false };
    const jitter = this.rng.range(0.88, 1.12);
    let dmg = baseDmg * jitter - target.def * 0.55;
    dmg = Math.max(1, dmg);
    const critChance = clamp(atkCrit / 100 + 0.02, 0, 0.62);
    const crit = this.rng.chance(critChance);
    if (crit) dmg *= 1.85;
    dmg = Math.round(dmg);
    if (element === 'fire') dmg = Math.round(dmg * 1.08);
    return { hit: true, dmg, crit };
  }

  playerAttack(target: Entity): void {
    const p = this.player;
    const might = p.statuses.find((s) => s.id === 'might');
    const atk = Math.round(p.atk * (1 + (might ? might.power / 100 : 0)));
    const res = this.attackRoll(p.hit, p.crit, atk, target);
    const dx = Math.sign(target.x - p.x), dy = Math.sign(target.y - p.y);
    if (dx || dy) p.facing = dx > 0 ? 'right' : dx < 0 ? 'left' : dy > 0 ? 'down' : 'up';
    p.lunge = 1;
    p.lungeDir = p.facing;

    if (!res.hit) {
      this.push({ t: 'dmg', x: target.x, y: target.y, amount: 0, kind: 'miss' });
      this.push({ t: 'sfx', id: 'miss' });
      return;
    }
    const eq = this.equipStats;
    this.damageEnemy(target, res.dmg, res.crit, eq.element);
    if (eq.lifesteal > 0) {
      const heal = Math.max(1, Math.round(res.dmg * (eq.lifesteal / 100)));
      p.hp = Math.min(p.maxHp, p.hp + heal);
      this.push({ t: 'dmg', x: p.x, y: p.y, amount: heal, kind: 'heal' });
    }
  }

  damageEnemy(target: Entity, dmg: number, crit: boolean, element?: AggregatedStats['element']) {
    if (!target.alive) return;
    target.hp -= dmg;
    target.flash = 1;
    const kind = crit ? 'crit' : element === 'fire' ? 'fire' : element === 'poison' ? 'poison' : 'phys';
    this.push({ t: 'dmg', x: target.x, y: target.y, amount: dmg, kind });
    this.push({ t: 'particles', x: target.x, y: target.y, kind: 'blood', n: crit ? 12 : 6 });
    this.push({ t: 'shake', amount: crit ? 5 : 2 });
    this.push({ t: 'hitstop', ms: crit ? 80 : 45 });
    this.push({ t: 'sfx', id: crit ? 'crit' : 'hit' });

    if (element === 'fire' && this.rng.chance(0.25)) this.applyStatus(target, 'burn', 3, 3 + Math.floor(target.level * 0.4));
    if (element === 'poison' && this.rng.chance(0.25)) this.applyStatus(target, 'poison', 4, 2 + Math.floor(target.level * 0.3));
    if (element === 'frost' && this.rng.chance(0.2)) this.applyStatus(target, 'slow', 3, 40);

    if (target.hp <= 0) this.killEnemy(target);
  }

  killEnemy(target: Entity): void {
    target.alive = false;
    target.dying = 1;
    const p = this.player;
    this.stats.kills++;
    p.kills++;
    const gold = target.goldMin !== undefined && target.goldMax !== undefined
      ? this.rng.int(target.goldMin, target.goldMax)
      : 0;
    if (gold > 0) {
      p.gold += gold;
      this.stats.goldEarned += gold;
      this.push({ t: 'dmg', x: target.x, y: target.y, amount: gold, kind: 'heal' });
    }
    this.push({ t: 'particles', x: target.x, y: target.y, kind: 'death', n: 16 });
    this.push({ t: 'sfx', id: 'kill' });
    this.log(`${target.name}を倒した。${gold > 0 ? `+${gold}金` : ''}`.trim(), 'good');

    // loot drops
    const drops = rollLoot(this.rng, Math.max(1, target.level), target.ai === 'boss' ? 3 : 1);
    if (target.ai === 'boss') {
      this.giveItem(makeItem('hollow_ember', 1 + Math.floor(this.map.floor / 8)));
      this.push({ t: 'banner', text: '主を討った', sub: '虚ろの残り火を手に入れた' });
    }
    for (const d of drops) {
      // find free tile
      const spot = this.freeSpotNear(target.x, target.y);
      if (!spot) { this.giveItem(d); continue; }
      this.entities.push(groundItem(d, spot.x, spot.y));
    }
    this.gainXp(target.xpReward ?? Math.round(target.level * 4));
    this.progressQuest('kills', 1, target.sprite);
    if (target.ai === 'boss') this.progressQuest('boss', 1, target.sprite, true);
    this.save();
  }

  private freeSpotNear(x: number, y: number): { x: number; y: number } | null {
    for (let r = 0; r < 5; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const nx = x + dx, ny = y + dy;
          if (!this.canWalk(nx, ny)) continue;
          if (this.entityAt(nx, ny)) continue;
          return { x: nx, y: y + dy };
        }
      }
    }
    return null;
  }

  gainXp(amount: number): void {
    const p = this.player;
    p.xp += amount;
    let leveled = false;
    while (p.xp >= this.xpToNext) {
      p.xp -= this.xpToNext;
      p.level++;
      p.points += 2;
      p.hp = p.maxHp;
      p.sp = p.maxSp;
      leveled = true;
      this.push({ t: 'levelup', level: p.level });
      this.push({ t: 'banner', text: `Lv.${p.level}`, sub: '成長した' });
      for (const s of skillsForLevel(p.level)) {
        if (!p.skills.includes(s.id)) {
          p.skills.push(s.id);
          this.log(`新しい技を覚えた: ${s.name}`, 'gold');
        }
      }
    }
    if (leveled) {
      this.recomputeDerived();
      this.push({ t: 'flash', color: '#f4d190', alpha: 0.35 });
      this.push({ t: 'sfx', id: 'levelup' });
    }
  }

  applyStatus(target: Entity, id: StatusId, turns: number, power: number): void {
    const existing = target.statuses.find((s) => s.id === id);
    if (existing) {
      existing.turns = Math.max(existing.turns, turns);
      existing.power = Math.max(existing.power, power);
    } else {
      target.statuses.push({ id, turns, power });
    }
    if (target.kind === 'player') {
      this.log(`${STATUS_LABEL[id].name}になった。`, 'bad');
    }
  }

  spendPoint(key: keyof Stats): void {
    const p = this.player;
    if (p.points <= 0) return;
    p.stats[key]++;
    p.points--;
    this.recomputeDerived();
    this.log(`${key.toUpperCase()}が上がった。`, 'good');
    this.push({ t: 'sfx', id: 'equip' });
    this.save();
  }

  /* ---------------------------------------------------------- skills */

  skillState(id: string): { def: SkillDef; ready: boolean; cd: number; cost: number; unlocked: boolean } | null {
    const def = SKILL_BY_ID[id];
    if (!def) return null;
    const p = this.player;
    return {
      def,
      ready: (p.cooldowns[id] ?? 0) <= 0 && p.sp >= def.cost && p.level >= def.level,
      cd: p.cooldowns[id] ?? 0,
      cost: def.cost,
      unlocked: p.level >= def.level,
    };
  }

  useSkill(id: string, tx?: number, ty?: number): boolean {
    if (this.busy || this.screen !== 'play') return false;
    const st = this.skillState(id);
    if (!st || !st.ready) {
      if (st && st.cd > 0) this.log('まだ技の間合いではない。', 'dim');
      else if (st && this.player.sp < st.cost) this.log('気力が足りない。', 'bad');
      return false;
    }
    const def = st.def;
    const p = this.player;
    let target: Entity | null = null;

    if (def.target === 'enemy') {
      if (tx !== undefined && ty !== undefined) {
        const e = this.entityAt(tx, ty);
        if (e && e.kind === 'enemy') target = e;
      }
      if (!target) target = this.autoTarget(def.range);
      if (!target) { this.log('狙える敵がいない。', 'dim'); return false; }
      const d = Math.max(Math.abs(target.x - p.x), Math.abs(target.y - p.y));
      if (d > def.range) { this.log('遠すぎる。', 'dim'); return false; }
      this.faceToward(target.x, target.y);
    }

    p.sp -= def.cost;
    p.cooldowns[id] = def.cooldown;
    this.push({ t: 'sfx', id: 'skill' });

    switch (def.delivery) {
      case 'melee':
        if (target) {
          const might = p.statuses.find((s) => s.id === 'might');
          const atk = Math.round(p.atk * (1 + (might ? might.power / 100 : 0)) * def.power);
          const res = this.attackRoll(p.hit + (def.critBonus ?? 0) * 0.3, p.crit + (def.critBonus ?? 0), atk, target);
          p.lunge = 1;
          p.lungeDir = p.facing;
          if (res.hit) {
            this.damageEnemy(target, res.dmg, res.crit);
            if (def.status && (def.status.chance ?? 1) > this.rng.next()) {
              this.applyStatus(target, def.status.id, def.status.turns, def.status.power);
            }
          } else {
            this.push({ t: 'dmg', x: target.x, y: target.y, amount: 0, kind: 'miss' });
            this.push({ t: 'sfx', id: 'miss' });
          }
          this.push({ t: 'particles', x: target.x, y: target.y, kind: 'spark', n: 14 });
        }
        break;

      case 'projectile':
        if (target) {
          this.projectileTo(target.x, target.y, def);
          const atk = Math.round(p.atk * def.power);
          const res = this.attackRoll(p.hit + 4, p.crit, atk, target);
          if (res.hit) {
            this.damageEnemy(target, res.dmg, res.crit, def.status?.id === 'burn' ? 'fire' : undefined);
            if (def.status && (def.status.chance ?? 1) > this.rng.next()) {
              this.applyStatus(target, def.status.id, def.status.turns, def.status.power);
            }
          } else {
            this.push({ t: 'dmg', x: target.x, y: target.y, amount: 0, kind: 'miss' });
          }
        }
        break;

      case 'beam': {
        const [dx, dy] = DIRS[p.facing];
        let hitCount = 0;
        for (let i = 1; i <= def.range; i++) {
          const x = p.x + dx * i, y = p.y + dy * i;
          if (isBlocked(this.map, x, y)) break;
          this.push({ t: 'particles', x, y, kind: 'magic', n: 4 });
          const e = this.entityAt(x, y);
          if (e?.kind === 'enemy') {
            const atk = Math.round(p.atk * def.power);
            const res = this.attackRoll(p.hit, p.crit, atk, e);
            if (res.hit) {
              this.damageEnemy(e, res.dmg, res.crit);
              if (def.status) this.applyStatus(e, def.status.id, def.status.turns, def.status.power);
              hitCount++;
            }
          }
        }
        if (hitCount === 0) this.log('茨は空を裂いた。', 'dim');
        break;
      }

      case 'nova': {
        const radius = def.radius ?? def.range;
        const targets = this.enemiesIn(radius + 0.1);
        for (const e of targets) {
          const atk = Math.round(p.atk * def.power);
          const res = this.attackRoll(p.hit, p.crit, atk, e);
          if (res.hit) this.damageEnemy(e, res.dmg, res.crit);
        }
        for (let i = 0; i < 26; i++) {
          const a = (i / 26) * Math.PI * 2;
          this.push({ t: 'particles', x: p.x + Math.cos(a) * radius * 0.9, y: p.y + Math.sin(a) * radius * 0.9, kind: 'magic', n: 2 });
        }
        this.push({ t: 'flash', color: '#b3a6ef', alpha: 0.18 });
        if (def.lifesteal) {
          const heal = Math.round(p.maxHp * (def.lifesteal / 100));
          p.hp = Math.min(p.maxHp, p.hp + heal);
          this.push({ t: 'dmg', x: p.x, y: p.y, amount: heal, kind: 'heal' });
        }
        this.log(`${def.name}！`, 'magic');
        break;
      }

      case 'dash': {
        if (target) {
          const free = this.freeSpotNear(target.x, target.y);
          if (free) {
            this.push({ t: 'particles', x: p.x, y: p.y, kind: 'dust', n: 10 });
            p.x = free.x;
            p.y = free.y;
            p.rx = p.x;
            p.ry = p.y;
            computeFov(this.map, p.x, p.y, 9);
            this.push({ t: 'particles', x: p.x, y: p.y, kind: 'magic', n: 12 });
            const atk = Math.round(p.atk * def.power);
            const res = this.attackRoll(p.hit + 8, p.crit + 10, atk, target);
            if (res.hit) this.damageEnemy(target, res.dmg, res.crit);
            this.log(`${def.name}！`, 'magic');
          }
        }
        break;
      }

      case 'self': {
        if (def.heal) {
          const amount = def.heal < 1 ? Math.round(p.maxHp * def.heal) : def.heal;
          p.hp = Math.min(p.maxHp, p.hp + amount);
          this.push({ t: 'dmg', x: p.x, y: p.y, amount, kind: 'heal' });
          this.push({ t: 'particles', x: p.x, y: p.y, kind: 'heal', n: 18 });
        }
        if (def.status) this.applyStatus(p, def.status.id, def.status.turns, def.status.power);
        this.push({ t: 'sfx', id: 'heal' });
        this.log(`${def.name}を使った。`, 'magic');
        break;
      }
    }
    this.endTurn();
    return true;
  }

  private projectileTo(x: number, y: number, def: SkillDef) {
    const p = this.player;
    const dx = x - p.x, dy = y - p.y;
    const steps = Math.max(Math.abs(dx), Math.abs(dy));
    for (let i = 1; i <= steps; i++) {
      const px = p.x + (dx * i) / steps;
      const py = p.y + (dy * i) / steps;
      this.push({ t: 'particles', x: px, y: py, kind: def.status?.id === 'burn' ? 'spark' : 'magic', n: 3 });
    }
    this.push({ t: 'sfx', id: 'cast' });
  }

  private faceToward(x: number, y: number) {
    const dx = x - this.player.x, dy = y - this.player.y;
    if (Math.abs(dx) > Math.abs(dy)) this.player.facing = dx > 0 ? 'right' : 'left';
    else this.player.facing = dy > 0 ? 'down' : 'up';
  }

  /* ---------------------------------------------------------- turn loop */

  endTurn(): void {
    if (this.screen !== 'play') return;
    this.turn = Math.floor(this.stats.steps / 2) + this.turn * 0;
    this.tickStatuses(this.player);
    if (!this.player.alive || this.player.hp <= 0) {
      this.die();
      return;
    }
    this.time.phase += 0.0009;
    if (this.time.phase >= 1) {
      this.time.phase = 0;
      this.time.day++;
      this.push({ t: 'banner', text: `${this.time.day}日目`, sub: '朝' });
    }

    for (const e of this.entities) {
      if (!e.alive) continue;
      this.tickStatuses(e);
      if (!e.alive) continue;
    }

    this.enemyTurn();

    // cooldowns
    const p = this.player;
    for (const k of Object.keys(p.cooldowns)) {
      if (p.cooldowns[k] > 0) p.cooldowns[k]--;
    }
    // slow natural regen in town
    if (this.map.kind === 'town' && this.turn % 4 === 0) {
      if (p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + 1);
      if (p.sp < p.maxSp) p.sp = Math.min(p.maxSp, p.sp + 1);
    }
    this.computeTurn();
    this.turn++;
    this.maybeAutosave();
  }

  private computeTurn() {
    // cheap: nothing else for now
  }

  private tickStatuses(e: Entity): void {
    if (!e.statuses.length) return;
    const keep: Status[] = [];
    for (const s of e.statuses) {
      switch (s.id) {
        case 'poison': {
          const dmg = Math.max(1, Math.round(s.power));
          e.hp -= dmg;
          this.push({ t: 'dmg', x: e.x, y: e.y, amount: dmg, kind: 'poison' });
          break;
        }
        case 'burn': {
          const dmg = Math.max(1, Math.round(s.power));
          e.hp -= dmg;
          this.push({ t: 'dmg', x: e.x, y: e.y, amount: dmg, kind: 'fire' });
          break;
        }
        case 'bleed': {
          const dmg = Math.max(1, Math.round(s.power * (e.kind === 'enemy' && e.hp < e.maxHp * 0.3 ? 1.6 : 1)));
          e.hp -= dmg;
          this.push({ t: 'dmg', x: e.x, y: e.y, amount: dmg, kind: 'phys' });
          break;
        }
        case 'regen': {
          const heal = Math.max(1, Math.round(s.power));
          e.hp = Math.min(e.maxHp, e.hp + heal);
          if (e.kind === 'player') this.push({ t: 'dmg', x: e.x, y: e.y, amount: heal, kind: 'heal' });
          break;
        }
      }
      s.turns--;
      if (s.turns > 0) keep.push(s);
      else if (e.kind === 'player') this.log(`${STATUS_LABEL[s.id].name}が治まった。`, 'dim');
    }
    e.statuses = keep;
    if (e.hp <= 0) {
      if (e.kind === 'enemy') this.killEnemy(e);
      else if (e.kind === 'player') this.die();
    }
  }

  private enemyTurn(): void {
    const p = this.player;
    const order = this.entities.filter((e) => e.alive && e.kind === 'enemy');
    order.sort((a, b) => dist2(a.x, a.y, p.x, p.y) - dist2(b.x, b.y, p.x, p.y));
    for (const e of order) {
      if (!e.alive || this.screen !== 'play') continue;
      if (e.statuses.some((s) => s.id === 'stun')) continue;
      const slowed = e.statuses.some((s) => s.id === 'slow');
      if (slowed && this.rng.chance(0.45)) continue;
      this.enemyAct(e);
    }
  }

  private enemyAct(e: Entity): void {
    const p = this.player;
    const d = Math.max(Math.abs(e.x - p.x), Math.abs(e.y - p.y));
    const aggro = e.aggro || (e.ai === 'boss' && d <= 14);

    if (e.telegraph) {
      e.telegraph.turns--;
      if (e.telegraph.turns <= 0) {
        this.resolveTelegraph(e, e.telegraph.kind);
        e.telegraph = undefined;
      }
      return;
    }

    if (e.ai === 'boss') {
      this.bossAct(e, d, aggro);
      return;
    }

    if (e.ai === 'ranged' && d <= (e.rangedRange ?? 4) && d > 1 && aggro) {
      if (this.rng.chance(0.72)) {
        this.enemyRangedAttack(e);
        return;
      }
    }

    if (aggro) {
      if (d <= 1) {
        this.enemyAttack(e);
        return;
      }
      // chase, prefer axis with greater distance
      const dx = Math.sign(p.x - e.x), dy = Math.sign(p.y - e.y);
      const opts: [number, number][] = Math.abs(p.x - e.x) > Math.abs(p.y - e.y)
        ? [[dx, 0], [0, dy], [0, -dy], [-dx, 0]]
        : [[0, dy], [dx, 0], [-dx, 0], [0, -dy]];
      for (const [mx, my] of opts) {
        if (mx === 0 && my === 0) continue;
        const nx = e.x + mx, ny = e.y + my;
        if (!this.canWalk(nx, ny)) continue;
        if (this.entityAt(nx, ny)) continue;
        e.x = nx; e.y = ny;
        e.rx = nx; e.ry = ny;
        e.facing = mx > 0 ? 'right' : mx < 0 ? 'left' : my > 0 ? 'down' : 'up';
        return;
      }
      return;
    }

    // idle wander
    if (e.ai === 'erratic' || this.rng.chance(0.25)) {
      const dirs: [number, number][] = [[0, -1], [0, 1], [-1, 0], [1, 0]];
      const [mx, my] = this.rng.pick(dirs);
      const nx = e.x + mx, ny = e.y + my;
      if (this.canWalk(nx, ny) && !this.entityAt(nx, ny)) {
        if (e.homeX !== undefined && e.homeY !== undefined) {
          if (Math.abs(nx - e.homeX) > 4 || Math.abs(ny - e.homeY) > 4) return;
        }
        e.x = nx; e.y = ny; e.rx = nx; e.ry = ny;
        e.facing = mx > 0 ? 'right' : mx < 0 ? 'left' : my > 0 ? 'down' : 'up';
      }
    }
  }

  private bossAct(e: Entity, d: number, aggro: boolean): void {
    if (!aggro) return;
    if (!e.abilityCd) e.abilityCd = 3;
    e.abilityCd--;
    const hpFrac = e.hp / e.maxHp;

    if (!e.telegraph && e.abilityCd <= 0) {
      if (this.rng.chance(0.4)) {
        e.telegraph = { kind: 'slam', turns: 2 };
        this.log(`${e.name}が大きく振りかぶった！`, 'bad');
        this.push({ t: 'sfx', id: 'warning' });
        this.push({ t: 'shake', amount: 2 });
        e.abilityCd = 4;
        return;
      }
      if (hpFrac < 0.55 && this.rng.chance(0.5)) {
        e.telegraph = { kind: 'summon', turns: 2 };
        this.log(`${e.name}が森に呼びかけた……`, 'bad');
        this.push({ t: 'sfx', id: 'warning' });
        e.abilityCd = 6;
        return;
      }
      if (d <= 2) {
        e.telegraph = { kind: 'wave', turns: 1 };
        this.log(`${e.name}が衝撃を溜めている！`, 'bad');
        this.push({ t: 'sfx', id: 'warning' });
        e.abilityCd = 5;
        return;
      }
    }

    if (d <= 1) { this.enemyAttack(e); return; }
    const dx = Math.sign(this.player.x - e.x), dy = Math.sign(this.player.y - e.y);
    const tries: [number, number][] = [[dx, 0], [0, dy], [dx, dy]];
    for (const [mx, my] of tries) {
      if (mx === 0 && my === 0) continue;
      const nx = e.x + mx, ny = e.y + my;
      if (this.canWalk(nx, ny) && !this.entityAt(nx, ny)) {
        e.x = nx; e.y = ny; e.rx = nx; e.ry = ny;
        e.facing = mx > 0 ? 'right' : mx < 0 ? 'left' : my > 0 ? 'down' : 'up';
        return;
      }
    }
  }

  private resolveTelegraph(e: Entity, kind: 'slam' | 'summon' | 'wave') {
    const p = this.player;
    if (kind === 'summon') {
      const n = e.id % 3 === 0 ? 3 : 2;
      let spawned = 0;
      for (let i = 0; i < 12 && spawned < n; i++) {
        const spot = this.freeSpotNear(e.x + this.rng.int(-3, 3), e.y + this.rng.int(-3, 3));
        if (!spot) continue;
        const base = this.rng.pick(ENEMIES.filter((b) => b.id !== 'hollow_mother'));
        const minion = makeEnemy(base, newEntityId(), spot.x, spot.y, this.map.floor);
        minion.aggro = true;
        this.entities.push(minion);
        this.push({ t: 'particles', x: spot.x, y: spot.y, kind: 'magic', n: 16 });
        spawned++;
      }
      this.log(`${e.name}が眷属を呼び寄せた。`, 'bad');
      return;
    }
    const radius = kind === 'slam' ? 2 : 2;
    if (Math.max(Math.abs(p.x - e.x), Math.abs(p.y - e.y)) <= radius) {
      const dmg = Math.round(e.atk * (kind === 'slam' ? 1.7 : 1.2));
      this.damagePlayer(dmg, e);
      if (kind === 'slam') this.push({ t: 'shake', amount: 12 });
    } else {
      this.log(`${e.name}の攻撃を避けた！`, 'good');
    }
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2;
      this.push({ t: 'particles', x: e.x + Math.cos(a) * 2, y: e.y + Math.sin(a) * 2, kind: 'dust', n: 2 });
    }
    this.push({ t: 'sfx', id: 'boom' });
    this.push({ t: 'shake', amount: 7 });
  }

  private enemyAttack(e: Entity): void {
    const p = this.player;
    if (!p.alive) return;
    e.lunge = 1;
    this.faceToward(e.x, e.y);
    const res = this.attackRoll(e.hit, e.crit, e.atk, p);
    if (!res.hit) {
      this.push({ t: 'dmg', x: p.x, y: p.y, amount: 0, kind: 'miss' });
      this.push({ t: 'sfx', id: 'miss' });
      return;
    }
    this.damagePlayer(res.dmg, e, res.crit);
  }

  private enemyRangedAttack(e: Entity): void {
    const p = this.player;
    this.projectileTo(p.x, p.y, { status: undefined } as unknown as SkillDef);
    const res = this.attackRoll(e.hit - 2, e.crit, Math.round(e.atk * 0.85), p);
    if (!res.hit) {
      this.push({ t: 'dmg', x: p.x, y: p.y, amount: 0, kind: 'miss' });
      return;
    }
    this.damagePlayer(res.dmg, e, res.crit);
  }

  damagePlayer(dmg: number, from?: Entity, crit = false): void {
    const p = this.player;
    const guard = p.statuses.find((s) => s.id === 'guard');
    let d = dmg;
    if (guard) d = Math.round(d * (1 - guard.power / 100));
    p.hp -= d;
    p.flash = 1;
    this.push({ t: 'dmg', x: p.x, y: p.y, amount: d, kind: crit ? 'crit' : 'phys' });
    this.push({ t: 'particles', x: p.x, y: p.y, kind: 'blood', n: crit ? 14 : 7 });
    this.push({ t: 'shake', amount: crit ? 9 : 4 });
    this.push({ t: 'hitstop', ms: crit ? 90 : 50 });
    this.push({ t: 'flash', color: '#bf4438', alpha: crit ? 0.22 : 0.1 });
    this.push({ t: 'sfx', id: 'hurt' });
    if (p.hp <= 0) this.die();
    else if (from && from.kind === 'enemy' && this.rng.chance(0.16)) {
      const st: StatusId[] = ['bleed', 'poison', 'slow'];
      const pick = this.rng.pick(st);
      this.applyStatus(p, pick, pick === 'slow' ? 2 : 4, 3 + Math.floor(this.map.floor * 0.5));
    }
  }

  die(): void {
    if (this.screen !== 'play') return;
    this.player.hp = 0;
    this.player.alive = false;
    this.screen = 'dead';
    this.push({ t: 'death' });
    this.push({ t: 'log', text: '視界が暗くなっていく……', cls: 'bad' });
    localStorage.removeItem(SAVE_KEY);
  }

  /* ---------------------------------------------------------- quests */

  progressQuest(kind: QuestDef['kind'], amount: number, target?: string, exact = false): void {
    const p = this.player;
    for (const def of QUESTS) {
      const q = p.quests.find((x) => x.id === def.id);
      if (!q || q.done) continue;
      if (def.kind !== kind) continue;
      if (def.target && target && def.target !== target) continue;
      if (def.kind === 'floor') {
        q.progress = Math.max(q.progress, amount);
      } else if (exact) {
        q.progress = Math.max(q.progress, amount);
      } else {
        q.progress += amount;
      }
      if (q.progress >= def.goal) {
        q.done = true;
        this.log(`依頼達成: ${def.name}（村で報告しよう）`, 'gold');
        this.push({ t: 'toast', text: `依頼達成 — ${def.name}`, cls: 'gold' });
        this.push({ t: 'sfx', id: 'quest' });
      }
    }
    this.save();
  }

  claimQuest(id: string): boolean {
    const p = this.player;
    const def = QUESTS.find((q) => q.id === id);
    const q = p.quests.find((x) => x.id === id);
    if (!def || !q || !q.done || q.claimed) return false;
    q.claimed = true;
    p.gold += def.reward;
    this.stats.goldEarned += def.reward;
    this.log(`${def.name}の報酬 ${def.reward}金を受け取った。`, 'gold');
    this.push({ t: 'sfx', id: 'coin' });
    this.save();
    return true;
  }

  /* ---------------------------------------------------------- save */

  save(): void {
    if (this.autosaveBlocked || this.screen !== 'play') return;
    const data: SaveData = {
      v: SAVE_VERSION,
      seed: this.seed,
      player: this.player,
      map: this.map,
      entities: this.entities,
      time: this.time,
      stairsUpFloor: this.map.floor,
      stats: this.stats,
    };
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data, replacer));
    } catch {
      // storage full or unavailable: keep playing
    }
  }

  private maybeAutosave() {
    if (this.turn % 12 === 0) this.save();
  }

  static hasSave(): boolean {
    try {
      return !!localStorage.getItem(SAVE_KEY);
    } catch {
      return false;
    }
  }

  static load(): Game | null {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw, reviver) as SaveData;
      if (!data || data.v !== SAVE_VERSION) return null;
      const g = new Game(data.seed);
      g.player = data.player;
      g.map = hydrateMap(data.map);
      g.entities = data.entities;
      g.time = data.time;
      g.stats = data.stats;
      g.screen = 'play';
      const maxId = Math.max(0, ...g.entities.map((e) => e.id), ...g.player.inventory.map((i) => i.uid), g.player.id);
      resetEntityIds(maxId + 1);
      g.recomputeDerived();
      computeFov(g.map, g.player.x, g.player.y, 9);
      g.push({ t: 'refresh' });
      return g;
    } catch {
      return null;
    }
  }
}

/* ============================================================
   helpers
   ============================================================ */

function createPlayer(name: string): PlayerState {
  const stats: Stats = { str: 5, dex: 5, con: 5, int: 4, wil: 4, per: 4 };
  const p: PlayerState = {
    id: newEntityId(),
    kind: 'player',
    x: 2, y: 2, rx: 2, ry: 2,
    facing: 'down',
    name,
    sprite: 'player',
    hp: 24, maxHp: 24,
    sp: 5, maxSp: 5,
    stats,
    level: 1, xp: 0,
    atk: 0, def: 0, hit: 0, eva: 0, crit: 0,
    statuses: [], alive: true,
    gold: 40,
    points: 0,
    equip: { weapon: null, body: null, head: null, shield: null, ring: null, charm: null },
    inventory: [],
    skills: ['cleave', 'ember_bolt'],
    cooldowns: {},
    hunger: 100,
    kills: 0,
    deepest: 0,
    quests: QUESTS.map((q) => ({ id: q.id, progress: 0, done: false, claimed: false })),
    visitedTown: false,
  };
  const dagger = makeItem('rusty_dagger');
  dagger.uid = newEntityId();
  const tunic = makeItem('cloth_tunic');
  tunic.uid = newEntityId();
  const hood = makeItem('traveler_hood');
  hood.uid = newEntityId();
  p.inventory.push(dagger, tunic, hood);
  p.equip.weapon = dagger.uid;
  p.equip.body = tunic.uid;
  p.equip.head = hood.uid;
  const pot = makeItem('potion_small', 3);
  pot.uid = newEntityId();
  p.inventory.push(pot);
  return p;
}

function groundItem(it: Item, x: number, y: number): Entity {
  return {
    id: newEntityId(), kind: 'prop', x, y, rx: x, ry: y, facing: 'down',
    name: itemName(it), sprite: 'bag', hp: 1, maxHp: 1, sp: 0, maxSp: 0,
    stats: { str: 0, dex: 0, con: 0, int: 0, wil: 0, per: 0 },
    level: 1, xp: 0, atk: 0, def: 0, hit: 0, eva: 0, crit: 0,
    statuses: [], alive: true, solid: false, propKind: 'loot', item: it,
  };
}

const replacer = (_k: string, v: unknown) => {
  if (v instanceof Uint8Array) return { __u8: Array.from(v) };
  return v;
};

const reviver = (_k: string, v: unknown) => {
  if (v && typeof v === 'object' && '__u8' in (v as Record<string, unknown>)) {
    return Uint8Array.from((v as { __u8: number[] }).__u8);
  }
  return v;
};

function hydrateMap(m: GameMap): GameMap {
  return {
    ...m,
    tiles: m.tiles instanceof Uint8Array ? m.tiles : Uint8Array.from(m.tiles as unknown as number[]),
    seen: m.seen instanceof Uint8Array ? m.seen : Uint8Array.from(m.seen as unknown as number[]),
    visible: m.visible instanceof Uint8Array ? m.visible : Uint8Array.from(m.visible as unknown as number[]),
  };
}

export { SAVE_KEY };

/** Exposed for UI rendering convenience. */
export function itemSlotOf(it: Item): Slot {
  return getBase(it.base).slot;
}

export function itemRarityOf(it: Item) {
  return itemRarity(it);
}

export function itemValueOf(it: Item) {
  return itemValue(it);
}

export function itemStatsOf(it: Item) {
  return itemStats(it);
}

export { rollGear, rollConsumable, itemName, itemValue, sellPrice, buyPrice };
