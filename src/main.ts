import './styles.css';
import { Game } from './core/game';
import { Renderer } from './render/render';
import { Audio } from './audio/sfx';
import { Hud } from './ui/hud';
import { Screens } from './ui/screens';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const canvas = $<HTMLCanvasElement>('game');
const renderer = new Renderer(canvas);
const audio = new Audio();
const hud = new Hud(renderer);
const screens = new Screens(() => game);

let game: Game;
let running = false;
let lastT = 0;
let acc = 0;

const title = $<HTMLElement>('title');
const titleMenu = $<HTMLElement>('title-menu');
const boot = $<HTMLElement>('boot');
const versionLabel = $<HTMLElement>('version-label');

versionLabel.textContent = 'v0.9.0';

/* ============================================================
   boot / title
   ============================================================ */

function bootUp(): void {
  renderer.resize();
  window.addEventListener('resize', () => renderer.resize());
  buildTitle();
  boot.classList.add('done');
  setTimeout(() => boot.classList.add('hidden'), 420);
}

function buildTitle(): void {
  const hasSave = Game.hasSave();
  titleMenu.innerHTML = '';
  const mk = (label: string, fn: () => void, primary = false) => {
    const b = document.createElement('button');
    b.textContent = label;
    if (primary) b.className = 'primary';
    b.onclick = fn;
    titleMenu.appendChild(b);
  };
  if (hasSave) {
    mk('続きから', () => startLoad(), true);
    mk('新しい旅', () => openNewGame());
  } else {
    mk('新しい旅', () => openNewGame(), true);
  }
  mk('操作と遊び方', () => {
    const tmp = new Game('help');
    (globalThis as unknown as { __tmp: Game }).__tmp = tmp;
    screens.openHelp();
  });
}

function openNewGame(): void {
  const body = `
    <div style="max-width:420px;margin:0 auto">
      <div class="section-title">名前</div>
      <input id="name-input" maxlength="12" value="旅人"
        style="width:100%;padding:10px 12px;background:#0a1210;border:1px solid var(--line);
        color:var(--bone);border-radius:3px;font-family:var(--font-ui);font-size:14px;outline:none" />
      <div class="section-title">世界の種</div>
      <input id="seed-input" maxlength="24" placeholder="空欄ならランダム"
        style="width:100%;padding:10px 12px;background:#0a1210;border:1px solid var(--line);
        color:var(--bone);border-radius:3px;font-family:var(--font-ui);font-size:13px;outline:none" />
      <p class="muted" style="margin-top:14px">同じ種を入力すると同じ森が生成されます。</p>
    </div>`;
  screens.openPanel('新しい旅', '森は毎回姿を変える', body, `
      <span class="muted">死ぬとセーブは消えます</span>
      <button class="primary" id="begin">森へ入る</button>
    `);
  const start = () => {
    const name = ($<HTMLInputElement>('name-input')?.value ?? '旅人').trim() || '旅人';
    const seed = ($<HTMLInputElement>('seed-input')?.value ?? '').trim();
    screens.close();
    beginNew(name, seed || undefined);
  };
  $<HTMLElement>('begin')?.addEventListener('click', start);
  const ni = $<HTMLInputElement>('name-input');
  if (ni) {
    ni.focus();
    ni.select();
    ni.onkeydown = (e) => { if (e.key === 'Enter') start(); };
  }
}

function beginNew(name: string, seed?: string): void {
  game = new Game(seed ?? `w${Date.now().toString(36)}`);
  game.newGame(name, seed);
  afterStart();
}

function startLoad(): void {
  const loaded = Game.load();
  if (!loaded) {
    hud.toast('セーブを読み込めませんでした', 'bad');
    return;
  }
  game = loaded;
  afterStart();
}

function afterStart(): void {
  title.classList.add('hidden');
  hud.init(game);
  hud.show(true);
  renderer.resetCamera(game);
  running = true;
  lastT = performance.now();
  requestAnimationFrame(frame);
  audio.init();
  audio.resume();
  bindInput();
  exposeDebug();
  game.log('WASDで移動、Eで調べる。Iで持ち物。', 'dim');
}

/* ============================================================
   loop
   ============================================================ */

function frame(t: number): void {
  if (!running) return;
  const dt = Math.min(0.05, (t - lastT) / 1000);
  lastT = t;
  acc += dt;

  if (game && game.screen === 'play' && !screens.open && !hud.dialogOpen) {
    updateHeldMovement(dt);
  }

  if (game) {
    renderer.update(dt, game);
    renderer.draw(game);
    hud.update(game, dt);
    drainEvents();
    if (game.screen === 'dead' && screens.current !== 'dead') {
      running = false;
      screens.openDeath(game);
      hud.show(false);
    }
  }
  requestAnimationFrame(frame);
}

/* ============================================================
   events
   ============================================================ */

function drainEvents(): void {
  const evs = game.drainEvents();
  for (const e of evs) {
    switch (e.t) {
      case 'log':
        hud.log(e.text, e.cls);
        break;
      case 'toast':
        hud.toast(e.text, e.cls);
        break;
      case 'dmg':
        renderer.spawnText(e.x, e.y, e.kind === 'miss' ? '外れ' : String(e.amount), e.kind === 'heal' ? 'heal' : e.kind === 'miss' ? 'miss' : e.amount >= 20 ? 'crit' : 'dmg');
        break;
      case 'shake':
        renderer.shake(e.amount);
        break;
      case 'hitstop':
        renderer.doHitstop(e.ms);
        break;
      case 'sfx':
        audio.play(e.id);
        break;
      case 'flash':
        renderer.doFlash(e.color, e.alpha);
        break;
      case 'levelup':
        hud.toast(`レベルアップ — Lv.${e.level}`, 'level');
        break;
      case 'banner':
        renderer.banner(e.text, e.sub);
        break;
      case 'step':
        if (e.dust) renderer.spawnParticles(e.x, e.y, 'dust', 3);
        audio.play('step');
        break;
      case 'particles':
        renderer.spawnParticles(e.x, e.y, e.kind, e.n ?? 8);
        if (e.kind === 'blood') hud.hurt();
        break;
      case 'death':
        hud.show(false);
        break;
      case 'victory':
        hud.toast('森は静けさを取り戻した。', 'level');
        break;
    }
  }
}

/* ============================================================
   input
   ============================================================ */

const heldKeys = new Set<string>();
let repeatTimer = 0;
const REPEAT_DELAY = 0.16;

const KEY_DIR: Record<string, [number, number]> = {
  ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
  w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0],
  W: [0, -1], S: [0, 1], A: [-1, 0], D: [1, 0],
  Numpad8: [0, -1], Numpad2: [0, 1], Numpad4: [-1, 0], Numpad6: [1, 0],
  k: [0, -1], j: [0, 1], h: [-1, 0], l: [1, 0],
};

let bound = false;

function bindInput(): void {
  if (bound) return;
  bound = true;

  window.addEventListener('keydown', (e) => {
    if (!game || game.screen !== 'play') {
      if (e.key === 'Escape' && screens.open) screens.close();
      return;
    }
    const k = e.key;
    if (screens.open) {
      if (k === 'Escape' || k === 'i' || k === 'I') {
        e.preventDefault();
        screens.close();
      }
      return;
    }
    if (hud.dialogOpen) {
      if (k === 'Escape' || k === 'e' || k === 'E' || k === ' ') {
        e.preventDefault();
        hud.closeDialog();
      }
      return;
    }

    if (KEY_DIR[k]) {
      e.preventDefault();
      if (!heldKeys.has(k)) {
        heldKeys.add(k);
        const [dx, dy] = KEY_DIR[k];
        game.step(dx, dy);
        repeatTimer = REPEAT_DELAY;
      }
      return;
    }

    switch (k) {
      case 'e': case 'E': case ' ':
        e.preventDefault();
        game.interact();
        break;
      case 'i': case 'I':
        e.preventDefault();
        audio.play('ui');
        screens.openInventory();
        break;
      case 'c': case 'C':
        e.preventDefault();
        audio.play('ui');
        screens.openCharacter();
        break;
      case 'j': case 'J':
        e.preventDefault();
        audio.play('ui');
        screens.openJournal();
        break;
      case 'r': case 'R':
        e.preventDefault();
        if (game.map.kind === 'town') {
          game.rest();
        } else if (game.map.floor === 1) {
          game.ascend();
        } else {
          hud.toast('休むには村へ戻ろう', 'bad');
        }
        break;
      case 'Escape':
        e.preventDefault();
        screens.openPause();
        break;
      case '.':
        e.preventDefault();
        game.endTurn();
        break;
      default:
        if (k >= '1' && k <= '8') {
          e.preventDefault();
          const idx = Number(k) - 1;
          const id = game.player.skills[idx];
          if (id) game.useSkill(id);
        }
    }
  });

  window.addEventListener('keyup', (e) => {
    heldKeys.delete(e.key);
  });

  window.addEventListener('blur', () => heldKeys.clear());

  // virtual pad / click to move
  canvas.addEventListener('pointerdown', (ev) => {
    if (!game || game.screen !== 'play' || screens.open || hud.dialogOpen) return;
    audio.resume();
    const tile = renderer.screenToTile(ev.clientX, ev.clientY);
    const p = game.player;
    const dx = tile.x - p.x;
    const dy = tile.y - p.y;
    const d = Math.max(Math.abs(dx), Math.abs(dy));
    if (d === 0) {
      game.interact();
      return;
    }
    if (d <= game.equipStats.range) {
      const target = game.entityAt(tile.x, tile.y);
      if (target?.kind === 'enemy') {
        game.playerAttack(target);
        game.endTurn();
        return;
      }
    }
    // step toward the click, one tile at a time
    const sx = Math.abs(dx) >= Math.abs(dy) ? Math.sign(dx) : 0;
    const sy = sx === 0 ? Math.sign(dy) : 0;
    game.step(sx, sy);
  });

  hud.onSkill = (id: string) => {
    if (!game || game.screen !== 'play') return;
    game.useSkill(id);
  };

  (window as unknown as { __sablewood_restart: () => void }).__sablewood_restart = () => {
    running = false;
    buildTitle();
    title.classList.remove('hidden');
    hud.show(false);
    screens.close();
  };
}

function updateHeldMovement(dt: number): void {
  if (!heldKeys.size) return;
  repeatTimer -= dt;
  if (repeatTimer > 0) return;
  repeatTimer = REPEAT_DELAY;
  for (const k of heldKeys) {
    const dir = KEY_DIR[k];
    if (!dir) continue;
    game.step(dir[0], dir[1]);
    break;
  }
}

/* ============================================================
   debug hooks (read-only unless ?stress)
   ============================================================ */

function exposeDebug(): void {
  const stress = new URLSearchParams(location.search).has('stress');
  (window as unknown as { Sablewood: unknown }).Sablewood = {
    get game() { return game; },
    get screen() { return game?.screen; },
    get level() { return game?.player.level; },
    get hp() { return game?.player.hp; },
    get gold() { return game?.player.gold; },
    get floor() { return game?.map.floor; },
    get kills() { return game?.stats.kills; },
    get steps() { return game?.stats.steps; },
    get place() { return game?.map.name; },
    get enemyCount() { return game?.entities.filter((e) => e.alive && e.kind === 'enemy').length; },
    get screensOpen() { return screens.open; },
    ...(stress ? {
      descend: () => game.descend(),
      teleport: (floor: number) => {
        game.player.deepest = Math.max(game.player.deepest, floor);
        while (game.map.floor < floor) game.descend();
      },
      grant: (n: number) => { game.player.gold += n; },
      hurt: (n: number) => game.damagePlayer(n),
    } : {}),
  };
}

/* ============================================================
   go
   ============================================================ */

bootUp();
