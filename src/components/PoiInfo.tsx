import { useState, useEffect } from "react";
import { X, MapPin } from "lucide-react";
import { TripSummary } from "../types";
import { Lang } from "../i18n";

interface Poi {
  title: string;
  dist: number;        // mètres
  thumb?: string | null;
  desc?: string | null;
  score: number;       // pertinence touristique (plus haut = prioritaire)
}

interface PoiInfoProps {
  trip: TripSummary;
  lang: Lang;
  onClose: () => void;
  t: (key: string) => string;
}

// Calcule un score touristique à partir du résumé Wikipédia
function touristScore(extract: string): number {
  if (!extract) return 0;
  const txt = extract.toLowerCase();
  let score = 0;
  // Mots évoquant un lieu visitable
  const strong = /(château|cathédrale|basilique|abbaye|musée|monument|forteresse|citadelle|palais|patrimoine mondial|unesco|grotte|cascade|réserve naturelle|parc national|site classé|monument historique)/g;
  const medium = /(église|chapelle|pont|tour|ruines|vestiges|jardin|parc|lac|belvédère|panorama|site|gorges|viaduc)/g;
  score += (txt.match(strong) || []).length * 3;
  score += (txt.match(medium) || []).length * 1;
  return score;
}

export default function PoiInfo({ trip, lang, onClose, t }: PoiInfoProps) {
  const [pois, setPois] = useState<Poi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const wikiLang = ["en", "fr", "es", "it", "de", "nl"].includes(lang) ? lang : "en";

  useEffect(() => {
    if (trip.mapLat == null || trip.mapLng == null) { setError(true); setLoading(false); return; }
    const lat = trip.mapLat, lng = trip.mapLng;

    const run = async () => {
      try {
        // 1. GeoSearch : articles Wikipédia géolocalisés dans 20 km (max GeoSearch = 10 km par requête → on prend le max)
        const gsUrl = `https://${wikiLang}.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${lat}|${lng}&gsradius=10000&gslimit=50&format=json&origin=*`;
        const gsRes = await fetch(gsUrl);
        if (!gsRes.ok) throw new Error("geosearch");
        const gsData = await gsRes.json();
        const places = gsData.query?.geosearch || [];
        if (places.length === 0) { setError(true); setLoading(false); return; }

        // 2. Récupère résumé + vignette pour tous les titres en un appel groupé
        const titles = places.map((p: any) => p.title).slice(0, 40);
        const exUrl = `https://${wikiLang}.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(titles.join("|"))}&prop=extracts|pageimages&exintro=1&explaintext=1&exsentences=2&pithumbsize=120&format=json&origin=*&redirects=1`;
        const exRes = await fetch(exUrl);
        const exData = exRes.ok ? await exRes.json() : null;
        const pagesById = exData?.query?.pages || {};

        // Indexe les détails par titre
        const detailByTitle: Record<string, { thumb: string | null; desc: string | null }> = {};
        for (const k of Object.keys(pagesById)) {
          const pg = pagesById[k];
          let desc = (pg.extract || "").replace(/\s+/g, " ").trim();
          if (desc.length > 160) desc = desc.slice(0, 157) + "…";
          detailByTitle[pg.title] = { thumb: pg.thumbnail?.source || null, desc: desc || null };
        }

        // 3. Construit la liste avec score touristique
        const list: Poi[] = places.map((p: any) => {
          const d = detailByTitle[p.title] || { thumb: null, desc: null };
          return {
            title: p.title,
            dist: p.dist,
            thumb: d.thumb,
            desc: d.desc,
            score: touristScore(d.desc || ""),
          };
        });

        // Tri : sites touristiques d'abord (score), puis par distance
        list.sort((a, b) => (b.score - a.score) || (a.dist - b.dist));
        setPois(list.slice(0, 20));
        setLoading(false);
      } catch {
        setError(true);
        setLoading(false);
      }
    };

    run();
  }, [trip.slug, lang]);

  return (
    <div className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center p-3" onClick={onClose}>
      <div className="relative w-full max-w-lg bg-[#1c1b1b] rounded-2xl border border-white/10 flex flex-col max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <MapPin size={16} className="text-brand-sand shrink-0" />
            <div className="min-w-0">
              <div className="font-display font-bold text-sm text-white uppercase tracking-wider truncate">{t("poi.title")}</div>
              <div className="font-mono text-[9px] text-text-dim truncate">{trip.endCity || trip.startCity || trip.title} · {t("poi.subtitle")}</div>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center text-white cursor-pointer shrink-0 ml-2">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4">
          {loading && (
            <div className="py-12 text-center">
              <MapPin size={24} className="text-brand-sand mx-auto mb-3 animate-pulse" />
              <p className="font-mono text-[10px] text-brand-sand uppercase tracking-widest animate-pulse">{t("poi.loading")}</p>
            </div>
          )}
          {error && !loading && (
            <p className="font-mono text-xs text-text-dim py-8 text-center">{t("poi.none")}</p>
          )}
          {!loading && !error && pois.length > 0 && (
            <div className="flex flex-col gap-2">
              {pois.map((p, i) => (
                <a
                  key={i}
                  href={`https://${wikiLang}.wikipedia.org/wiki/${encodeURIComponent(p.title)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-3 py-2.5 border-b border-white/5 hover:bg-white/[0.03] transition-colors -mx-2 px-2 rounded"
                >
                  <div className="w-14 h-14 rounded-lg overflow-hidden bg-white/5 shrink-0 flex items-center justify-center">
                    {p.thumb ? (
                      <img src={p.thumb} alt={p.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <MapPin size={16} className="text-white/20" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm text-text-on font-medium truncate">{p.title}</span>
                      <span className="font-mono text-[9px] text-brand-sand shrink-0">{(p.dist / 1000).toFixed(1)} km</span>
                    </div>
                    {p.desc && <p className="text-[11px] text-text-dim leading-snug mt-1 font-light">{p.desc}</p>}
                  </div>
                </a>
              ))}
              <p className="font-mono text-[8px] text-text-dim/50 pt-3">{t("poi.source")}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
