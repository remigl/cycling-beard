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
  startLabel?: string;
  endLabel?: string;
}

// ── Réglages visuels ──
const DRAW_MS = 4200;          // durée du dessin initial du trajet
const TICK_MS = 40;            // ~25 images/s : fluide et léger
const LINE_ALT = 0.022;        // le tracé flotte AU-DESSUS des nuages (sphère à 0.012)
const SHADOW_ALT = 0.0015;     // son ombre posée au sol → effet de relief
const LONG_LEG_RAD = 0.1;      // ~640 km : au-delà, le trajet (avion, train…) s'élève en arc
const FLOW_MS = 26000;         // vitesse des "comètes" qui indiquent le sens du trajet

type Pt = [number, number, number];   // lat, lng, altitude
type PathDatum = { kind: "shadow" | "line" | "flow"; color: string; pts: Pt[] };

const toRad = Math.PI / 180;
const toVec = (lat: number, lng: number): [number, number, number] => {
  const la = lat * toRad, lo = lng * toRad;
  return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
};
const angDist = (a: [number, number], b: [number, number]) => {
  const va = toVec(a[0], a[1]), vb = toVec(b[0], b[1]);
  return Math.acos(Math.min(1, Math.max(-1, va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2])));
};
// Point intermédiaire sur le grand cercle (t ∈ [0,1])
function slerp(a: [number, number], b: [number, number], t: number): [number, number] {
  const d = angDist(a, b);
  if (d < 1e-9) return a;
  const va = toVec(a[0], a[1]), vb = toVec(b[0], b[1]);
  const s1 = Math.sin((1 - t) * d) / Math.sin(d), s2 = Math.sin(t * d) / Math.sin(d);
  const x = s1 * va[0] + s2 * vb[0], y = s1 * va[1] + s2 * vb[1], z = s1 * va[2] + s2 * vb[2];
  return [Math.atan2(z, Math.hypot(x, y)) / toRad, Math.atan2(y, x) / toRad];
}

// Ajoute l'altitude : tracé au-dessus des nuages, et les longues étapes
// (avion, train de nuit…) forment un arc d'autant plus haut qu'elles sont longues.
function elevate(points: [number, number][]): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (i > 0) {
      const prev = points[i - 1];
      const d = angDist(prev, p);
      if (d > LONG_LEG_RAD) {
        const h = Math.min(0.12, d * 0.16);
        const n = Math.min(48, Math.ceil(d / 0.02));
        for (let k = 1; k < n; k++) {
          const tt = k / n;
          const [la, lo] = slerp(prev, p, tt);
          out.push([la, lo, LINE_ALT + h * Math.sin(Math.PI * tt)]);
        }
      }
    }
    out.push([p[0], p[1], LINE_ALT]);
  }
  return out;
}

export default function Globe({ runs, here, startLabel, endLabel }: GlobeProps) {
  const globeRef = useRef<any>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [ready, setReady] = useState(false);
  const [drawn, setDrawn] = useState(0);   // nombre de points dessinés

  // Taille du conteneur (on ignore les petites variations de hauteur dues à
  // la barre d'adresse mobile, pour ne pas recréer la scène au défilement).
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

  // Trajet en relief (calculé une fois par jeu de données)
  const elevated = useMemo(() => runs.map(r => ({ color: r.color, pts: elevate(r.points) })), [runs]);
  const totalPts = useMemo(() => elevated.reduce((n, r) => n + r.pts.length, 0), [elevated]);

  const firstPt = runs[0]?.points[0];
  const lastRun = runs[runs.length - 1];
  const lastPt = lastRun?.points[lastRun.points.length - 1];
  const start: [number, number] = firstPt ? [firstPt[1], firstPt[0]] : [-2.21, 47.27];
  const hp: [number, number] = here || (lastPt ? [lastPt[1], lastPt[0]] : start);

  // Centre du trajet : moyenne des positions sur la sphère → la caméra s'y
  // place dès l'arrivée, le trajet entier occupe le centre de l'écran.
  const center = useMemo(() => {
    let x = 0, y = 0, z = 0;
    for (const r of runs) for (const [la, lo] of r.points) { const v = toVec(la, lo); x += v[0]; y += v[1]; z += v[2]; }
    if (!x && !y && !z) return { lat: start[1], lng: start[0] };
    return { lat: Math.atan2(z, Math.hypot(x, y)) / toRad, lng: Math.atan2(y, x) / toRad };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runs]);

  // Altitude de caméra : la Terre tient en entier (sur écran en hauteur,
  // c'est la largeur qui limite).
  const camAlt = useMemo(() => {
    const ratio = size.w > 0 ? size.h / size.w : 1;
    return Math.max(2.1, (1 + 2.1) * Math.max(1, ratio) * 0.9 - 1);
  }, [size.w, size.h]);

  const done = drawn >= totalPts;

  // Chemins affichés : ombre au sol + ligne surélevée (+ flux animé à la fin).
  // Les objets des portions terminées restent identiques d'une image à
  // l'autre → seule la portion en cours de dessin est recalculée.
  const fullLines = useMemo<PathDatum[]>(() => elevated.map(r => ({ kind: "line", color: r.color, pts: r.pts })), [elevated]);
  const fullShadows = useMemo<PathDatum[]>(() => elevated.map(r => ({
    kind: "shadow", color: "rgba(0,0,0,0.32)", pts: r.pts.map(p => [p[0], p[1], SHADOW_ALT] as Pt),
  })), [elevated]);
  const flow = useMemo<PathDatum>(() => ({
    kind: "flow", color: "rgba(255,255,255,0.95)",
    pts: elevated.flatMap(r => r.pts).map(p => [p[0], p[1], p[2] + 0.002] as Pt),
  }), [elevated]);

  const pathsData = useMemo<PathDatum[]>(() => {
    if (done) return [...fullShadows, ...fullLines, flow];
    const shadows: PathDatum[] = [], lines: PathDatum[] = [];
    let left = drawn;
    for (let i = 0; i < elevated.length && left > 1; i++) {
      const n = elevated[i].pts.length;
      if (left >= n) { shadows.push(fullShadows[i]); lines.push(fullLines[i]); left -= n; }
      else {
        shadows.push({ ...fullShadows[i], pts: fullShadows[i].pts.slice(0, left) });
        lines.push({ ...fullLines[i], pts: fullLines[i].pts.slice(0, left) });
        left = 0;
      }
    }
    return [...shadows, ...lines];
  }, [drawn, done, elevated, fullLines, fullShadows, flow]);

  // Caméra posée sur le centre du trajet dès que le globe est prêt (avant,
  // la bibliothèque peut encore réinitialiser le point de vue).
  useEffect(() => {
    const g = globeRef.current;
    if (!g || !ready) return;
    try { g.pointOfView({ lat: center.lat, lng: center.lng, altitude: camAlt }, 0); } catch { /* ignoré */ }
  }, [ready, center.lat, center.lng, camAlt]);

  // ── Dessin progressif du trajet, une seule fois ──
  useEffect(() => {
    if (!ready || totalPts === 0) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setDrawn(totalPts); return; }
    setDrawn(0);
    const t0 = performance.now();
    const id = window.setInterval(() => {
      const p = Math.min(1, (performance.now() - t0) / DRAW_MS);
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;   // easeInOut
      setDrawn(Math.max(2, Math.round(e * totalPts)));
      if (p >= 1) window.clearInterval(id);
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [ready, totalPts]);

  // ── Scène : caméra centrée sur le trajet, contrôles, nuages ──
  useEffect(() => {
    const g = globeRef.current;
    if (!g || !size.w) return;
    try {
      const controls = g.controls();
      controls.autoRotate = false;        // le trajet reste au centre
      controls.enableZoom = false;
    } catch { /* ignoré */ }
    try { g.pointOfView({ lat: center.lat, lng: center.lng, altitude: camAlt }, 0); } catch { /* ignoré */ }
    try {
      const canvas = wrapRef.current?.querySelector("canvas");
      if (canvas) (canvas as HTMLElement).style.touchAction = "pan-y";
    } catch { /* ignoré */ }
    try { g.renderer().setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); } catch { /* ignoré */ }

    // Nuages du moment (live-cloud-maps), attachés à la Terre. Plus discrets
    // qu'avant : ils restent SOUS le tracé, qui garde la priorité visuelle.
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
          cloudsMat = new THREE.MeshPhongMaterial({ map: tex, transparent: true, opacity: 0.6, depthWrite: false });
          clouds = new THREE.Mesh(new THREE.SphereGeometry(R * 1.008, 64, 64), cloudsMat);
          clouds.rotation.y = -Math.PI / 2;
          clouds.renderOrder = -1;
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

  // Départ (toujours visible) et arrivée (avec onde, une fois le tracé fini)
  const rings = useMemo(() => [
    { lat: start[1], lng: start[0], maxR: 2.2, speed: 0.8, period: 2600, color: "#FFFFFF" },
    ...(done ? [{ lat: hp[1], lng: hp[0], maxR: 4, speed: 1.6, period: 1400, color: "#E8620A" }] : []),
  ], [done, start[0], start[1], hp[0], hp[1]]);
  const labels = useMemo(() => [
    ...(startLabel ? [{ lat: start[1], lng: start[0], text: startLabel, color: "#FFFFFF" }] : []),
    ...(done && endLabel ? [{ lat: hp[1], lng: hp[0], text: endLabel, color: "#FFB27A" }] : []),
  ], [done, startLabel, endLabel, start[0], start[1], hp[0], hp[1]]);

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
          pathPointAlt={(p: any) => p[2]}
          pathColor={(d: any) => d.color}
          pathStroke={(d: any) => (d.kind === "line" ? 3 : d.kind === "shadow" ? 2.6 : 1.6)}
          pathDashLength={(d: any) => (d.kind === "flow" ? 0.006 : 1)}
          pathDashGap={(d: any) => (d.kind === "flow" ? 0.03 : 0)}
          pathDashAnimateTime={(d: any) => (d.kind === "flow" ? FLOW_MS : 0)}
          pathResolution={2}
          pathTransitionDuration={0}
          ringsData={rings}
          ringColor={(d: any) => (t: number) => d.color + Math.round((1 - t) * 200).toString(16).padStart(2, "0")}
          ringMaxRadius="maxR"
          ringPropagationSpeed="speed"
          ringRepeatPeriod={(d: any) => d.period}
          ringAltitude={LINE_ALT}
          labelsData={labels}
          labelText="text"
          labelColor="color"
          labelSize={1.3}
          labelDotRadius={0.45}
          labelAltitude={LINE_ALT + 0.004}
          labelResolution={2}
        />
      )}
    </div>
  );
}
