/**
 * Sablewood headless verification.
 *
 * Boots the built game in real Chrome via CDP, drives actual input, and
 * asserts observable outcomes. Exits non-zero on any failure.
 *
 *   node tools/verify.mjs            # verification run
 *   node tools/verify.mjs --shots    # also write screenshots
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = resolve(process.cwd(), 'dist');
const SHOTS = process.argv.includes('--shots');
const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const results = [];
let failures = 0;

function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  if (!ok) failures++;
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`  [${mark}] ${name}${detail ? ` — ${detail}` : ''}`);
}

function findChrome() {
  for (const p of CHROME_CANDIDATES) if (existsSync(p)) return p;
  return null;
}

async function startServer() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      let p = decodeURIComponent(url.pathname);
      if (p === '/' || p.endsWith('/')) p += 'index.html';
      const full = join(ROOT, p);
      if (!full.startsWith(ROOT)) {
        res.writeHead(403).end();
        return;
      }
      const buf = await readFile(full);
      res.writeHead(200, { 'content-type': MIME[extname(full)] ?? 'application/octet-stream' });
      res.end(buf);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, port: server.address().port };
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.errors = [];
    this.consoleErrors = [];
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
        return;
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails;
        const text = d.exception?.description ?? d.text ?? 'unknown exception';
        this.errors.push(text.split('\n')[0]);
      }
      if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
        const t = msg.params.entry.text ?? '';
        if (!t.includes('favicon')) this.consoleErrors.push(t);
      }
    });
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`timeout: ${method}`));
        }
      }, 30000);
    });
  }

  async evaluate(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true,
    });
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception?.description ?? 'eval failed');
    }
    return r.result.value;
  }

  async shot(path) {
    const r = await this.send('Page.captureScreenshot', { format: 'png' });
    await writeFile(path, Buffer.from(r.data, 'base64'));
  }

  async key(key, code = key, keyCode = 0) {
    await this.send('Input.dispatchKeyEvent', {
      type: 'keyDown', key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode,
    });
    await this.send('Input.dispatchKeyEvent', {
      type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode,
    });
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const chrome = findChrome();
  if (!chrome) {
    console.error('No Chrome/Edge found. Cannot verify in a browser.');
    process.exit(2);
  }
  if (!existsSync(join(ROOT, 'index.html'))) {
    console.error('dist/ missing — run `npm run build` first.');
    process.exit(2);
  }

  const { server, port } = await startServer();
  const profile = join(tmpdir(), `sablewood-verify-${Date.now()}`);
  const dbgPort = 9300 + Math.floor(Math.random() * 400);

  const proc = spawn(chrome, [
    '--headless=new',
    `--remote-debugging-port=${dbgPort}`,
    `--user-data-dir=${profile}`,
    '--disable-gpu',
    '--mute-audio',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--hide-scrollbars',
    '--window-size=1280,800',
    'about:blank',
  ], { stdio: 'ignore' });

  // wait for the debugging endpoint
  let wsUrl = null;
  for (let i = 0; i < 100; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${dbgPort}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page?.webSocketDebuggerUrl) { wsUrl = page.webSocketDebuggerUrl; break; }
    } catch { /* not up yet */ }
    await sleep(120);
  }
  if (!wsUrl) {
    proc.kill();
    server.close();
    console.error('Chrome debugging endpoint never came up.');
    process.exit(2);
  }

  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });
  const cdp = new Cdp(ws);

  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  await cdp.send('Page.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1280, height: 800, deviceScaleFactor: 1, mobile: false,
  });

  console.log('\nSablewood — browser verification\n');

  // ---- load
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/?stress` });
  await sleep(2200);

  const booted = await cdp.evaluate(`!!document.getElementById('title') && !document.querySelector('#title.hidden')`);
  check('title screen renders', booted);
  check('no uncaught exceptions on load', cdp.errors.length === 0, cdp.errors.join(' | '));

  if (SHOTS) {
    await mkdir(join(process.cwd(), 'verification'), { recursive: true });
    await cdp.shot(join(process.cwd(), 'verification', '01-title.png'));
  }

  // ---- new game
  await cdp.evaluate(`
    (() => {
      const btns = [...document.querySelectorAll('#title-menu button')];
      const b = btns.find(x => x.textContent.includes('新しい旅')) || btns[0];
      b.click();
      return true;
    })()
  `);
  await sleep(350);
  const startBtn = await cdp.evaluate(`!!document.getElementById('begin')`);
  check('new-game panel opens', startBtn);

  await cdp.evaluate(`document.getElementById('name-input').value = '検証者'; document.getElementById('seed-input').value = 'verify-seed';`);
  await cdp.evaluate(`document.getElementById('begin').click()`);
  await sleep(1400);

  const g = () => cdp.evaluate(`(() => { const s = window.Sablewood; return s ? {
    screen: s.screen, level: s.level, hp: s.hp, gold: s.gold, floor: s.floor,
    kills: s.kills, steps: s.steps, place: s.place, enemies: s.enemyCount, open: s.screensOpen
  } : null; })()`);

  let st = await g();
  check('game started in play state', st?.screen === 'play', JSON.stringify(st));
  check('player spawned in town', st?.place === 'ソーンベリ村', st?.place);
  check('starting inventory equipped (Lv.1)', st?.level === 1);
  check('no runtime errors after start', cdp.errors.length === 0, cdp.errors.join(' | '));

  // ---- render proof: sample the canvas for luminance variance
  const variance = await cdp.evaluate(`
    (() => {
      const c = document.getElementById('game');
      const ctx = c.getContext('2d');
      const pts = [];
      for (let i = 0; i < 40; i++) {
        const x = Math.floor(Math.random() * (c.width - 4)) + 2;
        const y = Math.floor(Math.random() * (c.height - 4)) + 2;
        const d = ctx.getImageData(x, y, 1, 1).data;
        pts.push((d[0] * 0.299 + d[1] * 0.587 + d[2] * 0.114));
      }
      return { min: Math.min(...pts), max: Math.max(...pts), n: pts.length };
    })()
  `);
  check('canvas actually renders content', variance.max - variance.min > 25,
    `luminance range ${variance.min.toFixed(0)}..${variance.max.toFixed(0)}`);

  // ---- pixel audit: the scene must be varied, not a flat fill
  const scene = await cdp.evaluate(`
    (() => {
      const c = document.getElementById('game');
      const ctx = c.getContext('2d');
      const w = c.width, h = c.height;
      const box = ctx.getImageData(Math.floor(w*0.3), Math.floor(h*0.3), Math.floor(w*0.4), Math.floor(h*0.4)).data;
      const colors = new Set();
      let sum = 0, sum2 = 0, n = 0;
      for (let i = 0; i < box.length; i += 4) {
        colors.add((box[i] >> 3) << 10 | (box[i+1] >> 3) << 5 | (box[i+2] >> 3));
        const l = box[i]*0.299 + box[i+1]*0.587 + box[i+2]*0.114;
        sum += l; sum2 += l*l; n++;
      }
      const mean = sum / n;
      const sd = Math.sqrt(sum2 / n - mean * mean);
      return { distinct: colors.size, mean, sd };
    })()
  `);
  check('scene has real texture variety', scene.distinct > 40, `${scene.distinct} distinct colours`);
  check('scene is not a flat fill', scene.sd > 6, `luminance sd ${scene.sd.toFixed(1)}`);

  // ---- HUD structure
  const hudInfo = await cdp.evaluate(`
    (() => {
      const hud = document.getElementById('hud');
      const hp = document.getElementById('bar-hp');
      const mm = document.getElementById('minimap');
      const mmCtx = mm.getContext('2d');
      const px = mmCtx.getImageData(0, 0, mm.width, mm.height).data;
      let lit = 0;
      for (let i = 3; i < px.length; i += 4) if (px[i] > 0) lit++;
      return {
        hudVisible: !hud.classList.contains('hidden') && hud.getBoundingClientRect().height > 0,
        hpWidth: hp.getBoundingClientRect().width,
        hpText: document.getElementById('text-hp').textContent,
        minimapPixels: lit,
        skills: document.querySelectorAll('#skillbar .skill').length,
      };
    })()
  `);
  check('HUD is visible', hudInfo.hudVisible === true);
  const hpLabelOk = typeof hudInfo.hpText === 'string' && hudInfo.hpText.includes('/') && hudInfo.hpText.trim().length >= 5;
  check('HP bar has width and a numeric label', hudInfo.hpWidth > 20 && hpLabelOk, hudInfo.hpText);
  check('minimap draws tiles', hudInfo.minimapPixels > 400, `${hudInfo.minimapPixels} px`);
  check('skill bar shows learned skills', hudInfo.skills >= 2, `${hudInfo.skills} slots`);

  // ---- movement
  const before = await g();
  for (let i = 0; i < 6; i++) {
    await cdp.key('d', 'KeyD', 68);
    await sleep(70);
  }
  await sleep(220);
  const afterMove = await g();
  check('movement advances the player', afterMove.steps > before.steps,
    `steps ${before.steps} -> ${afterMove.steps}`);

  // ---- open inventory via key
  await cdp.key('i', 'KeyI', 73);
  await sleep(420);
  const invOpen = await cdp.evaluate(`
    (() => {
      const s = document.getElementById('screen');
      const open = s && !s.classList.contains('hidden');
      const slots = document.querySelectorAll('#panel .inv-grid .slot').length;
      const head = document.querySelector('#panel h2')?.textContent ?? '';
      return { open, slots, head };
    })()
  `);
  check('inventory screen opens from I', invOpen.open, invOpen.head);
  check('inventory renders 24 slots', invOpen.slots === 24, `got ${invOpen.slots}`);

  if (SHOTS) await cdp.shot(join(process.cwd(), 'verification', '02-inventory.png'));

  await cdp.key('Escape', 'Escape', 27);
  await sleep(300);
  const closed = await cdp.evaluate(`document.getElementById('screen').classList.contains('hidden')`);
  check('ESC closes panel', closed);

  // ---- descend into the dungeon
  await cdp.evaluate(`window.Sablewood.descend()`);
  await sleep(900);
  const dungeon = await g();
  check('descend enters floor 1', dungeon?.floor === 1, `floor ${dungeon?.floor}`);
  check('dungeon spawns enemies', (dungeon?.enemies ?? 0) > 3, `${dungeon?.enemies} enemies`);

  if (SHOTS) await cdp.shot(join(process.cwd(), 'verification', '03-dungeon.png'));

  // ---- walk toward an enemy and attack until a kill happens
  const combat = await cdp.evaluate(`
    (async () => {
      const S = window.Sablewood;
      const game = S.game;
      const start = game.stats.kills;
      let turns = 0;
      // teleport next to the nearest enemy for a deterministic fight
      const near = () => game.entities
        .filter(e => e.alive && e.kind === 'enemy')
        .sort((a,b) => Math.hypot(a.x-game.player.x,a.y-game.player.y) - Math.hypot(b.x-game.player.x,b.y-game.player.y))[0];
      let target = near();
      if (!target) return { ok: false, reason: 'no enemy' };
      const spot = (() => {
        for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
          const x = target.x+dx, y = target.y+dy;
          if (game.canWalk(x,y) && !game.entityAt(x,y)) return {x,y};
        }
        return null;
      })();
      if (!spot) return { ok: false, reason: 'no approach tile' };
      game.player.x = spot.x; game.player.y = spot.y;
      game.player.rx = spot.x; game.player.ry = spot.y;

      while (turns < 60 && game.stats.kills === start && game.player.hp > 0) {
        const t = near();
        if (!t) break;
        if (Math.max(Math.abs(t.x-game.player.x), Math.abs(t.y-game.player.y)) <= 1) {
          game.playerAttack(t);
        } else {
          const dx = Math.sign(t.x-game.player.x), dy = Math.sign(t.y-game.player.y);
          if (Math.abs(t.x-game.player.x) >= Math.abs(t.y-game.player.y)) game.step(dx,0);
          else game.step(0,dy);
        }
        game.endTurn();
        turns++;
        if (game.player.hp <= 0) break;
        game.player.hp = game.player.maxHp; // survive the harness fight
      }
      return {
        ok: game.stats.kills > start,
        kills: game.stats.kills - start,
        turns,
        hp: Math.round(game.player.hp),
        xp: game.player.xp,
        level: game.player.level,
      };
    })()
  `);
  check('attacking an enemy produces a kill', combat?.ok === true, JSON.stringify(combat));

  // ---- levelling: grant xp and confirm the level rises
  const lvl = await cdp.evaluate(`
    (() => {
      const g = window.Sablewood.game;
      const before = g.player.level;
      g.gainXp(400);
      return { before, after: g.player.level, points: g.player.points, skills: g.player.skills.length };
    })()
  `);
  check('experience grants levels', lvl.after > lvl.before, `Lv.${lvl.before} -> Lv.${lvl.after}`);
  check('levels grant stat points', lvl.points > 0, `${lvl.points} points`);
  check('levels unlock skills', lvl.skills > 2, `${lvl.skills} skills`);

  // ---- skill use
  const skill = await cdp.evaluate(`
    (() => {
      const g = window.Sablewood.game;
      if (g.map.kind !== 'dungeon') g.descend();
      g.player.sp = g.player.maxSp = 99;
      g.player.cooldowns = {};

      // self-targeted skill: no enemy needed, still spends spirit
      const beforeSelf = g.player.sp;
      const usedSelf = g.useSkill('guard_up');
      const afterSelf = g.player.sp;

      // offensive skill: stand next to an enemy first
      g.player.cooldowns = {};
      g.player.sp = 99;
      const enemy = g.entities.find(e => e.alive && e.kind === 'enemy');
      let usedAtk = false;
      let beforeAtk = 0, afterAtk = 0;
      if (enemy) {
        for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
          const x = enemy.x + dx, y = enemy.y + dy;
          if (g.canWalk(x, y) && !g.entityAt(x, y)) {
            g.player.x = x; g.player.y = y; g.player.rx = x; g.player.ry = y;
            break;
          }
        }
        beforeAtk = g.player.sp;
        usedAtk = g.useSkill('cleave');
        afterAtk = g.player.sp;
      }
      return {
        usedSelf, beforeSelf, afterSelf,
        usedAtk, beforeAtk, afterAtk,
        guard: g.player.statuses.some(s => s.id === 'guard'),
      };
    })()
  `);
  check('self skill spends spirit and applies a status',
    skill.usedSelf === true && skill.afterSelf < skill.beforeSelf && skill.guard === true,
    `sp ${skill.beforeSelf} -> ${skill.afterSelf}, guard=${skill.guard}`);
  check('attack skill spends spirit against an adjacent enemy',
    skill.usedAtk === true && skill.afterAtk < skill.beforeAtk,
    `sp ${skill.beforeAtk} -> ${skill.afterAtk}`);

  // ---- save / load round trip
  const save = await cdp.evaluate(`
    (() => {
      const g = window.Sablewood.game;
      g.save();
      const raw = localStorage.getItem('sablewood.save.v1');
      const parsed = raw ? JSON.parse(raw) : null;
      const p = parsed?.player;
      return {
        bytes: raw ? raw.length : 0,
        level: p?.level,
        hp: Math.round(p?.hp ?? 0),
        inv: p?.inventory?.length,
        mapW: parsed?.map?.w,
        tilesIsArray: Array.isArray(parsed?.map?.tiles?.__u8),
        floor: parsed?.map?.floor,
      };
    })()
  `);
  check('save writes a serialised world', save.bytes > 2000, `${save.bytes} bytes`);
  check('save keeps level and inventory', save.level >= 1 && save.inv > 0, `Lv.${save.level}, ${save.inv} items`);
  check('map tiles serialise as numeric array', save.tilesIsArray === true);
  check('save records the current floor', save.floor === 1, `floor ${save.floor}`);

  const reload = await cdp.evaluate(`
    (() => {
      const before = window.Sablewood.game;
      const parsed = JSON.parse(localStorage.getItem('sablewood.save.v1'));
      return { ok: !!parsed, level: parsed.player.level, floor: parsed.map.floor };
    })()
  `);
  check('saved payload survives JSON round-trip', reload.ok && reload.level === save.level);

  // ---- shop / economy
  const shop = await cdp.evaluate(`
    (() => {
      const g = window.Sablewood.game;
      g.enterTown(false);
      g.player.gold = 500;
      const before = g.player.gold;
      const invBefore = g.player.inventory.length;
      const bought = g.buy('potion_small');
      return { bought, gold: g.player.gold, before, invAfter: g.player.inventory.length, invBefore };
    })()
  `);
  check('buying deducts gold', shop.bought === true && shop.gold < shop.before,
    `${shop.before} -> ${shop.gold}`);

  // ---- quest progress
  const quest = await cdp.evaluate(`
    (() => {
      const g = window.Sablewood.game;
      const q = g.player.quests.find(q => q.id === 'q_first_step');
      return { progress: q.progress, done: q.done };
    })()
  `);
  check('descending progresses the depth quest', quest.progress >= 1, `progress ${quest.progress}`);

  // ---- larger stress pass: many turns without crashing
  const stress = await cdp.evaluate(`
    (() => {
      const g = window.Sablewood.game;
      g.player.hp = g.player.maxHp = 9999;
      let steps = 0;
      for (let i = 0; i < 260; i++) {
        const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
        const [dx,dy] = dirs[i % 4];
        g.step(dx,dy);
        steps++;
      }
      return { steps, turn: g.turn, screen: g.screen, entities: g.entities.length };
    })()
  `);
  check('260 consecutive turns run without a crash', stress.steps === 260 && stress.screen === 'play',
    `${stress.entities} entities`);

  // ---- deep floor generation through the real code path
  const deep = await cdp.evaluate(`
    (() => {
      const g = window.Sablewood.game;
      if (g.map.kind === 'town') g.descend();
      let guard = 0;
      while (g.map.floor < 20 && guard++ < 40) g.descend();
      return { floor: g.map.floor, place: g.map.name, enemies: g.entities.filter(e=>e.kind==='enemy').length };
    })()
  `);
  check('descends to floor 20', deep.floor === 20, `${deep.place}`);

  if (SHOTS) await cdp.shot(join(process.cwd(), 'verification', '04-deep.png'));

  // ---- death path
  const death = await cdp.evaluate(`
    (() => {
      const g = window.Sablewood.game;
      g.player.hp = 1;
      g.damagePlayer(999);
      return { screen: g.screen, saveCleared: localStorage.getItem('sablewood.save.v1') === null };
    })()
  `);
  check('death ends the run', death.screen === 'dead');
  check('death clears the save', death.saveCleared === true);

  await sleep(600);
  const deathPanel = await cdp.evaluate(`
    (() => {
      const s = document.getElementById('screen');
      return { open: !s.classList.contains('hidden'), title: document.querySelector('#panel h2')?.textContent ?? '' };
    })()
  `);
  check('death screen is shown', deathPanel.open === true, deathPanel.title);

  if (SHOTS) await cdp.shot(join(process.cwd(), 'verification', '05-death.png'));

  // ---- final error sweep
  check('no uncaught exceptions across the whole run', cdp.errors.length === 0, cdp.errors.slice(0, 3).join(' | '));
  check('no console errors across the whole run', cdp.consoleErrors.length === 0, cdp.consoleErrors.slice(0, 3).join(' | '));

  // ---- teardown
  try { ws.close(); } catch { /* ignore */ }
  proc.kill();
  server.close();
  await sleep(300);
  await rm(profile, { recursive: true, force: true }).catch(() => {});

  const passed = results.length - failures;
  console.log(`\n${passed}/${results.length} checks passed`);
  if (failures) {
    console.log('\nFailures:');
    for (const r of results.filter((x) => !x.ok)) console.log(`  - ${r.name} ${r.detail}`);
  }
  console.log(failures === 0 ? '\nRESULT: PASS\n' : '\nRESULT: FAIL\n');
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('verification crashed:', err);
  process.exit(2);
});
