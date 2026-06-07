import { Calendar, MapPin, TrendingUp, Mountain, Search, Tag } from "lucide-react";
import { useState } from "react";
import { motion } from "motion/react";
import { TripSummary, SiteStats } from "../types";
import { Lang } from "../i18n";

interface JourneyViewProps {
  onNavigate: (tab: string, arg?: string) => void;
  trips: TripSummary[];
  stats: SiteStats | null;
  t: (key: string) => string;
  lang: Lang;
}

export default function JourneyView({ trips, stats, t, lang }: JourneyViewProps) {
  const [selectedCountry, setSelectedCountry] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [lightbox, setLightbox] = useState<{ photos: { src: string; alt: string }[]; index: number } | null>(null);

  const countries = ["all", ...Array.from(new Set(trips.map(t => t.country).filter(c => c && c !== "—")))];
  const allTags = Array.from(new Set(trips.flatMap(t => t.tags || []))).sort();

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(x => x !== tag) : [...prev, tag]);
  };

  // Récit localisé pour une étape
  const getStory = (trip: TripSummary): string[] => {
    const tr = trip.translations?.[lang];
    if (tr && tr.fullStory && tr.fullStory.length > 0) return tr.fullStory;
    return trip.fullStory || [];
  };

  const filtered = trips
    .filter(trip => selectedCountry === "all" || trip.country === selectedCountry)
    .filter(trip =>
      trip.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      trip.country.toLowerCase().includes(searchQuery.toLowerCase()) ||
      trip.shortDescription.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .filter(trip => selectedTags.length === 0 || selectedTags.every(tag => (trip.tags || []).includes(tag)))
    .reverse();

  return (
    <div className="w-full min-h-screen pt-24 pb-20 px-4 md:px-14 bg-bg-dark text-text-on">
      <div className="max-w-6xl mx-auto">

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
        <div className="mb-10">
          <p className="font-mono text-[10px] text-brand-sand font-bold tracking-widest uppercase mb-2">
            {t("journey.label")}
          </p>
          <h1 className="font-display text-3xl md:text-5xl font-black uppercase text-text-on">
            {t("journey.title")}
          </h1>
          <p className="text-xs text-text-dim text-opacity-80 mt-2 font-light max-w-xl">
            {t("journey.intro")}
          </p>

          {stats && (
            <div className="mt-6 flex flex-wrap gap-6 font-mono text-[10px] text-text-dim">
              <span className="flex items-center gap-1.5"><TrendingUp size={11} className="text-brand-sand" /><strong className="text-text-on">{stats.totalKm.toLocaleString("fr-FR")} km</strong> {t("journey.km")}</span>
              <span className="flex items-center gap-1.5"><Mountain size={11} className="text-brand-sand" /><strong className="text-text-on">{stats.totalElevation.toLocaleString("fr-FR")} m</strong> {t("journey.elevation")}</span>
              <span className="flex items-center gap-1.5"><MapPin size={11} className="text-brand-sand" /><strong className="text-text-on">{stats.totalCountries}</strong> {t("journey.countries")}</span>
              <span className="flex items-center gap-1.5"><Calendar size={11} className="text-brand-sand" /><strong className="text-text-on">{stats.totalDays}</strong> {t("journey.days")}</span>
            </div>
          )}
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
                onClick={() => setSelectedCountry(c)}
                className={`px-3 py-2 rounded-md font-mono text-[9px] uppercase font-bold tracking-wider transition-all cursor-pointer ${
                  selectedCountry === c ? "bg-brand-sand text-surface-card" : "bg-surface-card border border-text-on/10 text-text-dim hover:text-text-on"
                }`}
              >
                {c === "all" ? t("journey.all") : c}
              </button>
            ))}
          </div>
        </div>

        {/* Tag filters */}
        {allTags.length > 0 && (
          <div className="mb-10 flex items-center gap-3 flex-wrap">
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
                  <motion.div
                    key={trip.slug}
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
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
