import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { TripSummary } from "../types";

declare global {
  interface Window { L: any; }
}

interface RegionMapProps {
  region: string;
  trips: TripSummary[];   // toutes les étapes (on filtre celles de la région)
  onClose: () => void;
  t: (key: string) => string;
}

// Charge Leaflet (CSS + JS) une seule fois
function loadLeaflet(): Promise<void> {
  return new Promise((resolve) => {
    if (window.L) { resolve(); return; }
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(css);
    const js = document.createElement("script");
    js.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    js.onload = () => resolve();
    document.head.appendChild(js);
  });
}

export default function RegionMap({ region, trips, onClose, t }: RegionMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);

  // Étapes de cette région ayant un tracé
  const regionTrips = trips.filter(tr => tr.region === region);

  useEffect(() => {
    let cancelled = false;
    loadLeaflet().then(() => {
      if (cancelled || !mapRef.current || mapInstance.current) return;
      const L = window.L;
      const map = L.map(mapRef.current, { zoomControl: true, attributionControl: false });
      mapInstance.current = map;

      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
        maxZoom: 19,
      }).addTo(map);

      // Trace chaque tronçon de la région
      const allLatLngs: [number, number][] = [];
      for (const tr of regionTrips) {
        const segs = (tr.segments && tr.segments.length > 0) ? tr.segments : (tr.track ? [tr.track] : []);
        for (const seg of segs) {
          if (!seg || seg.length < 2) continue;
          const latlngs = seg.map((p: any) => {
            const ll: [number, number] = [p[0] ?? p.lat, p[1] ?? p.lng ?? p.lon];
            allLatLngs.push(ll);
            return ll;
          });
          L.polyline(latlngs, { color: "#E8620A", weight: 4, opacity: 0.9 }).addTo(map);
        }
        // Marqueur d'arrivée
        if (tr.mapLat != null && tr.mapLng != null) {
          L.circleMarker([tr.mapLat, tr.mapLng], {
            radius: 5, color: "#fff", weight: 2, fillColor: "#2A6B73", fillOpacity: 1,
          }).addTo(map).bindPopup(tr.endCity || tr.title);
        }
      }

      if (allLatLngs.length > 0) {
        map.fitBounds(L.latLngBounds(allLatLngs).pad(0.15));
      } else {
        map.setView([46.6, 2.5], 6); // fallback France
      }
      setTimeout(() => map.invalidateSize(), 200);
    });

    return () => {
      cancelled = true;
      if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; }
    };
  }, [region]);

  return (
    <div className="mb-8 bg-[#1c1b1b] rounded-2xl border border-white/10 overflow-hidden animate-[slideDown_0.25s_ease-out]">
      <style>{`@keyframes slideDown { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
        <div className="min-w-0">
          <div className="font-display font-bold text-sm text-white uppercase tracking-wider truncate">{region}</div>
          <div className="font-mono text-[9px] text-text-dim">
            {regionTrips.length} {regionTrips.length > 1 ? t("journey.stages") : t("journey.stage")}
          </div>
        </div>
        <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center text-white cursor-pointer shrink-0">
          <X size={16} />
        </button>
      </div>
      <div ref={mapRef} className="w-full h-[340px] bg-[#0f0f0f]" />
    </div>
  );
}
