/**
 * Menüs als HTML über dem Spielbild: Hauptmenü (Holzschild-Optik, Pixel-Schrift)
 * und der Aussehen-Editor mit großer, laufender Vorschau der Figur.
 */
import { Dir, FOOT_X, FOOT_Y, HAIR_COLORS, PANTS, PARTS, SHIRTS, SKINS, makeCharacter, randomLook, type Look } from './character';
import { prefs, setPrefs } from './audio';
import { levelOf } from './progress';
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
export function showMenu(
  save: Save,
  on: {
    play: () => void;
    slots: () => void;
    look: () => void;
    coop: () => void;
    leave?: () => void;
    coopText?: string;
    shared?: { id: string; title: string }[];
    playSlot?: (id: string) => void;
    note?: string;
  },
) {
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
      ${save.created && save.name ? `<p class="hello">Hallo, <b>${esc(save.name)}</b>! <small>Insel-Stufe ${levelOf(activeSlot(save).world?.prog?.xp ?? 0)}</small></p>` : ''}
      ${on.note ? `<p class="coop-note">${esc(on.note)}</p>` : ''}
      <button class="pbtn green" data-act="play">${save.created ? 'Weiterspielen' : 'Spielen'}${save.created ? `<small class="sub">${esc(activeSlot(save).title)}${activeSlot(save).shared ? ' · gemeinsam' : ''}</small>` : ''}</button>
      ${(on.shared ?? []).map((s) => `<button class="pbtn blue small shared-btn" data-slot="${esc(s.id)}">Gemeinsam spielen<small class="sub">${esc(s.title)}</small></button>`).join('')}
      <div class="two">
        <button class="pbtn small" data-act="slots">Spielstände</button>
        <button class="pbtn small" data-act="look">Aussehen</button>
      </div>
      ${on.leave ? `<button class="pbtn blue" data-act="leave">Koop beenden</button>` : `<button class="pbtn blue" data-act="coop">Mit Freund spielen</button>`}
      ${on.coopText ? `<p class="coop-note">${esc(on.coopText)}</p>` : ''}
      <div class="two sound">
        <button class="pbtn small ghost" data-act="music">Musik: ${prefs.music ? 'an' : 'aus'}</button>
        <button class="pbtn small ghost" data-act="sound">Töne: ${prefs.sound ? 'an' : 'aus'}</button>
      </div>
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
  for (const k of ['music', 'sound'] as const) {
    const b = ui.querySelector<HTMLElement>(`[data-act=${k}]`)!;
    b.addEventListener('click', () => {
      setPrefs({ [k]: !prefs[k] });
      b.textContent = `${k === 'music' ? 'Musik' : 'Töne'}: ${prefs[k] ? 'an' : 'aus'}`;
    });
  }
  ui.querySelector('[data-act=coop]')?.addEventListener('click', on.coop);
  for (const b of ui.querySelectorAll<HTMLElement>('[data-slot]')) b.addEventListener('click', () => on.playSlot?.(b.dataset.slot!));
  if (on.leave) ui.querySelector('[data-act=leave]')!.addEventListener('click', on.leave);
}

/** Kurzer Überblick über eine Insel */
function slotStats(sl: Slot) {
  const w = sl.world ?? {};
  const f = sl.farm ?? {};
  return [
    `Stufe ${levelOf(w.prog?.xp ?? 0)}`,
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
            (sl) => `<div class="slot-card${sl.id === save.active ? ' on' : ''}${sl.shared ? ' koop' : ''}" data-id="${sl.id}">
              <div class="slot-head">
                <input class="slot-title" maxlength="20" value="${esc(sl.title)}" aria-label="Name der Insel" />
                ${sl.shared ? '<span class="badge koop-badge">Koop</span>' : ''}
                ${sl.id === save.active ? '<span class="badge">aktiv</span>' : ''}
              </div>
              ${sl.shared ? `<p class="shared">Gemeinsame Insel mit ${esc(sl.shared.with)}</p>` : ''}
              <p class="stats">${sl.pull ? 'wird beim ersten Spielen aus der Cloud geladen' : slotStats(sl)}</p>
              <p class="date">zuletzt gespielt: ${sl.updatedAt ? when(sl.updatedAt) : 'noch nie'}</p>
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
export function showCoop(on: { host: () => void; join: (code: string) => void; back: () => void; island: () => Promise<string> }, code = '', islandTitle = '') {
  clear();
  ui.className = 'ui-custom';
  ui.innerHTML = `
    <div class="panel coop-panel">
      <h2>Mit Freund spielen</h2>
      <p>Dein Freund besucht deine Insel. Ihr teilt Holz, Samen und Rüben und könnt zusammen fällen, farmen und bauen.</p>
      <button class="pbtn green" data-act="host">Meine Insel öffnen${islandTitle ? `<small class="sub">${esc(islandTitle)}</small>` : ''}</button>
      <p class="tip">Die Insel wird ein gemeinsamer Spielstand – auch dein Freund kann sie später öffnen.</p>
      <button class="pbtn blue small" data-act="island">Insel-Link schicken</button>
      <p class="tip island-tip">Mit dem Insel-Link spielt dein Freund <b>jederzeit</b> auf deiner Insel weiter – auch wenn du offline bist. Alles wird abgeglichen.</p>
      <div class="or">oder</div>
      <label class="name-row">Code <input class="name code" maxlength="4" placeholder="ABCD" value="${esc(code)}" autocomplete="off" autocapitalize="characters" /></label>
      <button class="pbtn" data-act="join">Freund besuchen</button>
      <button class="pbtn small ghost" data-act="back">Zurück</button>
    </div>`;
  const input = ui.querySelector<HTMLInputElement>('.code')!;
  input.addEventListener('input', () => (input.value = input.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4)));
  const ib = ui.querySelector<HTMLButtonElement>('[data-act=island]')!;
  ib.addEventListener('click', () =>
    void on.island().then((t) => {
      if (t) ui.querySelector('.island-tip')!.textContent = t;
    }),
  );
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

export type ToolId = 'axe' | 'hoe' | 'seeds' | 'water' | 'scythe';
const TOOL_NAMES: Record<ToolId, string> = { axe: 'Axt', hoe: 'Hacke', seeds: 'Samen', water: 'Gießen', scythe: 'Sense' };

export interface HudActions {
  menu: () => void;
  /** Aktions-Knopf gedrückt halten */
  act: (down: boolean) => void;
  tool: (t: ToolId) => void;
  /** Bau-Fenster: Haus oder Lagerfeuer wählen → platzieren */
  place: (what: 'house' | 'fire' | 'stable' | 'paddock' | 'deco', item?: string) => void;
  /** gekaufte Deko zum Aufstellen */
  decoList: () => { id: string; name: string; img: string; n: number }[];
  album: () => void;
  /** Rübe essen (roh) oder Ofenrübe */
  eat: (cooked: boolean) => void;
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
  fire: string;
  meal: string;
  stable: string;
  horse: string;
  scythe: string;
  hay: string;
  paddock: string;
  coin: string;
  book: string;
}

export interface TradeData {
  coins: number;
  have: Record<'turnip' | 'meal' | 'wood' | 'hay', number>;
  sell: { id: 'turnip' | 'meal' | 'wood' | 'hay'; name: string; price: number; img: string }[];
  seeds: { n: number; price: number; img: string };
  deco: { id: string; name: string; price: number; img: string; owned: boolean }[];
  horses: { id: string; name: string; text: string; price: number; img: string }[];
  /** Grund, warum kein Pferd geht (kein Stall/voll) */
  horseBlock: string | null;
}
export interface AlbumData {
  sections: { title: string; items: { name: string; img: string; has: boolean; rare?: boolean }[] }[];
  count: number;
  total: number;
  rewards: { at: number; coins: number; got: boolean }[];
}

/** Eintrag im Stall: Rasse zum Aufnehmen */
export interface BreedCard {
  id: string;
  name: string;
  text: string;
  cost: number;
  level: number;
  img: string;
  names: string[];
}
/** ein eigenes Pferd im Fenster */
export interface HorseCard {
  name: string;
  breed: string;
  text: string;
  img: string;
  love: number;
  maxLove: number;
  canRide: boolean;
  /** Fohlen, wächst noch */
  foal: boolean;
  /** heute schon erledigt */
  fed: boolean;
  treat: boolean;
  brushed: boolean;
  /** Fohlen möglich? sonst Grund */
  foalBlock: string | null;
  /** Fohlen-Knopf überhaupt zeigen (volles Vertrauen) */
  showFoal: boolean;
}

export interface Hud {
  setInv(wood: number, turnips: number, meals: number): void;
  /** Energie 0..100 */
  setEnergy(v: number): void;
  setTool(t: ToolId): void;
  setSlots(seeds: number, water: number, cap: number, hasCan: boolean, hay: number): void;
  /** Aktions-Knopf: aktiv? und welches Bild (z. B. Rübe zum Ernten) */
  setAction(on: boolean, icon?: string): void;
  setGoal(text: string | null): void;
  /** Insel-Stufe und Fortschritt (0..1) */
  setLevel(level: number, progress: number): void;
  /** im Haus: Werkzeuge und Bauen ausblenden */
  setInside(on: boolean): void;
  openChest(items: [string, number][]): void;
  openFurnish(list: { id: string; name: string; cost: number; img: string }[], wood: number, pick: (id: string) => void): void;
  /** Pferdestall: Rassen zum Aufnehmen, eigene Pferde */
  openStable(o: { breeds: BreedCard[]; turnips: number; level: number; mine: string[]; space: number }, pick: (id: string, name: string) => void): void;
  /** eigenes Pferd: füttern oder reiten */
  openHorse(h: HorseCard, have: { turnips: number; hay: number }, hearts: [string, string], on: { feed: () => void; treat: () => void; brush: () => void; ride: () => void; foal: () => void }): void;
  /** Namen eingeben (Fohlen) */
  askName(title: string, img: string, text: string, name: string, ok: string, done: (name: string) => void): void;
  /** Bildschirm wird schwarz, done läuft in der Mitte */
  sleep(text: string, done: () => void): void;
  /** Uhrzeit-Anzeige */
  setClock(text: string): void;
  /** Aufstieg feiern */
  levelUp(level: number, perk?: string): void;
  setPlacing(on: boolean, valid?: boolean): void;
  /** Koop-Anzeige unter dem Menü-Knopf */
  setCoop(text: string | null): void;
  openBuild(wood: number): void;
  /** Münzen-Anzeige */
  setCoins(n: number): void;
  /** Händler-Boot; update() zeichnet neu, solange offen */
  openTrade(d: TradeData, act: { sell: (id: string, n: number) => void; buy: (id: string) => void }, onClose: () => void): { update(d: TradeData): void };
  openAlbum(d: AlbumData): void;
  toast(text: string): void;
}

/** Anzeigen und Knöpfe im Spiel */
export function showHud(on: HudActions, icons: HudIcons, costs: { house: number; fire: number; stable: number; paddock: number }): Hud {
  clear();
  ui.className = 'ui-hud';
  const slot = (t: ToolId, icon: string) =>
    `<button class="slot" data-tool="${t}" aria-label="${TOOL_NAMES[t]}"><img src="${icon}" alt="" /><small></small></button>`;
  ui.innerHTML = `
    <button class="pbtn icon" data-act="menu" aria-label="Menü"><i></i><i></i><i></i></button>
    <div class="panel lvl">
      <div class="st-row"><b>Stufe 1</b><small class="clock"></small></div>
      <div class="st-bar"><small>EP</small><div class="xpbar"><i></i></div></div>
      <div class="st-bar"><small>Kraft</small><div class="enbar" title="Energie"><i></i></div></div>
    </div>
    <div class="panel res">
      <span class="r" title="Holz"><img src="${icons.log}" alt="" /><b class="n-wood">0</b></span>
      <button class="r eat" data-eat="raw" aria-label="Rübe essen"><img class="turnip" src="${icons.turnip}" alt="" /><b class="n-turnip">0</b></button>
      <button class="r eat" data-eat="cooked" aria-label="Ofenrübe essen"><img class="meal" src="${icons.meal}" alt="" /><b class="n-meal">0</b></button>
      <span class="r" title="Münzen"><img class="coin" src="${icons.coin}" alt="" /><b class="n-coins">0</b></span>
    </div>
    <button class="goal" hidden aria-label="Aufgabe"></button>
    <p class="coop-chip" hidden></p>
    <div class="hotbar panel">
      ${slot('axe', icons.axe)}${slot('hoe', icons.hoe)}${slot('seeds', icons.seeds)}${slot('water', icons.bucket)}${slot('scythe', icons.scythe)}
    </div>
    <div class="actions">
      <div class="act-row">
        <button class="pbtn album" data-act="album" aria-label="Sammelalbum"><img src="${icons.book}" alt="" /><span>Album</span></button>
        <button class="pbtn build" data-act="build" aria-label="Bauen"><img src="${icons.house}" alt="" /><span>Bauen</span></button>
      </div>
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
  for (const b of ui.querySelectorAll<HTMLElement>('[data-eat]')) b.addEventListener('click', () => on.eat(b.dataset.eat === 'cooked'));
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
  // Aufgabe: klein (eine Zeile), antippen = ganz
  let goalText = '';
  let goalHead = '';
  let goalOpen = false;
  let goalTimer = 0;
  const drawGoal = () => {
    const g = $('.goal');
    const t = goalOpen ? goalText : goalHead.replace(/^Aufgabe: /, '');
    if (g.textContent !== t) g.textContent = t;
    g.classList.toggle('open', goalOpen);
  };
  $('.goal').addEventListener('click', () => {
    goalOpen = !goalOpen;
    clearTimeout(goalTimer);
    drawGoal();
  });
  $('[data-act=build]').addEventListener('click', () => hud.openBuild(wood));
  $('[data-act=album]').addEventListener('click', on.album);
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
    setInv(w, turnips, meals) {
      wood = w;
      bump($('.n-wood'), String(w));
      bump($('.n-turnip'), String(turnips));
      bump($('.n-meal'), String(meals));
    },
    setEnergy(v) {
      const bar = $('.enbar i');
      bar.style.width = `${Math.round(Math.max(0, Math.min(100, v)))}%`;
      $('.enbar').classList.toggle('low', v < 25);
    },
    setTool(t) {
      for (const b of ui.querySelectorAll<HTMLElement>('[data-tool]')) b.classList.toggle('on', b.dataset.tool === t);
    },
    setSlots(seeds, water, cap, hasCan, hay) {
      $('[data-tool=seeds] small').textContent = String(seeds);
      $('[data-tool=scythe] small').textContent = String(hay);
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
      if (!text) return;
      const head = text.split('\n')[0];
      // neue Aufgabe: kurz ganz zeigen, dann wieder klein
      if (head !== goalHead) {
        if (goalHead) {
          goalOpen = true;
          clearTimeout(goalTimer);
          goalTimer = window.setTimeout(() => {
            goalOpen = false;
            drawGoal();
          }, 6000);
        }
        goalHead = head;
      }
      goalText = text;
      drawGoal();
    },
    setLevel(level, progress) {
      const b = $('.lvl b');
      const t = `Stufe ${level}`;
      if (b.textContent !== t) b.textContent = t;
      $('.xpbar i').style.width = `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%`;
    },
    setInside(onI) {
      $('.hotbar').hidden = onI;
      $('[data-act=build]').hidden = onI;
      $('[data-act=album]').hidden = onI;
    },
    openChest(items) {
      const modal = document.createElement('div');
      modal.className = 'modal';
      modal.innerHTML = `<div class="panel build-panel">
          <h2>Truhe</h2>
          <p class="have">Eure Vorräte auf der Insel</p>
          <div class="chest-list">${items.map(([n, v]) => `<div><span>${esc(n)}</span><b>${v}</b></div>`).join('')}</div>
          <button class="pbtn small ghost" data-m="close">Zurück</button>
        </div>`;
      ui.appendChild(modal);
      modal.addEventListener('click', (e) => {
        if (e.target === modal || (e.target as HTMLElement).closest('[data-m=close]')) modal.remove();
      });
    },
    openFurnish(list, wood, pick) {
      const modal = document.createElement('div');
      modal.className = 'modal';
      modal.innerHTML = `<div class="panel build-panel">
          <h2>Möbel bauen</h2>
          <p class="have">Du hast ${wood} Holz</p>
          <div class="furn-grid">${list
            .map(
              (f) => `<button class="furn${wood >= f.cost ? '' : ' poor'}" data-f="${f.id}"${wood >= f.cost ? '' : ' disabled'}>
                <img src="${f.img}" alt="" /><b>${esc(f.name)}</b><small>${f.cost} Holz</small></button>`,
            )
            .join('')}</div>
          <button class="pbtn small ghost" data-m="close">Zurück</button>
        </div>`;
      ui.appendChild(modal);
      modal.addEventListener('click', (e) => {
        const t = e.target as HTMLElement;
        if (e.target === modal || t.closest('[data-m=close]')) return modal.remove();
        const b = t.closest<HTMLButtonElement>('[data-f]');
        if (b && !b.disabled) {
          modal.remove();
          pick(b.dataset.f!);
        }
      });
    },
    openStable(o, pick) {
      const modal = document.createElement('div');
      modal.className = 'modal';
      const full = o.mine.length >= o.space;
      const list = () => `<div class="panel build-panel stable-panel">
          <h2>Pferdestall</h2>
          <p class="have">Du hast ${o.turnips} Rüben · Platz ${o.mine.length}/${o.space}</p>
          ${o.mine.length ? `<p class="mine">Hier wohnen: ${o.mine.map(esc).join(', ')}</p>` : '<p class="mine">Noch leer – nimm ein Pferd auf!</p>'}
          <div class="furn-grid breed-grid">${o.breeds
            .map((b) => {
              const locked = o.level < b.level;
              const poor = o.turnips < b.cost;
              return `<button class="furn${locked || poor || full ? ' poor' : ''}${locked ? ' locked' : ''}" data-b="${b.id}"${locked || full ? ' disabled' : ''}>
                <img src="${b.img}" alt="" /><b>${esc(b.name)}</b><small>${locked ? `ab Stufe ${b.level}` : `${b.cost} Rüben`}</small></button>`;
            })
            .join('')}</div>
          ${full ? '<p class="mine">Der Stall ist voll – bau noch einen Stall.</p>' : ''}
          <p class="mine small">Tipp: Mit der Sense Wiese mähen, trocknen lassen, Heu einsammeln – das fressen Pferde am liebsten. Eine Koppel neben dem Stall wird ihre Weide.</p>
          <button class="pbtn small ghost" data-m="close">Zurück</button>
        </div>`;
      const naming = (b: BreedCard) => `<div class="panel build-panel stable-panel">
          <h2>${esc(b.name)}</h2>
          <div class="horse-hero"><img src="${b.img}" alt="" /></div>
          <p class="have">${esc(b.text)}</p>
          <label class="name-row">Name <input class="name" maxlength="12" value="${esc(b.names[Math.floor(Math.random() * b.names.length)])}" autocomplete="off" /></label>
          <div class="two">
            <button class="pbtn small ghost" data-m="list">Zurück</button>
            <button class="pbtn green small" data-m="adopt"${o.turnips < b.cost ? ' disabled' : ''}>${o.turnips < b.cost ? `Noch ${b.cost - o.turnips} Rüben` : `Aufnehmen · ${b.cost} Rüben`}</button>
          </div>
        </div>`;
      let chosen: BreedCard | null = null;
      modal.innerHTML = list();
      ui.appendChild(modal);
      modal.addEventListener('click', (e) => {
        const t = e.target as HTMLElement;
        if (e.target === modal || t.closest('[data-m=close]')) return modal.remove();
        if (t.closest('[data-m=list]')) {
          chosen = null;
          modal.innerHTML = list();
          return;
        }
        const adopt = t.closest<HTMLButtonElement>('[data-m=adopt]');
        if (adopt && !adopt.disabled && chosen) {
          const name = modal.querySelector<HTMLInputElement>('input.name')!.value.trim() || chosen.names[0];
          modal.remove();
          pick(chosen.id, name);
          return;
        }
        const b = t.closest<HTMLButtonElement>('[data-b]');
        if (b && !b.disabled) {
          chosen = o.breeds.find((x) => x.id === b.dataset.b) ?? null;
          if (chosen) modal.innerHTML = naming(chosen);
        }
      });
    },
    openHorse(h, have, hearts, act) {
      const modal = document.createElement('div');
      modal.className = 'modal';
      const n = Math.ceil(h.maxLove / 2);
      const filled = Math.ceil(h.love / 2);
      const btn = (m: string, label: string, off: boolean, cls = '') => `<button class="pbtn small${cls}" data-m="${m}"${off ? ' disabled' : ''}>${label}</button>`;
      const tip = h.foal
        ? 'Ein Fohlen – es wächst noch und ist zu klein zum Reiten.'
        : h.canRide
          ? 'Vertraut dir – du kannst aufsteigen! Je mehr Herzen, desto schneller.'
          : 'Füttere oder bürste es, dann vertraut es dir.';
      modal.innerHTML = `<div class="panel build-panel stable-panel">
          <h2>${esc(h.name)}</h2>
          <div class="horse-hero"><img src="${h.img}" alt="" /></div>
          <p class="have"><b>${esc(h.breed)}</b> – ${esc(h.text)}</p>
          <div class="hearts">${Array.from({ length: n }, (_, i) => `<img src="${hearts[i < filled ? 0 : 1]}" alt="" />`).join('')}</div>
          <p class="mine">${tip}</p>
          <div class="care">
            ${btn('feed', h.fed ? 'Satt' : `<img src="${icons.hay}" alt="" />Heu · ${have.hay}`, h.fed || have.hay <= 0)}
            ${btn('treat', h.treat ? 'Lecker!' : `<img src="${icons.turnip}" alt="" />Leckerli`, h.treat || have.turnips <= 0)}
            ${btn('brush', h.brushed ? 'Glänzt' : 'Bürsten', h.brushed)}
          </div>
          <p class="mine small">Füttern, Leckerli und Bürsten geht je einmal am Tag.</p>
          ${h.foal ? '' : `<div class="${h.showFoal ? 'two' : ''}">${h.showFoal ? btn('foal', h.foalBlock ? 'Fohlen?' : 'Fohlen · 5 Heu', !!h.foalBlock) : ''}${btn('ride', 'Reiten', !h.canRide, ' green')}</div>`}
          ${h.showFoal && h.foalBlock ? `<p class="mine small">${esc(h.foalBlock)}</p>` : ''}
          <button class="pbtn small ghost" data-m="close">Zurück</button>
        </div>`;
      ui.appendChild(modal);
      modal.addEventListener('click', (e) => {
        const t = e.target as HTMLElement;
        if (e.target === modal || t.closest('[data-m=close]')) return modal.remove();
        const m = t.closest<HTMLButtonElement>('[data-m]');
        if (!m || m.disabled) return;
        modal.remove();
        const k = m.dataset.m as 'feed' | 'treat' | 'brush' | 'ride' | 'foal';
        act[k]();
      });
    },
    askName(title, img, text, name, ok, done) {
      const modal = document.createElement('div');
      modal.className = 'modal';
      modal.innerHTML = `<div class="panel build-panel stable-panel">
          <h2>${esc(title)}</h2>
          <div class="horse-hero"><img src="${img}" alt="" /></div>
          <p class="have">${esc(text)}</p>
          <label class="name-row">Name <input class="name" maxlength="12" value="${esc(name)}" autocomplete="off" /></label>
          <div class="two">
            <button class="pbtn small ghost" data-m="close">Zurück</button>
            <button class="pbtn green small" data-m="ok">${esc(ok)}</button>
          </div>
        </div>`;
      ui.appendChild(modal);
      modal.addEventListener('click', (e) => {
        const t = e.target as HTMLElement;
        if (e.target === modal || t.closest('[data-m=close]')) return modal.remove();
        if (t.closest('[data-m=ok]')) {
          const v = modal.querySelector<HTMLInputElement>('input.name')!.value.trim() || name;
          modal.remove();
          done(v);
        }
      });
    },
    sleep(text, done) {
      const el = document.createElement('div');
      el.className = 'sleepfade';
      el.innerHTML = `<p>${esc(text)}</p>`;
      ui.appendChild(el);
      setTimeout(done, 900);
      setTimeout(() => el.classList.add('out'), 1700);
      setTimeout(() => el.remove(), 2400);
    },
    setClock(text) {
      const c = $('.clock');
      if (c.textContent !== text) c.textContent = text;
    },
    levelUp(level, perk) {
      const el = document.createElement('div');
      el.className = 'levelup';
      el.innerHTML = `<div class="panel"><small>Insel-Stufe</small><b>${level}</b>${perk ? `<p>Neu: ${esc(perk)}</p>` : ''}<p class="gift">+3 Samen</p></div>`;
      ui.appendChild(el);
      setTimeout(() => el.classList.add('out'), 3000);
      setTimeout(() => el.remove(), 3500);
    },
    setPlacing(onP, valid = true) {
      $('.place-bar').hidden = !onP;
      $('.actions').hidden = onP;
      $('.hotbar').hidden = onP;
      $<HTMLButtonElement>('[data-act=confirm]').disabled = !valid;
    },
    openBuild(wood) {
      const decos = on.decoList();
      const card = (what: 'house' | 'fire' | 'stable' | 'paddock', img: string, title: string, text: string) => {
        const cost = costs[what];
        const enough = wood >= cost;
        return `<div class="build-card${enough ? '' : ' poor'}">
            <img src="${img}" alt="" />
            <div><b>${title}</b><p>${text}</p>
            <p class="cost"><img src="${icons.log}" alt="" /> ${cost} Holz</p>
            <button class="pbtn green small" data-m="${what}"${enough ? '' : ' disabled'}>${enough ? 'Platzieren' : `Noch ${cost - wood} Holz`}</button></div>
          </div>`;
      };
      const modal = document.createElement('div');
      modal.className = 'modal';
      modal.innerHTML = `<div class="panel build-panel">
          <h2>Bauen</h2>
          <p class="have">Du hast ${wood} Holz</p>
          ${card('house', icons.house, 'Kleines Haus', 'Zum Schlafen, mit Platz für Möbel.')}
          ${card('fire', icons.fire, 'Lagerfeuer', 'Brät Rüben zu Ofenrüben – macht richtig satt.')}
          ${card('stable', icons.stable, 'Pferdestall', 'Platz für 4 Pferde – such dir deine Lieblingsrassen aus.')}
          ${card('paddock', icons.paddock, 'Koppel', 'Eingezäunte Weide beim Stall – dort grasen deine Pferde.')}
          <h3 class="sub">Deko aufstellen</h3>
          ${
            decos.length
              ? `<div class="furn-grid">${decos.map((d) => `<button class="furn" data-deco="${d.id}"><img src="${d.img}" alt="" /><b>${esc(d.name)}</b><small>${d.n}×</small></button>`).join('')}</div>`
              : '<p class="have">Deko kaufst du beim Händler-Boot am Steg.</p>'
          }
          <button class="pbtn small ghost" data-m="close">Zurück</button>
        </div>`;
      ui.appendChild(modal);
      modal.addEventListener('click', (e) => {
        const m = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-m]');
        if (e.target === modal || m?.dataset.m === 'close') modal.remove();
        const dk = (e.target as HTMLElement).closest<HTMLElement>('[data-deco]');
        if (dk) {
          modal.remove();
          on.place('deco', dk.dataset.deco);
          return;
        }
        if (m && !m.disabled && (m.dataset.m === 'house' || m.dataset.m === 'fire' || m.dataset.m === 'stable' || m.dataset.m === 'paddock')) {
          modal.remove();
          on.place(m.dataset.m);
        }
      });
    },
    setCoins(n) {
      bump($('.n-coins'), String(n));
    },
    openTrade(d0, act, onClose) {
      const modal = document.createElement('div');
      modal.className = 'modal';
      let tab: 'sell' | 'buy' = 'sell';
      let d = d0;
      const coin = `<img class="c" src="${icons.coin}" alt="" />`;
      const render = () => {
        const sell = d.sell
          .map(
            (it) => `<div class="trade-row"><img src="${it.img}" alt="" /><span><b>${esc(it.name)}</b><small>${d.have[it.id]} da · ${it.price}${coin} pro Stück</small></span>
              <button class="pbtn small" data-sell="${it.id}" data-n="1"${d.have[it.id] < 1 ? ' disabled' : ''}>1</button>
              <button class="pbtn small green" data-sell="${it.id}" data-n="${d.have[it.id]}"${d.have[it.id] < 1 ? ' disabled' : ''}>Alle</button></div>`,
          )
          .join('');
        const buyBtn = (id: string, price: number, extra = false) =>
          `<button class="pbtn small green" data-buy="${id}"${d.coins < price || extra ? ' disabled' : ''}>${price}${coin}</button>`;
        const buy = `
          <div class="trade-row"><img src="${d.seeds.img}" alt="" /><span><b>${d.seeds.n} Samen</b><small>Rüben-Samen im Päckchen</small></span>${buyBtn('seeds', d.seeds.price)}</div>
          <h3 class="sub">Seltene Pferde – heute an Bord</h3>
          ${d.horses
            .map(
              (h) => `<div class="trade-row horse"><img src="${h.img}" alt="" /><span><b>${esc(h.name)}</b><small>${esc(h.text)}</small></span>${buyBtn(`horse:${h.id}`, h.price, !!d.horseBlock)}</div>`,
            )
            .join('')}
          ${d.horseBlock ? `<p class="mine small">${esc(d.horseBlock)}</p>` : ''}
          <h3 class="sub">Deko</h3>
          ${d.deco
            .map((x) => `<div class="trade-row"><img src="${x.img}" alt="" /><span><b>${esc(x.name)}</b><small>${x.owned ? 'schon im Album' : 'neu fürs Album!'}</small></span>${buyBtn(`deco:${x.id}`, x.price)}</div>`)
            .join('')}`;
        modal.innerHTML = `<div class="panel build-panel stable-panel trade">
            <h2>Händler-Boot</h2>
            <p class="have">Kapitänin Frieda: „Ahoi! Was darf's sein?“</p>
            <p class="purse">${coin}<b>${d.coins}</b> Münzen</p>
            <div class="tabs"><button class="pbtn small${tab === 'sell' ? ' green' : ''}" data-tab="sell">Verkaufen</button><button class="pbtn small${tab === 'buy' ? ' green' : ''}" data-tab="buy">Kaufen</button></div>
            <div class="trade-list">${tab === 'sell' ? sell : buy}</div>
            <button class="pbtn small ghost" data-m="close">Tschüss!</button>
          </div>`;
      };
      render();
      ui.appendChild(modal);
      const close = () => {
        modal.remove();
        onClose();
      };
      modal.addEventListener('click', (e) => {
        const t = e.target as HTMLElement;
        if (e.target === modal || t.closest('[data-m=close]')) return close();
        const tb = t.closest<HTMLElement>('[data-tab]');
        if (tb) {
          tab = tb.dataset.tab as 'sell' | 'buy';
          return render();
        }
        const sb = t.closest<HTMLButtonElement>('[data-sell]');
        if (sb && !sb.disabled) return act.sell(sb.dataset.sell!, Number(sb.dataset.n));
        const bb = t.closest<HTMLButtonElement>('[data-buy]');
        if (bb && !bb.disabled) act.buy(bb.dataset.buy!);
      });
      return {
        update(nd) {
          d = nd;
          const sc = modal.querySelector('.trade-list')?.scrollTop ?? 0;
          render();
          const l = modal.querySelector('.trade-list');
          if (l) l.scrollTop = sc;
        },
      };
    },
    openAlbum(d) {
      const modal = document.createElement('div');
      modal.className = 'modal';
      modal.innerHTML = `<div class="panel build-panel stable-panel album-panel">
          <h2>Sammelalbum</h2>
          <p class="have"><b>${d.count}</b> von ${d.total} gesammelt</p>
          <div class="xpbar album-bar"><i style="width:${Math.round((d.count / d.total) * 100)}%"></i></div>
          <div class="rewards">${d.rewards.map((r) => `<span class="${r.got ? 'got' : ''}">${r.at}: ${r.coins}<img src="${icons.coin}" alt="" /></span>`).join('')}</div>
          ${d.sections
            .map(
              (s) => `<h3 class="sub">${esc(s.title)} · ${s.items.filter((i) => i.has).length}/${s.items.length}</h3>
            <div class="furn-grid album-grid">${s.items
              .map((i) => `<div class="furn${i.has ? '' : ' missing'}${i.rare ? ' rare' : ''}"><img src="${i.img}" alt="" /><b>${i.has ? esc(i.name) : '???'}</b></div>`)
              .join('')}</div>`,
            )
            .join('')}
          <button class="pbtn small ghost" data-m="close">Zurück</button>
        </div>`;
      ui.appendChild(modal);
      modal.addEventListener('click', (e) => {
        if (e.target === modal || (e.target as HTMLElement).closest('[data-m=close]')) modal.remove();
      });
    },
    toast(text) {
      const t = $('.toast');
      t.textContent = text;
      t.hidden = false;
      clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => (t.hidden = true), 1600 + text.length * 35);
    },
  };
  return hud;
}
