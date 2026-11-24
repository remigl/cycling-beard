import { useEffect, useState } from "react";
import { X, Star, MapPin, BookOpen } from "lucide-react";
import { TripSummary } from "../types";
import { Lang } from "../i18n";
import { wikiForPlaces, wikiUrl, WikiInfo } from "../lib/wiki";
import { placeKindLabel } from "../lib/placeKinds";

interface TopRatedInfoProps {
  trip: TripSummary;
  lang: Lang;
  onClose: () => void;
  t: (key: string) => string;
}

// Traduit le premier "type" Google Places en libellé court et lisible

export default function TopRatedInfo({ trip, lang, onClose, t }: TopRatedInfoProps) {
  const places = trip.topRatedPlaces || [];
  // Classement = Google ; description = introduction Wikipédia (non réécrite)
  const [wiki, setWiki] = useState<(WikiInfo | null)[]>([]);
  const [loading, setLoading] = useState(places.length > 0);
  useEffect(() => {
    let cancelled = false;
    setWiki([]);
    setLoading(places.length > 0);
    wikiForPlaces(places, trip.endCity || trip.startCity || "", lang)
      .then(w => { if (!cancelled) setWiki(w); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip.slug, lang]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center p-3" onClick={onClose}>
      <div className="relative w-full max-w-lg bg-[#1c1b1b] rounded-2xl border border-white/10 flex flex-col max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Star size={16} className="text-brand-sand shrink-0" />
            <div className="min-w-0">
              <div className="font-display font-bold text-sm text-white uppercase tracking-wider truncate">{t("toprated.title")}</div>
              <div className="font-mono text-[9px] text-text-dim truncate">{trip.endCity || trip.startCity || trip.title} · {t("toprated.subtitle")}</div>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center text-white cursor-pointer shrink-0 ml-2">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4">
          {places.length === 0 && (
            <p className="font-mono text-xs text-text-dim py-8 text-center">{t("toprated.none")}</p>
          )}
          {places.length > 0 && (
            <div className="flex flex-col gap-2">
              {places.map((p, i) => {
                const href = p.mapsUrl || `https://www.google.com/maps/search/${encodeURIComponent(p.title)}`;
                const w = wiki[i];
                return (
                  <div key={i} className="flex items-start gap-3 py-3 border-b border-white/5">
                    <div className="w-14 h-14 rounded-lg overflow-hidden bg-white/5 shrink-0 flex items-center justify-center">
                      {w?.thumb
                        ? <img src={w.thumb} alt={p.title} loading="lazy" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        : <MapPin size={16} className="text-white/30" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <a href={href} target="_blank" rel="noopener noreferrer" className="text-sm text-text-on font-medium hover:text-brand-sand transition-colors">
                        {p.title}
                      </a>
                      {p.localName && <div className="text-[10px] text-text-dim/70 truncate" lang="und">{p.localName}</div>}
                      {/* Google : note, nombre d'avis, type */}
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="flex items-center gap-1 font-mono text-[10px] text-brand-sand">
                          <Star size={10} className="fill-brand-sand" /> {p.rating.toFixed(1)}
                        </span>
                        <span className="font-mono text-[9px] text-text-dim/70">({p.ratingCount})</span>
                        {placeKindLabel(p.types, lang) && (
                          <span className="font-mono text-[9px] text-text-dim/70">· {placeKindLabel(p.types, lang)}</span>
                        )}
                      </div>
                      {/* Wikipédia : introduction de l'article, telle quelle */}
                      {w?.desc && (
                        <p className="text-[11px] text-text-dim leading-snug mt-1.5 font-light">{w.desc}</p>
                      )}
                      {w && (
                        <a href={wikiUrl(lang, w.title)} target="_blank" rel="noopener noreferrer"
                           className="inline-flex items-center gap-1 mt-1 font-mono text-[9px] text-brand-teal hover:underline">
                          <BookOpen size={10} /> Wikipédia
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
              {loading && <p className="font-mono text-[9px] text-brand-sand/70 animate-pulse pt-2">…</p>}
              <p className="font-mono text-[8px] text-text-dim/50 pt-3">Google Places · Wikipédia</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

