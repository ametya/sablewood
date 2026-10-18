import { clamp, hash2, lerp, RNG } from '../core/rng';
import { T, type Entity } from '../core/types';
import type { Game } from '../core/game';
import {
  charSprite, doorSprite, itemSprite, propSprite, stairsSprite, tileSprite,
} from './art';

interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number;
  color: string; size: number; gravity: number; kind: string;
}

interface FloatText {
  x: number; y: number; text: string; life: number; maxLife: number;
  color: string; size: number; kind: 'dmg' | 'crit' | 'heal' | 'miss' | 'sp';
}

interface Camera {
  x: number; y: number; shake: number; shakeX: number; shakeY: number; zoom: number;
}

export class Renderer {
  ctx: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  dpr = 1;
  w = 0;
  h = 0;
  cam: Camera = { x: 0, y: 0, shake: 0, shakeX: 0, shakeY: 0, zoom: 1 };
  particles: Particle[] = [];
  texts: FloatText[] = [];
  hitstop = 0;
  flash: { color: string; alpha: number } | null = null;
  banners: { text: string; sub?: string; life: number }[] = [];
  rng = new RNG(12345);
  time = 0;
  /** interpolated positions for smooth movement */
  private renderPos = new Map<number, { x: number; y: number }>();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.ctx.imageSmoothingEnabled = false;
  }

  resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.dpr = dpr;
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.w = w;
    this.h = h;
  }

  get tileSize(): number {
    // keep a readable zoom: about 26-40 tiles across
    const base = Math.max(28, Math.min(46, Math.round(this.w / 32)));
    return base;
  }

  /** World -> screen. */
  private worldToScreen(wx: number, wy: number): [number, number] {
    const ts = this.tileSize;
    const cx = this.w / 2 - this.cam.x * ts;
    const cy = this.h / 2 - this.cam.y * ts;
    return [Math.round(cx + wx * ts + this.cam.shakeX), Math.round(cy + wy * ts + this.cam.shakeY)];
  }

  screenToTile(sx: number, sy: number): { x: number; y: number } {
    const ts = this.tileSize;
    const cx = this.w / 2 - this.cam.x * ts;
    const cy = this.h / 2 - this.cam.y * ts;
    return {
      x: Math.floor((sx - this.cam.shakeX - cx) / ts),
      y: Math.floor((sy - this.cam.shakeY - cy) / ts),
    };
  }

  /* ---------------------------------------------------------- frame */

  update(dt: number, g: Game): void {
    this.time += dt;
    // hitstop
    if (this.hitstop > 0) {
      this.hitstop -= dt * 1000;
      dt *= 0.08;
    }
    // camera follows with dead zone
    const p = g.player;
    const ts = this.tileSize;
    const lead = 0.35;
    let tx = p.x + 0.5;
    let ty = p.y + 0.5;
    if (p.facing === 'left') tx -= lead;
    if (p.facing === 'right') tx += lead;
    if (p.facing === 'up') ty -= lead;
    if (p.facing === 'down') ty += lead;
    const follow = 1 - Math.pow(0.0015, dt);
    this.cam.x = lerp(this.cam.x, tx, follow);
    this.cam.y = lerp(this.cam.y, ty, follow);

    // shake decay
    if (this.cam.shake > 0.05) {
      this.cam.shake *= Math.pow(0.0008, dt);
      const a = this.cam.shake * ts * 0.14;
      this.cam.shakeX = (this.rng.next() * 2 - 1) * a;
      this.cam.shakeY = (this.rng.next() * 2 - 1) * a;
    } else {
      this.cam.shake = 0;
      this.cam.shakeX = 0;
      this.cam.shakeY = 0;
    }

    // smooth entity positions
    for (const e of g.entities) {
      if (!e.alive && (e.dying ?? 0) <= 0) continue;
      const rp = this.renderPos.get(e.id);
      if (!rp) {
        this.renderPos.set(e.id, { x: e.x, y: e.y });
        e.rx = e.x; e.ry = e.y;
        continue;
      }
      const k = 1 - Math.pow(0.000001, dt);
      rp.x = lerp(rp.x, e.x, k);
      rp.y = lerp(rp.y, e.y, k);
      e.rx = rp.x;
      e.ry = rp.y;
    }
    // player
    {
      const rp = this.renderPos.get(p.id);
      if (!rp) this.renderPos.set(p.id, { x: p.x, y: p.y });
      else {
        const k = 1 - Math.pow(0.0000005, dt);
        rp.x = lerp(rp.x, p.x, k);
        rp.y = lerp(rp.y, p.y, k);
        p.rx = rp.x;
        p.ry = rp.y;
      }
    }

    // particles
    for (const pt of this.particles) {
      pt.life -= dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vy += pt.gravity * dt;
      pt.vx *= 0.96;
    }
    this.particles = this.particles.filter((q) => q.life > 0);
    if (this.particles.length > 700) this.particles.splice(0, this.particles.length - 700);

    for (const t of this.texts) {
      t.life -= dt;
      t.y -= dt * 0.85;
    }
    this.texts = this.texts.filter((q) => q.life > 0);

    for (const b of this.banners) b.life -= dt;
    this.banners = this.banners.filter((b) => b.life > 0);

    if (this.flash) {
      this.flash.alpha -= dt * 1.9;
      if (this.flash.alpha <= 0) this.flash = null;
    }

    // entity cosmetic timers
    for (const e of g.entities) {
      if (e.flash) e.flash = Math.max(0, e.flash - dt * 5);
      if (e.lunge) e.lunge = Math.max(0, e.lunge - dt * 6);
      if (!e.alive && e.dying) e.dying = Math.max(0, e.dying - dt * 2.2);
      e.animT = (e.animT ?? 0) + dt;
    }
    p.animT = (p.animT ?? 0) + dt;
    if (p.flash) p.flash = Math.max(0, p.flash - dt * 5);
    if (p.lunge) p.lunge = Math.max(0, p.lunge - dt * 6);
  }

  /* ---------------------------------------------------------- draw */

  draw(g: Game): void {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    this.drawBackground(g);

    if (this.cam.x === 0 && this.cam.y === 0) {
      this.cam.x = g.player.x + 0.5;
      this.cam.y = g.player.y + 0.5;
    }

    this.drawTiles(g);
    this.drawEntities(g);
    this.drawPlayer(g);
    this.drawParticles();
    this.drawTexts();
    this.drawLighting(g);
    this.drawBanners();
    this.drawFlash();
  }

  private drawBackground(g: Game): void {
    const ctx = this.ctx;
    const night = this.nightAmount(g);
    const sky = ctx.createLinearGradient(0, 0, 0, this.h);
    if (g.map.kind === 'town') {
      sky.addColorStop(0, night > 0.5 ? '#080c0b' : '#111a16');
      sky.addColorStop(1, night > 0.5 ? '#040706' : '#0a100d');
    } else {
      sky.addColorStop(0, '#050807');
      sky.addColorStop(1, '#030504');
    }
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, this.w, this.h);
  }

  private nightAmount(g: Game): number {
    const ph = g.time.phase;
    // 0..0.15 dawn, 0.15..0.7 day, 0.7..0.85 dusk, else night
    if (ph < 0.1) return 1 - ph * 10;
    if (ph < 0.65) return 0;
    if (ph < 0.8) return (ph - 0.65) * 6.6;
    return 1;
  }

  private drawTiles(g: Game): void {
    const ctx = this.ctx;
    const ts = this.tileSize;
    const m = g.map;
    const view = this.viewBounds();
    for (let y = view.y0; y <= view.y1; y++) {
      for (let x = view.x0; x <= view.x1; x++) {
        if (x < 0 || y < 0 || x >= m.w || y >= m.h) continue;
        const i = y * m.w + x;
        const seen = m.seen[i];
        if (!seen) continue;
        const t = m.tiles[i];
        const [sx, sy] = this.worldToScreen(x, y);
        const vis = m.visible[i];

        // base ground for walls that have floor neighbors is handled by tile art
        const kind = this.tileKindName(t);
        const spr = tileSprite(kind, x, y, (x * 7 + y * 13) % 4);
        ctx.globalAlpha = vis ? 1 : 0.34;
        ctx.drawImage(spr, sx, sy, ts, ts);

        if (t === T.StairsDown) {
          ctx.drawImage(stairsSprite(true), sx, sy, ts, ts);
        } else if (t === T.StairsUp) {
          ctx.drawImage(stairsSprite(false), sx, sy, ts, ts);
        } else if (t === T.Door) {
          ctx.drawImage(doorSprite(), sx, sy - ts * 0.5, ts, ts * 1.5);
        }
        ctx.globalAlpha = 1;

        // dim unlit areas a little
        if (!vis && seen) {
          ctx.fillStyle = 'rgba(4,8,7,0.55)';
          ctx.fillRect(sx, sy, ts, ts);
        }
      }
    }
  }

  private tileKindName(t: number): string {
    switch (t) {
      case T.Grass: return 'grass';
      case T.Moss: return 'moss';
      case T.Dirt: return 'dirt';
      case T.Floor: return 'floor';
      case T.Wood: return 'wood';
      case T.Sand: return 'sand';
      case T.Rug: return 'rug';
      case T.Water: return 'water';
      case T.Rock: return 'rock';
      case T.Wall: return 'rock';
      case T.Bridge: return 'bridge';
      case T.Door: return 'wood';
      case T.StairsDown:
      case T.StairsUp: return 'floor';
      default: return 'floor';
    }
  }

  private drawEntities(g: Game): void {
    const ts = this.tileSize;
    const m = g.map;
    const list = g.entities
      .filter((e) => e.alive || (e.dying ?? 0) > 0)
      .filter((e) => {
        const i = e.y * m.w + e.x;
        return m.seen[i] === 1 || (e.kind === 'enemy' && m.visible[i] === 1);
      })
      .sort((a, b) => a.ry - b.ry);

    for (const e of list) {
      const vis = m.visible[e.y * m.w + e.x];
      if (!vis && e.kind === 'enemy') continue;
      if (!vis && e.kind !== 'prop' && e.kind !== 'npc') continue;
      const [sx, sy] = this.worldToScreen(e.rx - 0.5 + 0.5, e.ry - 1);
      const alpha = e.alive ? 1 : clamp(e.dying ?? 0, 0, 1);
      this.drawEntity(e, sx, sy, ts, alpha);
    }
  }

  private drawEntity(e: Entity, sx: number, sy: number, ts: number, alpha: number): void {
    const ctx = this.ctx;
    ctx.globalAlpha = alpha;

    if (e.kind === 'prop') {
      if (e.propKind === 'loot' && e.item) {
        const bob = Math.sin(this.time * 2.4 + e.id) * 2;
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(sx + ts / 2, sy + ts * 0.9, ts * 0.26, ts * 0.09, 0, 0, Math.PI * 2);
        ctx.fill();
        // glow
        ctx.fillStyle = 'rgba(216,165,74,0.14)';
        ctx.beginPath();
        ctx.ellipse(sx + ts / 2, sy + ts * 0.55 + bob, ts * 0.34, ts * 0.24, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.drawImage(itemSprite(e.item.base ? spriteIdForBase(e.item.base) : 'bag'), sx + ts * 0.18, sy + ts * 0.28 + bob, ts * 0.64, ts * 0.64);
        ctx.globalAlpha = 1;
        return;
      }
      const spr = propSprite(e.propKind ?? 'bush', e.id % 4);
      const h = ts * 1.5;
      ctx.drawImage(spr, sx, sy - h + ts, ts, h);
      // hp bar for choppable props
      if (e.breakable && e.hp < e.maxHp) {
        const w = ts * 0.7;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(sx + ts * 0.15, sy - 4, w, 3);
        ctx.fillStyle = '#7aa86a';
        ctx.fillRect(sx + ts * 0.15, sy - 4, w * (e.hp / e.maxHp), 3);
      }
      ctx.globalAlpha = 1;
      return;
    }

    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.34)';
    ctx.beginPath();
    ctx.ellipse(sx + ts / 2, sy + ts * 0.88, ts * 0.3, ts * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();

    const isBoss = e.sprite === 'heart' || e.sprite === 'mother';
    const sizeMul = isBoss ? 2 : 1;
    const drawSize = ts * sizeMul * (isBoss ? 1.15 : 1);

    // lunge offset
    let ox = 0, oy = 0;
    if (e.lunge && e.lungeDir) {
      const l = e.lunge * ts * 0.16;
      if (e.lungeDir === 'left') ox = -l;
      if (e.lungeDir === 'right') ox = l;
      if (e.lungeDir === 'up') oy = -l;
      if (e.lungeDir === 'down') oy = l;
    }

    // walk frame
    const moving = Math.abs(e.rx - e.x) > 0.06 || Math.abs(e.ry - e.y) > 0.06;
    const frame: 0 | 1 | 2 = moving ? (((Math.floor((e.animT ?? 0) * 7) % 2) === 0 ? 1 : 2) as 0 | 1 | 2) : 0;
    const spr = charSprite(e.sprite, e.facing, frame);

    const dy = isBoss ? -drawSize * 0.22 : -ts * 0.32;
    ctx.drawImage(spr, sx + ox - (drawSize - ts) / 2, sy + oy + dy * 0.2, drawSize, drawSize);

    // flash white on hit
    if (e.flash && e.flash > 0) {
      ctx.globalAlpha = e.flash * 0.55;
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(spr, sx + ox - (drawSize - ts) / 2, sy + oy + dy * 0.2, drawSize, drawSize);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = alpha;
    }

    // status pips
    if (e.statuses.length) {
      let i = 0;
      for (const s of e.statuses.slice(0, 4)) {
        const colors: Record<string, string> = {
          poison: '#7fb069', burn: '#e08a3c', bleed: '#bf4438', stun: '#d8c46a',
          slow: '#6f8fb0', regen: '#7fc9a0', might: '#e0705f', guard: '#8ab6f0',
          weak: '#9b8fb0', focus: '#b3a6ef', bless: '#f4d190',
        };
        ctx.fillStyle = colors[s.id] ?? '#fff';
        ctx.beginPath();
        ctx.arc(sx + ts * 0.28 + i * ts * 0.15, sy - ts * 0.22, ts * 0.055, 0, Math.PI * 2);
        ctx.fill();
        i++;
      }
    }

    // enemy hp bar when damaged or aggro
    if (e.kind === 'enemy' && (e.hp < e.maxHp || e.aggro)) {
      const w = isBoss ? ts * 1.6 : ts * 0.8;
      const bx = sx + (ts - w) / 2;
      const by = sy - ts * (isBoss ? 0.5 : 0.34);
      ctx.fillStyle = 'rgba(0,0,0,0.68)';
      ctx.fillRect(bx - 1, by - 1, w + 2, 5);
      const frac = clamp(e.hp / e.maxHp, 0, 1);
      const col = frac > 0.5 ? '#b8483c' : frac > 0.22 ? '#c9873a' : '#8f2f2a';
      ctx.fillStyle = col;
      ctx.fillRect(bx, by, w * frac, 3);
      if (e.elite) {
        ctx.fillStyle = '#d8a54a';
        ctx.fillRect(bx, by - 2, w, 1);
      }
    }

    // boss telegraph
    if (e.telegraph) {
      const pulse = 0.5 + Math.sin(this.time * 14) * 0.5;
      ctx.strokeStyle = `rgba(200,80,60,${0.35 + pulse * 0.5})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx + ts / 2, sy + ts / 2, ts * (2.2 + pulse * 0.4), 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
  }

  private drawPlayer(g: Game): void {
    const p = g.player;
    const ts = this.tileSize;
    const [sx, sy] = this.worldToScreen(p.rx, p.ry - 1);

    // shadow
    ctx_shadow(this.ctx, sx + ts / 2, sy + ts * 0.88, ts * 0.3, ts * 0.1);

    let ox = 0, oy = 0;
    if (p.lunge && p.lungeDir) {
      const l = p.lunge * ts * 0.18;
      if (p.lungeDir === 'left') ox = -l;
      if (p.lungeDir === 'right') ox = l;
      if (p.lungeDir === 'up') oy = -l;
      if (p.lungeDir === 'down') oy = l;
    }
    const moving = Math.abs(p.rx - p.x) > 0.05 || Math.abs(p.ry - p.y) > 0.05;
    const frame: 0 | 1 | 2 = moving ? (((Math.floor((p.animT ?? 0) * 7.5) % 2) === 0 ? 1 : 2) as 0 | 1 | 2) : 0;
    const spr = charSprite('player', p.facing, frame);
    this.ctx.drawImage(spr, sx + ox, sy + oy, ts, ts);

    if (p.flash && p.flash > 0) {
      this.ctx.globalAlpha = p.flash * 0.6;
      this.ctx.globalCompositeOperation = 'lighter';
      this.ctx.drawImage(spr, sx + ox, sy + oy, ts, ts);
      this.ctx.globalCompositeOperation = 'source-over';
      this.ctx.globalAlpha = 1;
    }

    // interact cursor over facing tile
    const t = g.map.tiles[(p.y + (p.facing === 'down' ? 1 : p.facing === 'up' ? -1 : 0)) * g.map.w
      + (p.x + (p.facing === 'right' ? 1 : p.facing === 'left' ? -1 : 0))];
    if (t === T.StairsDown || t === T.StairsUp) {
      const [tx, ty] = this.worldToScreen(
        p.x + (p.facing === 'right' ? 1 : p.facing === 'left' ? -1 : 0),
        p.y + (p.facing === 'down' ? 1 : p.facing === 'up' ? -1 : 0),
      );
      const a = 0.35 + Math.sin(this.time * 4) * 0.2;
      this.ctx.strokeStyle = `rgba(216,165,74,${a})`;
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(tx + 2, ty + 2, ts - 4, ts - 4);
    }
  }

  private drawParticles(): void {
    const ctx = this.ctx;
    const ts = this.tileSize;
    for (const p of this.particles) {
      const a = clamp(p.life / p.maxLife, 0, 1);
      const [sx, sy] = this.worldToScreen(p.x, p.y);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      const s = Math.max(1, p.size * ts * 0.09);
      ctx.fillRect(sx - s / 2, sy - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
  }

  private drawTexts(): void {
    const ctx = this.ctx;
    const ts = this.tileSize;
    for (const t of this.texts) {
      const a = clamp(t.life / t.maxLife, 0, 1);
      const [sx, sy] = this.worldToScreen(t.x, t.y);
      const pop = t.life > t.maxLife * 0.75 ? 1 + (1 - (t.maxLife - t.life) / (t.maxLife * 0.25)) * 0.4 : 1;
      ctx.globalAlpha = a;
      ctx.font = `${Math.round(ts * 0.42 * t.size * pop)}px "DotGothic16", monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = Math.max(2, ts * 0.09);
      ctx.strokeStyle = 'rgba(4,7,6,0.9)';
      const label = t.text;
      ctx.strokeText(label, sx + ts / 2, sy);
      ctx.fillStyle = t.color;
      ctx.fillText(label, sx + ts / 2, sy);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  private drawLighting(g: Game): void {
    const ctx = this.ctx;
    const ts = this.tileSize;
    const night = this.nightAmount(g);
    const isDungeon = g.map.kind === 'dungeon';
    const darkness = isDungeon ? 0.72 : 0.25 + night * 0.5;
    if (darkness < 0.05) return;

    const [px, py] = this.worldToScreen(g.player.rx + 0.5, g.player.ry + 0.5);
    const radius = ts * (isDungeon ? 5.4 : 7.2);

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    const grad = ctx.createRadialGradient(px, py, radius * 0.18, px, py, radius);
    grad.addColorStop(0, `rgba(3,6,5,0)`);
    grad.addColorStop(0.55, `rgba(3,6,5,${darkness * 0.35})`);
    grad.addColorStop(1, `rgba(3,6,5,${darkness})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.restore();

    // torch flicker for dungeon
    if (isDungeon) {
      const flick = 0.06 + Math.sin(this.time * 9) * 0.015 + Math.sin(this.time * 23) * 0.01;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const tg = ctx.createRadialGradient(px, py, 0, px, py, ts * 2.6);
      tg.addColorStop(0, `rgba(216,165,74,${flick})`);
      tg.addColorStop(1, 'rgba(216,165,74,0)');
      ctx.fillStyle = tg;
      ctx.fillRect(0, 0, this.w, this.h);
      ctx.restore();
    }

    // warm tint in town daytime
    if (!isDungeon && night < 0.4) {
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = `rgba(255,240,215,${1 - (0.06 + night * 0.1)})`;
      ctx.fillRect(0, 0, this.w, this.h);
      ctx.restore();
    }
  }

  private drawBanners(): void {
    const ctx = this.ctx;
    for (const b of this.banners) {
      const t = 1 - b.life / 2.6;
      const a = b.life > 2.2 ? (2.6 - b.life) / 0.4 : b.life < 0.6 ? b.life / 0.6 : 1;
      ctx.globalAlpha = clamp(a, 0, 1);
      ctx.textAlign = 'center';
      ctx.font = `400 ${Math.round(Math.min(46, this.w * 0.045))}px "DotGothic16", monospace`;
      ctx.fillStyle = 'rgba(4,7,6,0.72)';
      ctx.fillText(b.text, this.w / 2 + 2, this.h * 0.24 + 2);
      ctx.fillStyle = '#ece5d3';
      ctx.fillText(b.text, this.w / 2, this.h * 0.24);
      if (b.sub) {
        ctx.font = `400 ${Math.round(Math.min(16, this.w * 0.016))}px "Zen Kaku Gothic New", sans-serif`;
        ctx.fillStyle = 'rgba(216,165,74,0.9)';
        ctx.fillText(b.sub, this.w / 2, this.h * 0.24 + 26);
      }
      // line flourish
      const w = 120 * (1 - Math.abs(t - 0.5) * 2);
      ctx.strokeStyle = `rgba(216,165,74,${0.4 * a})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(this.w / 2 - w / 2, this.h * 0.24 + 12);
      ctx.lineTo(this.w / 2 + w / 2, this.h * 0.24 + 12);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.textAlign = 'left';
    }
  }

  private drawFlash(): void {
    if (!this.flash) return;
    const ctx = this.ctx;
    ctx.globalAlpha = clamp(this.flash.alpha, 0, 1);
    ctx.fillStyle = this.flash.color;
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.globalAlpha = 1;
  }

  /* ---------------------------------------------------------- fx api */

  shake(amount: number): void {
    this.cam.shake = Math.max(this.cam.shake, amount);
  }

  spawnParticles(x: number, y: number, kind: string, n = 8): void {
    const palette: Record<string, string[]> = {
      blood: ['#a83a34', '#8f2f2a', '#c85a4a', '#6a2420'],
      spark: ['#f4d190', '#e0a84a', '#fff4d8', '#d87a3a'],
      heal: ['#9fe0b8', '#7fc9a0', '#d0f8e0', '#5aa87a'],
      dust: ['#6a6252', '#4a4438', '#8a8272', '#3a352c'],
      death: ['#5a5048', '#3a352e', '#7a6a58', '#2a251f'],
      gold: ['#f4d190', '#d8a54a', '#fff4d8', '#b8862a'],
      magic: ['#b3a6ef', '#8a79cf', '#d0c8ff', '#6a5aa0'],
    };
    const cols = palette[kind] ?? palette.dust;
    for (let i = 0; i < n; i++) {
      const a = this.rng.next() * Math.PI * 2;
      const sp = this.rng.range(0.6, 3.4) * (kind === 'death' ? 1.3 : 1);
      this.particles.push({
        x: x + this.rng.range(0.25, 0.75),
        y: y + this.rng.range(0.35, 0.85),
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - (kind === 'heal' ? 1.4 : 0.6),
        life: this.rng.range(0.35, 0.95),
        maxLife: 1,
        color: this.rng.pick(cols),
        size: this.rng.range(0.6, 1.6),
        gravity: kind === 'heal' ? -1.6 : 7,
        kind,
      });
    }
    for (const p of this.particles) if (p.maxLife === 1) p.maxLife = p.life;
  }

  spawnText(x: number, y: number, text: string, kind: FloatText['kind']): void {
    const colors: Record<FloatText['kind'], string> = {
      dmg: '#f0e8d8', crit: '#ffd98a', heal: '#9fe0b8', miss: '#a8a294', sp: '#8ab6f0',
    };
    this.texts.push({
      x: x + 0.5, y: y + 0.05, text,
      life: kind === 'crit' ? 1.05 : 0.85,
      maxLife: kind === 'crit' ? 1.05 : 0.85,
      color: colors[kind],
      size: kind === 'crit' ? 1.45 : kind === 'miss' ? 0.8 : 1,
      kind,
    });
  }

  banner(text: string, sub?: string): void {
    this.banners.push({ text, sub, life: 2.6 });
  }

  doFlash(color: string, alpha: number): void {
    this.flash = { color, alpha };
  }

  doHitstop(ms: number): void {
    this.hitstop = Math.max(this.hitstop, ms);
  }

  resetCamera(g: Game): void {
    this.cam.x = g.player.x + 0.5;
    this.cam.y = g.player.y + 0.5;
    this.cam.shake = 0;
    this.renderPos.clear();
    this.particles.length = 0;
    this.texts.length = 0;
  }

  /* ---------------------------------------------------------- minimap */

  drawMinimap(g: Game, canvas: HTMLCanvasElement): void {
    const ctx = canvas.getContext('2d')!;
    const m = g.map;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const sx = canvas.width / m.w;
    const sy = canvas.height / m.h;
    const s = Math.min(sx, sy);
    const ox = (canvas.width - m.w * s) / 2;
    const oy = (canvas.height - m.h * s) / 2;

    for (let y = 0; y < m.h; y++) {
      for (let x = 0; x < m.w; x++) {
        const i = y * m.w + x;
        if (!m.seen[i]) continue;
        const t = m.tiles[i];
        const vis = m.visible[i];
        let c: string;
        switch (t) {
          case T.Wall: case T.Rock: c = vis ? '#2e3a33' : '#1a2320'; break;
          case T.Water: c = vis ? '#27485c' : '#16262e'; break;
          case T.StairsDown: case T.StairsUp: c = '#e0b45a'; break;
          case T.Door: c = '#8a6a3a'; break;
          case T.Grass: case T.Moss: c = vis ? '#33503a' : '#1e2f24'; break;
          case T.Dirt: c = vis ? '#463a2b' : '#2a241b'; break;
          case T.Floor: c = vis ? '#3a4140' : '#232827'; break;
          case T.Wood: c = vis ? '#43342a' : '#282019'; break;
          default: c = vis ? '#2a302c' : '#1b201d';
        }
        ctx.fillStyle = c;
        ctx.fillRect(ox + x * s, oy + y * s, Math.ceil(s), Math.ceil(s));
      }
    }
    // enemies
    for (const e of g.entities) {
      if (!e.alive || e.kind !== 'enemy') continue;
      if (!m.visible[e.y * m.w + e.x]) continue;
      ctx.fillStyle = e.ai === 'boss' ? '#e0705f' : '#bf4438';
      ctx.fillRect(ox + e.x * s - 1, oy + e.y * s - 1, Math.max(2, s + 1), Math.max(2, s + 1));
    }
    // npc
    for (const e of g.entities) {
      if (!e.alive || e.kind !== 'npc') continue;
      ctx.fillStyle = '#d8a54a';
      ctx.fillRect(ox + e.x * s - 0.5, oy + e.y * s - 0.5, Math.max(2, s), Math.max(2, s));
    }
    // player blip
    const px = ox + g.player.x * s;
    const py = oy + g.player.y * s;
    const pulse = 2 + Math.sin(this.time * 5) * 0.8;
    ctx.fillStyle = 'rgba(244,209,144,0.28)';
    ctx.beginPath();
    ctx.arc(px + s / 2, py + s / 2, pulse + 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff4d8';
    ctx.fillRect(px - 1, py - 1, Math.max(2, s + 1), Math.max(2, s + 1));
  }

  private viewBounds(): { x0: number; y0: number; x1: number; y1: number } {
    const ts = this.tileSize;
    const halfW = this.w / 2 / ts + 2;
    const halfH = this.h / 2 / ts + 2;
    return {
      x0: Math.max(0, Math.floor(this.cam.x - halfW)),
      y0: Math.max(0, Math.floor(this.cam.y - halfH)),
      x1: Math.ceil(this.cam.x + halfW),
      y1: Math.ceil(this.cam.y + halfH),
    };
  }
}

/* small helper kept outside the class for hot paths */
function ctx_shadow(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number) {
  ctx.fillStyle = 'rgba(0,0,0,0.36)';
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** item base id -> sprite id; kept here to avoid a core->render import cycle. */
function spriteIdForBase(baseId: string): string {
  const table: Record<string, string> = {
    rusty_dagger: 'dagger', iron_dagger: 'dagger', ritual_dagger: 'dagger',
    traveler_sword: 'sword', iron_longsword: 'sword', hollow_blade: 'greatsword',
    silver_rapier: 'rapier', war_axe: 'axe', short_spear: 'spear',
    hunters_bow: 'bow', oak_staff: 'staff',
    cloth_tunic: 'armor', leather_vest: 'armor', chain_mail: 'armor',
    iron_cuirass: 'plate', forest_robe: 'robe',
    traveler_hood: 'hood', leather_cap: 'helm', iron_helm: 'helm', sage_circlet: 'circlet',
    wood_shield: 'shield', iron_shield: 'shield',
    ring_str: 'ring', ring_dex: 'ring', ring_con: 'ring', ring_wis: 'ring',
    charm_ward: 'charm', charm_fang: 'charm',
    potion_small: 'potion', potion_large: 'potion2', sp_potion: 'sp_potion',
    antidote: 'herb', grilled_meat: 'meat', elixir: 'elixir', return_scroll: 'scroll',
    iron_ore: 'ore', wood: 'wood', pelt: 'pelt', bone_shard: 'bone',
    mana_shard: 'shard', spider_silk: 'silk', hollow_ember: 'ember',
  };
  return table[baseId] ?? 'bag';
}

export { hash2, spriteIdForBase };
