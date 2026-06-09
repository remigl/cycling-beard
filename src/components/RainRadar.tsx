import { useEffect, useRef, useState } from "react";
import { X, Play, Pause } from "lucide-react";

interface RainRadarProps {
  lat: number;
  lng: number;
  onClose: () => void;
  t: (key: string) => string;
}

// Charge Leaflet (CSS + JS) une seule fois
function useLeaflet() {
  const [loaded, setLoaded] = useState(!!(window as any).L);
  useEffect(() => {
    if ((window as any).L) { setLoaded(true); return; }
    if (!document.getElementById("leaflet-css")) {
      const css = document.createElement("link");
      css.id = "leaflet-css";
      css.rel = "stylesheet";
      css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(css);
    }
    let script = document.getElementById("leaflet-js") as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement("script");
      script.id = "leaflet-js";
      script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      document.body.appendChild(script);
    }
    const onLoad = () => setLoaded(true);
    script.addEventListener("load", onLoad);
    return () => script?.removeEventListener("load", onLoad);
  }, []);
  return loaded;
}

export default function RainRadar({ lat, lng, onClose, t }: RainRadarProps) {
  const loaded = useLeaflet();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const framesRef = useRef<any[]>([]);
  const layersRef = useRef<Record<string, any>>({});
  const idxRef = useRef(0);
  const timerRef = useRef<any>(null);
  const [playing, setPlaying] = useState(true);
  const [timeLabel, setTimeLabel] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!loaded || !containerRef.current) return;
    const L = (window as any).L;

    const map = L.map(containerRef.current, {
      center: [lat, lng],
      zoom: 9,
      maxZoom: 12,
      minZoom: 5,
      zoomControl: true,
      attributionControl: false,
    });
    mapRef.current = map;

    // Fond de carte sombre (sans labels)
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png", {
      maxZoom: 19,
    }).addTo(map);

    // Marqueur position
    L.circleMarker([lat, lng], {
      radius: 7, fillColor: "#E8620A", color: "#fff", weight: 2, fillOpacity: 1,
    }).addTo(map);

    // Labels (villes, routes) PAR-DESSUS le radar pour rester lisibles
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png", {
      maxZoom: 19, pane: "markerPane",
    }).addTo(map);

    // Récupère les frames radar RainViewer
    fetch("https://api.rainviewer.com/public/weather-maps.json")
      .then(r => r.json())
      .then(data => {
        const host = data.host;
        const nowcast = data.radar?.nowcast || [];
        // Uniquement la prévision : de maintenant à +1h environ
        const frames = nowcast.filter((f: any) => f.time * 1000 >= Date.now() - 5 * 60000);
        framesRef.current = frames.map((f: any) => ({
          ...f,
          // Tuiles 512px (plus net), schéma couleur 4
          url: `${host}${f.path}/512/{z}/{x}/{y}/4/1_1.png`,
        }));
        idxRef.current = 0;
        setReady(true);
        showFrame(0);
        startAnimation();
      })
      .catch(() => setReady(true));

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      try { map.remove(); } catch {}
      mapRef.current = null;
    };
  }, [loaded]);

  const showFrame = (i: number) => {
    const L = (window as any).L;
    const map = mapRef.current;
    const frames = framesRef.current;
    if (!map || frames.length === 0) return;
    const frame = frames[i];

    // Crée la couche si pas encore faite
    if (!layersRef.current[frame.path]) {
      layersRef.current[frame.path] = L.tileLayer(frame.url, {
        opacity: 0,
        tileSize: 512,
        zoomOffset: -1,
        maxNativeZoom: 10,
        maxZoom: 12,
      });
      layersRef.current[frame.path].addTo(map);
    }
    // Masque toutes les couches sauf la courante
    Object.entries(layersRef.current).forEach(([path, layer]: any) => {
      layer.setOpacity(path === frame.path ? 0.75 : 0);
    });

    // Label : tout est de la prévision (maintenant → +1h)
    const d = new Date(frame.time * 1000);
    const hh = d.getHours().toString().padStart(2, "0");
    const mm = d.getMinutes().toString().padStart(2, "0");
    const deltaMin = Math.round((frame.time * 1000 - Date.now()) / 60000);
    const suffix = deltaMin <= 2 ? " (maintenant)" : ` (dans ${deltaMin} min)`;
    setTimeLabel(`${hh}:${mm}${suffix}`);
    idxRef.current = i;
  };

  const startAnimation = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const frames = framesRef.current;
      if (frames.length === 0) return;
      const next = (idxRef.current + 1) % frames.length;
      showFrame(next);
    }, 700);
  };

  const togglePlay = () => {
    if (playing) {
      if (timerRef.current) clearInterval(timerRef.current);
    } else {
      startAnimation();
    }
    setPlaying(p => !p);
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center p-3">
      <div className="relative w-full max-w-2xl bg-[#1c1b1b] rounded-2xl overflow-hidden border border-white/10">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <span className="font-display font-bold text-sm text-white uppercase tracking-wider">{t("radar.title")}</span>
            {timeLabel && <span className="font-mono text-xs text-brand-sand">{timeLabel}</span>}
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center text-white cursor-pointer">
            <X size={18} />
          </button>
        </div>

        {/* Carte radar */}
        <div ref={containerRef} className="w-full h-[420px] bg-[#0d0d0d]" />

        {/* Contrôles + légende */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-white/10">
          <button
            onClick={togglePlay}
            disabled={!ready}
            className="w-9 h-9 rounded-full bg-brand-sand text-bg-dark flex items-center justify-center cursor-pointer disabled:opacity-40"
          >
            {playing ? <Pause size={15} /> : <Play size={15} className="ml-0.5" />}
          </button>
          <div className="flex items-center gap-2 font-mono text-[9px] text-text-dim">
            <span className="text-white/50">{t("radar.legend")}</span>
            <span className="w-3 h-3 rounded-sm" style={{ background: "#3b82f6" }} />
            <span className="w-3 h-3 rounded-sm" style={{ background: "#22c55e" }} />
            <span className="w-3 h-3 rounded-sm" style={{ background: "#eab308" }} />
            <span className="w-3 h-3 rounded-sm" style={{ background: "#ef4444" }} />
          </div>
        </div>
      </div>
    </div>
  );
}
