// Petit cache client pour les appels API du navigateur.
// - mémoire (session) + localStorage (entre visites), avec durée de validité ;
// - les requêtes identiques en cours sont partagées (une seule requête réseau) ;
// - les échecs ne sont JAMAIS mis en cache : ils seront retentés plus tard,
//   sans boucle automatique.
type Entry = { at: number; v: unknown };
const mem = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();
const PREFIX = "tmb_api:";

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

function readStore(key: string): Entry | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as Entry) : null;
  } catch { return null; }
}
function writeStore(key: string, e: Entry) {
  try { localStorage.setItem(PREFIX + key, JSON.stringify(e)); }
  catch {
    // Stockage plein : on vide nos anciennes entrées puis on abandonne en silence
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith(PREFIX)) localStorage.removeItem(k);
      }
    } catch { /* ignoré */ }
  }
}

/** GET/POST JSON mis en cache. `key` par défaut = l'URL (+ corps éventuel). */
export async function cachedJson<T = any>(url: string, ttlMs: number, init?: RequestInit, key?: string): Promise<T> {
  const k = key || url + (init?.body ? `#${String(init.body)}` : "");
  const now = Date.now();
  const m = mem.get(k);
  if (m && now - m.at < ttlMs) return m.v as T;
  const s = readStore(k);
  if (s && now - s.at < ttlMs) { mem.set(k, s); return s.v as T; }
  const pending = inflight.get(k);
  if (pending) return pending as Promise<T>;
  const p = (async () => {
    const res = await fetch(url, init);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const v = await res.json();
    const e = { at: Date.now(), v };
    mem.set(k, e);
    writeStore(k, e);
    return v as T;
  })();
  inflight.set(k, p);
  try { return await p; } finally { inflight.delete(k); }
}
