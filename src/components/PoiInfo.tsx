import { useState, useEffect } from "react";
import { X, MapPin } from "lucide-react";
import { TripSummary } from "../types";
import { Lang } from "../i18n";

interface Poi {
  title: string;
  dist: number;        // mètres
  thumb?: string | null;
  desc?: string | null;
  kind: string;        // type de lieu (musée, château…)
  rank: number;        // priorité touristique (plus haut = mieux)
  wikiTitle?: string | null;
}

interface PoiInfoProps {
  trip: TripSummary;
  lang: Lang;
  onClose: () => void;
  t: (key: string) => string;
}

// Distance Haversine en mètres
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000, toRad = (d: number) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Priorité touristique selon le type OSM (plus haut = lieu majeur à visiter)
function rankOf(tags: Record<string, string>): { rank: number; kind: string } {
  const h = tags.historic, to = tags.tourism, l = tags.leisure, a = tags.amenity, n = tags.natural;
  if (to === "attraction") return { rank: 10, kind: "Attraction" };
  if (h === "castle" || h === "fort" || h === "city_gate") return { rank: 10, kind: "Château / fort" };
  if (to === "museum" || to === "gallery") return { rank: 9, kind: "Musée" };
  if (h === "monument" || h === "memorial" || h === "ruins" || h === "archaeological_site") return { rank: 8, kind: "Monument / ruines" };
  if (to === "viewpoint") return { rank: 8, kind: "Point de vue" };
  if (a === "place_of_worship" || h === "church" || h === "monastery") return { rank: 7, kind: "Édifice religieux" };
  if (to === "artwork") return { rank: 6, kind: "Œuvre / art" };
  if (l === "park" || to === "park") return { rank: 5, kind: "Parc" };
  if (n === "waterfall" || n === "peak" || n === "cave_entrance") return { rank: 6, kind: "Site naturel" };
  if (to === "theme_park" || to === "zoo" || to === "aquarium") return { rank: 7, kind: "Parc à thème / zoo" };
  return { rank: 0, kind: "" };
}

export default function PoiInfo({ trip, lang, onClose, t }: PoiInfoProps) {
  const [pois, setPois] = useState<Poi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [dbg, setDbg] = useState("");

  const wikiLang = ["en", "fr", "es", "it", "de", "nl"].includes(lang) ? lang : "en";

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    if (trip.mapLat == null || trip.mapLng == null) { setDbg("pas de coordonnées pour cette étape"); setError(true); setLoading(false); return; }
    const lat = trip.mapLat, lng = trip.mapLng;

    const run = async () => {
      try {
        setDbg(`coords ${lat.toFixed(3)},${lng.toFixed(3)} — requête…`);
        const radius = 12000;
        const q = `[out:json][timeout:25];(node["tourism"~"attraction|museum|gallery|viewpoint|artwork|theme_park|zoo|aquarium"](around:${radius},${lat},${lng});way["tourism"~"attraction|museum|gallery|viewpoint|theme_park|zoo"](around:${radius},${lat},${lng});node["historic"~"castle|fort|monument|memorial|ruins|archaeological_site|city_gate|church|monastery"](around:${radius},${lat},${lng});way["historic"~"castle|fort|monument|ruins|archaeological_site"](around:${radius},${lat},${lng});node["natural"~"waterfall|peak|cave_entrance"](around:${radius},${lat},${lng}););out center 80;`;

        // Plusieurs miroirs Overpass : si l'un échoue (down, CORS, surcharge),
        // on passe au suivant. Ça règle les "Failed to fetch".
        const mirrors = [
          "https://overpass-api.de/api/interpreter",
          "https://overpass.kumi.systems/api/interpreter",
          "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
          "https://overpass.private.coffee/api/interpreter",
        ];
        let data: any = null;
        for (const url of mirrors) {
          try {
            setDbg(`essai ${url.split("/")[2]}…`);
            const res = await fetch(url, {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: "data=" + encodeURIComponent(q),
            });
            if (!res.ok) { continue; }
            data = await res.json();
            break;
          } catch { /* miroir suivant */ }
        }
        if (!data) { setDbg("tous les miroirs Overpass ont échoué (réseau/CORS)"); setError(true); setLoading(false); return; }
        const elements = data.elements || [];
        setDbg(`${elements.length} éléments OSM bruts`);
        if (elements.length === 0) { setError(true); setLoading(false); return; }

        // 2. Transforme en POI, calcule distance + rang, garde ceux qui ont un nom
        const seen = new Set<string>();
        let list: Poi[] = [];
        for (const el of elements) {
          const tags = el.tags || {};
          const name = tags["name:" + wikiLang] || tags.name;
          if (!name || seen.has(name)) continue;
          const { rank, kind } = rankOf(tags);
          if (rank === 0) continue;
          const elat = el.lat ?? el.center?.lat, elng = el.lon ?? el.center?.lon;
          if (elat == null || elng == null) continue;
          seen.add(name);
          // lien Wikipédia si le tag existe (ex: "fr:Château de X")
          let wikiTitle: string | null = null;
          if (tags.wikipedia) {
            const parts = tags.wikipedia.split(":");
            wikiTitle = parts.length > 1 ? parts.slice(1).join(":") : tags.wikipedia;
          }
          list.push({
            title: name,
            dist: haversine(lat, lng, elat, elng),
            kind, rank,
            thumb: null, desc: null,
            wikiTitle,
          });
        }

        // 3. Tri : lieux majeurs d'abord, puis les plus proches
        list.sort((a, b) => (b.rank - a.rank) || (a.dist - b.dist));
        list = list.slice(0, 18);
        setDbg(`${list.length} sites retenus`);

        // 4. Enrichit avec photo + description Wikipédia (pour ceux qui ont un lien wiki)
        const wikiTitles = list.filter(p => p.wikiTitle).map(p => p.wikiTitle!) as string[];
        if (wikiTitles.length) {
          try {
            const exUrl = `https://${wikiLang}.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(wikiTitles.slice(0, 40).join("|"))}&prop=extracts|pageimages&exintro=1&explaintext=1&exsentences=2&pithumbsize=120&format=json&origin=*&redirects=1`;
            const exRes = await fetch(exUrl);
            const exData = exRes.ok ? await exRes.json() : null;
            const pages = exData?.query?.pages || {};
            const byTitle: Record<string, { thumb: string | null; desc: string | null }> = {};
            for (const k of Object.keys(pages)) {
              const pg = pages[k];
              let desc = (pg.extract || "").replace(/\s+/g, " ").trim();
              if (desc.length > 160) desc = desc.slice(0, 157) + "…";
              let thumb = pg.thumbnail?.source || null;
              if (thumb && /(Localisation|location_map|_map|\.svg)/i.test(thumb)) thumb = null;
              byTitle[pg.title] = { thumb, desc: desc || null };
            }
            list = list.map(p => {
              if (p.wikiTitle && byTitle[p.wikiTitle]) {
                return { ...p, thumb: byTitle[p.wikiTitle].thumb, desc: byTitle[p.wikiTitle].desc };
              }
              return p;
            });
          } catch { /* enrichissement optionnel */ }
        }

        setPois(list);
        setLoading(false);
      } catch (e: any) {
        setDbg(d => (d || "") + " | catch: " + (e?.message || "?"));
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
            <div className="py-8 text-center">
              <p className="font-mono text-xs text-text-dim">{t("poi.none")}</p>
              {dbg && <p className="font-mono text-[9px] text-red-400 mt-2 break-all">{dbg}</p>}
            </div>
          )}
          {!loading && !error && pois.length > 0 && (
            <div className="flex flex-col gap-2">
              {pois.map((p, i) => {
                const href = p.wikiTitle
                  ? `https://${wikiLang}.wikipedia.org/wiki/${encodeURIComponent(p.wikiTitle)}`
                  : `https://www.google.com/maps/search/${encodeURIComponent(p.title)}`;
                return (
                  <a
                    key={i}
                    href={href}
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
                      {p.kind && <div className="font-mono text-[9px] text-text-dim/70 mt-0.5">{p.kind}</div>}
                      {p.desc && <p className="text-[11px] text-text-dim leading-snug mt-1 font-light">{p.desc}</p>}
                    </div>
                  </a>
                );
              })}
              <p className="font-mono text-[8px] text-text-dim/50 pt-3">OpenStreetMap · Wikipédia</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
