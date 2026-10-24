/**
 * Basteln: Zu Beginn hat man nichts. Stöcke (Wiese) und Steine (Strand) aufsammeln
 * und daraus die ersten Werkzeuge bauen; später kommen Holz-Werkzeuge dazu.
 * Werkzeuge gehören der Insel (bei gemeinsamen Inseln teilt man sie).
 */

/** Werkzeuge, die man besitzen kann ('water' = Kübel zum Gießen, 'rod' = Angel) */
export type ToolKind = 'axe' | 'hoe' | 'water' | 'scythe' | 'rod';
export const ALL_TOOLS: ToolKind[] = ['axe', 'hoe', 'water', 'scythe', 'rod'];
/** so viele hatte man schon vor dem Tutorial (die Angel kam danach) */
const OLD_TOOLS: ToolKind[] = ['axe', 'hoe', 'water', 'scythe'];
export const isTool = (x: unknown): x is ToolKind => ALL_TOOLS.includes(x as ToolKind);

export interface Recipe {
  id: ToolKind;
  name: string;
  text: string;
  sticks: number;
  stones: number;
  wood: number;
}
export const RECIPES: Recipe[] = [
  { id: 'axe', name: 'Steinaxt', text: 'Bäume fällen', sticks: 2, stones: 2, wood: 0 },
  { id: 'hoe', name: 'Hacke', text: 'Felder anlegen', sticks: 2, stones: 1, wood: 0 },
  { id: 'water', name: 'Holzkübel', text: 'Wasser schöpfen und gießen', sticks: 0, stones: 0, wood: 4 },
  { id: 'scythe', name: 'Sense', text: 'Wiese mähen für Heu', sticks: 2, stones: 2, wood: 2 },
  { id: 'rod', name: 'Angel', text: 'Am Wasser Fische fangen', sticks: 3, stones: 1, wood: 0 },
];
export const recipeOf = (id: string) => RECIPES.find((r) => r.id === id);

/** was beim Aktions-Knopf fehlt, wenn das Werkzeug noch nicht gebastelt ist */
export const TOOL_NAME: Record<ToolKind, string> = { axe: 'Axt', hoe: 'Hacke', water: 'Holzkübel', scythe: 'Sense', rod: 'Angel' };

/** aufgesammelte Stöcke/Steine liegen nach so langer Zeit wieder da (ms) */
export const PICK_REGROW_MS = 150_000;

// ---------- Rucksack: gehört dem Spieler (jeder macht sein eigenes Tutorial) ----------

/** Stöcke, Steine und gebastelte Werkzeuge eines Spielers auf einer Insel */
export interface Bag {
  sticks: number;
  stones: number;
  tools: ToolKind[];
  /** insgesamt aufgehoben (fürs Tutorial) */
  got: { sticks: number; stones: number };
  /** so viele Tutorial-Schritte sind geschafft (3 = fertig) */
  tut: number;
  /** Belohnung fürs Tutorial abgeholt */
  paid?: boolean;
  /** Verbesserungen: Werkzeug/Schuhe/Hufeisen → Stufe (1 Eisen, 2 Gold), siehe upgrades.ts */
  up?: Partial<Record<ToolKind | 'shoes' | 'hooves', number>>;
}
export const newBag = (): Bag => ({ sticks: 0, stones: 0, tools: [], got: { sticks: 0, stones: 0 }, tut: 0 });
/** Spieler, die schon vor dem Tutorial gespielt haben: alles da, Tutorial erledigt */
export const fullBag = (): Bag => ({ ...newBag(), tools: [...OLD_TOOLS], tut: TUTORIAL.length, paid: true });

const num = (v: unknown) => (typeof v === 'number' && v >= 0 ? Math.floor(v) : 0);
export function cleanBag(raw: Partial<Bag> | undefined): Bag {
  const b = newBag();
  if (!raw || typeof raw !== 'object') return b;
  b.sticks = num(raw.sticks);
  b.stones = num(raw.stones);
  b.tools = ALL_TOOLS.filter((t) => Array.isArray(raw.tools) && raw.tools.includes(t));
  b.got = { sticks: num(raw.got?.sticks), stones: num(raw.got?.stones) };
  b.tut = Math.min(TUTORIAL.length, num(raw.tut));
  if (raw.paid) b.paid = true;
  const up: NonNullable<Bag['up']> = {};
  for (const k of [...ALL_TOOLS, 'shoes', 'hooves'] as const) {
    const v = num(raw.up?.[k]);
    if (v) up[k] = Math.min(2, v);
  }
  if (Object.keys(up).length) b.up = up;
  return b;
}

/** Tutorial: drei Schritte, danach 3 Rübensamen für die Insel */
export const TUTORIAL: { text: string; hint: string; goal: number; have: (b: Bag) => number }[] = [
  { text: 'Sammle 4 Stöcke', hint: 'Stöcke liegen auf der Wiese, oft unter Bäumen. Geh hin und tipp auf den grünen Knopf.', goal: 4, have: (b) => b.got.sticks },
  { text: 'Sammle 3 Steine am Strand', hint: 'Graue Steine liegen unten im Sand am Strand.', goal: 3, have: (b) => b.got.stones },
  { text: 'Bastle eine Axt und eine Hacke', hint: 'Tipp auf „Basteln“. Axt: 2 Stöcke + 2 Steine. Hacke: 2 Stöcke + 1 Stein.', goal: 2, have: (b) => (b.tools.includes('axe') ? 1 : 0) + (b.tools.includes('hoe') ? 1 : 0) },
];
export const TUT_SEEDS = 3;

/** Stock/Stein in den Rucksack */
export function bagPick(b: Bag, kind: 'stick' | 'stone') {
  if (kind === 'stick') {
    b.sticks++;
    b.got.sticks++;
  } else {
    b.stones++;
    b.got.stones++;
  }
}
/** Kann der Spieler das basteln? (Holz kommt aus dem Insel-Vorrat) */
export function craftBlock(b: Bag, id: string, wood: number): string | null {
  const r = recipeOf(id);
  if (!r) return 'Gibt es nicht';
  if (b.tools.includes(r.id)) return `${r.name} hast du schon`;
  if (b.sticks < r.sticks || b.stones < r.stones || wood < r.wood) return 'Dafür fehlt dir noch etwas';
  return null;
}
/** Gebastelt: Stöcke/Steine abziehen, Werkzeug dazu (das Holz zieht die Insel-Aktion ab) */
export function bagCraft(b: Bag, id: ToolKind) {
  const r = recipeOf(id)!;
  b.sticks -= r.sticks;
  b.stones -= r.stones;
  if (!b.tools.includes(id)) b.tools.push(id);
}
/**
 * Neu geschaffte Tutorial-Schritte (in Reihenfolge) zählen; liefert die Nummern
 * der gerade fertig gewordenen Schritte. Bei 3 gibt es die Belohnung.
 */
export function tutAdvance(b: Bag): number[] {
  const done: number[] = [];
  while (b.tut < TUTORIAL.length && TUTORIAL[b.tut].have(b) >= TUTORIAL[b.tut].goal) done.push(b.tut++);
  return done;
}
