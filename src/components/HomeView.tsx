import { ArrowRight, Compass } from "lucide-react";
import { motion } from "motion/react";
import { SiteStats, TripSummary } from "../types";

interface HomeViewProps {
  onNavigate: (tab: string, arg?: string) => void;
  stats: SiteStats | null;
  trips: TripSummary[];
  t: (key: string) => string;
}

export default function HomeView({ onNavigate, stats, trips, t }: HomeViewProps) {
  const latest = trips[trips.length - 1];
  const heroImage = latest?.coverImage ||
    "https://images.unsplash.com/photo-1549488344-1f9b8d2bd1f3?auto=format&fit=crop&q=80&w=1600";

  const metrics = stats
    ? [
        { value: stats.totalKm.toLocaleString("fr-FR"), label: t("home.km"), desc: "" },
        { value: String(stats.totalCountries), label: t("home.countries"), desc: "" },
        { value: String(stats.totalDays), label: t("home.days"), desc: "" },
        { value: stats.totalElevation.toLocaleString("fr-FR"), label: t("home.elevation"), desc: "" },
      ]
    : [
        { value: "—", label: t("home.km"), desc: "" },
        { value: "—", label: t("home.countries"), desc: "" },
        { value: "—", label: t("home.days"), desc: "" },
        { value: "—", label: t("home.elevation"), desc: "" },
      ];

  return (
    <div className="relative w-full h-[100vh] min-h-[680px] overflow-hidden flex items-center justify-center font-sans">
      {/* Hero */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-black/60 z-10" />
        <img
          src={heroImage}
          alt="The Cycling Beard"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover scale-102 filter brightness-[0.80] contrast-105"
        />
      </div>

      <div className="relative z-20 w-full max-w-5xl px-4 md:px-10 flex flex-col justify-center items-center text-center">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.0 }}
          className="mb-8"
        >
          <div className="flex items-center justify-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 marker-pulse" />
            <span className="font-mono text-[9px] uppercase font-bold tracking-[0.25em] text-brand-sand">
              {t("home.tagline")}
            </span>
          </div>
          <h1 className="font-display font-bold text-3xl md:text-5xl lg:text-6xl text-text-on uppercase tracking-[0.05em] leading-tight">
            THE CYCLING BEARD
          </h1>
          <p className="max-w-xl mx-auto mt-3 text-xs md:text-sm text-text-dim text-opacity-85 leading-relaxed font-light">
            {t("home.intro")}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.0, delay: 0.2 }}
          className="w-full max-w-4xl bg-black/45 backdrop-blur-md rounded-2xl border border-white/10 p-6 md:p-8 flex flex-col gap-6 shadow-2xl"
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-2 divide-y divide-white/5 md:divide-y-0 md:divide-x divide-white/10">
            {metrics.map((m, i) => (
              <div key={i} className="flex flex-col items-center justify-center pt-3 md:pt-0 pb-3 md:pb-0 px-2 first:pt-0 last:pb-0">
                <div className="font-display text-3xl md:text-4xl lg:text-5xl font-black text-brand-sand tracking-tight">
                  {m.value}
                </div>
                <div className="font-display font-extrabold text-[10px] text-text-on uppercase tracking-[0.15em] mt-1.5">
                  {m.label}
                </div>
                <div className="text-[9px] text-[#8d7a68] font-mono mt-0.5 uppercase tracking-wide">
                  {m.desc}
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-white/10 pt-4 flex flex-col sm:flex-row justify-between items-center gap-4 text-xs font-mono">
            <span className="text-text-dim text-opacity-75 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {stats ? `${stats.currentLocation} · ${stats.currentCountry}` : t("home.locating")}
            </span>
            <button
              onClick={() => onNavigate("journey")}
              className="text-brand-sand hover:text-white transition-colors cursor-pointer flex items-center gap-1 font-bold text-[10px] uppercase tracking-wider"
            >
              {t("home.cta")} <ArrowRight size={10} />
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
