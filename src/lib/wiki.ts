// Descriptions Wikipédia pour des lieux (POI OpenStreetMap, lieux Google…).
// La description est l'introduction de l'article, telle quelle (aucune
// réécriture) ; la photo est la vignette de l'article.
// Toutes les requêtes passent par cachedJson (cache 7 jours, requêtes
// identiques partagées).
import { cachedJson, DAY } from "./cachedJson";

export interface WikiInfo {
  title: string;          // titre de l'article (pour le lien)
  desc: string | null;    // introduction Wikipédia, non modifiée
  thumb: string | null;
}

export const WIKI_LANGS = ["en", "fr", "es", "it", "de", "nl"];
export const wikiLangFor = (lang: string) => (WIKI_LANGS.includes(lang) ? lang : "en");
export const wikiUrl = (lang: string, title: string) =>
  `https://${wikiLangFor(lang)}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;

// Introduction complète (3 phrases max côté API), sans couper le texte.
const EXTRACT_PARAMS = "prop=extracts|pageimages&exintro=1&explaintext=1&exsentences=3&pithumbsize=200&format=json&origin=*&redirects=1";

function fromPage(pg: any): WikiInfo | null {
  if (!pg || pg.missing !== undefined) return null;
  const desc = (pg.extract || "").replace(/\s+/g, " ").trim() || null;
  let thumb: string | null = pg.thumbnail?.source || null;
  // Les cartes de localisation ne sont pas des photos du lieu
  if (thumb && /(Localisation|location_map|_map|\.svg)/i.test(thumb)) thumb = null;
  return { title: pg.title, desc, thumb };
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

// Ressemblance entre le nom du lieu et un titre d'article (0–100)
function similarity(name: string, title: string): number {
  const a = norm(name), b = norm(title.replace(/\s*\(.*\)$/, ""));
  if (!a || !b) return 0;
  if (a === b) return 100;
  if (a.includes(b) || b.includes(a)) return 60;
  const wa = new Set(a.split(" ").filter(w => w.length > 2));
  return b.split(" ").filter(w => w.length > 2 && wa.has(w)).length * 20;
}

/** Articles connus par leur titre (tags wikipedia d'OSM) : une seule requête groupée. */
export async function wikiByTitles(titles: string[], lang: string): Promise<Record<string, WikiInfo>> {
  const out: Record<string, WikiInfo> = {};
  const uniq = [...new Set(titles.filter(Boolean))].slice(0, 40);
  if (!uniq.length) return out;
  const wl = wikiLangFor(lang);
  try {
    const data = await cachedJson(`https://${wl}.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(uniq.join("|"))}&${EXTRACT_PARAMS}`, 7 * DAY);
    // Les redirections/normalisations renvoient un autre titre : on les suit
    const alias: Record<string, string> = {};
    for (const r of [...(data?.query?.normalized || []), ...(data?.query?.redirects || [])]) alias[r.to] = r.from;
    for (const pg of Object.values<any>(data?.query?.pages || {})) {
      const info = fromPage(pg);
      if (!info) continue;
      out[pg.title] = info;
      let from = alias[pg.title];
      while (from) { out[from] = info; from = alias[from]; }
    }
  } catch { /* réseau : pas de description, sans erreur visible */ }
  return out;
}

/**
 * Recherche l'article d'un lieu par son nom (+ ville pour le contexte).
 * Renvoie null si aucun article ne correspond assez : mieux vaut pas de
 * description qu'une description d'un autre lieu.
 */
export async function wikiSearch(name: string, city: string, lang: string): Promise<WikiInfo | null> {
  if (!name) return null;
  const wl = wikiLangFor(lang);
  const term = city ? `${name} ${city}` : name;
  try {
    const data = await cachedJson(`https://${wl}.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(term)}&gsrlimit=4&${EXTRACT_PARAMS}`, 7 * DAY);
    const pages = Object.values<any>(data?.query?.pages || {});
    const best = pages
      .map(pg => ({ pg, score: similarity(name, pg.title || "") - (pg.index || 0) }))
      .sort((a, b) => b.score - a.score)[0];
    return best && best.score >= 40 ? fromPage(best.pg) : null;
  } catch { return null; }
}

/** Enrichit une liste de lieux : par titre connu si possible, sinon par recherche. */
export async function wikiForPlaces(
  places: { title: string; wikiTitle?: string | null }[],
  city: string,
  lang: string,
): Promise<(WikiInfo | null)[]> {
  const byTitle = await wikiByTitles(places.map(p => p.wikiTitle || "").filter(Boolean) as string[], lang);
  return Promise.all(places.map(async p =>
    (p.wikiTitle && byTitle[p.wikiTitle]) || wikiSearch(p.title, city, lang)));
}
