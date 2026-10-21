/**
 * Umweg über die eigene Website (relay.php), wenn keine direkte WebRTC-Verbindung
 * klappt – z. B. über Mobilfunk. Beide Handys schicken ihre Nachrichten per HTTP
 * an den Webspace und holen die des anderen per „Long-Polling“ ab.
 * Langsamer als direkt (~5–10 Schnappschüsse pro Sekunde), aber es funktioniert überall.
 */

/** relay.php liegt neben dem Spiel; zum Testen: ?relay=http://localhost:8088/relay.php */
export function relayUrl() {
  const custom = new URLSearchParams(location.search).get('relay');
  return custom && custom.startsWith('http') ? custom : new URL('relay.php', location.href).href;
}

/** Bytes (Uint8Array) überleben JSON als Base64 */
function pack(_k: string, v: unknown) {
  if (v instanceof Uint8Array) {
    let s = '';
    for (let i = 0; i < v.length; i += 0x8000) s += String.fromCharCode(...v.subarray(i, i + 0x8000));
    return { $b: btoa(s) };
  }
  return v;
}
function unpack(_k: string, v: unknown) {
  if (v && typeof v === 'object' && '$b' in v) {
    const s = atob((v as { $b: string }).$b);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }
  return v;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Lebenszeichen, damit beide merken, wenn der andere weg ist */
const KEEPALIVE_MS = 3000;
export const RELAY_DEAD_MS = 20_000;

type Packet = { t: string };

export class Relay {
  onMsg: (m: Packet) => void = () => {};
  lastSeen = 0;
  private queue: Packet[] = [];
  /** gleichzeitig unterwegs (zwei Pakete parallel verdoppeln fast die Rate) */
  private inflight = 0;
  private stopped = false;
  private ka: number;
  private readonly base: string;

  constructor(code: string, side: 'h' | 'g') {
    this.base = `${relayUrl()}?room=${code}&side=${side}`;
    this.ka = window.setInterval(() => {
      if (!this.inflight && !this.queue.length) this.send({ t: 'ka' });
    }, KEEPALIVE_MS);
    void this.poll();
  }

  /** Stau: solange ein Paket unterwegs ist, lässt der Host Schnappschüsse aus (Ereignisse sammeln sich) */
  get backlog() {
    return this.inflight >= 2 ? 1e9 : 0;
  }

  send(m: Packet) {
    if (this.stopped) return;
    // Positionen veralten sofort – nur die neueste mitschicken
    if (m.t === 'p') this.queue = this.queue.filter((x) => x.t !== 'p');
    this.queue.push(m);
    void this.flush();
  }

  private async flush() {
    if (this.inflight >= 2 || !this.queue.length || this.stopped) return;
    this.inflight++;
    const body = JSON.stringify(this.queue.splice(0), pack);
    try {
      await fetch(this.base, { method: 'POST', body, headers: { 'Content-Type': 'text/plain' }, cache: 'no-store' });
    } catch {
      await sleep(500);
    }
    this.inflight--;
    void this.flush();
  }

  private async poll() {
    while (!this.stopped) {
      try {
        const r = await fetch(this.base, { cache: 'no-store' });
        if (!r.ok) throw new Error(String(r.status));
        const batches = JSON.parse(await r.text(), unpack) as Packet[][];
        for (const batch of batches)
          for (const m of batch) {
            if (this.stopped) return;
            this.lastSeen = Date.now();
            if (m.t !== 'ka') this.onMsg(m);
          }
      } catch {
        await sleep(1000);
      }
    }
  }

  close() {
    this.stopped = true;
    clearInterval(this.ka);
  }
}
