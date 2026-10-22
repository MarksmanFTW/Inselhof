/**
 * Koop-Raum über PeerJS (WebRTC, direkt von Handy zu Handy), sonst Umweg über relay.php.
 * Der Host bekommt einen 4-Buchstaben-Code, der Gast verbindet sich damit.
 * Nachrichten sind kleine Objekte; Bytes (Uint8Array) gehen direkt mit.
 */
import Peer, { type DataConnection, type PeerOptions } from 'peerjs';
import { RELAY_DEAD_MS, Relay } from './relay';

export const PROTOCOL = 1;
const PREFIX = 'cozyisland-v1-';
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

import type { Look } from '../character';
import type { FarmSave } from '../farm';
import type { WorldSave } from '../world';

/** Stand der Insel (vom Gastgeber) */
export interface IslandState {
  world: WorldSave;
  farm: FarmSave;
}
/** Figur: Position, Blick, Lauf-Bild, gerade benutztes Werkzeug */
export interface PlayerState {
  x: number;
  y: number;
  d: number;
  f: number;
  /** Schwung 0..1 (0 = kein Schlag) und Werkzeug */
  s: number;
  tl: string;
  /** in welchem Haus (-1 = draußen) */
  in?: number;
  /** reitet Pferd Nummer … */
  rh?: number;
}
/** Aktion des Gasts, der Gastgeber führt sie aus */
export interface Action {
  kind: 'axe' | 'hoe' | 'seeds' | 'water' | 'refill' | 'harvest' | 'build' | 'sleep' | 'eat' | 'cook' | 'furnish' | 'adopt' | 'feed';
  c?: number;
  r?: number;
  tree?: number;
  x?: number;
  y?: number;
  /** Abgleich: Baum ist umgefallen (unabhängig von einzelnen Schlägen) */
  fell?: boolean;
  /** Bauen: Haus oder Lagerfeuer */
  what?: 'house' | 'fire' | 'stable';
  /** Essen: Ofenrübe statt roher Rübe */
  cooked?: boolean;
  /** Möbel: Haus, Platz, Möbelstück */
  house?: number;
  slot?: number;
  item?: string;
  /** Pferd: Stall (house), Rasse (item), Name; Füttern: Nummer des Pferds */
  name?: string;
  horse?: number;
}
/** Effekte (Splitter, „+4 Holz“) für den anderen Bildschirm */
export interface Fx {
  k: 'chop' | 'fell' | 'till' | 'seed' | 'water' | 'refill' | 'harvest' | 'build' | 'can' | 'quest' | 'level' | 'sleep' | 'cook' | 'furnish' | 'horse' | 'feed';
  /** neue Stufe */
  n?: number;
  x: number;
  y: number;
  text?: string;
  tree?: number;
}

export type Msg =
  | { t: 'hi'; v: number; name: string; look: Look }
  | { t: 'welcome'; v: number; name: string; look: Look; state: IslandState; p: PlayerState; slot: { id: string; title: string; updatedAt: number } }
  /** Gast hat einen neueren Stand dieser gemeinsamen Insel */
  | { t: 'newer'; state: IslandState; updatedAt: number }
  | { t: 'state'; state: IslandState }
  | { t: 'p'; p: PlayerState }
  | { t: 'do'; a: Action }
  | { t: 'fx'; fx: Fx }
  | { t: 'msg'; text: string }
  | { t: 'look'; name: string; look: Look }
  | { t: 'bye' };

export function randomCode() {
  return Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');
}
export const cleanCode = (s: string) =>
  s
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 4);

/**
 * STUN findet die öffentliche Adresse; TURN leitet weiter, wenn Handy-Netze
 * (Mobilfunk, strenge Router) keine direkte Verbindung zulassen.
 */
const ICE: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] },
  { urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' },
  {
    urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turns:openrelay.metered.ca:443?transport=tcp'],
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

/**
 * Eigener TURN-Zugang bei Metered.ca (Gratis-Tarif): App-Name und API-Schlüssel
 * aus dem Metered-Dashboard. Der Schlüssel ist für die Nutzung im Browser gedacht.
 */
const METERED = { app: '', apiKey: '' };
let extraIce: RTCIceServer[] = [];

/** TURN-Zugangsdaten holen (höchstens 4 s warten, sonst ohne weiter) */
export const turnReady: Promise<void> = (async () => {
  if (!METERED.app || !METERED.apiKey) return;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const r = await fetch(`https://${METERED.app}.metered.live/api/v1/turn/credentials?apiKey=${METERED.apiKey}`, {
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (r.ok) extraIce = (await r.json()) as RTCIceServer[];
  } catch {
    /* dann eben nur die freien Server */
  }
})();

/** Eigener Vermittlungs-Server zum Testen: ?peer=localhost:9000 */
function peerOptions(): PeerOptions {
  const base: PeerOptions = { debug: 0, config: { iceServers: [...extraIce, ...ICE] } };
  const custom = new URLSearchParams(location.search).get('peer');
  if (!custom) return base;
  const [host, port] = custom.split(':');
  return { ...base, host, port: Number(port || 9000), path: '/', secure: location.protocol === 'https:' };
}

/** so lange auf den Vermittlungs-Server bzw. einen Verbindungsversuch warten */
const SERVER_MS = 12_000;
const TRY_MS = 7_000;
/** Fehler, nach denen der Gastgeber still neu beim Server anklopft */
const LOST = ['network', 'socket-error', 'socket-closed', 'disconnected', 'server-error'];

const ERRORS: Record<string, string> = {
  'peer-unavailable': 'Raum nicht gefunden – stimmt der Code? Der Gastgeber muss den Raum offen haben.',
  network: 'Keine Verbindung zum Koop-Server. Bist du online?',
  'server-error': 'Der Koop-Server antwortet gerade nicht.',
  'socket-error': 'Keine Verbindung zum Koop-Server.',
  'socket-closed': 'Verbindung zum Koop-Server getrennt.',
  'browser-incompatible': 'Dieser Browser kann leider kein Koop.',
  timeout: 'Der Koop-Server antwortet nicht. Prüf dein Internet und versuch es nochmal.',
  'no-link': 'Dein Freund antwortet nicht. Ist sein Raum noch offen und stimmt der Code?',
};

/** Was beim Verbindungsaufbau schon geklappt hat – zur Fehlersuche im Panel angezeigt */
export type Diag = { server: 'wait' | 'ok' | 'lost'; host: number; srflx: number; relay: number; ice: string };

export function diagText(d: Diag) {
  const mark = (ok: boolean) => (ok ? '✓' : '✗');
  const ice: Record<string, string> = {
    new: '…',
    checking: 'sucht…',
    connected: '✓',
    completed: '✓',
    failed: '✗ gescheitert',
    disconnected: 'unterbrochen',
    closed: 'zu',
  };
  const parts = [`Server ${d.server === 'ok' ? '✓' : d.server === 'lost' ? '✗' : '…'}`];
  if (d.ice === 'relay') return [...parts, 'Verbindung ✓ über deine Website'].join(' · ');
  if (d.ice) parts.push(`Netz ${mark(d.srflx > 0)}`, `Umleitung ${mark(d.relay > 0)}`, `Verbindung ${ice[d.ice] ?? d.ice}`);
  return parts.join(' · ');
}

export class Room {
  peer: Peer | null = null;
  conn: DataConnection | null = null;
  code = '';
  onMsg: (m: Msg) => void = () => {};
  onOpen: () => void = () => {};
  onClose: () => void = () => {};
  onError: (text: string) => void = () => {};
  /** Gast: Verbindungsversuch n von TRIES */
  onTry: (n: number, of: number) => void = () => {};
  onDiag: (d: Diag) => void = () => {};
  diag: Diag = { server: 'wait', host: 0, srflx: 0, relay: 0, ice: '' };
  /** Code steht fest (Panel kann ihn zeigen) */
  ready = false;
  /** Umweg über die Website statt direkter Verbindung */
  relay: Relay | null = null;
  relayLive = false;
  private relayStart = 0;
  private relayWatch = 0;
  private closed = false;
  private timer = 0;

  constructor(readonly host: boolean) {
    // iPhone friert Seiten im Hintergrund ein → beim Zurückkommen neu beim Server melden
    document.addEventListener('visibilitychange', this.wake);
  }

  private wake = () => {
    const p = this.peer;
    if (document.visibilityState === 'visible' && p && !this.closed && !p.destroyed && p.disconnected) p.reconnect();
  };

  get connected() {
    return !!this.conn?.open || this.relayLive;
  }

  /** Umweg starten: Host lauscht immer mit, der Gast nutzt ihn, wenn direkt nichts geht */
  private startRelay() {
    if (this.relay || this.closed) return;
    const r = new Relay(this.code, this.host ? 'h' : 'g');
    this.relay = r;
    this.relayStart = Date.now();
    r.onMsg = (m) => {
      if (this.relay !== r || this.closed) return;
      if (this.conn?.open) return; // direkte Verbindung hat Vorrang
      if (!this.relayLive) this.goLive();
      this.onMsg(m as Msg);
    };
    this.relayWatch = window.setInterval(() => {
      if (this.relay !== r || this.closed) return;
      const now = Date.now();
      // Gast: Gastgeber meldet sich gar nicht
      if (!this.host && !r.lastSeen && now - this.relayStart > 60_000) return this.fail(this.lastErr);
      if (this.relayLive && r.lastSeen && now - r.lastSeen > RELAY_DEAD_MS) {
        this.relayLive = false;
        this.onClose();
      }
    }, 2000);
  }

  private goLive() {
    this.relayLive = true;
    clearTimeout(this.timer);
    this.setDiag({ ice: 'relay' });
    this.onOpen();
  }

  private stopRelay() {
    clearInterval(this.relayWatch);
    this.relay?.close();
    this.relay = null;
    this.relayLive = false;
  }

  private lastErr = 'no-link';

  /** Host: Raum öffnen (neuer Code, falls schon vergeben) */
  create(tries = 0, wish = ''): Promise<string> {
    return new Promise((res) => void turnReady.then(() => !this.closed && this.openHost(tries, wish, res)));
  }

  private openHost(tries: number, wish: string, res: (code: string) => void) {
    this.code = wish || randomCode();
    const peer = new Peer(PREFIX + this.code, peerOptions());
    this.peer = peer;
    let ready = false;
    peer.on('error', (e) => {
      if (e.type === 'unavailable-id' && !ready) {
        peer.destroy();
        if (this.closed) return;
        // gemerkter Code noch vom eingefrorenen Tab belegt: kurz warten, bis der Server ihn freigibt
        if (wish && tries < 10) setTimeout(() => !this.closed && this.openHost(tries + 1, wish, res), 3000);
        else if (tries < 15) this.openHost(tries + 1, '', res);
        else this.fail(e.type);
        return;
      }
      // Raum war schon offen und nur die Server-Verbindung ist weg: still neu verbinden
      if (ready && LOST.includes(e.type)) return this.retryServer(peer);
      // Koop-Server kaputt: über die Website geht es trotzdem
      if (LOST.includes(e.type)) {
        this.setDiag({ server: 'lost' });
        return done();
      }
      this.fail(e.type);
    });
    peer.on('disconnected', () => {
      // kurz weg (Bildschirm aus, App gewechselt): Raum-Code behalten
      this.retryServer(peer);
    });
    peer.on('connection', (c) => {
      // nur ein Mitspieler
      if (this.conn?.open) {
        c.on('open', () => c.close());
        return;
      }
      this.attach(c);
    });
    const done = () => {
      if (this.ready) return;
      this.ready = true;
      clearTimeout(this.timer);
      this.startRelay();
      res(this.code);
    };
    clearTimeout(this.timer);
    // Koop-Server antwortet nicht: Raum trotzdem öffnen, dann eben nur über die Website
    this.timer = window.setTimeout(() => {
      if (peer.open || this.peer !== peer) return;
      this.setDiag({ server: 'lost' });
      done();
    }, SERVER_MS);
    peer.on('open', () => {
      // nach einem Neu-Anmelden kommt 'open' nochmal – der Raum ist dann schon bekannt
      if (ready) return this.setDiag({ server: 'ok' });
      ready = true;
      this.setDiag({ server: 'ok' });
      done();
    });
  }

  /** Gast: einem Raum beitreten – mehrere Versuche, falls der Gastgeber kurz weg ist */
  join(code: string) {
    this.code = code;
    void turnReady.then(() => !this.closed && this.joinNow(code));
  }

  private joinNow(code: string) {
    // ?direct=0: gleich über die Website (zum Testen)
    if (new URLSearchParams(location.search).get('direct') === '0') return this.guestRelay();
    const peer = new Peer(peerOptions());
    this.peer = peer;
    const attempt = () => {
      if (this.closed || this.connected) return;
      this.onTry(1, 2);
      this.attach(peer.connect(PREFIX + code, { reliable: true }));
      clearTimeout(this.timer);
      // direkt klappt nicht schnell genug → Umweg über die Website
      this.timer = window.setTimeout(() => this.guestRelay(), TRY_MS);
    };
    peer.on('error', (e) => {
      // Raum nicht beim Koop-Server (Gastgeber kurz weg?) oder Server kaputt: Website-Umweg wartet einfach
      if (e.type === 'peer-unavailable') this.lastErr = 'peer-unavailable';
      this.guestRelay();
    });
    peer.on('disconnected', () => this.retryServer(peer));
    peer.on('open', () => {
      this.setDiag({ server: 'ok' });
      if (!this.conn) attempt();
    });
    this.timer = window.setTimeout(() => !peer.open && this.peer === peer && this.guestRelay(), SERVER_MS);
  }

  private guestRelay() {
    if (this.closed || this.connected || this.relay) return;
    clearTimeout(this.timer);
    this.onTry(2, 2);
    const old = this.conn;
    this.conn = null;
    old?.close();
    this.peer?.destroy();
    this.startRelay();
    // Gast ist sofort „da“: das Hallo wartet auf dem Webspace, bis der Gastgeber es abholt
    this.goLive();
  }

  private setDiag(d: Partial<Diag>) {
    Object.assign(this.diag, d);
    this.onDiag(this.diag);
  }

  private retryServer(peer: Peer) {
    if (this.closed || peer.destroyed) return;
    this.setDiag({ server: 'lost' });
    setTimeout(() => {
      if (!this.closed && !peer.destroyed && peer.disconnected && document.visibilityState === 'visible') peer.reconnect();
    }, 2000);
  }

  private attach(c: DataConnection) {
    this.conn = c;
    let opened = false;
    this.watchIce(c);
    c.on('open', () => {
      if (this.conn !== c || this.relayLive) return c.close();
      // direkt verbunden: Host braucht den Website-Umweg nicht mehr
      if (this.host) this.stopRelay();
      opened = true;
      clearTimeout(this.timer);
      this.onOpen();
    });
    c.on('data', (d) => this.conn === c && this.onMsg(d as Msg));
    c.on('close', () => {
      if (this.conn !== c) return; // alter Versuch
      this.conn = null;
      if (!this.closed && opened) this.onClose();
    });
    c.on('error', () => {});
  }

  /** ICE-Kandidaten mitzählen: Netz = öffentliche Adresse gefunden, Umleitung = TURN erreichbar */
  private watchIce(c: DataConnection) {
    const hook = (tries = 0) => {
      const pc = c.peerConnection;
      if (!pc) return void (tries < 20 && setTimeout(() => hook(tries + 1), 100));
      this.setDiag({ host: 0, srflx: 0, relay: 0, ice: pc.iceConnectionState });
      pc.addEventListener('icecandidate', (e) => {
        if (this.conn !== c || !e.candidate) return;
        const type = / typ (host|srflx|prflx|relay)/.exec(e.candidate.candidate)?.[1];
        if (type === 'host') this.setDiag({ host: this.diag.host + 1 });
        if (type === 'srflx' || type === 'prflx') this.setDiag({ srflx: this.diag.srflx + 1 });
        if (type === 'relay') this.setDiag({ relay: this.diag.relay + 1 });
      });
      pc.addEventListener('iceconnectionstatechange', () => this.conn === c && this.setDiag({ ice: pc.iceConnectionState }));
    };
    hook();
  }

  private fail(type: string) {
    if (this.closed) return;
    clearTimeout(this.timer);
    this.onError(`${ERRORS[type] ?? `Koop-Fehler (${type})`}<br><small class="pg-diag">${diagText(this.diag)}</small>`);
  }

  send(m: Msg) {
    if (this.relayLive) this.relay?.send(m);
    else if (this.conn?.open) void this.conn.send(m);
  }

  /** Puffer der Verbindung (Bytes, die noch nicht raus sind) – bei Stau Schnappschüsse auslassen */
  get backlog() {
    if (this.relayLive) return this.relay?.backlog ?? 0;
    const dc = (this.conn as unknown as { dataChannel?: RTCDataChannel })?.dataChannel;
    return dc?.bufferedAmount ?? 0;
  }

  close() {
    this.closed = true;
    clearTimeout(this.timer);
    document.removeEventListener('visibilitychange', this.wake);
    try {
      this.send({ t: 'bye' });
    } catch {
      /* egal */
    }
    setTimeout(() => {
      this.conn?.close();
      this.peer?.destroy();
      this.stopRelay();
    }, 300);
  }
}
