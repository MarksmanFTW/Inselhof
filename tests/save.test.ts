import { beforeEach, describe, expect, it } from 'vitest';
import { MAX_SLOTS, activeSlot, addSlot, loadSave, removeSlot, writeSave } from '../src/save';

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  } as Storage;
});

describe('Spielstände', () => {
  it('alter Spielstand wird zu „Meine Insel“', () => {
    store.set('cozyisland.save', JSON.stringify({ name: 'Marcel', created: true, world: { wood: 7 }, pos: { x: 1, y: 2 } }));
    const s = loadSave();
    expect(s.slots).toHaveLength(1);
    expect(activeSlot(s).title).toBe('Meine Insel');
    expect(activeSlot(s).world?.wood).toBe(7);
    expect(s.name).toBe('Marcel');
  });
  it('neu anlegen, begrenzen, löschen, speichern', () => {
    const s = loadSave();
    expect(s.slots).toHaveLength(1);
    while (addSlot(s));
    expect(s.slots).toHaveLength(MAX_SLOTS);
    expect(new Set(s.slots.map((x) => x.title)).size).toBe(MAX_SLOTS);
    const first = s.slots[0].id;
    s.active = first;
    removeSlot(s, first);
    expect(s.slots.find((x) => x.id === first)).toBeUndefined();
    expect(activeSlot(s).id).toBe(s.slots[0].id);
    writeSave(s);
    expect(loadSave().slots).toHaveLength(MAX_SLOTS - 1);
  });
  it('Rucksack: neue Inseln leer, alte Stände haben alles, der kurze Zwischenstand zieht um', () => {
    store.set(
      'cozyisland.save',
      JSON.stringify({
        created: true,
        active: 'a',
        slots: [
          // vor dem Tutorial gespielt
          { id: 'a', title: 'Alt', world: { wood: 3, felled: {}, houses: [], prog: { xp: 5, stats: {}, quests: 2 } } },
          // kurz mit Rucksack in der Insel (v2), mitten im Tutorial
          { id: 'b', title: 'Zwischen', world: { wood: 0, felled: {}, houses: [], sticks: 1, stones: 2, tools: [], prog: { xp: 2, stats: { sticks: 4, stones: 2 }, quests: 1, v: 2 } } },
          // per Insel-Link dazugekommen, noch nichts geladen
          { id: 'c', title: 'Link', pull: true, shared: { with: 'Lena' } },
          // schon mit Rucksack
          { id: 'd', title: 'Neu', bag: { sticks: 2, stones: 0, tools: ['axe'], got: { sticks: 6, stones: 3 }, tut: 2 } },
        ],
      }),
    );
    const s = loadSave();
    const bag = (id: string) => s.slots.find((x) => x.id === id)!.bag!;
    expect(bag('a').tools.length).toBe(4);
    expect(bag('a').tut).toBe(3);
    expect(bag('a').paid).toBe(true);
    expect(bag('b')).toMatchObject({ sticks: 1, stones: 2, tools: [], got: { sticks: 4, stones: 2 }, tut: 1 });
    expect(bag('b').paid).toBeUndefined();
    expect(bag('c')).toMatchObject({ tools: [], tut: 0 });
    expect(bag('d')).toMatchObject({ sticks: 2, tools: ['axe'], tut: 2 });
    expect(addSlot(s)!.bag).toMatchObject({ tools: [], tut: 0 });
    // ganz alter Stand (vor den Inseln)
    store.set('cozyisland.save', JSON.stringify({ created: true, world: { wood: 7, felled: {}, houses: [] } }));
    expect(activeSlot(loadSave()).bag!.tools.length).toBe(4);
  });
  it('Energie gehört zur Insel – gelöscht heißt wieder ausgeruht', () => {
    // ältere Version: Energie für alle Inseln gemeinsam
    store.set('cozyisland.save', JSON.stringify({ created: true, energy: 3, active: 'b', slots: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }] }));
    const s = loadSave();
    expect(activeSlot(s).energy).toBe(3);
    expect(s.slots[0].energy).toBeUndefined();
    expect('energy' in s).toBe(false);
    removeSlot(s, 'b');
    expect(activeSlot(s).energy).toBeUndefined();
    const fresh = addSlot(s)!;
    expect(fresh.energy).toBeUndefined();
    writeSave(s);
    expect(JSON.stringify(loadSave())).not.toContain('"energy":3');
  });
});
