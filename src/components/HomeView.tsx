import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { SiteStats, TripSummary } from "../types";
import { Lang } from "../i18n";
import { STAGE_TYPE_META, STAGE_TYPE_ORDER, StageType } from "../stageTypes";
import RainRadar from "./RainRadar";
import Globe from "./Globe";
import GlobeErrorBoundary from "./GlobeErrorBoundary";

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

// Texte "Buy me a ... coffee" adapté au pays traversé (spécialité café locale).
// Drapeau emoji depuis le code ISO à 2 lettres (universel, aucune liste).
// Ex : "AT" → 🇦🇹. Le code vient du géocodage Nominatim, stocké au sync.
function countryFlag(code?: string): string {
  if (!code || code.length !== 2) return "";
  return code.toUpperCase().replace(/./g, c => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

// Direction d'où vient le vent, en points cardinaux (convention météo)
function windCardinal(deg: number, lang: string): string {
  // Labels localisés (N/E/S + O ou W selon la langue)
  const sets: Record<string, string[]> = {
    fr: ["N", "NE", "E", "SE", "S", "SO", "O", "NO"],
    en: ["N", "NE", "E", "SE", "S", "SW", "W", "NW"],
    es: ["N", "NE", "E", "SE", "S", "SO", "O", "NO"],
    it: ["N", "NE", "E", "SE", "S", "SO", "O", "NO"],
    de: ["N", "NO", "O", "SO", "S", "SW", "W", "NW"],
    nl: ["N", "NO", "O", "ZO", "Z", "ZW", "W", "NW"],
  };
  const labels = sets[lang] || sets.fr;
  const idx = Math.round((deg % 360) / 45) % 8;
  return labels[idx];
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
  // Traduit le nom du pays courant selon la langue (données en français).
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
  const countryLabel = (c: string) => (!c || lang === "fr" ? c : COUNTRY_LABELS[c]?.[lang] ?? c);

  const latest = trips[trips.length - 1];

  // Construit le tracé du globe à partir des vrais GPX (segments → [lng,lat]).
  // Les segments sont stockés en [lat,lng] dans les données → on inverse.
  const globeRoute: [number, number][] = (() => {
    const out: [number, number][] = [];
    for (const tr of trips) {
      const segs = (tr.segments && tr.segments.length ? tr.segments : (tr.track ? [tr.track] : []));
      for (const seg of segs) for (const [lat, lng] of seg) out.push([lng, lat]);
    }
    return out;
  })();
  const globeHere: [number, number] | null =
    (latest?.mapLng != null && latest?.mapLat != null) ? [latest.mapLng, latest.mapLat] : null;

  const [weather, setWeather] = useState<WeatherDay[]>([]);
  const [radarOpen, setRadarOpen] = useState(false);
  // Hauteur du hero figée au chargement → ne bouge plus quand la barre d'adresse
  // mobile apparaît/disparaît au scroll (évite le redimensionnement saccadé).
  const [heroH, setHeroH] = useState<number | null>(null);
  useEffect(() => { setHeroH(window.innerHeight); }, []);

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

  // ── Statistiques : global ou par véhicule (vélo, train, bus, bateau, avion) ──
  const [vehicle, setVehicle] = useState<"all" | StageType>("all");
  const availableTypes = STAGE_TYPE_ORDER.filter(ty => !!stats?.byType?.[ty]);
  const bt = vehicle !== "all" ? stats?.byType?.[vehicle] : undefined;
  const nf = (n: number) => n.toLocaleString("fr-FR");
  const metrics = !stats
    ? [
        { value: "—", label: t("home.km") },
        { value: "—", label: t("home.countries") },
        { value: "—", label: t("home.days") },
        { value: "—", label: t("home.elevation") },
      ]
    : bt
      ? [
          { value: nf(bt.km), label: t("home.km") },
          { value: String(bt.countries), label: t("home.countries") },
          { value: String(bt.days), label: t("home.days") },
          // Dénivelé seulement à vélo ; sinon le nombre d'étapes
          vehicle === "bike"
            ? { value: nf(bt.elevation), label: t("home.elevation") }
            : { value: String(bt.stages), label: t("home.stages") },
        ]
      : [
          { value: nf(stats.totalKm), label: t("home.km") },
          { value: String(stats.totalCountries), label: t("home.countries") },
          { value: String(stats.totalDays), label: t("home.days") },
          { value: nf(stats.totalElevation), label: t("home.elevation") },
        ];

  // Paragraphes de présentation dans la bonne langue
  const presParagraphs = about
    ? (about.translations?.[lang] || about.paragraphs || [])
    : [];

  return (
    <div className="w-full">

      {/* ── HERO : titre + globe rapprochés ── */}
      <div
        className="relative w-full overflow-hidden flex flex-col items-center font-sans"
        style={{ height: heroH ? `${heroH + 61}px` : "100vh" }}
      >
        {/* Titre */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.0 }}
          className="relative z-20 pt-[101px] px-4 text-center pointer-events-none shrink-0"
        >
          <h1 className="font-display font-bold text-3xl md:text-5xl lg:text-6xl text-brand-orange uppercase tracking-[0.03em] leading-tight">
            THE MOVING BEARD
          </h1>
        </motion.div>

        {/* Globe : remplit l'espace restant entre le titre et la flèche */}
        <div className="relative flex-1 w-full min-h-0 z-0 -mt-6">
          <GlobeErrorBoundary>
            <Globe route={globeRoute} here={globeHere} />
          </GlobeErrorBoundary>
        </div>

        {/* Indicateur de scroll */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 1], y: [0, 8, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="relative z-20 mb-6 flex flex-col items-center gap-2 text-brand-teal/70 pointer-events-none shrink-0"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>
        </motion.div>

        {/* Léger dégradé bas pour fondre vers la section stats */}
        <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-b from-transparent to-bg-dark pointer-events-none z-[5]" />
      </div>

      {/* ── STATS + MÉTÉO (révélées au scroll, juste sous le globe) ── */}
      <div className="relative w-full flex justify-center px-4 md:px-10 -mt-8 mb-4 font-sans">
        <div className="relative z-20 w-full max-w-5xl flex flex-col justify-center items-center text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="w-full max-w-4xl bg-surface-card/80 backdrop-blur-md rounded-3xl border border-text-on/10 p-5 md:p-8 flex flex-col gap-6 shadow-lg"
          >
            {/* Sélecteur de véhicule */}
            {availableTypes.length > 0 && (
              <div className="-mx-1 overflow-x-auto">
                <div role="tablist" aria-label={t("home.by_vehicle")} className="mx-auto w-max max-w-none flex items-center gap-1 rounded-full border border-text-on/10 bg-bg-dark/60 p-1">
                  {(["all", ...availableTypes] as ("all" | StageType)[]).map(v => {
                    const active = vehicle === v;
                    return (
                      <button
                        key={v}
                        role="tab"
                        aria-selected={active}
                        onClick={() => setVehicle(v)}
                        className={`px-3.5 py-1.5 rounded-full font-display text-[11px] font-bold tracking-wide whitespace-nowrap transition-all cursor-pointer inline-flex items-center gap-1.5 ${
                          active ? "bg-brand-sand text-surface-card shadow-sm" : "text-text-dim hover:text-text-on"
                        }`}
                      >
                        {v !== "all" && <span className="text-sm leading-none">{STAGE_TYPE_META[v].emoji}</span>}
                        {v === "all" ? t("home.all") : t(`type.${v}`)}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-2 divide-y divide-brand-teal/10 md:divide-y-0 md:divide-x md:divide-brand-teal/10">
              {metrics.map((m, i) => (
                <div key={i} className="flex flex-col items-center justify-center pt-3 md:pt-0 pb-3 md:pb-0 px-2 first:pt-0 last:pb-0">
                  <div className="font-display text-3xl md:text-4xl lg:text-5xl font-black text-brand-teal tracking-tight">
                    {m.value}
                  </div>
                  <div className="font-display font-extrabold text-[10px] text-text-on/50 uppercase tracking-[0.15em] mt-2">
                    {m.label}
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-brand-teal/10 pt-4 flex flex-col items-center gap-3 text-xs font-mono">
              <span className="text-text-on/80 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {stats
                  ? `${t("home.current")} : ${stats.currentLocation}${countryFlag(stats.currentCountryCode) ? "," : ""}`
                  : t("home.locating")}
                {stats && countryFlag(stats.currentCountryCode) && (
                  <span className="text-sm leading-none" title={countryLabel(stats.currentCountry)}>{countryFlag(stats.currentCountryCode)}</span>
                )}
              </span>

              {/* Météo 2 jours : aujourd'hui | demain */}
              {weather.length >= 2 && (
                <div className="mt-3 w-full border-t border-brand-teal/10 pt-5">
                  <div className="grid grid-cols-2 divide-x divide-brand-teal/10">
                    {weather.slice(0, 2).map((day, i) => (
                      <div key={i} className={`flex flex-col items-center text-center gap-2.5 ${i === 0 ? "pr-5" : "pl-5"}`}>
                        <span className="text-[10px] uppercase tracking-widest text-brand-teal font-bold">{day.label}</span>
                        <span className="text-4xl leading-none">{day.icon}</span>
                        <div className="text-base font-semibold">
                          <span className="text-red-500">{day.tempMax}°</span>
                          <span className="text-text-on/30 mx-1.5">/</span>
                          <span className="text-sky-600">{day.tempMin}°</span>
                        </div>
                        <div className="flex items-center gap-4 font-mono text-[11px] text-text-on/60 mt-1">
                          <span className="flex items-center gap-1.5">
                            <span className="text-text-on/40">{t("weather.uv")}</span>
                            <span className={`font-bold ${uvColor(day.uvMax)}`}>{day.uvMax}</span>
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="text-sm leading-none">💨</span>
                            <span className="text-brand-teal font-bold">{windCardinal(day.windDir, lang)}</span>
                            <span>{day.windMax}<span className="text-[8px] text-text-on/40 ml-0.5">km/h</span></span>
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Bouton radar sous la météo */}
                  {latest?.mapLat && latest?.mapLng && (
                    <button
                      onClick={() => setRadarOpen(true)}
                      className="mt-5 w-full inline-flex items-center justify-center gap-2 font-mono text-[10px] uppercase tracking-widest py-3 rounded-full border border-brand-teal/40 text-brand-teal hover:bg-brand-teal hover:text-white transition-all cursor-pointer"
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
              <div className="flex flex-col gap-4 text-base text-text-dim leading-relaxed font-light">
                {presParagraphs.length > 0 ? (
                  presParagraphs.map((para, i) => (
                    <p key={i} className={i === 0 ? "text-lg text-text-on font-normal" : ""}>{para}</p>
                  ))
                ) : (
                  <p className="italic text-text-dim text-opacity-50">Présentation à venir...</p>
                )}
              </div>

              <div className="mt-4 flex justify-center">
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
