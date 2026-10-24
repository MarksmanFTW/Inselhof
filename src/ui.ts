/**
 * Menüs als HTML über dem Spielbild: Hauptmenü (Holzschild-Optik, Pixel-Schrift)
 * und der Aussehen-Editor mit großer, laufender Vorschau der Figur.
 */
import { Dir, HAIR_COLORS, PANTS, PARTS, SHIRTS, SKINS, randomLook, type Look } from './character';
import { Stage3D } from './three/stage';
import { prefs, setPrefs } from './audio';
import { levelOf } from './progress';
import { MAX_SLOTS, activeSlot, type Save, type Slot } from './save';

const ui = document.querySelector<HTMLElement>('#ui')!;

// ---------- Textgröße (Einstellungen) ----------
const TEXT_KEY = 'cozyisland.text';
export const TEXT_SIZES = [
  { v: 1, name: 'Normal' },
  { v: 1.15, name: 'Groß' },
  { v: 1.3, name: 'Sehr groß' },
];
export let textScale = (() => {
  try {
    const v = Number(localStorage.getItem(TEXT_KEY));
    return TEXT_SIZES.some((t) => t.v === v) ? v : 1;
  } catch {
    return 1;
  }
})();
export function setTextScale(v: number) {
  textScale = v;
  document.documentElement.style.setProperty('--fs', String(v));
  try {
    localStorage.setItem(TEXT_KEY, String(v));
  } catch {
    /* egal */
  }
}
document.documentElement.style.setProperty('--fs', String(textScale));

/** Einstellungen: Lautstärke, Textgröße, Grafik, als App installieren */
export function showSettings(o: {
  gfx: string;
  setGfx: (g: 'auto' | 'high' | 'low') => void;
  install: { kind: 'prompt' | 'ios' | 'done' | 'none'; run?: () => void };
  back: () => void;
}) {
  clear();
  ui.className = 'ui-custom';
  const vol = (on: boolean, v: number) => Math.round((on ? v : 0) * 100);
  const seg = (name: string, items: { id: string; label: string }[], cur: string) =>
    `<div class="seg" data-seg="${name}">${items.map((i) => `<button class="pbtn small${i.id === cur ? ' green' : ''}" data-v="${i.id}">${i.label}</button>`).join('')}</div>`;
  const render = () => {
    ui.innerHTML = `
    <div class="panel coop-panel settings-panel">
      <h2>Einstellungen</h2>
      <label class="set-row">Musik <input type="range" min="0" max="100" step="5" data-vol="music" value="${vol(prefs.music, prefs.musicVol)}" /></label>
      <label class="set-row">Töne <input type="range" min="0" max="100" step="5" data-vol="sound" value="${vol(prefs.sound, prefs.soundVol)}" /></label>
      <h3 class="sub">Textgröße</h3>
      ${seg('text', TEXT_SIZES.map((t) => ({ id: String(t.v), label: t.name })), String(textScale))}
      <h3 class="sub">Grafik</h3>
      ${seg('gfx', [{ id: 'auto', label: 'Auto' }, { id: 'high', label: 'Schön' }, { id: 'low', label: 'Sparsam' }], o.gfx)}
      <p class="tip">„Auto“ macht das Bild etwas gröber, wenn dein Handy ruckelt. „Sparsam“ schont den Akku.</p>
      <h3 class="sub">Als App</h3>
      ${
        o.install.kind === 'done'
          ? '<p class="tip">Cozy Island läuft schon als App – schön!</p>'
          : o.install.kind === 'prompt'
            ? '<button class="pbtn blue" data-act="install">Als App installieren</button><p class="tip">Dann hast du Cozy Island mit eigenem Symbol am Startbildschirm, im Vollbild.</p>'
            : o.install.kind === 'ios'
              ? '<p class="tip install-ios">Im Safari unten auf <b>Teilen</b> (Viereck mit Pfeil) tippen, dann <b>„Zum Home-Bildschirm“</b>. Schon hast du Cozy Island als App mit eigenem Symbol.</p>'
              : '<p class="tip">Im Browser-Menü (⋮) auf <b>„App installieren“</b> oder <b>„Zum Startbildschirm hinzufügen“</b> tippen.</p>'
      }
      <button class="pbtn small ghost" data-act="back">Zurück</button>
    </div>`;
  };
  render();
  ui.addEventListener('input', onInput);
  function onInput(e: Event) {
    const t = e.target as HTMLInputElement;
    const k = t.dataset.vol as 'music' | 'sound' | undefined;
    if (!k) return;
    const v = Number(t.value) / 100;
    setPrefs(k === 'music' ? { music: v > 0, musicVol: v || prefs.musicVol } : { sound: v > 0, soundVol: v || prefs.soundVol });
  }
  ui.addEventListener('click', onClick);
  function onClick(e: Event) {
    const t = e.target as HTMLElement;
    if (t.closest('[data-act=back]')) {
      ui.removeEventListener('input', onInput);
      ui.removeEventListener('click', onClick);
      return o.back();
    }
    if (t.closest('[data-act=install]')) return o.install.run?.();
    const b = t.closest<HTMLElement>('[data-v]');
    const sg = t.closest<HTMLElement>('[data-seg]')?.dataset.seg;
    if (!b || !sg) return;
    if (sg === 'text') setTextScale(Number(b.dataset.v));
    if (sg === 'gfx') {
      o.gfx = b.dataset.v!;
      o.setGfx(o.gfx as 'auto' | 'high' | 'low');
    }
    render();
  }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

let stage: Stage3D | null = null;
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
    settings: () => void;
    play: () => void;
    slots: () => void;
    look: () => void;
    coop: () => void;
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
      <button class="pbtn blue" data-act="coop">Gemeinsam spielen</button>
      <button class="pbtn small ghost" data-act="settings">Einstellungen</button>
    </div>
    <p class="foot">Bauen, farmen, Pferde lieben – allein oder zu zweit</p>
    </div>`;
  stage = new Stage3D(3);
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
  ui.querySelector('[data-act=settings]')!.addEventListener('click', on.settings);
  ui.querySelector('[data-act=coop]')?.addEventListener('click', on.coop);
  for (const b of ui.querySelectorAll<HTMLElement>('[data-slot]')) b.addEventListener('click', () => on.playSlot?.(b.dataset.slot!));
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

/** Gemeinsam spielen: Insel-Link schicken, gemeinsame Inseln öffnen */
export function showCoop(
  on: { island: () => Promise<string>; back: () => void; play: (id: string) => void },
  info: { title: string; sharedWith?: string; shared: { id: string; title: string; with: string }[] },
) {
  clear();
  ui.className = 'ui-custom';
  ui.innerHTML = `
    <div class="panel coop-panel">
      <h2>Gemeinsam spielen</h2>
      <ol class="steps">
        <li>Schick deinem Freund den <b>Insel-Link</b>.</li>
        <li>Öffnet er ihn, steht die Insel bei euch beiden unter „Spielstände“ – mit <b>Koop</b>.</li>
        <li>Jeder kann <b>jederzeit</b> darauf weiterspielen, auch wenn der andere offline ist. Alles gleicht sich von selbst an.</li>
        <li>Seid ihr gleichzeitig auf der Insel, <b>seht ihr euch</b> und macht zusammen weiter.</li>
      </ol>
      <button class="pbtn green" data-act="island">Insel-Link schicken<small class="sub">${esc(info.title)}</small></button>
      <p class="tip island-tip">${info.sharedWith ? `„${esc(info.title)}“ ist schon eine gemeinsame Insel (mit ${esc(info.sharedWith)}).` : 'Ihr teilt Holz, Samen, Rüben, Häuser und Pferde.'}</p>
      ${
        info.shared.length
          ? `<h3 class="sub">Eure gemeinsamen Inseln</h3>${info.shared.map((x) => `<button class="pbtn blue small" data-slot="${esc(x.id)}">${esc(x.title)}<small class="sub">mit ${esc(x.with)}</small></button>`).join('')}`
          : ''
      }
      <button class="pbtn small ghost" data-act="back">Zurück</button>
    </div>`;
  const ib = ui.querySelector<HTMLButtonElement>('[data-act=island]')!;
  ib.addEventListener('click', () =>
    void on.island().then((t) => {
      if (t) ui.querySelector('.island-tip')!.textContent = t;
    }),
  );
  for (const b of ui.querySelectorAll<HTMLElement>('[data-slot]')) b.addEventListener('click', () => on.play(b.dataset.slot!));
  ui.querySelector('[data-act=back]')!.addEventListener('click', on.back);
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
  stage = new Stage3D(6);
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
  /** Lieblingspferd rufen */
  call: () => void;
  /** essen: Rübe (roh), Ofenrübe, Apfel, Beeren */
  eat: (what: 'raw' | 'cooked' | 'apple' | 'berry' | 'grilled') => void;
  /** Basteln-Fenster öffnen */
  craft: () => void;
  /** Rucksack öffnen */
  bag: () => void;
  /** Insel-Projekt öffnen */
  project: () => void;
  /** Bestellbrett öffnen */
  orders: () => void;
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
  stick: string;
  stone: string;
  craft: string;
  bag: string;
  board: string;
  apple: string;
  berry: string;
  rod: string;
  grilled: string;
}

/** Rucksack-Fenster: Abschnitte mit Gegenständen; Antippen zeigt Infos und Knöpfe */
export interface InvItem {
  id: string;
  name: string;
  img: string;
  /** Anzahl (fehlt = Werkzeug, ohne Zahl) */
  n?: number;
  text: string;
  acts: { id: string; label: string }[];
  /** gerade in der Hand */
  on?: boolean;
}
export interface InvData {
  head: string;
  note?: string;
  sections: { title: string; empty?: string; items: InvItem[] }[];
}

/** Zutat/Ware mit Bild, gebraucht und vorhanden */
export interface Need {
  name: string;
  img: string;
  n: number;
  have: number;
}
/** Koch-Fenster am Lagerfeuer */
export interface KitchenData {
  list: { id: string; name: string; text: string; img: string; energy: number; price: number; need: Need[]; known: boolean; have: number }[];
}
/** Bestellbrett */
export interface OrdersData {
  day: string;
  list: { who: string; size: string; need: Need[]; coins: number; extra?: { img: string; text: string }; done: boolean }[];
}

/** Insel-Projekt-Fenster */
export interface ProjData {
  title: string;
  /** „Projekt 2 von 5“ */
  step: string;
  text: string;
  reward: string;
  rows: { id: string; name: string; img: string; got: number; need: number; have: number }[];
  steps: { name: string; state: 'done' | 'now' | 'next' }[];
  /** alle fertig */
  done: boolean;
}

/** Basteln-Fenster */
export interface CraftData {
  have: { sticks: number; stones: number; wood: number };
  recipes: { id: string; name: string; text: string; img: string; sticks: number; stones: number; wood: number; owned: boolean }[];
}

export interface TradeData {
  coins: number;
  have: Record<string, number>;
  sell: { id: string; name: string; price: number; img: string }[];
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
  /** Schmuck: was gerade dran ist und was es gibt */
  acc: string;
  accs: { id: string; name: string; hearts: number; open: boolean; img: string }[];
  fav: boolean;
}

export interface Hud {
  setInv(wood: number, turnips: number, meals: number): void;
  /** Angeln: es hat angebissen → grüner Knopf pulsiert */
  setBite(on: boolean): void;
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
  openHorse(h: HorseCard, have: { turnips: number; hay: number; treatImg?: string }, hearts: [string, string], on: { feed: () => void; treat: () => void; brush: () => void; ride: () => void; foal: () => void; pet: () => void; fav: () => void; dress: (id: string) => void }): void;
  /** „Rufen“-Knopf fürs Lieblingspferd */
  setCall(icon: string | null): void;
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
  /** Kochen am Lagerfeuer; update() zeichnet neu, solange offen */
  openKitchen(d: KitchenData, cook: (id: string) => void): { update(d: KitchenData): void };
  /** Bestellbrett; update() zeichnet neu, solange offen */
  openOrders(d: OrdersData, deliver: (i: number) => void): { update(d: OrdersData): void };
  /** Bestellbrett-Knopf: so viele könnte man gerade liefern */
  setOrders(ready: number): void;
  /** Insel-Projekt-Anzeige unter der Aufgabe (null = keine) */
  setProject(text: string | null, progress: number): void;
  /** Insel-Projekt: abgeben, Baustelle zeigen */
  openProject(d: ProjData, on: { give: (item: string) => void; show: () => void }): { update(d: ProjData): void };
  /** Rucksack; update() zeichnet neu, solange offen */
  openInventory(d: InvData, act: (item: string, action: string) => void): { update(d: InvData): void; close(): void };
  /** Basteln; update() zeichnet neu, solange offen */
  openCraft(d: CraftData, make: (id: string) => void): { update(d: CraftData): void };
  /** welche Werkzeuge schon gebastelt sind (die anderen sind gesperrt) */
  setOwned(tools: string[]): void;
  /** Knopf hüpfen lassen (Tutorial) */
  nudge(what: 'craft' | null): void;
  /** Begrüßung mit Schritten (Tutorial) */
  intro(o: { title: string; text: string; steps: { img: string; text: string }[]; ok: string }, done: () => void): void;
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
      <button class="r bagbtn" data-act="bag" aria-label="Rucksack"><img src="${icons.bag}" alt="" /></button>
      <button class="r bagbtn boardbtn" data-act="orders" aria-label="Bestellbrett"><img src="${icons.board}" alt="" /><em hidden></em></button>
    </div>
    <button class="goal" hidden aria-label="Aufgabe"></button>
    <button class="proj-chip" hidden aria-label="Insel-Projekt"><img src="${icons.craft}" alt="" /><span></span><i><b></b></i></button>
    <p class="coop-chip" hidden></p>
    <div class="hotbar panel">
      ${slot('axe', icons.axe)}${slot('hoe', icons.hoe)}${slot('seeds', icons.seeds)}${slot('water', icons.bucket)}${slot('scythe', icons.scythe)}
    </div>
    <div class="actions">
      <div class="act-row">
        <button class="pbtn craft" data-act="craft" aria-label="Basteln"><img src="${icons.craft}" alt="" /><span>Basteln</span></button>
        <button class="pbtn album" data-act="album" aria-label="Sammelalbum"><img src="${icons.book}" alt="" /><span>Album</span></button>
        <button class="pbtn build" data-act="build" aria-label="Bauen"><img src="${icons.house}" alt="" /><span>Bauen</span></button>
        <button class="pbtn call" data-act="call" aria-label="Lieblingspferd rufen" hidden><img src="" alt="" /><span>Rufen</span></button>
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
  for (const b of ui.querySelectorAll<HTMLElement>('[data-eat]')) b.addEventListener('click', () => on.eat(b.dataset.eat as 'raw' | 'cooked' | 'apple' | 'berry' | 'grilled'));
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
    // Zeitgeber kann noch laufen, wenn die Anzeige schon weg ist (Menü)
    if (!g) return;
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
  $('[data-act=craft]').addEventListener('click', on.craft);
  $('[data-act=bag]').addEventListener('click', on.bag);
  $('.proj-chip').addEventListener('click', on.project);
  $('[data-act=orders]').addEventListener('click', on.orders);
  $('[data-act=call]').addEventListener('click', on.call);
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
    setBite(onB) {
      use.classList.toggle('bite', onB);
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
      $('[data-act=craft]').hidden = onI;
    },
    setOwned(tools) {
      for (const b of ui.querySelectorAll<HTMLElement>('[data-tool]')) {
        const t = b.dataset.tool!;
        const locked = t !== 'seeds' && !tools.includes(t);
        b.classList.toggle('locked', locked);
        b.setAttribute('aria-label', `${TOOL_NAMES[t as ToolId]}${locked ? ' (noch nicht gebastelt)' : ''}`);
      }
    },
    intro(o, done) {
      const modal = document.createElement('div');
      modal.className = 'modal';
      modal.innerHTML = `<div class="panel build-panel intro-panel">
          <h2>${esc(o.title)}</h2>
          <p class="have">${esc(o.text)}</p>
          <ol class="intro-steps">${o.steps.map((st) => `<li><img src="${st.img}" alt="" /><span>${esc(st.text)}</span></li>`).join('')}</ol>
          <button class="pbtn green" data-m="ok">${esc(o.ok)}</button>
        </div>`;
      ui.appendChild(modal);
      modal.addEventListener('click', (e) => {
        if (!(e.target as HTMLElement).closest('[data-m=ok]')) return;
        modal.remove();
        done();
      });
    },
    nudge(what) {
      $('[data-act=craft]').classList.toggle('nudge', what === 'craft');
    },
    setOrders(ready) {
      const b = $('[data-act=orders] em');
      b.hidden = ready <= 0;
      b.textContent = String(ready);
    },
    openKitchen(d, cookIt) {
      const modal = document.createElement('div');
      modal.className = 'modal';
      const need = (x: Need) => `<span class="cost${x.have < x.n ? ' miss' : ''}" title="${esc(x.name)}"><img src="${x.img}" alt="" />${x.n}</span>`;
      const draw = (c: KitchenData) => {
        modal.innerHTML = `<div class="panel build-panel craft-panel kitchen-panel">
          <h2>Kochen</h2>
          <p class="have">Am Lagerfeuer – Gerichte geben viel Kraft und bringen gutes Geld.</p>
          <div class="craft-list">${c.list
            .map((r) => {
              if (!r.known)
                return `<div class="craft-row locked"><img class="tool" src="${r.img}" alt="" /><div class="what"><b>???</b><small>Neues Rezept – gibt es am Bestellbrett.</small></div></div>`;
              const can = r.need.every((x) => x.have >= x.n);
              return `<div class="craft-row">
                <img class="tool" src="${r.img}" alt="" />
                <div class="what"><b>${esc(r.name)}${r.have ? ` <small class="cnt">(${r.have} da)</small>` : ''}</b><small>+${r.energy} Kraft · Händler ${r.price}</small>
                  <div class="costs">${r.need.map(need).join('')}</div>
                </div>
                <button class="pbtn green small" data-k="${esc(r.id)}"${can ? '' : ' disabled'}>Kochen</button>
              </div>`;
            })
            .join('')}</div>
          <button class="pbtn small ghost" data-m="close">Zurück</button>
        </div>`;
      };
      draw(d);
      ui.appendChild(modal);
      modal.addEventListener('click', (e) => {
        const t = e.target as HTMLElement;
        if (e.target === modal || t.closest('[data-m=close]')) return modal.remove();
        const b = t.closest<HTMLButtonElement>('[data-k]');
        if (b && !b.disabled) cookIt(b.dataset.k!);
      });
      return {
        update: (c: KitchenData) => {
          if (!modal.isConnected) return;
          const p = modal.querySelector('.kitchen-panel');
          const sc = p?.scrollTop ?? 0;
          draw(c);
          const p2 = modal.querySelector('.kitchen-panel');
          if (p2) p2.scrollTop = sc;
        },
      };
    },
    openOrders(d, deliverIt) {
      const modal = document.createElement('div');
      modal.className = 'modal';
      const need = (x: Need) => `<span class="cost${x.have < x.n ? ' miss' : ''}" title="${esc(x.name)}"><img src="${x.img}" alt="" />${x.have >= x.n ? x.n : `${x.have}/${x.n}`}</span>`;
      const draw = (c: OrdersData) => {
        modal.innerHTML = `<div class="panel build-panel craft-panel orders-panel">
          <h2>Bestellbrett</h2>
          <p class="have">${esc(c.day)} · jeden Morgen gibt es neue Bestellungen</p>
          <div class="craft-list">${c.list
            .map((o, i) => {
              const can = !o.done && o.need.every((x) => x.have >= x.n);
              return `<div class="craft-row order${o.done ? ' owned' : ''}">
                <div class="what"><b>${esc(o.who)} <small class="cnt">· ${esc(o.size)}</small></b>
                  <div class="costs">${o.need.map(need).join('')}</div>
                  <small class="reward">Belohnung: ${o.coins} Münzen${o.extra ? ` + ${esc(o.extra.text)}` : ''}</small>
                </div>
                ${o.extra ? `<img class="tool extra" src="${o.extra.img}" alt="" />` : ''}
                ${o.done ? '<span class="done">Geliefert ✓</span>' : `<button class="pbtn green small" data-o="${i}"${can ? '' : ' disabled'}>Liefern</button>`}
              </div>`;
            })
            .join('')}</div>
          <button class="pbtn small ghost" data-m="close">Zurück</button>
        </div>`;
      };
      draw(d);
      ui.appendChild(modal);
      modal.addEventListener('click', (e) => {
        const t = e.target as HTMLElement;
        if (e.target === modal || t.closest('[data-m=close]')) return modal.remove();
        const b = t.closest<HTMLButtonElement>('[data-o]');
        if (b && !b.disabled) deliverIt(Number(b.dataset.o));
      });
      return { update: (c: OrdersData) => modal.isConnected && draw(c) };
    },
    setProject(text, progress) {
      const c = $('.proj-chip');
      c.hidden = !text;
      if (!text) return;
      const sp = c.querySelector('span')!;
      if (sp.textContent !== text) sp.textContent = text;
      c.querySelector<HTMLElement>('i b')!.style.width = `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%`;
    },
    openProject(d, on2) {
      const modal = document.createElement('div');
      modal.className = 'modal';
      const draw = (c: ProjData) => {
        modal.innerHTML = `<div class="panel build-panel proj-panel">
          <h2>${c.done ? 'Alles gebaut!' : 'Insel-Projekt'}</h2>
          ${c.done ? '' : `<p class="proj-name"><b>${esc(c.title)}</b> · ${esc(c.step)}</p>`}
          <p class="have">${esc(c.text)}</p>
          ${
            c.done
              ? ''
              : `<div class="proj-rows">${c.rows
                  .map((r) => {
                    const left = r.need - r.got;
                    const can = Math.min(left, r.have);
                    return `<div class="proj-row${left <= 0 ? ' full' : ''}">
                <img src="${r.img}" alt="" />
                <div class="what"><b>${esc(r.name)}</b><div class="xpbar"><i style="width:${Math.round((r.got / r.need) * 100)}%"></i></div><small>${r.got}/${r.need}${left > 0 ? ` · du hast ${r.have}` : ' · fertig'}</small></div>
                ${left > 0 ? `<button class="pbtn small green" data-g="${esc(r.id)}"${can > 0 ? '' : ' disabled'}>${can > 0 ? `+${can}` : 'fehlt'}</button>` : '<span class="ok">✓</span>'}
              </div>`;
                  })
                  .join('')}</div>
          <p class="mine small proj-reward"><b>Wenn es fertig ist:</b> ${esc(c.reward)}</p>`
          }
          <div class="proj-steps">${c.steps.map((st) => `<span class="${st.state}">${st.state === 'done' ? '✓ ' : ''}${st.state === 'next' ? '???' : esc(st.name)}</span>`).join('')}</div>
          <div class="two">
            <button class="pbtn small ghost" data-m="close">Zurück</button>
            ${c.done ? '' : '<button class="pbtn small blue" data-m="show">Baustelle zeigen</button>'}
          </div>
        </div>`;
      };
      draw(d);
      ui.appendChild(modal);
      modal.addEventListener('click', (e) => {
        const t = e.target as HTMLElement;
        if (e.target === modal || t.closest('[data-m=close]')) return modal.remove();
        if (t.closest('[data-m=show]')) {
          modal.remove();
          return on2.show();
        }
        const g = t.closest<HTMLButtonElement>('[data-g]');
        if (g && !g.disabled) on2.give(g.dataset.g!);
      });
      return {
        update: (c: ProjData) => {
          if (!modal.isConnected) return;
          const p = modal.querySelector('.proj-panel');
          const scroll = p?.scrollTop ?? 0;
          draw(c);
          const p2 = modal.querySelector('.proj-panel');
          if (p2) p2.scrollTop = scroll;
        },
      };
    },
    openInventory(d, act) {
      const modal = document.createElement('div');
      modal.className = 'modal';
      let sel = '';
      const draw = (c: InvData) => {
        const all = c.sections.flatMap((x) => x.items);
        if (!all.some((i) => i.id === sel)) sel = all[0]?.id ?? '';
        const it = all.find((i) => i.id === sel);
        modal.innerHTML = `<div class="inv-wrap"><div class="panel build-panel inv-panel">
          <h2>Rucksack</h2>
          <p class="have">${esc(c.head)}</p>
          ${c.note ? `<p class="mine small inv-note">${esc(c.note)}</p>` : ''}
          ${c.sections
            .map(
              (sec) => `<h3 class="sub">${esc(sec.title)}</h3>
            ${
              sec.items.length
                ? `<div class="inv-grid">${sec.items
                    .map(
                      (i) => `<button class="inv-slot${i.id === sel ? ' sel' : ''}${i.on ? ' on' : ''}" data-i="${esc(i.id)}" aria-label="${esc(i.name)}${i.n !== undefined ? ` (${i.n})` : ''}">
                <img src="${i.img}" alt="" />${i.n !== undefined ? `<b>${i.n}</b>` : ''}</button>`,
                    )
                    .join('')}</div>`
                : `<p class="mine small">${esc(sec.empty ?? 'Noch nichts')}</p>`
            }`,
            )
            .join('')}
          <button class="pbtn small ghost" data-m="close">Zurück</button>
        </div>
        ${
          it
            ? `<div class="panel inv-detail">
          <img src="${it.img}" alt="" />
          <div class="what"><b>${esc(it.name)}${it.n !== undefined ? ` · ${it.n}` : ''}</b><small>${esc(it.text)}</small>
            ${it.acts.length ? `<div class="btns">${it.acts.map((a) => `<button class="pbtn small green" data-a="${esc(a.id)}">${esc(a.label)}</button>`).join('')}</div>` : ''}
          </div>
        </div>`
            : ''
        }</div>`;
      };
      let cur = d;
      draw(cur);
      ui.appendChild(modal);
      modal.addEventListener('click', (e) => {
        const t = e.target as HTMLElement;
        if (e.target === modal || t.closest('[data-m=close]')) return modal.remove();
        const slot = t.closest<HTMLElement>('[data-i]');
        if (slot) {
          sel = slot.dataset.i!;
          const scroll = modal.querySelector('.inv-panel')!.scrollTop;
          draw(cur);
          modal.querySelector('.inv-panel')!.scrollTop = scroll;
          return;
        }
        const a = t.closest<HTMLElement>('[data-a]');
        if (a && sel) act(sel, a.dataset.a!);
      });
      return {
        update: (c: InvData) => {
          if (!modal.isConnected) return;
          cur = c;
          const scroll = modal.querySelector('.inv-panel')?.scrollTop ?? 0;
          draw(c);
          const p = modal.querySelector('.inv-panel');
          if (p) p.scrollTop = scroll;
        },
        close: () => modal.remove(),
      };
    },
    openCraft(d, make) {
      const modal = document.createElement('div');
      modal.className = 'modal';
      const cost = (n: number, img: string, have: number, label: string) =>
        n ? `<span class="cost${have < n ? ' miss' : ''}" title="${label}"><img src="${img}" alt="" />${n}</span>` : '';
      const draw = (c: CraftData) => {
        modal.innerHTML = `<div class="panel build-panel craft-panel">
          <h2>Basteln</h2>
          <p class="have craft-have">Du hast
            <span><img src="${icons.stick}" alt="" /><b>${c.have.sticks}</b> Stöcke</span>
            <span><img src="${icons.stone}" alt="" /><b>${c.have.stones}</b> Steine</span>
            <span><img src="${icons.log}" alt="" /><b>${c.have.wood}</b> Holz</span>
          </p>
          <div class="craft-list">${c.recipes
            .map((r) => {
              const can = !r.owned && c.have.sticks >= r.sticks && c.have.stones >= r.stones && c.have.wood >= r.wood;
              return `<div class="craft-row${r.owned ? ' owned' : ''}">
                <img class="tool" src="${r.img}" alt="" />
                <div class="what"><b>${esc(r.name)}</b><small>${esc(r.text)}</small>
                  <div class="costs">${cost(r.sticks, icons.stick, c.have.sticks, 'Stöcke')}${cost(r.stones, icons.stone, c.have.stones, 'Steine')}${cost(r.wood, icons.log, c.have.wood, 'Holz')}</div>
                </div>
                ${r.owned ? '<span class="done">Hast du</span>' : `<button class="pbtn green small" data-c="${r.id}"${can ? '' : ' disabled'}>Basteln</button>`}
              </div>`;
            })
            .join('')}</div>
          <p class="mine small">Stöcke liegen auf der Wiese, Steine im Sand am Strand – nach einer Weile liegen neue da.</p>
          <button class="pbtn small ghost" data-m="close">Zurück</button>
        </div>`;
      };
      draw(d);
      ui.appendChild(modal);
      modal.addEventListener('click', (e) => {
        const t = e.target as HTMLElement;
        if (e.target === modal || t.closest('[data-m=close]')) return modal.remove();
        const b = t.closest<HTMLButtonElement>('[data-c]');
        if (b && !b.disabled) make(b.dataset.c!);
      });
      return { update: (c: CraftData) => modal.isConnected && draw(c) };
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
          <div class="two pet-row">
            ${btn('pet', 'Streicheln', false, ' pink')}
            ${btn('fav', h.fav ? 'Liebling!' : 'Als Liebling', false, h.fav ? ' fav-on' : '')}
          </div>
          <div class="care">
            ${btn('feed', h.fed ? 'Satt' : `<img src="${icons.hay}" alt="" />Heu · ${have.hay}`, h.fed || have.hay <= 0)}
            ${btn('treat', h.treat ? 'Lecker!' : `<img src="${have.treatImg ?? icons.turnip}" alt="" />Leckerli`, h.treat || have.turnips <= 0)}
            ${btn('brush', h.brushed ? 'Glänzt' : 'Bürsten', h.brushed)}
          </div>
          <p class="mine small">Füttern, Leckerli und Bürsten geht je einmal am Tag.</p>
          <h3 class="sub">Schmuck</h3>
          <div class="acc-grid">
            <button class="acc${h.acc ? '' : ' on'}" data-acc=""><b>ohne</b></button>
            ${h.accs
              .map(
                (a) =>
                  `<button class="acc${h.acc === a.id ? ' on' : ''}${a.open ? '' : ' locked'}" data-acc="${a.id}"${a.open ? '' : ' disabled'}><img src="${a.img}" alt="" /><b>${esc(a.name)}</b>${a.open ? '' : `<small>ab ${a.hearts} Herzen</small>`}</button>`,
              )
              .join('')}
          </div>
          ${h.foal ? '' : `<div class="${h.showFoal ? 'two' : ''}">${h.showFoal ? btn('foal', h.foalBlock ? 'Fohlen?' : 'Fohlen · 5 Heu', !!h.foalBlock) : ''}${btn('ride', 'Reiten', !h.canRide, ' green')}</div>`}
          ${h.showFoal && h.foalBlock ? `<p class="mine small">${esc(h.foalBlock)}</p>` : ''}
          <button class="pbtn small ghost" data-m="close">Zurück</button>
        </div>`;
      ui.appendChild(modal);
      modal.addEventListener('click', (e) => {
        const t = e.target as HTMLElement;
        if (e.target === modal || t.closest('[data-m=close]')) return modal.remove();
        const ac = t.closest<HTMLButtonElement>('[data-acc]');
        if (ac && !ac.disabled) {
          modal.remove();
          return act.dress(ac.dataset.acc!);
        }
        const m = t.closest<HTMLButtonElement>('[data-m]');
        if (!m || m.disabled) return;
        modal.remove();
        const k = m.dataset.m as 'feed' | 'treat' | 'brush' | 'ride' | 'foal' | 'pet' | 'fav';
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
    setCall(icon) {
      const b = $<HTMLButtonElement>('[data-act=call]');
      b.hidden = !icon;
      const img = b.querySelector('img')!;
      if (icon && img.getAttribute('src') !== icon) img.src = icon;
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
