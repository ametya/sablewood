import { describe, expect, it } from 'vitest';
import './setup';
import { RNG } from '../src/core/rng';

describe('RNG', () => {
  it('is deterministic for the same seed', () => {
    const a = new RNG('sablewood');
    const b = new RNG('sablewood');
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('produces different streams for different seeds', () => {
    const a = new RNG('one');
    const b = new RNG('two');
    expect(a.next()).not.toBe(b.next());
  });

  it('keeps next() in [0,1)', () => {
    const r = new RNG(42);
    for (let i = 0; i < 5000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int() is inclusive on both ends', () => {
    const r = new RNG('int');
    const seen = new Set<number>();
    for (let i = 0; i < 4000; i++) seen.add(r.int(1, 3));
    expect([...seen].sort()).toEqual([1, 2, 3]);
  });

  it('weighted() respects zero weight', () => {
    const r = new RNG('w');
    for (let i = 0; i < 2000; i++) {
      expect(r.weighted(['a', 'b'], (t) => (t === 'a' ? 0 : 1))).toBe('b');
    }
  });

  it('shuffle keeps the same multiset', () => {
    const r = new RNG('sh');
    const src = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = r.shuffle([...src]);
    expect(out.slice().sort((x, y) => x - y)).toEqual(src);
  });
});
