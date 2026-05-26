import { Compass, Map, Globe, Info, Navigation, ArrowRight, ShieldCheck, Milestone } from "lucide-react";
import { useState } from "react";
import { TripSummary } from "../types";

interface MapViewProps {
  onNavigate: (tab: string, arg?: string) => void;
  trips: TripSummary[];
}

export default function MapView({ onNavigate, trips }: MapViewProps) {
  const [mapStyle, setMapStyle] = useState<"topographic" | "grid">("topographic");
  const [activeTrip, setActiveTrip] = useState<TripSummary | null>(trips[trips.length - 1] || null);

  // Convert lat/lng to approximate SVG percentage positions (Europe → Pamir range)
  // Lon: -10 to 80 → 0-100%, Lat: 70 to 30 → 0-100%
  const toSvgPos = (lat: number, lng: number) => ({
    x: ((lng + 10) / 90) * 100,
    y: ((70 - lat) / 40) * 100,
  });

  const tripsWithCoords = trips.filter(t => t.mapLat !== undefined && t.mapLng !== undefined);

  return (
    <div className="w-full min-h-screen pt-24 pb-20 px-4 md:px-14 flex flex-col items-center bg-bg-dark text-text-on">
      <div className="max-w-6xl w-full text-left">

        {/* Header */}
        <div className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
          <div>
            <p className="font-mono text-[10px] text-brand-sand font-bold tracking-widest uppercase">
              Localisation & Itinéraire
            </p>
            <h1 className="font-display text-3xl md:text-5xl font-black uppercase mt-1 text-text-on">
              Carte de Suivi
            </h1>
            <p className="text-xs text-text-dim text-opacity-80 mt-2 font-light">
              Tracé GPS mis à jour à chaque étape. Cliquez sur un point pour explorer la halte.
            </p>
          </div>
          <div className="bg-[#1c1b1b] border border-white/5 p-1 rounded-md flex gap-2 self-start md:self-auto font-mono text-[9px] uppercase font-bold tracking-wider">
            <button
              onClick={() => setMapStyle("topographic")}
              className={`px-3 py-1.5 rounded cursor-pointer transition-all flex items-center gap-1 ${
                mapStyle === "topographic" ? "bg-brand-sand text-bg-dark font-extrabold" : "text-text-dim hover:text-white"
              }`}
            >
              <Map size={11} /> Topo
            </button>
            <button
              onClick={() => setMapStyle("grid")}
              className={`px-3 py-1.5 rounded cursor-pointer transition-all flex items-center gap-1 ${
                mapStyle === "grid" ? "bg-brand-sand text-bg-dark font-extrabold" : "text-text-dim hover:text-white"
              }`}
            >
              <Globe size={11} /> Grille
            </button>
          </div>
        </div>

        {/* Map + sidebar grid */}
        <div className="grid lg:grid-cols-12 gap-8 items-stretch">

          {/* Map */}
          <div className="lg:col-span-8 bg-[#1c1b1b] border border-white/5 rounded-lg p-6 relative min-h-[440px] overflow-hidden">

            {/* Background texture */}
            <div className="absolute inset-0 z-0 opacity-40 select-none">
              {mapStyle === "topographic" ? (
                <svg className="w-full h-full text-text-on/[0.04]" xmlns="http://www.w3.org/2000/svg">
                  <path d="M 50,-50 C 150,-50 300,100 200,300 C 100,500 50,450 150,600" fill="none" stroke="currentColor" strokeWidth="1" />
                  <path d="M 120,-20 C 220,50 310,180 230,350 C 150,520 80,420 190,580" fill="none" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M 0,200 Q 200,150 400,350 T 800,400" fill="none" stroke="currentColor" strokeWidth="0.8" />
                  <path d="M 200,50 Q 400,100 500,280 T 900,150" fill="none" stroke="currentColor" strokeWidth="0.5" />
                </svg>
              ) : (
                <div
                  className="w-full h-full"
                  style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)", backgroundSize: "40px 40px" }}
                />
              )}
            </div>

            {/* Watermark */}
            <div className="absolute bottom-4 left-4 z-10 font-mono text-[8px] text-text-dim text-opacity-35 select-none flex flex-col gap-0.5">
              <span>GPS SYNC: OK</span>
              <span>PROJECTION: MERCATOR</span>
            </div>

            {/* SVG route + pins */}
            <div className="relative z-10 w-full h-[320px] md:h-[400px]">
              <svg className="absolute inset-0 w-full h-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
                {tripsWithCoords.length > 1 && (
                  <path
                    d={tripsWithCoords.map((t, i) => {
                      const pos = toSvgPos(t.mapLat!, t.mapLng!);
                      return `${i === 0 ? "M" : "L"} ${pos.x},${pos.y}`;
                    }).join(" ")}
                    fill="none"
                    stroke="#8d7a68"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="opacity-90"
                  />
                )}
              </svg>

              {tripsWithCoords.map(trip => {
                const pos = toSvgPos(trip.mapLat!, trip.mapLng!);
                const isActive = activeTrip?.slug === trip.slug;
                return (
                  <div
                    key={trip.slug}
                    className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer z-20 group"
                    style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                    onClick={() => setActiveTrip(trip)}
                  >
                    <div className={`w-6 h-6 rounded-full border bg-bg-dark flex items-center justify-center transition-all ${
                      isActive
                        ? "border-brand-sand scale-125 shadow-[0_0_12px_rgba(210,180,140,0.5)]"
                        : "border-brand-sand/40 hover:border-white"
                    }`}>
                      <div className={`w-2.5 h-2.5 rounded-full transition-colors ${isActive ? "bg-brand-sand" : "bg-brand-sand/60 group-hover:bg-white"}`} />
                    </div>
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-[#1c1b1b] border border-white/10 rounded px-2 py-1 font-mono text-[8px] text-brand-sand whitespace-nowrap z-30 pointer-events-none">
                      {trip.title}
                    </div>
                  </div>
                );
              })}

              {tripsWithCoords.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <p className="font-mono text-[10px] text-text-dim text-opacity-40 uppercase tracking-wider">
                    Aucune étape géolocalisée pour l'instant
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-4 flex flex-col justify-between bg-[#1c1b1b] border border-white/5 rounded-lg p-6 text-left">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Navigation size={15} className="text-brand-sand marker-pulse" />
                <span className="font-mono text-[10px] uppercase font-bold tracking-widest text-brand-sand">Point d'étape</span>
              </div>

              {activeTrip ? (
                <div>
                  <div className="relative aspect-video rounded overflow-hidden mb-5">
                    <img
                      src={activeTrip.thumbnail}
                      alt={activeTrip.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover filter brightness-90"
                    />
                  </div>
                  <span className="font-mono text-[9px] text-brand-sand uppercase tracking-widest font-bold block mb-1">
                    {activeTrip.country} · {activeTrip.date}
                  </span>
                  <h3 className="font-display text-xl font-bold uppercase text-text-on">{activeTrip.title}</h3>
                  <p className="mt-3 text-xs text-text-dim text-opacity-80 leading-relaxed font-light">{activeTrip.shortDescription}</p>
                  <div className="mt-6 pt-5 border-t border-white/5 grid grid-cols-2 gap-4 font-mono text-xs">
                    <div>
                      <span className="text-text-dim text-opacity-40 text-[9px] uppercase font-semibold block">Distance</span>
                      <span className="text-brand-sand font-bold mt-1 text-sm block">
                        {activeTrip.distanceKm > 0 ? `${activeTrip.distanceKm} km` : "—"}
                      </span>
                    </div>
                    <div>
                      <span className="text-text-dim text-opacity-40 text-[9px] uppercase font-semibold block">Dénivelé</span>
                      <span className="text-text-on font-semibold mt-1 text-sm block">
                        {activeTrip.elevationGain > 0 ? `+${activeTrip.elevationGain} m` : "—"}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-64 flex flex-col items-center justify-center text-center text-xs text-text-dim text-opacity-40">
                  <Info size={24} className="mb-2 opacity-50" />
                  Cliquez sur un point de la carte
                </div>
              )}
            </div>

            {activeTrip && (
              <div className="mt-8 pt-5 border-t border-white/5">
                <button
                  onClick={() => onNavigate("stage", activeTrip.slug)}
                  className="w-full bg-brand-sand text-bg-dark font-display text-[10px] font-bold uppercase tracking-widest py-3 rounded hover:bg-opacity-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  Explorer cette étape <ArrowRight size={11} />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Info strip */}
        <div className="mt-12 bg-[#1b1a1a]/55 border border-white/5 rounded-lg p-6 md:p-8 grid md:grid-cols-3 gap-6 text-left">
          <div className="flex items-start gap-3">
            <ShieldCheck size={20} className="text-brand-sand shrink-0 mt-0.5" />
            <div>
              <h4 className="font-display font-bold text-xs uppercase text-text-on">Tracé GPX authentifié</h4>
              <p className="text-[11px] text-text-dim text-opacity-70 leading-relaxed font-light mt-1">
                Chaque route est issue du fichier GPX enregistré sur le terrain, précis à ±5 mètres.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Milestone size={20} className="text-brand-sand shrink-0 mt-0.5" />
            <div>
              <h4 className="font-display font-bold text-xs uppercase text-text-on">Mise à jour automatique</h4>
              <p className="text-[11px] text-text-dim text-opacity-70 leading-relaxed font-light mt-1">
                Un dossier déposé sur Drive déclenche la synchronisation et ajoute le point automatiquement.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Compass size={20} className="text-brand-sand shrink-0 mt-0.5" />
            <div>
              <h4 className="font-display font-bold text-xs uppercase text-text-on">Couverture mondiale</h4>
              <p className="text-[11px] text-text-dim text-opacity-70 leading-relaxed font-light mt-1">
                De l'Atlantique au Pamir — toute la trajectoire plein Est est cartographiée ici.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
