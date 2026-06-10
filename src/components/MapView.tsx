import { X } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { TripSummary } from "../types";
import { Lang } from "../i18n";
import StageDetailView from "./StageDetailView";

interface MapViewProps {
  onNavigate: (tab: string, arg?: string) => void;
  trips: TripSummary[];
  t: (key: string) => string;
  lang: Lang;
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

export default function MapView({ onNavigate, trips, t, lang }: MapViewProps) {
  const leafletLoaded = useLeaflet();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  // Étape sélectionnée à afficher en popup plein écran par-dessus la carte
  const [popupTrip, setPopupTrip] = useState<TripSummary | null>(null);
  // Référence pour que les popups Leaflet (HTML brut) puissent déclencher React
  const setPopupTripRef = useRef(setPopupTrip);
  setPopupTripRef.current = setPopupTrip;

  const tripsWithTrack = trips.filter(t =>
    (t.track && t.track.length > 0) || (t.segments && t.segments.length > 0)
  );
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

      // Délégation : clic sur le bouton "Voir l'étape" dans une bulle Leaflet
      mapRef.current.getContainer().addEventListener("click", (e: any) => {
        const btn = e.target.closest("[data-stage-slug]");
        if (btn) {
          const slug = btn.getAttribute("data-stage-slug");
          const trip = trips.find(tr => tr.slug === slug);
          if (trip) setPopupTripRef.current(trip);
        }
      });
    }

    const map = mapRef.current;

    // Clear previous layers (except tiles)
    map.eachLayer((layer: any) => {
      if (layer.options && layer.options.attribution) return; // garde les tuiles
      map.removeLayer(layer);
    });

    const allBounds: any[] = [];

    // Construit le HTML d'une bulle avec bouton "Voir l'étape"
    const popupHtml = (trip: TripSummary) => `
      <div style="min-width:160px;text-align:center;">
        <strong style="font-size:13px;">${trip.title}</strong><br>
        <span style="font-size:11px;color:#666;">${trip.date}${trip.distanceKm > 0 ? ` · ${trip.distanceKm} km` : ""}</span><br>
        <button data-stage-slug="${trip.slug}"
          style="margin-top:8px;background:#8D7A68;color:#fff;border:none;border-radius:4px;padding:6px 12px;font-size:10px;font-weight:bold;text-transform:uppercase;letter-spacing:.05em;cursor:pointer;font-family:monospace;">
          ${t("map.see_stage")}
        </button>
      </div>`;

    // Trace chaque étape — chaque segment GPX séparément, CLIQUABLE
    tripsWithTrack.forEach(trip => {
      const segments = (trip.segments && trip.segments.length > 0)
        ? trip.segments
        : (trip.track ? [trip.track] : []);
      segments.forEach(seg => {
        if (seg.length < 2) return;
        // Ligne visible (orange)
        L.polyline(seg, {
          color: "#E8620A",
          weight: 5,
          opacity: 0.85,
        }).addTo(map);
        // Ligne invisible épaisse PAR-DESSUS : agrandit la zone cliquable
        const hit = L.polyline(seg, {
          color: "#000",
          weight: 22,
          opacity: 0,
        }).addTo(map);
        hit.bindPopup(popupHtml(trip));
        allBounds.push(...seg);
      });
    });

    // Marqueurs aux étapes — différencier départ / actuel / intermédiaire
    // trips est en ordre chronologique : [0] = départ, dernier = position actuelle
    const lastIdx = tripsWithCoords.length - 1;

    // Point de départ réel = début du tout premier tracé
    const firstTrip = tripsWithCoords[0];
    let departurePoint = firstTrip ? [firstTrip.mapLat, firstTrip.mapLng] : null;
    if (firstTrip) {
      const segs = (firstTrip.segments && firstTrip.segments.length > 0)
        ? firstTrip.segments : (firstTrip.track ? [firstTrip.track] : []);
      if (segs.length > 0 && segs[0].length > 0) {
        departurePoint = segs[0][0]; // tout premier point GPS
      }
    }

    // Marqueur de départ : drapeau seul (sans pastille verte)
    if (departurePoint) {
      const startIcon = L.divIcon({
        html: `<div style="font-size:26px;line-height:1;filter:drop-shadow(0 2px 3px rgba(0,0,0,.5));">🚩</div>`,
        className: "",
        iconSize: [26, 26],
        iconAnchor: [6, 24],
      });
      L.marker(departurePoint, { icon: startIcon, zIndexOffset: 500 })
        .addTo(map)
        .bindPopup(popupHtml(firstTrip));
      allBounds.push(departurePoint);
    }

    tripsWithCoords.forEach((trip, idx) => {
      const isCurrent = idx === lastIdx;

      if (isCurrent) {
        // Position actuelle : gros marqueur orange pulsant
        const currentIcon = L.divIcon({
          html: `<div style="position:relative;display:flex;align-items:center;justify-content:center;">
            <div style="position:absolute;width:34px;height:34px;border-radius:50%;background:rgba(232,98,10,.3);animation:bmcpulse 1.8s infinite;"></div>
            <div style="width:18px;height:18px;border-radius:50%;background:#E8620A;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4);"></div>
          </div>`,
          className: "",
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        });
        const m = L.marker([trip.mapLat, trip.mapLng], { icon: currentIcon, zIndexOffset: 1000 }).addTo(map);
        m.bindPopup(popupHtml(trip));
      } else if (idx > 0) {
        // Étapes intermédiaires (le départ idx 0 a déjà son drapeau)
        const marker = L.circleMarker([trip.mapLat, trip.mapLng], {
          radius: 7,
          fillColor: "#2A6B73",
          color: "#fff",
          weight: 2,
          fillOpacity: 1,
        }).addTo(map);
        marker.bindPopup(popupHtml(trip));
      }
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
    <div className="w-full h-screen pt-20 pb-4 px-4 md:px-14 flex flex-col items-center bg-bg-dark text-text-on overflow-hidden">
      <style>{`@keyframes bmcpulse{0%{transform:scale(.6);opacity:.8}70%{transform:scale(1.4);opacity:0}100%{opacity:0}}`}</style>
      <div className="max-w-6xl w-full text-left flex flex-col flex-1 min-h-0">

        {/* Header (compact) */}
        <div className="mb-3 shrink-0">
          <h1 className="font-display text-2xl md:text-4xl font-black uppercase text-text-on">
            {t("map.title")}
          </h1>
          <p className="text-xs text-text-dim text-opacity-80 mt-1 font-light">
            {t("map.intro")}
          </p>

          {/* Légende */}
          <div className="flex items-center gap-5 mt-2 font-mono text-[10px] text-text-dim">
            <span className="flex items-center gap-1.5">
              <span className="text-sm">🚩</span> {t("map.start")}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full" style={{ background: "#2A6B73", border: "2px solid #fff" }} /> {t("map.stage")}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full" style={{ background: "#E8620A", border: "2px solid #fff" }} /> {t("map.current")}
            </span>
          </div>
        </div>

        {/* Carte Leaflet : occupe toute la hauteur restante */}
        <div className="flex-1 min-h-0 bg-[#1c1b1b] border border-white/5 rounded-lg overflow-hidden relative">
          {!leafletLoaded && (
            <div className="absolute inset-0 flex items-center justify-center z-10 bg-[#1c1b1b]">
              <span className="font-mono text-[10px] text-brand-sand uppercase tracking-widest animate-pulse">
                {t("map.loading")}
              </span>
            </div>
          )}
          <div
            ref={mapContainerRef}
            className="w-full h-full"
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

        {/* Popup étape complète par-dessus la carte */}
        {popupTrip && (
          <div
            className="fixed inset-0 z-[9999] bg-black/90 flex items-start justify-center overflow-y-auto"
            onClick={() => setPopupTrip(null)}
          >
            <div
              className="relative w-full max-w-3xl bg-bg-dark min-h-screen md:min-h-0 md:my-6 md:rounded-2xl overflow-hidden border border-white/10"
              onClick={e => e.stopPropagation()}
            >
              {/* Bouton fermer (fixe en haut) */}
              <button
                onClick={() => setPopupTrip(null)}
                className="fixed md:absolute top-4 right-4 z-[10000] w-10 h-10 rounded-full bg-black/60 backdrop-blur hover:bg-black/80 flex items-center justify-center text-white cursor-pointer"
                aria-label="Fermer"
              >
                <X size={20} />
              </button>

              {/* Étape complète : récit, photos, dénivelé, survol 3D, eBird */}
              <StageDetailView
                slug={popupTrip.slug}
                onNavigate={(tab, arg) => { setPopupTrip(null); onNavigate(tab, arg); }}
                lang={lang}
                t={t}
                embedded
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
