import { X, UtensilsCrossed } from "lucide-react";
import { useEffect } from "react";
import { TripSummary, Specialty } from "../types";
import { Lang } from "../i18n";

interface FoodInfoProps {
  trip: TripSummary;
  lang: Lang;
  onClose: () => void;
  t: (key: string) => string;
}

export default function FoodInfo({ trip, lang, onClose, t }: FoodInfoProps) {
  const specialties: Specialty[] = trip.specialties || [];
  const dbg = `${specialties.length} plats · 1er: ${specialties[0]?.title || "—"} · img:${specialties[0]?.image ? "oui" : "non"} · wiki:${specialties[0]?.wikipedia ? "oui" : "non"}`;

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const wikiLang = ["en", "fr", "es", "it", "de", "nl"].includes(lang) ? lang : "en";

  return (
    <div className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center p-3" onClick={onClose}>
      <div className="relative w-full max-w-lg bg-[#1c1b1b] rounded-2xl border border-white/10 flex flex-col max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <UtensilsCrossed size={16} className="text-brand-sand shrink-0" />
            <div className="min-w-0">
              <div className="font-display font-bold text-sm text-white uppercase tracking-wider truncate">{t("food.title")}</div>
              <div className="font-mono text-[9px] text-text-dim truncate">{trip.endCity || trip.region || trip.title} · {t("food.subtitle")}</div>
              <div className="font-mono text-[8px] text-red-400 truncate">{dbg}</div>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center text-white cursor-pointer shrink-0 ml-2">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4">
          {specialties.length === 0 && (
            <p className="font-mono text-xs text-text-dim py-8 text-center">{t("food.none")}</p>
          )}
          {specialties.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {specialties.map((s, i) => {
                const href = s.wikipedia || `https://${wikiLang}.wikipedia.org/wiki/${encodeURIComponent(s.title)}`;
                return (
                  <a
                    key={i}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex flex-col rounded-xl overflow-hidden bg-white/[0.03] border border-white/5 hover:border-brand-sand/40 transition-colors"
                  >
                    <div className="aspect-[4/3] bg-white/5 overflow-hidden flex items-center justify-center">
                      {s.image ? (
                        <img src={s.image} alt={s.title} loading="lazy" referrerPolicy="no-referrer"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                      ) : (
                        <UtensilsCrossed size={20} className="text-white/15" />
                      )}
                    </div>
                    <div className="px-2.5 py-2">
                      <span className="text-xs text-text-on font-medium leading-tight line-clamp-2">{s.title}</span>
                    </div>
                  </a>
                );
              })}
            </div>
          )}
          {specialties.length > 0 && (
            <p className="font-mono text-[8px] text-text-dim/50 pt-3">Wikidata · Wikipédia</p>
          )}
        </div>
      </div>
    </div>
  );
}
