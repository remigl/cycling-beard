import { useState, useEffect } from "react";
import { X, MapPin } from "lucide-react";
import { TripSummary, Poi } from "../types";
import { Lang } from "../i18n";

interface PoiView extends Poi {
  thumb?: string | null;
  desc?: string | null;
}

interface PoiInfoProps {
  trip: TripSummary;
  lang: Lang;
  onClose: () => void;
  t: (key: string) => string;
}

// Extrait image + description courte d'une page Wikipédia (format API)
function extractPage(pg: any): { thumb: string | null; desc: string | null } {
  let desc = (pg.extract || "").replace(/\s+/g, " ").trim();
  if (desc.length > 160) desc = desc.slice(0, 157) + "…";
  let thumb = pg.thumbnail?.source || null;
  if (thumb && /(Localisation|location_map|_map|\.svg)/i.test(thumb)) thumb = null;
  return { thumb, desc: desc || null };
}

export default function PoiInfo({ trip, lang, onClose, t }: PoiInfoProps) {
  const basePois: Poi[] = trip.pois || [];
  const [pois, setPois] = useState<PoiView[]>(basePois);
  const [loading, setLoading] = useState(basePois.length > 0);

  const wikiLang = ["en", "fr", "es", "it", "de", "nl"].includes(lang) ? lang : "en";

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Enrichit avec photo + description Wikipédia. Les POI taggés wiki (depuis OSM)
  // sont récupérés en lot ; ceux sans tag sont cherchés par leur nom sur Wikipédia.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const enriched: Record<number, { thumb: string | null; desc: string | null; wikiTitle: string | null }> = {};

        // 1) POI avec tag wiki → requête en lot par titres
        const tagged = basePois.map((p, i) => ({ p, i })).filter(x => x.p.wikiTitle);
        if (tagged.length) {
          const titles = tagged.map(x => x.p.wikiTitle!) as string[];
          const url = `https://${wikiLang}.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(titles.slice(0, 40).join("|"))}&prop=extracts|pageimages&exintro=1&explaintext=1&exsentences=2&pithumbsize=160&format=json&origin=*&redirects=1`;
          try {
            const res = await fetch(url);
            const data = res.ok ? await res.json() : null;
            const pages = data?.query?.pages || {};
            const byTitle: Record<string, { thumb: string | null; desc: string | null }> = {};
            for (const k of Object.keys(pages)) {
              const pg = pages[k];
              byTitle[pg.title] = extractPage(pg);
            }
            for (const { p, i } of tagged) {
              const m = p.wikiTitle && byTitle[p.wikiTitle];
              if (m) enriched[i] = { ...m, wikiTitle: p.wikiTitle! };
            }
          } catch {}
        }

        // 2) POI SANS tag wiki → recherche par nom (une requête chacun, en parallèle limité)
        const untagged = basePois.map((p, i) => ({ p, i })).filter(x => !x.p.wikiTitle);
        await Promise.all(untagged.map(async ({ p, i }) => {
          try {
            // generator=search : trouve la page la plus pertinente pour ce nom
            const url = `https://${wikiLang}.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(p.title)}&gsrlimit=1&prop=extracts|pageimages&exintro=1&explaintext=1&exsentences=2&pithumbsize=160&format=json&origin=*`;
            const res = await fetch(url);
            const data = res.ok ? await res.json() : null;
            const pages = data?.query?.pages || {};
            const first = Object.values(pages)[0] as any;
            if (first) {
              const ex = extractPage(first);
              enriched[i] = { ...ex, wikiTitle: first.title || null };
            }
          } catch {}
        }));

        if (cancelled) return;
        setPois(basePois.map((p, i) => enriched[i]
          ? { ...p, thumb: enriched[i].thumb, desc: enriched[i].desc, wikiTitle: enriched[i].wikiTitle || p.wikiTitle }
          : p));
      } catch {}
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
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
          {pois.length === 0 && (
            <p className="font-mono text-xs text-text-dim py-8 text-center">{t("poi.none")}</p>
          )}
          {pois.length > 0 && (
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
              {loading && <p className="font-mono text-[9px] text-brand-sand/70 animate-pulse pt-2">…</p>}
              <p className="font-mono text-[8px] text-text-dim/50 pt-3">OpenStreetMap · Wikipédia</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
