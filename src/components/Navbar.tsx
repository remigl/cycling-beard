import { Search, Globe, Check, Sun, Moon, Home, Route, Map as MapIcon } from "lucide-react";
import { useState } from "react";
import { Lang, LANGUAGES } from "../i18n";

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onSearchToggle: () => void;
  lang: Lang;
  changeLang: (l: Lang) => void;
  theme: "light" | "dark";
  toggleTheme: () => void;
  t: (key: string) => string;
}

export default function Navbar({ activeTab, setActiveTab, onSearchToggle, lang, changeLang, theme, toggleTheme, t }: NavbarProps) {
  const [langOpen, setLangOpen] = useState(false);

  const tabs = [
    { id: "home", label: t("nav.home"), Icon: Home },
    { id: "journey", label: t("nav.journey"), Icon: Route },
    { id: "map", label: t("nav.map"), Icon: MapIcon },
  ];

  const currentLang = LANGUAGES.find(l => l.code === lang) || LANGUAGES[0];
  const iconBtn =
    "w-9 h-9 inline-flex items-center justify-center rounded-full text-text-on hover:bg-text-on/10 cursor-pointer transition-colors";

  return (
    <>
      {/* ── Barre du haut ── */}
      <nav className="fixed top-0 left-0 right-0 h-[61px] glass-nav">
        <div className="h-full flex justify-between items-center px-4 md:px-10 w-full">

          {/* Logo */}
          <button
            onClick={() => setActiveTab("home")}
            className="flex items-center gap-2.5 cursor-pointer hover:opacity-80 transition-opacity min-w-0"
            aria-label="Accueil"
          >
            <span className="w-9 h-9 shrink-0 rounded-full bg-brand-sand text-surface-card flex items-center justify-center font-display font-black text-sm">
              R
            </span>
            <span className="flex flex-col items-start leading-none min-w-0">
              <span className="font-display text-[15px] font-bold text-text-on tracking-tight truncate">rémi gladieu</span>
              <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-brand-sand mt-1 hidden sm:block">The Moving Beard</span>
            </span>
          </button>

          {/* Onglets (desktop) */}
          <div className="hidden md:flex items-center gap-1 rounded-full border border-text-on/10 bg-surface-card/60 p-1">
            {tabs.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`px-5 py-1.5 rounded-full font-display text-[11px] font-bold tracking-widest uppercase transition-all cursor-pointer ${
                  activeTab === id
                    ? "bg-brand-sand text-surface-card shadow-sm"
                    : "text-text-dim hover:text-text-on"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Outils */}
          <div className="flex items-center gap-1 text-text-on">
            <button
              onClick={toggleTheme}
              className={iconBtn}
              aria-label={theme === "dark" ? t("theme.light") : t("theme.dark")}
              title={theme === "dark" ? t("theme.light") : t("theme.dark")}
            >
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            {/* Langue */}
            <div className="relative">
              <button
                onClick={() => setLangOpen(!langOpen)}
                className="flex items-center gap-1.5 hover:bg-text-on/10 cursor-pointer transition-colors h-9 px-2.5 rounded-full"
                aria-label="Langue"
              >
                <span className="text-base leading-none">{currentLang.flag}</span>
                <Globe size={14} className="opacity-60" />
              </button>

              {langOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setLangOpen(false)} />
                  <div className="absolute right-0 mt-2 w-44 bg-surface-card border border-text-on/10 rounded-xl shadow-2xl z-50 overflow-hidden language-menu">
                    {LANGUAGES.map(l => (
                      <button
                        key={l.code}
                        onClick={() => { changeLang(l.code); setLangOpen(false); }}
                        className={`w-full flex items-center justify-between gap-2 px-4 py-2.5 text-xs font-mono transition-colors cursor-pointer ${
                          lang === l.code
                            ? "bg-brand-sand/15 text-brand-sand"
                            : "text-text-dim hover:bg-text-on/5 hover:text-text-on"
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

            <button onClick={onSearchToggle} className={iconBtn} aria-label="Rechercher">
              <Search size={18} />
            </button>
          </div>
        </div>
      </nav>

      {/* ── Barre d'onglets du bas (mobile) ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 tabbar" aria-label="Navigation">
        <div className="grid grid-cols-3 h-14">
          {tabs.map(({ id, label, Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-colors ${
                  active ? "text-brand-sand" : "text-text-dim"
                }`}
                aria-current={active ? "page" : undefined}
              >
                <Icon size={21} strokeWidth={active ? 2.5 : 1.8} />
                <span className="font-display text-[10px] font-bold tracking-wide">{label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
