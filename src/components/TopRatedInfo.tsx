import { useEffect } from "react";
import { X, Star, MapPin } from "lucide-react";
import { TripSummary } from "../types";

interface TopRatedInfoProps {
  trip: TripSummary;
  onClose: () => void;
  t: (key: string) => string;
}

// Traduit le premier "type" Google Places en libellé court et lisible
function typeLabel(types: string[]): string {
  if (!types || types.length === 0) return "";
  const t = types[0].replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export default function TopRatedInfo({ trip, onClose, t }: TopRatedInfoProps) {
  const places = trip.topRatedPlaces || [];

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
                return (
                  <a
                    key={i}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 py-2.5 border-b border-white/5 hover:bg-white/[0.03] transition-colors -mx-2 px-2 rounded"
                  >
                    <div className="w-10 h-10 rounded-full bg-white/5 shrink-0 flex items-center justify-center">
                      <MapPin size={16} className="text-white/30" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm text-text-on font-medium truncate">{p.title}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="flex items-center gap-1 font-mono text-[10px] text-brand-sand">
                          <Star size={10} className="fill-brand-sand" /> {p.rating.toFixed(1)}
                        </span>
                        <span className="font-mono text-[9px] text-text-dim/70">({p.ratingCount})</span>
                        {typeLabel(p.types) && (
                          <span className="font-mono text-[9px] text-text-dim/70">· {typeLabel(p.types)}</span>
                        )}
                      </div>
                    </div>
                  </a>
                );
              })}
              <p className="font-mono text-[8px] text-text-dim/50 pt-3">Google Places</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

