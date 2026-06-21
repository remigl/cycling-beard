import { useEffect, useRef, useState } from "react";
import GlobeGL from "react-globe.gl";
import * as THREE from "three";

interface GlobeProps {
  route: [number, number][];        // [lng, lat] — tracé du voyage
  here?: [number, number] | null;   // [lng, lat] — position actuelle
}

export default function Globe({ route, here }: GlobeProps) {
  const globeRef = useRef<any>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    let lastW = 0, lastH = 0;
    const measure = () => {
      if (!wrapRef.current) return;
      const w = wrapRef.current.clientWidth;
      const h = wrapRef.current.clientHeight;
      // On ignore les petits changements de hauteur dus à la barre d'adresse
      // mobile (qui apparaît/disparaît au scroll) : ça évite le redimensionnement
      // saccadé du globe. On ne resize que si la largeur change vraiment.
      if (w !== lastW || Math.abs(h - lastH) > 120) {
        lastW = w; lastH = h;
        setSize({ w, h });
      }
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const hp = here || (route.length ? route[route.length - 1] : [9.18, 47.67]);
  const start = route.length ? route[0] : [-2.21, 47.27];

  // Arcs du tracé : segments consécutifs, sous-échantillonnés
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

  // Anneaux pulsants : départ (sable) + position actuelle (orange, plus gros)
  const rings = [
    { lat: start[1], lng: start[0], maxR: 3, speed: 1.2, color: "#d9c9a8" },
    { lat: hp[1], lng: hp[0], maxR: 5, speed: 2, color: "#E8620A" },
  ];

  // Points lumineux : départ + position
  const points = [
    { lat: start[1], lng: start[0], color: "#d9c9a8", r: 0.4 },
    { lat: hp[1], lng: hp[0], color: "#E8620A", r: 0.7 },
  ];

  useEffect(() => {
    const g = globeRef.current;
    if (!g || !size.w) return;
    const controls = g.controls();
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.55;
    controls.enableZoom = false;
    g.pointOfView({ lat: hp[1], lng: hp[0], altitude: 2.1 }, 0);
    const canvas = wrapRef.current?.querySelector("canvas");
    if (canvas) (canvas as HTMLElement).style.touchAction = "pan-y";
    try { g.renderer().setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); } catch {}

    // ── Jour / nuit + nuages ──────────────────────────────────────────────
    let cleanupExtra = () => {};
    {
      const loader = new THREE.TextureLoader();
      loader.setCrossOrigin("anonymous");
      const base = "//cdn.jsdelivr.net/npm/three-globe/example/img/";
      const dayTex = loader.load(base + "earth-day.jpg");
      const nightTex = loader.load(base + "earth-night.jpg");

      const material = g.globeMaterial();
      if (material) {
        material.onBeforeCompile = (shader: any) => {
          shader.uniforms.dayTexture = { value: dayTex };
          shader.uniforms.nightTexture = { value: nightTex };
          shader.uniforms.sunDirection = { value: new THREE.Vector3(1, 0, 0) };
          material.userData.shader = shader;
          shader.fragmentShader = "uniform sampler2D dayTexture;\nuniform sampler2D nightTexture;\nuniform vec3 sunDirection;\n" + shader.fragmentShader;
          shader.fragmentShader = shader.fragmentShader.replace(
            "#include <map_fragment>",
            `#ifdef USE_MAP
              vec4 dayC = texture2D(dayTexture, vMapUv);
              vec4 nightC = texture2D(nightTexture, vMapUv);
              float intensity = dot(normalize(vNormal), normalize(sunDirection));
              float m = smoothstep(-0.12, 0.25, intensity);
              diffuseColor *= mix(nightC, dayC, m);
            #endif`
          );
        };
        material.needsUpdate = true;
      }

      const updateSun = () => {
        const now = new Date();
        const utcH = now.getUTCHours() + now.getUTCMinutes() / 60;
        const sunLng = 180 - utcH * 15;
        const phi = Math.PI / 2;
        const theta = (90 - sunLng) * Math.PI / 180;
        const dir = new THREE.Vector3(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta));
        const sh = material && material.userData.shader;
        if (sh) sh.uniforms.sunDirection.value.copy(dir);
      };
      updateSun();
      const sunTimer = setInterval(updateSun, 60000);

      // Nuages : sphère légèrement plus grande, semi-transparente, qui tourne
      const R = g.getGlobeRadius();
      const cloudsMat = new THREE.MeshPhongMaterial({
        map: loader.load(base + "clouds.png"),
        transparent: true, opacity: 0.4, depthWrite: false,
      });
      const clouds = new THREE.Mesh(new THREE.SphereGeometry(R * 1.012, 64, 64), cloudsMat);
      g.scene().add(clouds);

      let raf = 0;
      const spin = () => { raf = requestAnimationFrame(spin); clouds.rotation.y += 0.0004; };
      spin();

      cleanupExtra = () => {
        clearInterval(sunTimer);
        cancelAnimationFrame(raf);
        g.scene().remove(clouds);
        cloudsMat.dispose();
      };
    }

    return () => cleanupExtra();
  }, [size.w, size.h, hp[0], hp[1]]);

  return (
    <div ref={wrapRef} className="absolute inset-0 bg-[#FAF9F6]">
      {size.w > 0 && (
        <GlobeGL
          ref={globeRef}
          width={size.w}
          height={size.h}
          backgroundColor="rgba(0,0,0,0)"
          globeImageUrl="//cdn.jsdelivr.net/npm/three-globe/example/img/earth-day.jpg"
          bumpImageUrl="//cdn.jsdelivr.net/npm/three-globe/example/img/earth-topology.png"
          showAtmosphere={true}
          atmosphereColor="#9ec9ff"
          atmosphereAltitude={0.22}
          // ── Tracé : arcs animés qui circulent en boucle (traînée lumineuse) ──
          arcsData={arcs}
          arcColor={() => ["rgba(232,98,10,0)", "#E8620A", "rgba(232,98,10,0)"]}
          arcStroke={0.7}
          arcAltitude={0.12}
          arcDashLength={0.5}
          arcDashGap={1}
          arcDashAnimateTime={3000}
          // ── Anneaux pulsants sur départ + position ──
          ringsData={rings}
          ringColor={(d: any) => (t: number) => {
            const hex = d.color;
            // dégradé d'opacité selon l'expansion de l'anneau
            return hex + Math.round((1 - t) * 200).toString(16).padStart(2, "0");
          }}
          ringMaxRadius="maxR"
          ringPropagationSpeed="speed"
          ringRepeatPeriod={1100}
          // ── Points lumineux ──
          pointsData={points}
          pointColor="color"
          pointAltitude={0.012}
          pointRadius="r"
        />
      )}
    </div>
  );
}
