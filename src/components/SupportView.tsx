import { Coffee, Heart, ExternalLink } from "lucide-react";

// ─── Configure ton URL Buy Me a Coffee ici ───────────────────────────────────
// Une fois ton compte créé sur buymeacoffee.com, remplace l'URL ci-dessous
const BMC_URL = "https://buymeacoffee.com/cyclingBeard";
const BMC_CONFIGURED = true; // Passe à true quand tu as créé ton compte
// ─────────────────────────────────────────────────────────────────────────────

export default function SupportView() {
  return (
    <div className="w-full min-h-screen pt-20 pb-20 px-4 md:px-14 flex flex-col items-center bg-bg-dark text-text-on">
      <div className="max-w-3xl w-full text-left">

        {/* Header */}
        <div className="mb-10">
          <p className="font-mono text-[10px] text-brand-sand font-bold tracking-widest uppercase mb-2">
            Soutien & Solidarité
          </p>
          <h1 className="font-display text-3xl md:text-5xl font-black uppercase text-text-on">
            Me Soutenir
          </h1>
          <p className="text-xs md:text-sm text-text-dim text-opacity-85 mt-3 max-w-2xl font-light leading-relaxed">
            Le voyage se fait sans sponsor ni véhicule d'assistance. Chaque coup de pouce contribue directement aux frais de route — chambre à air, pneu, repas, bivouac. Merci.
          </p>
        </div>

        {/* Buy Me a Coffee block */}
        <div className="bg-[#1c1b1b] border border-brand-sand/20 rounded-2xl p-8 md:p-10 mb-8">
          <div className="flex items-center gap-4 mb-6">
            <div className="p-3 bg-brand-sand/10 rounded-xl border border-brand-sand/20">
              <Coffee size={28} className="text-brand-sand" />
            </div>
            <div>
              <p className="font-mono text-[9px] uppercase tracking-widest text-brand-sand font-bold mb-0.5">Soutien direct</p>
              <h2 className="font-display text-xl font-black uppercase text-text-on">Buy Me a Coffee</h2>
            </div>
          </div>

          <p className="text-sm text-text-dim text-opacity-80 leading-relaxed font-light mb-8">
            Offre un café à Rémi via Buy Me a Coffee — la plateforme sécurisée de soutien aux créateurs. 1 café = 5€, directement versé sur le compte du voyage.
          </p>

          {BMC_CONFIGURED ? (
            <a
              href={BMC_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-brand-sand text-bg-dark font-display text-sm font-black uppercase tracking-widest px-8 py-4 rounded-xl hover:bg-opacity-90 transition-all cursor-pointer"
            >
              <Coffee size={16} /> Offrir un café
              <ExternalLink size={14} />
            </a>
          ) : (
            <div className="bg-bg-dark border border-white/10 rounded-xl p-6 text-center">
              <p className="font-mono text-[10px] uppercase tracking-wider text-brand-sand font-bold mb-2">
                Bientôt disponible
              </p>
              <p className="text-xs text-text-dim text-opacity-60 font-light">
                Le compte Buy Me a Coffee est en cours de configuration. Revenez bientôt !
              </p>
            </div>
          )}
        </div>

        {/* Pourquoi soutenir */}
        <div className="bg-[#1c1b1b] border border-white/5 rounded-2xl p-8">
          <div className="flex items-center gap-2 mb-4">
            <Heart size={16} className="text-brand-sand" />
            <h3 className="font-display font-bold text-sm uppercase text-text-on tracking-wider">Pourquoi soutenir ?</h3>
          </div>
          <div className="grid md:grid-cols-3 gap-6 text-xs text-text-dim text-opacity-75 font-light leading-relaxed">
            <div>
              <p className="font-mono text-[9px] text-brand-sand uppercase font-bold mb-2">Matériel</p>
              <p>Pneus, chambres à air, câbles de frein — tout s'use. Les 15 000 km prévus usent l'équipement vite.</p>
            </div>
            <div>
              <p className="font-mono text-[9px] text-brand-sand uppercase font-bold mb-2">Logistique</p>
              <p>Visas, nuits d'urgence en hostel, réparations imprévues. Chaque café couvre un imprévu.</p>
            </div>
            <div>
              <p className="font-mono text-[9px] text-brand-sand uppercase font-bold mb-2">Le blog</p>
              <p>Hébergement, domaine, outils de création. Le site reste gratuit et sans pub grâce à ton soutien.</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
