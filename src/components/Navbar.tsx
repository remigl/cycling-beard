import { Search, Menu, X } from "lucide-react";
import { useState } from "react";

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onSearchToggle: () => void;
}

export default function Navbar({ activeTab, setActiveTab, onSearchToggle }: NavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const tabs = [
    { id: "home", label: "Accueil" },
    { id: "journey", label: "Itinéraire" },
    { id: "map", label: "Carte de Suivi" },
    { id: "about", label: "À Propos" },
    { id: "support", label: "Me Soutenir" },
  ];

  return (
    <nav className="fixed top-0 w-full z-50 glass-nav transition-all duration-300">
      <div className="flex justify-between items-center px-4 md:px-10 py-3.5 w-full">

        {/* Logo */}
        <div
          onClick={() => setActiveTab("home")}
          className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
        >
          {/* Fallback texte si pas de logo image */}
          <div className="w-8 h-8 rounded-full bg-brand-sand/20 border border-brand-sand/30 flex items-center justify-center text-brand-sand font-display font-black text-xs">
            R
          </div>
          <span className="font-display text-sm font-semibold italic text-text-on tracking-tight">
            rémi<span className="text-brand-sand font-sans font-light text-[11px] not-italic ml-1.5 uppercase tracking-[0.2em]">THE CYCLING BEARD</span>
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
        <div className="flex items-center gap-3 text-text-on">
          <button
            onClick={onSearchToggle}
            className="hover:text-brand-sand cursor-pointer transition-colors p-2 hover:bg-white/5 rounded-full"
            aria-label="Rechercher"
          >
            <Search size={18} />
          </button>
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
