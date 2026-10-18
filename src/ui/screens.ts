import { Game, INVENTORY_SLOTS, QUESTS } from '../core/game';
import type { Item, Slot } from '../core/types';
import { RARITY_LABEL, SLOT_LABEL, STAT_KEYS, STAT_LABEL } from '../core/types';
import {
  BASES, buyPrice, getBase, itemName, itemRarity, itemStats, itemValue, sellPrice,
} from '../data/items';
import { SKILLS } from '../data/skills';
import { skillSprite } from '../render/art';
import { hideTip, itemIcon, itemTooltip, tip } from './hud';

export type ScreenId = 'none' | 'inventory' | 'character' | 'journal' | 'shop' | 'dead' | 'help' | 'pause';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

export class Screens {
  private el = {
    screen: $<HTMLElement>('screen'),
    panel: $<HTMLElement>('panel'),
  };
  current: ScreenId = 'none';
  private selected: number | null = null;

  constructor(private game: () => Game) {}

  get open(): boolean {
    return this.current !== 'none';
  }

  close(): void {
    this.current = 'none';
    this.el.screen.classList.add('hidden');
    this.el.panel.innerHTML = '';
    hideTip();
  }

  /* ---------------------------------------------------------- shell */

  private shell(title: string, sub: string, body: string, foot = ''): void {
    this.el.panel.innerHTML = `
      <div class="panel-head">
        <div>
          <h2>${title}</h2>
          <div class="sub">${sub}</div>
        </div>
        <button class="ghost" data-close>閉じる <span style="opacity:.5">ESC</span></button>
      </div>
      <div class="panel-body">${body}</div>
      ${foot ? `<div class="panel-foot">${foot}</div>` : ''}
    `;
    this.el.screen.classList.remove('hidden');
    this.el.panel.querySelector('[data-close]')?.addEventListener('click', () => this.close());
    this.el.screen.onclick = (e) => {
      if (e.target === this.el.screen) this.close();
    };
  }

  /** Public entry for one-off panels (new game, etc.). */
  openPanel(title: string, sub: string, body: string, foot = ''): void {
    this.current = 'pause';
    this.shell(title, sub, body, foot);
  }

  /* ---------------------------------------------------------- inventory */

  openInventory(): void {
    this.current = 'inventory';
    this.renderInventory();
  }

  private renderInventory(): void {
    const g = this.game();
    const p = g.player;
    const equipped = new Set(Object.values(p.equip).filter((v): v is number => v != null));
    const bag = p.inventory;

    const doll: string[] = [];
    const order: Exclude<Slot, 'none'>[] = ['head', 'body', 'shield', 'weapon', 'ring', 'charm'];
    for (const slot of order) {
      const uid = p.equip[slot];
      const it = uid != null ? bag.find((i) => i.uid === uid) ?? null : null;
      doll.push(`
        <div style="text-align:center">
          <div class="slot ${it ? 'r-' + itemRarity(it) : ''}" data-doll="${slot}" ${it ? `data-uid="${it.uid}"` : ''}>
            ${it ? '<placeholder>' : '<span style="color:#3a4640;font-size:18px">·</span>'}
          </div>
          <div class="lbl">${SLOT_LABEL[slot]}</div>
        </div>`);
    }

    const slots: string[] = [];
    for (let i = 0; i < INVENTORY_SLOTS; i++) {
      const it = bag[i];
      if (!it) {
        slots.push('<div class="slot empty"></div>');
        continue;
      }
      const rarity = itemRarity(it);
      const isEq = equipped.has(it.uid);
      slots.push(`
        <div class="slot r-${rarity} ${this.selected === it.uid ? 'sel' : ''}" data-uid="${it.uid}">
          ${isEq ? '<span class="eq">装</span>' : ''}
          ${it.qty > 1 ? `<span class="qty">${it.qty}</span>` : ''}
        </div>`);
    }

    const sel = this.selected != null ? bag.find((i) => i.uid === this.selected) ?? null : null;
    const detail = sel ? this.itemDetail(sel, equipped.has(sel.uid)) : `
      <div class="empty-note">アイテムを選ぶと詳細が表示されます。</div>`;

    this.shell('持ち物', `${bag.length} / ${INVENTORY_SLOTS} ・ ${p.gold}金`, `
      <div class="inv-wrap">
        <div>
          <div class="doll">${doll.join('')}</div>
          <div class="inv-grid">${slots.join('')}</div>
        </div>
        <div class="detail">${detail}</div>
      </div>
    `);

    // paint icons
    for (const el of Array.from(this.el.panel.querySelectorAll('[data-uid]')) as HTMLElement[]) {
      const uid = Number(el.dataset.uid);
      const it = bag.find((i) => i.uid === uid);
      if (!it) continue;
      el.querySelector('placeholder')?.remove();
      if (!el.querySelector('canvas')) el.insertBefore(itemIcon(it, 34), el.firstChild);
      el.onmouseenter = (ev) => tip(itemTooltip(it), ev.clientX, ev.clientY);
      el.onmousemove = (ev) => tip(itemTooltip(it), ev.clientX, ev.clientY);
      el.onmouseleave = () => hideTip();
      el.onclick = () => {
        this.selected = uid;
        this.renderInventory();
      };
      if (el.dataset.doll) {
        el.ondblclick = () => {
          g.unequip(el.dataset.doll as Exclude<Slot, 'none'>);
          this.renderInventory();
        };
      }
    }

    // detail actions
    const selEl = this.el.panel.querySelector('.detail');
    if (sel && selEl) {
      const b = getBase(sel.base);
      const canEquip = b.kind === 'weapon' || b.kind === 'armor';
      const actions: string[] = [];
      if (canEquip) {
        actions.push(equipped.has(sel.uid)
          ? `<button data-act="unequip">外す</button>`
          : `<button class="primary" data-act="equip">装備する</button>`);
      }
      if (b.kind === 'consumable') actions.push(`<button class="primary" data-act="use">使う</button>`);
      if (g.map.kind === 'town' && b.kind !== 'quest') actions.push(`<button class="ghost" data-act="sell">売る ${sellPrice(sel)}金</button>`);
      actions.push(`<button class="ghost" data-act="drop">置く</button>`);
      selEl.insertAdjacentHTML('beforeend', `<div class="detail-actions">${actions.join('')}</div>`);
      selEl.querySelectorAll('[data-act]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const act = (btn as HTMLElement).dataset.act;
          if (act === 'equip') g.equip(sel.uid);
          if (act === 'unequip') g.unequip(b.slot as Exclude<Slot, 'none'>);
          if (act === 'use') g.useItem(sel.uid);
          if (act === 'sell') {
            g.sell(sel.uid);
            this.selected = null;
          }
          if (act === 'drop') {
            g.dropItem(sel.uid);
            this.selected = null;
          }
          if (act === 'use' && !p.inventory.some((i) => i.uid === sel.uid)) this.selected = null;
          if (this.current === 'inventory') this.renderInventory();
        });
      });
    }
  }

  private itemDetail(it: Item, equipped: boolean): string {
    const s = itemStats(it);
    const b = getBase(it.base);
    const rarity = itemRarity(it);
    const rows: string[] = [];
    const row = (k: string, v: string, cls = '') => rows.push(`<div class="statline"><span class="k">${k}</span><span class="v ${cls}">${v}</span></div>`);
    if (s.atk) row('攻撃', `${s.atk}`);
    if (s.def) row('防御', `${s.def}`);
    if (s.hit) row('命中', `${s.hit > 0 ? '+' : ''}${s.hit}`);
    if (s.crit) row('会心', `+${s.crit}%`);
    if (s.hp) row('HP', `${s.hp > 0 ? '+' : ''}${s.hp}`);
    if (s.sp) row('気力', `+${s.sp}`);
    if (s.eva) row('回避', `+${s.eva}`);
    if (s.lifesteal) row('吸血', `${s.lifesteal}%`);
    if (s.range > 1) row('射程', `${s.range}`);
    for (const k of STAT_KEYS) {
      const v = s.stats[k] ?? 0;
      if (v) row(STAT_LABEL[k][1], `${v > 0 ? '+' : ''}${v}`, v > 0 ? 'up' : 'down');
    }
    row('価値', `${itemValue(it)}金`);
    if (b.strReq) row('必要力', `${b.strReq}`);

    return `
      <h3 style="color:var(--r-${rarity})">${itemName(it)}</h3>
      <div class="kind">${SLOT_LABEL[b.slot]} ・ ${RARITY_LABEL[rarity]}${equipped ? ' ・ 装備中' : ''}</div>
      <p>${b.desc}</p>
      ${rows.join('')}
    `;
  }

  /* ---------------------------------------------------------- character */

  openCharacter(): void {
    this.current = 'character';
    this.renderCharacter();
  }

  private renderCharacter(): void {
    const g = this.game();
    const p = g.player;
    const s = g.totalStats;
    const eq = g.equipStats;

    const attrRows = STAT_KEYS.map((k) => `
      <div class="attr-row">
        <span class="abbr">${STAT_LABEL[k][0]}</span>
        <span class="aname">${STAT_LABEL[k][1]}</span>
        <span class="aval">${s[k]}</span>
        <button class="plus" data-stat="${k}" ${p.points <= 0 ? 'disabled' : ''}>+</button>
      </div>`).join('');

    const derived = [
      ['HP', `${Math.ceil(p.hp)} / ${p.maxHp}`],
      ['気力', `${Math.floor(p.sp)} / ${p.maxSp}`],
      ['攻撃', `${p.atk}`],
      ['防御', `${p.def}`],
      ['命中', `${p.hit}`],
      ['回避', `${p.eva}`],
      ['会心', `${p.crit}%`],
      ['射程', `${eq.range}`],
      ['所持重量', `${eq.weight.toFixed(1)}`],
      ['撃破数', `${p.kills}`],
      ['最深層', `${p.deepest}`],
      ['経験値', `${p.xp} / ${g.xpToNext}`],
    ].map(([k, v]) => `<div class="kv"><span class="k">${k}</span><span>${v}</span></div>`).join('');

    const skillRows = SKILLS.map((def) => {
      const unlocked = p.level >= def.level;
      return `
        <div class="skill-row ${unlocked ? '' : 'locked'}">
          <canvas width="28" height="28" data-skill="${def.id}"></canvas>
          <div>
            <div class="n">${def.name} ${unlocked ? '' : `<span style="color:#6f6a5e">Lv.${def.level}</span>`}</div>
            <div class="d">${def.desc}</div>
          </div>
        </div>`;
    }).join('');

    this.shell('旅人', `Lv.${p.level} ・ 未使用ポイント ${p.points}`, `
      <div class="char-wrap">
        <div>
          <div class="section-title">能力値</div>
          ${attrRows}
          <div class="section-title">戦闘値</div>
          <div class="derived">${derived}</div>
        </div>
        <div>
          <div class="section-title">技</div>
          ${skillRows}
        </div>
      </div>
    `);

    for (const c of Array.from(this.el.panel.querySelectorAll('canvas[data-skill]')) as HTMLCanvasElement[]) {
      const id = c.dataset.skill!;
      const ctx = c.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(skillSprite(id), 0, 0, 28, 28);
    }
    this.el.panel.querySelectorAll('[data-stat]').forEach((b) => {
      b.addEventListener('click', () => {
        g.spendPoint((b as HTMLElement).dataset.stat as keyof typeof s);
        this.renderCharacter();
      });
    });
  }

  /* ---------------------------------------------------------- journal */

  openJournal(): void {
    this.current = 'journal';
    this.renderJournal();
  }

  private renderJournal(): void {
    const g = this.game();
    const p = g.player;
    const rows = QUESTS.map((def) => {
      const q = p.quests.find((x) => x.id === def.id);
      if (!q) return '';
      const pct = Math.min(100, (q.progress / def.goal) * 100);
      const canClaim = q.done && !q.claimed && g.map.kind === 'town';
      return `
        <div class="quest ${q.done ? 'done' : ''}">
          <h4>${def.name} ${q.claimed ? '<span style="color:#6f6a5e;font-size:10px">受取済</span>' : ''}</h4>
          <p>${def.text}</p>
          <div class="prog">
            <div class="qbar"><i style="width:${pct}%"></i></div>
            <span>${Math.min(q.progress, def.goal)} / ${def.goal}</span>
            <span class="gold-text">${def.reward}金</span>
          </div>
          ${canClaim ? `<div style="margin-top:8px"><button class="primary" data-claim="${def.id}">報酬を受け取る</button></div>` : ''}
        </div>`;
    }).join('');

    this.shell('依頼', `${p.kills}体撃破 ・ 最深 ${p.deepest}層`, `
      ${rows}
      <div class="section-title">記録</div>
      <div class="kv"><span class="k">歩数</span><span>${g.stats.steps}</span></div>
      <div class="kv"><span class="k">稼いだ金</span><span>${g.stats.goldEarned}</span></div>
      <div class="kv"><span class="k">経過</span><span>${g.time.day}日目</span></div>
    `);

    this.el.panel.querySelectorAll('[data-claim]').forEach((b) => {
      b.addEventListener('click', () => {
        g.claimQuest((b as HTMLElement).dataset.claim!);
        this.renderJournal();
      });
    });
  }

  /* ---------------------------------------------------------- shop */

  openShop(): void {
    this.current = 'shop';
    this.renderShop();
  }

  private renderShop(): void {
    const g = this.game();
    const p = g.player;
    const stock = SHOP_STOCK;
    const list = stock.map((id) => {
      const b = BASES[id];
      if (!b) return '';
      const it = { uid: 0, base: id, upgrade: 0, qty: 1 } as Item;
      const price = buyPrice(it);
      const afford = p.gold >= price;
      return `
        <div class="shop-item ${afford ? '' : 'sold'}" data-buy="${id}">
          <canvas width="28" height="28" data-icon="${id}"></canvas>
          <span class="nm">${b.name}</span>
          <span class="pr">${price}金</span>
          <span class="st">${afford ? '' : '金不足'}</span>
        </div>`;
    }).join('');

    const sellable = p.inventory.filter((i) => !g.isEquipped(i.uid));
    const sellList = sellable.length ? sellable.map((it) => `
      <div class="shop-item" data-sell="${it.uid}">
        <canvas width="28" height="28" data-item-icon="${it.uid}"></canvas>
        <span class="nm">${itemName(it)}</span>
        <span class="pr">${sellPrice(it)}金</span>
        <span class="st">売る</span>
      </div>`).join('') : '<div class="empty-note">売れる物がない。</div>';

    this.shell('雑貨屋 ミラ', `所持 ${p.gold}金 ・ 売買は村でのみ`, `
      <div class="shop-wrap">
        <div>
          <div class="section-title">買う</div>
          <div class="shop-list">${list}</div>
        </div>
        <div>
          <div class="section-title">売る</div>
          <div class="shop-list">${sellList}</div>
        </div>
      </div>
    `);

    for (const c of Array.from(this.el.panel.querySelectorAll('canvas[data-icon]')) as HTMLCanvasElement[]) {
      const id = c.dataset.icon!;
      const ctx = c.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      const tmp = itemIcon({ uid: 0, base: id, upgrade: 0, qty: 1 } as Item, 28);
      ctx.drawImage(tmp, 0, 0);
    }
    for (const c of Array.from(this.el.panel.querySelectorAll('canvas[data-item-icon]')) as HTMLCanvasElement[]) {
      const uid = Number(c.dataset.itemIcon);
      const it = p.inventory.find((i) => i.uid === uid);
      if (!it) continue;
      const ctx = c.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(itemIcon(it, 28), 0, 0);
    }
    this.el.panel.querySelectorAll('[data-buy]').forEach((el) => {
      (el as HTMLElement).onclick = () => {
        g.buy((el as HTMLElement).dataset.buy!);
        this.renderShop();
      };
    });
    this.el.panel.querySelectorAll('[data-sell]').forEach((el) => {
      (el as HTMLElement).onclick = () => {
        g.sell(Number((el as HTMLElement).dataset.sell));
        this.renderShop();
      };
    });
  }

  /* ---------------------------------------------------------- help */

  openHelp(): void {
    this.current = 'help';
    this.shell('操作と遊び方', 'Sablewood', `
      <div class="char-wrap">
        <div>
          <div class="section-title">操作</div>
          <div class="kv"><span class="k">移動</span><span>WASD / 矢印 / テンキー</span></div>
          <div class="kv"><span class="k">調べる・階段</span><span>E / Space</span></div>
          <div class="kv"><span class="k">持ち物</span><span>I</span></div>
          <div class="kv"><span class="k">能力値</span><span>C</span></div>
          <div class="kv"><span class="k">依頼</span><span>J</span></div>
          <div class="kv"><span class="k">技</span><span>1〜8</span></div>
          <div class="kv"><span class="k">待機</span><span>.</span></div>
          <div class="kv"><span class="k">休む（村）</span><span>R</span></div>
          <div class="kv"><span class="k">閉じる</span><span>ESC</span></div>
        </div>
        <div>
          <div class="section-title">遊び方</div>
          <p class="muted">
            村の南にある階段から森へ降り、20層の底を目指す。敵を倒すと経験値と金、装備が手に入る。
            レベルが上がると能力ポイントと新しい技を得る。4層ごとに主が待ち受けている。
            死ぬとその記録は失われるが、村の依頼は達成するたび報酬が入る。
          </p>
          <div class="section-title">ヒント</div>
          <p class="muted">
            ・階段の上でEを押すと降りる／戻る<br>
            ・階段の手前でRを押すと村へ帰還（20金）<br>
            ・宝箱と骨の山はEで漁れる<br>
            ・装備は頭・体・盾・武器・指輪・護符の6箇所<br>
            ・森の木は歩いて斬ると木材になる
          </p>
        </div>
      </div>
    `);
  }

  /* ---------------------------------------------------------- death */

  openDeath(g: Game): void {
    this.current = 'dead';
    const p = g.player;
    this.shell('旅はここで終わった', `${p.name} — Lv.${p.level}`, `
      <div class="death-title">― 森の底で ―</div>
      <div class="death-sub">${g.map.name} にて力尽きた。</div>
      <div class="stat-grid">
        <div class="stat-card"><div class="n">${p.deepest}</div><div class="l">最深層</div></div>
        <div class="stat-card"><div class="n">${p.kills}</div><div class="l">撃破</div></div>
        <div class="stat-card"><div class="n">${p.gold}</div><div class="l">所持金</div></div>
      </div>
      <div class="muted" style="text-align:center">セーブデータは失われた。新しい旅を始めよう。</div>
    `, `
      <span class="muted">${g.stats.steps}歩 ・ ${g.stats.goldEarned}金を稼いだ</span>
      <button class="primary" data-restart>村へ戻る</button>
    `);
    this.el.panel.querySelector('[data-restart]')?.addEventListener('click', () => {
      this.close();
      (window as unknown as { __sablewood_restart?: () => void }).__sablewood_restart?.();
    });
  }

  /* ---------------------------------------------------------- pause */

  openPause(): void {
    this.current = 'pause';
    this.shell('一時停止', 'Sablewood', `
      <div style="display:flex;flex-direction:column;gap:8px;max-width:320px;margin:0 auto">
        <button class="primary" data-resume>冒険を続ける</button>
        <button data-help>操作と遊び方</button>
        <button data-save>セーブする</button>
      </div>
    `);
    this.el.panel.querySelector('[data-resume]')?.addEventListener('click', () => this.close());
    this.el.panel.querySelector('[data-help]')?.addEventListener('click', () => this.openHelp());
    this.el.panel.querySelector('[data-save]')?.addEventListener('click', () => {
      this.game().save();
      this.close();
    });
  }
}

export const SHOP_STOCK = [
  'potion_small', 'potion_large', 'sp_potion', 'antidote', 'grilled_meat', 'return_scroll',
  'iron_dagger', 'traveler_sword', 'short_spear', 'wood_shield', 'leather_vest', 'leather_cap',
  'iron_helm', 'ring_str', 'ring_dex', 'charm_ward',
];
