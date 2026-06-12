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
  const riverRef = useRef<HTMLSpanElement | null>(null);
  const lastCityRef = useRef(0);

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

  // Distance cumulée — la VRAIE distance (distanceKm du script) fait foi
  const { cumDist, totalDist } = useMemo(() => {
    const raw = [0];
    let total = 0;
    for (let i = 1; i < flatCoords.length; i++) {
      const a: [number, number] = [flatCoords[i - 1][1], flatCoords[i - 1][0]];
      const b: [number, number] = [flatCoords[i][1], flatCoords[i][0]];
      total += haversine(a, b);
      raw.push(total);
    }
    // Si on a la vraie distance, elle prime systématiquement et on met le cumul à l'échelle
    if (distanceKm && distanceKm > 0) {
      const scale = total > 0 ? distanceKm / total : 1;
      return { cumDist: raw.map(d => d * scale), totalDist: distanceKm };
    }
    return { cumDist: raw, totalDist: total };
  }, [flatCoords, distanceKm]);

  // Clé stable pour éviter de recréer la carte à chaque render (sinon freeze)
  const coordsKey = useMemo(
    () => `${flatCoords.length}:${flatCoords[0]?.join(",") || ""}:${flatCoords[flatCoords.length - 1]?.join(",") || ""}`,
    [flatCoords]
  );

  // Détection du cours d'eau le plus proche via Overpass API (throttlé)
  const updateRiver = (lat: number, lng: number) => {
    const now = Date.now();
    if (now - lastGeocodeRef.current < 5000) return; // max 1 appel / 5s
    lastGeocodeRef.current = now;
    const query = `[out:json][timeout:8];way(around:600,${lat},${lng})[waterway~"river|stream|canal"][name];out tags 1;`;
    fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      body: "data=" + encodeURIComponent(query),
    })
      .then(r => r.json())
      .then(data => {
        const el = data.elements?.find((e: any) => e.tags?.name);
        if (riverRef.current) {
          riverRef.current.textContent = el?.tags?.name ? `· ${el.tags.name}` : "";
        }
      })
      .catch(() => { /* silencieux */ });
  };

  // Détection de la ville la plus proche (Nominatim, throttlé)
  const updateCity = (lat: number, lng: number) => {
    const now = Date.now();
    if (now - lastCityRef.current < 4000) return;
    lastCityRef.current = now;
    fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=12&accept-language=fr`)
      .then(r => r.json())
      .then(data => {
        const a = data.address || {};
        const city = a.city || a.town || a.village || a.municipality || a.county || a.state || "";
        if (city && placeRef.current) placeRef.current.textContent = city;
      })
      .catch(() => { /* silencieux */ });
  };

  // ── Init de la carte ──
  useEffect(() => {
    if (!loaded || !containerRef.current || flatCoords.length < 2 || keyMissing) return;
    const maplibregl = (window as any).maplibregl;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: `https://api.maptiler.com/maps/hybrid/style.json?key=${MAPTILER_KEY}`,
      center: flatCoords[0],
      zoom: 12,
      pitch: 0,
      bearing: 0,
      antialias: true,
      maxPitch: 85,
      attributionControl: { compact: true },
    });
    mapRef.current = map;

    // Filets de sécurité : quelques resize programmés…
    const resizeTimers = [
      setTimeout(() => { try { map.resize(); } catch {} }, 100),
      setTimeout(() => { try { map.resize(); } catch {} }, 600),
      setTimeout(() => { try { map.resize(); } catch {} }, 1500),
    ];

    // …MAIS surtout un ResizeObserver : il déclenche un resize EXACTEMENT quand
    // le conteneur obtient/modifie sa taille réelle (ce que le pinch faisait à la main).
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && containerRef.current) {
      ro = new ResizeObserver(() => { try { map.resize(); } catch {} });
      ro.observe(containerRef.current);
    }

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
        map.setTerrain({ source: "terrainSource", exaggeration: 1.3 });
        try {
          map.setSky({
            "sky-color": "#9ec8e8", "sky-horizon-blend": 0.5,
            "horizon-color": "#ffffff", "horizon-fog-blend": 0.6,
            "fog-color": "#e8e8e8", "fog-ground-blend": 0.4,
          });
        } catch {}
        // PAS de bascule auto en 3D ici : on reste en vue de dessus (pitch 0)
        // tant que les tuiles ne sont pas chargées. La bascule se fait au Play.
      } catch (err) {
        console.warn("Terrain indisponible:", err);
      }

      // Bâtiments 3D (si la source vectorielle MapTiler est dispo dans le style hybrid)
      try {
        const layers = map.getStyle().layers || [];
        // Trouve la 1ère couche de symboles pour insérer les bâtiments dessous
        const labelLayer = layers.find((l: any) => l.type === "symbol");
        // La source vectorielle de MapTiler s'appelle généralement "maptiler_planet"
        const sources = map.getStyle().sources || {};
        const vectorSrc = Object.keys(sources).find(k => sources[k].type === "vector");
        if (vectorSrc) {
          map.addLayer({
            id: "buildings-3d",
            type: "fill-extrusion",
            source: vectorSrc,
            "source-layer": "building",
            minzoom: 13,
            paint: {
              "fill-extrusion-color": "#d8d2c8",
              "fill-extrusion-height": ["coalesce", ["get", "render_height"], ["get", "height"], 8],
              "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
              "fill-extrusion-opacity": 0.85,
            },
          }, labelLayer?.id);
        }
      } catch (err) {
        console.warn("Bâtiments 3D indisponibles:", err);
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

      // Vue initiale : CENTRÉE sur le marqueur de départ (pas un aperçu global),
      // à plat, au zoom du survol. Ainsi le curseur est déjà au centre de l'écran
      // dès l'arrivée, sans avoir à dézoomer.
      const dx0 = flatCoords.length > 1 ? flatCoords[1][0] - flatCoords[0][0] : 0;
      const dy0 = flatCoords.length > 1 ? flatCoords[1][1] - flatCoords[0][1] : 0;
      const bearing0 = (Math.atan2(dx0, dy0) * 180) / Math.PI;
      map.jumpTo({ center: flatCoords[0], zoom: 13.4, pitch: 0, bearing: bearing0 });
      setReady(true);
    });

    const fallback = setTimeout(() => setReady(true), 9000);

    return () => {
      resizeTimers.forEach(clearTimeout);
      clearTimeout(fallback);
      if (ro) ro.disconnect();
      if (animRef.current) cancelAnimationFrame(animRef.current);
      try { map.remove(); } catch {}
      mapRef.current = null;
    };
  }, [loaded, keyMissing, coordsKey]);

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

    // ── Position par DISTANCE (pas par index) → vitesse visuelle constante ──
    // On cherche le point correspondant à `progress × distance totale`.
    const targetDist = progressRef.current * totalDist;
    // Recherche du segment [i, i+1] contenant cette distance cumulée
    let i = 0;
    while (i < cumDist.length - 1 && cumDist[i + 1] < targetDist) i++;
    const next = Math.min(i + 1, flatCoords.length - 1);
    // Fraction à l'intérieur du segment, basée sur la distance (pas l'index)
    const segStart = cumDist[i] || 0;
    const segEnd = cumDist[next] || segStart;
    const frac = segEnd > segStart ? (targetDist - segStart) / (segEnd - segStart) : 0;

    const lng = flatCoords[i][0] + (flatCoords[next][0] - flatCoords[i][0]) * frac;
    const lat = flatCoords[i][1] + (flatCoords[next][1] - flatCoords[i][1]) * frac;

    // Cap lissé : vise un point à ~150 m d'avance en distance
    let aheadIdx = i;
    const lookahead = targetDist + 0.15; // km
    while (aheadIdx < cumDist.length - 1 && cumDist[aheadIdx] < lookahead) aheadIdx++;
    const dx = flatCoords[aheadIdx][0] - lng;
    const dy = flatCoords[aheadIdx][1] - lat;
    const bearing = (Math.atan2(dx, dy) * 180) / Math.PI;

    rider?.setLngLat([lng, lat]);
    // Centre TOUJOURS exactement sur le marqueur. Zoom reculé (13.4) pour que les
    // tuiles satellite aient le temps de charger pendant le survol (moins de tuiles,
    // plus grandes, mieux mises en cache → pas de fond vert).
    map.jumpTo({ center: [lng, lat], bearing, pitch: 58, zoom: 13.4 });

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
      distRef.current.textContent = `${targetDist.toFixed(1)} / ${totalDist.toFixed(1)} km`;
    }
    updateRiver(lat, lng);
    updateCity(lat, lng);

    if (progressRef.current < 1 && playing) {
      animRef.current = requestAnimationFrame(animate);
    }
  };

  // Empêche l'écran de s'éteindre pendant la lecture du survol (Wake Lock API)
  const wakeLockRef = useRef<any>(null);
  useEffect(() => {
    const nav: any = navigator;
    if (playing && nav?.wakeLock?.request) {
      nav.wakeLock.request("screen").then((wl: any) => {
        wakeLockRef.current = wl;
      }).catch(() => {});
    }
    // Réacquiert le verrou si l'onglet redevient visible pendant la lecture
    const onVisible = () => {
      if (playing && document.visibilityState === "visible" && nav?.wakeLock?.request) {
        nav.wakeLock.request("screen").then((wl: any) => { wakeLockRef.current = wl; }).catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      if (wakeLockRef.current) { try { wakeLockRef.current.release(); } catch {} wakeLockRef.current = null; }
    };
  }, [playing]);

  useEffect(() => {
    if (playing) {
      lastTimeRef.current = 0;
      animRef.current = requestAnimationFrame(animate);
      return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
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

      // 1) Place la caméra au départ, à plat (pas de plongée dans le terrain)
      try { map.resize(); } catch {}
      map.jumpTo({ center: flatCoords[0], zoom: 13.4, pitch: 0, bearing });

      // 2) Attend que les tuiles (relief + satellite) soient chargées,
      //    PUIS bascule en 3D en douceur. Évite le « mur vert » et le clignotement.
      const tiltThenPlay = () => {
        try { map.easeTo({ pitch: 58, duration: 1800 }); } catch {}
        setTimeout(() => setPlaying(true), 1900);
      };
      if (map.areTilesLoaded && map.areTilesLoaded()) {
        tiltThenPlay();
      } else {
        const onIdle = () => { map.off("idle", onIdle); tiltThenPlay(); };
        map.on("idle", onIdle);
        // Sécurité : si "idle" tarde trop, on lance quand même après 4 s
        setTimeout(() => { map.off("idle", onIdle); tiltThenPlay(); }, 4000);
      }
      return;  // setPlaying est géré dans tiltThenPlay
    }
    setPlaying(p => !p);
  };

  const handleReset = () => {
    setPlaying(false);
    progressRef.current = 0;
    const map = mapRef.current;
    if (map && flatCoords.length > 1) {
      (map as any)._rider?.setLngLat(flatCoords[0]);
      if (distRef.current) distRef.current.textContent = `0 / ${totalDist.toFixed(1)} km`;
      if (placeRef.current) placeRef.current.textContent = "—";
      if (riverRef.current) riverRef.current.textContent = "";
      // Réinitialise la trace parcourue
      const ts = map.getSource("traveled");
      if (ts) ts.setData({ type: "Feature", geometry: { type: "LineString", coordinates: [flatCoords[0]] } });
      // Recentre sur le marqueur de départ (à plat), cohérent avec la vue initiale
      const dx0 = flatCoords[1][0] - flatCoords[0][0];
      const dy0 = flatCoords[1][1] - flatCoords[0][1];
      const bearing0 = (Math.atan2(dx0, dy0) * 180) / Math.PI;
      map.easeTo({ center: flatCoords[0], zoom: 13.4, pitch: 0, bearing: bearing0, duration: 1000 });
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
    <div className="relative rounded-2xl overflow-hidden border border-white/5 bg-black isolate z-0 h-full">
      {/* Rend l'attribution non cliquable (on évite de quitter la page par erreur),
          tout en gardant le texte visible (obligatoire pour la licence). */}
      <style>{`
        .maplibregl-ctrl-attrib a { pointer-events: none !important; cursor: default !important; }
        .maplibregl-ctrl-attrib-button { pointer-events: auto !important; }
      `}</style>
      <div ref={containerRef} className="w-full h-full min-h-[300px]" />

      {/* Bandeau info */}
      {ready && (
        <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-md rounded-xl px-4 py-2.5 border border-white/10 pointer-events-none">
          <div className="flex items-center gap-2">
            <MapPin size={13} className="text-brand-sand" />
            <span ref={placeRef} className="font-display font-bold text-sm text-white">—</span>
            <span ref={riverRef} className="font-mono text-[11px] text-sky-300"></span>
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
