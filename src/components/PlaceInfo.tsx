import { useState, useEffect } from "react";
import { X, Bird } from "lucide-react";
import { TripSummary } from "../types";
import { Lang } from "../i18n";

// ─── Clé eBird (lecture de données publiques) ─────────────────────────────────
const EBIRD_KEY = "6fuv5j5odi8b";
// ──────────────────────────────────────────────────────────────────────────────

interface BirdObs {
  comName: string;
  sciName: string;
  howMany?: number;
  obsDt?: string;
  thumb?: string | null; // vignette Wikipedia (chargée après)
}

interface PlaceInfoProps {
  trip: TripSummary;
  lang: Lang;
  onClose: () => void;
  t: (key: string) => string;
}

// Récupère une vignette Wikipedia à partir du nom scientifique
async function fetchThumb(sciName: string, lang: string): Promise<string | null> {
  try {
    const url = `https://${lang}.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(sciName)}&prop=pageimages&pithumbsize=120&format=json&origin=*&redirects=1`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const pages = data.query?.pages || {};
    for (const k of Object.keys(pages)) {
      const thumb = pages[k]?.thumbnail?.source;
      if (thumb) return thumb;
    }
    return null;
  } catch {
    return null;
  }
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

    const localeMap: Record<string, string> = { fr: "fr", en: "en", es: "es", it: "it", de: "de", nl: "nl" };
    const locale = localeMap[lang] || "en";
    const url = `https://api.ebird.org/v2/data/obs/geo/recent?lat=${trip.mapLat}&lng=${trip.mapLng}&dist=25&back=14&maxResults=40&sppLocale=${locale}`;

    fetch(url, { headers: { "X-eBirdApiToken": EBIRD_KEY } })
      .then((r) => { if (!r.ok) throw new Error("ebird"); return r.json(); })
      .then(async (obs: BirdObs[]) => {
        // Dédoublonne par espèce
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

        // Charge les vignettes Wikipedia en parallèle (langue locale, fallback latin)
        unique.forEach(async (b, i) => {
          let thumb = await fetchThumb(b.sciName, locale);
          if (!thumb && locale !== "en") thumb = await fetchThumb(b.sciName, "en");
          if (thumb) {
            setBirds((prev) => {
              const next = [...prev];
              if (next[i]) next[i] = { ...next[i], thumb };
              return next;
            });
          }
        });
      })
      .catch(() => { setError(true); setLoading(false); });
  }, [trip.slug, lang]);

  // Formate la date d'observation
  const fmtDate = (dt?: string) => {
    if (!dt) return "";
    const d = new Date(dt.replace(" ", "T"));
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString(lang, { day: "numeric", month: "short" });
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center p-3" onClick={onClose}>
      <div
        className="relative w-full max-w-lg bg-[#1c1b1b] rounded-2xl border border-white/10 flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header fixe */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Bird size={16} className="text-brand-sand shrink-0" />
            <div className="min-w-0">
              <div className="font-display font-bold text-sm text-white uppercase tracking-wider truncate">
                {t("birds.title")}
              </div>
              <div className="font-mono text-[9px] text-text-dim truncate">
                {trip.startCity || trip.title} · {t("birds.subtitle")}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center text-white cursor-pointer shrink-0 ml-2">
            <X size={18} />
          </button>
        </div>

        {/* Contenu défilable */}
        <div className="overflow-y-auto px-5 py-4">
          {loading && (
            <div className="py-16 text-center">
              <Bird size={24} className="text-brand-sand mx-auto mb-3 animate-pulse" />
              <p className="font-mono text-[10px] text-brand-sand uppercase tracking-widest animate-pulse">{t("birds.loading")}</p>
            </div>
          )}

          {error && !loading && (
            <div className="py-16 text-center">
              <p className="font-mono text-xs text-text-dim">{keyMissing ? t("birds.config") : t("birds.error")}</p>
            </div>
          )}

          {!loading && !error && birds.length === 0 && (
            <div className="py-16 text-center">
              <p className="font-mono text-xs text-text-dim">{t("birds.none")}</p>
            </div>
          )}

          {!loading && !error && birds.length > 0 && (
            <div className="flex flex-col gap-2">
              {birds.map((b, i) => (
                <div key={i} className="flex items-center gap-3 py-2 border-b border-white/5">
                  {/* Vignette */}
                  <div className="w-12 h-12 rounded-lg overflow-hidden bg-white/5 shrink-0 flex items-center justify-center">
                    {b.thumb ? (
                      <img src={b.thumb} alt={b.comName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <Bird size={16} className="text-white/20" />
                    )}
                  </div>
                  {/* Nom + latin */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-text-on font-light truncate">{b.comName}</div>
                    <div className="font-mono text-[9px] text-text-dim/60 italic truncate">{b.sciName}</div>
                  </div>
                  {/* Chiffres */}
                  <div className="text-right shrink-0">
                    {b.howMany != null && (
                      <div className="font-mono text-sm text-brand-sand font-bold">
                        {b.howMany > 0 ? `×${b.howMany}` : "✓"}
                      </div>
                    )}
                    <div className="font-mono text-[8px] text-text-dim/50">{fmtDate(b.obsDt)}</div>
                  </div>
                </div>
              ))}
              <p className="font-mono text-[8px] text-text-dim/50 pt-3">{t("birds.source")}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
