import { Menu, X, Globe, Check } from "lucide-react";
import { useState } from "react";
import { Lang, LANGUAGES } from "../i18n";

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  lang: Lang;
  changeLang: (l: Lang) => void;
  t: (key: string) => string;
}

export default function Navbar({ activeTab, setActiveTab, lang, changeLang, t }: NavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);

  const tabs = [
    { id: "home", label: t("nav.home") },
    { id: "journey", label: t("nav.journey") },
    { id: "map", label: t("nav.map") },
  ];

  const currentLang = LANGUAGES.find(l => l.code === lang) || LANGUAGES[0];

  return (
    <nav className="fixed top-0 w-full z-50 glass-nav transition-all duration-300">
      <div className="flex justify-between items-center px-4 md:px-10 py-2.5 w-full">

        {/* Logo */}
        <div
          onClick={() => setActiveTab("home")}
          className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
        >
          <div className="w-8 h-8 rounded-full bg-brand-sand/20 border border-brand-sand/30 flex items-center justify-center text-brand-sand font-display font-black text-xs">
            R
          </div>
          <span className="font-display text-sm font-semibold italic text-text-on tracking-tight">
            rémi<span className="text-brand-sand font-sans font-light text-[11px] not-italic ml-1.5 uppercase tracking-[0.2em] hidden sm:inline">THE CYCLING BEARD</span>
          </span>
        </div>

        {/* Desktop nav */}
        <div className="hidden md:flex gap-8 font-display text-[11px] font-bold tracking-widest uppercase items-center">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`transition-all duration-300 pb-1 cursor-pointer hover:text-brand-sand ${
                activeTab === tab.id
                  ? "text-brand-sand border-b-2 border-brand-sand font-extrabold"
                  : "text-text-dim text-opacity-80 hover:text-opacity-100"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2 text-text-on">

          {/* Language selector */}
          <div className="relative">
            <button
              onClick={() => setLangOpen(!langOpen)}
              className="flex items-center gap-1.5 hover:text-brand-sand cursor-pointer transition-colors px-2.5 py-1.5 hover:bg-white/5 rounded-full border border-white/10"
              aria-label="Langue"
            >
              <span className="text-base leading-none">{currentLang.flag}</span>
              <span className="text-[10px] font-mono uppercase font-bold">{currentLang.label}</span>
              <Globe size={13} className="opacity-60" />
            </button>

            {langOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setLangOpen(false)} />
                <div className="absolute right-0 mt-2 w-44 bg-[#1c1b1b] border border-white/10 rounded-lg shadow-2xl z-50 overflow-hidden">
                  {LANGUAGES.map(l => (
                    <button
                      key={l.code}
                      onClick={() => { changeLang(l.code); setLangOpen(false); }}
                      className={`w-full flex items-center justify-between gap-2 px-4 py-2.5 text-xs font-mono transition-colors cursor-pointer ${
                        lang === l.code
                          ? "bg-brand-sand/15 text-brand-sand"
                          : "text-text-dim hover:bg-white/5 hover:text-text-on"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span className="text-sm">{l.flag}</span>
                        {l.label}
                      </span>
                      {lang === l.code && <Check size={13} />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 hover:bg-white/5 rounded text-text-on"
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="md:hidden glass-panel border-t-0 p-5 flex flex-col gap-4 font-display text-xs font-bold tracking-widest uppercase text-left">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setMobileMenuOpen(false);
              }}
              className={`p-2 rounded text-left ${
                activeTab === tab.id
                  ? "bg-brand-green/20 text-brand-sand pl-4 border-l-2 border-brand-sand"
                  : "text-text-dim text-opacity-80 hover:bg-white/5"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}
    </nav>
  );
}
