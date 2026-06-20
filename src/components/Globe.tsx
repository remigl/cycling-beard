import { useEffect, useRef, useState } from "react";
import GlobeGL from "react-globe.gl";
import * as THREE from "three";

interface GlobeProps {
  route: [number, number][];        // [lng, lat] — tracé du voyage
  here?: [number, number] | null;   // [lng, lat] — position actuelle
}

export default function Globe({ route, here }: GlobeProps) {
  const globeRef = useRef<any>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Dimensionne le globe à son conteneur
  useEffect(() => {
    const measure = () => {
      if (wrapRef.current) {
        setSize({ w: wrapRef.current.clientWidth, h: wrapRef.current.clientHeight });
      }
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // Construit les "arcs" du tracé pour globe.gl (segments consécutifs)
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

  const hp = here || (route.length ? route[route.length - 1] : [9.18, 47.67]);

  // Point de position actuelle (orange pulsant via globe.gl points)
  const points = [{ lat: hp[1], lng: hp[0], size: 0.5, color: "#E8620A" }];

  // ── Cycliste : sprite tangent à la surface, animé le long d'un grand cercle ──
  useEffect(() => {
    const g = globeRef.current;
    if (!g || !size.w) return;

    // Auto-rotation douce
    const controls = g.controls();
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.6;
    controls.enableZoom = false;

    // Point de vue initial : centré sur la position actuelle
    g.pointOfView({ lat: hp[1], lng: hp[0], altitude: 2.2 }, 0);

    // Crée le sprite cycliste (emoji rendu sur un canvas → texture)
    const scene = g.scene();
    const R = g.getGlobeRadius();

    const makeEmojiSprite = (emoji: string) => {
      const c = document.createElement("canvas"); c.width = c.height = 128;
      const cx = c.getContext("2d")!;
      cx.font = "96px serif"; cx.textAlign = "center"; cx.textBaseline = "middle";
      cx.fillText(emoji, 64, 70);
      const tex = new THREE.CanvasTexture(c);
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
      const sp = new THREE.Sprite(mat);
      sp.scale.set(R * 0.18, R * 0.18, 1);
      return { sp, tex, mat };
    };

    const bike = makeEmojiSprite("🚴");
    const wave = makeEmojiSprite("🧔");
    scene.add(bike.sp);
    scene.add(wave.sp);

    // Conversion lat/lng → position 3D sur la sphère (repère de globe.gl)
    const toVec = (lat: number, lng: number, alt: number) => {
      const phi = (90 - lat) * Math.PI / 180;
      const theta = (90 - lng) * Math.PI / 180;
      const r = R * (1 + alt);
      return new THREE.Vector3(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi),
        r * Math.sin(phi) * Math.sin(theta)
      );
    };

    let raf = 0, tt = 0;
    let waving = false, pause = 0, nextPause = 3 + Math.random() * 3;
    let angle = 0;
    const orbitLat = hp[1];   // suit la latitude de la position actuelle

    const animate = () => {
      raf = requestAnimationFrame(animate);
      tt += 0.016;
      if (pause > 0) {
        pause -= 0.016;
        if (pause <= 0) waving = false;
      } else {
        angle += 0.25 * 0.016 * 60 * 0.016; // avance le long du parallèle
        if (tt >= nextPause) { waving = true; pause = 1.8; nextPause = tt + 4 + Math.random() * 4; }
      }
      const lng = (angle * 180 / Math.PI) % 360 - 180;
      const pos = toVec(orbitLat, lng, 0.04);
      const active = waving ? wave.sp : bike.sp;
      const hidden = waving ? bike.sp : wave.sp;
      active.position.copy(pos);
      hidden.position.set(9999, 9999, 9999); // cache l'autre
      const bob = waving ? 0 : Math.sin(tt * 12) * R * 0.01;
      active.position.y += bob;
      active.visible = true; hidden.visible = false;
    };
    animate();

    return () => {
      cancelAnimationFrame(raf);
      scene.remove(bike.sp); scene.remove(wave.sp);
      bike.tex.dispose(); bike.mat.dispose(); wave.tex.dispose(); wave.mat.dispose();
    };
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
          atmosphereColor="#6bb6ff"
          atmosphereAltitude={0.18}
          arcsData={arcs}
          arcColor={() => "#E8620A"}
          arcStroke={0.6}
          arcAltitudeAutoScale={0.3}
          arcsTransitionDuration={0}
          pointsData={points}
          pointColor="color"
          pointAltitude={0.01}
          pointRadius={0.6}
        />
      )}
    </div>
  );
}
