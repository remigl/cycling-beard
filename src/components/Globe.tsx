import { useEffect, useRef, useState } from "react";
import GlobeGL from "react-globe.gl";

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
    g.pointOfView({ lat: hp[1], lng: hp[0], altitude: 2.2 }, 0);
    // Laisse le scroll vertical de la page passer : le doigt qui glisse vers le
    // haut/bas fait défiler, seul le glissement horizontal tourne le globe.
    const canvas = wrapRef.current?.querySelector("canvas");
    if (canvas) (canvas as HTMLElement).style.touchAction = "pan-y";
  }, [size.w, size.h, hp[0], hp[1]]);

  return (
    <div ref={wrapRef} className="absolute inset-0 bg-[#FAF9F6]">
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
