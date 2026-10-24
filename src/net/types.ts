/**
 * Gemeinsame Datentypen: Stand einer Insel, Spiel-Aktionen und Effekte.
 * Eine Aktion wird lokal ausgeführt und bei gemeinsamen Inseln ins Protokoll
 * auf dem Server geschrieben (siehe cloud.ts).
 */
import type { FarmSave } from '../farm';
import type { WorldSave } from '../world';

/** Stand der Insel */
export interface IslandState {
  world: WorldSave;
  farm: FarmSave;
}

/** eine Spiel-Aktion */
export interface Action {
  kind: 'axe' | 'hoe' | 'seeds' | 'water' | 'refill' | 'harvest' | 'build' | 'sleep' | 'eat' | 'cook' | 'furnish' | 'adopt' | 'feed' | 'brush' | 'foal' | 'mow' | 'rake' | 'sell' | 'buy' | 'dress' | 'pick' | 'craft' | 'tut' | 'shake' | 'fish' | 'donate' | 'order';
  c?: number;
  r?: number;
  /** Baum (Axt) bzw. Stock/Stein (pick): Nummer */
  tree?: number;
  x?: number;
  y?: number;
  /** Abgleich: Baum ist umgefallen (unabhängig von einzelnen Schlägen) */
  fell?: boolean;
  /** Bauen: Haus, Lagerfeuer, Stall, Koppel, Deko */
  what?: 'house' | 'fire' | 'stable' | 'paddock' | 'deco';
  /** Essen: Ofenrübe statt roher Rübe */
  cooked?: boolean;
  /** Möbel: Haus, Platz, Möbelstück */
  house?: number;
  slot?: number;
  item?: string;
  /** Pferd: Stall (house), Rasse (item), Name; Füttern: Nummer des Pferds */
  name?: string;
  horse?: number;
  /** Händler: Stückzahl */
  n?: number;
}

/** Effekte (Splitter, „+4 Holz“) */
export interface Fx {
  k: 'chop' | 'fell' | 'till' | 'seed' | 'water' | 'refill' | 'harvest' | 'build' | 'can' | 'quest' | 'level' | 'sleep' | 'cook' | 'furnish' | 'horse' | 'feed' | 'brush' | 'foal' | 'mow' | 'rake' | 'trade' | 'pick' | 'craft' | 'fruit' | 'fish' | 'project' | 'order';
  /** neue Stufe */
  n?: number;
  x: number;
  y: number;
  text?: string;
  tree?: number;
}
