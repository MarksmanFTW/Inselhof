/**
 * Menüs als HTML über dem Spielbild: Hauptmenü (Holzschild-Optik, Pixel-Schrift)
 * und der Aussehen-Editor mit großer, laufender Vorschau der Figur.
 */
import { Dir, FOOT_X, FOOT_Y, HAIR_COLORS, PANTS, PARTS, SHIRTS, SKINS, makeCharacter, randomLook, type Look } from './character';
import { MAX_SLOTS, activeSlot, type Save, type Slot } from './save';

const ui = document.querySelector<HTMLElement>('#ui')!;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Kleine Bühne: Figur auf einem Grasfleck, groß und pixelscharf */
class Stage {
  readonly canvas = document.createElement('canvas');
  private sheet = makeCharacter({ skin: 0, hair: 0, hairColor: 0, shirt: 0, pants: 0, hat: 0 });
  dir: Dir = Dir.Down;
  walking = true;
  private raf = 0;
  constructor(readonly scale: number) {
    this.canvas.width = 28;
    this.canvas.height = 30;
    this.canvas.className = 'stage-canvas';
    this.canvas.style.width = `${28 * scale}px`;
    this.canvas.style.height = `${30 * scale}px`;
  }
  set(look: Look) {
    this.sheet = makeCharacter(look);
  }
  start() {
    const g = this.canvas.getContext('2d')!;
    const tick = (now: number) => {
      this.raf = requestAnimationFrame(tick);
      g.clearRect(0, 0, 28, 30);
      // Grasfleck mit dunklem Rand
      for (let y = -3; y <= 3; y++)
        for (let x = -12; x <= 12; x++) {
          const d = (x / 12) ** 2 + (y / 3.4) ** 2;
          if (d > 1) continue;
          g.fillStyle = d > 0.72 ? '#1f4a1e' : y < 0 ? '#6cb45a' : '#4f9a44';
          g.fillRect(14 + x, 25 + y, 1, 1);
        }
      g.fillStyle = 'rgba(10,40,12,0.45)';
      g.fillRect(9, 25, 10, 2);
      g.fillRect(10, 24, 8, 1);
      const f = this.walking ? Math.floor(now / 140) % 4 : 0;
      g.drawImage(this.sheet[this.dir][f], 14 - FOOT_X, 26 - FOOT_Y);
    };
    this.raf = requestAnimationFrame(tick);
  }
  stop() {
    cancelAnimationFrame(this.raf);
  }
}

let stage: Stage | null = null;
function clear() {
  stage?.stop();
  stage = null;
  ui.innerHTML = '';
  ui.className = '';
}

export function hideUI() {
  clear();
}

/** Hauptmenü */
export function showMenu(save: Save, on: { play: () => void; slots: () => void; look: () => void; coop: () => void; leave?: () => void; coopText?: string }) {
  clear();
  ui.className = 'ui-menu';
  ui.innerHTML = `
    <div class="menu-top">
      <div class="logo" aria-label="Cozy Island"><span class="l1">Cozy</span><span class="l2">Island</span></div>
      <p class="tag">Deine kleine Insel mitten im Meer</p>
    </div>
    <div class="menu-bottom">
    <div class="panel menu-panel">
      <div class="menu-hero"></div>
      ${save.created && save.name ? `<p class="hello">Hallo, <b>${esc(save.name)}</b>!</p>` : ''}
      <button class="pbtn green" data-act="play">${save.created ? 'Weiterspielen' : 'Spielen'}${save.created ? `<small class="sub">${esc(activeSlot(save).title)}</small>` : ''}</button>
      <div class="two">
        <button class="pbtn small" data-act="slots">Spielstände</button>
        <button class="pbtn small" data-act="look">Aussehen</button>
      </div>
      ${on.leave ? `<button class="pbtn blue" data-act="leave">Koop beenden</button>` : `<button class="pbtn blue" data-act="coop">Mit Freund spielen</button>`}
      ${on.coopText ? `<p class="coop-note">${esc(on.coopText)}</p>` : ''}
    </div>
    <p class="foot">Im Aufbau · bald: farmen, bauen, überleben</p>
    </div>`;
  stage = new Stage(3);
  stage.set(save.look);
  ui.querySelector('.menu-hero')!.appendChild(stage.canvas);
  stage.start();
  // ab und zu umsehen
  let turn = 0;
  const looks = [Dir.Down, Dir.Right, Dir.Down, Dir.Left];
  const s = stage;
  const iv = setInterval(() => {
    if (stage !== s) return clearInterval(iv);
    s.dir = looks[++turn % looks.length];
  }, 2200);
  ui.querySelector('[data-act=play]')!.addEventListener('click', on.play);
  ui.querySelector('[data-act=look]')!.addEventListener('click', on.look);
  ui.querySelector('[data-act=slots]')!.addEventListener('click', on.slots);
  ui.querySelector('[data-act=coop]')?.addEventListener('click', on.coop);
  if (on.leave) ui.querySelector('[data-act=leave]')!.addEventListener('click', on.leave);
}

/** Kurzer Überblick über eine Insel */
function slotStats(sl: Slot) {
  const w = sl.world ?? {};
  const f = sl.farm ?? {};
  return [
    `${w.wood ?? 0} Holz`,
    `${f.turnips ?? 0} Rüben`,
    `${Object.keys(f.plots ?? {}).length} Felder`,
    `${(w.houses ?? []).length} ${(w.houses ?? []).length === 1 ? 'Haus' : 'Häuser'}`,
  ].join(' · ');
}
const when = (t: number) =>
  t ? new Date(t).toLocaleString('de-AT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'noch nie';

/** Spielstände: Inseln wählen, neu anlegen, löschen */
export function showSlots(
  save: Save,
  on: { play: (id: string) => void; create: () => void; remove: (id: string) => void; rename: (id: string, title: string) => void; back: () => void },
  locked = false,
) {
  clear();
  ui.className = 'ui-custom';
  const list = [...save.slots].sort((a, b) => b.updatedAt - a.updatedAt);
  ui.innerHTML = `
    <div class="panel coop-panel slots-panel">
      <h2>Spielstände</h2>
      ${locked ? '<p class="need">Während eines Koop-Spiels kannst du die Insel nicht wechseln.</p>' : ''}
      <div class="slots">
        ${list
          .map(
            (sl) => `<div class="slot-card${sl.id === save.active ? ' on' : ''}" data-id="${sl.id}">
              <div class="slot-head">
                <input class="slot-title" maxlength="20" value="${esc(sl.title)}" aria-label="Name der Insel" />
                ${sl.id === save.active ? '<span class="badge">aktiv</span>' : ''}
              </div>
              ${sl.shared ? `<p class="shared">Gemeinsam mit ${esc(sl.shared.with)}</p>` : ''}
              <p class="stats">${slotStats(sl)}</p>
              <p class="date">zuletzt gespielt: ${when(sl.updatedAt)}</p>
              <div class="slot-btns">
                <button class="pbtn small green" data-s="play"${locked ? ' disabled' : ''}>Spielen</button>
                <button class="pbtn small ghost" data-s="del"${locked && sl.id === save.active ? ' disabled' : ''}>Löschen</button>
              </div>
            </div>`,
          )
          .join('')}
      </div>
      <button class="pbtn blue" data-act="new"${save.slots.length >= MAX_SLOTS || locked ? ' disabled' : ''}>Neue Insel (${save.slots.length}/${MAX_SLOTS})</button>
      <button class="pbtn small ghost" data-act="back">Zurück</button>
    </div>`;
  const panel = ui.querySelector<HTMLElement>('.slots-panel')!;
  panel.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-act=back]')) return on.back();
    if (t.closest('[data-act=new]')) return on.create();
    const card = t.closest<HTMLElement>('.slot-card');
    const btn = t.closest<HTMLButtonElement>('[data-s]');
    if (!card || !btn || btn.disabled) return;
    const id = card.dataset.id!;
    if (btn.dataset.s === 'play') on.play(id);
    if (btn.dataset.s === 'del') {
      // zweimal tippen zum Löschen
      if (btn.dataset.sure) on.remove(id);
      else {
        btn.dataset.sure = '1';
        btn.textContent = 'Wirklich?';
        btn.classList.remove('ghost');
        setTimeout(() => {
          if (!btn.isConnected) return;
          delete btn.dataset.sure;
          btn.textContent = 'Löschen';
          btn.classList.add('ghost');
        }, 2500);
      }
    }
  });
  for (const inp of ui.querySelectorAll<HTMLInputElement>('.slot-title'))
    inp.addEventListener('change', () => {
      const v = inp.value.trim().slice(0, 20);
      if (v) on.rename(inp.closest<HTMLElement>('.slot-card')!.dataset.id!, v);
    });
}

/** Koop: Raum öffnen oder mit Code beitreten */
export function showCoop(on: { host: () => void; join: (code: string) => void; back: () => void }, code = '', islandTitle = '') {
  clear();
  ui.className = 'ui-custom';
  ui.innerHTML = `
    <div class="panel coop-panel">
      <h2>Mit Freund spielen</h2>
      <p>Dein Freund besucht deine Insel. Ihr teilt Holz, Samen und Rüben und könnt zusammen fällen, farmen und bauen.</p>
      <button class="pbtn green" data-act="host">Meine Insel öffnen${islandTitle ? `<small class="sub">${esc(islandTitle)}</small>` : ''}</button>
      <p class="tip">Die Insel wird ein gemeinsamer Spielstand – auch dein Freund kann sie später öffnen.</p>
      <div class="or">oder</div>
      <label class="name-row">Code <input class="name code" maxlength="4" placeholder="ABCD" value="${esc(code)}" autocomplete="off" autocapitalize="characters" /></label>
      <button class="pbtn" data-act="join">Freund besuchen</button>
      <button class="pbtn small ghost" data-act="back">Zurück</button>
    </div>`;
  const input = ui.querySelector<HTMLInputElement>('.code')!;
  input.addEventListener('input', () => (input.value = input.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4)));
  ui.querySelector('[data-act=host]')!.addEventListener('click', on.host);
  ui.querySelector('[data-act=back]')!.addEventListener('click', on.back);
  const join = () => (input.value.length === 4 ? on.join(input.value) : input.focus());
  ui.querySelector('[data-act=join]')!.addEventListener('click', join);
  input.addEventListener('keydown', (e) => e.key === 'Enter' && join());
}

/** Wartefenster (Raum öffnet / verbinde …) */
export function showWait(title: string, html: string, on: { back: () => void; share?: () => void; play?: () => void }) {
  clear();
  ui.className = 'ui-custom';
  ui.innerHTML = `
    <div class="panel coop-panel">
      <h2>${esc(title)}</h2>
      <div class="wait-body">${html}</div>
      ${on.share ? `<button class="pbtn blue" data-act="share">Link schicken</button>` : ''}
      ${on.play ? `<button class="pbtn green" data-act="play">Schon mal spielen</button>` : ''}
      <button class="pbtn small ghost" data-act="back">Abbrechen</button>
    </div>`;
  ui.querySelector('[data-act=back]')!.addEventListener('click', on.back);
  if (on.share) ui.querySelector('[data-act=share]')!.addEventListener('click', on.share);
  if (on.play) ui.querySelector('[data-act=play]')!.addEventListener('click', on.play);
}

/** Aussehen anpassen; done wird mit dem fertigen Stand aufgerufen */
export function showCustomize(save: Save, done: (s: Save) => void, opts: { first: boolean }) {
  clear();
  ui.className = 'ui-custom';
  const look: Look = { ...save.look };
  ui.innerHTML = `
    <div class="panel custom-panel">
      <h2>${opts.first ? 'Wer bist du?' : 'Dein Aussehen'}</h2>
      <div class="stage">
        <button class="arrow" data-rot="-1" aria-label="drehen">&lt;</button>
        <div class="stage-slot"></div>
        <button class="arrow" data-rot="1" aria-label="drehen">&gt;</button>
      </div>
      <label class="name-row">Name <input class="name" maxlength="12" placeholder="Inselkind" value="${esc(save.name)}" autocomplete="off" /></label>
      <div class="rows">
        ${PARTS.map(
          (p) => `<div class="row" data-part="${p.key}">
            <span class="lbl">${p.label}</span>
            <button class="arrow" data-d="-1" aria-label="${p.label} zurück">&lt;</button>
            <span class="val"></span>
            <button class="arrow" data-d="1" aria-label="${p.label} weiter">&gt;</button>
          </div>`,
        ).join('')}
      </div>
      <div class="btns">
        <button class="pbtn small" data-act="random">Zufall</button>
        <button class="pbtn green small" data-act="done">${opts.first ? "Los geht's!" : 'Fertig'}</button>
      </div>
    </div>`;
  stage = new Stage(6);
  ui.querySelector('.stage-slot')!.appendChild(stage.canvas);
  stage.start();
  const st = stage;
  const swatch: Record<string, string[]> = { skin: SKINS, hairColor: HAIR_COLORS, shirt: SHIRTS, pants: PANTS };
  const refresh = () => {
    st.set(look);
    for (const p of PARTS) {
      const val = ui.querySelector<HTMLElement>(`.row[data-part=${p.key}] .val`)!;
      const i = look[p.key];
      val.innerHTML =
        'names' in p
          ? `<span class="txt">${p.names[i]}</span>`
          : `<span class="sw" style="background:${swatch[p.key][i]}"></span><span class="num">${i + 1}/${p.count}</span>`;
    }
  };
  refresh();
  const dirs = [Dir.Down, Dir.Right, Dir.Up, Dir.Left];
  let di = 0;
  ui.querySelector('.custom-panel')!.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const rot = t.closest<HTMLElement>('[data-rot]');
    if (rot) {
      di = (di + Number(rot.dataset.rot) + 4) % 4;
      st.dir = dirs[di];
      return;
    }
    const arrow = t.closest<HTMLElement>('[data-d]');
    if (arrow) {
      const key = arrow.closest<HTMLElement>('.row')!.dataset.part as keyof Look;
      const part = PARTS.find((p) => p.key === key)!;
      look[key] = (look[key] + Number(arrow.dataset.d) + part.count) % part.count;
      refresh();
      return;
    }
    const act = t.closest<HTMLElement>('[data-act]')?.dataset.act;
    if (act === 'random') {
      Object.assign(look, randomLook());
      refresh();
    }
    if (act === 'done') {
      const name = ui.querySelector<HTMLInputElement>('.name')!.value.trim().slice(0, 12);
      done({ ...save, look: { ...look }, name, created: true });
    }
  });
}

export type ToolId = 'axe' | 'hoe' | 'seeds' | 'water';
const TOOL_NAMES: Record<ToolId, string> = { axe: 'Axt', hoe: 'Hacke', seeds: 'Samen', water: 'Gießen' };

export interface HudActions {
  menu: () => void;
  /** Aktions-Knopf gedrückt halten */
  act: (down: boolean) => void;
  tool: (t: ToolId) => void;
  /** Bau-Fenster: Haus wählen → platzieren */
  place: () => void;
  confirm: () => void;
  cancel: () => void;
}

export interface HudIcons {
  log: string;
  axe: string;
  house: string;
  hoe: string;
  seeds: string;
  bucket: string;
  can: string;
  turnip: string;
}

export interface Hud {
  setInv(wood: number, turnips: number): void;
  setTool(t: ToolId): void;
  setSlots(seeds: number, water: number, cap: number, hasCan: boolean): void;
  /** Aktions-Knopf: aktiv? und welches Bild (z. B. Rübe zum Ernten) */
  setAction(on: boolean, icon?: string): void;
  setGoal(text: string | null): void;
  setPlacing(on: boolean, valid?: boolean): void;
  /** Koop-Anzeige unter dem Menü-Knopf */
  setCoop(text: string | null): void;
  openBuild(wood: number): void;
  toast(text: string): void;
}

/** Anzeigen und Knöpfe im Spiel */
export function showHud(on: HudActions, icons: HudIcons, cost: number): Hud {
  clear();
  ui.className = 'ui-hud';
  const slot = (t: ToolId, icon: string) =>
    `<button class="slot" data-tool="${t}" aria-label="${TOOL_NAMES[t]}"><img src="${icon}" alt="" /><small></small></button>`;
  ui.innerHTML = `
    <button class="pbtn icon" data-act="menu" aria-label="Menü"><i></i><i></i><i></i></button>
    <div class="inv">
      <div class="panel wood"><img src="${icons.log}" alt="" /><b class="n-wood">0</b></div>
      <div class="panel wood"><img class="turnip" src="${icons.turnip}" alt="" /><b class="n-turnip">0</b></div>
    </div>
    <p class="goal" hidden></p>
    <p class="coop-chip" hidden></p>
    <div class="hotbar panel">
      ${slot('axe', icons.axe)}${slot('hoe', icons.hoe)}${slot('seeds', icons.seeds)}${slot('water', icons.bucket)}
    </div>
    <div class="actions">
      <button class="pbtn build" data-act="build" aria-label="Bauen"><img src="${icons.house}" alt="" /><span>Bauen</span></button>
      <button class="pbtn green use off" data-act="use" aria-label="Benutzen"><img src="${icons.axe}" alt="" /></button>
    </div>
    <div class="place-bar" hidden>
      <p>Lauf dorthin, wo dein Haus stehen soll</p>
      <div class="btns">
        <button class="pbtn small" data-act="cancel">Abbrechen</button>
        <button class="pbtn green small" data-act="confirm">Hier bauen</button>
      </div>
    </div>
    <div class="toast" hidden></div>`;
  const $ = <T extends HTMLElement>(q: string) => ui.querySelector<T>(q)!;
  $('[data-act=menu]').addEventListener('click', on.menu);
  const use = $('[data-act=use]');
  use.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    use.setPointerCapture(e.pointerId);
    on.act(true);
  });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) use.addEventListener(ev, () => on.act(false));
  $('.hotbar').addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-tool]')?.dataset.tool as ToolId | undefined;
    if (t) on.tool(t);
  });
  let wood = 0;
  $('[data-act=build]').addEventListener('click', () => hud.openBuild(wood));
  $('[data-act=cancel]').addEventListener('click', on.cancel);
  $('[data-act=confirm]').addEventListener('click', on.confirm);
  const bump = (el: HTMLElement, v: string) => {
    if (el.textContent === v) return;
    el.textContent = v;
    const box = el.parentElement!;
    box.classList.remove('pop');
    void box.offsetWidth;
    box.classList.add('pop');
  };
  let toastTimer = 0;
  let actionIcon = '';
  const hud: Hud = {
    setInv(w, turnips) {
      wood = w;
      bump($('.n-wood'), String(w));
      bump($('.n-turnip'), String(turnips));
    },
    setTool(t) {
      for (const b of ui.querySelectorAll<HTMLElement>('[data-tool]')) b.classList.toggle('on', b.dataset.tool === t);
    },
    setSlots(seeds, water, cap, hasCan) {
      $('[data-tool=seeds] small').textContent = String(seeds);
      $('[data-tool=water] small').textContent = `${water}/${cap}`;
      const img = $<HTMLImageElement>('[data-tool=water] img');
      const want = hasCan ? icons.can : icons.bucket;
      if (img.getAttribute('src') !== want) img.src = want;
    },
    setAction(onA, icon) {
      use.classList.toggle('off', !onA);
      if (icon && icon !== actionIcon) {
        actionIcon = icon;
        use.querySelector('img')!.src = icon;
      }
    },
    setCoop(text) {
      const c = $('.coop-chip');
      c.hidden = !text;
      if (text) c.textContent = text;
    },
    setGoal(text) {
      const g = $('.goal');
      g.hidden = !text;
      if (text && g.textContent !== text) g.textContent = text;
    },
    setPlacing(onP, valid = true) {
      $('.place-bar').hidden = !onP;
      $('.actions').hidden = onP;
      $('.hotbar').hidden = onP;
      $<HTMLButtonElement>('[data-act=confirm]').disabled = !valid;
    },
    openBuild(wood) {
      const enough = wood >= cost;
      const modal = document.createElement('div');
      modal.className = 'modal';
      modal.innerHTML = `<div class="panel build-panel">
          <h2>Bauen</h2>
          <div class="build-card${enough ? '' : ' poor'}">
            <img src="${icons.house}" alt="" />
            <div><b>Kleines Haus</b><p>Ein gemütliches Zuhause aus Holz.</p>
            <p class="cost"><img src="${icons.log}" alt="" /> ${cost} Holz <small>(du hast ${wood})</small></p></div>
          </div>
          ${enough ? '' : `<p class="need">Dir fehlen noch ${cost - wood} Holz – fäll ein paar Bäume!</p>`}
          <div class="btns">
            <button class="pbtn small" data-m="close">Zurück</button>
            <button class="pbtn green small" data-m="place"${enough ? '' : ' disabled'}>Platzieren</button>
          </div>
        </div>`;
      ui.appendChild(modal);
      modal.addEventListener('click', (e) => {
        const m = (e.target as HTMLElement).closest<HTMLElement>('[data-m]')?.dataset.m;
        if (e.target === modal || m === 'close') modal.remove();
        if (m === 'place') {
          modal.remove();
          on.place();
        }
      });
    },
    toast(text) {
      const t = $('.toast');
      t.textContent = text;
      t.hidden = false;
      clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => (t.hidden = true), 1800);
    },
  };
  return hud;
}
