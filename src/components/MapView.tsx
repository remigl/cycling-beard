import { Compass, ShieldCheck, Milestone, Navigation, ArrowRight, Info } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { TripSummary } from "../types";

interface MapViewProps {
  onNavigate: (tab: string, arg?: string) => void;
  trips: TripSummary[];
  t: (key: string) => string;
}

// Charge Leaflet dynamiquement (CSS + JS) depuis le CDN
function useLeaflet() {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if ((window as any).L) { setLoaded(true); return; }

    // CSS
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(css);

    // JS
    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = () => setLoaded(true);
    document.body.appendChild(script);
  }, []);
  return loaded;
}

export default function MapView({ onNavigate, trips, t }: MapViewProps) {
  const leafletLoaded = useLeaflet();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const [activeTrip, setActiveTrip] = useState<TripSummary | null>(
    trips.length > 0 ? trips[trips.length - 1] : null
  );

  const tripsWithTrack = trips.filter(t => t.track && t.track.length > 0);
  const tripsWithCoords = trips.filter(t => t.mapLat != null && t.mapLng != null);

  useEffect(() => {
    if (!leafletLoaded || !mapContainerRef.current) return;
    const L = (window as any).L;

    // Init map once
    if (!mapRef.current) {
      mapRef.current = L.map(mapContainerRef.current, {
        zoomControl: true,
        scrollWheelZoom: true,
      }).setView([47.0, 2.0], 6);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '© OpenStreetMap',
        maxZoom: 19,
      }).addTo(mapRef.current);
    }

    const map = mapRef.current;

    // Clear previous layers (except tiles)
    map.eachLayer((layer: any) => {
      if (layer.options && layer.options.attribution) return; // garde les tuiles
      map.removeLayer(layer);
    });

    const allBounds: any[] = [];

    // Trace chaque tracé GPX
    tripsWithTrack.forEach(trip => {
      const polyline = L.polyline(trip.track, {
        color: "#E8620A",
        weight: 4,
        opacity: 0.85,
      }).addTo(map);
      allBounds.push(...trip.track);
    });

    // Marqueurs aux étapes
    tripsWithCoords.forEach(trip => {
      const marker = L.circleMarker([trip.mapLat, trip.mapLng], {
        radius: 7,
        fillColor: "#2A6B73",
        color: "#fff",
        weight: 2,
        fillOpacity: 1,
      }).addTo(map);

      marker.bindPopup(`<strong>${trip.title}</strong><br>${trip.date} · ${trip.distanceKm} km`);
      marker.on("click", () => setActiveTrip(trip));
      allBounds.push([trip.mapLat, trip.mapLng]);
    });

    // Ajuste la vue pour tout afficher
    if (allBounds.length > 0) {
      map.fitBounds(allBounds, { padding: [40, 40], maxZoom: 12 });
    }

    // Fix display bug
    setTimeout(() => map.invalidateSize(), 200);
  }, [leafletLoaded, trips]);

  return (
    <div className="w-full min-h-screen pt-24 pb-20 px-4 md:px-14 flex flex-col items-center bg-bg-dark text-text-on">
      <div className="max-w-6xl w-full text-left">

        {/* Header */}
        <div className="mb-8">
          <p className="font-mono text-[10px] text-brand-sand font-bold tracking-widest uppercase">
            {t("map.label")}
          </p>
          <h1 className="font-display text-3xl md:text-5xl font-black uppercase mt-1 text-text-on">
            {t("map.title")}
          </h1>
          <p className="text-xs text-text-dim text-opacity-80 mt-2 font-light">
            {t("map.intro")}
          </p>
        </div>

        <div className="grid lg:grid-cols-12 gap-8 items-stretch">

          {/* Vraie carte Leaflet */}
          <div className="lg:col-span-8 bg-[#1c1b1b] border border-white/5 rounded-lg overflow-hidden relative min-h-[440px]">
            {!leafletLoaded && (
              <div className="absolute inset-0 flex items-center justify-center z-10 bg-[#1c1b1b]">
                <span className="font-mono text-[10px] text-brand-sand uppercase tracking-widest animate-pulse">
                  {t("map.loading")}
                </span>
              </div>
            )}
            <div
              ref={mapContainerRef}
              className="w-full h-[440px] md:h-[520px]"
              style={{ background: "#1c1b1b" }}
            />
            {tripsWithTrack.length === 0 && tripsWithCoords.length === 0 && leafletLoaded && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[500]">
                <p className="font-mono text-[10px] text-text-dim bg-bg-dark/80 px-4 py-2 rounded uppercase tracking-wider">
                  {t("map.no_track")}
                </p>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-4 flex flex-col justify-between bg-[#1c1b1b] border border-white/5 rounded-lg p-6 text-left">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Navigation size={15} className="text-brand-sand" />
                <span className="font-mono text-[10px] uppercase font-bold tracking-widest text-brand-sand">{t("map.point")}</span>
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
                  {t("map.click_point")}
                </div>
              )}
            </div>

            {activeTrip && (
              <div className="mt-8 pt-5 border-t border-white/5">
                <button
                  onClick={() => onNavigate("stage", activeTrip.slug)}
                  className="w-full bg-brand-sand text-bg-dark font-display text-[10px] font-bold uppercase tracking-widest py-3 rounded hover:bg-opacity-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {t("map.explore")} <ArrowRight size={11} />
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
              <h4 className="font-display font-bold text-xs uppercase text-text-on">Tracé GPX réel</h4>
              <p className="text-[11px] text-text-dim text-opacity-70 leading-relaxed font-light mt-1">
                Chaque route provient du fichier GPX enregistré sur le terrain.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Milestone size={20} className="text-brand-sand shrink-0 mt-0.5" />
            <div>
              <h4 className="font-display font-bold text-xs uppercase text-text-on">Mise à jour auto</h4>
              <p className="text-[11px] text-text-dim text-opacity-70 leading-relaxed font-light mt-1">
                Un dossier déposé sur Drive ajoute le tracé automatiquement.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Compass size={20} className="text-brand-sand shrink-0 mt-0.5" />
            <div>
              <h4 className="font-display font-bold text-xs uppercase text-text-on">OpenStreetMap</h4>
              <p className="text-[11px] text-text-dim text-opacity-70 leading-relaxed font-light mt-1">
                Cartographie libre et gratuite, sans clé API ni limite.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
