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
  locName?: string;
  count?: number;        // nombre d'observations (fréquence)
  totalSeen?: number;    // total d'individus vus (cumul)
  thumb?: string | null; // vignette Wikipedia
  desc?: string | null;  // courte description Wikipedia
}

interface PlaceInfoProps {
  trip: TripSummary;
  lang: Lang;
  onClose: () => void;
  t: (key: string) => string;
}

// Récupère vignette + courte description Wikipedia depuis le nom scientifique
async function fetchWiki(sciName: string, lang: string): Promise<{ thumb: string | null; desc: string | null }> {
  try {
    const url = `https://${lang}.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(sciName)}&prop=pageimages|extracts&pithumbsize=120&exintro=1&explaintext=1&exsentences=2&format=json&origin=*&redirects=1`;
    const res = await fetch(url);
    if (!res.ok) return { thumb: null, desc: null };
    const data = await res.json();
    const pages = data.query?.pages || {};
    for (const k of Object.keys(pages)) {
      const thumb = pages[k]?.thumbnail?.source || null;
      let desc = pages[k]?.extract || null;
      if (desc) {
        desc = desc.replace(/\s+/g, " ").trim();
        if (desc.length > 180) desc = desc.slice(0, 177) + "…";
      }
      return { thumb, desc };
    }
    return { thumb: null, desc: null };
  } catch {
    return { thumb: null, desc: null };
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
        // Compte la fréquence réelle + cumule les infos d'observation par espèce
        const freq = new Map<string, BirdObs & { count: number; totalSeen: number }>();
        for (const o of obs) {
          if (!o.comName) continue;
          const existing = freq.get(o.comName);
          if (existing) {
            existing.count += 1;
            existing.totalSeen += (o.howMany || 0);
            // Garde l'observation la plus récente pour la date/lieu
            if (o.obsDt && (!existing.obsDt || o.obsDt > existing.obsDt)) {
              existing.obsDt = o.obsDt;
              existing.locName = o.locName;
            }
          } else {
            freq.set(o.comName, { ...o, count: 1, totalSeen: o.howMany || 0 });
          }
        }
        // Trie par fréquence décroissante
        const sorted = Array.from(freq.values()).sort((a, b) => b.count - a.count);
        setBirds(sorted);
        setLoading(false);

        // Charge vignette + description Wikipedia en parallèle
        sorted.forEach(async (b, i) => {
          let info = await fetchWiki(b.sciName, locale);
          if ((!info.thumb || !info.desc) && locale !== "en") {
            const en = await fetchWiki(b.sciName, "en");
            info = { thumb: info.thumb || en.thumb, desc: info.desc || en.desc };
          }
          if (info.thumb || info.desc) {
            setBirds((prev) => {
              const next = [...prev];
              if (next[i]) next[i] = { ...next[i], thumb: info.thumb, desc: info.desc };
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
                <div key={i} className="flex items-start gap-3 py-2.5 border-b border-white/5">
                  {/* Vignette */}
                  <div className="w-14 h-14 rounded-lg overflow-hidden bg-white/5 shrink-0 flex items-center justify-center">
                    {b.thumb ? (
                      <img src={b.thumb} alt={b.comName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <Bird size={16} className="text-white/20" />
                    )}
                  </div>
                  {/* Nom + latin + description */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm text-text-on font-medium truncate">{b.comName}</span>
                      {b.count != null && b.count > 1 && (
                        <span className="font-mono text-[9px] text-brand-sand shrink-0">{b.count}×</span>
                      )}
                    </div>
                    <div className="font-mono text-[9px] text-text-dim/60 italic truncate">{b.sciName}</div>
                    {b.desc && (
                      <p className="text-[11px] text-text-dim leading-snug mt-1 font-light">{b.desc}</p>
                    )}
                    {/* Détails d'observation */}
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1.5 font-mono text-[9px] text-text-dim/70">
                      {b.totalSeen != null && b.totalSeen > 0 && (
                        <span className="text-brand-sand">{b.totalSeen} {t("birds.individuals")}</span>
                      )}
                      {b.obsDt && <span>· {fmtDate(b.obsDt)}</span>}
                      {b.locName && <span className="truncate">· {b.locName}</span>}
                    </div>
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
