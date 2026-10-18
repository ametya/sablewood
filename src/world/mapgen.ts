import { RNG } from '../core/rng';
import { T, TILE_INFO, type Entity, type GameMap } from '../core/types';
import { ENEMIES, eligibleEnemies, floorLabel, makeEnemy } from '../data/enemies';

export interface GeneratedLevel {
  map: GameMap;
  entities: Entity[];
  upX: number;
  upY: number;
  downX: number;
  downY: number;
}

let nextEntityId = 1;
export function resetEntityIds(start = 1) {
  nextEntityId = start;
}
export function newEntityId(): number {
  return nextEntityId++;
}

function blankMap(w: number, h: number, kind: 'town' | 'dungeon', floor: number, name: string): GameMap {
  return {
    w, h,
    tiles: new Uint8Array(w * h),
    seen: new Uint8Array(w * h),
    visible: new Uint8Array(w * h),
    kind, floor, name,
    spawnX: 2, spawnY: 2,
  };
}

export const idx = (m: { w: number }, x: number, y: number) => y * m.w + x;
export const tileAt = (m: GameMap, x: number, y: number): number => {
  if (x < 0 || y < 0 || x >= m.w || y >= m.h) return T.Void;
  return m.tiles[y * m.w + x];
};
export const isBlocked = (m: GameMap, x: number, y: number): boolean => {
  const t = tileAt(m, x, y);
  return TILE_INFO[t]?.blocked ?? true;
};

/* ============================================================
   Town
   ============================================================ */

export const TOWN_W = 46;
export const TOWN_H = 34;

export function genTown(rng: RNG): GeneratedLevel {
  const map = blankMap(TOWN_W, TOWN_H, 'town', 0, 'ソーンベリ村');
  const set = (x: number, y: number, t: number) => {
    if (x < 0 || y < 0 || x >= map.w || y >= map.h) return;
    map.tiles[y * map.w + x] = t;
  };
  const get = (x: number, y: number) => tileAt(map, x, y);

  // base grass with dirt paths
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      const edge = x < 2 || y < 2 || x >= map.w - 2 || y >= map.h - 2;
      const noise = rng.next();
      set(x, y, edge ? T.Rock : noise < 0.1 ? T.Moss : noise < 0.16 ? T.Dirt : T.Grass);
    }
  }

  // main road (horizontal) and village square (vertical)
  const roadY = Math.floor(map.h / 2);
  for (let x = 3; x < map.w - 3; x++) {
    for (let dy = -1; dy <= 1; dy++) set(x, roadY + dy, dy === 0 ? T.Dirt : rng.chance(0.5) ? T.Dirt : T.Grass);
  }
  const sqX = Math.floor(map.w / 2);
  for (let y = 6; y < map.h - 4; y++) {
    for (let dx = -1; dx <= 1; dx++) set(sqX + dx, y, T.Dirt);
  }

  // village square paving
  for (let y = roadY - 4; y <= roadY + 4; y++) {
    for (let x = sqX - 4; x <= sqX + 4; x++) set(x, y, T.Floor);
  }

  // decorative well in the square
  for (let y = roadY - 1; y <= roadY + 1; y++) {
    for (let x = sqX - 1; x <= sqX + 1; x++) set(x, y, y === roadY && x === sqX ? T.Water : T.Rock);
  }

  // pond in the southwest
  const pondX = 8, pondY = map.h - 9;
  for (let y = -3; y <= 3; y++) {
    for (let x = -4; x <= 4; x++) {
      const d = (x * x) / 16 + (y * y) / 9;
      if (d < 1) set(pondX + x, pondY + y, T.Water);
      else if (d < 1.6) set(pondX + x, pondY + y, T.Sand);
    }
  }

  // buildings
  interface Building {
    x: number; y: number; w: number; h: number; doorX: number; doorY: number; label: string;
  }
  const buildings: Building[] = [
    { x: 5, y: 5, w: 7, h: 5, doorX: 8, doorY: 10, label: '宿屋「眠り苔」' },
    { x: 16, y: 5, w: 8, h: 5, doorX: 19, doorY: 10, label: '鍛冶屋' },
    { x: sqX + 7, y: 6, w: 8, h: 5, doorX: sqX + 10, doorY: 11, label: '雑貨屋' },
    { x: 30, y: map.h - 13, w: 9, h: 6, doorX: 34, doorY: map.h - 13, label: '森の社' },
    { x: 14, y: map.h - 12, w: 7, h: 5, doorX: 17, doorY: map.h - 12, label: '狩人の家' },
  ];

  for (const b of buildings) {
    for (let y = b.y; y < b.y + b.h; y++) {
      for (let x = b.x; x < b.x + b.w; x++) set(x, y, T.Wall);
    }
    // interior
    for (let y = b.y + 1; y < b.y + b.h - 1; y++) {
      for (let x = b.x + 1; x < b.x + b.w - 1; x++) set(x, y, T.Wood);
    }
    // roof accent
    for (let x = b.x; x < b.x + b.w; x++) set(x, b.y, T.Rock);
    // door
    set(b.doorX, b.doorY, T.Door);
    // door porch
    set(b.doorX, b.doorY + 1, T.Floor);
  }

  // trees around the edges
  const entities: Entity[] = [];
  const pushProp = (x: number, y: number, kind: string, sprite: string, solid: boolean, extra: Partial<Entity> = {}) => {
    entities.push({
      id: newEntityId(), kind: 'prop', x, y, rx: x, ry: y, facing: 'down',
      name: kind, sprite, hp: 1, maxHp: 1, sp: 0, maxSp: 0,
      stats: { str: 0, dex: 0, con: 0, int: 0, wil: 0, per: 0 },
      level: 1, xp: 0, atk: 0, def: 0, hit: 0, eva: 0, crit: 0,
      statuses: [], alive: true, solid, propKind: kind, ...extra,
    });
  };

  // tree ring
  for (let i = 0; i < 240; i++) {
    const x = rng.int(1, map.w - 2);
    const y = rng.int(1, map.h - 2);
    const t = get(x, y);
    if (t !== T.Grass && t !== T.Moss) continue;
    const nearEdge = x < 4 || y < 4 || x > map.w - 5 || y > map.h - 5;
    const nearRoad = Math.abs(y - roadY) <= 2 || Math.abs(x - sqX) <= 1;
    if (nearRoad) continue;
    if (!nearEdge && rng.chance(0.6)) continue;
    const isRock = rng.chance(0.14);
    pushProp(x, y, isRock ? '岩' : '木', isRock ? 'boulder' : 'tree', true, { breakable: false });
    if (!isRock) set(x, y, T.Grass);
  }

  // shop stalls / sign props
  pushProp(sqX + 5, roadY - 5, '立て看板', 'sign', true);
  pushProp(sqX - 5, roadY + 5, '樽', 'barrel', true);

  // NPCs
  const npcs: Array<{ id: string; name: string; sprite: string; x: number; y: number; line: string }> = [
    { id: 'elder', name: '長老 オルヴァ', sprite: 'npc_elder', x: sqX - 2, y: roadY - 2,
      line: '森の下には古い墓所がある。……最近、その扉が開いたままなのだ。' },
    { id: 'smith', name: '鍛冶師 ハルド', sprite: 'npc_smith', x: 19, y: 12,
      line: '鉄が足りねえ。森で拾ってきな。……鎧も直せるぜ。' },
    { id: 'merchant', name: '商人 ミラ', sprite: 'npc_merchant', x: sqX + 10, y: 12,
      line: '旅の人？　なら灯りと薬は多めに持っていきなさいな。' },
    { id: 'innkeeper', name: '宿の女将 ネヴ', sprite: 'npc_inn', x: 8, y: 12,
      line: '一晩寝ていきな。……ただし、夢見は良くないかもしれないよ。' },
    { id: 'hunter', name: '狩人 ガレス', sprite: 'npc_hunter', x: 17, y: map.h - 10,
      line: '狼は群れで来る。一匹ずつ、端から潰すんだ。' },
    { id: 'priestess', name: '巫女 シーラ', sprite: 'npc_priestess', x: 34, y: map.h - 12,
      line: '樫の心は、森の祈りそのもの。折れば、森は泣くでしょう。' },
  ];
  for (const n of npcs) {
    entities.push({
      id: newEntityId(), kind: 'npc', x: n.x, y: n.y, rx: n.x, ry: n.y, facing: 'down',
      name: n.name, sprite: n.sprite, npcId: n.id, dialogue: n.line,
      hp: 1, maxHp: 1, sp: 0, maxSp: 0,
      stats: { str: 3, dex: 3, con: 3, int: 3, wil: 3, per: 3 },
      level: 1, xp: 0, atk: 0, def: 0, hit: 0, eva: 0, crit: 0,
      statuses: [], alive: true, solid: true,
    });
  }

  // stairs to the wood (must be reachable)
  const sx = sqX - 3, sy = map.h - 5;
  for (let y = sy - 1; y <= sy + 1; y++) for (let x = sx - 1; x <= sx + 1; x++) set(x, y, T.Floor);
  set(sx, sy, T.StairsDown);
  map.spawnX = sqX + 1;
  map.spawnY = roadY + 3;

  return { map, entities, upX: sx, upY: sy, downX: sx, downY: sy };
}

/* ============================================================
   Dungeon
   ============================================================ */

interface Room {
  x: number; y: number; w: number; h: number;
}

export function genFloor(rng: RNG, floor: number): GeneratedLevel {
  const isWide = floor >= 8;
  const w = 54 + Math.min(20, floor * 2);
  const h = 44 + Math.min(16, floor * 2);
  const map = blankMap(w, h, 'dungeon', floor, `${floorLabel(floor)} ${floor}層`);
  const set = (x: number, y: number, t: number) => {
    if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) return;
    map.tiles[y * w + x] = t;
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) map.tiles[y * w + x] = T.Wall;

  // --- rooms
  const rooms: Room[] = [];
  const attempts = 260 + floor * 12;
  const targetRooms = 11 + Math.min(9, Math.floor(floor * 0.7));
  for (let i = 0; i < attempts && rooms.length < targetRooms; i++) {
    const rw = rng.int(5, isWide ? 15 : 12);
    const rh = rng.int(4, isWide ? 11 : 9);
    const rx = rng.int(2, w - rw - 3);
    const ry = rng.int(2, h - rh - 3);
    const r: Room = { x: rx, y: ry, w: rw, h: rh };
    if (rooms.some((o) => !(r.x + r.w + 1 < o.x || o.x + o.w + 1 < r.x || r.y + r.h + 1 < o.y || o.y + o.h + 1 < r.y))) continue;
    rooms.push(r);
  }

  const carveRoom = (r: Room, tile: number) => {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) set(x, y, tile);
  };
  for (const r of rooms) {
    carveRoom(r, T.Floor);
    // occasional moss patches
    for (let i = 0; i < 6; i++) {
      const x = rng.int(r.x, r.x + r.w - 1);
      const y = rng.int(r.y, r.y + r.h - 1);
      if (rng.chance(0.5)) set(x, y, T.Moss);
    }
    // rug in special rooms
    if (rng.chance(0.18) && r.w > 6 && r.h > 5) {
      for (let y = r.y + Math.floor(r.h / 2) - 1; y <= r.y + Math.floor(r.h / 2) + 1; y++) {
        for (let x = r.x + Math.floor(r.w / 2) - 2; x <= r.x + Math.floor(r.w / 2) + 2; x++) set(x, y, T.Rug);
      }
    }
  }

  const center = (r: Room) => ({ x: r.x + (r.w >> 1), y: r.y + (r.h >> 1) });

  // --- corridors (MST-ish: connect each room to the nearest previous one)
  const connected: Room[] = [rooms[0]];
  const pending = rooms.slice(1);
  while (pending.length) {
    let bestI = 0, bestD = Infinity, bestJ = 0;
    for (let i = 0; i < pending.length; i++) {
      for (let j = 0; j < connected.length; j++) {
        const a = center(pending[i]), b = center(connected[j]);
        const d = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
        if (d < bestD) { bestD = d; bestI = i; bestJ = j; }
      }
    }
    const a = center(pending[bestI]), b = center(connected[bestJ]);
    carveCorridor(set, rng, a.x, a.y, b.x, b.y);
    connected.push(pending[bestI]);
    pending.splice(bestI, 1);
  }
  // a couple of loops so the map is not a pure tree
  for (let i = 0; i < 2; i++) {
    const a = center(rng.pick(rooms)), b = center(rng.pick(rooms));
    carveCorridor(set, rng, a.x, a.y, b.x, b.y);
  }

  // --- water pool in one room, some rubble
  if (rooms.length > 4) {
    const r = rooms[rng.int(2, rooms.length - 1)];
    if (r.w >= 6 && r.h >= 5) {
      const cx = r.x + (r.w >> 1), cy = r.y + (r.h >> 1);
      for (let y = -1; y <= 1; y++) for (let x = -2; x <= 2; x++) set(cx + x, cy + y, T.Water);
      for (let x = -2; x <= 2; x++) set(cx + x, cy, T.Water);
    }
  }

  // --- stairs
  const first = rooms[0];
  const last = rooms[rooms.length - 1];
  const startP = center(first);
  const endP = center(last);
  set(startP.x, startP.y, T.StairsUp);
  set(endP.x, endP.y, T.StairsDown);
  // spawn next to the up stairs
  map.spawnX = startP.x;
  map.spawnY = startP.y;

  /* --- entities */
  const entities: Entity[] = [];
  const pushProp = (x: number, y: number, kind: string, sprite: string, solid: boolean, extra: Partial<Entity> = {}) => {
    entities.push({
      id: newEntityId(), kind: 'prop', x, y, rx: x, ry: y, facing: 'down',
      name: kind, sprite, hp: 1, maxHp: 1, sp: 0, maxSp: 0,
      stats: { str: 0, dex: 0, con: 0, int: 0, wil: 0, per: 0 },
      level: 1, xp: 0, atk: 0, def: 0, hit: 0, eva: 0, crit: 0,
      statuses: [], alive: true, solid, propKind: kind, ...extra,
    });
  };

  const occupied = (x: number, y: number) =>
    entities.some((e) => e.x === x && e.y === y) ||
    (Math.abs(x - startP.x) <= 1 && Math.abs(y - startP.y) <= 1);

  // trees and rocks inside rooms
  const decorCount = 26 + floor * 2;
  for (let i = 0; i < decorCount; i++) {
    const r = rng.pick(rooms);
    const x = rng.int(r.x, r.x + r.w - 1);
    const y = rng.int(r.y, r.y + r.h - 1);
    if (tileAt(map, x, y) !== T.Floor && tileAt(map, x, y) !== T.Moss) continue;
    if (occupied(x, y)) continue;
    const roll = rng.next();
    if (roll < 0.45) {
      pushProp(x, y, '木', 'tree', true, { breakable: true, hp: 12, maxHp: 12 });
    } else if (roll < 0.65) {
      pushProp(x, y, '岩', 'boulder', true);
    } else if (roll < 0.8) {
      pushProp(x, y, '骨の山', 'bones', false);
    } else if (roll < 0.92) {
      pushProp(x, y, '苔むした像', 'statue', true);
    } else {
      pushProp(x, y, '茸', 'mushroom', false);
    }
  }

  // chests
  const chestCount = 2 + Math.floor(floor / 3) + (rng.chance(0.3) ? 1 : 0);
  for (let i = 0; i < chestCount; i++) {
    const r = rng.pick(rooms);
    const x = rng.int(r.x, r.x + r.w - 1);
    const y = rng.int(r.y, r.y + r.h - 1);
    if (isBlocked(map, x, y) || occupied(x, y)) continue;
    pushProp(x, y, '宝箱', 'chest', true, { breakable: false, hp: 1, maxHp: 1 });
  }

  // enemies
  const pool = eligibleEnemies(floor);
  const enemyCount = Math.min(34, 6 + Math.floor(floor * 1.55));
  if (rooms.length > 1 && pool.length) {
    for (let i = 0; i < enemyCount; i++) {
      const r = rng.pick(rooms.slice(1));
      const x = rng.int(r.x, r.x + r.w - 1);
      const y = rng.int(r.y, r.y + r.h - 1);
      if (isBlocked(map, x, y) || occupied(x, y)) continue;
      const base = rng.weighted(pool, (e) => 1 / (1 + Math.abs(floor - (e.minFloor + 2)) * 0.4));
      entities.push(makeEnemy(base, newEntityId(), x, y, floor));
    }
  }

  // boss every 4th floor, guarding the stairs down
  const bossIds: Record<number, string> = { 4: 'grave_warden', 8: 'oak_heart', 12: 'grave_warden', 16: 'oak_heart', 20: 'hollow_mother' };
  const bossId = bossIds[floor];
  if (bossId) {
    const bx = endP.x, by = endP.y + 1;
    if (!isBlocked(map, bx, by)) {
      const base = ENEMIES.find((e) => e.id === bossId);
      if (base) entities.push(makeEnemy(base, newEntityId(), bx, by, floor));
    }
  }

  // ground item piles
  const itemCount = 3 + Math.floor(floor / 2);
  for (let i = 0; i < itemCount; i++) {
    const r = rng.pick(rooms);
    const x = rng.int(r.x, r.x + r.w - 1);
    const y = rng.int(r.y, r.y + r.h - 1);
    if (isBlocked(map, x, y) || occupied(x, y)) continue;
    entities.push({
      id: newEntityId(), kind: 'prop', x, y, rx: x, ry: y, facing: 'down',
      name: '', sprite: 'bag', hp: 1, maxHp: 1, sp: 0, maxSp: 0,
      stats: { str: 0, dex: 0, con: 0, int: 0, wil: 0, per: 0 },
      level: 1, xp: 0, atk: 0, def: 0, hit: 0, eva: 0, crit: 0,
      statuses: [], alive: true, solid: false, propKind: 'loot',
    });
  }

  return { map, entities, upX: startP.x, upY: startP.y, downX: endP.x, downY: endP.y };
}


function carveCorridor(
  set: (x: number, y: number, t: number) => void,
  rng: RNG,
  x1: number, y1: number, x2: number, y2: number,
) {
  let x = x1, y = y1;
  const horizontalFirst = rng.chance(0.5);
  const step = () => {
    if (horizontalFirst) {
      while (x !== x2) { x += Math.sign(x2 - x); set(x, y, T.Floor); set(x, y + 1, T.Floor); }
      while (y !== y2) { y += Math.sign(y2 - y); set(x, y, T.Floor); set(x + 1, y, T.Floor); }
    } else {
      while (y !== y2) { y += Math.sign(y2 - y); set(x, y, T.Floor); set(x + 1, y, T.Floor); }
      while (x !== x2) { x += Math.sign(x2 - x); set(x, y, T.Floor); set(x, y + 1, T.Floor); }
    }
  };
  step();
}

/** Ensure every walkable floor tile is reachable from (sx, sy). Removes islands. */
export function pruneUnreachable(map: GameMap, sx: number, sy: number): void {
  const seen = new Uint8Array(map.w * map.h);
  const q: number[] = [sy * map.w + sx];
  seen[q[0]] = 1;
  while (q.length) {
    const i = q.pop()!;
    const x = i % map.w, y = (i / map.w) | 0;
    const nb = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
    for (const [nx, ny] of nb) {
      if (nx < 0 || ny < 0 || nx >= map.w || ny >= map.h) continue;
      const j = ny * map.w + nx;
      if (seen[j]) continue;
      if (TILE_INFO[map.tiles[j]]?.blocked) continue;
      seen[j] = 1;
      q.push(j);
    }
  }
  for (let i = 0; i < map.tiles.length; i++) {
    const t = map.tiles[i];
    if (t === T.Floor || t === T.Moss || t === T.Rug || t === T.Wood || t === T.Dirt) {
      if (!seen[i]) map.tiles[i] = T.Wall;
    }
  }
}

export function computeFov(map: GameMap, px: number, py: number, radius: number): void {
  map.visible.fill(0);
  const r2 = radius * radius;
  // recursive shadowcasting via angular sweep (simple, robust)
  for (let y = py - radius; y <= py + radius; y++) {
    for (let x = px - radius; x <= px + radius; x++) {
      if (x < 0 || y < 0 || x >= map.w || y >= map.h) continue;
      const dx = x - px, dy = y - py;
      if (dx * dx + dy * dy > r2 + radius) continue;
      if (!losBlocked(map, px, py, x, y)) {
        const i = y * map.w + x;
        map.visible[i] = 1;
        map.seen[i] = 1;
      }
    }
  }
  // always light the tile you stand on
  map.visible[py * map.w + px] = 1;
  map.seen[py * map.w + px] = 1;
}

function losBlocked(map: GameMap, x0: number, y0: number, x1: number, y1: number): boolean {
  let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  let x = x0, y = y0;
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let guard = 0;
  while (true) {
    if (x === x1 && y === y1) return false;
    if (guard++ > 400) return true;
    if (!(x === x0 && y === y0)) {
      const t = map.tiles[y * map.w + x];
      if (TILE_INFO[t]?.opaque) return true;
    }
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }
}
