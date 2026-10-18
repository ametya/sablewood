/** Deterministic, seedable PRNG. Same seed + same call order = same world. */
export class RNG {
  private s: number;

  constructor(seed: number | string) {
    this.s = typeof seed === 'string' ? RNG.hash(seed) : seed >>> 0;
    if (this.s === 0) this.s = 0x9e3779b9;
    // warm up
    for (let i = 0; i < 4; i++) this.next();
  }

  static hash(str: string): number {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  /** [0, 1) */
  next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** integer in [a, b] inclusive */
  int(a: number, b: number): number {
    if (b < a) [a, b] = [b, a];
    return a + Math.floor(this.next() * (b - a + 1));
  }

  /** float in [a, b) */
  range(a: number, b: number): number {
    return a + this.next() * (b - a);
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length) % arr.length];
  }

  /** weighted pick; weights must be > 0 */
  weighted<T>(arr: readonly T[], weightOf: (t: T) => number): T {
    let total = 0;
    for (const a of arr) total += Math.max(0, weightOf(a));
    let r = this.next() * total;
    for (const a of arr) {
      r -= Math.max(0, weightOf(a));
      if (r <= 0) return a;
    }
    return arr[arr.length - 1];
  }

  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}

/** Small stable hash for per-tile visual variation. */
export function hash2(x: number, y: number, salt = 0): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(salt, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const dist2 = (ax: number, ay: number, bx: number, by: number) => {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
};
