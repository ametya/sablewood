import { describe, expect, it } from 'vitest';
import './setup';
import { RNG } from '../src/core/rng';
import { genFloor, genTown, isBlocked, pruneUnreachable, computeFov, tileAt } from '../src/world/mapgen';
import { T } from '../src/core/types';

function reachableCount(map: ReturnType<typeof genFloor>['map'], sx: number, sy: number): number {
  const seen = new Set<number>();
  const q = [sy * map.w + sx];
  seen.add(q[0]);
  while (q.length) {
    const i = q.pop()!;
    const x = i % map.w, y = (i / map.w) | 0;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || ny < 0 || nx >= map.w || ny >= map.h) continue;
      const j = ny * map.w + nx;
      if (seen.has(j)) continue;
      if (isBlocked(map, nx, ny)) continue;
      seen.add(j);
      q.push(j);
    }
  }
  return seen.size;
}

function walkableCount(map: ReturnType<typeof genFloor>['map']): number {
  let n = 0;
  for (let i = 0; i < map.tiles.length; i++) {
    if (!isBlocked(map, i % map.w, (i / map.w) | 0)) n++;
  }
  return n;
}

describe('town generation', () => {
  it('is deterministic per seed', () => {
    const a = genTown(new RNG('t1')).map;
    const b = genTown(new RNG('t1')).map;
    expect(Array.from(a.tiles)).toEqual(Array.from(b.tiles));
  });

  it('places the player on walkable ground', () => {
    const g = genTown(new RNG('t2'));
    expect(isBlocked(g.map, g.map.spawnX, g.map.spawnY)).toBe(false);
  });

  it('has a down-stairs tile and NPCs', () => {
    const g = genTown(new RNG('t3'));
    expect(tileAt(g.map, g.downX, g.downY)).toBe(T.StairsDown);
    const npcs = g.entities.filter((e) => e.kind === 'npc');
    expect(npcs.length).toBeGreaterThanOrEqual(5);
  });

  it('keeps every spawn tile walkable', () => {
    const g = genTown(new RNG('t4'));
    for (const e of g.entities) {
      if (e.kind === 'npc' || (e.kind === 'prop' && e.solid)) continue;
      expect(isBlocked(g.map, e.x, e.y)).toBe(false);
    }
  });
});

describe('dungeon generation', () => {
  for (const floor of [1, 2, 5, 9, 14, 20]) {
    it(`floor ${floor} is fully connected from the up-stairs`, () => {
      const g = genFloor(new RNG(`f${floor}`), floor);
      pruneUnreachable(g.map, g.upX, g.upY);
      const reach = reachableCount(g.map, g.upX, g.upY);
      const walk = walkableCount(g.map);
      expect(reach).toBeGreaterThan(40);
      expect(reach).toBe(walk);
    });
  }

  it('places up and down stairs on walkable tiles', () => {
    const g = genFloor(new RNG('stairs'), 3);
    expect(isBlocked(g.map, g.upX, g.upY)).toBe(false);
    expect(isBlocked(g.map, g.downX, g.downY)).toBe(false);
  });

  it('spawns enemies that are not inside walls', () => {
    const g = genFloor(new RNG('enemies'), 4);
    const enemies = g.entities.filter((e) => e.kind === 'enemy');
    expect(enemies.length).toBeGreaterThan(3);
    for (const e of enemies) expect(isBlocked(g.map, e.x, e.y)).toBe(false);
  });

  it('places a boss on floor 4', () => {
    const g = genFloor(new RNG('boss'), 4);
    const boss = g.entities.find((e) => e.ai === 'boss');
    expect(boss).toBeDefined();
    expect(boss!.name).toBe('墓守');
  });

  it('scales enemy count with depth', () => {
    const shallow = genFloor(new RNG('c1'), 1).entities.filter((e) => e.kind === 'enemy').length;
    const deep = genFloor(new RNG('c1'), 15).entities.filter((e) => e.kind === 'enemy').length;
    expect(deep).toBeGreaterThan(shallow);
  });
});

describe('field of view', () => {
  it('lights the tile the player stands on and blocks through walls', () => {
    const g = genFloor(new RNG('fov'), 2);
    computeFov(g.map, g.upX, g.upY, 6);
    expect(g.map.visible[g.upY * g.map.w + g.upX]).toBe(1);
    // every visible tile must be seen
    for (let i = 0; i < g.map.visible.length; i++) {
      if (g.map.visible[i]) expect(g.map.seen[i]).toBe(1);
    }
  });
});
