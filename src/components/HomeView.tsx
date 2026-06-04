import { motion } from "motion/react";
import { SiteStats, TripSummary } from "../types";
import { Lang } from "../i18n";

// URL Buy Me a Coffee
const BMC_URL = "https://buymeacoffee.com/cyclingBeard";

interface AboutData {
  paragraphs: string[];
  translations: Record<string, string[]>;
  mePhoto: string | null;
  bikePhoto: string | null;
}

interface HomeViewProps {
  onNavigate: (tab: string, arg?: string) => void;
  stats: SiteStats | null;
  trips: TripSummary[];
  t: (key: string) => string;
  about: AboutData | null;
  lang: Lang;
}

export default function HomeView({ onNavigate, stats, trips, t, about, lang }: HomeViewProps) {
  const latest = trips[trips.length - 1];
  const heroImage = latest?.coverImage ||
    "https://images.unsplash.com/photo-1549488344-1f9b8d2bd1f3?auto=format&fit=crop&q=80&w=1600";

  const metrics = stats
    ? [
        { value: stats.totalKm.toLocaleString("fr-FR"), label: t("home.km") },
        { value: String(stats.totalCountries), label: t("home.countries") },
        { value: String(stats.totalDays), label: t("home.days") },
        { value: stats.totalElevation.toLocaleString("fr-FR"), label: t("home.elevation") },
      ]
    : [
        { value: "—", label: t("home.km") },
        { value: "—", label: t("home.countries") },
        { value: "—", label: t("home.days") },
        { value: "—", label: t("home.elevation") },
      ];

  // Paragraphes de présentation dans la bonne langue
  const presParagraphs = about
    ? (about.translations?.[lang] || about.paragraphs || [])
    : [];

  return (
    <div className="w-full bg-bg-dark">

      {/* ── HERO ── */}
      <div className="relative w-full h-[100vh] min-h-[680px] overflow-hidden flex items-center justify-center font-sans">
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
            className="mb-10"
          >
            <h1 className="font-display font-bold text-4xl md:text-6xl lg:text-7xl text-text-on uppercase tracking-[0.05em] leading-tight">
              THE CYCLING BEARD
            </h1>
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
                  <div className="font-display font-extrabold text-[10px] text-text-on uppercase tracking-[0.15em] mt-2">
                    {m.label}
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-white/10 pt-4 flex justify-center text-xs font-mono">
              <span className="text-text-on flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {stats ? `${stats.currentLocation} · ${stats.currentCountry}` : t("home.locating")}
              </span>
            </div>
          </motion.div>
        </div>
      </div>

      {/* ── PRÉSENTATION ── */}
      <div className="w-full px-4 md:px-14 py-16 md:py-24">
        <div className="max-w-5xl mx-auto">
          <div className="bg-[#1c1b1b] border border-white/5 rounded-2xl p-6 md:p-10 grid md:grid-cols-5 gap-8 items-center">

            {/* Texte à gauche */}
            <div className="md:col-span-3 flex flex-col gap-4">
              <p className="font-mono text-[10px] text-brand-sand font-bold tracking-widest uppercase">
                {t("about.title")}
              </p>
              <div className="flex flex-col gap-3 text-sm md:text-base text-text-dim leading-relaxed font-light">
                {presParagraphs.length > 0 ? (
                  presParagraphs.map((para, i) => <p key={i}>{para}</p>)
                ) : (
                  <p className="italic text-text-dim text-opacity-50">
                    Présentation à venir...
                  </p>
                )}
              </div>

              {/* Lien soutien */}
              <div className="mt-4 pt-5 border-t border-white/5">
                <p className="text-xs text-text-dim text-opacity-70 font-light mb-3">
                  {t("support.text")}
                </p>
                <a
                  href={BMC_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block hover:opacity-90 transition-opacity"
                >
                  <img
                    src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png"
                    alt={t("support.cta")}
                    style={{ height: "50px", width: "auto" }}
                    referrerPolicy="no-referrer"
                  />
                </a>
              </div>
            </div>

            {/* 2 photos empilées à droite */}
            <div className="md:col-span-2 flex flex-col gap-4">
              {about?.mePhoto ? (
                <img
                  src={about.mePhoto}
                  alt="Rémi"
                  referrerPolicy="no-referrer"
                  className="w-full aspect-[4/3] object-cover rounded-xl"
                />
              ) : (
                <div className="w-full aspect-[4/3] rounded-xl bg-bg-dark border border-white/5 flex items-center justify-center">
                  <span className="font-mono text-[9px] text-text-dim text-opacity-40 uppercase">Photo de moi</span>
                </div>
              )}
              {about?.bikePhoto ? (
                <img
                  src={about.bikePhoto}
                  alt="Le vélo"
                  referrerPolicy="no-referrer"
                  className="w-full aspect-[4/3] object-cover rounded-xl"
                />
              ) : (
                <div className="w-full aspect-[4/3] rounded-xl bg-bg-dark border border-white/5 flex items-center justify-center">
                  <span className="font-mono text-[9px] text-text-dim text-opacity-40 uppercase">Photo du vélo</span>
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
