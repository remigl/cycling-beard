import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { SiteStats, TripSummary } from "../types";
import { Lang } from "../i18n";
import RainRadar from "./RainRadar";

// URL Buy Me a Coffee
const BMC_URL = "https://buymeacoffee.com/cyclingBeard";

// Code météo Open-Meteo → emoji
function weatherIcon(code: number): string {
  if (code === 0) return "☀️";
  if (code <= 2) return "🌤️";
  if (code === 3) return "☁️";
  if (code <= 48) return "🌫️";
  if (code <= 67) return "🌧️";
  if (code <= 77) return "🌨️";
  if (code <= 82) return "🌧️";
  if (code <= 86) return "🌨️";
  if (code >= 95) return "⛈️";
  return "🌥️";
}

// Flèche indiquant la direction VERS LAQUELLE le vent souffle
function windArrow(deg: number): string {
  const arrows = ["↓", "↙", "←", "↖", "↑", "↗", "→", "↘"];
  // deg = provenance ; on ajoute 180° pour la direction du déplacement
  const idx = Math.round((((deg + 180) % 360) / 45)) % 8;
  return arrows[idx];
}

// Couleur selon l'indice UV (faible→vert, modéré→jaune, élevé→orange, très élevé→rouge)
function uvColor(uv: number): string {
  if (uv <= 2) return "text-green-400";
  if (uv <= 5) return "text-yellow-400";
  if (uv <= 7) return "text-orange-400";
  return "text-red-400";
}

interface WeatherDay {
  label: string;
  icon: string;
  tempMax: number;
  tempMin: number;
  uvMax: number;
  windMax: number;     // km/h
  windDir: number;     // degrés
}

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

  const [weather, setWeather] = useState<WeatherDay[]>([]);
  const [radarOpen, setRadarOpen] = useState(false);

  // Récupère la météo 2 jours de la position actuelle (dernier point GPS)
  useEffect(() => {
    if (!latest?.mapLat || !latest?.mapLng) return;
    const labels: Record<string, [string, string]> = {
      fr: ["Aujourd'hui", "Demain"], en: ["Today", "Tomorrow"],
      es: ["Hoy", "Mañana"], it: ["Oggi", "Domani"],
      de: ["Heute", "Morgen"], nl: ["Vandaag", "Morgen"],
    };
    const [todayLbl, tomorrowLbl] = labels[lang] || labels.fr;

    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latest.mapLat}&longitude=${latest.mapLng}&daily=weather_code,temperature_2m_max,temperature_2m_min,uv_index_max,wind_speed_10m_max,wind_direction_10m_dominant&timezone=auto&forecast_days=2`)
      .then(r => r.json())
      .then(data => {
        const d = data.daily;
        if (!d) return;
        setWeather([
          { label: todayLbl, icon: weatherIcon(d.weather_code[0]), tempMax: Math.round(d.temperature_2m_max[0]), tempMin: Math.round(d.temperature_2m_min[0]), uvMax: Math.round(d.uv_index_max[0]), windMax: Math.round(d.wind_speed_10m_max[0]), windDir: d.wind_direction_10m_dominant[0] },
          { label: tomorrowLbl, icon: weatherIcon(d.weather_code[1]), tempMax: Math.round(d.temperature_2m_max[1]), tempMin: Math.round(d.temperature_2m_min[1]), uvMax: Math.round(d.uv_index_max[1]), windMax: Math.round(d.wind_speed_10m_max[1]), windDir: d.wind_direction_10m_dominant[1] },
        ]);
      })
      .catch(() => setWeather([]));
  }, [latest?.mapLat, latest?.mapLng, lang]);

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
            <h1 className="font-display font-bold text-4xl md:text-6xl lg:text-7xl text-brand-sand uppercase tracking-[0.05em] leading-tight">
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
                  <div className="font-display font-extrabold text-[10px] text-brand-sand uppercase tracking-[0.15em] mt-2">
                    {m.label}
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-white/10 pt-4 flex flex-col items-center gap-3 text-xs font-mono">
              <span className="text-brand-sand flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {stats ? `${t("home.current")} : ${stats.currentLocation}` : t("home.locating")}
              </span>

              {/* Météo 2 jours : aujourd'hui | demain */}
              {weather.length >= 2 && (
                <div className="mt-2 bg-black/25 backdrop-blur-sm rounded-2xl border border-white/10 p-4">
                  <div className="grid grid-cols-2 divide-x divide-white/10">
                    {weather.slice(0, 2).map((day, i) => (
                      <div key={i} className={`flex flex-col items-center text-center gap-2 ${i === 0 ? "pr-4" : "pl-4"}`}>
                        <span className="text-[9px] uppercase tracking-widest text-brand-sand font-bold">{day.label}</span>
                        <span className="text-3xl leading-none">{day.icon}</span>
                        <div className="text-sm font-semibold">
                          <span className="text-red-400">{day.tempMax}°</span>
                          <span className="text-text-dim/40 mx-1">/</span>
                          <span className="text-sky-400">{day.tempMin}°</span>
                        </div>
                        <div className="flex flex-col gap-1 font-mono text-[10px] text-text-dim mt-1">
                          <span className="flex items-center justify-center gap-1.5">
                            <span>{t("weather.uv")}</span>
                            <span className={`font-bold ${uvColor(day.uvMax)}`}>{day.uvMax}</span>
                          </span>
                          <span className="flex items-center justify-center gap-1.5">
                            <span className="text-base leading-none">{windArrow(day.windDir)}</span>
                            {day.windMax} <span className="text-[8px] text-text-dim/60">km/h</span>
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Bouton radar sous la météo */}
                  {latest?.mapLat && latest?.mapLng && (
                    <button
                      onClick={() => setRadarOpen(true)}
                      className="mt-4 w-full inline-flex items-center justify-center gap-2 font-mono text-[9px] uppercase tracking-widest py-2.5 rounded-full border border-brand-sand/40 text-brand-sand hover:bg-brand-sand hover:text-bg-dark transition-all cursor-pointer"
                    >
                      🌧️ {t("radar.button")}
                    </button>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </div>

      {/* Popup radar de pluie */}
      {radarOpen && latest?.mapLat && latest?.mapLng && (
        <RainRadar lat={latest.mapLat} lng={latest.mapLng} onClose={() => setRadarOpen(false)} t={t} />
      )}

      {/* ── PRÉSENTATION ── */}
      <div className="w-full px-4 md:px-14 py-20 md:py-28 bg-surface-container/30">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className="font-mono text-[10px] text-brand-sand font-bold tracking-[0.3em] uppercase mb-3">
              {t("about.title")}
            </p>
            <div className="w-12 h-px bg-brand-sand mx-auto" />
          </div>

          <div className="grid md:grid-cols-12 gap-10 md:gap-14 items-center">

            {/* Photos à gauche avec légendes */}
            <div className="md:col-span-5 flex flex-col gap-6">
              <figure className="flex flex-col gap-2">
                <div className="overflow-hidden rounded-2xl shadow-lg">
                  {about?.mePhoto ? (
                    <img src={about.mePhoto} alt="Rémi" referrerPolicy="no-referrer"
                      className="w-full aspect-[4/3] object-cover hover:scale-105 transition-transform duration-500" />
                  ) : (
                    <div className="w-full aspect-[4/3] bg-bg-dark border border-text-on/5 flex items-center justify-center">
                      <span className="font-mono text-[9px] text-text-dim text-opacity-40 uppercase">Photo de moi</span>
                    </div>
                  )}
                </div>
                <figcaption className="font-mono text-[9px] text-text-dim uppercase tracking-widest text-center">
                  {t("about.cap_me")}
                </figcaption>
              </figure>

              <figure className="flex flex-col gap-2">
                <div className="overflow-hidden rounded-2xl shadow-lg">
                  {about?.bikePhoto ? (
                    <img src={about.bikePhoto} alt="Le vélo" referrerPolicy="no-referrer"
                      className="w-full aspect-[4/3] object-cover hover:scale-105 transition-transform duration-500" />
                  ) : (
                    <div className="w-full aspect-[4/3] bg-bg-dark border border-text-on/5 flex items-center justify-center">
                      <span className="font-mono text-[9px] text-text-dim text-opacity-40 uppercase">Photo du vélo</span>
                    </div>
                  )}
                </div>
                <figcaption className="font-mono text-[9px] text-text-dim uppercase tracking-widest text-center">
                  {t("about.cap_bike")}
                </figcaption>
              </figure>
            </div>

            {/* Texte à droite */}
            <div className="md:col-span-7 flex flex-col gap-5">
              <h2 className="font-display text-2xl md:text-3xl font-black text-text-on leading-tight">Rémi</h2>
              <div className="flex flex-col gap-4 text-base text-text-dim leading-relaxed font-light">
                {presParagraphs.length > 0 ? (
                  presParagraphs.map((para, i) => (
                    <p key={i} className={i === 0 ? "text-lg text-text-on font-normal" : ""}>{para}</p>
                  ))
                ) : (
                  <p className="italic text-text-dim text-opacity-50">Présentation à venir...</p>
                )}
              </div>

              <div className="mt-4">
                <a href={BMC_URL} target="_blank" rel="noopener noreferrer"
                  className="inline-block hover:opacity-90 hover:-translate-y-0.5 transition-all">
                  <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png"
                    alt={t("support.cta")} style={{ height: "52px", width: "auto" }} referrerPolicy="no-referrer" />
                </a>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
