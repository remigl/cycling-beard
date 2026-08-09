import { useEffect, useRef, useState } from "react";
import GlobeGL from "react-globe.gl";
import * as THREE from "three";

interface GlobeProps {
  route: [number, number][];        // [lng, lat]
  here?: [number, number] | null;   // [lng, lat]
}

export default function Globe({ route, here }: GlobeProps) {
  const globeRef = useRef<any>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [dbg, setDbg] = useState("init");

  useEffect(() => {
    let lastW = 0, lastH = 0;
    const measure = () => {
      if (!wrapRef.current) { setDbg("pas de wrapRef"); return; }
      const w = wrapRef.current.clientWidth;
      const h = wrapRef.current.clientHeight;
      setDbg(`mesuré w=${w} h=${h}`);
      if (w !== lastW || Math.abs(h - lastH) > 120) { lastW = w; lastH = h; setSize({ w, h }); }
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const hp = here || (route.length ? route[route.length - 1] : [9.18, 47.67]);
  const start = route.length ? route[0] : [-2.21, 47.27];

  const arcs = (() => {
    const pts = route && route.length > 1 ? route : [];
    const out: any[] = [];
    const step = Math.max(1, Math.floor(pts.length / 120));
    const s = pts.filter((_, i) => i % step === 0 || i === pts.length - 1);
    for (let i = 0; i < s.length - 1; i++) {
      out.push({ startLat: s[i][1], startLng: s[i][0], endLat: s[i + 1][1], endLng: s[i + 1][0] });
    }
    return out;
  })();

  const rings = [
    { lat: start[1], lng: start[0], maxR: 3, speed: 1.2, color: "#d9c9a8" },
    { lat: hp[1], lng: hp[0], maxR: 5, speed: 2, color: "#E8620A" },
  ];
  const points = [
    { lat: start[1], lng: start[0], color: "#d9c9a8", r: 0.4 },
    { lat: hp[1], lng: hp[0], color: "#E8620A", r: 0.7 },
  ];

  useEffect(() => {
    const g = globeRef.current;
    if (!g || !size.w) { setDbg(d => d + ` | g=${!!g}`); return; }

    // Diagnostic profond : le ref existe, mais est-ce que tout est vraiment prêt ?
    try {
      const canvas = wrapRef.current?.querySelector("canvas") as HTMLCanvasElement | null;
      let rendererOk = false, webglOk = false, drawBufW = 0, drawBufH = 0;
      try {
        const renderer = g.renderer();
        rendererOk = !!renderer;
        const gl = renderer?.getContext ? renderer.getContext() : null;
        webglOk = !!gl;
        if (gl && gl.drawingBufferWidth) { drawBufW = gl.drawingBufferWidth; drawBufH = gl.drawingBufferHeight; }
      } catch {}
      const cssW = canvas?.clientWidth ?? -1, cssH = canvas?.clientHeight ?? -1;
      const attrW = canvas?.width ?? -1, attrH = canvas?.height ?? -1;
      setDbg(`css=${cssW}x${cssH} attr=${attrW}x${attrH} buf=${drawBufW}x${drawBufH} r=${rendererOk} gl=${webglOk}`);

      // Test de chargement de la texture Terre, indépendamment de react-globe.gl
      const testImg = new Image();
      testImg.crossOrigin = "anonymous";
      testImg.onload = () => setDbg(d => d + " | texture=OK");
      testImg.onerror = () => setDbg(d => d + " | texture=ÉCHEC");
      testImg.src = "https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-blue-marble.jpg";
    } catch (e: any) {
      setDbg(d => d + ` | diag-ERR:${e?.message}`);
    }

    try {
      const controls = g.controls();
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.55;
      controls.enableZoom = false;
    } catch (e: any) { setDbg(d => d + ` | controls-ERR:${e?.message}`); }
    try { g.pointOfView({ lat: hp[1], lng: hp[0], altitude: 2.1 }, 0); } catch (e: any) { setDbg(d => d + ` | pov-ERR:${e?.message}`); }
    try {
      const canvas = wrapRef.current?.querySelector("canvas");
      if (canvas) (canvas as HTMLElement).style.touchAction = "pan-y";
    } catch {}
    try { g.renderer().setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); } catch (e: any) { setDbg(d => d + ` | pixelratio-ERR:${e?.message}`); }

    // ── Nuages en temps réel (couverture nuageuse mondiale du moment) ──
    // Attachés à la Terre → ils tournent avec elle et restent à leur vraie
    // position géographique. Source : live-cloud-maps (maj ~toutes les 3h).
    let clouds: any = null, cloudsMat: any = null, cancelled = false, tries = 0;
    const setup = () => {
      if (cancelled) return;
      tries++;
      let scene: any = null, R = 100;
      try { scene = g.scene(); } catch {}
      try { R = g.getGlobeRadius(); } catch {}
      if (!scene && tries < 20) { setTimeout(setup, 200); return; }
      if (!scene) return;
      try {
        const loader = new THREE.TextureLoader();
        loader.setCrossOrigin("anonymous");
        loader.load(
          "https://clouds.matteason.co.uk/images/2048x1024/clouds-alpha.png",
          (tex) => {
            if (cancelled) return;
            cloudsMat = new THREE.MeshPhongMaterial({ map: tex, transparent: true, opacity: 0.85, depthWrite: false });
            clouds = new THREE.Mesh(new THREE.SphereGeometry(R * 1.012, 75, 75), cloudsMat);
            clouds.rotation.y = -Math.PI / 2; // aligne sur la géographie de la Terre
            let attached = false;
            try {
              const globeObj = (scene.children || []).find((c: any) =>
                c && c.type === "Group" && typeof c.globeImageUrl === "function");
              if (globeObj) { globeObj.add(clouds); attached = true; }
            } catch {}
            if (!attached) scene.add(clouds);
          }
        );
      } catch {}
    };
    setup();

    return () => {
      cancelled = true;
      try { if (clouds && clouds.parent) clouds.parent.remove(clouds); } catch {}
      try { if (cloudsMat) cloudsMat.dispose(); } catch {}
    };
  }, [size.w, size.h, hp[0], hp[1]]);

  return (
    <div ref={wrapRef} className="absolute inset-0 bg-[#FAF9F6]">
      <div className="absolute bottom-1 left-1 z-50 text-[8px] font-mono text-black/60 bg-white/70 px-1 rounded max-w-[92%] break-all">{dbg}</div>
      {size.w > 0 && (
        <GlobeGL
          ref={globeRef}
          width={size.w}
          height={size.h}
          backgroundColor="rgba(0,0,0,0)"
          globeImageUrl="//cdn.jsdelivr.net/npm/three-globe/example/img/earth-blue-marble.jpg"
          bumpImageUrl="//cdn.jsdelivr.net/npm/three-globe/example/img/earth-topology.png"
          showAtmosphere={true}
          atmosphereColor="#9ec9ff"
          atmosphereAltitude={0.22}
          arcsData={arcs}
          arcColor={() => ["rgba(232,98,10,0)", "#E8620A", "rgba(232,98,10,0)"]}
          arcStroke={0.7}
          arcAltitude={0.12}
          arcDashLength={0.5}
          arcDashGap={1}
          arcDashAnimateTime={3000}
          ringsData={rings}
          ringColor={(d: any) => (t: number) => d.color + Math.round((1 - t) * 200).toString(16).padStart(2, "0")}
          ringMaxRadius="maxR"
          ringPropagationSpeed="speed"
          ringRepeatPeriod={1100}
          pointsData={points}
          pointColor="color"
          pointAltitude={0.012}
          pointRadius="r"
        />
      )}
    </div>
  );
}
