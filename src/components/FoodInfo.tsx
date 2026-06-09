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

interface Dish {
  label: string;
  desc: string | null;
  thumb: string | null;
  url: string | null;
}

const WD_LANGS = ["en", "fr", "es", "it", "de", "nl"];

// Résout un nom de lieu en QID Wikidata (ex "Bourgogne-Franche-Comté" → Q18578265)
async function resolvePlace(name: string, lang: string): Promise<string | null> {
  try {
    const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(name)}&language=${lang}&format=json&origin=*&limit=1&type=item`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return data.search?.[0]?.id || null;
  } catch {
    return null;
  }
}

// Requête SPARQL : plats/aliments dont l'origine est cette région (ou une sous-région)
async function fetchDishesFromWikidata(qid: string, lang: string): Promise<Dish[]> {
  // P495 = pays/région d'origine ; P276 = localisation ; on remonte via located-in (P131)
  // On cherche tout item qui est une instance/sous-classe de "aliment" (Q2095) ou "plat" (Q746549)
  // ayant pour origine soit le QID, soit un lieu situé dans le QID.
  const sparql = `
SELECT DISTINCT ?item ?itemLabel ?itemDescription ?img WHERE {
  VALUES ?region { wd:${qid} }
  ?item (wdt:P495|wdt:P276|wdt:P1071) ?origin .
  ?origin (wdt:P131*) ?region .
  ?item wdt:P31/wdt:P279* ?type .
  VALUES ?type { wd:Q2095 wd:Q746549 wd:Q746549 wd:Q25403900 }
  OPTIONAL { ?item wdt:P18 ?img . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "${lang},en". }
}
LIMIT 30`;

  const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(sparql)}&format=json`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, { headers: { Accept: "application/sparql-results+json" }, signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return [];
    const data = await res.json();
    const rows = data.results?.bindings || [];
    const seen = new Set<string>();
    const dishes: Dish[] = [];
    for (const r of rows) {
      const label = r.itemLabel?.value;
      if (!label || seen.has(label) || /^Q\d+$/.test(label)) continue;
      seen.add(label);
      let img = r.img?.value || null;
      // Réduit la taille de l'image Commons
      if (img) img = img.replace("/commons/", "/commons/thumb/") + `/200px-${img.split("/").pop()}`;
      dishes.push({
        label,
        desc: r.itemDescription?.value || null,
        thumb: img,
        url: r.item?.value || null,
      });
    }
    return dishes;
  } catch {
    clearTimeout(timer);
    return [];
  }
}

export default function FoodInfo({ trip, lang, onClose, t }: FoodInfoProps) {
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const wdLang = WD_LANGS.includes(lang) ? lang : "en";
    const places = [trip.region, trip.endCity, trip.startCity].filter(Boolean) as string[];
    if (places.length === 0) { setError(true); setLoading(false); return; }

    (async () => {
      for (const place of places) {
        const qid = await resolvePlace(place, wdLang);
        if (!qid) continue;
        const found = await fetchDishesFromWikidata(qid, wdLang);
        if (found.length >= 1) {
          setDishes(found);
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
          {!loading && !error && dishes.length > 0 && (
            <div className="flex flex-col gap-2">
              {dishes.map((d, i) => (
                <a
                  key={i}
                  href={d.url || "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-3 py-2.5 border-b border-white/5 hover:bg-white/[0.03] transition-colors -mx-2 px-2 rounded"
                >
                  <div className="w-14 h-14 rounded-lg overflow-hidden bg-white/5 shrink-0 flex items-center justify-center">
                    {d.thumb ? (
                      <img src={d.thumb} alt={d.label} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <UtensilsCrossed size={16} className="text-white/20" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-text-on font-medium">{d.label}</span>
                    {d.desc && <p className="text-[11px] text-text-dim leading-snug mt-1 font-light">{d.desc}</p>}
                  </div>
                </a>
              ))}
              <p className="font-mono text-[8px] text-text-dim/50 pt-3">{t("food.source")}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
