import { useEffect, useRef, useState } from "react";
import { Play, Pause, RotateCcw, MapPin } from "lucide-react";

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
  const speedRef = useRef(1);
  const lastGeocodeRef = useRef(0);
  const distRef = useRef<HTMLSpanElement | null>(null);
  const placeRef = useRef<HTMLSpanElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [speed, setSpeed] = useState(1);

  const keyMissing = MAPTILER_KEY === "TA_CLE_MAPTILER_ICI";

  // Convertit le track [lat,lng] en [lng,lat] pour MapLibre
  const coords = track.map(([lat, lng]) => [lng, lat]);

  // Distance totale du tracé (km, approximation haversine)
  const totalDist = (() => {
    let d = 0;
    for (let i = 1; i < track.length; i++) {
      const [lat1, lng1] = track[i - 1], [lat2, lng2] = track[i];
      const R = 6371;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLng = (lng2 - lng1) * Math.PI / 180;
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
      d += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
    return d;
  })();

  // Reverse geocoding léger pendant le survol (throttlé)
  const updatePlace = async (lat: number, lng: number) => {
    const now = Date.now();
    if (now - lastGeocodeRef.current < 3000) return; // max 1 appel / 3s
    lastGeocodeRef.current = now;
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=12&accept-language=fr`);
      const data = await res.json();
      const a = data.address || {};
      const place = a.city || a.town || a.village || a.municipality || a.county || a.state || "";
      if (place && placeRef.current) placeRef.current.textContent = place;
    } catch { /* silencieux */ }
  };

  useEffect(() => {
    if (!loaded || !containerRef.current || coords.length < 2 || keyMissing) return;
    const maplibregl = (window as any).maplibregl;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: `https://api.maptiler.com/maps/satellite/style.json?key=${MAPTILER_KEY}`,
      center: coords[0],
      zoom: 12,
      pitch: 0,
      bearing: 0,
      antialias: true,
      maxPitch: 85,
    });
    mapRef.current = map;

    // Le conteneur peut avoir une taille nulle si l'onglet vient de s'ouvrir
    setTimeout(() => { try { map.resize(); } catch {} }, 100);
    setTimeout(() => { try { map.resize(); } catch {} }, 500);

    // Si le style échoue, on log mais on n'empêche pas l'affichage
    map.on("error", (e: any) => {
      const msg = e?.error?.message || String(e);
      console.warn("MapLibre error:", msg);
      if (msg.toLowerCase().includes("403") || msg.toLowerCase().includes("forbidden") || msg.toLowerCase().includes("401")) {
        setErrorMsg("Clé MapTiler refusée (vérifie les 'Allowed origins' sur cloud.maptiler.com)");
      }
    });

    map.on("load", () => {
      // Terrain 3D — source DEM MapTiler (tuiles explicites pour fiabilité)
      try {
        map.addSource("terrainSource", {
          type: "raster-dem",
          tiles: [`https://api.maptiler.com/tiles/terrain-rgb-v2/{z}/{x}/{y}.webp?key=${MAPTILER_KEY}`],
          minzoom: 0,
          maxzoom: 12,
          tileSize: 256,
          encoding: "mapbox",
        });
        map.setTerrain({ source: "terrainSource", exaggeration: 1.8 });
        // Ciel pour un rendu 3D plus immersif
        try {
          map.setSky({
            "sky-color": "#87CEEB",
            "sky-horizon-blend": 0.5,
            "horizon-color": "#ffffff",
            "horizon-fog-blend": 0.5,
            "fog-color": "#dddddd",
            "fog-ground-blend": 0.5,
          });
        } catch {}
        // Incline la caméra après chargement des tuiles terrain
        setTimeout(() => map.easeTo({ pitch: 65, duration: 2000 }), 1200);
      } catch (err) {
        console.warn("Terrain 3D indisponible:", err);
        setErrorMsg("Terrain 3D indisponible sur ce plan MapTiler");
        map.easeTo({ pitch: 55, duration: 1000 });
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

      // Cadre la vue sur tout le tracé (à plat, le pitch est appliqué après)
      const bounds = coords.reduce((b: any, c: any) => b.extend(c), new maplibregl.LngLatBounds(coords[0], coords[0]));
      map.fitBounds(bounds, { padding: 60, duration: 0 });
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
  const lastTimeRef = useRef<number>(0);
  const animate = (timestamp?: number) => {
    const map = mapRef.current;
    if (!map || coords.length < 2) return;
    const rider = (map as any)._rider;

    // Animation basée sur le temps (indépendante du frame rate)
    const now = timestamp ?? performance.now();
    if (lastTimeRef.current === 0) lastTimeRef.current = now;
    const dt = now - lastTimeRef.current;
    lastTimeRef.current = now;

    // Durée proportionnelle à la distance : ~6s par km, base contemplative
    // bornée entre 30s et 180s, divisée par la vitesse choisie
    const baseDuration = Math.min(180000, Math.max(30000, totalDist * 6000));
    const DURATION_MS = baseDuration / speedRef.current;
    progressRef.current += dt / DURATION_MS;
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

    // Cap lissé (moyenne sur quelques points pour éviter les à-coups)
    const ahead = Math.min(i + 5, coords.length - 1);
    const dx = coords[ahead][0] - coords[i][0];
    const dy = coords[ahead][1] - coords[i][1];
    const bearing = (Math.atan2(dx, dy) * 180) / Math.PI;

    rider?.setLngLat([lng, lat]);
    map.jumpTo({
      center: [lng, lat],
      bearing,
      pitch: 65,
      zoom: 15,
    });

    // Distance : écrit directement dans le DOM (zéro re-render React)
    if (distRef.current) {
      distRef.current.textContent = `${(progressRef.current * totalDist).toFixed(1)} / ${totalDist.toFixed(1)} km`;
    }
    // Lieu : throttlé à 1 appel / 3s, met à jour le DOM directement
    updatePlace(lat, lng);

    if (progressRef.current < 1 && playing) {
      animRef.current = requestAnimationFrame(animate);
    }
  };

  useEffect(() => {
    if (playing) {
      // Laisse le zoom d'entrée se faire avant de lancer le survol
      const delay = progressRef.current === 0 ? 1500 : 0;
      const tid = setTimeout(() => {
        lastTimeRef.current = 0;
        animRef.current = requestAnimationFrame(animate);
      }, delay);
      return () => { clearTimeout(tid); if (animRef.current) cancelAnimationFrame(animRef.current); };
    } else if (animRef.current) {
      cancelAnimationFrame(animRef.current);
    }
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [playing]);

  const handlePlayPause = () => {
    if (progressRef.current >= 1) progressRef.current = 0;
    const map = mapRef.current;
    // Au démarrage, zoom doux vers le point courant avant de lancer le survol
    if (map && !playing && progressRef.current === 0 && coords.length > 1) {
      const dx = coords[1][0] - coords[0][0];
      const dy = coords[1][1] - coords[0][1];
      const bearing = (Math.atan2(dx, dy) * 180) / Math.PI;
      map.easeTo({ center: coords[0], zoom: 14.5, pitch: 62, bearing, duration: 1500 });
    }
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
      map.fitBounds(bounds, { padding: 60, pitch: 0, bearing: 0, duration: 1000 });
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

      {/* Bandeau info : lieu traversé + distance */}
      {ready && (
        <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-md rounded-xl px-4 py-2.5 border border-white/10">
          <div className="flex items-center gap-2">
            <MapPin size={13} className="text-brand-sand" />
            <span ref={placeRef} className="font-display font-bold text-sm text-white">—</span>
          </div>
          <div className="font-mono text-[10px] text-white/60 mt-0.5">
            <span ref={distRef}>0 / {totalDist.toFixed(1)} km</span>
          </div>
        </div>
      )}

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

        {/* Sélecteur de vitesse */}
        <div className="flex items-center gap-1 ml-1 pl-2 border-l border-white/15">
          {[0.5, 1, 2].map(s => (
            <button
              key={s}
              onClick={() => { setSpeed(s); speedRef.current = s; }}
              className={`px-2 py-1 rounded-full font-mono text-[10px] transition-all cursor-pointer ${
                speed === s ? "bg-brand-sand text-bg-dark font-bold" : "text-white/60 hover:text-white"
              }`}
            >
              {s}×
            </button>
          ))}
        </div>
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
