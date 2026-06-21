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
      if (!wrapRef.current) return;
      const w = wrapRef.current.clientWidth;
      const h = wrapRef.current.clientHeight;
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
    if (!g || !size.w) return;

    try {
      const controls = g.controls();
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.55;
      controls.enableZoom = false;
    } catch {}
    try { g.pointOfView({ lat: hp[1], lng: hp[0], altitude: 2.1 }, 0); } catch {}
    try {
      const canvas = wrapRef.current?.querySelector("canvas");
      if (canvas) (canvas as HTMLElement).style.touchAction = "pan-y";
    } catch {}
    try { g.renderer().setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); } catch {}

    // ── Nuages + jour/nuit ──
    let raf = 0, clouds: any = null, cloudsMat: any = null, cancelled = false;
    let sunTimer: any = null;
    let tries = 0;
    const setup = () => {
      if (cancelled) return;
      tries++;
      let scene: any = null, R = 100, material: any = null;
      try { scene = g.scene(); } catch {}
      try { R = g.getGlobeRadius(); } catch {}
      try { material = g.globeMaterial && g.globeMaterial(); } catch {}
      // On attend que la scène ET le matériau soient prêts (jusqu'à ~4s)
      if ((!scene || !material) && tries < 20) { setTimeout(setup, 200); return; }
      if (!scene) { setDbg("no scene"); return; }
      setDbg(`scene=ok material=${material ? "OK" : "null"} R=${Math.round(R)}`);

      const loader = new THREE.TextureLoader();
      loader.setCrossOrigin("anonymous");

      // ── Jour / nuit ──
      if (material) {
        try {
          const dayTex = loader.load("//cdn.jsdelivr.net/npm/three-globe/example/img/earth-day.jpg");
          const nightTex = loader.load("//cdn.jsdelivr.net/npm/three-globe/example/img/earth-night.jpg");
          material.onBeforeCompile = (shader: any) => {
            shader.uniforms.dayTexture = { value: dayTex };
            shader.uniforms.nightTexture = { value: nightTex };
            shader.uniforms.sunDirection = { value: new THREE.Vector3(1, 0, 0) };
            material.userData.shader = shader;
            const uvVar = shader.fragmentShader.includes("vMapUv") ? "vMapUv" : "vUv";
            const hasMarker = shader.fragmentShader.includes("#include <map_fragment>");
            setDbg(d => d + ` | shader uv=${uvVar} marker=${hasMarker}`);
            shader.fragmentShader = "uniform sampler2D dayTexture;\nuniform sampler2D nightTexture;\nuniform vec3 sunDirection;\n" + shader.fragmentShader;
            if (hasMarker) {
              shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>",
                `#ifdef USE_MAP
                  vec4 dayC = texture2D(dayTexture, ${uvVar});
                  vec4 nightC = texture2D(nightTexture, ${uvVar});
                  float ii = dot(normalize(vNormal), normalize(sunDirection));
                  diffuseColor *= mix(nightC, dayC, smoothstep(-0.12, 0.25, ii));
                #endif`);
            }
          };
          material.needsUpdate = true;
          const updateSun = () => {
            try {
              const now = new Date();
              const utcH = now.getUTCHours() + now.getUTCMinutes() / 60;
              const theta = (90 - (180 - utcH * 15)) * Math.PI / 180;
              const sh = material.userData.shader;
              if (sh) sh.uniforms.sunDirection.value.set(Math.cos(theta), 0, Math.sin(theta));
            } catch {}
          };
          updateSun();
          sunTimer = setInterval(updateSun, 60000);
        } catch (e: any) { setDbg(d => d + " | daynight-ERR:" + (e?.message || "?")); }
      }

      // ── Nuages temps réel ──
      try {
        loader.load(
          "https://clouds.matteason.co.uk/images/2048x1024/clouds-alpha.png",
          (tex) => {
            if (cancelled) return;
            cloudsMat = new THREE.MeshPhongMaterial({ map: tex, transparent: true, opacity: 0.85, depthWrite: false });
            clouds = new THREE.Mesh(new THREE.SphereGeometry(R * 1.012, 75, 75), cloudsMat);
            scene.add(clouds);
            const spin = () => { raf = requestAnimationFrame(spin); if (clouds) clouds.rotation.y += 0.0004; };
            spin();
          }
        );
      } catch {}
    };
    setup();

    return () => {
      cancelled = true;
      try { if (sunTimer) clearInterval(sunTimer); } catch {}
      try { cancelAnimationFrame(raf); } catch {}
      try { if (clouds) g.scene().remove(clouds); } catch {}
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
