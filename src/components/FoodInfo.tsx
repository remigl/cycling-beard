import { useState, useEffect } from "react";
import { X, UtensilsCrossed } from "lucide-react";
import { TripSummary } from "../types";
import { Lang } from "../i18n";

interface FoodInfoProps {
  trip: TripSummary;
  lang: Lang;
  onClose: () => void;
  t: (key: string) => string;
}

interface FoodData {
  title: string;
  extract: string;
  dishes: string[];
  thumb: string | null;
  url: string;
}

// Cherche une page Wikipédia sur la gastronomie de la région/ville
async function fetchGastronomy(query: string, lang: string): Promise<FoodData | null> {
  try {
    // 1. Recherche les pages pertinentes (on en prend plusieurs pour filtrer)
    const searchUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=5&format=json&origin=*`;
    const sres = await fetch(searchUrl);
    if (!sres.ok) return null;
    const sdata = await sres.json();
    const hits = sdata.query?.search || [];
    if (hits.length === 0) return null;

    // Mots-clés qui valident qu'une page parle bien de gastronomie
    const foodWords = /(cuisine|gastronomie|gastronomy|culinair|culinaire|specialit|spécialit|plats?|dishes|food|cucina|küche|keuken)/i;

    // Choisit le 1er résultat dont le TITRE contient un mot gastronomique
    let title = "";
    for (const h of hits) {
      if (foodWords.test(h.title)) { title = h.title; break; }
    }
    if (!title) return null; // aucun résultat gastronomique → on rejette (évite "Orléans")

    // 2. Liste des sections de l'article
    const secUrl = `https://${lang}.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(title)}&prop=sections&format=json&origin=*`;
    const secRes = await fetch(secUrl);
    const secData = secRes.ok ? await secRes.json() : null;
    const sections = secData?.parse?.sections || [];

    const wanted = /(plats?\s*typiques?|sp[ée]cialit[ée]s?|mets|dishes|specialties|gerichte|piatti|platos)/i;
    const target = sections.find((s: any) => wanted.test(s.line));

    // 3a. Section dédiée → liste de plats
    if (target) {
      const extUrl = `https://${lang}.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(title)}&section=${target.index}&prop=text&format=json&origin=*`;
      const extRes = await fetch(extUrl);
      if (extRes.ok) {
        const extData = await extRes.json();
        const html = extData?.parse?.text?.["*"] || "";
        const items: string[] = [];
        const liMatches = html.match(/<li[^>]*>([\s\S]*?)<\/li>/gi) || [];
        for (const li of liMatches) {
          const clean = li.replace(/<[^>]+>/g, "").replace(/\[\d+\]/g, "").replace(/\s+/g, " ").trim();
          if (clean.length > 2 && clean.length < 120) items.push(clean);
        }
        if (items.length >= 2) {
          return { title, extract: "", dishes: items.slice(0, 25), thumb: null, url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title)}` };
        }
      }
    }

    // 3b. Sinon résumé intro (de la page gastronomique validée)
    const sumUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=extracts|pageimages&exintro=1&explaintext=1&exsentences=5&pithumbsize=200&format=json&origin=*&redirects=1`;
    const res = await fetch(sumUrl);
    if (!res.ok) return null;
    const data = await res.json();
    const pages = data.query?.pages || {};
    for (const k of Object.keys(pages)) {
      const page = pages[k];
      let extract = (page.extract || "").replace(/\s+/g, " ").trim();
      return { title: page.title, extract, dishes: [], thumb: page.thumbnail?.source || null, url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(page.title)}` };
    }
    return null;
  } catch {
    return null;
  }
}

export default function FoodInfo({ trip, lang, onClose, t }: FoodInfoProps) {
  const [data, setData] = useState<FoodData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const wikiLang = ["en", "fr", "es", "it", "de", "nl"].includes(lang) ? lang : "en";
    // On essaie la région puis la ville
    const places = [trip.region, trip.endCity, trip.startCity].filter(Boolean) as string[];
    if (places.length === 0) { setError(true); setLoading(false); return; }

    // Pour chaque lieu, plusieurs formulations de requête
    const queries: string[] = [];
    for (const place of places) {
      queries.push(`${t("food.query_cuisine")} ${place}`);
      queries.push(`${t("food.query_gastronomy")} ${place}`);
      queries.push(`${t("food.query_specialty")} ${place}`);
    }

    (async () => {
      for (const q of queries) {
        const result = await fetchGastronomy(q, wikiLang);
        if (result && (result.dishes.length >= 2 || (result.extract && result.extract.length > 60))) {
          setData(result);
          setLoading(false);
          return;
        }
      }
      setError(true);
      setLoading(false);
    })();
  }, [trip.slug, lang]);

  return (
    <div className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center p-3" onClick={onClose}>
      <div className="relative w-full max-w-lg bg-[#1c1b1b] rounded-2xl border border-white/10 flex flex-col max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <UtensilsCrossed size={16} className="text-brand-sand shrink-0" />
            <div className="min-w-0">
              <div className="font-display font-bold text-sm text-white uppercase tracking-wider truncate">{t("food.title")}</div>
              <div className="font-mono text-[9px] text-text-dim truncate">{trip.region || trip.endCity || trip.title}</div>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center text-white cursor-pointer shrink-0 ml-2">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4">
          {loading && (
            <div className="py-12 text-center">
              <UtensilsCrossed size={24} className="text-brand-sand mx-auto mb-3 animate-pulse" />
              <p className="font-mono text-[10px] text-brand-sand uppercase tracking-widest animate-pulse">{t("food.loading")}</p>
            </div>
          )}
          {error && !loading && (
            <p className="font-mono text-xs text-text-dim py-8 text-center">{t("food.none")}</p>
          )}
          {data && !loading && (
            <div className="flex flex-col gap-4">
              {data.thumb && (
                <div className="w-full aspect-video rounded-lg overflow-hidden bg-white/5">
                  <img src={data.thumb} alt={data.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                </div>
              )}
              <div>
                <h4 className="font-display font-bold text-sm text-white mb-2">{data.title}</h4>
                {data.dishes.length > 0 ? (
                  <ul className="flex flex-col gap-1.5">
                    {data.dishes.map((dish, i) => (
                      <li key={i} className="text-xs text-text-dim leading-relaxed font-light flex gap-2">
                        <span className="text-brand-sand shrink-0">•</span> {dish}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-text-dim leading-relaxed font-light">{data.extract}</p>
                )}
              </div>
              <a
                href={data.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-[10px] text-brand-sand hover:underline"
              >
                {t("food.readmore")} →
              </a>
              <p className="font-mono text-[8px] text-text-dim/50 pt-2 border-t border-white/5">{t("food.source")}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
