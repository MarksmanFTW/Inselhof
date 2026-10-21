/**
 * Menüs als HTML über dem Spielbild: Hauptmenü (Holzschild-Optik, Pixel-Schrift)
 * und der Aussehen-Editor mit großer, laufender Vorschau der Figur.
 */
import { Dir, FOOT_X, FOOT_Y, HAIR_COLORS, PANTS, PARTS, SHIRTS, SKINS, makeCharacter, randomLook, type Look } from './character';
import type { Save } from './save';

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
export function showMenu(save: Save, on: { play: () => void; look: () => void }) {
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
      <button class="pbtn green" data-act="play">${save.created ? 'Weiterspielen' : 'Spielen'}</button>
      <button class="pbtn" data-act="look">Aussehen</button>
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

/** Knopf im Spiel, der zurück ins Menü führt */
export function showHud(onMenu: () => void) {
  clear();
  ui.className = 'ui-hud';
  ui.innerHTML = `<button class="pbtn icon" data-act="menu" aria-label="Menü"><i></i><i></i><i></i></button>`;
  ui.querySelector('[data-act=menu]')!.addEventListener('click', onMenu);
}

