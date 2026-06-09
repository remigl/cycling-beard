import { useEffect, useRef, useState, useMemo } from "react";
import { Play, Pause, RotateCcw, MapPin } from "lucide-react";

// ─── Clé MapTiler ─────────────────────────────────────────────────────────────
const MAPTILER_KEY = "QxAdnETuTrlBj2mnHXOB";
const MAPLIBRE_VERSION = "4.7.1";
// ──────────────────────────────────────────────────────────────────────────────

interface RideReplayProps {
  // segments = liste de tracés [lat,lng][] (un par GPX). Fallback sur track simple.
  segments?: [number, number][][];
  track?: [number, number][];
  distanceKm?: number; // vraie distance calculée par le script
  t: (key: string) => string;
}

// Charge MapLibre GL JS dynamiquement, une seule fois
function useMapLibre() {
  const [loaded, setLoaded] = useState(!!(window as any).maplibregl);
  useEffect(() => {
    if ((window as any).maplibregl) { setLoaded(true); return; }
    if (!document.getElementById("maplibre-css")) {
      const css = document.createElement("link");
      css.id = "maplibre-css";
      css.rel = "stylesheet";
      css.href = `https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.css`;
      document.head.appendChild(css);
    }
    let script = document.getElementById("maplibre-js") as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement("script");
      script.id = "maplibre-js";
      script.src = `https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.js`;
      document.body.appendChild(script);
    }
    const onLoad = () => setLoaded(true);
    script.addEventListener("load", onLoad);
    return () => script?.removeEventListener("load", onLoad);
  }, []);
  return loaded;
}

// Distance haversine entre 2 points [lat,lng] en km
function haversine(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = (b[0] - a[0]) * Math.PI / 180;
  const dLng = (b[1] - a[1]) * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 +
    Math.cos(a[0] * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export default function RideReplay({ segments, track, distanceKm, t }: RideReplayProps) {
  const loaded = useMapLibre();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const animRef = useRef<number | null>(null);
  const progressRef = useRef(0);
  const speedRef = useRef(1);
  const lastTimeRef = useRef(0);
  const lastGeocodeRef = useRef(0);
  const distRef = useRef<HTMLSpanElement | null>(null);
  const placeRef = useRef<HTMLSpanElement | null>(null);

  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [speed, setSpeed] = useState(1);

  const keyMissing = MAPTILER_KEY === ("TA_CLE_MAPTILER_ICI" as string);

  // ── Construit la liste des segments (tous les GPX) ──
  // Chaque segment reste séparé pour le tracé (pas de ligne droite),
  // mais on a aussi un parcours continu pour l'animation de la caméra.
  const segs: [number, number][][] = useMemo(() => {
    if (segments && segments.length > 0) return segments.filter(s => s && s.length > 1);
    if (track && track.length > 1) return [track];
    return [];
  }, [segments, track]);

  // Parcours continu pour l'animation : on concatène tous les points (en [lng,lat])
  const flatCoords: [number, number][] = useMemo(() => {
    const out: [number, number][] = [];
    for (const seg of segs) {
      for (const [lat, lng] of seg) out.push([lng, lat]);
    }
    return out;
  }, [segs]);

  // Distance cumulée normalisée sur la VRAIE distance (distanceKm du script)
  // On calcule la proportion via haversine, puis on la met à l'échelle de distanceKm
  const { cumDist, totalDist } = useMemo(() => {
    const raw = [0];
    let total = 0;
    for (let i = 1; i < flatCoords.length; i++) {
      const a: [number, number] = [flatCoords[i - 1][1], flatCoords[i - 1][0]];
      const b: [number, number] = [flatCoords[i][1], flatCoords[i][0]];
      total += haversine(a, b);
      raw.push(total);
    }
    // Mise à l'échelle : la vraie distance prime (le tracé simplifié sous-estime/sur-estime)
    const real = distanceKm && distanceKm > 0 ? distanceKm : total;
    const scale = total > 0 ? real / total : 1;
    return { cumDist: raw.map(d => d * scale), totalDist: real };
  }, [flatCoords, distanceKm]);

  // Détection du cours d'eau le plus proche via Overpass API (throttlé)
  const updateRiver = (lat: number, lng: number) => {
    const now = Date.now();
    if (now - lastGeocodeRef.current < 5000) return; // max 1 appel / 5s
    lastGeocodeRef.current = now;
    // Cherche un waterway (rivière/fleuve) dans un rayon de ~600m
    const query = `[out:json][timeout:8];way(around:600,${lat},${lng})[waterway~"river|stream|canal"][name];out tags 1;`;
    fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      body: "data=" + encodeURIComponent(query),
    })
      .then(r => r.json())
      .then(data => {
        const el = data.elements?.find((e: any) => e.tags?.name);
        if (el && placeRef.current) {
          placeRef.current.textContent = el.tags.name;
        }
      })
      .catch(() => { /* silencieux */ });
  };

  // ── Init de la carte ──
  useEffect(() => {
    if (!loaded || !containerRef.current || flatCoords.length < 2 || keyMissing) return;
    const maplibregl = (window as any).maplibregl;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: `https://api.maptiler.com/maps/satellite/style.json?key=${MAPTILER_KEY}`,
      center: flatCoords[0],
      zoom: 12,
      pitch: 0,
      bearing: 0,
      antialias: true,
      maxPitch: 85,
      attributionControl: { compact: true },
    });
    mapRef.current = map;

    const resizeTimers = [
      setTimeout(() => { try { map.resize(); } catch {} }, 100),
      setTimeout(() => { try { map.resize(); } catch {} }, 600),
    ];

    map.on("error", (e: any) => {
      const msg = (e?.error?.message || String(e)).toLowerCase();
      console.warn("MapLibre:", msg);
      if (msg.includes("403") || msg.includes("401") || msg.includes("forbidden")) {
        setErrorMsg(t("replay.key_error"));
      }
    });

    map.on("load", () => {
      // Terrain 3D
      try {
        map.addSource("terrainSource", {
          type: "raster-dem",
          tiles: [`https://api.maptiler.com/tiles/terrain-rgb-v2/{z}/{x}/{y}.webp?key=${MAPTILER_KEY}`],
          minzoom: 0, maxzoom: 12, tileSize: 256, encoding: "mapbox",
        });
        map.setTerrain({ source: "terrainSource", exaggeration: 1.6 });
        try {
          map.setSky({
            "sky-color": "#9ec8e8", "sky-horizon-blend": 0.5,
            "horizon-color": "#ffffff", "horizon-fog-blend": 0.6,
            "fog-color": "#e8e8e8", "fog-ground-blend": 0.4,
          });
        } catch {}
        setTimeout(() => { try { map.easeTo({ pitch: 64, duration: 2000 }); } catch {} }, 1200);
      } catch (err) {
        console.warn("Terrain indisponible:", err);
      }

      // Trace complète en fond (semi-transparente) + trace parcourue (vive) par-dessus
      segs.forEach((seg, idx) => {
        const lngLat = seg.map(([lat, lng]) => [lng, lat]);
        map.addSource(`route-${idx}`, {
          type: "geojson",
          data: { type: "Feature", geometry: { type: "LineString", coordinates: lngLat } },
        });
        // Trace future : discrète
        map.addLayer({
          id: `route-bg-${idx}`, type: "line", source: `route-${idx}`,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": "#ffffff", "line-width": 3, "line-opacity": 0.35, "line-dasharray": [2, 2] },
        });
      });

      // Source unique pour la trace parcourue (se dessine au fur et à mesure)
      map.addSource("traveled", {
        type: "geojson",
        data: { type: "Feature", geometry: { type: "LineString", coordinates: [flatCoords[0]] } },
      });
      map.addLayer({
        id: "traveled-casing", type: "line", source: "traveled",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#ffffff", "line-width": 7, "line-opacity": 0.7 },
      });
      map.addLayer({
        id: "traveled-line", type: "line", source: "traveled",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#E8620A", "line-width": 4.5 },
      });

      // Marqueur du rider
      const riderEl = document.createElement("div");
      riderEl.style.cssText = "width:20px;height:20px;border-radius:50%;background:#2A6B73;border:3px solid #fff;box-shadow:0 0 10px rgba(0,0,0,.6);";
      const rider = new maplibregl.Marker({ element: riderEl }).setLngLat(flatCoords[0]).addTo(map);
      (map as any)._rider = rider;

      // Cadre toute la trace
      const bounds = flatCoords.reduce(
        (b: any, c: any) => b.extend(c),
        new maplibregl.LngLatBounds(flatCoords[0], flatCoords[0])
      );
      map.fitBounds(bounds, { padding: 50, duration: 0 });
      setReady(true);
    });

    const fallback = setTimeout(() => setReady(true), 9000);

    return () => {
      resizeTimers.forEach(clearTimeout);
      clearTimeout(fallback);
      if (animRef.current) cancelAnimationFrame(animRef.current);
      try { map.remove(); } catch {}
      mapRef.current = null;
    };
  }, [loaded, keyMissing, flatCoords]);

  // ── Animation de survol (basée sur le temps) ──
  const animate = (timestamp?: number) => {
    const map = mapRef.current;
    if (!map || flatCoords.length < 2) return;
    const rider = (map as any)._rider;

    const now = timestamp ?? performance.now();
    if (lastTimeRef.current === 0) lastTimeRef.current = now;
    const dt = now - lastTimeRef.current;
    lastTimeRef.current = now;

    // Durée ∝ distance : ~7s/km, bornée 30s–210s, ajustée par la vitesse
    const baseDuration = Math.min(210000, Math.max(30000, totalDist * 7000));
    progressRef.current += dt / (baseDuration / speedRef.current);
    if (progressRef.current >= 1) {
      progressRef.current = 1;
      setPlaying(false);
    }

    const idx = progressRef.current * (flatCoords.length - 1);
    const i = Math.floor(idx);
    const frac = idx - i;
    const next = Math.min(i + 1, flatCoords.length - 1);

    const lng = flatCoords[i][0] + (flatCoords[next][0] - flatCoords[i][0]) * frac;
    const lat = flatCoords[i][1] + (flatCoords[next][1] - flatCoords[i][1]) * frac;

    // Cap lissé (5 points d'avance)
    const ahead = Math.min(i + 5, flatCoords.length - 1);
    const dx = flatCoords[ahead][0] - flatCoords[i][0];
    const dy = flatCoords[ahead][1] - flatCoords[i][1];
    const bearing = (Math.atan2(dx, dy) * 180) / Math.PI;

    rider?.setLngLat([lng, lat]);
    map.jumpTo({ center: [lng, lat], bearing, pitch: 65, zoom: 14.8 });

    // Dessine la trace parcourue jusqu'au point courant
    const traveledSource = map.getSource("traveled");
    if (traveledSource) {
      const traveled = flatCoords.slice(0, i + 1);
      traveled.push([lng, lat]); // point interpolé courant
      traveledSource.setData({
        type: "Feature",
        geometry: { type: "LineString", coordinates: traveled },
      });
    }

    // Distance réelle écrite directement dans le DOM (zéro re-render)
    if (distRef.current) {
      distRef.current.textContent = `${(cumDist[i] || 0).toFixed(1)} / ${totalDist.toFixed(1)} km`;
    }
    updateRiver(lat, lng);

    if (progressRef.current < 1 && playing) {
      animRef.current = requestAnimationFrame(animate);
    }
  };

  useEffect(() => {
    if (playing) {
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
    const map = mapRef.current;
    if (progressRef.current >= 1) progressRef.current = 0;
    if (map && !playing && progressRef.current === 0 && flatCoords.length > 1) {
      const dx = flatCoords[1][0] - flatCoords[0][0];
      const dy = flatCoords[1][1] - flatCoords[0][1];
      const bearing = (Math.atan2(dx, dy) * 180) / Math.PI;
      map.easeTo({ center: flatCoords[0], zoom: 14.8, pitch: 64, bearing, duration: 1500 });
    }
    setPlaying(p => !p);
  };

  const handleReset = () => {
    setPlaying(false);
    progressRef.current = 0;
    const map = mapRef.current;
    if (map && flatCoords.length > 1) {
      const maplibregl = (window as any).maplibregl;
      (map as any)._rider?.setLngLat(flatCoords[0]);
      if (distRef.current) distRef.current.textContent = `0 / ${totalDist.toFixed(1)} km`;
      if (placeRef.current) placeRef.current.textContent = "—";
      // Réinitialise la trace parcourue
      const ts = map.getSource("traveled");
      if (ts) ts.setData({ type: "Feature", geometry: { type: "LineString", coordinates: [flatCoords[0]] } });
      const bounds = flatCoords.reduce(
        (b: any, c: any) => b.extend(c),
        new maplibregl.LngLatBounds(flatCoords[0], flatCoords[0])
      );
      map.fitBounds(bounds, { padding: 50, pitch: 0, bearing: 0, duration: 1200 });
    }
  };

  const setSpeedVal = (s: number) => { setSpeed(s); speedRef.current = s; };

  if (keyMissing) {
    return (
      <div className="bg-[#1c1b1b] border border-white/5 rounded-lg p-8 text-center">
        <p className="font-mono text-xs text-brand-sand mb-2">⚙️ {t("replay.config")}</p>
      </div>
    );
  }

  if (flatCoords.length < 2) {
    return (
      <div className="bg-[#1c1b1b] border border-white/5 rounded-lg p-8 text-center">
        <p className="text-xs text-text-dim text-opacity-60 font-light">{t("replay.no_track")}</p>
      </div>
    );
  }

  return (
    <div className="relative rounded-2xl overflow-hidden border border-white/5 bg-black">
      <div ref={containerRef} className="w-full h-[480px] md:h-[560px]" />

      {/* Bandeau info */}
      {ready && (
        <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-md rounded-xl px-4 py-2.5 border border-white/10 pointer-events-none">
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
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-2.5 bg-black/70 backdrop-blur-md rounded-full px-3 py-2 border border-white/10">
        <button
          onClick={handlePlayPause}
          disabled={!ready}
          aria-label={playing ? "Pause" : "Play"}
          className="w-11 h-11 rounded-full bg-brand-sand text-bg-dark flex items-center justify-center hover:bg-opacity-90 transition-all cursor-pointer disabled:opacity-40"
        >
          {playing ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
        </button>
        <button
          onClick={handleReset}
          disabled={!ready}
          aria-label="Reset"
          className="w-9 h-9 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition-all cursor-pointer disabled:opacity-40"
        >
          <RotateCcw size={15} />
        </button>
        <div className="flex items-center gap-1 ml-0.5 pl-2 border-l border-white/15">
          {[0.5, 1, 2].map(s => (
            <button
              key={s}
              onClick={() => setSpeedVal(s)}
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
