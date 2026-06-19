import { useEffect, useRef, useState } from "react";

interface GlobeProps {
  // Tracé complet en [lng, lat] (concaténation des segments GPX de toutes les étapes)
  route: [number, number][];
  // Position actuelle [lng, lat] (dernier point), pour le marqueur pulsant
  here?: [number, number] | null;
}

// Charge Three.js depuis le CDN une seule fois (évite d'alourdir le bundle React).
let threePromise: Promise<any> | null = null;
function loadThree(): Promise<any> {
  if ((window as any).THREE) return Promise.resolve((window as any).THREE);
  if (threePromise) return threePromise;
  threePromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
    s.onload = () => resolve((window as any).THREE);
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return threePromise;
}

export default function Globe({ route, here }: GlobeProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let renderer: any, frame = 0, disposed = false;

    loadThree().then((THREE) => {
      if (disposed || !wrapRef.current) return;
      const wrap = wrapRef.current;
      const W = () => wrap.clientWidth, H = () => wrap.clientHeight;
      const BRAND = 0xe8620a, SAND = 0xd9c9a8;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(45, W() / H(), 0.1, 100);
      camera.position.set(0, 0, 3.1);

      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(W(), H());
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      wrap.appendChild(renderer.domElement);

      const globe = new THREE.Group();
      scene.add(globe);
      const R = 1;

      // Sphère sombre mate
      globe.add(new THREE.Mesh(
        new THREE.SphereGeometry(R, 64, 64),
        new THREE.MeshPhongMaterial({ color: 0x121622, emissive: 0x0a0d16, shininess: 6, specular: 0x223044 })
      ));

      // Halo atmosphérique
      globe.add(new THREE.Mesh(
        new THREE.SphereGeometry(R * 1.16, 64, 64),
        new THREE.ShaderMaterial({
          transparent: true, side: THREE.BackSide, blending: THREE.AdditiveBlending,
          uniforms: { c: { value: new THREE.Color(0x2a6b73) } },
          vertexShader: `varying vec3 vN;void main(){vN=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
          fragmentShader: `varying vec3 vN;uniform vec3 c;void main(){float i=pow(.62-dot(vN,vec3(0,0,1.)),3.);gl_FragColor=vec4(c,1.)*i;}`,
        })
      ));

      const lle = (lon: number, lat: number, r: number) => {
        const p = (90 - lat) * Math.PI / 180, t = (lon + 180) * Math.PI / 180;
        return new THREE.Vector3(-r * Math.sin(p) * Math.cos(t), r * Math.cos(p), r * Math.sin(p) * Math.sin(t));
      };

      // Constellation de points (villes du monde)
      const dp: number[] = [];
      for (let i = 0; i < 1400; i++) {
        const lat = Math.random() * 180 - 90, lon = Math.random() * 360 - 180;
        const v = lle(lon, lat, R * 1.003); dp.push(v.x, v.y, v.z);
      }
      const dotsGeo = new THREE.BufferGeometry();
      dotsGeo.setAttribute("position", new THREE.Float32BufferAttribute(dp, 3));
      globe.add(new THREE.Points(dotsGeo, new THREE.PointsMaterial({ color: SAND, size: 0.008, transparent: true, opacity: 0.35 })));

      // Tracé : arcs surélevés entre points consécutifs
      const pts = (route && route.length > 1) ? route : [[-2.2, 47.27], [9.18, 47.67]] as [number, number][];
      // Sous-échantillonne si trop de points (perf + lisibilité)
      const step = Math.max(1, Math.floor(pts.length / 60));
      const sampled = pts.filter((_, i) => i % step === 0 || i === pts.length - 1);
      for (let i = 0; i < sampled.length - 1; i++) {
        const a = sampled[i], b = sampled[i + 1];
        const va = lle(a[0], a[1], R), vb = lle(b[0], b[1], R);
        const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const lift = Math.min(0.03 + d * 0.01, 0.1);
        const mid = va.clone().add(vb).multiplyScalar(0.5).normalize().multiplyScalar(R * (1 + lift));
        const curve = new THREE.QuadraticBezierCurve3(va.clone().multiplyScalar(1.005), mid, vb.clone().multiplyScalar(1.005));
        const g = new THREE.BufferGeometry().setFromPoints(curve.getPoints(30));
        globe.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: BRAND, transparent: true, opacity: 0.95 })));
      }

      // Marqueurs départ + position actuelle
      const start = sampled[0];
      const mk = (lon: number, lat: number, color: number, size: number) => {
        const m = new THREE.Mesh(new THREE.SphereGeometry(size, 16, 16), new THREE.MeshBasicMaterial({ color }));
        m.position.copy(lle(lon, lat, R * 1.01)); return m;
      };
      globe.add(mk(start[0], start[1], SAND, 0.012));
      const hp = here || sampled[sampled.length - 1];
      const hereMesh = mk(hp[0], hp[1], BRAND, 0.016);
      globe.add(hereMesh);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.02, 0.028, 32),
        new THREE.MeshBasicMaterial({ color: BRAND, transparent: true, side: THREE.DoubleSide })
      );
      ring.position.copy(hereMesh.position);
      ring.lookAt(hereMesh.position.clone().multiplyScalar(2));
      globe.add(ring);

      // Lumières
      scene.add(new THREE.AmbientLight(0x335577, 0.6));
      const dir = new THREE.DirectionalLight(0xffffff, 1.1);
      dir.position.set(-3, 2, 4); scene.add(dir);

      // Oriente vers la position actuelle (centre le tracé)
      globe.rotation.y = -(hp[0] + 180) * Math.PI / 180 + Math.PI;
      globe.rotation.x = 0.45;

      // Interaction
      let drag = false, px = 0, py = 0;
      const dom = renderer.domElement;
      const getT = (e: any) => (e.touches ? e.touches[0] : e);
      const down = (e: any) => { drag = true; const t = getT(e); px = t.clientX; py = t.clientY; };
      const move = (e: any) => {
        if (!drag) return; const t = getT(e);
        globe.rotation.y += (t.clientX - px) * 0.005;
        globe.rotation.x += (t.clientY - py) * 0.005;
        globe.rotation.x = Math.max(-1.2, Math.min(1.2, globe.rotation.x));
        px = t.clientX; py = t.clientY;
      };
      const up = () => { drag = false; };
      dom.addEventListener("mousedown", down); dom.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
      dom.addEventListener("touchstart", down, { passive: true }); dom.addEventListener("touchmove", move, { passive: true }); window.addEventListener("touchend", up);

      let t = 0;
      const loop = () => {
        frame = requestAnimationFrame(loop); t += 0.016;
        if (!drag) globe.rotation.y += 0.0015;
        const s = 1 + Math.sin(t * 2.5) * 0.25; ring.scale.set(s, s, s);
        ring.material.opacity = 0.7 - (s - 0.75) * 0.6;
        renderer.render(scene, camera);
      };
      loop();
      setReady(true);

      const onResize = () => { camera.aspect = W() / H(); camera.updateProjectionMatrix(); renderer.setSize(W(), H()); };
      window.addEventListener("resize", onResize);

      (renderer as any)._cleanup = () => {
        cancelAnimationFrame(frame);
        window.removeEventListener("resize", onResize);
        window.removeEventListener("mouseup", up); window.removeEventListener("touchend", up);
        dom.remove();
      };
    }).catch(() => {/* CDN indispo : on laisse le fond sombre */});

    return () => {
      disposed = true;
      if (renderer && (renderer as any)._cleanup) (renderer as any)._cleanup();
    };
  }, [route, here]);

  return (
    <div className="absolute inset-0 bg-[#0a0a0f]">
      <div ref={wrapRef} className="absolute inset-0" />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-brand-sand/30 border-t-brand-sand animate-spin" />
        </div>
      )}
    </div>
  );
}
