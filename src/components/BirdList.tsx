import { useState, useEffect, useRef } from "react";
import { Bird, Volume2, Loader2 } from "lucide-react";
import { Lang } from "../i18n";

// ─── Clé eBird (lecture de données publiques) ─────────────────────────────────
const EBIRD_KEY = "6fuv5j5odi8b";
// Clé Xeno-canto API v3 (chants d'oiseaux). Crée-la gratuitement sur
// xeno-canto.org → page de compte → API Keys, puis colle-la ici.
const XC_KEY = "00bd53d71e66c252690677702a08080dd43e959f";
// ──────────────────────────────────────────────────────────────────────────────

interface BirdObs {
  comName: string;
  sciName: string;
  howMany?: number;
  obsDt?: string;
  locName?: string;
  count?: number;
  totalSeen?: number;
  thumb?: string | null;
  desc?: string | null;
}

interface BirdListProps {
  lat?: number | null;
  lng?: number | null;
  lang: Lang;
  t: (key: string) => string;
}

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

export default function BirdList({ lat, lng, lang, t }: BirdListProps) {
  const [birds, setBirds] = useState<BirdObs[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Chant des oiseaux (Xeno-canto) ──
  // Lecture à la demande : un clic récupère un enregistrement du chant de l'espèce
  // (par nom scientifique) et le joue. Un seul son à la fois.
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);   // sciName en cours
  const [loadingSong, setLoadingSong] = useState<string | null>(null);
  const [songErr, setSongErr] = useState<string | null>(null);
  const songCache = useRef<Map<string, string | null>>(new Map());

  const stopSong = () => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    setPlaying(null);
  };

  const fetchSongUrl = async (sciName: string): Promise<string | null> => {
    if (songCache.current.has(sciName)) return songCache.current.get(sciName)!;
    try {
      // API v3 : nécessite une clé. On filtre sur les chants ("song"), qualité A.
      const q = encodeURIComponent(`${sciName} type:song q:A`);
      let res = await fetch(`https://xeno-canto.org/api/3/recordings?query=${q}&key=${XC_KEY}`);
      if (!res.ok) { setSongErr(`HTTP ${res.status}`); }
      let data = await res.json();
      // Repli : sans filtre type/qualité
      if (!data.recordings || data.recordings.length === 0) {
        res = await fetch(`https://xeno-canto.org/api/3/recordings?query=${encodeURIComponent(sciName)}&key=${XC_KEY}`);
        data = await res.json();
      }
      const rec = data.recordings && data.recordings[0];
      if (!rec) { setSongErr("aucun enregistrement"); }
      let url: string | null = rec?.file || null;
      if (url && url.startsWith("//")) url = "https:" + url;
      songCache.current.set(sciName, url);
      return url;
    } catch (e: any) {
      setSongErr("erreur: " + (e?.message || "réseau/CORS"));
      songCache.current.set(sciName, null);
      return null;
    }
  };

  const toggleSong = async (sciName: string) => {
    if (playing === sciName) { stopSong(); return; }
    stopSong();
    setSongErr(null);
    setLoadingSong(sciName);
    const url = await fetchSongUrl(sciName);
    setLoadingSong(null);
    if (!url) return; // pas d'enregistrement trouvé
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.onended = () => setPlaying(null);
    audio.play().then(() => setPlaying(sciName)).catch((e) => { setSongErr("audio: " + (e?.message || "lecture refusée")); setPlaying(null); });
  };

  // Stoppe le son si le composant est démonté
  useEffect(() => () => stopSong(), []);

  const [error, setError] = useState(false);

  const keyMissing = EBIRD_KEY === ("TA_CLE_EBIRD_ICI" as string);

  useEffect(() => {
    if (keyMissing || lat == null || lng == null) {
      setError(true);
      setLoading(false);
      return;
    }
    const localeMap: Record<string, string> = { fr: "fr", en: "en", es: "es", it: "it", de: "de", nl: "nl" };
    const locale = localeMap[lang] || "en";
    const url = `https://api.ebird.org/v2/data/obs/geo/recent?lat=${lat}&lng=${lng}&dist=25&back=14&maxResults=40&sppLocale=${locale}`;

    fetch(url, { headers: { "X-eBirdApiToken": EBIRD_KEY } })
      .then((r) => { if (!r.ok) throw new Error("ebird"); return r.json(); })
      .then(async (obs: BirdObs[]) => {
        const freq = new Map<string, BirdObs & { count: number; totalSeen: number }>();
        for (const o of obs) {
          if (!o.comName) continue;
          const existing = freq.get(o.comName);
          if (existing) {
            existing.count += 1;
            existing.totalSeen += (o.howMany || 0);
            if (o.obsDt && (!existing.obsDt || o.obsDt > existing.obsDt)) {
              existing.obsDt = o.obsDt;
              existing.locName = o.locName;
            }
          } else {
            freq.set(o.comName, { ...o, count: 1, totalSeen: o.howMany || 0 });
          }
        }
        const sorted = Array.from(freq.values()).sort((a, b) => b.count - a.count);
        setBirds(sorted);
        setLoading(false);

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
  }, [lat, lng, lang]);

  const fmtDate = (dt?: string) => {
    if (!dt) return "";
    const d = new Date(dt.replace(" ", "T"));
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString(lang, { day: "numeric", month: "short" });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 mb-1">
        <Bird size={16} className="text-brand-sand" />
        <h4 className="font-display font-bold text-xs uppercase text-text-on tracking-wider">{t("birds.title")}</h4>
      </div>
      <p className="font-mono text-[10px] text-text-dim -mt-2">{t("birds.subtitle")}</p>
      {songErr && <p className="font-mono text-[10px] text-red-400 mt-1">🔊 {songErr}</p>}

      {loading && (
        <div className="py-12 text-center">
          <Bird size={24} className="text-brand-sand mx-auto mb-3 animate-pulse" />
          <p className="font-mono text-[10px] text-brand-sand uppercase tracking-widest animate-pulse">{t("birds.loading")}</p>
        </div>
      )}

      {error && !loading && (
        <p className="font-mono text-xs text-text-dim py-8 text-center">{keyMissing ? t("birds.config") : t("birds.error")}</p>
      )}

      {!loading && !error && birds.length === 0 && (
        <p className="font-mono text-xs text-text-dim py-8 text-center">{t("birds.none")}</p>
      )}

      {!loading && !error && birds.length > 0 && (
        <div className="flex flex-col gap-2">
          {birds.map((b, i) => (
            <div key={i} className="flex items-start gap-3 py-2.5 border-b border-white/5">
              <div className="w-14 h-14 rounded-lg overflow-hidden bg-white/5 shrink-0 flex items-center justify-center">
                {b.thumb ? (
                  <img src={b.thumb} alt={b.comName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <Bird size={16} className="text-white/20" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm text-text-on font-medium truncate">{b.comName}</span>
                  {b.count != null && b.count > 1 && (
                    <span className="font-mono text-[9px] text-brand-sand shrink-0">{b.count}×</span>
                  )}
                  <button
                    onClick={() => toggleSong(b.sciName)}
                    aria-label={t("birds.listen")}
                    className={`shrink-0 ml-auto inline-flex items-center justify-center w-7 h-7 rounded-full border transition-all cursor-pointer ${
                      playing === b.sciName
                        ? "bg-brand-sand text-bg-dark border-brand-sand"
                        : "border-brand-sand/40 text-brand-sand hover:bg-brand-sand/15"
                    }`}
                  >
                    {loadingSong === b.sciName
                      ? <Loader2 size={13} className="animate-spin" />
                      : <Volume2 size={13} />}
                  </button>
                </div>
                <div className="font-mono text-[9px] text-text-dim/60 italic truncate">{b.sciName}</div>
                {b.desc && <p className="text-[11px] text-text-dim leading-snug mt-1 font-light">{b.desc}</p>}
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
  );
}
