import { Calendar, TrendingUp, Mountain, Search, Tag, Box, Bird, MapPin, UtensilsCrossed, Map, X, Home, Heart } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { motion } from "motion/react";
import { TripSummary, SiteStats } from "../types";
import { Lang } from "../i18n";
import RideReplay from "./RideReplay";
import PlaceInfo from "./PlaceInfo";
import PoiInfo from "./PoiInfo";
import FoodInfo from "./FoodInfo";
import RegionMap from "./RegionMap";

interface JourneyViewProps {
  onNavigate: (tab: string, arg?: string) => void;
  trips: TripSummary[];
  stats: SiteStats | null;
  t: (key: string) => string;
  lang: Lang;
}

// Noms de pays localisés — les données du sync sont en français (Nominatim accept-language=fr)
const COUNTRY_LABELS: Record<string, Record<string, string>> = {
  France:    { en: "France",      es: "Francia",    it: "Francia",    de: "Frankreich",  nl: "Frankrijk" },
  Suisse:    { en: "Switzerland", es: "Suiza",      it: "Svizzera",   de: "Schweiz",     nl: "Zwitserland" },
  Allemagne: { en: "Germany",     es: "Alemania",   it: "Germania",   de: "Deutschland", nl: "Duitsland" },
  Autriche:  { en: "Austria",     es: "Austria",    it: "Austria",    de: "Österreich",  nl: "Oostenrijk" },
  Slovaquie: { en: "Slovakia",    es: "Eslovaquia", it: "Slovacchia", de: "Slowakei",    nl: "Slowakije" },
  Hongrie:   { en: "Hungary",     es: "Hungría",    it: "Ungheria",   de: "Ungarn",      nl: "Hongarije" },
  Croatie:   { en: "Croatia",     es: "Croacia",    it: "Croazia",    de: "Kroatien",    nl: "Kroatië" },
  Serbie:    { en: "Serbia",      es: "Serbia",     it: "Serbia",     de: "Serbien",     nl: "Servië" },
  Roumanie:  { en: "Romania",     es: "Rumanía",    it: "Romania",    de: "Rumänien",    nl: "Roemenië" },
  Bulgarie:  { en: "Bulgaria",    es: "Bulgaria",   it: "Bulgaria",   de: "Bulgarien",   nl: "Bulgarije" },
};

export default function JourneyView({ trips, t, lang }: JourneyViewProps) {
  // Traduit un nom de pays selon la langue active (les données restent en français)
  const countryLabel = (c: string) => (lang === "fr" ? c : COUNTRY_LABELS[c]?.[lang] ?? c);

  // Régions qui ont une VRAIE traduction. Celles absentes de la table gardent
  // leur nom français/local (ex : "Pays de la Loire" ne se traduit pas).
  const REGION_LABELS: Record<string, Record<string, string>> = {
    // Suisse
    "Argovie":        { en: "Aargau",          es: "Argovia",          it: "Argovia",          de: "Aargau",          nl: "Aargau" },
    "Bâle-Campagne":  { en: "Basel-Country",    es: "Basilea-Campiña",  it: "Basilea Campagna", de: "Basel-Landschaft", nl: "Bazel-Land" },
    "Bâle-Ville":     { en: "Basel-City",       es: "Basilea-Ciudad",   it: "Basilea Città",    de: "Basel-Stadt",     nl: "Bazel-Stad" },
    "Argovie (Aargau)": { en: "Aargau",         es: "Argovia",          it: "Argovia",          de: "Aargau",          nl: "Aargau" },
    "Thurgovie":      { en: "Thurgau",          es: "Turgovia",         it: "Turgovia",         de: "Thurgau",         nl: "Thurgau" },
    // Allemagne
    "Bade-Wurtemberg":{ en: "Baden-Württemberg",es: "Baden-Wurtemberg", it: "Baden-Württemberg",de: "Baden-Württemberg",nl: "Baden-Württemberg" },
    "Bavière":        { en: "Bavaria",          es: "Baviera",          it: "Baviera",          de: "Bayern",          nl: "Beieren" },
    // Autriche
    "Haute-Autriche": { en: "Upper Austria",    es: "Alta Austria",     it: "Alta Austria",     de: "Oberösterreich",  nl: "Opper-Oostenrijk" },
    "Basse-Autriche": { en: "Lower Austria",    es: "Baja Austria",     it: "Bassa Austria",    de: "Niederösterreich",nl: "Neder-Oostenrijk" },
    "Vienne":         { en: "Vienna",           es: "Viena",            it: "Vienna",           de: "Wien",            nl: "Wenen" },
    // Hongrie
    "Hongrie-Occidentale": { en: "Western Transdanubia", es: "Transdanubio Occidental", it: "Transdanubio occidentale", de: "Westtransdanubien", nl: "West-Transdanubië" },
  };
  const regionLabel = (r: string) => (lang === "fr" ? r : REGION_LABELS[r]?.[lang] ?? r);

  // Villes à EXONYME : seules les villes dont le nom change vraiment selon la
  // langue (Ratisbonne/Regensburg…). 95 % des villes n'en ont pas → elles gardent
  // leur nom local. La clé est le nom français (tel que renvoyé par le géocodage).
  const CITY_LABELS: Record<string, Record<string, string>> = {
    "Ratisbonne": { en: "Regensburg", es: "Ratisbona",  it: "Ratisbona", de: "Regensburg", nl: "Regensburg" },
    "Vienne":     { en: "Vienna",     es: "Viena",      it: "Vienna",    de: "Wien",       nl: "Wenen" },
    "Bâle":       { en: "Basel",      es: "Basilea",    it: "Basilea",   de: "Basel",      nl: "Bazel" },
    "Genève":     { en: "Geneva",     es: "Ginebra",    it: "Ginevra",   de: "Genf",       nl: "Genève" },
    "Belgrade":   { en: "Belgrade",   es: "Belgrado",   it: "Belgrado",  de: "Belgrad",    nl: "Belgrado" },
    "Budapest":   { en: "Budapest",   es: "Budapest",   it: "Budapest",  de: "Budapest",   nl: "Boedapest" },
    "Bratislava": { en: "Bratislava", es: "Bratislava", it: "Bratislava",de: "Pressburg",  nl: "Bratislava" },
    "Munich":     { en: "Munich",     es: "Múnich",     it: "Monaco di Baviera", de: "München", nl: "München" },
    "Nuremberg":  { en: "Nuremberg",  es: "Núremberg",  it: "Norimberga",de: "Nürnberg",   nl: "Neurenberg" },
    "Cologne":    { en: "Cologne",    es: "Colonia",    it: "Colonia",   de: "Köln",       nl: "Keulen" },
    "Strasbourg": { en: "Strasbourg", es: "Estrasburgo",it: "Strasburgo",de: "Straßburg",  nl: "Straatsburg" },
    "Nantes":     { en: "Nantes",     es: "Nantes",     it: "Nantes",    de: "Nantes",     nl: "Nantes" },
  };
  // Traduit une ville si elle a un exonyme, sinon garde le nom local.
  const cityLabel = (c: string) => {
    if (!c || lang === "fr") return c;
    return CITY_LABELS[c.trim()]?.[lang] ?? c;
  };
  // Traduit un titre "Ville A → Ville B" en traduisant chaque ville séparément.
  const titleLabel = (title: string) => {
    if (!title || lang === "fr") return title;
    const m = title.split(/\s*(→|->|-)\s*/);
    if (m.length >= 3) return `${cityLabel(m[0])} → ${cityLabel(m[m.length - 1])}`;
    return cityLabel(title);
  };

  // Pays par défaut = PASSAGE de l'étape la plus récente (par date). On calcule
  // ici la clé de passage directement (countryPassages n'est défini que plus bas).
  const lastCountry = (() => {
    const withCountry = trips.filter(tr => tr.country && tr.country !== "—");
    if (withCountry.length === 0) return "all";
    const latest = withCountry.reduce((a, b) => (a.date || "") >= (b.date || "") ? a : b);
    const chronological = [...trips].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    let occ = 0, prevCountry: string | null = null;
    for (const tr of chronological) {
      const c = tr.country;
      if (!c || c === "—") continue;
      if (c !== prevCountry && c === latest.country) occ++;
      prevCountry = c;
      if (tr === latest) break;
    }
    return `${latest.country}__${occ}`;
  })();
  const [selectedCountry, setSelectedCountry] = useState<string>(lastCountry);
  const [selectedRegion, setSelectedRegion] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [lightbox, setLightbox] = useState<{ photos: { src: string; alt: string }[]; index: number } | null>(null);

  // ── Zoom photo (double-tap + pincement) ──────────────────────────────────
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const lastTapRef = useRef(0);
  const pinchStartDist = useRef<number | null>(null);
  const pinchStartZoom = useRef(1);
  const panStart = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const isPanningRef = useRef(false);

  const resetZoom = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  const dist2 = (touches: any) => {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // Navigation tactile dans la photo plein écran : swipe gauche/droite
  const touchStartX = useRef<number | null>(null);
  const lightboxPrev = () => { resetZoom(); setLightbox(l => l && ({ ...l, index: l.index > 0 ? l.index - 1 : l.photos.length - 1 })); };
  const lightboxNext = () => { resetZoom(); setLightbox(l => l && ({ ...l, index: l.index < l.photos.length - 1 ? l.index + 1 : 0 })); };

  const onLightboxTouchStart = (e: any) => {
    if (e.touches.length === 2) {
      // Début d'un pincement
      pinchStartDist.current = dist2(e.touches);
      pinchStartZoom.current = zoom;
      touchStartX.current = null; // annule le swipe pendant un pincement
    } else if (e.touches.length === 1) {
      if (zoom > 1) {
        // Zoomé : on prépare un glissement (pan) plutôt qu'un swipe photo
        isPanningRef.current = true;
        panStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, px: pan.x, py: pan.y };
      } else {
        touchStartX.current = e.touches[0].clientX;
      }
      // Détection double-tap
      const now = Date.now();
      if (now - lastTapRef.current < 300) {
        if (zoom > 1) resetZoom(); else { setZoom(2.5); }
      }
      lastTapRef.current = now;
    }
  };
  const onLightboxTouchMove = (e: any) => {
    if (e.touches.length === 2 && pinchStartDist.current) {
      const scale = dist2(e.touches) / pinchStartDist.current;
      const next = Math.min(4, Math.max(1, pinchStartZoom.current * scale));
      setZoom(next);
      if (next <= 1) setPan({ x: 0, y: 0 });
    } else if (e.touches.length === 1 && isPanningRef.current && panStart.current) {
      const dx = e.touches[0].clientX - panStart.current.x;
      const dy = e.touches[0].clientY - panStart.current.y;
      setPan({ x: panStart.current.px + dx, y: panStart.current.py + dy });
    }
  };
  const onLightboxTouchEnd = (e: any) => {
    if (e.touches.length === 0) {
      pinchStartDist.current = null;
      isPanningRef.current = false;
      panStart.current = null;
    }
    if (zoom > 1 || touchStartX.current === null) return; // pas de swipe si zoomé
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (delta < -50) lightboxNext();   // swipe vers la gauche → photo suivante
    else if (delta > 50) lightboxPrev(); // swipe vers la droite → photo précédente
  };
  // Double-clic souris (desktop) : même comportement que le double-tap
  const onLightboxDoubleClick = () => { if (zoom > 1) resetZoom(); else setZoom(2.5); };

  // Touche Échap : ferme la photo plein écran
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setLightbox(null); resetZoom(); }
      else if (e.key === "ArrowLeft") lightboxPrev();
      else if (e.key === "ArrowRight") lightboxNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox !== null]);
  const [replayOpen, setReplayOpen] = useState<string | null>(null);
  const [elevOpen, setElevOpen] = useState<string | null>(null);
  const [birdsTrip, setBirdsTrip] = useState<TripSummary | null>(null);
  const [poiTrip, setPoiTrip] = useState<TripSummary | null>(null);
  const [foodTrip, setFoodTrip] = useState<TripSummary | null>(null);
  const [regionMap, setRegionMap] = useState<string | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  // Verrou de défilement robuste mobile : tant qu'une fenêtre est ouverte
  // (photo, survol 3D, dénivelé, oiseaux, POI, spécialités), la page de fond
  // est figée. position:fixed empêche le scroll tactile (overflow:hidden seul
  // ne suffit pas sur mobile).
  // Verrou de défilement : UNIQUEMENT pour les vraies fenêtres plein écran.
  // Le dénivelé (elevOpen) est un tiroir inline → il ne doit PAS bloquer le scroll.
  const anyOverlayOpen =
    lightbox !== null || replayOpen !== null ||
    birdsTrip !== null || poiTrip !== null || foodTrip !== null;
  useEffect(() => {
    if (!anyOverlayOpen) return;
    const scrollY = window.scrollY;
    const body = document.body;
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    body.style.overflow = "hidden";
    return () => {
      // Toujours TOUT remettre à zéro (jamais restaurer une valeur "fixed"
      // potentiellement polluée par un autre verrou).
      body.style.position = "";
      body.style.top = "";
      body.style.width = "";
      body.style.overflow = "";
      window.scrollTo(0, scrollY);
    };
  }, [anyOverlayOpen]);

  // ── Passages pays : si un pays est quitté puis retraversé plus tard (ex.
  // Autriche → Slovaquie → Autriche), on le distingue comme un 2e passage,
  // pour respecter l'ordre chronologique réel du voyage plutôt que de tout
  // regrouper sous un seul bouton "Autriche".
  type CountryPassage = { key: string; country: string; occurrence: number; trips: TripSummary[] };
  const countryPassages: CountryPassage[] = [];
  {
    // Sécurité : on trie par date pour que les "passages consécutifs" soient
    // détectés dans l'ordre réel du voyage, même si trips.json n'est pas
    // garanti trié.
    const chronological = [...trips].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    const countSoFar: Record<string, number> = {};
    let current: CountryPassage | null = null;
    for (const trip of chronological) {
      const c = trip.country;
      if (!c || c === "—") continue;
      if (!current || current.country !== c) {
        countSoFar[c] = (countSoFar[c] || 0) + 1;
        current = { key: `${c}__${countSoFar[c]}`, country: c, occurrence: countSoFar[c], trips: [] };
        countryPassages.push(current);
      }
      current.trips.push(trip);
    }
  }
  // Est-ce qu'un pays a plusieurs passages distincts dans le voyage ?
  const passageCountByCountry: Record<string, number> = {};
  for (const p of countryPassages) passageCountByCountry[p.country] = (passageCountByCountry[p.country] || 0) + 1;

  const countries = ["all", ...countryPassages.map(p => p.key)];
  const allTags = Array.from(new Set(trips.flatMap(t => t.tags || []))).sort();

  // Libellé d'un passage : "Autriche" normalement, "Autriche (2)" s'il y a un retour
  const passageLabel = (key: string) => {
    const p = countryPassages.find(x => x.key === key);
    if (!p) return key;
    return passageCountByCountry[p.country] > 1 ? `${countryLabel(p.country)} (${p.occurrence})` : countryLabel(p.country);
  };

  // Régions du passage sélectionné (sous-filtres)
  const selectedPassage = countryPassages.find(p => p.key === selectedCountry);
  const regions = selectedCountry === "all" || !selectedPassage
    ? []
    : Array.from(new Set(selectedPassage.trips.map(t => t.region).filter(Boolean))) as string[];

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(x => x !== tag) : [...prev, tag]);
  };


  // Récit localisé pour une étape
  const getStory = (trip: TripSummary): string[] => {
    const tr = trip.translations?.[lang];
    const raw = (tr && tr.fullStory && tr.fullStory.length > 0) ? tr.fullStory : (trip.fullStory || []);
    // Ignore l'ancien texte placeholder qui pourrait subsister dans des JSON non resyncés
    if (raw.length > 0 && /bient[ôo]t document|documented soon/i.test(raw[0])) return [];
    return raw;
  };

  // Mini graphique d'altitude (SVG)
  const ElevationChart = ({ profile }: { profile: [number, number][] }) => {
    if (!profile || profile.length < 2) return null;
    const w = 280, h = 70, pad = 4;
    const elevs = profile.map(p => p[1]);
    const dists = profile.map(p => p[0]);
    const minE = elevs.reduce((m,v)=>v<m?v:m, elevs[0]), maxE = elevs.reduce((m,v)=>v>m?v:m, elevs[0]);
    const maxD = dists.reduce((m,v)=>v>m?v:m, dists[0]) || 1;
    const range = maxE - minE || 1;
    const pts = profile.map(([d, e]) => {
      const x = pad + (d / maxD) * (w - 2 * pad);
      const y = h - pad - ((e - minE) / range) * (h - 2 * pad);
      return [x, y];
    });
    const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
    const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${h - pad} L${pts[0][0].toFixed(1)},${h - pad} Z`;
    return (
      <div className="mt-2">
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto" preserveAspectRatio="none">
          <path d={area} fill="#E8620A" opacity="0.12" />
          <path d={line} fill="none" stroke="#E8620A" strokeWidth="1.5" />
        </svg>
        <div className="flex justify-between font-mono text-[8px] text-text-dim uppercase tracking-wider">
          <span>{minE} m</span>
          <span>↑ {maxE} m</span>
        </div>
      </div>
    );
  };

  const filtered = trips
    .filter(trip => selectedCountry === "all" || (selectedPassage?.trips.includes(trip) ?? false))
    .filter(trip => selectedRegion === "all" || trip.region === selectedRegion)
    .filter(trip => selectedTags.length === 0 || selectedTags.every(tag => (trip.tags || []).includes(tag)))
    .filter(trip =>
      trip.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      trip.country.toLowerCase().includes(searchQuery.toLowerCase()) ||
      trip.shortDescription.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .reverse();

  return (
    <div className="w-full min-h-screen pt-20 pb-20 px-4 md:px-14 bg-bg-dark text-text-on">
      <div className="max-w-6xl mx-auto">

        {/* Popup eBird */}
        {birdsTrip && (
          <PlaceInfo trip={birdsTrip} lang={lang} onClose={() => setBirdsTrip(null)} t={t} />
        )}
        {/* Popup Points d'intérêt */}
        {poiTrip && (
          <PoiInfo trip={poiTrip} lang={lang} onClose={() => setPoiTrip(null)} t={t} />
        )}
        {/* Popup Spécialités */}
        {foodTrip && (
          <FoodInfo trip={foodTrip} lang={lang} onClose={() => setFoodTrip(null)} t={t} />
        )}

        {/* Fenêtre Survol 3D (plein écran, comme les autres popups) */}
        {replayOpen && (() => {
          const rt = filtered.find(tr => tr.slug === replayOpen);
          if (!rt) return null;
          return (
            <div className="fixed inset-0 z-[9999] bg-black flex flex-col p-3" onClick={() => setReplayOpen(null)}>
              <div className="w-full h-full max-w-4xl mx-auto flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-3 shrink-0">
                  <h3 className="font-display font-bold text-white text-sm md:text-base">
                    {cityLabel(rt.startCity) || titleLabel(rt.title)} {rt.endCity ? `→ ${cityLabel(rt.endCity)}` : ""}
                  </h3>
                  <button
                    onClick={() => setReplayOpen(null)}
                    className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white cursor-pointer shrink-0"
                    aria-label={t("replay.close")}
                  >
                    <X size={18} />
                  </button>
                </div>
                <div className="flex-1 min-h-0">
                  <RideReplay segments={rt.segments} track={rt.track} distanceKm={rt.distanceKm} t={t} />
                </div>
              </div>
            </div>
          );
        })()}

        {/* Lightbox */}
        {lightbox && (
          <div
            className="fixed inset-0 z-[9999] bg-black/95 flex items-center justify-center p-4"
            onClick={() => { if (zoom <= 1) setLightbox(null); }}
            onTouchStart={onLightboxTouchStart}
            onTouchMove={onLightboxTouchMove}
            onTouchEnd={onLightboxTouchEnd}
          >
            <div className="max-w-5xl w-full flex flex-col items-center gap-3" onClick={e => e.stopPropagation()}>
              <div className="overflow-hidden max-h-[68vh] w-full flex items-center justify-center touch-none">
                <img
                  src={lightbox.photos[lightbox.index]?.src}
                  alt={lightbox.photos[lightbox.index]?.alt}
                  referrerPolicy="no-referrer"
                  onDoubleClick={onLightboxDoubleClick}
                  draggable={false}
                  style={{
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                    transition: pinchStartDist.current ? "none" : "transform 0.2s ease-out",
                    cursor: zoom > 1 ? "grab" : "zoom-in",
                  }}
                  className="max-h-[68vh] w-auto object-contain rounded select-none"
                />
              </div>
              {lightbox.photos[lightbox.index]?.alt && (
                <p className="font-mono text-xs text-brand-sand uppercase tracking-wider">{lightbox.photos[lightbox.index].alt}</p>
              )}

              {/* Bande de vignettes : aperçu des autres photos, clic pour y aller */}
              {lightbox.photos.length > 1 && (
                <div className="flex gap-2 overflow-x-auto max-w-full px-1 py-1">
                  {lightbox.photos.map((p, k) => (
                    <img
                      key={k}
                      src={p.src}
                      alt={p.alt}
                      referrerPolicy="no-referrer"
                      onClick={() => { resetZoom(); setLightbox(l => l && ({ ...l, index: k })); }}
                      className={`h-14 w-14 object-cover rounded cursor-pointer shrink-0 transition-all ${
                        k === lightbox.index
                          ? "ring-2 ring-brand-sand opacity-100"
                          : "opacity-50 hover:opacity-90"
                      }`}
                    />
                  ))}
                </div>
              )}

              <div className="flex items-center gap-4 mt-1">
                <span className="font-mono text-[10px] text-white/50">{lightbox.index + 1} / {lightbox.photos.length}</span>
                <button onClick={() => { setLightbox(null); resetZoom(); }} className="font-mono text-[10px] text-white/50 hover:text-white cursor-pointer uppercase tracking-wider">Fermer ✕</button>
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="mb-5">
          <h1 className="font-display text-3xl md:text-5xl font-black uppercase text-text-on">
            {t("journey.title")}
          </h1>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          <div className="relative flex-1">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
            <input
              type="text"
              placeholder={t("journey.search")}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-surface-card border border-text-on/10 rounded-md pl-8 pr-4 py-2.5 text-xs text-text-on focus:outline-none focus:border-brand-sand"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            {countries.map(c => (
              <button
                key={c}
                onClick={() => { setSelectedCountry(c); setSelectedRegion("all"); setRegionMap(null); }}
                className={`px-4 py-2 rounded-full font-mono text-[10px] uppercase tracking-wider transition-all duration-200 cursor-pointer ${
                  selectedCountry === c
                    ? "bg-brand-sand text-surface-card font-bold shadow-md scale-105"
                    : "bg-transparent border border-text-on/15 text-text-dim hover:border-brand-sand/60 hover:text-text-on"
                }`}
              >
                {c === "all" ? t("journey.all") : passageLabel(c)}
              </button>
            ))}
          </div>

          {/* Bouton unique "Spécialités" du pays sélectionné (par pays, pas par étape) */}
          {selectedCountry !== "all" && selectedPassage && (() => {
            const countryTrip = trips.find(tr => tr.country === selectedPassage.country && tr.specialties && tr.specialties.length > 0);
            if (!countryTrip) return null;
            return (
              <button
                onClick={() => setFoodTrip(countryTrip)}
                className="mt-3 inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest px-4 py-2 rounded-full border border-brand-sand/40 text-brand-sand hover:bg-brand-sand hover:text-surface-card transition-all cursor-pointer"
              >
                <UtensilsCrossed size={13} /> {t("journey.food_btn")} · {countryLabel(selectedPassage.country)}
              </button>
            );
          })()}
        </div>

        {/* Sous-filtres régions */}
        {regions.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap mb-5">
            <span className="font-mono text-[9px] text-text-dim uppercase tracking-wider mr-1">
              {passageLabel(selectedCountry)} :
            </span>
            <button
              onClick={() => { setSelectedRegion("all"); setRegionMap(null); }}
              className={`px-2.5 py-1 rounded-full font-mono text-[9px] tracking-wide transition-all cursor-pointer border ${
                selectedRegion === "all" ? "bg-brand-sand text-surface-card border-brand-sand font-bold" : "bg-transparent border-text-on/15 text-text-dim hover:border-brand-sand"
              }`}
            >
              {t("journey.all")}
            </button>
            {regions.map(r => (
              <div key={r} className="inline-flex items-center">
                <button
                  onClick={() => { setSelectedRegion(r); setRegionMap(regionMap === r ? null : r); }}
                  className={`px-2.5 py-1 rounded-full font-mono text-[9px] tracking-wide transition-all cursor-pointer border inline-flex items-center gap-1.5 ${
                    selectedRegion === r ? "bg-brand-sand text-surface-card border-brand-sand font-bold" : "bg-transparent border-text-on/15 text-text-dim hover:border-brand-sand"
                  }`}
                >
                  {regionLabel(r)}
                  <Map size={11} className={selectedRegion === r ? "text-surface-card" : "text-brand-sand"} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Filtre par tag (seulement s'il existe des tags) */}
        {allTags.length > 0 && (
          <div className="mb-8 flex items-center gap-3 flex-wrap">
            <span className="flex items-center gap-1.5 font-mono text-[9px] text-text-dim uppercase tracking-wider">
              <Tag size={11} className="text-brand-sand" /> {t("journey.tags")} :
            </span>
            {allTags.map(tag => (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className={`px-2.5 py-1 rounded-full font-mono text-[9px] lowercase tracking-wide transition-all cursor-pointer border ${
                  selectedTags.includes(tag) ? "bg-brand-sand text-surface-card border-brand-sand font-bold" : "bg-transparent border-brand-sand/30 text-brand-sand hover:bg-brand-sand/10"
                }`}
              >
                #{tag}
              </button>
            ))}
            {selectedTags.length > 0 && (
              <button onClick={() => setSelectedTags([])} className="font-mono text-[9px] text-text-dim hover:text-text-on underline cursor-pointer">✕ reset</button>
            )}
          </div>
        )}

        {/* Tiroir carte du PAYS : quand un pays précis est sélectionné et qu'aucune
            carte de région n'est ouverte → trace de toutes les étapes du pays. */}
        {selectedCountry !== "all" && selectedPassage && !regionMap && (
          <RegionMap
            key={`country-${selectedCountry}`}
            region={selectedCountry}
            regionLabel={passageLabel(selectedCountry)}
            country={selectedPassage.country}
            trips={trips}
            lang={lang}
            onClose={() => setSelectedCountry("all")}
            t={t}
          />
        )}

        {/* Tiroir carte de région (inline, prend la place des tags) */}
        {regionMap && (
          <RegionMap region={regionMap} regionLabel={regionLabel(regionMap)} trips={trips} lang={lang} onClose={() => setRegionMap(null)} t={t} />
        )}

        {/* En-tête de résultats : rend explicite que les étapes sont listées en dessous */}
        <div className="mb-6 flex items-baseline gap-2 border-b border-text-on/10 pb-3">
          <span className="font-display font-bold text-lg text-text-on">{filtered.length}</span>
          <span className="font-mono text-[10px] uppercase tracking-wider text-text-dim">
            {filtered.length > 1 ? t("journey.stages") : t("journey.stage")}
            {selectedRegion !== "all" ? ` · ${regionLabel(selectedRegion)}` : selectedCountry !== "all" ? ` · ${passageLabel(selectedCountry)}` : ""}
          </span>
        </div>

        {/* TIMELINE */}
        {filtered.length === 0 ? (
          <div className="text-center py-20 text-text-dim font-mono text-xs">{t("journey.empty")}</div>
        ) : (
          <div className="relative">
            {/* Ligne verticale centrale (desktop) */}
            <div className="hidden md:block absolute left-1/2 top-0 bottom-0 w-px bg-brand-sand/30 -translate-x-1/2" />

            <div className="flex flex-col gap-12 md:gap-4">
              {filtered.map((trip, i) => {
                const isLeft = i % 2 === 0;
                const story = getStory(trip);
                const galleryPhotos = (trip.photos && trip.photos.length > 1) ? trip.photos.slice(1) : (trip.photos || []);

                // Bloc texte
                const textBlock = (
                  <div className="flex flex-col gap-2">
                    <span className="font-mono text-[9px] text-brand-sand font-bold uppercase tracking-widest">
                      {trip.country !== "—" ? countryLabel(trip.country) : "France"}
                    </span>
                    <h3 className="font-display font-bold text-xl text-text-on leading-tight">{titleLabel(trip.title)}</h3>
                    <div className="flex gap-3 font-mono text-[9px] text-text-dim">
                      <span className="flex items-center gap-1"><Calendar size={10} /> {trip.date}</span>
                      {trip.distanceKm > 0 && <span className="flex items-center gap-1"><TrendingUp size={10} /> {trip.distanceKm} km</span>}
                      {trip.elevationGain > 0 && <span className="flex items-center gap-1"><Mountain size={10} /> {trip.elevationGain} m</span>}
                    </div>
                    {elevOpen === trip.slug && trip.elevProfile && trip.elevProfile.length > 1 && (
                      <ElevationChart profile={trip.elevProfile} />
                    )}
                    {story.length > 0 ? (
                      <div className="flex flex-col gap-2 text-sm text-text-dim leading-relaxed font-light mt-1">
                        {story.map((para, k) => <p key={k}>{para}</p>)}
                      </div>
                    ) : (trip.shortDescription && !/bient[ôo]t document/i.test(trip.shortDescription)) ? (
                      <p className="text-sm text-text-dim text-opacity-60 italic mt-1">{trip.shortDescription}</p>
                    ) : null}
                    {trip.tags && trip.tags.length > 0 && (
                      <div className="flex gap-1.5 flex-wrap mt-2">
                        {trip.tags.map(tag => (
                          <button
                            key={tag}
                            onClick={() => toggleTag(tag)}
                            className={`font-mono text-[9px] lowercase px-2 py-0.5 rounded-full border transition-all cursor-pointer ${
                              selectedTags.includes(tag) ? "bg-brand-sand text-surface-card border-brand-sand" : "border-brand-sand/30 text-brand-sand hover:bg-brand-sand/10"
                            }`}
                          >
                            #{tag}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Villes traversées + sites majeurs (informatif, non cliquable) */}
                    {(() => {
                      const cities = trip.majorCities || [];
                      const topPois = (trip.pois || []).slice(0, 3).map(p => p.title);
                      const items = [...cities, ...topPois];
                      if (items.length === 0) return null;
                      return (
                        <div className="flex gap-1.5 flex-wrap mt-2 items-center">
                          <MapPin size={10} className="text-text-dim/60" />
                          {items.map((label, idx) => (
                            <span
                              key={idx}
                              className="font-mono text-[9px] px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/10 text-text-dim"
                            >
                              {label}
                            </span>
                          ))}
                        </div>
                      );
                    })()}

                    {/* Hébergement (lien) & Remerciements */}
                    {(trip.lodgingUrl || trip.thanks) && (
                      <div className="flex flex-col gap-2 mt-3">
                        {trip.lodgingUrl && (
                          <a
                            href={trip.lodgingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 text-sm text-brand-sand hover:underline w-fit"
                          >
                            <Home size={15} className="shrink-0" />
                            <span className="font-medium">{trip.lodgingName || trip.lodgingUrl}</span>
                          </a>
                        )}
                        {trip.thanks && (
                          <div className="flex items-start gap-2 text-sm text-text-dim">
                            <Heart size={15} className="shrink-0 mt-0.5 text-brand-sand" />
                            <span>{(trip.thanksTranslations?.[lang]) || trip.thanks}</span>
                          </div>
                        )}
                      </div>
                    )}
                    {(trip.track && trip.track.length > 1 || (trip.elevProfile && trip.elevProfile.length > 1) || trip.startCity || trip.endCity) && (
                      <div className="flex flex-col gap-2 mt-3">
                        {/* Rangée 1 : Dénivelé · Survol 3D · eBird */}
                        <div className="grid grid-cols-3 gap-2">
                          <button
                            onClick={() => setElevOpen(elevOpen === trip.slug ? null : trip.slug)}
                            disabled={!(trip.elevProfile && trip.elevProfile.length > 1)}
                            className="inline-flex items-center justify-center gap-1.5 font-mono text-[9px] uppercase tracking-widest px-2 py-2 rounded-full border border-brand-sand/40 text-brand-sand hover:bg-brand-sand hover:text-surface-card transition-all cursor-pointer disabled:opacity-30 disabled:cursor-default"
                          >
                            <Mountain size={12} /> {t("journey.elevation_btn")}
                          </button>
                          <button
                            onClick={() => setReplayOpen(replayOpen === trip.slug ? null : trip.slug)}
                            disabled={!(trip.track && trip.track.length > 1)}
                            className="inline-flex items-center justify-center gap-1.5 font-mono text-[9px] uppercase tracking-widest px-2 py-2 rounded-full border border-brand-sand/40 text-brand-sand hover:bg-brand-sand hover:text-surface-card transition-all cursor-pointer disabled:opacity-30 disabled:cursor-default"
                          >
                            <Box size={12} /> {replayOpen === trip.slug ? t("replay.close") : t("stage.replay")}
                          </button>
                          <button
                            onClick={() => setBirdsTrip(trip)}
                            className="inline-flex items-center justify-center gap-1.5 font-mono text-[9px] uppercase tracking-widest px-2 py-2 rounded-full border border-brand-sand/40 text-brand-sand hover:bg-brand-sand hover:text-surface-card transition-all cursor-pointer"
                          >
                            <Bird size={12} /> {t("journey.birds_btn")}
                          </button>
                        </div>
                        {/* Points d'intérêt (les spécialités sont par pays, en haut) */}
                        {(trip.startCity || trip.endCity) && (
                          <button
                            onClick={() => setPoiTrip(trip)}
                            className="w-full inline-flex items-center justify-center gap-1.5 font-mono text-[9px] uppercase tracking-widest px-2 py-2 rounded-full border border-brand-sand/40 text-brand-sand hover:bg-brand-sand hover:text-surface-card transition-all cursor-pointer"
                          >
                            <MapPin size={12} /> {t("journey.poi_btn")}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );

                // Bloc photos
                const photoBlock = galleryPhotos.length > 0 ? (
                  <div className="grid grid-cols-3 gap-2">
                    {galleryPhotos.map((photo, k) => (
                      <img
                        key={k}
                        src={photo.thumb || photo.src}
                        alt={photo.alt}
                        referrerPolicy="no-referrer"
                        loading="lazy"
                        onClick={() => setLightbox({ photos: galleryPhotos, index: k })}
                        className="w-full aspect-square object-cover rounded-lg cursor-pointer hover:opacity-85 transition-opacity"
                      />
                    ))}
                  </div>
                ) : (
                  <img
                    src={trip.coverImage}
                    alt={trip.title}
                    referrerPolicy="no-referrer"
                    className="w-full aspect-video object-cover rounded-lg"
                  />
                );

                return (
                  <div key={trip.slug}>
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true, margin: "-50px" }}
                      transition={{ duration: 0.4 }}
                      className="relative md:grid md:grid-cols-2 md:gap-12 items-center"
                    >
                      {/* Point sur la ligne (desktop) */}
                      <div className="hidden md:block absolute left-1/2 top-1/2 w-4 h-4 rounded-full bg-brand-sand border-4 border-bg-dark -translate-x-1/2 -translate-y-1/2 z-10" />

                      {/* Mobile : tout empilé dans une carte */}
                      <div className="md:hidden bg-surface-card border border-text-on/10 rounded-2xl p-5 flex flex-col gap-4">
                        {textBlock}
                        {photoBlock}
                      </div>

                      {/* Desktop : alternance gauche/droite */}
                      {isLeft ? (
                        <>
                          <div className="hidden md:block md:pr-10 md:text-right">{textBlock}</div>
                          <div className="hidden md:block md:pl-10">{photoBlock}</div>
                        </>
                      ) : (
                        <>
                          <div className="hidden md:block md:pr-10 md:order-1">{photoBlock}</div>
                          <div className="hidden md:block md:pl-10 md:order-2">{textBlock}</div>
                        </>
                      )}
                    </motion.div>

                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
