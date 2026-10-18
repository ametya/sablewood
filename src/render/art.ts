/* ============================================================
   Sablewood — procedural pixel art
   Every sprite is drawn once into an offscreen canvas and cached.
   No external image assets: the whole game ships as code.
   ============================================================ */

export const TILE = 16;

type Ctx = CanvasRenderingContext2D;

const cache = new Map<string, HTMLCanvasElement>();

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function sprite(key: string, w: number, h: number, draw: (ctx: Ctx) => void): HTMLCanvasElement {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  draw(ctx);
  cache.set(key, c);
  return c;
}

const px = (ctx: Ctx, x: number, y: number, color: string, w = 1, h = 1) => {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
};

/* deterministic pseudo random for texture */
function h2(x: number, y: number, salt = 0) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(salt, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/* ============================================================
   Tiles
   ============================================================ */

export interface TileLook {
  base: string;
  dark: string;
  light: string;
  accent: string;
}

const TILE_PALETTES: Record<string, TileLook> = {
  grass: { base: '#2f4a35', dark: '#24392a', light: '#3d5d40', accent: '#4e7148' },
  moss: { base: '#33513a', dark: '#27402e', light: '#446a48', accent: '#5b8557' },
  dirt: { base: '#463a2b', dark: '#372d21', light: '#554633', accent: '#2f271c' },
  floor: { base: '#33383a', dark: '#282d2f', light: '#3e4547', accent: '#4a5254' },
  wood: { base: '#43342a', dark: '#33271f', light: '#544235', accent: '#2a2019' },
  sand: { base: '#5b4f38', dark: '#4a402d', light: '#6a5d43', accent: '#7a6c4e' },
  rug: { base: '#4a2b32', dark: '#3a2027', light: '#5c3740', accent: '#6d4450' },
  water: { base: '#1f3a4a', dark: '#182e3a', light: '#27485c', accent: '#3a6b82' },
  rock: { base: '#2b2f2b', dark: '#20241f', light: '#3a3f38', accent: '#4a5046' },
  wall: { base: '#262b2b', dark: '#1b1f1f', light: '#333938', accent: '#3f4644' },
  bridge: { base: '#4c3a28', dark: '#3a2c1e', light: '#5e4a33', accent: '#2d2117' },
};

function tileTexture(ctx: Ctx, x: number, y: number, look: TileLook, salt: number, density = 0.3) {
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 6; j++) {
      const r = h2(x + i, y + j, salt);
      if (r < density * 0.5) px(ctx, i * 3 - (j % 2), j * 3 - (i % 2), look.dark, 2, 2);
      else if (r > 1 - density * 0.35) px(ctx, i * 3, j * 3, look.light, 1, 1);
    }
  }
}

export function tileSprite(kind: string, tx: number, ty: number, variant = 0): HTMLCanvasElement {
  const look = TILE_PALETTES[kind] ?? TILE_PALETTES.floor;
  const key = `tile:${kind}:${tx & 3}:${ty & 3}:${variant}`;
  return sprite(key, TILE, TILE, (ctx) => {
    px(ctx, 0, 0, look.base, TILE, TILE);
    tileTexture(ctx, tx, ty, look, variant * 7 + 3, 0.34);

    if (kind === 'grass' || kind === 'moss') {
      // grass blades
      for (let i = 0; i < 5; i++) {
        const gx = Math.floor(h2(tx + i, ty, 11 + variant) * 14) + 1;
        const gy = Math.floor(h2(tx, ty + i, 23 + variant) * 14) + 1;
        px(ctx, gx, gy, look.accent);
        px(ctx, gx, gy - 1, look.light);
        if (h2(i, tx + ty, 5) > 0.6) px(ctx, gx + 1, gy, look.accent);
      }
      // occasional flower
      if (h2(tx, ty, 41 + variant) > 0.94) {
        px(ctx, 7, 6, '#c9a86a');
        px(ctx, 8, 6, '#e0c78a');
        px(ctx, 7, 7, '#a8884f');
      }
    } else if (kind === 'dirt') {
      for (let i = 0; i < 4; i++) {
        const sx = Math.floor(h2(tx, i, 8) * 13);
        const sy = Math.floor(h2(i, ty, 9 + variant) * 13);
        px(ctx, sx, sy, look.accent, 2, 1);
      }
    } else if (kind === 'floor') {
      // stone blocks
      ctx.strokeStyle = look.dark;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, 8.5); ctx.lineTo(TILE, 8.5);
      ctx.moveTo(8.5, 0); ctx.lineTo(8.5, 8);
      ctx.moveTo(0.5, 8.5); ctx.lineTo(0.5, TILE);
      ctx.moveTo(12, 8.5); ctx.lineTo(12, TILE);
      ctx.stroke();
      px(ctx, 2, 3, look.light, 3, 1);
      px(ctx, 10, 11, look.light, 3, 1);
    } else if (kind === 'wood') {
      ctx.strokeStyle = look.accent;
      for (let i = 1; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(0, i * 4 + 0.5);
        ctx.lineTo(TILE, i * 4 + 0.5);
        ctx.stroke();
      }
      px(ctx, 3, 5, look.light, 6, 1);
      px(ctx, 7, 13, look.light, 5, 1);
    } else if (kind === 'water') {
      const t = (tx + ty + variant) % 4;
      for (let i = 0; i < 3; i++) {
        const wy = 2 + i * 5 + ((t + i) % 2);
        const wx = (h2(tx + i, ty, variant + 3) * 8) | 0;
        px(ctx, wx, wy, look.accent, 4, 1);
        px(ctx, wx + 2, wy + 1, look.light, 3, 1);
      }
    } else if (kind === 'rock' || kind === 'wall') {
      for (let i = 0; i < 4; i++) {
        const rx = Math.floor(h2(tx + i, ty, 31 + variant) * 12);
        const ry = Math.floor(h2(tx, ty + i, 13 + variant) * 12);
        px(ctx, rx, ry, look.light, 3, 2);
        px(ctx, rx + 1, ry + 2, look.dark, 3, 1);
      }
      px(ctx, 0, 0, look.dark, TILE, 1);
      px(ctx, 0, 0, look.dark, 1, TILE);
    } else if (kind === 'rug') {
      ctx.strokeStyle = '#7a5060';
      ctx.lineWidth = 1;
      ctx.strokeRect(1.5, 1.5, TILE - 3, TILE - 3);
      px(ctx, 4, 4, '#6d4450', 3, 1);
      px(ctx, 9, 11, '#6d4450', 3, 1);
    }
  });
}

/* ============================================================
   Characters
   ============================================================ */

export type Pal = { skin: string; hair: string; cloth: string; trim: string; accent: string };

const PLAYER_PAL: Pal = {
  skin: '#d8b48c', hair: '#4a3624', cloth: '#3f6b53', trim: '#7a5a32', accent: '#d8a54a',
};

export const NPC_PALS: Record<string, Pal> = {
  npc_elder: { skin: '#cbb094', hair: '#cfc6b4', cloth: '#4a4256', trim: '#7a6a52', accent: '#b09a6a' },
  npc_smith: { skin: '#b88f68', hair: '#5a3a24', cloth: '#4a3a30', trim: '#6a5240', accent: '#c07a3a' },
  npc_merchant: { skin: '#d0a884', hair: '#7a4a2a', cloth: '#6a4a5a', trim: '#a87a5a', accent: '#c9a227' },
  npc_inn: { skin: '#d8b898', hair: '#8a5a3a', cloth: '#4a5a6a', trim: '#8a7a5a', accent: '#d8c8a8' },
  npc_hunter: { skin: '#b58a62', hair: '#3a2a1a', cloth: '#3a4a34', trim: '#5a4a30', accent: '#8a9a5a' },
  npc_priestess: { skin: '#e0c4a4', hair: '#e8e0d0', cloth: '#c8c0b8', trim: '#8a7a9a', accent: '#9a8ab0' },
};

const MONSTER_PALS: Record<string, Pal> = {
  rat: { skin: '#8a7a68', hair: '#6a5a48', cloth: '#5a4a3a', trim: '#3a2e22', accent: '#c98a7a' },
  slime: { skin: '#5a8a5a', hair: '#3e6a40', cloth: '#6aa06a', trim: '#2e4a32', accent: '#9ad07a' },
  beetle: { skin: '#4a4a5a', hair: '#2e2e3a', cloth: '#6a6a80', trim: '#242430', accent: '#8a8aa0' },
  wolf: { skin: '#6a6a72', hair: '#42424a', cloth: '#8a8a94', trim: '#2c2c33', accent: '#d8d0c0' },
  bat: { skin: '#4a4448', hair: '#2c282c', cloth: '#5c545a', trim: '#1e1c1e', accent: '#a06a7a' },
  spider: { skin: '#3a3038', hair: '#241e26', cloth: '#4d4048', trim: '#18141a', accent: '#8a5a6a' },
  bandit: { skin: '#c09a74', hair: '#2a2018', cloth: '#5a3a34', trim: '#3a2a22', accent: '#9a6a4a' },
  wisp: { skin: '#7a9ac8', hair: '#5a7aaa', cloth: '#9ab8e0', trim: '#2a3a5a', accent: '#d0e4ff' },
  sapling: { skin: '#4a6a3a', hair: '#344a2a', cloth: '#5a8048', trim: '#26351f', accent: '#8ab06a' },
  hollow: { skin: '#6a6470', hair: '#46424e', cloth: '#7a7484', trim: '#2c2a32', accent: '#a89ac0' },
  knight: { skin: '#5a5a5e', hair: '#3a3a3e', cloth: '#76767c', trim: '#2a2a2e', accent: '#9a7a5a' },
  warden: { skin: '#4a4a52', hair: '#2e2e34', cloth: '#5a5a64', trim: '#242428', accent: '#8a6a4a' },
  heart: { skin: '#5a4a34', hair: '#3a2e20', cloth: '#6a5a40', trim: '#2a2218', accent: '#c98a4a' },
  mother: { skin: '#4a4450', hair: '#2c2832', cloth: '#5c5462', trim: '#1e1c22', accent: '#b08ac8' },
};

export function palFor(spriteId: string): Pal {
  return NPC_PALS[spriteId] ?? MONSTER_PALS[spriteId] ?? PLAYER_PAL;
}

interface CharOpts {
  pal: Pal;
  dir: 'down' | 'up' | 'left' | 'right';
  frame: 0 | 1 | 2; // 0 idle, 1/2 walk
  big?: boolean;
}

function drawHumanoid(ctx: Ctx, o: CharOpts) {
  const p = o.pal;
  const bob = o.frame === 1 ? -1 : o.frame === 2 ? 0 : 0;
  const legSwing = o.frame === 1 ? 1 : o.frame === 2 ? -1 : 0;
  const cx = 8;
  const baseY = 15 + bob;

  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.beginPath();
  ctx.ellipse(8, 15.5, 5, 2, 0, 0, Math.PI * 2);
  ctx.fill();

  // legs
  px(ctx, cx - 3, baseY - 4, p.trim, 2, 3 + legSwing);
  px(ctx, cx + 1, baseY - 4, p.trim, 2, 3 - legSwing);
  px(ctx, cx - 3, baseY - 1 + legSwing, '#2a2018', 2, 1);
  px(ctx, cx + 1, baseY - 1 - legSwing, '#2a2018', 2, 1);

  // body
  px(ctx, cx - 4, baseY - 10, p.cloth, 8, 7);
  px(ctx, cx - 4, baseY - 10, lighten(p.cloth, 0.18), 8, 1);
  px(ctx, cx - 4, baseY - 4, darken(p.cloth, 0.25), 8, 1);
  // belt
  px(ctx, cx - 4, baseY - 5, p.trim, 8, 1);
  px(ctx, cx, baseY - 5, p.accent, 1, 1);

  // arms
  const armOff = o.frame === 1 ? 1 : o.frame === 2 ? -1 : 0;
  if (o.dir === 'left' || o.dir === 'right') {
    px(ctx, cx - 5, baseY - 9 + armOff, p.cloth, 2, 5);
    px(ctx, cx - 5, baseY - 4 + armOff, p.skin, 2, 2);
  } else {
    px(ctx, cx - 6, baseY - 9 + armOff, p.cloth, 2, 5);
    px(ctx, cx + 4, baseY - 9 - armOff, p.cloth, 2, 5);
    px(ctx, cx - 6, baseY - 4 + armOff, p.skin, 2, 2);
    px(ctx, cx + 4, baseY - 4 - armOff, p.skin, 2, 2);
  }

  // head
  const hy = baseY - 17;
  px(ctx, cx - 4, hy, p.skin, 8, 7);
  px(ctx, cx - 4, hy, p.hair, 8, 2);
  px(ctx, cx - 5, hy + 1, p.hair, 1, 4);
  px(ctx, cx + 4, hy + 1, p.hair, 1, 4);

  // face by direction
  if (o.dir === 'down') {
    px(ctx, cx - 2, hy + 3, '#1a1410', 1, 2);
    px(ctx, cx + 1, hy + 3, '#1a1410', 1, 2);
    px(ctx, cx - 2, hy + 5, darken(p.skin, 0.2), 1, 1);
    px(ctx, cx + 1, hy + 5, darken(p.skin, 0.2), 1, 1);
  } else if (o.dir === 'left') {
    px(ctx, cx - 3, hy + 3, '#1a1410', 1, 2);
    px(ctx, cx - 4, hy + 3, p.skin, 1, 2);
  } else if (o.dir === 'right') {
    px(ctx, cx + 2, hy + 3, '#1a1410', 1, 2);
  } else {
    // up: back of head
    px(ctx, cx - 4, hy, p.hair, 8, 5);
    px(ctx, cx - 3, hy + 1, lighten(p.hair, 0.12), 3, 1);
  }

  // hood / hat overlay for player
  if (p === PLAYER_PAL) {
    px(ctx, cx - 4, hy - 1, p.trim, 8, 2);
    px(ctx, cx - 5, hy, p.trim, 1, 3);
    px(ctx, cx + 4, hy, p.trim, 1, 3);
  }
}

function drawBlob(ctx: Ctx, p: Pal, frame: 0 | 1 | 2, jiggle = 0) {
  const squish = frame === 1 ? 1 : 0;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(8, 15, 6 + squish * 0.5, 2, 0, 0, Math.PI * 2);
  ctx.fill();

  const top = 6 - squish + jiggle;
  ctx.fillStyle = p.cloth;
  roundRect(ctx, 2 - squish, top, 12 + squish * 2, 9 + squish, 3);
  ctx.fillStyle = p.skin;
  roundRect(ctx, 3 - squish, top + 1, 10 + squish * 2, 7 + squish, 3);
  // highlight
  px(ctx, 5, top + 2, lighten(p.accent, 0.35), 2, 1);
  px(ctx, 6, top + 1, lighten(p.accent, 0.5), 1, 1);
  // eyes
  px(ctx, 5, top + 4, '#12140f', 1, 1);
  px(ctx, 10, top + 4, '#12140f', 1, 1);
  // drip
  px(ctx, 4, top + 8, darken(p.skin, 0.3), 1, 1);
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
}

function drawQuadruped(ctx: Ctx, p: Pal, frame: 0 | 1 | 2) {
  const step = frame === 1 ? 1 : frame === 2 ? -1 : 0;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(8, 15, 7, 2, 0, 0, Math.PI * 2);
  ctx.fill();

  // legs
  px(ctx, 3, 11 + step, p.trim, 2, 4 - step);
  px(ctx, 11, 11 - step, p.trim, 2, 4 + step);
  px(ctx, 5, 12, darken(p.trim, 0.2), 2, 3);
  px(ctx, 9, 12, darken(p.trim, 0.2), 2, 3);

  // body
  px(ctx, 2, 7, p.skin, 11, 5);
  px(ctx, 2, 7, lighten(p.skin, 0.14), 11, 1);
  px(ctx, 2, 11, darken(p.skin, 0.2), 11, 1);

  // head
  px(ctx, 11, 5, p.skin, 4, 4);
  px(ctx, 12, 4, p.hair, 3, 1);
  px(ctx, 11, 5, lighten(p.skin, 0.1), 1, 2);
  // snout and eye
  px(ctx, 15, 7, darken(p.skin, 0.25), 1, 2);
  px(ctx, 13, 6, '#e8d27a', 1, 1);
  // ears
  px(ctx, 11, 3, p.hair, 1, 2);
  px(ctx, 13, 3, p.hair, 1, 1);
  // tail
  px(ctx, 1, 5, p.hair, 2, 1);
  px(ctx, 0, 4, p.hair, 1, 1);
}

function drawFlying(ctx: Ctx, p: Pal, frame: 0 | 1 | 2) {
  const flap = frame === 1 ? 2 : frame === 2 ? -2 : 0;
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(8, 15, 5, 1.6, 0, 0, Math.PI * 2);
  ctx.fill();
  const y = 6 + flap * 0.5;
  // wings
  px(ctx, 0, y + 1 + flap, p.trim, 5, 3);
  px(ctx, 11, y + 1 + flap, p.trim, 5, 3);
  px(ctx, 1, y + 2 + flap, darken(p.trim, 0.15), 3, 1);
  px(ctx, 12, y + 2 + flap, darken(p.trim, 0.15), 3, 1);
  // body
  px(ctx, 5, y + 2, p.skin, 6, 5);
  px(ctx, 6, y + 1, p.hair, 4, 1);
  // eyes
  px(ctx, 6, y + 3, '#e8d27a', 1, 1);
  px(ctx, 9, y + 3, '#e8d27a', 1, 1);
  // ears
  px(ctx, 6, y, p.hair, 1, 2);
  px(ctx, 9, y, p.hair, 1, 2);
}

function drawBug(ctx: Ctx, p: Pal, frame: 0 | 1 | 2) {
  const step = frame === 1 ? 1 : frame === 2 ? -1 : 0;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(8, 15, 6, 2, 0, 0, Math.PI * 2);
  ctx.fill();
  // legs
  for (let i = 0; i < 3; i++) {
    px(ctx, 2 + i * 4, 12 + (i % 2 === 0 ? step : -step), p.trim, 1, 3);
    px(ctx, 13 - i * 4, 12 + (i % 2 === 0 ? -step : step), p.trim, 1, 3);
  }
  // shell
  px(ctx, 3, 5, p.skin, 10, 7);
  px(ctx, 3, 5, lighten(p.skin, 0.2), 10, 1);
  px(ctx, 8, 5, darken(p.skin, 0.3), 1, 7);
  px(ctx, 4, 7, lighten(p.skin, 0.1), 3, 1);
  px(ctx, 9, 9, lighten(p.skin, 0.1), 3, 1);
  // head
  px(ctx, 6, 3, p.hair, 4, 3);
  px(ctx, 6, 3, p.cloth, 4, 1);
  // antennae
  px(ctx, 5, 1, p.hair, 1, 2);
  px(ctx, 10, 1, p.hair, 1, 2);
  px(ctx, 6, 4, '#e8d27a', 1, 1);
  px(ctx, 9, 4, '#e8d27a', 1, 1);
}

function drawSpider(ctx: Ctx, p: Pal, frame: 0 | 1 | 2) {
  const step = frame === 1 ? 1 : frame === 2 ? -1 : 0;
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(8, 15, 7, 2, 0, 0, Math.PI * 2);
  ctx.fill();
  // legs (4 per side, jointed)
  for (let i = 0; i < 4; i++) {
    const y = 6 + i * 2;
    const sx = 2 + i * 1.4;
    px(ctx, sx, y, p.hair, 1, 2 + ((i + step) % 2));
    px(ctx, sx - 1, y + 3, p.trim, 1, 2);
    px(ctx, 15 - sx, y, p.hair, 1, 2 + ((i - step) % 2));
    px(ctx, 16 - sx, y + 3, p.trim, 1, 2);
  }
  // body
  ctx.fillStyle = p.skin;
  ctx.beginPath();
  ctx.ellipse(8, 10, 5, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = lighten(p.skin, 0.12);
  ctx.beginPath();
  ctx.ellipse(8, 9, 3, 2, 0, 0, Math.PI * 2);
  ctx.fill();
  // marking
  px(ctx, 7, 8, p.accent, 2, 2);
  px(ctx, 6, 11, darken(p.skin, 0.3), 1, 1);
  px(ctx, 9, 11, darken(p.skin, 0.3), 1, 1);
}

function drawWisp(ctx: Ctx, p: Pal, frame: 0 | 1 | 2) {
  const y = 7 + (frame === 1 ? -1 : frame === 2 ? 1 : 0);
  ctx.fillStyle = 'rgba(60,120,180,0.16)';
  ctx.beginPath();
  ctx.ellipse(8, y + 4, 8, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(120,180,240,0.5)';
  ctx.beginPath();
  ctx.ellipse(8, y + 3, 4, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  px(ctx, 7, y + 2, '#e8f4ff', 2, 2);
  px(ctx, 6, y + 6, p.skin, 2, 1);
  px(ctx, 9, y + 5, p.skin, 2, 1);
  px(ctx, 8, y + 9, p.skin, 1, 2);
}

function drawTreant(ctx: Ctx, p: Pal, frame: 0 | 1 | 2, big: boolean) {
  const s = big ? 2 : 1;
  const w = 16 * s;
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.beginPath();
  ctx.ellipse(w / 2, 15 * s, 6 * s, 2 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  const bob = frame === 1 ? -1 : 0;
  // trunk
  px(ctx, 6 * s, (8 + bob) * s, p.skin, 4 * s, 7 * s);
  px(ctx, 6 * s, (8 + bob) * s, lighten(p.skin, 0.2), 1 * s, 7 * s);
  // roots
  px(ctx, 4 * s, 14 * s, p.hair, 2 * s, 1 * s);
  px(ctx, 10 * s, 14 * s, p.hair, 2 * s, 1 * s);
  // crown
  ctx.fillStyle = p.cloth;
  ctx.beginPath();
  ctx.ellipse(8 * s, (5 + bob) * s, 6 * s, 4 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = lighten(p.cloth, 0.18);
  ctx.beginPath();
  ctx.ellipse(6 * s, (4 + bob) * s, 3 * s, 2 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  // eyes
  px(ctx, 6 * s, (10 + bob) * s, '#e8c25a', 1 * s, 1 * s);
  px(ctx, 9 * s, (10 + bob) * s, '#e8c25a', 1 * s, 1 * s);
  // branches
  px(ctx, 4 * s, (7 + bob) * s, p.hair, 2 * s, 1 * s);
  px(ctx, 10 * s, (8 + bob) * s, p.hair, 2 * s, 1 * s);
}

function drawHollow(ctx: Ctx, p: Pal, frame: 0 | 1 | 2) {
  // tall gaunt silhouette
  ctx.fillStyle = 'rgba(0,0,0,0.34)';
  ctx.beginPath();
  ctx.ellipse(8, 15, 5, 2, 0, 0, Math.PI * 2);
  ctx.fill();
  const sway = frame === 1 ? 1 : frame === 2 ? -1 : 0;
  px(ctx, 7, 13, p.trim, 2, 2);
  px(ctx, 5, 6 + sway * 0, p.cloth, 6, 8);
  px(ctx, 5, 6, lighten(p.cloth, 0.12), 6, 1);
  px(ctx, 4, 8, p.cloth, 1, 5);
  px(ctx, 11, 8, p.cloth, 1, 5);
  // long arms
  px(ctx, 3, 8 + sway, p.cloth, 1, 5);
  px(ctx, 12, 8 - sway, p.cloth, 1, 5);
  px(ctx, 3, 13 + sway, p.skin, 1, 1);
  px(ctx, 12, 13 - sway, p.skin, 1, 1);
  // head
  px(ctx, 5, 1, p.skin, 6, 5);
  px(ctx, 6, 2, '#0c0a0e', 4, 1);
  px(ctx, 6, 4, p.accent, 1, 1);
  px(ctx, 9, 4, p.accent, 1, 1);
  // tattered hem
  px(ctx, 5, 13, darken(p.cloth, 0.3), 1, 1);
  px(ctx, 9, 14, darken(p.cloth, 0.3), 1, 1);
}

function drawKnight(ctx: Ctx, p: Pal, frame: 0 | 1 | 2) {
  const step = frame === 1 ? 1 : frame === 2 ? -1 : 0;
  ctx.fillStyle = 'rgba(0,0,0,0.36)';
  ctx.beginPath();
  ctx.ellipse(8, 15, 6, 2.2, 0, 0, Math.PI * 2);
  ctx.fill();
  // legs
  px(ctx, 4, 11 + step, p.trim, 2, 4);
  px(ctx, 10, 11 - step, p.trim, 2, 4);
  // torso (plate)
  px(ctx, 3, 5, p.cloth, 10, 7);
  px(ctx, 3, 5, lighten(p.cloth, 0.2), 10, 1);
  px(ctx, 3, 11, darken(p.cloth, 0.3), 10, 1);
  px(ctx, 8, 6, darken(p.cloth, 0.35), 1, 5);
  // pauldrons
  px(ctx, 1, 5, p.skin, 3, 3);
  px(ctx, 12, 5, p.skin, 3, 3);
  // helm
  px(ctx, 4, 0, p.skin, 8, 5);
  px(ctx, 4, 4, p.trim, 8, 1);
  px(ctx, 6, 2, '#0d0c0e', 4, 1);
  px(ctx, 7, 2, p.accent, 1, 1);
  px(ctx, 9, 2, p.accent, 1, 1);
  // greatsword
  px(ctx, 13, 2, '#c8c8cc', 1, 9);
  px(ctx, 12, 10, p.trim, 3, 1);
  px(ctx, 13, 11, p.trim, 1, 2);
}

function drawBoss(ctx: Ctx, p: Pal, frame: 0 | 1 | 2) {
  const pulse = frame === 1 ? 1 : 0;
  // aura
  ctx.fillStyle = 'rgba(120,80,160,0.13)';
  ctx.beginPath();
  ctx.ellipse(16, 16, 15 + pulse, 14 + pulse, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(16, 30, 12, 3.4, 0, 0, Math.PI * 2);
  ctx.fill();

  // roots reaching out
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.4;
    const rx = 16 + Math.cos(a) * 12;
    const ry = 26 + Math.sin(a) * 4;
    px(ctx, rx, ry, '#2a2018', 2, 2);
  }

  // body mass
  ctx.fillStyle = p.cloth;
  ctx.beginPath();
  ctx.ellipse(16, 21, 11, 9 + pulse, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = lighten(p.cloth, 0.1);
  ctx.beginPath();
  ctx.ellipse(13, 18, 6, 4, -0.3, 0, Math.PI * 2);
  ctx.fill();

  // trunk / neck
  px(ctx, 12, 8, p.skin, 8, 10);
  px(ctx, 12, 8, lighten(p.skin, 0.16), 2, 10);

  // crown-like head
  ctx.fillStyle = p.skin;
  ctx.beginPath();
  ctx.ellipse(16, 7, 8, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  // antlers
  px(ctx, 8, 1, p.hair, 2, 4);
  px(ctx, 6, 0, p.hair, 2, 2);
  px(ctx, 22, 1, p.hair, 2, 4);
  px(ctx, 24, 0, p.hair, 2, 2);
  // glowing eyes
  px(ctx, 12, 7, '#c8a0ff', 2, 2);
  px(ctx, 18, 7, '#c8a0ff', 2, 2);
  px(ctx, 12, 7, '#f0e8ff', 1, 1);
  px(ctx, 18, 7, '#f0e8ff', 1, 1);
  // maw
  px(ctx, 14, 11, '#1a1018', 4, 2);
  px(ctx, 15, 11, p.accent, 1, 1);
  px(ctx, 17, 11, p.accent, 1, 1);
}

export function charSprite(spriteId: string, dir: 'down' | 'up' | 'left' | 'right', frame: 0 | 1 | 2): HTMLCanvasElement {
  const key = `char:${spriteId}:${dir}:${frame}`;
  const size = spriteId === 'heart' || spriteId === 'mother' ? 32 : 16;
  return sprite(key, size, size, (ctx) => {
    const pal = palFor(spriteId);
    const d = dir === 'left' || dir === 'right' ? dir : dir;
    switch (spriteId) {
      case 'rat':
        drawQuadruped(ctx, pal, frame);
        break;
      case 'slime':
        drawBlob(ctx, pal, frame);
        break;
      case 'beetle':
        drawBug(ctx, pal, frame);
        break;
      case 'wolf':
        drawQuadruped(ctx, pal, frame);
        break;
      case 'bat':
        drawFlying(ctx, pal, frame);
        break;
      case 'spider':
        drawSpider(ctx, pal, frame);
        break;
      case 'wisp':
        drawWisp(ctx, pal, frame);
        break;
      case 'sapling':
        drawTreant(ctx, pal, frame, false);
        break;
      case 'knight':
      case 'warden':
        drawKnight(ctx, pal, frame);
        break;
      case 'hollow':
        drawHollow(ctx, pal, frame);
        break;
      case 'heart':
      case 'mother':
        drawBoss(ctx, pal, frame);
        break;
      default:
        drawHumanoid(ctx, { pal, dir: d, frame });
    }
  });
}

/* ============================================================
   Props
   ============================================================ */

export function propSprite(kind: string, variant = 0): HTMLCanvasElement {
  const key = `prop:${kind}:${variant}`;
  return sprite(key, 16, 24, (ctx) => {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(8, 22, 5, 1.8, 0, 0, Math.PI * 2);
    ctx.fill();

    switch (kind) {
      case 'tree': {
        const sway = (variant % 3) - 1;
        // trunk
        px(ctx, 7, 14, '#3a2a1e', 2, 8);
        px(ctx, 7, 14, '#4a3626', 1, 8);
        // roots
        px(ctx, 5, 21, '#33251a', 3, 1);
        px(ctx, 8, 21, '#33251a', 3, 1);
        // canopy
        const cx = 8 + sway;
        const layers: Array<[number, number, number, string]> = [
          [cx - 7, 8, 7, '#263a28'],
          [cx - 5, 4, 6, '#2e4630'],
          [cx - 1, 2, 5, '#375438'],
          [cx - 3, 6, 4, '#436544'],
        ];
        for (const [x, y, r, c] of layers) {
          ctx.fillStyle = c;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }
        // highlights
        px(ctx, cx - 4, 3, '#547a4e', 3, 1);
        px(ctx, cx + 1, 5, '#547a4e', 2, 1);
        px(ctx, cx - 6, 9, '#4a6b46', 2, 1);
        break;
      }
      case 'boulder': {
        ctx.fillStyle = '#3a3f3a';
        ctx.beginPath();
        ctx.ellipse(8, 17, 7, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#474d46';
        ctx.beginPath();
        ctx.ellipse(6, 15, 4, 3, -0.3, 0, Math.PI * 2);
        ctx.fill();
        px(ctx, 4, 19, '#2b2f2b', 3, 1);
        px(ctx, 11, 20, '#2b2f2b', 2, 1);
        break;
      }
      case 'chest':
      case 'chest_open': {
        const open = kind === 'chest_open';
        px(ctx, 2, 12, '#4a3626', 12, 8);
        px(ctx, 2, 12, '#5a4230', 12, 1);
        px(ctx, 2, 19, '#2e2118', 12, 1);
        px(ctx, 2, 9, open ? '#3a2a1e' : '#5a4230', 12, 4);
        if (open) {
          px(ctx, 3, 8, '#2e2118', 10, 2);
          // glow
          ctx.fillStyle = 'rgba(216,165,74,0.35)';
          ctx.beginPath();
          ctx.ellipse(8, 12, 5, 3, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        px(ctx, 7, 12, '#d8a54a', 2, 3);
        px(ctx, 8, 14, '#2e2118', 1, 1);
        px(ctx, 3, 11, '#6a5240', 10, 1);
        break;
      }
      case 'bones': {
        px(ctx, 3, 19, '#c8c2b0', 5, 1);
        px(ctx, 8, 20, '#a8a294', 4, 1);
        px(ctx, 5, 17, '#d8d2c0', 2, 2);
        // skull
        px(ctx, 9, 15, '#d8d2c0', 4, 3);
        px(ctx, 10, 16, '#2a2620', 1, 1);
        px(ctx, 11, 16, '#2a2620', 1, 1);
        break;
      }
      case 'statue': {
        px(ctx, 4, 18, '#333a36', 8, 4);
        px(ctx, 5, 8, '#4a5250', 6, 10);
        px(ctx, 5, 8, '#5a625f', 6, 1);
        px(ctx, 6, 3, '#5a625f', 4, 5);
        px(ctx, 6, 1, '#5a625f', 4, 2);
        px(ctx, 5, 4, '#6a726f', 1, 3);
        px(ctx, 10, 4, '#43504a', 1, 3);
        // moss
        px(ctx, 4, 10, '#3d5d40', 2, 1);
        px(ctx, 10, 14, '#3d5d40', 2, 1);
        px(ctx, 6, 2, '#4a6a48', 2, 1);
        break;
      }
      case 'mushroom': {
        px(ctx, 7, 17, '#c8c0a8', 2, 4);
        ctx.fillStyle = '#7a4a3a';
        ctx.beginPath();
        ctx.ellipse(8, 16, 5, 3, 0, Math.PI, 0);
        ctx.fill();
        px(ctx, 5, 14, '#a86a52', 2, 1);
        px(ctx, 9, 15, '#a86a52', 2, 1);
        px(ctx, 6, 21, '#5a4a3a', 4, 1);
        break;
      }
      case 'sign': {
        px(ctx, 7, 14, '#4a3626', 2, 7);
        px(ctx, 3, 9, '#5a4230', 10, 6);
        px(ctx, 3, 9, '#6a5240', 10, 1);
        px(ctx, 4, 11, '#3a2a1e', 8, 1);
        px(ctx, 4, 13, '#3a2a1e', 5, 1);
        break;
      }
      case 'barrel': {
        px(ctx, 4, 13, '#4a3626', 8, 9);
        px(ctx, 4, 13, '#5a4230', 8, 1);
        px(ctx, 4, 16, '#2e2118', 8, 1);
        px(ctx, 4, 20, '#2e2118', 8, 1);
        px(ctx, 5, 14, '#6a5240', 1, 7);
        break;
      }
      case 'bush': {
        ctx.fillStyle = '#2a422e';
        ctx.beginPath();
        ctx.arc(6, 19, 4, 0, Math.PI * 2);
        ctx.arc(11, 19, 4, 0, Math.PI * 2);
        ctx.arc(8, 15, 4, 0, Math.PI * 2);
        ctx.fill();
        px(ctx, 7, 15, '#3a5a3a', 2, 1);
        px(ctx, 5, 18, '#3a5a3a', 2, 1);
        break;
      }
      case 'bag': {
        px(ctx, 4, 16, '#6a5a3a', 8, 6);
        px(ctx, 4, 16, '#7a6a48', 8, 1);
        px(ctx, 6, 13, '#5a4a2e', 4, 3);
        px(ctx, 6, 14, '#d8a54a', 1, 1);
        px(ctx, 9, 14, '#d8a54a', 1, 1);
        break;
      }
      case 'grave': {
        px(ctx, 4, 12, '#4a4f4a', 8, 10);
        px(ctx, 7, 7, '#4a4f4a', 2, 5);
        px(ctx, 6, 8, '#5a5f5a', 4, 2);
        px(ctx, 5, 15, '#3a3f3a', 2, 5);
        break;
      }
      default: {
        px(ctx, 5, 14, '#4a4f4a', 6, 8);
      }
    }
  });
}

export function stairsSprite(down: boolean): HTMLCanvasElement {
  return sprite(`stairs:${down}`, 16, 16, (ctx) => {
    if (down) {
      px(ctx, 0, 0, '#1a1f1f', 16, 16);
      for (let i = 0; i < 4; i++) {
        px(ctx, 2 + i, 2 + i * 3, '#3a4040', 12 - i * 2, 2);
        px(ctx, 2 + i, 4 + i * 3, '#2a3030', 12 - i * 2, 1);
      }
      px(ctx, 0, 0, '#0a0d0d', 16, 1);
      // torch glow
      px(ctx, 2, 1, '#d8a54a', 1, 1);
      px(ctx, 13, 1, '#d8a54a', 1, 1);
    } else {
      px(ctx, 0, 0, '#232828', 16, 16);
      for (let i = 0; i < 4; i++) {
        px(ctx, 1 + i, 13 - i * 3, '#3a4040', 14 - i * 2, 2);
        px(ctx, 1 + i, 13 - i * 3, '#4a5050', 14 - i * 2, 1);
      }
    }
  });
}

export function doorSprite(): HTMLCanvasElement {
  return sprite('door', 16, 24, (ctx) => {
    px(ctx, 2, 6, '#3a2a1e', 12, 17);
    px(ctx, 2, 6, '#5a4230', 12, 1);
    px(ctx, 4, 9, '#4a3626', 8, 13);
    px(ctx, 4, 9, '#5a4230', 8, 1);
    px(ctx, 5, 11, '#3a2a1e', 6, 1);
    px(ctx, 5, 16, '#3a2a1e', 6, 1);
    px(ctx, 11, 15, '#d8a54a', 1, 1);
    // frame stones
    px(ctx, 1, 4, '#3a3f3a', 1, 19);
    px(ctx, 14, 4, '#3a3f3a', 1, 19);
    px(ctx, 1, 4, '#4a4f4a', 14, 2);
  });
}

/* ============================================================
   Items
   ============================================================ */

export function itemSprite(spriteId: string): HTMLCanvasElement {
  return sprite(`item:${spriteId}`, 16, 16, (ctx) => {
    switch (spriteId) {
      case 'dagger':
        px(ctx, 7, 2, '#c8ccd0', 2, 6);
        px(ctx, 7, 2, '#e8ecf0', 1, 5);
        px(ctx, 6, 8, '#8a6a3a', 4, 1);
        px(ctx, 7, 9, '#5a4230', 2, 3);
        break;
      case 'sword':
        px(ctx, 7, 1, '#c8ccd0', 2, 9);
        px(ctx, 7, 1, '#eef2f4', 1, 8);
        px(ctx, 5, 10, '#a8802a', 6, 1);
        px(ctx, 7, 11, '#5a4230', 2, 3);
        px(ctx, 6, 13, '#8a6a3a', 4, 1);
        break;
      case 'greatsword':
        px(ctx, 6, 0, '#c8ccd0', 4, 10);
        px(ctx, 6, 0, '#f0f4f6', 1, 9);
        px(ctx, 7, 1, '#9aa0a4', 1, 8);
        px(ctx, 3, 10, '#a8802a', 10, 2);
        px(ctx, 7, 12, '#4a3626', 2, 3);
        break;
      case 'rapier':
        px(ctx, 8, 1, '#e0e4e8', 1, 9);
        px(ctx, 5, 10, '#d8a54a', 5, 1);
        px(ctx, 7, 11, '#4a4038', 2, 3);
        px(ctx, 6, 9, '#c8a86a', 3, 1);
        break;
      case 'axe':
        px(ctx, 7, 2, '#5a4230', 2, 12);
        ctx.fillStyle = '#b8bcc0';
        ctx.beginPath();
        ctx.moveTo(8, 2); ctx.lineTo(14, 4); ctx.lineTo(14, 8); ctx.lineTo(8, 10);
        ctx.closePath();
        ctx.fill();
        px(ctx, 9, 3, '#dde2e6', 3, 1);
        px(ctx, 8, 2, '#eef2f4', 1, 7);
        break;
      case 'spear':
        px(ctx, 7, 5, '#5a4230', 2, 10);
        ctx.fillStyle = '#c8ccd0';
        ctx.beginPath();
        ctx.moveTo(8, 0); ctx.lineTo(10, 6); ctx.lineTo(8, 5); ctx.lineTo(6, 6);
        ctx.closePath();
        ctx.fill();
        px(ctx, 8, 0, '#e8ecf0', 1, 4);
        break;
      case 'bow':
        ctx.strokeStyle = '#8a6a3a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(9, 8, 6, -Math.PI * 0.72, Math.PI * 0.72);
        ctx.stroke();
        px(ctx, 4, 2, '#c8c0a8', 1, 12);
        px(ctx, 8, 7, '#6a5240', 6, 1);
        px(ctx, 13, 7, '#c8c0a8', 1, 1);
        break;
      case 'staff':
        px(ctx, 7, 4, '#6a5240', 2, 12);
        px(ctx, 7, 4, '#7a6250', 1, 11);
        ctx.fillStyle = 'rgba(120,200,160,0.35)';
        ctx.beginPath();
        ctx.arc(8, 3, 4, 0, Math.PI * 2);
        ctx.fill();
        px(ctx, 7, 2, '#8ad0a8', 2, 2);
        px(ctx, 8, 1, '#c8f0d8', 1, 1);
        break;
      case 'armor':
        px(ctx, 4, 4, '#5a5a60', 8, 9);
        px(ctx, 4, 4, '#7a7a82', 8, 1);
        px(ctx, 4, 4, '#3a3a40', 2, 9);
        px(ctx, 10, 4, '#3a3a40', 2, 9);
        px(ctx, 6, 6, '#6a6a72', 4, 5);
        px(ctx, 7, 5, '#4a4a50', 2, 1);
        break;
      case 'robe':
        ctx.fillStyle = '#3a5a4a';
        ctx.beginPath();
        ctx.moveTo(5, 3); ctx.lineTo(11, 3); ctx.lineTo(13, 14); ctx.lineTo(3, 14);
        ctx.closePath();
        ctx.fill();
        px(ctx, 6, 3, '#5a7a68', 4, 1);
        px(ctx, 7, 6, '#2e4a3e', 2, 6);
        px(ctx, 5, 10, '#4a6a58', 2, 1);
        break;
      case 'plate':
        px(ctx, 3, 3, '#6a6a72', 10, 10);
        px(ctx, 3, 3, '#8a8a94', 10, 1);
        px(ctx, 4, 5, '#5a5a62', 8, 6);
        px(ctx, 7, 4, '#4a4a52', 2, 8);
        px(ctx, 4, 12, '#3a3a42', 8, 1);
        break;
      case 'hood':
        ctx.fillStyle = '#3a5040';
        ctx.beginPath();
        ctx.arc(8, 8, 6, Math.PI, 0);
        ctx.lineTo(13, 13); ctx.lineTo(3, 13);
        ctx.closePath();
        ctx.fill();
        px(ctx, 6, 5, '#4a6452', 3, 1);
        px(ctx, 5, 11, '#2e4236', 6, 1);
        break;
      case 'helm':
        px(ctx, 4, 4, '#6a6a72', 8, 7);
        px(ctx, 4, 4, '#8a8a94', 8, 1);
        px(ctx, 5, 7, '#2a2a30', 6, 2);
        px(ctx, 7, 9, '#4a4a52', 2, 3);
        px(ctx, 4, 10, '#3a3a42', 8, 1);
        break;
      case 'circlet':
        ctx.strokeStyle = '#c8c0a8';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(8, 9, 5, Math.PI * 0.15, Math.PI * 0.85);
        ctx.stroke();
        px(ctx, 7, 3, '#a89ac8', 2, 2);
        px(ctx, 8, 3, '#e0d8ff', 1, 1);
        break;
      case 'shield':
        ctx.fillStyle = '#4a3626';
        ctx.beginPath();
        ctx.moveTo(4, 2); ctx.lineTo(12, 2); ctx.lineTo(12, 9);
        ctx.quadraticCurveTo(12, 13, 8, 14); ctx.quadraticCurveTo(4, 13, 4, 9);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#7a5a32';
        ctx.stroke();
        px(ctx, 7, 4, '#8a6a3a', 2, 7);
        px(ctx, 4, 4, '#5a4230', 8, 1);
        break;
      case 'ring':
        ctx.strokeStyle = '#d8a54a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(8, 9, 4, 0, Math.PI * 2);
        ctx.stroke();
        px(ctx, 7, 3, '#8ab6f0', 2, 2);
        px(ctx, 8, 2, '#d8f0ff', 1, 1);
        break;
      case 'charm':
        px(ctx, 7, 2, '#8a6a3a', 1, 4);
        ctx.fillStyle = '#5a4230';
        ctx.beginPath();
        ctx.arc(8, 10, 5, 0, Math.PI * 2);
        ctx.fill();
        px(ctx, 7, 8, '#d8a54a', 2, 3);
        px(ctx, 6, 7, '#6a5240', 4, 1);
        break;
      case 'potion':
      case 'potion2':
      case 'sp_potion':
      case 'elixir': {
        const liquid = spriteId === 'potion' ? '#a83a34'
          : spriteId === 'potion2' ? '#c84a3a'
          : spriteId === 'sp_potion' ? '#3a6aa8'
          : '#d8b84a';
        // bottle
        px(ctx, 6, 2, '#9aa09c', 4, 2);
        px(ctx, 5, 4, '#8a908c', 6, 1);
        px(ctx, 4, 5, '#7a807c', 8, 9);
        px(ctx, 4, 5, '#9aa09c', 1, 9);
        // liquid
        px(ctx, 5, 7, liquid, 6, 6);
        px(ctx, 5, 7, lighten(liquid, 0.3), 6, 1);
        px(ctx, 6, 8, lighten(liquid, 0.45), 1, 3);
        // shine
        px(ctx, 10, 6, 'rgba(255,255,255,0.5)', 1, 3);
        break;
      }
      case 'herb':
        px(ctx, 8, 12, '#3a5a3a', 1, 3);
        ctx.fillStyle = '#4a7a48';
        ctx.beginPath();
        ctx.ellipse(6, 8, 3, 2, -0.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(10, 8, 3, 2, 0.6, 0, Math.PI * 2);
        ctx.fill();
        px(ctx, 7, 6, '#6aa060', 2, 1);
        px(ctx, 9, 6, '#6aa060', 2, 1);
        break;
      case 'meat':
        px(ctx, 4, 6, '#8a4a3a', 8, 5);
        px(ctx, 4, 6, '#a85a44', 8, 1);
        px(ctx, 5, 11, '#d8c8a8', 6, 2);
        px(ctx, 6, 7, '#c87a5a', 2, 1);
        px(ctx, 9, 9, '#6a3a2e', 2, 1);
        break;
      case 'scroll':
        px(ctx, 3, 4, '#d8cfb8', 10, 8);
        px(ctx, 3, 4, '#e8dfc8', 10, 1);
        px(ctx, 3, 11, '#b8af98', 10, 1);
        px(ctx, 5, 6, '#8a7a5a', 6, 1);
        px(ctx, 5, 8, '#8a7a5a', 5, 1);
        px(ctx, 2, 3, '#a8603a', 2, 10);
        px(ctx, 12, 3, '#a8603a', 2, 10);
        break;
      case 'ore':
        ctx.fillStyle = '#5a5a60';
        ctx.beginPath();
        ctx.moveTo(4, 12); ctx.lineTo(5, 6); ctx.lineTo(10, 4); ctx.lineTo(13, 9); ctx.lineTo(11, 13);
        ctx.closePath();
        ctx.fill();
        px(ctx, 6, 6, '#8a8a90', 2, 2);
        px(ctx, 9, 8, '#a87a5a', 2, 2);
        px(ctx, 7, 10, '#6a6a70', 3, 1);
        break;
      case 'wood':
        px(ctx, 2, 8, '#6a5240', 12, 4);
        px(ctx, 2, 8, '#7a6250', 12, 1);
        px(ctx, 2, 11, '#4a3626', 12, 1);
        px(ctx, 4, 9, '#5a4230', 1, 2);
        px(ctx, 9, 9, '#5a4230', 1, 2);
        break;
      case 'pelt':
        ctx.fillStyle = '#7a5a42';
        ctx.beginPath();
        ctx.moveTo(4, 4); ctx.lineTo(12, 4); ctx.lineTo(13, 12); ctx.lineTo(8, 10); ctx.lineTo(3, 12);
        ctx.closePath();
        ctx.fill();
        px(ctx, 5, 5, '#8a6a52', 4, 1);
        px(ctx, 6, 7, '#6a4a32', 3, 2);
        break;
      case 'bone':
        px(ctx, 4, 9, '#d8d2c0', 5, 2);
        px(ctx, 9, 7, '#d8d2c0', 3, 2);
        px(ctx, 3, 8, '#e8e2d0', 2, 1);
        px(ctx, 11, 6, '#e8e2d0', 2, 1);
        px(ctx, 8, 10, '#b8b2a0', 2, 1);
        break;
      case 'shard':
        ctx.fillStyle = '#8a79cf';
        ctx.beginPath();
        ctx.moveTo(8, 2); ctx.lineTo(12, 8); ctx.lineTo(8, 14); ctx.lineTo(4, 8);
        ctx.closePath();
        ctx.fill();
        px(ctx, 7, 5, '#c8b8ff', 2, 3);
        px(ctx, 8, 3, '#e8dcff', 1, 2);
        break;
      case 'silk':
        ctx.strokeStyle = '#c8c4b8';
        ctx.lineWidth = 1;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.moveTo(3, 4 + i * 4);
          ctx.lineTo(13, 6 + i * 3);
          ctx.stroke();
        }
        px(ctx, 8, 8, '#e8e4d8', 1, 1);
        break;
      case 'ember':
        ctx.fillStyle = 'rgba(216,120,60,0.35)';
        ctx.beginPath();
        ctx.arc(8, 8, 6, 0, Math.PI * 2);
        ctx.fill();
        px(ctx, 7, 5, '#e08a3c', 2, 5);
        px(ctx, 8, 4, '#f4d190', 1, 3);
        px(ctx, 6, 9, '#a85a2a', 4, 1);
        break;
      default:
        px(ctx, 5, 5, '#8a7a5a', 6, 6);
    }
  });
}

/* ============================================================
   Skill icons
   ============================================================ */

export function skillSprite(id: string): HTMLCanvasElement {
  return sprite(`skill:${id}`, 24, 24, (ctx) => {
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(0, 0, 24, 24);
    switch (id) {
      case 'cleave': {
        ctx.strokeStyle = '#e0c88a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(12, 14, 8, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
        px(ctx, 6, 6, '#e8ecf0', 3, 3);
        px(ctx, 7, 9, '#8a6a3a', 2, 4);
        break;
      }
      case 'ember': {
        ctx.fillStyle = 'rgba(220,120,60,0.4)';
        ctx.beginPath(); ctx.arc(12, 12, 7, 0, Math.PI * 2); ctx.fill();
        px(ctx, 11, 6, '#e08a3c', 2, 9);
        px(ctx, 12, 5, '#f4d190', 1, 5);
        px(ctx, 9, 14, '#a85a2a', 6, 2);
        break;
      }
      case 'guard': {
        ctx.strokeStyle = '#8ab6f0';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(12, 4); ctx.lineTo(19, 8); ctx.lineTo(19, 14);
        ctx.quadraticCurveTo(19, 19, 12, 21);
        ctx.quadraticCurveTo(5, 19, 5, 14); ctx.lineTo(5, 8);
        ctx.closePath();
        ctx.stroke();
        px(ctx, 11, 9, '#8ab6f0', 2, 6);
        break;
      }
      case 'fang': {
        px(ctx, 7, 5, '#e8e4d8', 2, 7);
        px(ctx, 15, 5, '#e8e4d8', 2, 7);
        px(ctx, 8, 5, '#c8c4b8', 1, 5);
        px(ctx, 16, 5, '#c8c4b8', 1, 5);
        px(ctx, 9, 11, '#a83a34', 2, 2);
        px(ctx, 13, 11, '#a83a34', 2, 2);
        break;
      }
      case 'nova': {
        ctx.strokeStyle = '#8ad0a8';
        ctx.lineWidth = 1;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.arc(12, 12, 4 + i * 3, 0, Math.PI * 2);
          ctx.stroke();
        }
        px(ctx, 11, 11, '#d0f8e0', 2, 2);
        break;
      }
      case 'step': {
        px(ctx, 6, 14, '#5c5462', 5, 2);
        px(ctx, 9, 10, '#7a7484', 5, 2);
        px(ctx, 12, 6, '#a89ac0', 5, 2);
        px(ctx, 16, 4, '#d0c8e8', 2, 2);
        break;
      }
      case 'heal': {
        px(ctx, 11, 4, '#7fc9a0', 2, 16);
        px(ctx, 4, 11, '#7fc9a0', 16, 2);
        px(ctx, 12, 5, '#c8f0d8', 1, 14);
        px(ctx, 5, 12, '#c8f0d8', 14, 1);
        break;
      }
      case 'cry': {
        ctx.strokeStyle = '#e0705f';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(12, 14, 7, Math.PI * 1.1, Math.PI * 1.9);
        ctx.stroke();
        px(ctx, 6, 5, '#e0705f', 3, 2);
        px(ctx, 15, 5, '#e0705f', 3, 2);
        break;
      }
      case 'thorn': {
        ctx.strokeStyle = '#7a9a5a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(4, 20); ctx.lineTo(20, 4);
        ctx.stroke();
        for (let i = 0; i < 3; i++) {
          px(ctx, 8 + i * 4, 14 - i * 4, '#a8b88a', 3, 1);
        }
        break;
      }
      case 'light': {
        ctx.fillStyle = 'rgba(244,209,144,0.3)';
        ctx.beginPath(); ctx.arc(12, 12, 9, 0, Math.PI * 2); ctx.fill();
        px(ctx, 11, 4, '#f4d190', 2, 16);
        px(ctx, 4, 11, '#f4d190', 16, 2);
        px(ctx, 9, 9, '#fff4d8', 6, 6);
        break;
      }
      default:
        px(ctx, 8, 8, '#8a7a5a', 8, 8);
    }
  });
}

export function npcPortrait(spriteId: string): HTMLCanvasElement {
  return sprite(`portrait:${spriteId}`, 64, 64, (ctx) => {
    const pal = palFor(spriteId);
    ctx.fillStyle = '#0d1310';
    ctx.fillRect(0, 0, 64, 64);
    // backdrop glow
    const g = ctx.createRadialGradient(32, 26, 4, 32, 34, 40);
    g.addColorStop(0, 'rgba(120,150,110,0.22)');
    g.addColorStop(1, 'rgba(10,16,13,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);

    // shoulders
    ctx.fillStyle = pal.cloth;
    roundRect(ctx, 10, 44, 44, 24, 8);
    // neck
    ctx.fillStyle = darken(pal.skin, 0.15);
    ctx.fillRect(27, 38, 10, 10);
    // head
    ctx.fillStyle = pal.skin;
    roundRect(ctx, 18, 12, 28, 32, 10);
    // hair
    ctx.fillStyle = pal.hair;
    ctx.beginPath();
    ctx.moveTo(16, 26);
    ctx.quadraticCurveTo(16, 6, 32, 7);
    ctx.quadraticCurveTo(48, 6, 48, 26);
    ctx.lineTo(45, 22);
    ctx.quadraticCurveTo(40, 14, 32, 15);
    ctx.quadraticCurveTo(24, 14, 19, 22);
    ctx.closePath();
    ctx.fill();
    // eyes
    ctx.fillStyle = '#1a1410';
    ctx.fillRect(25, 28, 4, 5);
    ctx.fillRect(35, 28, 4, 5);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(26, 29, 1, 1);
    ctx.fillRect(36, 29, 1, 1);
    // shadow under brow
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(22, 24, 20, 2);
    // nose + mouth
    ctx.fillStyle = darken(pal.skin, 0.22);
    ctx.fillRect(31, 33, 2, 4);
    ctx.fillStyle = darken(pal.skin, 0.35);
    ctx.fillRect(28, 40, 8, 1);
    // trim
    ctx.fillStyle = pal.trim;
    ctx.fillRect(10, 50, 44, 3);
    ctx.fillStyle = pal.accent;
    ctx.fillRect(30, 52, 4, 12);
    // vignette
    const vg = ctx.createRadialGradient(32, 32, 18, 32, 32, 46);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, 64, 64);
  });
}

/* ============================================================
   colour helpers
   ============================================================ */

export function lighten(hex: string, amt: number): string {
  return shift(hex, amt);
}
export function darken(hex: string, amt: number): string {
  return shift(hex, -amt);
}
function shift(hex: string, amt: number): string {
  const n = hex.replace('#', '');
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + 255 * amt)));
  return `#${[f(r), f(g), f(b)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export function clearSpriteCache(): void {
  cache.clear();
}
