import { X } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { TripSummary } from "../types";
import { Lang } from "../i18n";
import StageDetailView from "./StageDetailView";

interface MapViewProps {
  onNavigate: (tab: string, arg?: string) => void;
  trips: TripSummary[];
  t: (key: string) => string;
  lang: Lang;
}

// Charge Leaflet dynamiquement (CSS + JS) depuis le CDN
function useLeaflet() {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if ((window as any).L) { setLoaded(true); return; }

    // CSS
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(css);

    // JS
    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = () => setLoaded(true);
    document.body.appendChild(script);
  }, []);
  return loaded;
}

export default function MapView({ onNavigate, trips, t, lang }: MapViewProps) {
  const leafletLoaded = useLeaflet();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const hasFittedRef = useRef(false);
  // Étape sélectionnée à afficher en popup plein écran par-dessus la carte
  const [popupTrip, setPopupTrip] = useState<TripSummary | null>(null);
  // Hauteur figée au chargement → la carte ne saute plus quand la barre d'adresse
  // mobile apparaît/disparaît, et tout (header + carte + bas) tient sans scroll.
  const [vh, setVh] = useState<number | null>(null);
  useEffect(() => { setVh(window.innerHeight); }, []);
  // Référence pour que les popups Leaflet (HTML brut) puissent déclencher React
  const setPopupTripRef = useRef(setPopupTrip);
  setPopupTripRef.current = setPopupTrip;

  const tripsWithTrack = trips.filter(t =>
    (t.track && t.track.length > 0) || (t.segments && t.segments.length > 0)
  );
  const tripsWithCoords = trips.filter(t =>
    t.mapLat != null && t.mapLng != null && !isNaN(t.mapLat) && !isNaN(t.mapLng)
  );

  useEffect(() => {
    if (!leafletLoaded || !mapContainerRef.current) return;
    const L = (window as any).L;

    // Init map once
    if (!mapRef.current) {
      mapRef.current = L.map(mapContainerRef.current, {
        zoomControl: true,
        scrollWheelZoom: true,
      }).setView([47.0, 2.0], 6);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '© OpenStreetMap',
        maxZoom: 19,
      }).addTo(mapRef.current);

      // Pane dédié pour les marques photo, sous les panes par défaut de Leaflet
      // (markerPane=600, overlayPane=400 pour les circleMarker) : garantit que
      // les marqueurs d'étape restent TOUJOURS au-dessus des marques photo,
      // même en cas de chevauchement exact.
      const photoPane = mapRef.current.createPane("photoMarkers");
      photoPane.style.zIndex = "350";

      // Délégation : clic sur le bouton "Voir l'étape" dans une bulle Leaflet
      mapRef.current.getContainer().addEventListener("click", (e: any) => {
        const btn = e.target.closest("[data-stage-slug]");
        if (btn) {
          const slug = btn.getAttribute("data-stage-slug");
          const trip = trips.find(tr => tr.slug === slug);
          if (trip) setPopupTripRef.current(trip);
        }
      });
    }

    const map = mapRef.current;

    // Clear previous layers (except tiles)
    map.eachLayer((layer: any) => {
      if (layer.options && layer.options.attribution) return; // garde les tuiles
      map.removeLayer(layer);
    });

    const allBounds: any[] = [];

    // Construit le HTML d'une bulle avec bouton "Voir l'étape"
    const popupHtml = (trip: TripSummary) => {
      // Galerie : grille 3×3 (jusqu'à 9 vignettes), sans doublon.
      // On dédoublonne sur le NOM DE FICHIER (deux variantes/tailles de la même
      // image ont des URLs différentes mais le même fichier de base).
      const baseName = (url: string) => {
        const clean = url.split("?")[0].split("#")[0];
        return clean.substring(clean.lastIndexOf("/") + 1).toLowerCase();
      };
      const seenNames = new Set<string>();
      const thumbs: string[] = [];
      for (const p of (trip.photos || [])) {
        if (!p.thumb) continue;
        const key = baseName(p.thumb);
        if (seenNames.has(key)) continue;
        seenNames.add(key);
        thumbs.push(p.thumb);
        if (thumbs.length >= 9) break;
      }
      if (thumbs.length === 0 && trip.thumbnail) thumbs.push(trip.thumbnail);
      // Description : version traduite si dispo, sinon shortDescription
      const desc = (trip.translations?.[lang]?.summary || trip.shortDescription || "").trim();
      const descShort = desc.length > 110 ? desc.slice(0, 107) + "…" : desc;

      let gallery = "";
      if (thumbs.length === 1) {
        gallery = `<img src="${thumbs[0]}" referrerpolicy="no-referrer"
          style="width:100%;height:96px;object-fit:cover;border-radius:6px;margin-bottom:8px;display:block;" />`;
      } else if (thumbs.length > 1) {
        const cells = thumbs.map(src =>
          `<img src="${src}" referrerpolicy="no-referrer"
            style="width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:4px;display:block;" />`
        ).join("");
        gallery = `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:3px;margin-bottom:8px;">${cells}</div>`;
      }

      return `
      <div style="width:210px;text-align:center;">
        ${gallery}
        <strong style="font-size:13px;">${trip.title}</strong><br>
        <span style="font-size:11px;color:#666;">${trip.date}${trip.distanceKm > 0 ? ` · ${trip.distanceKm} km` : ""}</span>
        ${descShort ? `<p style="font-size:11px;color:#444;line-height:1.35;margin:6px 0 0;text-align:left;">${descShort}</p>` : ""}
      </div>`;
    };

    // Trace chaque étape — chaque segment GPX séparément, CLIQUABLE
    tripsWithTrack.forEach(trip => {
      const segments = (trip.segments && trip.segments.length > 0)
        ? trip.segments
        : (trip.track ? [trip.track] : []);
      segments.forEach(seg => {
        if (seg.length < 2) return;
        // Ligne visible (orange)
        L.polyline(seg, {
          color: "#E8620A",
          weight: 5,
          opacity: 0.85,
        }).addTo(map);
        // Ligne invisible épaisse PAR-DESSUS : agrandit la zone cliquable
        const hit = L.polyline(seg, {
          color: "#000",
          weight: 22,
          opacity: 0,
        }).addTo(map);
        hit.bindPopup(popupHtml(trip));
        allBounds.push(...seg);
      });
    });

    // Petites marques discrètes partout où une photo a été géolocalisée sur le
    // tracé (via l'heure EXIF matchée au GPX). Clic → vignette + lien vers
    // l'étape. Volontairement discrètes et dans un pane sous les marqueurs
    // d'étape, pour ne jamais passer devant eux en cas de chevauchement.
    tripsWithTrack.forEach(trip => {
      for (const photo of (trip.photos || [])) {
        if (photo.lat == null || photo.lng == null || isNaN(photo.lat) || isNaN(photo.lng)) continue;
        const photoIcon = L.divIcon({
          html: `<div style="width:5px;height:5px;border-radius:50%;background:#2A6B73;opacity:0.45;box-shadow:0 0 1px rgba(0,0,0,.3);"></div>`,
          className: "",
          iconSize: [5, 5],
          iconAnchor: [2.5, 2.5],
        });
        const pm = L.marker([photo.lat, photo.lng], { icon: photoIcon, zIndexOffset: 0, pane: "photoMarkers" }).addTo(map);
        pm.bindPopup(`
          <div style="width:150px;text-align:center;">
            <img src="${photo.thumb}" alt="${photo.alt || ""}" referrerpolicy="no-referrer"
              style="width:100%;height:90px;object-fit:cover;border-radius:6px;margin-bottom:6px;display:block;" />
            ${photo.alt ? `<div style="font-size:11px;color:#333;">${photo.alt}</div>` : ""}
            <div style="font-size:10px;color:#888;margin-top:2px;">${trip.title}</div>
          </div>`);
      }
    });

    // Marqueurs aux étapes — différencier départ / actuel / intermédiaire
    // trips est en ordre chronologique : [0] = départ, dernier = position actuelle
    const lastIdx = tripsWithCoords.length - 1;

    // Point de départ réel = début du tout premier tracé
    const firstTrip = tripsWithCoords[0];
    let departurePoint = firstTrip ? [firstTrip.mapLat, firstTrip.mapLng] : null;
    if (firstTrip) {
      const segs = (firstTrip.segments && firstTrip.segments.length > 0)
        ? firstTrip.segments : (firstTrip.track ? [firstTrip.track] : []);
      if (segs.length > 0 && segs[0].length > 0) {
        departurePoint = segs[0][0]; // tout premier point GPS
      }
    }

    // Marqueur de départ : drapeau seul (sans pastille verte)
    if (departurePoint) {
      const startIcon = L.divIcon({
        html: `<div style="font-size:26px;line-height:1;filter:drop-shadow(0 2px 3px rgba(0,0,0,.5));">🚩</div>`,
        className: "",
        iconSize: [26, 26],
        iconAnchor: [6, 24],
      });
      L.marker(departurePoint, { icon: startIcon, zIndexOffset: 500 })
        .addTo(map)
        .bindPopup(popupHtml(firstTrip));
      allBounds.push(departurePoint);
    }

    tripsWithCoords.forEach((trip, idx) => {
      const isCurrent = idx === lastIdx;

      if (isCurrent) {
        // Position actuelle : gros marqueur orange pulsant
        const currentIcon = L.divIcon({
          html: `<div style="position:relative;display:flex;align-items:center;justify-content:center;">
            <div style="position:absolute;width:34px;height:34px;border-radius:50%;background:rgba(232,98,10,.3);animation:bmcpulse 1.8s infinite;"></div>
            <div style="width:18px;height:18px;border-radius:50%;background:#E8620A;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4);"></div>
          </div>`,
          className: "",
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        });
        const m = L.marker([trip.mapLat, trip.mapLng], { icon: currentIcon, zIndexOffset: 1000 }).addTo(map);
        m.bindPopup(popupHtml(trip));
      } else if (idx > 0) {
        // Étapes intermédiaires (le départ idx 0 a déjà son drapeau)
        const marker = L.circleMarker([trip.mapLat, trip.mapLng], {
          radius: 7,
          fillColor: "#2A6B73",
          color: "#fff",
          weight: 2,
          fillOpacity: 1,
        }).addTo(map);
        marker.bindPopup(popupHtml(trip));
      }
      allBounds.push([trip.mapLat, trip.mapLng]);
    });

    // La carte ayant une hauteur dynamique (flex), on recalcule sa taille
    // puis on réajuste la vue pour que le tracé remplisse l'espace.
    // Cadre le tracé UNE SEULE FOIS à l'arrivée. Ensuite, on laisse l'utilisateur
    // explorer librement : un déplacement/zoom ne recentre plus la carte.
    // Filtre toute coordonnée invalide (null, NaN, mal formée) : un seul point
    // invalide dans allBounds fait planter fitBounds() de Leaflet.
    const validBounds = allBounds.filter(pt =>
      Array.isArray(pt) && pt.length === 2 &&
      typeof pt[0] === "number" && typeof pt[1] === "number" &&
      !isNaN(pt[0]) && !isNaN(pt[1])
    );
    const fitOnce = () => {
      map.invalidateSize();
      if (!hasFittedRef.current && validBounds.length > 0) {
        map.fitBounds(validBounds, { padding: [40, 40], maxZoom: 12 });
        hasFittedRef.current = true;
      }
    };
    setTimeout(fitOnce, 200);

    // Au redimensionnement (rotation, etc.) : on recalcule juste la taille,
    // SANS recadrer (on ne touche pas à la position choisie par l'utilisateur).
    const onResize = () => map.invalidateSize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [leafletLoaded, trips, lang]);

  return (
    <div
      className="w-full overflow-hidden pt-20 pb-3 px-4 md:px-14 flex flex-col items-center text-text-on"
      style={{ height: vh ? `${vh}px` : "100vh" }}
    >
      <style>{`@keyframes bmcpulse{0%{transform:scale(.6);opacity:.8}70%{transform:scale(1.4);opacity:0}100%{opacity:0}}`}</style>
      <div className="max-w-6xl w-full text-left flex flex-col flex-1 min-h-0">

        {/* Header (taille inchangée) */}
        <div className="mb-3 shrink-0">
          <h1 className="font-display text-3xl md:text-5xl font-black uppercase text-text-on">
            {t("map.title")}
          </h1>
          <p className="text-xs text-text-dim text-opacity-80 mt-2 font-light">
            {t("map.intro")}
          </p>

          {/* Légende */}
          <div className="flex items-center gap-5 mt-4 font-mono text-[10px] text-text-dim">
            <span className="flex items-center gap-1.5">
              <span className="text-sm">🚩</span> {t("map.start")}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full" style={{ background: "#2A6B73", border: "2px solid #fff" }} /> {t("map.stage")}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full" style={{ background: "#E8620A", border: "2px solid #fff" }} /> {t("map.current")}
            </span>
          </div>
        </div>

        {/* Carte Leaflet : hauteur = écran moins l'espace pris par le header/footer */}
        <div className="flex-1 min-h-0 bg-[#1c1b1b] border border-white/5 rounded-lg overflow-hidden relative isolate z-0">
          {!leafletLoaded && (
            <div className="absolute inset-0 flex items-center justify-center z-10 bg-[#1c1b1b]">
              <span className="font-mono text-[10px] text-brand-sand uppercase tracking-widest animate-pulse">
                {t("map.loading")}
              </span>
            </div>
          )}
          <div
            ref={mapContainerRef}
            className="w-full h-full"
            style={{ background: "#1c1b1b" }}
          />
          {tripsWithTrack.length === 0 && tripsWithCoords.length === 0 && leafletLoaded && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[500]">
              <p className="font-mono text-[10px] text-text-dim bg-bg-dark/80 px-4 py-2 rounded uppercase tracking-wider">
                {t("map.no_track")}
              </p>
            </div>
          )}
        </div>

        {/* Popup étape complète par-dessus la carte */}
        {popupTrip && (
          <div
            className="fixed inset-0 z-[9999] bg-black/90 flex items-start justify-center overflow-y-auto"
            onClick={() => setPopupTrip(null)}
          >
            <div
              className="relative w-full max-w-3xl bg-bg-dark min-h-screen md:min-h-0 md:my-6 md:rounded-2xl overflow-hidden border border-white/10"
              onClick={e => e.stopPropagation()}
            >
              {/* Bouton fermer (fixe en haut) */}
              <button
                onClick={() => setPopupTrip(null)}
                className="fixed md:absolute top-4 right-4 z-[10000] w-10 h-10 rounded-full bg-black/60 backdrop-blur hover:bg-black/80 flex items-center justify-center text-white cursor-pointer"
                aria-label="Fermer"
              >
                <X size={20} />
              </button>

              {/* Étape complète : récit, photos, dénivelé, survol 3D, eBird */}
              <StageDetailView
                slug={popupTrip.slug}
                onNavigate={(tab, arg) => { setPopupTrip(null); onNavigate(tab, arg); }}
                lang={lang}
                t={t}
                embedded
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
