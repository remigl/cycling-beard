import { Coffee, Heart, ExternalLink, Sparkles, CheckCircle } from "lucide-react";
import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";

interface CoffeeContribution {
  id: string;
  name: string;
  cups: number;
  message?: string;
  date: string;
}

export default function SupportView() {
  const [coffeeName, setCoffeeName] = useState("");
  const [coffeeMsg, setCoffeeMsg] = useState("");
  const [selectedCups, setSelectedCups] = useState<number>(3);
  const [contributions, setContributions] = useState<CoffeeContribution[]>([]);
  const [coffeeSuccess, setCoffeeSuccess] = useState(false);
  const [floatingCups, setFloatingCups] = useState<{ id: number; left: number }[]>([]);

  // Initialize and load simulated donations
  useEffect(() => {
    const saved = localStorage.getItem("cycling_beard_coffees");
    if (saved) {
      setContributions(JSON.parse(saved));
    } else {
      const initial: CoffeeContribution[] = [
        { id: "1", name: "Estelle de Nantes", cups: 3, message: "Pour affronter le vent d'Est !", date: "Il y a 1h" },
        { id: "2", name: "Marc-Antoine", cups: 5, message: "Impressionné par le dénivelé des Alpes. Force à toi !", date: "Il y a 4h" },
        { id: "3", name: "Vélo Club Solitaire", cups: 1, message: "Bonne route l'ami !", date: "Hier" }
      ];
      setContributions(initial);
      localStorage.setItem("cycling_beard_coffees", JSON.stringify(initial));
    }
  }, []);

  const handleCoffeeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!coffeeName.trim()) return;

    const newContrib: CoffeeContribution = {
      id: Date.now().toString(),
      name: coffeeName,
      cups: selectedCups,
      message: coffeeMsg.trim() || undefined,
      date: "À l'instant"
    };

    const updated = [newContrib, ...contributions];
    setContributions(updated);
    localStorage.setItem("cycling_beard_coffees", JSON.stringify(updated));
    
    // Trigger flying cup animation
    const newCups = Array.from({ length: selectedCups }).map((_, i) => ({
      id: Date.now() + i,
      left: Math.random() * 80 + 10 // random percentage
    }));
    setFloatingCups(newCups);
    
    setCoffeeSuccess(true);
    setCoffeeName("");
    setCoffeeMsg("");
    
    // Clear success message shortly after
    setTimeout(() => {
      setCoffeeSuccess(false);
    }, 4500);

    // Redirect to actual buy me a coffee link
    window.open("https://buymeacoffee.com/thecyclingbeard", "_blank");
  };

  return (
    <div className="w-full min-h-screen pt-24 pb-20 px-4 md:px-14 flex flex-col items-center bg-bg-dark text-text-on relative overflow-hidden">
      
      {/* Floating Coffee Animations Layer */}
      <div className="absolute inset-0 pointer-events-none z-30 overflow-hidden">
        <AnimatePresence>
          {floatingCups.map((cup) => (
            <motion.div
              key={cup.id}
              initial={{ y: "100vh", opacity: 0, scale: 0.8, rotate: 0 }}
              animate={{ y: "-10vh", opacity: [0, 1, 1, 0], scale: 1.2, rotate: Math.random() * 60 - 30 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 3.5, ease: "easeOut" }}
              style={{ left: `${cup.left}%` }}
              className="absolute text-5xl select-none"
            >
              ☕
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className="max-w-4xl w-full text-left relative z-10">
        
        {/* Header Display */}
        <div className="mb-12">
          <p className="font-mono text-[10px] text-brand-sand font-bold tracking-widest uppercase">
            Soutien et Solidarité
          </p>
          <h1 className="font-display text-3xl md:text-5xl font-black uppercase mt-1 text-text-on">
            Me Soutenir dans l'Aventure
          </h1>
          <p className="text-xs md:text-sm text-text-dim text-opacity-85 mt-3 max-w-2xl font-light leading-relaxed">
            Chaque kilomètre parcouru demande de l'énergie et une logistique minutieuse. En offrant un café virtuel à Rémi, vous participez directement au ravitaillement, au renouvellement du matériel d'usure (chambres à air, pneus) et aux frais logistiques sur les routes du monde.
          </p>
        </div>

        <div className="grid md:grid-cols-12 gap-8 items-start">
          
          {/* Main BMC Plugin Frame */}
          <div className="md:col-span-7 bg-[#261f1c]/90 border border-[#ffdd00]/20 rounded-2xl p-6 md:p-8 text-left shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-1 pointer-events-none">
              <span className="block w-20 h-20 bg-[#ffdd00]/5 rounded-bl-full absolute top-0 right-0 -z-10" />
            </div>

            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-[#ffdd00]/10 rounded-xl border border-[#ffdd00]/30 flex items-center justify-center">
                <Coffee size={24} className="text-[#ffdd00] fill-[#ffdd00]/20 animate-bounce" style={{ animationDuration: "2s" }} />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[9px] uppercase tracking-widest text-[#ffdd00] font-bold">SOUTIEN DIRECT</span>
                  <Sparkles size={11} className="text-[#ffdd00]" />
                </div>
                <h3 className="font-display text-lg font-black uppercase text-text-on">BUY ME A COFFEE ☕</h3>
              </div>
            </div>

            <p className="text-xs text-[#e0cfc5] text-opacity-90 leading-relaxed font-light mb-6">
              Offrez un ou plusieurs cafés pour encourager l'expédition ! Votre message sera consigné instantanément et s'affichera dans le flux ci-contre.
            </p>

            <form onSubmit={handleCoffeeSubmit} className="space-y-4 font-sans">
              
              {/* Cup Selector row */}
              <div className="space-y-2">
                <label className="text-[10px] font-mono uppercase text-[#e0cfc5] tracking-wider font-bold block">
                  Sélectionner la quantité :
                </label>
                <div className="flex gap-2">
                  {[1, 3, 5, 10].map((cupCount) => (
                    <button
                      key={cupCount}
                      type="button"
                      onClick={() => setSelectedCups(cupCount)}
                      className={`flex-1 py-3 rounded-xl border text-sm font-mono font-black uppercase transition-all duration-300 cursor-pointer ${
                        selectedCups === cupCount
                          ? "bg-[#ffdd00] text-[#1a1412] border-[#ffdd00] scale-[1.03] shadow-md"
                          : "bg-[#181210]/60 border-[#ffdd00]/20 text-[#e0cfc5] hover:border-[#ffdd00]/50"
                      }`}
                    >
                      {cupCount} <span className="ml-1">☕</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Backer Details */}
              <div className="grid grid-cols-1 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase text-[#e0cfc5]/60 tracking-wider block">Votre Nom / Pseudo</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Estelle de Nantes"
                    value={coffeeName}
                    onChange={(e) => setCoffeeName(e.target.value)}
                    className="w-full bg-[#181210]/80 border border-[#ffdd00]/10 rounded-lg p-3 text-text-on text-xs placeholder-[#e0cfc5]/35 focus:outline-none focus:border-[#ffdd00]/40 font-mono transition-all"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase text-[#e0cfc5]/60 tracking-wider block">Message de soutien</label>
                  <textarea
                    placeholder="Ex: Bon vent pour les prochaines étapes ! On te suit tous les jours."
                    value={coffeeMsg}
                    onChange={(e) => setCoffeeMsg(e.target.value)}
                    rows={3}
                    className="w-full bg-[#181210]/80 border border-[#ffdd00]/10 rounded-lg p-3 text-text-on text-xs placeholder-[#e0cfc5]/35 focus:outline-none focus:border-[#ffdd00]/40 font-light transition-all resize-none"
                  />
                </div>
              </div>

              {/* CTA Action button */}
              <button
                type="submit"
                className="w-full bg-[#ffdd00] text-[#1a1412] text-xs font-display font-black uppercase tracking-widest p-4 rounded-xl hover:bg-[#ffeb3b] active:scale-98 transition-all cursor-pointer flex items-center justify-center gap-2 shadow-xl"
              >
                <span>OFFRIR LES CAFÉS ({(selectedCups * 5)} €)</span>
                <ExternalLink size={14} />
              </button>
            </form>

            {/* Success indicator popup inside box */}
            <AnimatePresence>
              {coffeeSuccess && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-4 p-3 bg-emerald-950/40 border border-emerald-500/30 rounded-lg text-emerald-400 font-mono text-xs flex items-center gap-2.5"
                >
                  <CheckCircle size={14} className="shrink-0" />
                  <span>Votre précieux soutien a été enregistré ! Redirection sur BuyMeACoffee sécurisée...</span>
                </motion.div>
              )}
            </AnimatePresence>

          </div>

          {/* Social Contributions Feed Column */}
          <div className="md:col-span-5 space-y-4">
            <h4 className="font-display text-sm font-black uppercase text-text-on flex items-center gap-2 mb-2">
              <Heart size={14} className="text-[#ffdd00] fill-[#ffdd00]/20" /> Nomades solidaires
            </h4>

            <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
              {contributions.map((c) => (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={c.id}
                  className="bg-[#1c1b1b] border border-white/5 rounded-xl p-4 text-left relative"
                >
                  <div className="flex justify-between items-start gap-2 mb-2">
                    <div>
                      <span className="font-mono text-[11px] text-text-on font-bold block">{c.name}</span>
                      <span className="font-mono text-[8px] text-[#8d7a68] uppercase block mt-0.5">{c.date}</span>
                    </div>
                    <span className="bg-[#ffdd00]/10 border border-[#ffdd00]/20 text-[#ffdd00] font-mono text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0">
                      <span>{c.cups}</span> ☕
                    </span>
                  </div>

                  {c.message && (
                    <p className="text-xs text-[#cacaca] font-light italic leading-relaxed border-t border-white/5 pt-2 mt-2">
                      "{c.message}"
                    </p>
                  )}
                </motion.div>
              ))}
            </div>

            <div className="p-4 rounded-xl bg-orange-950/10 border border-orange-500/10 text-left">
              <span className="text-[9px] font-mono uppercase text-brand-sand font-bold block mb-1">🔥 Pourquoi un soutien ?</span>
              <p className="text-[10px] text-text-dim text-opacity-70 leading-relaxed font-light">
                Le voyage se fait sans sponsor majeur ni véhicule d'assistance. Tout l'équipement, l'alimentation et la maintenance mécanique proviennent des fonds personnels de Rémi et des coups de pouce de la communauté. Merci pour votre geste !
              </p>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
