import { useState, useEffect, useMemo } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Share2, Compass } from "lucide-react";
import Navbar from "./components/Navbar";
import ViewErrorBoundary from "./components/ViewErrorBoundary";
import HomeView from "./components/HomeView";
import JourneyView from "./components/JourneyView";
import MapView from "./components/MapView";
import { SiteStats, TripSummary } from "./types";
import { Lang, makeT } from "./i18n";
import { registerCountryCodes } from "./lib/countryName";

export default function App() {
  const [activeTab, setActiveTab] = useState<string>("home");
  const [lang, setLang] = useState<Lang>(() => {
    const saved = typeof localStorage !== "undefined" ? localStorage.getItem("tcb_lang") : null;
    return (saved as Lang) || "fr";
  });
  const t = useMemo(() => makeT(lang), [lang]);

  // Thème clair/sombre : choix mémorisé, sinon réglage du système.
  // (index.html applique déjà data-theme avant l'affichage pour éviter le flash.)
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    try {
      const saved = localStorage.getItem("tmb_theme");
      if (saved === "light" || saved === "dark") return saved;
    } catch { /* stockage indisponible */ }
    return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "dark" ? "#0E1114" : "#F7F5F0");
  }, [theme]);
  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    try { localStorage.setItem("tmb_theme", next); } catch { /* ignoré */ }
  };

  const changeLang = (l: Lang) => {
    setLang(l);
    localStorage.setItem("tcb_lang", l);
  };
  const [activeStageSlug, setActiveStageSlug] = useState<string>("");

  const [stats, setStats] = useState<SiteStats | null>(null);
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [about, setAbout] = useState<any>(null);

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Fetch stats.json + trips.json on mount
  useEffect(() => {
    // "no-cache" = le navigateur revalide auprès du serveur (ETag) : réponse
    // 304 instantanée si rien n'a changé, nouvelle version sinon. Plus de
    // paramètre aléatoire qui forçait un re-téléchargement complet à chaque visite.
    const opts: RequestInit = { cache: "no-cache" };
    fetch("/data/stats.json", opts)
      .then(r => r.json())
      .then((data: SiteStats) => {
        setStats(data);
        setActiveStageSlug(data.latestStageSlug);
      })
      .catch(console.error);

    fetch("/data/trips.json", opts)
      .then(r => r.json())
      .then((data: TripSummary[]) => { registerCountryCodes(data); setTrips(data); })
      .catch(console.error);

    fetch("/data/about.json", opts)
      .then(r => r.json())
      .then((data) => setAbout(data))
      .catch(() => setAbout(null));
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [activeTab]);

  const handleCustomNavigate = (tabId: string, argument?: string) => {
    // Le détail d'étape a été retiré : toute navigation "stage" mène à l'Itinéraire.
    if (tabId === "stage") { setActiveTab("journey"); return; }
    setActiveTab(tabId);
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: "The Moving Beard — Rémi Gladieu",
        text: t("share.text"),
        url: window.location.href,
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(window.location.href);
      setToastMessage(t("common.link_copied"));
      setTimeout(() => setToastMessage(null), 3500);
    }
  };


  return (
    <div className="min-h-screen text-text-on flex flex-col justify-between font-sans relative antialiased selection:bg-brand-sand selection:text-bg-dark">
      {/* Toast */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-20 right-6 z-50 bg-[#1c1b1b] border border-brand-sand text-brand-sand text-xs font-mono py-3 px-5 rounded-md shadow-[0_4px_20px_rgba(0,0,0,0.5)] flex items-center gap-2"
          >
            <Compass size={14} className="marker-pulse" />
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        lang={lang}
        changeLang={changeLang}
        theme={theme}
        toggleTheme={toggleTheme}
        t={t}
      />

      <main className="flex-grow relative z-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="w-full"
          >
            {activeTab === "home" && (
              <ViewErrorBoundary label={t("common.error")}>
                <HomeView onNavigate={handleCustomNavigate} stats={stats} trips={trips} t={t} about={about} lang={lang} />
              </ViewErrorBoundary>
            )}
            {activeTab === "journey" && (
              <ViewErrorBoundary label={t("common.error")}>
                <JourneyView onNavigate={handleCustomNavigate} trips={trips} stats={stats} t={t} lang={lang} />
              </ViewErrorBoundary>
            )}
            {activeTab === "map" && (
              <ViewErrorBoundary label={t("common.error")}>
                <MapView onNavigate={handleCustomNavigate} trips={trips} t={t} lang={lang} />
              </ViewErrorBoundary>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {activeTab !== "map" && (
      <footer className="relative z-10 border-t border-white/5 pt-12 pb-28 md:pb-12 px-6 md:px-14 items-center">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6 text-center md:text-left text-xs text-text-dim text-opacity-50 font-mono">
          <div className="flex flex-col gap-1.5 md:items-start">
            <span className="font-display font-black tracking-widest text-[10px] uppercase text-text-on">
              The Moving Beard // Rémi Gladieu
            </span>
            <span>{t("footer.status")}</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-6">
            <button
              onClick={handleShare}
              className="flex items-center gap-1 text-text-on hover:text-brand-sand transition-colors cursor-pointer"
            >
              <Share2 size={12} /> {t("common.share")}
            </button>
            <button onClick={() => handleCustomNavigate("map")} className="hover:text-text-on transition-colors cursor-pointer">
              {t("nav.map")}
            </button>
          </div>
        </div>
      </footer>
      )}

    </div>
  );
}
