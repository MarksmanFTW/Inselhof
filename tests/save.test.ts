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
});
