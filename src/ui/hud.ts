import { Game } from '../core/game';
import type { Entity, Item, Status } from '../core/types';
import { STATUS_LABEL } from '../core/types';
import { itemName, itemRarity, itemStats } from '../data/items';
import { SKILL_BY_ID } from '../data/skills';
import { itemSprite, npcPortrait, skillSprite } from '../render/art';
import type { Renderer } from '../render/render';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

export class Hud {
  private el = {
    hud: $<HTMLElement>('hud'),
    name: $<HTMLElement>('hud-name'),
    level: $<HTMLElement>('hud-level'),
    hp: $<HTMLElement>('bar-hp'),
    sp: $<HTMLElement>('bar-sp'),
    xp: $<HTMLElement>('bar-xp'),
    hpText: $<HTMLElement>('text-hp'),
    spText: $<HTMLElement>('text-sp'),
    xpText: $<HTMLElement>('text-xp'),
    place: $<HTMLElement>('place-name'),
    day: $<HTMLElement>('day-text'),
    gold: $<HTMLElement>('gold-text'),
    portrait: $<HTMLElement>('portrait'),
    minimap: $<HTMLCanvasElement>('minimap'),
    log: $<HTMLElement>('log'),
    skillbar: $<HTMLElement>('skillbar'),
    statuses: $<HTMLElement>('statuses'),
    prompt: $<HTMLElement>('prompt'),
    toasts: $<HTMLElement>('toasts'),
    vignette: $<HTMLElement>('vignette'),
    dialog: $<HTMLElement>('dialog'),
    dialogName: $<HTMLElement>('dialog-name'),
    dialogText: $<HTMLElement>('dialog-text'),
    dialogOptions: $<HTMLElement>('dialog-options'),
    dialogPortrait: $<HTMLElement>('dialog-portrait'),
  };

  private logLines: string[] = [];
  private lastSkillSig = '';
  private minimapTick = 0;
  onSkill: (id: string) => void = () => {};

  constructor(private renderer: Renderer) {}

  init(game: Game): void {
    this.el.name.textContent = game.player.name;
    const c = document.createElement('canvas');
    c.width = 52; c.height = 52;
    const p = npcPortrait('player');
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(p, 0, 0, 52, 52);
    this.el.portrait.innerHTML = '';
    this.el.portrait.appendChild(c);

    this.el.log.innerHTML = '';
    this.logLines = [];
    this.buildSkillbar(game);
    this.update(game);
  }

  show(v: boolean): void {
    for (const k of ['hud', 'log', 'skillbar', 'statuses', 'prompt'] as const) {
      this.el[k].classList.toggle('hidden', !v);
    }
    if (!v) this.el.prompt.classList.add('hidden');
  }

  log(text: string, cls?: string): void {
    const div = document.createElement('div');
    div.className = 'log-line' + (cls ? ' ' + cls : '');
    div.textContent = text;
    this.el.log.appendChild(div);
    this.logLines.push(text);
    while (this.el.log.children.length > 7) this.el.log.removeChild(this.el.log.firstChild!);
    // fade older lines
    const kids = Array.from(this.el.log.children) as HTMLElement[];
    kids.forEach((k, i) => k.classList.toggle('dim', i < kids.length - 2));
    this.logLines.splice(0, Math.max(0, this.logLines.length - 40));
  }

  clearLog(): void {
    this.el.log.innerHTML = '';
  }

  toast(text: string, cls?: string): void {
    const d = document.createElement('div');
    d.className = 'toast' + (cls ? ' ' + cls : '');
    d.textContent = text;
    this.el.toasts.appendChild(d);
    setTimeout(() => {
      d.style.transition = 'opacity 400ms, transform 400ms';
      d.style.opacity = '0';
      d.style.transform = 'translateY(-8px)';
      setTimeout(() => d.remove(), 420);
    }, 1900);
  }

  hurt(): void {
    this.el.vignette.classList.remove('hurt');
    void this.el.vignette.offsetWidth;
    this.el.vignette.classList.add('hurt');
  }

  showPrompt(text: string | null): void {
    if (!text) {
      this.el.prompt.classList.add('hidden');
      return;
    }
    this.el.prompt.innerHTML = text;
    this.el.prompt.classList.remove('hidden');
  }

  dialog(name: string, text: string, options: { label: string; onPick: () => void; primary?: boolean }[], portrait?: string): void {
    this.el.dialogName.textContent = name;
    this.el.dialogText.textContent = text;
    this.el.dialogOptions.innerHTML = '';
    for (const o of options) {
      const b = document.createElement('button');
      b.textContent = o.label;
      if (o.primary) b.className = 'primary';
      b.onclick = () => {
        this.closeDialog();
        o.onPick();
      };
      this.el.dialogOptions.appendChild(b);
    }
    this.el.dialogPortrait.innerHTML = '';
    if (portrait) {
      const c = document.createElement('canvas');
      c.width = 64; c.height = 64;
      const ctx = c.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(npcPortrait(portrait), 0, 0);
      this.el.dialogPortrait.appendChild(c);
    }
    this.el.dialog.classList.remove('hidden');
  }

  closeDialog(): void {
    this.el.dialog.classList.add('hidden');
  }

  get dialogOpen(): boolean {
    return !this.el.dialog.classList.contains('hidden');
  }

  private buildSkillbar(game: Game): void {
    this.el.skillbar.innerHTML = '';
    const skills = game.player.skills.slice(0, 8);
    skills.forEach((id, i) => {
      const def = SKILL_BY_ID[id];
      if (!def) return;
      const b = document.createElement('button');
      b.className = 'skill';
      b.dataset.skill = id;
      b.title = `${def.name} — ${def.desc}`;
      const c = document.createElement('canvas');
      c.width = 30; c.height = 30;
      const ctx = c.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(skillSprite(id), 0, 0, 30, 30);
      b.appendChild(c);
      const key = document.createElement('span');
      key.className = 'key';
      key.textContent = String(i + 1);
      b.appendChild(key);
      const cost = document.createElement('span');
      cost.className = 'cost';
      cost.textContent = String(def.cost);
      b.appendChild(cost);
      const mask = document.createElement('div');
      mask.className = 'cdmask';
      b.appendChild(mask);
      b.onclick = () => this.onSkill(id);
      this.el.skillbar.appendChild(b);
    });
    this.lastSkillSig = '';
  }

  refreshSkillbar(game: Game): void {
    const ids = game.player.skills.slice(0, 8);
    const sig = ids.join(',');
    if (sig !== this.lastSkillSig) {
      this.lastSkillSig = sig;
      this.buildSkillbar(game);
    }
  }

  update(game: Game, dt = 0): void {
    const p = game.player;
    const shownHp = Math.max(0, Math.ceil(p.hp));
    this.el.name.textContent = p.name;
    this.el.level.textContent = `Lv.${p.level}`;
    this.el.hp.style.width = `${Math.max(0, Math.min(100, (p.hp / p.maxHp) * 100))}%`;
    this.el.sp.style.width = `${Math.max(0, Math.min(100, (p.sp / p.maxSp) * 100))}%`;
    const need = game.xpToNext;
    this.el.xp.style.width = `${Math.max(0, Math.min(100, (p.xp / need) * 100))}%`;
    this.el.hpText.textContent = `${shownHp} / ${p.maxHp}`;
    this.el.spText.textContent = `${Math.floor(p.sp)} / ${p.maxSp}`;
    this.el.xpText.textContent = `${p.xp} / ${need}`;
    this.el.place.textContent = game.map.name;
    this.el.day.textContent = `${game.time.day}日目 ${phaseName(game.time.phase)}`;
    this.el.gold.textContent = String(p.gold);

    // statuses
    const sig = p.statuses.map((s) => `${s.id}${s.turns}`).join(',');
    if (this.el.statuses.dataset.sig !== sig) {
      this.el.statuses.dataset.sig = sig;
      this.el.statuses.innerHTML = '';
      for (const s of p.statuses) {
        const d = document.createElement('div');
        d.className = 'status';
        const dot = document.createElement('span');
        dot.className = 'dot';
        dot.style.background = STATUS_LABEL[s.id as keyof typeof STATUS_LABEL]?.color ?? '#fff';
        d.appendChild(dot);
        const label = STATUS_LABEL[s.id as keyof typeof STATUS_LABEL]?.name ?? s.id;
        d.appendChild(document.createTextNode(`${label} ${s.turns}`));
        this.el.statuses.appendChild(d);
      }
    }
    this.el.statuses.classList.toggle('hidden', p.statuses.length === 0 || game.screen !== 'play');

    // skill cooldowns
    this.refreshSkillbar(game);
    for (const b of Array.from(this.el.skillbar.children) as HTMLElement[]) {
      const id = b.dataset.skill!;
      const def = SKILL_BY_ID[id];
      if (!def) continue;
      const cd = p.cooldowns[id] ?? 0;
      const mask = b.querySelector('.cdmask') as HTMLElement;
      if (cd > 0) {
        b.classList.add('cooling');
        mask.textContent = String(cd);
      } else {
        b.classList.remove('cooling');
      }
      b.classList.toggle('off', p.sp < def.cost);
      b.classList.toggle('locked', p.level < def.level);
    }

    // prompt
    if (game.screen === 'play' && !this.dialogOpen) {
      this.updatePrompt(game);
    }

    // minimap (throttled)
    this.minimapTick += dt;
    if (this.minimapTick > 0.12) {
      this.minimapTick = 0;
      this.renderer.drawMinimap(game, this.el.minimap);
    }
  }

  private updatePrompt(game: Game): void {
    const p = game.player;
    const dirs: Record<string, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    const [dx, dy] = dirs[p.facing] ?? [0, 1];
    const front = game.entityAt(p.x + dx, p.y + dy);
    let text: string | null = null;
    if (front?.kind === 'npc') text = `<b>E</b> ${front.name}と話す`;
    else if (front?.propKind === 'chest') text = '<b>E</b> 宝箱を開ける';
    else if (front?.propKind === 'loot') text = '<b>E</b> 拾う';
    else if (front?.propKind === '骨の山') text = '<b>E</b> 漁る';
    else if (front?.breakable) text = '歩いて斬る / <b>E</b> 調べる';
    else {
      const t = game.map.tiles[p.y * game.map.w + p.x];
      if (t === 8) text = game.map.kind === 'town' ? '<b>E</b> 森へ降りる' : '<b>E</b> さらに深くへ';
      else if (t === 9) text = game.map.floor <= 1 ? '<b>E</b> 村へ戻る' : '<b>E</b> 上へ戻る';
    }
    this.showPrompt(text);
  }
}

export function phaseName(phase: number): string {
  if (phase < 0.15) return '朝';
  if (phase < 0.55) return '昼';
  if (phase < 0.72) return '夕';
  if (phase < 0.85) return '宵';
  return '夜';
}

/* ---------------------------------------------------------------- tooltip */

let tipEl: HTMLElement | null = null;

export function tip(html: string, x: number, y: number): void {
  if (!tipEl) {
    tipEl = document.createElement('div');
    tipEl.id = 'tip';
    document.body.appendChild(tipEl);
  }
  tipEl.innerHTML = html;
  tipEl.classList.add('on');
  const r = tipEl.getBoundingClientRect();
  const px = Math.min(window.innerWidth - r.width - 12, x + 16);
  const py = Math.min(window.innerHeight - r.height - 12, y + 16);
  tipEl.style.left = `${px}px`;
  tipEl.style.top = `${py}px`;
}

export function hideTip(): void {
  tipEl?.classList.remove('on');
}

/* ---------------------------------------------------------------- item bits */

export function itemTooltip(it: Item): string {
  const s = itemStats(it);
  const rarity = itemRarity(it);
  const colors: Record<string, string> = {
    common: '#b9b3a3', uncommon: '#7fb069', rare: '#5f9dd6', epic: '#b07fd6', legend: '#e0a84a',
  };
  const lines: string[] = [];
  lines.push(`<div class="tt" style="color:${colors[rarity]}">${itemName(it)}</div>`);
  if (s.atk) lines.push(`<div class="td">攻撃 +${s.atk}</div>`);
  if (s.def) lines.push(`<div class="td">防御 +${s.def}</div>`);
  if (s.hit) lines.push(`<div class="td">命中 +${s.hit}</div>`);
  if (s.crit) lines.push(`<div class="td">会心 +${s.crit}%</div>`);
  if (s.hp) lines.push(`<div class="td">HP +${s.hp}</div>`);
  if (s.sp) lines.push(`<div class="td">気力 +${s.sp}</div>`);
  if (s.eva) lines.push(`<div class="td">回避 +${s.eva}</div>`);
  if (s.lifesteal) lines.push(`<div class="td">吸血 ${s.lifesteal}%</div>`);
  if (s.range > 1) lines.push(`<div class="td">射程 ${s.range}</div>`);
  if (s.element) lines.push(`<div class="td">属性: ${s.element === 'fire' ? '炎' : s.element === 'poison' ? '毒' : '氷'}</div>`);
  for (const k of Object.keys(s.stats) as (keyof typeof s.stats)[]) {
    const v = s.stats[k] ?? 0;
    if (v) lines.push(`<div class="td">${k.toUpperCase()} ${v > 0 ? '+' : ''}${v}</div>`);
  }
  if (it.qty > 1) lines.push(`<div class="td">所持数 ${it.qty}</div>`);
  return lines.join('');
}

export function itemIcon(it: Item | null, size = 34): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  if (it) {
    const spr = itemSprite(spriteOf(it));
    ctx.drawImage(spr, 0, 0, size, size);
  }
  return c;
}

function spriteOf(it: Item): string {
  // mirrored from render.ts mapping, kept local to keep UI independent
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
  return table[it.base] ?? 'bag';
}

export function statusChips(statuses: Status[]): string {
  return statuses.map((s) => STATUS_LABEL[s.id as keyof typeof STATUS_LABEL]?.name ?? s.id).join(' / ');
}

export function describeEntity(e: Entity): string {
  return `${e.name} Lv.${e.level}`;
}
