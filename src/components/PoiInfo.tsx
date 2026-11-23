import { useState, useEffect } from "react";
import { X, MapPin } from "lucide-react";
import { TripSummary, Poi } from "../types";
import { Lang } from "../i18n";
import { wikiForPlaces, wikiUrl } from "../lib/wiki";

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

export default function PoiInfo({ trip, lang, onClose, t }: PoiInfoProps) {
  const basePois: Poi[] = trip.pois || [];
  const [pois, setPois] = useState<PoiView[]>(basePois);
  const [loading, setLoading] = useState(basePois.length > 0);


  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Enrichit avec photo + description Wikipédia (introduction de l'article,
  // non modifiée), dans la langue choisie. Voir lib/wiki.
  useEffect(() => {
    let cancelled = false;
    setPois(basePois);
    setLoading(basePois.length > 0);
    wikiForPlaces(basePois, trip.endCity || trip.startCity || "", lang)
      .then(infos => {
        if (cancelled) return;
        setPois(basePois.map((p, i) => infos[i]
          ? { ...p, thumb: infos[i]!.thumb, desc: infos[i]!.desc, wikiTitle: infos[i]!.title }
          : p));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
                  ? wikiUrl(lang, p.wikiTitle)
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
