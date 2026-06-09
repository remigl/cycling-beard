import { useState, useEffect } from "react";
import { X, MapPin } from "lucide-react";
import { TripSummary } from "../types";
import { Lang } from "../i18n";

interface Poi {
  name: string;
  dist: number;        // mètres
  kind: string;        // type OSM (château, musée…)
  wikipedia?: string;  // tag wikipedia OSM (ex "fr:Besançon")
  thumb?: string | null;
  desc?: string | null;
}

interface PoiInfoProps {
  trip: TripSummary;
  lang: Lang;
  onClose: () => void;
  t: (key: string) => string;
}

// Distance haversine en mètres
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Image + description Wikipedia depuis un titre d'article
async function fetchWiki(title: string, lang: string): Promise<{ thumb: string | null; desc: string | null }> {
  try {
    const url = `https://${lang}.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=pageimages|extracts&pithumbsize=120&exintro=1&explaintext=1&exsentences=2&format=json&origin=*&redirects=1`;
    const res = await fetch(url);
    if (!res.ok) return { thumb: null, desc: null };
    const data = await res.json();
    const pages = data.query?.pages || {};
    for (const k of Object.keys(pages)) {
      const thumb = pages[k]?.thumbnail?.source || null;
      let desc = pages[k]?.extract || null;
      if (desc) { desc = desc.replace(/\s+/g, " ").trim(); if (desc.length > 160) desc = desc.slice(0, 157) + "…"; }
      return { thumb, desc };
    }
    return { thumb: null, desc: null };
  } catch {
    return { thumb: null, desc: null };
  }
}

// Joli libellé du type de lieu
function kindLabel(tags: any): string {
  if (tags.tourism === "museum") return "Musée";
  if (tags.historic === "castle" || tags.castle_type) return "Château";
  if (tags.historic === "monument" || tags.historic === "memorial") return "Monument";
  if (tags.historic === "ruins") return "Ruines";
  if (tags.tourism === "viewpoint") return "Point de vue";
  if (tags.tourism === "attraction") return "Attraction";
  if (tags.natural) return "Site naturel";
  if (tags.historic) return "Patrimoine";
  if (tags.amenity === "place_of_worship" || tags.building === "church") return "Édifice religieux";
  return "Site";
}

export default function PoiInfo({ trip, lang, onClose, t }: PoiInfoProps) {
  const [pois, setPois] = useState<Poi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const wikiLang = ["en", "fr", "es", "it", "de", "nl"].includes(lang) ? lang : "en";

  useEffect(() => {
    if (trip.mapLat == null || trip.mapLng == null) { setError(true); setLoading(false); return; }
    const lat = trip.mapLat, lng = trip.mapLng;

    // Requête simplifiée : nodes seulement (plus rapide), rayon 30 km
    const query = `[out:json][timeout:20];(node(around:30000,${lat},${lng})["tourism"~"museum|attraction|viewpoint"]["name"];node(around:30000,${lat},${lng})["historic"~"castle|monument|ruins|archaeological_site"]["name"];);out 80;`;

    // Plusieurs miroirs Overpass (si l'un est occupé, on essaie le suivant)
    const mirrors = [
      "https://overpass-api.de/api/interpreter",
      "https://overpass.kumi.systems/api/interpreter",
      "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    ];

    const tryFetch = async (): Promise<any> => {
      for (const url of mirrors) {
        try {
          // Timeout de 12s par miroir pour éviter le chargement infini
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 12000);
          const res = await fetch(url, {
            method: "POST",
            body: "data=" + encodeURIComponent(query),
            signal: controller.signal,
          });
          clearTimeout(timer);
          if (res.ok) return await res.json();
        } catch { /* timeout ou erreur : essaie le miroir suivant */ }
      }
      throw new Error("all mirrors failed");
    };

    tryFetch()
      .then(async (data: any) => {
        const seen = new Set<string>();
        const list: Poi[] = [];
        for (const el of data.elements || []) {
          const tags = el.tags || {};
          const name = tags.name;
          if (!name || seen.has(name)) continue;
          seen.add(name);
          const elLat = el.lat ?? el.center?.lat;
          const elLng = el.lon ?? el.center?.lon;
          if (elLat == null || elLng == null) continue;
          // Préfère le tag wikipedia dans la bonne langue
          let wiki = tags[`wikipedia:${wikiLang}`] || tags.wikipedia || "";
          list.push({
            name,
            dist: haversine(lat, lng, elLat, elLng),
            kind: kindLabel(tags),
            wikipedia: wiki,
          });
        }
        const sorted = list.sort((a, b) => a.dist - b.dist).slice(0, 15);
        if (sorted.length === 0) { setError(true); setLoading(false); return; }
        setPois(sorted);
        setLoading(false);

        // Charge image + description Wikipedia
        sorted.forEach(async (p, i) => {
          // Le tag wikipedia est de la forme "fr:Citadelle de Besançon"
          let title = p.name, articleLang = wikiLang;
          if (p.wikipedia && p.wikipedia.includes(":")) {
            const [l, ...rest] = p.wikipedia.split(":");
            if (l.length === 2) { articleLang = l; title = rest.join(":"); }
          }
          let info = await fetchWiki(title, articleLang);
          if (!info.thumb && !info.desc && articleLang !== wikiLang) info = await fetchWiki(p.name, wikiLang);
          if (info.thumb || info.desc) {
            setPois((prev) => {
              const next = [...prev];
              if (next[i]) next[i] = { ...next[i], ...info };
              return next;
            });
          }
        });
      })
      .catch(() => { setError(true); setLoading(false); });
  }, [trip.slug, lang]);

  return (
    <div className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center p-3" onClick={onClose}>
      <div className="relative w-full max-w-lg bg-[#1c1b1b] rounded-2xl border border-white/10 flex flex-col max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <MapPin size={16} className="text-brand-sand shrink-0" />
            <div className="min-w-0">
              <div className="font-display font-bold text-sm text-white uppercase tracking-wider truncate">{t("poi.title")}</div>
              <div className="font-mono text-[9px] text-text-dim truncate">{trip.startCity || trip.title} · {t("poi.subtitle")}</div>
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
            <p className="font-mono text-xs text-text-dim py-8 text-center">{t("poi.error")}</p>
          )}
          {!loading && !error && pois.length === 0 && (
            <p className="font-mono text-xs text-text-dim py-8 text-center">{t("poi.none")}</p>
          )}
          {!loading && !error && pois.length > 0 && (
            <div className="flex flex-col gap-2">
              {pois.map((p, i) => (
                <div key={i} className="flex items-start gap-3 py-2.5 border-b border-white/5">
                  <div className="w-14 h-14 rounded-lg overflow-hidden bg-white/5 shrink-0 flex items-center justify-center">
                    {p.thumb ? (
                      <img src={p.thumb} alt={p.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <MapPin size={16} className="text-white/20" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm text-text-on font-medium truncate">{p.name}</span>
                      <span className="font-mono text-[9px] text-brand-sand shrink-0">{(p.dist / 1000).toFixed(1)} km</span>
                    </div>
                    <div className="font-mono text-[9px] text-text-dim/60">{p.kind}</div>
                    {p.desc && <p className="text-[11px] text-text-dim leading-snug mt-1 font-light">{p.desc}</p>}
                  </div>
                </div>
              ))}
              <p className="font-mono text-[8px] text-text-dim/50 pt-3">{t("poi.source")}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
