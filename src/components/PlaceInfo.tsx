import { useState, useEffect } from "react";
import { X, Bird } from "lucide-react";
import { TripSummary } from "../types";
import { Lang } from "../i18n";

// ─── Clé eBird (lecture de données publiques) ─────────────────────────────────
const EBIRD_KEY = "6fuv5j5odi8b";
// ──────────────────────────────────────────────────────────────────────────────

interface BirdObs {
  comName: string;  // nom commun
  sciName: string;  // nom scientifique
  howMany?: number;
  locName?: string;
  obsDt?: string;
}

interface PlaceInfoProps {
  trip: TripSummary;
  lang: Lang;
  onClose: () => void;
  t: (key: string) => string;
}

export default function PlaceInfo({ trip, lang, onClose, t }: PlaceInfoProps) {
  const [birds, setBirds] = useState<BirdObs[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const keyMissing = EBIRD_KEY === ("TA_CLE_EBIRD_ICI" as string);

  useEffect(() => {
    if (keyMissing || trip.mapLat == null || trip.mapLng == null) {
      setError(true);
      setLoading(false);
      return;
    }

    // Langue des noms communs eBird (locale)
    const localeMap: Record<string, string> = {
      fr: "fr", en: "en", es: "es", it: "it", de: "de", nl: "nl",
    };
    const locale = localeMap[lang] || "en";

    // Observations récentes (14 derniers jours, rayon 25 km)
    const url = `https://api.ebird.org/v2/data/obs/geo/recent?lat=${trip.mapLat}&lng=${trip.mapLng}&dist=25&back=14&maxResults=60&sppLocale=${locale}`;

    fetch(url, { headers: { "X-eBirdApiToken": EBIRD_KEY } })
      .then((r) => {
        if (!r.ok) throw new Error("ebird");
        return r.json();
      })
      .then((obs: BirdObs[]) => {
        // Dédoublonne par espèce, garde la 1ère observation de chaque
        const seen = new Set<string>();
        const unique: BirdObs[] = [];
        for (const o of obs) {
          if (o.comName && !seen.has(o.comName)) {
            seen.add(o.comName);
            unique.push(o);
          }
        }
        setBirds(unique);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, [trip.slug, lang]);

  return (
    <div className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center p-3 overflow-y-auto">
      <div className="relative w-full max-w-lg bg-[#1c1b1b] rounded-2xl overflow-hidden border border-white/10 my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 sticky top-0 bg-[#1c1b1b] z-10">
          <div className="flex items-center gap-2">
            <Bird size={16} className="text-brand-sand" />
            <span className="font-display font-bold text-sm text-white uppercase tracking-wider">
              {t("birds.title")}
            </span>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center text-white cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-5">
          {/* Sous-titre : lieu */}
          <p className="font-mono text-[10px] text-text-dim mb-4">
            {trip.startCity || trip.title} · {t("birds.subtitle")}
          </p>

          {loading && (
            <div className="py-16 text-center">
              <Bird size={24} className="text-brand-sand mx-auto mb-3 animate-pulse" />
              <p className="font-mono text-[10px] text-brand-sand uppercase tracking-widest animate-pulse">
                {t("birds.loading")}
              </p>
            </div>
          )}

          {error && !loading && (
            <div className="py-16 text-center">
              <p className="font-mono text-xs text-text-dim">
                {keyMissing ? t("birds.config") : t("birds.error")}
              </p>
            </div>
          )}

          {!loading && !error && birds.length === 0 && (
            <div className="py-16 text-center">
              <p className="font-mono text-xs text-text-dim">{t("birds.none")}</p>
            </div>
          )}

          {!loading && !error && birds.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {birds.map((b, i) => (
                <div key={i} className="flex items-baseline justify-between py-2 border-b border-white/5">
                  <span className="text-sm text-text-on font-light">{b.comName}</span>
                  <span className="font-mono text-[9px] text-text-dim/60 italic ml-3 text-right">{b.sciName}</span>
                </div>
              ))}
              <p className="font-mono text-[8px] text-text-dim/50 pt-3">
                {t("birds.source")}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
