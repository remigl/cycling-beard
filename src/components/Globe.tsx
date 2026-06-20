import { useEffect, useRef, useState } from "react";

interface GlobeProps {
  route: [number, number][];        // [lng, lat]
  here?: [number, number] | null;   // [lng, lat]
}

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
      const BRAND = 0xe8620a, TEAL = 0x2a6b73;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(45, W() / H(), 0.1, 100);
      camera.position.set(0, 0, 3.0);

      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(W(), H());
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      wrap.appendChild(renderer.domElement);

      const globe = new THREE.Group();
      scene.add(globe);
      const R = 1;

      const lle = (lon, lat, r) => {
        const p = (90 - lat) * Math.PI / 180, t = (lon + 180) * Math.PI / 180;
        return new THREE.Vector3(-r * Math.sin(p) * Math.cos(t), r * Math.cos(p), r * Math.sin(p) * Math.sin(t));
      };

      // Texture Terre dessinée sur canvas : océan teal pâle + continents sable foncé
      const texCanvas = document.createElement("canvas");
      texCanvas.width = 2048; texCanvas.height = 1024;
      const ctx = texCanvas.getContext("2d");
      ctx.fillStyle = "#bfe0e3"; ctx.fillRect(0, 0, 2048, 1024);
      const tex = new THREE.CanvasTexture(texCanvas);
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        ctx.drawImage(img, 0, 0, 2048, 1024);
        ctx.globalCompositeOperation = "source-in";
        ctx.fillStyle = "#c9a86a"; ctx.fillRect(0, 0, 2048, 1024);
        ctx.globalCompositeOperation = "source-over";
        tex.needsUpdate = true;
      };
      img.src = "https://unpkg.com/three-globe/example/img/earth-topology.png";

      globe.add(new THREE.Mesh(
        new THREE.SphereGeometry(R, 64, 64),
        new THREE.MeshPhongMaterial({ map: tex, shininess: 8, specular: 0x335555 })
      ));

      globe.add(new THREE.Mesh(
        new THREE.SphereGeometry(R * 1.14, 64, 64),
        new THREE.ShaderMaterial({
          transparent: true, side: THREE.BackSide, blending: THREE.AdditiveBlending,
          uniforms: { c: { value: new THREE.Color(0x2a6b73) } },
          vertexShader: "varying vec3 vN;void main(){vN=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
          fragmentShader: "varying vec3 vN;uniform vec3 c;void main(){float i=pow(.55-dot(vN,vec3(0,0,1.)),3.);gl_FragColor=vec4(c,1.)*i*.7;}",
        })
      ));

      const pts = (route && route.length > 1) ? route : [[-2.2, 47.27], [9.18, 47.67]];
      const step = Math.max(1, Math.floor(pts.length / 80));
      const sampled = pts.filter((_, i) => i % step === 0 || i === pts.length - 1);
      const path3d = [];
      for (let i = 0; i < sampled.length - 1; i++) {
        const a = sampled[i], b = sampled[i + 1];
        const va = lle(a[0], a[1], R), vb = lle(b[0], b[1], R);
        const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const lift = Math.min(0.02 + d * 0.008, 0.07);
        const mid = va.clone().add(vb).multiplyScalar(0.5).normalize().multiplyScalar(R * (1 + lift));
        const curve = new THREE.QuadraticBezierCurve3(va.clone().multiplyScalar(1.004), mid, vb.clone().multiplyScalar(1.004));
        curve.getPoints(24).forEach((p) => path3d.push(p));
      }
      if (path3d.length > 1) {
        const core = new THREE.CatmullRomCurve3(path3d);
        globe.add(new THREE.Mesh(new THREE.TubeGeometry(core, path3d.length, 0.013, 8, false),
          new THREE.MeshBasicMaterial({ color: BRAND, transparent: true, opacity: 0.22 })));
        globe.add(new THREE.Mesh(new THREE.TubeGeometry(core, path3d.length, 0.006, 8, false),
          new THREE.MeshBasicMaterial({ color: BRAND })));
      }

      const mk = (lon, lat, color, size) => {
        const m = new THREE.Mesh(new THREE.SphereGeometry(size, 16, 16), new THREE.MeshBasicMaterial({ color }));
        m.position.copy(lle(lon, lat, R * 1.012)); return m;
      };
      const start = sampled[0];
      globe.add(mk(start[0], start[1], TEAL, 0.014));
      const hp = here || sampled[sampled.length - 1];
      const hereMesh = mk(hp[0], hp[1], BRAND, 0.018);
      globe.add(hereMesh);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.024, 0.034, 32),
        new THREE.MeshBasicMaterial({ color: BRAND, transparent: true, side: THREE.DoubleSide }));
      ring.position.copy(hereMesh.position);
      ring.lookAt(hereMesh.position.clone().multiplyScalar(2));
      globe.add(ring);

      scene.add(new THREE.AmbientLight(0xffffff, 0.85));
      const dir = new THREE.DirectionalLight(0xffffff, 0.9);
      dir.position.set(-2, 1.5, 3.5); scene.add(dir);

      globe.rotation.y = -(hp[0] + 180) * Math.PI / 180 + Math.PI;
      globe.rotation.x = 0.45;

      let drag = false, px = 0, py = 0;
      const dom = renderer.domElement;
      const getT = (e) => (e.touches ? e.touches[0] : e);
      const down = (e) => { drag = true; const t = getT(e); px = t.clientX; py = t.clientY; };
      const move = (e) => {
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
        const s = 1 + Math.sin(t * 2.5) * 0.22; ring.scale.set(s, s, s);
        ring.material.opacity = 0.75 - (s - 0.78) * 0.6;
        renderer.render(scene, camera);
      };
      loop();
      setReady(true);

      const onResize = () => { camera.aspect = W() / H(); camera.updateProjectionMatrix(); renderer.setSize(W(), H()); };
      window.addEventListener("resize", onResize);

      renderer._cleanup = () => {
        cancelAnimationFrame(frame);
        window.removeEventListener("resize", onResize);
        window.removeEventListener("mouseup", up); window.removeEventListener("touchend", up);
        dom.remove();
      };
    }).catch(() => {});

    return () => {
      disposed = true;
      if (renderer && renderer._cleanup) renderer._cleanup();
    };
  }, [route, here]);

  return (
    <div className="absolute inset-0 bg-[#FAF9F6]">
      <div ref={wrapRef} className="absolute inset-0" />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-brand-sand/30 border-t-brand-sand animate-spin" />
        </div>
      )}
    </div>
  );
}
