import { Search, Compass, Menu, X } from "lucide-react";
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
    { id: "support", label: "Me Soutenir" }
  ];

  return (
    <nav className="fixed top-0 w-full z-50 glass-nav transition-all duration-300">
      <div className="flex justify-between items-center px-4 md:px-10 py-3.5 w-full">
        {/* Brand Logo in Editorial serifs */}
        <div 
          onClick={() => setActiveTab("home")}
          className="font-display text-lg md:text-xl font-semibold italic text-text-on tracking-tight cursor-pointer hover:blue-accent transition-opacity flex items-center"
        >
          <img 
            src="/src/assets/images/beard_logo_1779815180125.png" 
            alt="The Cycling Beard Logo" 
            className="h-8 w-8 rounded-full object-cover mr-2 select-none border border-white/10"
            referrerPolicy="no-referrer"
          />
          rémi<span className="text-brand-sand font-sans font-light text-[11px] not-italic ml-2 uppercase tracking-[0.2em] inline-block">THE CYCLING BEARD</span>
        </div>

        {/* Desktop Navigation Links */}
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

        {/* Global Toolbar Buttons */}
        <div className="flex items-center gap-3 text-text-on">
          <button 
            onClick={onSearchToggle}
            className="hover:text-brand-sand cursor-pointer transition-colors p-2 hover:bg-white/5 rounded-full"
            aria-label="Rechercher"
          >
            <Search size={18} />
          </button>
          
          {/* Mobile Hamburguer Toggle */}
          <button 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)} 
            className="md:hidden p-2 hover:bg-white/5 rounded text-text-on"
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden glass-panel border-t-0 p-5 flex flex-col gap-4 font-display text-xs font-bold tracking-widest uppercase text-left slide-in-top">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setMobileMenuOpen(false);
              }}
              className={`p-2 rounded text-left ${
                activeTab === tab.id
                  ? "bg-brand-green/20 text-brand-sand text-opacity-100 pl-4 border-l-2 border-brand-sand"
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
