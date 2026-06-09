import { Calendar, TrendingUp, Mountain, Search, Tag, Box, Bird, MapPin, UtensilsCrossed, Map } from "lucide-react";
import { useState } from "react";
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

export default function JourneyView({ trips, t, lang }: JourneyViewProps) {
  // Pays par défaut = dernier pays où je suis (dernière étape)
  const lastCountry = (() => {
    const last = trips[trips.length - 1];
    return last?.country && last.country !== "—" ? last.country : "all";
  })();
  const [selectedCountry, setSelectedCountry] = useState<string>(lastCountry);
  const [selectedRegion, setSelectedRegion] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [lightbox, setLightbox] = useState<{ photos: { src: string; alt: string }[]; index: number } | null>(null);
  const [replayOpen, setReplayOpen] = useState<string | null>(null);
  const [elevOpen, setElevOpen] = useState<string | null>(null);
  const [birdsTrip, setBirdsTrip] = useState<TripSummary | null>(null);
  const [poiTrip, setPoiTrip] = useState<TripSummary | null>(null);
  const [foodTrip, setFoodTrip] = useState<TripSummary | null>(null);
  const [regionMap, setRegionMap] = useState<string | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const countries = ["all", ...Array.from(new Set(trips.map(t => t.country).filter(c => c && c !== "—")))];
  const allTags = Array.from(new Set(trips.flatMap(t => t.tags || []))).sort();

  // Régions du pays sélectionné (sous-filtres)
  const regions = selectedCountry === "all"
    ? []
    : Array.from(new Set(
        trips.filter(t => t.country === selectedCountry).map(t => t.region).filter(Boolean)
      )) as string[];

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(x => x !== tag) : [...prev, tag]);
  };


  // Récit localisé pour une étape
  const getStory = (trip: TripSummary): string[] => {
    const tr = trip.translations?.[lang];
    if (tr && tr.fullStory && tr.fullStory.length > 0) return tr.fullStory;
    return trip.fullStory || [];
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
    .filter(trip => selectedCountry === "all" || trip.country === selectedCountry)
    .filter(trip => selectedRegion === "all" || trip.region === selectedRegion)
    .filter(trip => selectedTags.length === 0 || selectedTags.every(tag => (trip.tags || []).includes(tag)))
    .filter(trip =>
      trip.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      trip.country.toLowerCase().includes(searchQuery.toLowerCase()) ||
      trip.shortDescription.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .reverse();

  return (
    <div className="w-full min-h-screen pt-24 pb-20 px-4 md:px-14 bg-bg-dark text-text-on">
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

        {/* Lightbox */}
        {lightbox && (
          <div
            className="fixed inset-0 z-[9999] bg-black/95 flex items-center justify-center p-4"
            onClick={() => setLightbox(null)}
          >
            <div className="max-w-5xl w-full flex flex-col items-center gap-3" onClick={e => e.stopPropagation()}>
              <img
                src={lightbox.photos[lightbox.index]?.src}
                alt={lightbox.photos[lightbox.index]?.alt}
                referrerPolicy="no-referrer"
                className="max-h-[80vh] w-auto object-contain rounded"
              />
              {lightbox.photos[lightbox.index]?.alt && (
                <p className="font-mono text-xs text-brand-sand uppercase tracking-wider">{lightbox.photos[lightbox.index].alt}</p>
              )}
              <div className="flex items-center gap-6 mt-2">
                <button onClick={() => setLightbox(l => l && ({ ...l, index: l.index > 0 ? l.index - 1 : l.photos.length - 1 }))} className="text-white/70 hover:text-white font-mono text-xs cursor-pointer">← Préc.</button>
                <span className="font-mono text-[10px] text-white/50">{lightbox.index + 1} / {lightbox.photos.length}</span>
                <button onClick={() => setLightbox(l => l && ({ ...l, index: l.index < l.photos.length - 1 ? l.index + 1 : 0 }))} className="text-white/70 hover:text-white font-mono text-xs cursor-pointer">Suiv. →</button>
              </div>
              <button onClick={() => setLightbox(null)} className="mt-2 font-mono text-[10px] text-white/50 hover:text-white cursor-pointer uppercase tracking-wider">Fermer ✕</button>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="mb-8">
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
                onClick={() => { setSelectedCountry(c); setSelectedRegion("all"); }}
                className={`px-3 py-2 rounded-md font-mono text-[9px] uppercase font-bold tracking-wider transition-all cursor-pointer ${
                  selectedCountry === c ? "bg-brand-sand text-surface-card" : "bg-surface-card border border-text-on/10 text-text-dim hover:text-text-on"
                }`}
              >
                {c === "all" ? t("journey.all") : c}
              </button>
            ))}
          </div>
        </div>

        {/* Sous-filtres régions */}
        {regions.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap mb-5">
            <span className="font-mono text-[9px] text-text-dim uppercase tracking-wider mr-1">
              {selectedCountry} :
            </span>
            <button
              onClick={() => setSelectedRegion("all")}
              className={`px-2.5 py-1 rounded-full font-mono text-[9px] tracking-wide transition-all cursor-pointer border ${
                selectedRegion === "all" ? "bg-brand-sand text-surface-card border-brand-sand font-bold" : "bg-transparent border-text-on/15 text-text-dim hover:border-brand-sand"
              }`}
            >
              {t("journey.all")}
            </button>
            {regions.map(r => (
              <div key={r} className="inline-flex items-center">
                <button
                  onClick={() => { setSelectedRegion(r); setRegionMap(r); }}
                  className={`px-2.5 py-1 rounded-full font-mono text-[9px] tracking-wide transition-all cursor-pointer border inline-flex items-center gap-1.5 ${
                    selectedRegion === r ? "bg-brand-sand text-surface-card border-brand-sand font-bold" : "bg-transparent border-text-on/15 text-text-dim hover:border-brand-sand"
                  }`}
                >
                  {r}
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

        {/* Tiroir carte de région (inline, prend la place des tags) */}
        {regionMap && (
          <RegionMap region={regionMap} trips={trips} onClose={() => setRegionMap(null)} t={t} />
        )}

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
                      {trip.country !== "—" ? trip.country : "France"}
                    </span>
                    <h3 className="font-display font-bold text-xl text-text-on leading-tight">{trip.title}</h3>
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
                    ) : (
                      <p className="text-sm text-text-dim text-opacity-60 italic mt-1">{trip.shortDescription}</p>
                    )}
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
                        {/* Rangée 2 : Points d'intérêt · Spécialités */}
                        {(trip.startCity || trip.endCity) && (
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              onClick={() => setPoiTrip(trip)}
                              className="inline-flex items-center justify-center gap-1.5 font-mono text-[9px] uppercase tracking-widest px-2 py-2 rounded-full border border-brand-sand/40 text-brand-sand hover:bg-brand-sand hover:text-surface-card transition-all cursor-pointer"
                            >
                              <MapPin size={12} /> {t("journey.poi_btn")}
                            </button>
                            <button
                              onClick={() => setFoodTrip(trip)}
                              className="inline-flex items-center justify-center gap-1.5 font-mono text-[9px] uppercase tracking-widest px-2 py-2 rounded-full border border-brand-sand/40 text-brand-sand hover:bg-brand-sand hover:text-surface-card transition-all cursor-pointer"
                            >
                              <UtensilsCrossed size={12} /> {t("journey.food_btn")}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );

                // Bloc photos
                const photoBlock = galleryPhotos.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2">
                    {galleryPhotos.slice(0, 4).map((photo, k) => (
                      <img
                        key={k}
                        src={photo.thumb || photo.src}
                        alt={photo.alt}
                        referrerPolicy="no-referrer"
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

                    {/* Survol 3D déplié (inline, sans changer de page) */}
                    {replayOpen === trip.slug && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        className="mt-4 md:mt-2 overflow-hidden"
                      >
                        <RideReplay segments={trip.segments} track={trip.track} distanceKm={trip.distanceKm} t={t} />
                      </motion.div>
                    )}
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
