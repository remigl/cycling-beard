import { useEffect, useRef, useState } from "react";
import { Play, Pause, RotateCcw } from "lucide-react";

// ─── Configure ta clé MapTiler ici ───────────────────────────────────────────
const MAPTILER_KEY = "QxAdnETuTrlBj2mnHXOB";
// ──────────────────────────────────────────────────────────────────────────────

interface RideReplayProps {
  track: [number, number][]; // [lat, lng][]
  t: (key: string) => string;
}

// Charge MapLibre GL JS dynamiquement (CSS + JS)
function useMapLibre() {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if ((window as any).maplibregl) { setLoaded(true); return; }
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css";
    document.head.appendChild(css);
    const script = document.createElement("script");
    script.src = "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js";
    script.onload = () => setLoaded(true);
    document.body.appendChild(script);
  }, []);
  return loaded;
}

export default function RideReplay({ track, t }: RideReplayProps) {
  const loaded = useMapLibre();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const animRef = useRef<number | null>(null);
  const progressRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const keyMissing = MAPTILER_KEY === "TA_CLE_MAPTILER_ICI";

  // Convertit le track [lat,lng] en [lng,lat] pour MapLibre
  const coords = track.map(([lat, lng]) => [lng, lat]);

  useEffect(() => {
    if (!loaded || !containerRef.current || coords.length < 2 || keyMissing) return;
    const maplibregl = (window as any).maplibregl;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: `https://api.maptiler.com/maps/satellite/style.json?key=${MAPTILER_KEY}`,
      center: coords[0],
      zoom: 13,
      pitch: 60,
      bearing: 0,
      antialias: true,
    });
    mapRef.current = map;

    // Le conteneur peut avoir une taille nulle si l'onglet vient de s'ouvrir
    setTimeout(() => { try { map.resize(); } catch {} }, 100);

    // Si le style échoue, on log mais on n'empêche pas l'affichage
    map.on("error", (e: any) => {
      const msg = e?.error?.message || String(e);
      console.warn("MapLibre error:", msg);
      if (msg.toLowerCase().includes("403") || msg.toLowerCase().includes("forbidden") || msg.toLowerCase().includes("401")) {
        setErrorMsg("Clé MapTiler refusée (vérifie les 'Allowed origins' sur cloud.maptiler.com)");
      }
    });

    map.on("load", () => {
      // Terrain 3D (optionnel — n'empêche pas l'affichage si échec)
      try {
        map.addSource("terrain", {
          type: "raster-dem",
          url: `https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${MAPTILER_KEY}`,
        });
        map.setTerrain({ source: "terrain", exaggeration: 1.4 });
      } catch (err) {
        console.warn("Terrain 3D indisponible:", err);
      }

      // Tracé
      try {
        map.addSource("route", {
          type: "geojson",
          data: { type: "Feature", geometry: { type: "LineString", coordinates: coords } },
        });
        map.addLayer({
          id: "route-line",
          type: "line",
          source: "route",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": "#E8620A", "line-width": 5 },
        });
      } catch (err) {
        console.warn("Tracé indisponible:", err);
      }

      // Marqueur du rider
      const riderEl = document.createElement("div");
      riderEl.style.cssText = "width:18px;height:18px;border-radius:50%;background:#2A6B73;border:3px solid #fff;box-shadow:0 0 8px rgba(0,0,0,.5);";
      const rider = new maplibregl.Marker({ element: riderEl }).setLngLat(coords[0]).addTo(map);
      (map as any)._rider = rider;

      // Cadre la vue sur tout le tracé
      const bounds = coords.reduce((b: any, c: any) => b.extend(c), new maplibregl.LngLatBounds(coords[0], coords[0]));
      map.fitBounds(bounds, { padding: 60, pitch: 60, duration: 0 });
      setReady(true);
    });

    // Sécurité : si "load" ne se déclenche pas en 8s, on débloque quand même
    const fallback = setTimeout(() => setReady(true), 8000);

    return () => {
      clearTimeout(fallback);
      if (animRef.current) cancelAnimationFrame(animRef.current);
      map.remove();
      mapRef.current = null;
    };
  }, [loaded, keyMissing]);

  // Animation de survol
  const animate = () => {
    const map = mapRef.current;
    if (!map || coords.length < 2) return;
    const rider = (map as any)._rider;

    progressRef.current += 0.0012; // vitesse
    if (progressRef.current >= 1) {
      progressRef.current = 1;
      setPlaying(false);
    }

    const idx = progressRef.current * (coords.length - 1);
    const i = Math.floor(idx);
    const frac = idx - i;
    const next = Math.min(i + 1, coords.length - 1);

    // Position interpolée
    const lng = coords[i][0] + (coords[next][0] - coords[i][0]) * frac;
    const lat = coords[i][1] + (coords[next][1] - coords[i][1]) * frac;

    // Cap (direction)
    const dx = coords[next][0] - coords[i][0];
    const dy = coords[next][1] - coords[i][1];
    const bearing = (Math.atan2(dx, dy) * 180) / Math.PI;

    rider?.setLngLat([lng, lat]);
    map.easeTo({ center: [lng, lat], bearing, pitch: 65, zoom: 15, duration: 100, easing: (x: number) => x });

    if (progressRef.current < 1 && playing) {
      animRef.current = requestAnimationFrame(animate);
    }
  };

  useEffect(() => {
    if (playing) {
      animRef.current = requestAnimationFrame(animate);
    } else if (animRef.current) {
      cancelAnimationFrame(animRef.current);
    }
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [playing]);

  const handlePlayPause = () => {
    if (progressRef.current >= 1) progressRef.current = 0;
    setPlaying(p => !p);
  };

  const handleReset = () => {
    setPlaying(false);
    progressRef.current = 0;
    const map = mapRef.current;
    if (map && coords.length > 1) {
      const maplibregl = (window as any).maplibregl;
      (map as any)._rider?.setLngLat(coords[0]);
      const bounds = coords.reduce((b: any, c: any) => b.extend(c), new maplibregl.LngLatBounds(coords[0], coords[0]));
      map.fitBounds(bounds, { padding: 60, pitch: 60, duration: 1000 });
    }
  };

  if (keyMissing) {
    return (
      <div className="bg-[#1c1b1b] border border-white/5 rounded-lg p-8 text-center">
        <p className="font-mono text-xs text-brand-sand mb-2">⚙️ Survol 3D à configurer</p>
        <p className="text-xs text-text-dim text-opacity-60 font-light">
          Ajoute ta clé MapTiler dans le fichier RideReplay.tsx pour activer le survol 3D.
        </p>
      </div>
    );
  }

  if (coords.length < 2) {
    return (
      <div className="bg-[#1c1b1b] border border-white/5 rounded-lg p-8 text-center">
        <p className="text-xs text-text-dim text-opacity-60 font-light">{t("replay.no_track")}</p>
      </div>
    );
  }

  return (
    <div className="relative rounded-2xl overflow-hidden border border-white/5 bg-black">
      <div ref={containerRef} className="w-full h-[480px] md:h-[560px]" />

      {/* Contrôles */}
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-black/70 backdrop-blur-md rounded-full px-3 py-2 border border-white/10">
        <button
          onClick={handlePlayPause}
          disabled={!ready}
          className="w-11 h-11 rounded-full bg-brand-sand text-bg-dark flex items-center justify-center hover:bg-opacity-90 transition-all cursor-pointer disabled:opacity-40"
        >
          {playing ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
        </button>
        <button
          onClick={handleReset}
          disabled={!ready}
          className="w-9 h-9 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition-all cursor-pointer disabled:opacity-40"
        >
          <RotateCcw size={15} />
        </button>
      </div>

      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 pointer-events-none">
          <span className="font-mono text-[10px] text-brand-sand uppercase tracking-widest animate-pulse">
            {t("replay.loading")}
          </span>
        </div>
      )}

      {errorMsg && (
        <div className="absolute top-3 left-3 right-3 bg-red-900/80 text-white font-mono text-[10px] p-3 rounded-lg">
          ⚠️ {errorMsg}
        </div>
      )}
    </div>
  );
}
