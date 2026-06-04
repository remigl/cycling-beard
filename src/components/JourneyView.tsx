import { Calendar, MapPin, TrendingUp, ArrowRight, Search, Mountain, Tag } from "lucide-react";
import { useState } from "react";
import { motion } from "motion/react";
import { TripSummary, SiteStats } from "../types";

interface JourneyViewProps {
  onNavigate: (tab: string, arg?: string) => void;
  trips: TripSummary[];
  stats: SiteStats | null;
  t: (key: string) => string;
}

export default function JourneyView({ onNavigate, trips, stats, t }: JourneyViewProps) {
  const [selectedCountry, setSelectedCountry] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const countries = ["all", ...Array.from(new Set(trips.map(t => t.country).filter(c => c && c !== "—")))];

  // Tous les tags uniques présents dans les étapes
  const allTags = Array.from(new Set(trips.flatMap(t => t.tags || []))).sort();

  const toggleTag = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(x => x !== tag) : [...prev, tag]
    );
  };

  const filtered = trips
    .filter(trip => selectedCountry === "all" || trip.country === selectedCountry)
    .filter(trip =>
      trip.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      trip.country.toLowerCase().includes(searchQuery.toLowerCase()) ||
      trip.shortDescription.toLowerCase().includes(searchQuery.toLowerCase())
    )
    // Filtre par tags : l'étape doit contenir TOUS les tags sélectionnés
    .filter(trip =>
      selectedTags.length === 0 ||
      selectedTags.every(tag => (trip.tags || []).includes(tag))
    )
    .reverse();

  return (
    <div className="w-full min-h-screen pt-24 pb-20 px-4 md:px-14 bg-bg-dark text-text-on">
      <div className="max-w-6xl mx-auto">

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

          {/* Global stats strip */}
          {stats && (
            <div className="mt-6 flex flex-wrap gap-6 font-mono text-[10px] text-text-dim">
              <span className="flex items-center gap-1.5">
                <TrendingUp size={11} className="text-brand-sand" />
                <strong className="text-text-on">{stats.totalKm.toLocaleString("fr-FR")} km</strong> {t("journey.km")}
              </span>
              <span className="flex items-center gap-1.5">
                <Mountain size={11} className="text-brand-sand" />
                <strong className="text-text-on">{stats.totalElevation.toLocaleString("fr-FR")} m</strong> {t("journey.elevation")}
              </span>
              <span className="flex items-center gap-1.5">
                <MapPin size={11} className="text-brand-sand" />
                <strong className="text-text-on">{stats.totalCountries}</strong> {t("journey.countries")}
              </span>
              <span className="flex items-center gap-1.5">
                <Calendar size={11} className="text-brand-sand" />
                <strong className="text-text-on">{stats.totalDays}</strong> {t("journey.days")}
              </span>
            </div>
          )}
        </div>

        {/* Search + country filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          <div className="relative flex-1">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
            <input
              type="text"
              placeholder={t("journey.search")}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-[#1c1b1b] border border-white/10 rounded-md pl-8 pr-4 py-2.5 text-xs text-text-on focus:outline-none focus:border-brand-sand"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            {countries.map(c => (
              <button
                key={c}
                onClick={() => setSelectedCountry(c)}
                className={`px-3 py-2 rounded-md font-mono text-[9px] uppercase font-bold tracking-wider transition-all cursor-pointer ${
                  selectedCountry === c
                    ? "bg-brand-sand text-bg-dark"
                    : "bg-[#1c1b1b] border border-white/10 text-text-dim hover:text-white"
                }`}
              >
                {c === "all" ? t("journey.all") : c}
              </button>
            ))}
          </div>
        </div>

        {/* Tag filters */}
        {allTags.length > 0 && (
          <div className="mb-8 flex items-center gap-3 flex-wrap">
            <span className="flex items-center gap-1.5 font-mono text-[9px] text-text-dim uppercase tracking-wider">
              <Tag size={11} className="text-brand-sand" />
              {t("journey.tags")} :
            </span>
            {allTags.map(tag => (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className={`px-2.5 py-1 rounded-full font-mono text-[9px] lowercase tracking-wide transition-all cursor-pointer border ${
                  selectedTags.includes(tag)
                    ? "bg-brand-sand text-bg-dark border-brand-sand font-bold"
                    : "bg-transparent border-brand-sand/30 text-brand-sand hover:bg-brand-sand/10"
                }`}
              >
                #{tag}
              </button>
            ))}
            {selectedTags.length > 0 && (
              <button
                onClick={() => setSelectedTags([])}
                className="font-mono text-[9px] text-text-dim hover:text-white underline cursor-pointer"
              >
                ✕ reset
              </button>
            )}
          </div>
        )}

        {/* Stage list */}
        {filtered.length === 0 ? (
          <div className="text-center py-20 text-text-dim font-mono text-xs">
            {t("journey.empty")}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {filtered.map((trip, i) => (
              <motion.div
                key={trip.slug}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: i * 0.05 }}
                onClick={() => onNavigate("stage", trip.slug)}
                className="group flex flex-col sm:flex-row gap-4 bg-[#111110] border border-white/5 hover:border-brand-sand/30 rounded-xl overflow-hidden cursor-pointer transition-all duration-300"
              >
                {/* Thumbnail */}
                <div className="w-full sm:w-48 h-36 sm:h-auto flex-shrink-0 overflow-hidden">
                  <img
                    src={trip.thumbnail}
                    alt={trip.title}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                </div>

                {/* Content */}
                <div className="flex flex-col justify-between p-4 flex-1 min-w-0">
                  <div>
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className="font-mono text-[8px] text-brand-sand font-bold uppercase tracking-widest">
                        {trip.country !== "—" ? trip.country : "France"}
                      </span>
                      {trip.hasGpx && (
                        <span className="font-mono text-[7px] bg-emerald-900/40 text-emerald-400 px-1.5 py-0.5 rounded uppercase tracking-wider">
                          GPX
                        </span>
                      )}
                      {trip.hasVideo && (
                        <span className="font-mono text-[7px] bg-sky-900/40 text-sky-400 px-1.5 py-0.5 rounded uppercase tracking-wider">
                          Vidéo
                        </span>
                      )}
                    </div>
                    <h3 className="font-display font-bold text-base text-text-on group-hover:text-brand-sand transition-colors">
                      {trip.title}
                    </h3>
                    <p className="text-[11px] text-text-dim text-opacity-70 mt-1.5 line-clamp-2 leading-relaxed">
                      {trip.shortDescription}
                    </p>

                    {/* Tags de l'étape */}
                    {trip.tags && trip.tags.length > 0 && (
                      <div className="flex gap-1.5 flex-wrap mt-2">
                        {trip.tags.map(tag => (
                          <button
                            key={tag}
                            onClick={(e) => { e.stopPropagation(); toggleTag(tag); }}
                            className={`font-mono text-[8px] lowercase px-1.5 py-0.5 rounded-full border transition-all cursor-pointer ${
                              selectedTags.includes(tag)
                                ? "bg-brand-sand text-bg-dark border-brand-sand"
                                : "border-brand-sand/25 text-brand-sand/80 hover:bg-brand-sand/10"
                            }`}
                          >
                            #{tag}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5">
                    <div className="flex gap-4 font-mono text-[9px] text-text-dim">
                      <span className="flex items-center gap-1">
                        <Calendar size={10} /> {trip.date}
                      </span>
                      {trip.distanceKm > 0 && (
                        <span className="flex items-center gap-1">
                          <TrendingUp size={10} /> {trip.distanceKm} km
                        </span>
                      )}
                      {trip.elevationGain > 0 && (
                        <span className="flex items-center gap-1">
                          <Mountain size={10} /> {trip.elevationGain} m
                        </span>
                      )}
                    </div>
                    <ArrowRight size={14} className="text-brand-sand opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
