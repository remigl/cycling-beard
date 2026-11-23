import { useEffect, useMemo, useRef, useState } from "react";
import GlobeGL from "react-globe.gl";
import * as THREE from "three";

// Un "run" = portion continue du trajet d'un même type (vélo / autres).
// Points en [lat, lng], dans l'ordre chronologique.
export interface GlobeRun {
  color: string;
  points: [number, number][];
}

interface GlobeProps {
  runs: GlobeRun[];
  here?: [number, number] | null;   // [lng, lat]
}

// Durée totale du dessin du trajet, et cadence des mises à jour (légère :
// ~25 images/s suffisent pour un tracé fluide sans surcharger le GPU).
const DRAW_MS = 4200;
const TICK_MS = 40;

type PathDatum = { color: string; pts: [number, number][] };

export default function Globe({ runs, here }: GlobeProps) {
  const globeRef = useRef<any>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [ready, setReady] = useState(false);
  // Nombre de points actuellement dessinés (sur l'ensemble des runs)
  const [drawn, setDrawn] = useState(0);

  // Taille du conteneur (on ignore les petites variations de hauteur dues à
  // la barre d'adresse mobile, pour ne pas recréer la scène au scroll).
  useEffect(() => {
    let lastW = 0, lastH = 0;
    const measure = () => {
      const el = wrapRef.current;
      if (!el) return;
      const w = el.clientWidth, h = el.clientHeight;
      if (w !== lastW || Math.abs(h - lastH) > 120) { lastW = w; lastH = h; setSize({ w, h }); }
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const totalPts = useMemo(() => runs.reduce((n, r) => n + r.points.length, 0), [runs]);
  const firstPt = runs[0]?.points[0];
  const lastRun = runs[runs.length - 1];
  const lastPt = lastRun?.points[lastRun.points.length - 1];
  const start: [number, number] = firstPt ? [firstPt[1], firstPt[0]] : [-2.21, 47.27];
  const hp: [number, number] = here || (lastPt ? [lastPt[1], lastPt[0]] : start);

  // Objets "path" des runs TERMINÉS : stables (même référence) → le globe ne
  // reconstruit pas leur géométrie à chaque image, seul le run en cours change.
  const fullPaths = useMemo<PathDatum[]>(() => runs.map(r => ({ color: r.color, pts: r.points })), [runs]);
  const pathsData = useMemo<PathDatum[]>(() => {
    if (drawn >= totalPts) return fullPaths;
    const out: PathDatum[] = [];
    let left = drawn;
    for (let i = 0; i < runs.length && left > 1; i++) {
      const n = runs[i].points.length;
      if (left >= n) { out.push(fullPaths[i]); left -= n; }
      else { out.push({ color: runs[i].color, pts: runs[i].points.slice(0, left) }); left = 0; }
    }
    return out;
  }, [drawn, totalPts, runs, fullPaths]);

  // Tête du tracé (dernier point dessiné), pour que la caméra la suive
  const headPt = useMemo<[number, number] | null>(() => {
    const last = pathsData[pathsData.length - 1];
    return last && last.pts.length ? last.pts[last.pts.length - 1] : null;
  }, [pathsData]);

  const done = drawn >= totalPts;

  // Altitude de caméra pour que la Terre tienne EN ENTIER dans le cadre :
  // sur un écran en hauteur (téléphone), c'est la largeur qui limite.
  const camAlt = useMemo(() => {
    const ratio = size.w > 0 ? size.h / size.w : 1;
    return Math.max(2.1, (1 + 2.1) * Math.max(1, ratio) * 0.9 - 1);
  }, [size.w, size.h]);

  // ── Animation du tracé : la ligne se dessine progressivement, une fois ──
  useEffect(() => {
    if (!ready || totalPts === 0) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setDrawn(totalPts); return; }
    setDrawn(0);
    const t0 = performance.now();
    const id = window.setInterval(() => {
      const p = Math.min(1, (performance.now() - t0) / DRAW_MS);
      // easeInOut : départ et arrivée en douceur
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      setDrawn(Math.max(2, Math.round(e * totalPts)));
      if (p >= 1) window.clearInterval(id);
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [ready, totalPts]);

  // Caméra : suit la tête du tracé pendant le dessin, puis se pose sur la
  // dernière position et reprend la rotation lente.
  const lastCamMove = useRef(0);
  useEffect(() => {
    const g = globeRef.current;
    if (!g || !ready) return;
    try {
      const controls = g.controls();
      controls.autoRotate = done;
    } catch { /* contrôles pas encore prêts */ }
    if (done) {
      try { g.pointOfView({ lat: hp[1], lng: hp[0], altitude: camAlt }, 1400); } catch { /* ignoré */ }
      return;
    }
    if (!headPt) return;
    const now = performance.now();
    if (now - lastCamMove.current < 450) return;
    lastCamMove.current = now;
    try { g.pointOfView({ lat: headPt[0], lng: headPt[1], altitude: camAlt }, 900); } catch { /* ignoré */ }
  }, [headPt, done, ready, hp[0], hp[1], camAlt]);

  // ── Réglages de la scène + nuages en temps réel (une fois par taille) ──
  useEffect(() => {
    const g = globeRef.current;
    if (!g || !size.w) return;
    try {
      const controls = g.controls();
      controls.autoRotateSpeed = 0.55;
      controls.enableZoom = false;
    } catch { /* ignoré */ }
    try { g.pointOfView({ lat: start[1], lng: start[0], altitude: camAlt }, 0); } catch { /* ignoré */ }
    try {
      const canvas = wrapRef.current?.querySelector("canvas");
      if (canvas) (canvas as HTMLElement).style.touchAction = "pan-y";
    } catch { /* ignoré */ }
    try { g.renderer().setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); } catch { /* ignoré */ }

    // Nuages : couverture nuageuse mondiale du moment (live-cloud-maps,
    // maj ~toutes les 3h), attachés à la Terre pour tourner avec elle.
    let clouds: any = null, cloudsMat: any = null, cancelled = false, tries = 0;
    const setup = () => {
      if (cancelled) return;
      tries++;
      let scene: any = null, R = 100;
      try { scene = g.scene(); } catch { /* ignoré */ }
      try { R = g.getGlobeRadius(); } catch { /* ignoré */ }
      if (!scene && tries < 20) { setTimeout(setup, 200); return; }
      if (!scene) return;
      try {
        const loader = new THREE.TextureLoader();
        loader.setCrossOrigin("anonymous");
        loader.load("https://clouds.matteason.co.uk/images/2048x1024/clouds-alpha.png", (tex) => {
          if (cancelled) return;
          cloudsMat = new THREE.MeshPhongMaterial({ map: tex, transparent: true, opacity: 0.85, depthWrite: false });
          clouds = new THREE.Mesh(new THREE.SphereGeometry(R * 1.012, 64, 64), cloudsMat);
          clouds.rotation.y = -Math.PI / 2;
          let attached = false;
          try {
            const globeObj = (scene.children || []).find((c: any) =>
              c && c.type === "Group" && typeof c.globeImageUrl === "function");
            if (globeObj) { globeObj.add(clouds); attached = true; }
          } catch { /* ignoré */ }
          if (!attached) scene.add(clouds);
        });
      } catch { /* ignoré */ }
    };
    setup();

    return () => {
      cancelled = true;
      try { if (clouds && clouds.parent) clouds.parent.remove(clouds); } catch { /* ignoré */ }
      try { if (cloudsMat) { cloudsMat.map?.dispose(); cloudsMat.dispose(); } } catch { /* ignoré */ }
      try { clouds?.geometry?.dispose(); } catch { /* ignoré */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.w, size.h]);

  // Départ + dernière position (l'anneau de la dernière position apparaît
  // une fois le tracé terminé).
  const rings = useMemo(() => done ? [{ lat: hp[1], lng: hp[0], maxR: 4, speed: 1.6, color: "#E8620A" }] : [], [done, hp[0], hp[1]]);
  const points = useMemo(() => [
    { lat: start[1], lng: start[0], color: "#d9c9a8", r: 0.35 },
    ...(done ? [{ lat: hp[1], lng: hp[0], color: "#E8620A", r: 0.6 }] : []),
  ], [done, start[0], start[1], hp[0], hp[1]]);

  // Fond transparent : on voit directement l'arrière-plan PNG de la page
  // (aucun aplat de couleur, aucun halo d'atmosphère autour du globe).
  return (
    <div ref={wrapRef} className="absolute inset-0">
      {size.w > 0 && (
        <GlobeGL
          ref={globeRef}
          width={size.w}
          height={size.h}
          backgroundColor="rgba(0,0,0,0)"
          globeImageUrl="//cdn.jsdelivr.net/npm/three-globe/example/img/earth-blue-marble.jpg"
          bumpImageUrl="//cdn.jsdelivr.net/npm/three-globe/example/img/earth-topology.png"
          showAtmosphere={false}
          onGlobeReady={() => setReady(true)}
          pathsData={pathsData}
          pathPoints={(d: any) => d.pts}
          pathPointLat={(p: any) => p[0]}
          pathPointLng={(p: any) => p[1]}
          pathPointAlt={0.004}
          pathColor={(d: any) => d.color}
          pathStroke={2.2}
          pathResolution={2}
          pathTransitionDuration={0}
          ringsData={rings}
          ringColor={(d: any) => (t: number) => d.color + Math.round((1 - t) * 200).toString(16).padStart(2, "0")}
          ringMaxRadius="maxR"
          ringPropagationSpeed="speed"
          ringRepeatPeriod={1400}
          pointsData={points}
          pointColor="color"
          pointAltitude={0.012}
          pointRadius="r"
        />
      )}
    </div>
  );
}
