import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X, Share2, Search, ArrowRight } from "lucide-react";
import Navbar from "./components/Navbar";
import HomeView from "./components/HomeView";
import JourneyView from "./components/JourneyView";
import StageDetailView from "./components/StageDetailView";
import MapView from "./components/MapView";
import { SiteStats, TripSummary } from "./types";
import { Lang, makeT } from "./i18n";

export default function App() {
  const [activeTab, setActiveTab] = useState<string>("home");
  const [lang, setLang] = useState<Lang>(() => {
    const saved = typeof localStorage !== "undefined" ? localStorage.getItem("tcb_lang") : null;
    return (saved as Lang) || "fr";
  });
  const t = makeT(lang);

  const changeLang = (l: Lang) => {
    setLang(l);
    localStorage.setItem("tcb_lang", l);
  };
  const [activeStageSlug, setActiveStageSlug] = useState<string>("");

  const [stats, setStats] = useState<SiteStats | null>(null);
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [about, setAbout] = useState<any>(null);

  const [searchDrawerOpen, setSearchDrawerOpen] = useState(false);
  const [globalQuery, setGlobalQuery] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Fetch stats.json + trips.json on mount
  useEffect(() => {
    fetch("/data/stats.json")
      .then(r => r.json())
      .then((data: SiteStats) => {
        setStats(data);
        setActiveStageSlug(data.latestStageSlug);
      })
      .catch(console.error);

    fetch("/data/trips.json")
      .then(r => r.json())
      .then((data: TripSummary[]) => setTrips(data))
      .catch(console.error);

    fetch("/data/about.json")
      .then(r => r.json())
      .then((data) => setAbout(data))
      .catch(() => setAbout(null));
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [activeTab]);

  const handleCustomNavigate = (tabId: string, argument?: string) => {
    if (tabId === "stage" && argument) setActiveStageSlug(argument);
    setActiveTab(tabId);
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: "The Cycling Beard — Rémi",
        text: "Suivez mon expédition à vélo de Saint-Nazaire plein Est !",
        url: window.location.href,
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(window.location.href);
      setToastMessage("Lien copié dans le presse-papier !");
      setTimeout(() => setToastMessage(null), 3500);
    }
  };

  const filteredTrips = trips.filter(t =>
    t.title.toLowerCase().includes(globalQuery.toLowerCase()) ||
    t.country.toLowerCase().includes(globalQuery.toLowerCase()) ||
    t.shortDescription.toLowerCase().includes(globalQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-bg-dark text-text-on flex flex-col justify-between font-sans relative antialiased selection:bg-brand-sand selection:text-bg-dark">

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
        t={t}
      />

      <main className="flex-grow">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="w-full"
          >
            {activeTab === "home" && (
              <HomeView onNavigate={handleCustomNavigate} stats={stats} trips={trips} t={t} about={about} lang={lang} />
            )}
            {activeTab === "journey" && (
              <JourneyView onNavigate={handleCustomNavigate} trips={trips} stats={stats} t={t} lang={lang} />
            )}
            {activeTab === "stage" && (
              <StageDetailView slug={activeStageSlug} onNavigate={handleCustomNavigate} lang={lang} t={t} />
            )}
            {activeTab === "map" && (
              <MapView onNavigate={handleCustomNavigate} trips={trips} t={t} lang={lang} />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      <footer className="bg-bg-dark border-t border-white/5 py-12 px-6 md:px-14 items-center">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6 text-center md:text-left text-xs text-text-dim text-opacity-50 font-mono">
          <div className="flex flex-col gap-1.5 md:items-start">
            <span className="font-display font-black tracking-widest text-[10px] uppercase text-text-on">
              The Cycling Beard // Rémi
            </span>
            <span>© 2026. Voyage en cours · Hébergé sur Vercel.</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-6">
            <button
              onClick={handleShare}
              className="flex items-center gap-1 text-text-on hover:text-brand-sand transition-colors cursor-pointer"
            >
              <Share2 size={12} /> Partager
            </button>
            <button onClick={() => handleCustomNavigate("map")} className="hover:text-text-on transition-colors cursor-pointer">
              Carte
            </button>
          </div>
        </div>
      </footer>

      {/* Search drawer */}
      <AnimatePresence>
        {searchDrawerOpen && (
          <div className="fixed inset-0 z-50 flex justify-end">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSearchDrawerOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="relative w-full max-w-md h-full bg-[#1c1b1b] border-l border-white/5 p-6 flex flex-col justify-between text-left shadow-2xl z-10"
            >
              <div>
                <div className="flex justify-between items-center mb-6">
                  <span className="font-mono text-[10px] font-bold text-brand-sand uppercase tracking-wider">Recherche</span>
                  <button onClick={() => setSearchDrawerOpen(false)} className="p-2 hover:bg-white/5 rounded text-text-on">
                    <X size={18} />
                  </button>
                </div>
                <h3 className="font-display text-lg font-black uppercase text-text-on mb-4">Recherche Globale</h3>
                <input
                  type="text"
                  placeholder="Pays, étape, description..."
                  value={globalQuery}
                  onChange={e => setGlobalQuery(e.target.value)}
                  className="w-full bg-bg-dark border border-white/10 rounded-md p-3 text-xs text-text-on focus:outline-none focus:border-brand-sand mb-6"
                />
                <div className="flex flex-col gap-3">
                  <span className="font-mono text-[8px] uppercase tracking-wider text-text-dim text-opacity-40">Résultats</span>
                  {filteredTrips.map(trip => (
                    <div
                      key={trip.slug}
                      onClick={() => {
                        handleCustomNavigate("stage", trip.slug);
                        setSearchDrawerOpen(false);
                      }}
                      className="group bg-bg-dark hover:bg-brand-green/20 border border-white/5 rounded p-3 transition-colors cursor-pointer"
                    >
                      <span className="font-mono text-[8px] text-brand-sand font-bold block mb-0.5">{trip.country} · {trip.date}</span>
                      <h4 className="font-display text-xs font-bold text-text-on group-hover:text-brand-sand transition-colors">{trip.title}</h4>
                      <p className="text-[10px] text-text-dim text-opacity-65 mt-1 line-clamp-1">{trip.shortDescription}</p>
                    </div>
                  ))}
                  {filteredTrips.length === 0 && (
                    <div className="text-xs text-text-dim text-opacity-35 italic py-4">Aucun résultat.</div>
                  )}
                </div>
              </div>
              <div className="pt-4 border-t border-white/5 mt-auto font-mono text-[10px] text-text-dim text-opacity-30">
                ÉCHAP POUR FERMER
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
