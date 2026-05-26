import { Mail, Compass, ShieldCheck, Cpu, Send, CheckCircle2 } from "lucide-react";
import React, { useState } from "react";
const RIDER_INFO = {
  name: "Rémi",
  age: "32 ans",
  formerJob: "Architecte Cloud & Intégration",
  bioIntro: "Je suis un ancien ingénieur cloud de 32 ans qui a échangé la complexité des plateformes distribuées contre la simplicité dépouillée d'un voyage au long cours sur deux roues.",
  portraitSrc: "https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&q=80&w=800",
  forestSrc: "https://images.unsplash.com/photo-1501555088652-021faa106b9b?auto=format&fit=crop&q=80&w=1200",
};

export default function AboutView() {
  const [formData, setFormData] = useState({ name: "", email: "", object: "", message: "" });
  const [sentSuccess, setSentSuccess] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSentSuccess(true);
    setFormData({ name: "", email: "", object: "", message: "" });
    setTimeout(() => setSentSuccess(false), 5000);
  };

  return (
    <div className="w-full min-h-screen pt-24 pb-20 px-4 md:px-14 flex flex-col items-center bg-bg-dark text-text-on text-left">
      <div className="max-w-5xl w-full">
        
        {/* Upper Title */}
        <div className="mb-12">
          <p className="font-mono text-[10px] text-brand-sand font-bold tracking-widest uppercase">
            Derrière le Guidon
          </p>
          <h1 className="font-display text-3xl md:text-5xl font-black uppercase mt-1 text-text-on">
            Qui est Rémi ?
          </h1>
        </div>

        {/* Hero split layout with portrait & bio */}
        <div className="grid lg:grid-cols-12 gap-8 lg:gap-12 items-start mb-16">
          
          {/* Portrait Left Column */}
          <div className="lg:col-span-4 flex flex-col gap-6">
            <div className="relative aspect-[3/4] bg-[#1c1b1b] border border-white/5 rounded-lg overflow-hidden group">
              <img 
                src={RIDER_INFO.portraitSrc} 
                alt="Portrait de Rémi, cyclovoyageur d'aventure" 
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover select-none filter brightness-95 transform transition-transform duration-500 hover:scale-[1.03]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#141313] via-transparent to-transparent opacity-60 pointer-events-none" />
              
              {/* Overlay with current location */}
              <div className="absolute bottom-4 left-4 z-10 font-mono text-[9px] text-[#d2b48c] tracking-widest uppercase font-bold">
                Rémi // En selle
              </div>
            </div>

            {/* Quick stats on the rider */}
            <div className="bg-[#1c1b1b] border border-white/5 rounded-lg p-5 flex flex-col gap-3.5 text-xs">
              <div className="flex justify-between border-b border-white/5 pb-2">
                <span className="text-text-dim text-opacity-40 font-mono">Âge</span>
                <span className="font-display font-bold">{RIDER_INFO.name}, {RIDER_INFO.age}</span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-2">
                <span className="text-text-dim text-opacity-40 font-mono">Ancien Métier</span>
                <span className="font-display font-medium text-right text-[11px] max-w-[160px] leading-tight text-white">{RIDER_INFO.formerJob}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-dim text-opacity-40 font-mono">Équipement fétiche</span>
                <span className="font-display font-bold text-brand-sand">Bicloo Gravel 650b</span>
              </div>
            </div>
          </div>

          {/* Bio Text Right Column */}
          <div className="lg:col-span-8 flex flex-col gap-6 text-sm md:text-base text-text-dim leading-relaxed font-light">
            <h2 className="font-display text-xl md:text-2xl font-black uppercase text-text-on">
              Du Cloud Computing aux pistes poussiéreuses d'Asie
            </h2>

            <p className="border-l-2 border-[#d2b48c]/30 pl-5 text-[14px] md:text-base italic text-brand-sand/90">
              "{RIDER_INFO.bioIntro}"
            </p>

            <p>
              {RIDER_INFO.bioSecond}
            </p>

            {/* Gorgeous wide banner representing bicycle resting in natural scenery */}
            <div className="my-4 relative aspect-[21/9] rounded-lg overflow-hidden border border-white/5 bg-[#1c1b1b]">
              <img 
                src={RIDER_INFO.forestSrc} 
                alt="Vélo de trail chargé reposant contre les troncs d'arbres au bord du l'eau" 
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover select-none filter brightness-90 saturate-[0.85]"
              />
              <div className="absolute inset-0 bg-black/25 hero-vignette pointer-events-none" />
            </div>

            <h3 className="font-display text-lg font-black uppercase text-text-on mt-4">
              La double mission de ce carnet numérique
            </h3>

            <p>
              {RIDER_INFO.missionText}
            </p>

            <div className="mt-4 flex flex-col sm:flex-row gap-4">
              <div className="bg-[#1c1b1b] border border-white/5 p-4 rounded-lg flex gap-3 items-start flex-1">
                <Cpu size={18} className="text-brand-sand shrink-0 mt-0.5" />
                <div className="text-xs">
                  <h4 className="font-display font-bold text-text-on uppercase">Analogies d'architecture</h4>
                  <p className="text-text-dim text-opacity-70 mt-1 font-light leading-relaxed">
                    Un long voyage à vélo partage beaucoup d'aspects avec une architecture de services : chaque coup de pédale est un thread atomique synchrone, l'eau est votre bande passante, et le froid de la nuit teste votre tolérance aux pannes.
                  </p>
                </div>
              </div>

              <div className="bg-[#1c1b1b] border border-white/5 p-4 rounded-lg flex gap-3 items-start flex-1">
                <ShieldCheck size={18} className="text-brand-sand shrink-0 mt-0.5" />
                <div className="text-xs">
                  <h4 className="font-display font-bold text-text-on uppercase">Esprit Zéro Déchet</h4>
                  <p className="text-text-dim text-opacity-70 mt-1 font-light leading-relaxed">
                    Pédaler en autonomie complète nécessite un minimalisme absolu : n'emporter que le strict essentiel, réparer plutôt que jeter, et ne laisser derrière soi qu'une simple ligne de pneus sur la poussière.
                  </p>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Contact form footer */}
        <div className="bg-[#1c1b1b] border border-white/5 rounded-lg p-6 md:p-10 text-left max-w-3xl mx-auto">
          <div className="flex items-center gap-2 text-brand-sand mb-3">
            <Mail size={16} />
            <span className="font-mono text-[9px] font-bold uppercase tracking-widest">Contacter l'aventurier</span>
          </div>
          <h3 className="font-display text-xl md:text-2xl font-black uppercase text-text-on">
            Laisser un message à Rémi
          </h3>
          <p className="text-xs text-text-dim text-opacity-80 mt-2 max-w-xl font-light leading-relaxed">
            Votre message lui sera directement transmis dans sa boîte de réception nomade pour lui donner le sourire en chemin.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4 text-xs font-sans">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-text-dim text-opacity-60 font-mono text-[9px] uppercase tracking-wider mb-1.5">Votre Nom</label>
                <input 
                  type="text" 
                  required
                  placeholder="Ex: Clara"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-bg-dark border border-white/10 rounded px-4 py-3 text-text-on focus:outline-none focus:border-brand-sand"
                />
              </div>
              <div>
                <label className="block text-text-dim text-opacity-60 font-mono text-[9px] uppercase tracking-wider mb-1.5">Votre Email (pour le retour)</label>
                <input 
                  type="email" 
                  required
                  placeholder="nom@exemple.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full bg-bg-dark border border-white/10 rounded px-4 py-3 text-text-on focus:outline-none focus:border-brand-sand"
                />
              </div>
            </div>

            <div>
              <label className="block text-text-dim text-opacity-60 font-mono text-[9px] uppercase tracking-wider mb-1.5">Objet de votre demande</label>
              <input 
                type="text" 
                required
                placeholder="Ex: Question sur la transmission de ton vélo"
                value={formData.object}
                onChange={(e) => setFormData({ ...formData, object: e.target.value })}
                className="w-full bg-bg-dark border border-white/10 rounded px-4 py-3 text-text-on focus:outline-none focus:border-brand-sand"
              />
            </div>

            <div>
              <label className="block text-text-dim text-opacity-60 font-mono text-[9px] uppercase tracking-wider mb-1.5">Message</label>
              <textarea 
                rows={4}
                required
                placeholder="Écrivez votre message..."
                value={formData.message}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                className="w-full bg-bg-dark border border-white/10 rounded px-4 py-3 text-text-on focus:outline-none focus:border-brand-sand resize-none"
              />
            </div>

            <button 
              type="submit"
              className="bg-brand-sand text-bg-dark text-[10px] font-display font-bold uppercase tracking-widest py-3.5 px-6 rounded hover:bg-opacity-95 transition-all self-start cursor-pointer flex items-center gap-2 font-extrabold"
            >
              <Send size={11} /> Envoyer le message de soutien
            </button>

            {sentSuccess && (
              <div className="bg-brand-green/20 text-brand-sand border border-brand-sand/30 p-4 rounded text-xs flex items-center gap-3 font-medium leading-relaxed">
                <CheckCircle2 size={16} className="shrink-0 text-brand-sand" />
                <span>
                  <strong>Message simulé envoyé !</strong> Votre pli numérique a bien été enregistré. Merci infiniment de nous suivre.
                </span>
              </div>
            )}
          </form>
        </div>

      </div>
    </div>
  );
}
