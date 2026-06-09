/**
 * sync-drive.js — The Cycling Beard
 *
 * Ce script tourne en dehors du site (Node.js, sur votre machine ou en CI).
 * Il lit les dossiers Google Drive, génère les JSON, convertit les images en WebP,
 * génère les thumbnails, et met à jour public/data/.
 *
 * Usage :
 *   node scripts/sync-drive.js
 *
 * Variables d'environnement requises (.env) :
 *   GOOGLE_SERVICE_ACCOUNT_KEY_PATH=./service-account.json
 *   DRIVE_FOLDER_ID=<id du dossier BikeTrip sur Drive>
 *
 * Packages requis :
 *   npm install googleapis sharp gpxparser dotenv
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import { google } from "googleapis";
import sharp from "sharp";
import GpxParser from "gpxparser";

// ─── Config ──────────────────────────────────────────────────────────────────

const ROOT_FOLDER_ID = process.env.DRIVE_FOLDER_ID;
const SERVICE_ACCOUNT_PATH = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH || "./service-account.json";

const PUBLIC_DIR = path.resolve("public");
const DATA_DIR = path.join(PUBLIC_DIR, "data");
const TRIPS_DIR = path.join(DATA_DIR, "trips");
const MEDIA_DIR = path.join(PUBLIC_DIR, "media");
const GPX_DIR = path.join(PUBLIC_DIR, "gpx");

// ─── DeepL Translation ────────────────────────────────────────────────────────

const DEEPL_API_KEY = process.env.DEEPL_API_KEY;
const TARGET_LANGS = { en: "EN", es: "ES", it: "IT", de: "DE", nl: "NL" };

async function deeplTranslate(text, targetLang) {
  if (!text || !text.trim() || !DEEPL_API_KEY) return text;
  const isFree = DEEPL_API_KEY.endsWith(":fx");
  const url = isFree
    ? "https://api-free.deepl.com/v2/translate"
    : "https://api.deepl.com/v2/translate";
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `DeepL-Auth-Key ${DEEPL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: [text],
        source_lang: "FR",
        target_lang: targetLang,
      }),
    });
    if (!res.ok) {
      console.log(`  WARN DeepL erreur ${res.status} pour ${targetLang}`);
      return text;
    }
    const data = await res.json();
    return data.translations?.[0]?.text || text;
  } catch (e) {
    console.log(`  WARN DeepL exception : ${e.message}`);
    return text;
  }
}

async function translateContent(fr) {
  const translations = { fr };
  if (!DEEPL_API_KEY) {
    console.log(`  INFO Pas de cle DeepL - francais uniquement`);
    return translations;
  }
  for (const [code, deeplCode] of Object.entries(TARGET_LANGS)) {
    const summary = await deeplTranslate(fr.summary, deeplCode);
    const quote = await deeplTranslate(fr.quote, deeplCode);
    const fullStory = [];
    for (const para of fr.fullStory) {
      fullStory.push(await deeplTranslate(para, deeplCode));
    }
    translations[code] = { summary, quote, fullStory };
    console.log(`  Traduit en ${code.toUpperCase()}`);
  }
  return translations;
}

// ─── Auth Google Drive ────────────────────────────────────────────────────────

function getAuthClient() {
  const keyFile = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, "utf-8"));
  const auth = new google.auth.GoogleAuth({
    credentials: keyFile,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });
  return auth;
}

// ─── Drive helpers ────────────────────────────────────────────────────────────

async function listSubFolders(drive, parentId) {
  const res = await drive.files.list({
    q: `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id, name)",
    orderBy: "name",
  });
  return res.data.files || [];
}

async function listFilesInFolder(drive, folderId) {
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: "files(id, name, mimeType, size)",
  });
  return res.data.files || [];
}

async function downloadFile(drive, fileId, destPath, attempt = 1) {
  try {
    const res = await drive.files.get({ fileId, alt: "media" }, { responseType: "stream" });
    await new Promise((resolve, reject) => {
      const dest = fs.createWriteStream(destPath);
      let errored = false;
      res.data.on("error", (err) => { errored = true; reject(err); });
      dest.on("error", (err) => { errored = true; reject(err); });
      // On attend "finish" du flux d'ÉCRITURE (fichier réellement écrit sur disque)
      dest.on("finish", () => { if (!errored) resolve(); });
      res.data.pipe(dest);
    });
    // Vérifie que le fichier n'est pas vide
    const stats = fs.statSync(destPath);
    if (stats.size === 0) throw new Error("fichier vide");
  } catch (err) {
    if (attempt < 3) {
      console.log(`  ⏳ Téléchargement échoué (essai ${attempt}), nouvelle tentative...`);
      await new Promise((r) => setTimeout(r, 1000 * attempt));
      return downloadFile(drive, fileId, destPath, attempt + 1);
    }
    throw err;
  }
}

// ─── Image processing ─────────────────────────────────────────────────────────

async function processImage(srcPath, destDir, baseName) {
  const webpPath = path.join(destDir, `${baseName}.webp`);
  const thumbPath = path.join(destDir, `thumb_${baseName}.webp`);

  // Full WebP — .rotate() applique l'orientation EXIF (corrige les photos couchées)
  await sharp(srcPath)
    .rotate()
    .webp({ quality: 85 })
    .resize(1600, null, { withoutEnlargement: true })
    .toFile(webpPath);

  // Thumbnail
  await sharp(srcPath)
    .rotate()
    .webp({ quality: 70 })
    .resize(400, 260, { fit: "cover" })
    .toFile(thumbPath);

  // Chemin relatif depuis public/ pour le navigateur
  const toPublicPath = (p) => "/" + path.relative(PUBLIC_DIR, p).replace(/\\/g, "/");
  return {
    webp: toPublicPath(webpPath),
    thumb: toPublicPath(thumbPath),
  };
}

// ─── Reverse Geocoding (Nominatim / OpenStreetMap, gratuit) ──────────────────

async function reverseGeocode(lat, lng) {
  if (lat == null || lng == null) return { city: null, region: null, department: null };
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=12&accept-language=fr`;
    const res = await fetch(url, {
      headers: { "User-Agent": "TheCyclingBeard/1.0 (cycling blog sync)" },
    });
    if (!res.ok) return { city: null, region: null, department: null };
    const data = await res.json();
    const a = data.address || {};
    return {
      city: a.city || a.town || a.village || a.municipality || a.county || null,
      region: a.state || a.region || null,        // ex: Bourgogne-Franche-Comté
      department: a.county || a.state_district || null,  // ex: Doubs, Saône-et-Loire
    };
  } catch {
    return { city: null, region: null, department: null };
  }
}

// ─── Traitement de l'inbox (GPX bruts → dossiers d'étape) ────────────────────

// Normalise un nom de ville pour le slug : minuscules, accents retirés, espaces→tirets
function slugifyCity(name) {
  return (name || "etape")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")  // retire les accents
    .replace(/[^a-z0-9]+/g, "-")                        // tout le reste → tiret
    .replace(/^-+|-+$/g, "");                           // trim des tirets
}

// Extrait coords départ/arrivée + date depuis le contenu GPX
function extractGpxMeta(gpxContent) {
  // Premier et dernier point (trkpt ou rtept ou wpt)
  const ptRegex = /<(?:trkpt|rtept|wpt)[^>]*lat="([-\d.]+)"[^>]*lon="([-\d.]+)"/g;
  const pts = [];
  let m;
  while ((m = ptRegex.exec(gpxContent)) !== null) {
    pts.push([parseFloat(m[1]), parseFloat(m[2])]);
  }
  // Première balise <time> = date de l'étape
  const timeMatch = gpxContent.match(/<time>([^<]+)<\/time>/);
  let date = null;
  if (timeMatch) {
    const d = new Date(timeMatch[1]);
    if (!isNaN(d.getTime())) date = d.toISOString().slice(0, 10);
  }
  if (pts.length < 2) return null;
  return {
    startLat: pts[0][0], startLng: pts[0][1],
    endLat: pts[pts.length - 1][0], endLng: pts[pts.length - 1][1],
    date,
  };
}

// Trouve un dossier par nom, ou le crée s'il n'existe pas
async function findOrCreateFolder(drive, parentId, name) {
  const q = `'${parentId}' in parents and name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const list = await drive.files.list({ q, fields: "files(id,name)" });
  if (list.data.files.length > 0) return list.data.files[0].id;
  const created = await drive.files.create({
    requestBody: { name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] },
    fields: "id",
  });
  return created.data.id;
}

// Vrai si un fichier de ce nom existe déjà dans le dossier
async function fileExistsInFolder(drive, folderId, filename) {
  const q = `'${folderId}' in parents and name='${filename}' and trashed=false`;
  const list = await drive.files.list({ q, fields: "files(id)" });
  return list.data.files.length > 0;
}

// Déplace un fichier vers un autre dossier (retire l'ancien parent, ajoute le nouveau) + renomme
async function moveAndRename(drive, fileId, newParentId, oldParentId, newName) {
  await drive.files.update({
    fileId,
    addParents: newParentId,
    removeParents: oldParentId,
    requestBody: { name: newName },
    fields: "id, parents",
  });
}

// Crée un fichier texte (markdown) dans un dossier
async function uploadText(drive, folderId, filename, content) {
  await drive.files.create({
    requestBody: { name: filename, parents: [folderId] },
    media: { mimeType: "text/markdown", body: content },
    fields: "id",
  });
}

// Gabarit notes.md : sections vides à remplir
function buildNotesTemplate(startCity, endCity, date) {
  return `# ${startCity} → ${endCity}
<!-- Étape du ${date}. Remplis les sections : ce qui reste vide ne sera pas affiché. -->

## Description
<!-- Le récit de l'étape : la route, les paysages, ce qui s'est passé. -->


## Camping
<!-- Où as-tu dormi ? Lieu, type (camping, Welcome to my Garden, chez l'habitant…), ressenti. -->


## Remerciements
<!-- Les personnes rencontrées, hôtes, coups de main à remercier. -->

`;
}

// Traite le dossier "_inbox" : chaque GPX brut → dossier d'étape nommé + notes.md
async function processInbox(drive, rootId) {
  // Cherche le sous-dossier _inbox
  const q = `'${rootId}' in parents and name='_inbox' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const inboxList = await drive.files.list({ q, fields: "files(id,name)" });
  if (inboxList.data.files.length === 0) {
    console.log("📥 Pas de dossier _inbox, rien à traiter.");
    return;
  }
  const inboxId = inboxList.data.files[0].id;

  // Liste les GPX de l'inbox
  const files = await listFilesInFolder(drive, inboxId);
  const gpxFiles = files.filter(f => f.name.toLowerCase().endsWith(".gpx"));
  if (gpxFiles.length === 0) {
    console.log("📥 _inbox vide (aucun GPX).");
    return;
  }
  console.log(`📥 ${gpxFiles.length} GPX à traiter dans _inbox`);

  let geocodes = 0;
  for (const file of gpxFiles) {
    console.log(`\n  📄 ${file.name}`);
    // Télécharge pour lire son contenu
    const tmpPath = path.join("/tmp", `inbox_${file.id}.gpx`);
    await downloadFile(drive, file.id, tmpPath);
    const content = fs.readFileSync(tmpPath, "utf-8");

    const meta = extractGpxMeta(content);
    if (!meta) {
      console.log("    ⚠️  GPX sans points exploitables, ignoré.");
      continue;
    }
    const date = meta.date || new Date().toISOString().slice(0, 10);

    // Géocode départ / arrivée (respect du 1 req/s Nominatim)
    const startGeo = await reverseGeocode(meta.startLat, meta.startLng);
    await new Promise(r => setTimeout(r, 1100));
    const endGeo = await reverseGeocode(meta.endLat, meta.endLng);
    await new Promise(r => setTimeout(r, 1100));
    geocodes += 2;

    const startCity = startGeo.city || "depart";
    const endCity = endGeo.city || "arrivee";
    const folderName = `${date}-${slugifyCity(startCity)}_${slugifyCity(endCity)}`;
    console.log(`    📂 ${folderName}  (${startCity} → ${endCity})`);

    const folderId = await findOrCreateFolder(drive, rootId, folderName);

    // Nom du GPX cible : ride.gpx, sinon ride-2.gpx…
    let gpxName = "ride.gpx";
    let n = 2;
    while (await fileExistsInFolder(drive, folderId, gpxName)) {
      gpxName = `ride-${n}.gpx`;
      n++;
    }

    // Déplace le GPX de l'inbox vers le dossier d'étape, renommé
    await moveAndRename(drive, file.id, folderId, inboxId, gpxName);
    console.log(`    ✅ déplacé → ${gpxName}`);

    // Crée notes.md s'il n'existe pas
    if (!(await fileExistsInFolder(drive, folderId, "notes.md"))) {
      await uploadText(drive, folderId, "notes.md", buildNotesTemplate(startCity, endCity, date));
      console.log(`    📝 notes.md créé`);
    }
  }
  console.log(`\n📥 Inbox traitée (${geocodes} géocodages).`);
}


  const gpx = new GpxParser();
  gpx.parse(gpxContent);

  if (!gpx.tracks || gpx.tracks.length === 0) {
    return { distanceKm: 0, elevationGain: 0, maxAltitude: 0, endLat: null, endLng: null };
  }

  const track = gpx.tracks[0];
  const distanceKm = Math.round(track.distance.total / 100) / 10;

  let elevationGain = 0;
  let maxAlt = 0;
  const points = track.points;
  for (let i = 1; i < points.length; i++) {
    const delta = points[i].ele - points[i - 1].ele;
    if (delta > 0) elevationGain += delta;
    if (points[i].ele > maxAlt) maxAlt = points[i].ele;
  }

  // Dernière position = fin de l'étape (pour la carte)
  const lastPoint = points[points.length - 1];

  // Trace : on garde plus de points pour suivre fidèlement la route
  // Simplification douce uniquement si le tracé est très dense
  const maxPoints = 800;
  const step = points.length > maxPoints ? Math.ceil(points.length / maxPoints) : 1;
  const trackPoints = [];
  for (let i = 0; i < points.length; i += step) {
    trackPoints.push([
      Math.round(points[i].lat * 100000) / 100000,
      Math.round(points[i].lon * 100000) / 100000,
    ]);
  }
  // Garde toujours le dernier point exact
  const last = [
    Math.round(lastPoint.lat * 100000) / 100000,
    Math.round(lastPoint.lon * 100000) / 100000,
  ];
  const lastAdded = trackPoints[trackPoints.length - 1];
  if (!lastAdded || lastAdded[0] !== last[0] || lastAdded[1] !== last[1]) {
    trackPoints.push(last);
  }

  // Profil altimétrique : ~60 points [distance_km, altitude_m]
  const profilePoints = 60;
  const elevProfile = [];
  let cumDist = 0;
  const profStep = Math.max(1, Math.floor(points.length / profilePoints));
  for (let i = 0; i < points.length; i += profStep) {
    if (i > 0) {
      // distance cumulée approximée
      cumDist = (track.distance.cumul?.[i] ?? (i / points.length) * track.distance.total) / 1000;
    }
    elevProfile.push([
      Math.round(cumDist * 10) / 10,
      Math.round(points[i].ele),
    ]);
  }

  return {
    distanceKm,
    elevationGain: Math.round(elevationGain),
    maxAltitude: Math.round(maxAlt),
    minAltitude: Math.round(Math.min(...points.map(p => p.ele))),
    elevProfile,
    endLat: lastPoint?.lat ?? null,
    endLng: lastPoint?.lon ?? null,
    startLat: points[0]?.lat ?? null,
    startLng: points[0]?.lon ?? null,
    track: trackPoints,
  };
}

// Fusionne plusieurs GPX : stats cumulées + segments séparés (pas de lignes droites)
function mergeGpxFiles(gpxContents) {
  if (gpxContents.length === 0) return { distanceKm: 0, elevationGain: 0, maxAltitude: 0, segments: [] };

  let totalDistance = 0;
  let totalElevation = 0;
  let maxAltitude = 0;
  let minAltitude = Infinity;
  let startLat = null, startLng = null;
  const segments = [];
  let fullProfile = [];
  let distOffset = 0;

  for (const content of gpxContents) {
    const r = parseOneGpx(content);
    totalDistance += r.distanceKm;
    totalElevation += r.elevationGain;
    if (r.maxAltitude > maxAltitude) maxAltitude = r.maxAltitude;
    if (r.minAltitude < minAltitude) minAltitude = r.minAltitude;
    if (startLat === null) { startLat = r.startLat; startLng = r.startLng; }
    if (r.track && r.track.length > 1) segments.push(r.track);
    // Concatène les profils en décalant la distance
    if (r.elevProfile) {
      for (const [d, ele] of r.elevProfile) {
        fullProfile.push([Math.round((distOffset + d) * 10) / 10, ele]);
      }
      distOffset += r.distanceKm;
    }
  }

  const lastResult = parseOneGpx(gpxContents[gpxContents.length - 1]);
  return {
    distanceKm: Math.round(totalDistance * 10) / 10,
    elevationGain: Math.round(totalElevation),
    maxAltitude: Math.round(maxAltitude),
    minAltitude: minAltitude === Infinity ? 0 : Math.round(minAltitude),
    elevProfile: fullProfile,
    endLat: lastResult.endLat,
    endLng: lastResult.endLng,
    startLat,
    startLng,
    track: segments[0] || [],
    segments,
  };
}

// ─── Notes parsing ────────────────────────────────────────────────────────────

function parseNotes(content) {
  const lines = content.split("\n").map(l => l.trim()).filter(Boolean);
  const result = {
    title: null,
    summary: null,
    fullStory: [],
    quote: null,
    highlights: [],
    location: null,
    weather: null,
    tags: [],
  };

  const stripTags = (s) => s.replace(/@[a-zA-ZÀ-ÿ0-9_-]+/g, "").replace(/\s{2,}/g, " ").trim();
  const collectTags = (line) => {
    const m = line.match(/@([a-zA-ZÀ-ÿ0-9_-]+)/g);
    if (m) for (const t of m) {
      const clean = t.slice(1).toLowerCase();
      if (!result.tags.includes(clean)) result.tags.push(clean);
    }
  };

  // Détecte si le fichier utilise le format structuré (summary:, ---, etc.)
  const isStructured = lines.some(l =>
    l.startsWith("summary:") || l === "---" || l.startsWith("quote:") ||
    l.startsWith("highlight:") || l.startsWith("weather:") || l.startsWith("location:")
  );

  if (isStructured) {
    // ── Format structuré (ancien) ──
    let inStory = false;
    for (const line of lines) {
      collectTags(line);
      if (line.startsWith("# ")) { continue; } // titre ignoré : on utilise départ → arrivée
      if (line.startsWith("summary:")) { result.summary = stripTags(line.slice(8)); continue; }
      if (line.startsWith("quote:")) { result.quote = stripTags(line.slice(6)); continue; }
      if (line.startsWith("location:")) { result.location = line.slice(9).trim(); continue; }
      if (line.startsWith("highlight:")) { result.highlights.push(stripTags(line.slice(10))); continue; }
      if (line.startsWith("weather:")) {
        const parts = line.slice(8).trim().split(",");
        result.weather = {
          condition: parts[0]?.trim() || "—",
          tempC: parseInt(parts[1]) || 0,
          windKph: parseInt(parts[2]) || 0,
        };
        continue;
      }
      if (line === "---") { inStory = !inStory; continue; }
      if (inStory && line.length > 5) {
        const cleanLine = stripTags(line);
        if (cleanLine.length > 3) result.fullStory.push(cleanLine);
      }
    }
  } else {
    // ── Texte libre ──
    // Tout le contenu de notes.md = récit. Le titre vient du nom de dossier.
    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx];
      collectTags(line);

      // Retire un éventuel "# " ou "Jour X —" en début de ligne (mise en forme)
      let cleanLine = line.replace(/^#+\s*/, "");
      cleanLine = cleanLine.replace(/^jour\s*\d+\s*[—\-–:]\s*/i, "");
      cleanLine = stripTags(cleanLine);
      if (cleanLine.length > 3) result.fullStory.push(cleanLine);
    }

    // Le résumé = première phrase du récit (pour les cartes)
    if (result.fullStory.length > 0) {
      const firstPara = result.fullStory[0];
      const firstSentence = firstPara.split(/(?<=[.!?])\s/)[0];
      result.summary = firstSentence.length > 10 ? firstSentence : firstPara.slice(0, 140);
    }
  }

  return result;
}

// ─── Main sync logic ──────────────────────────────────────────────────────────

async function syncFolder(drive, folder) {
  // rawSlug garde l'underscore pour parser le titre (ville_ville)
  const rawSlug = folder.name
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "");

  // slug propre pour fichiers/URLs (underscore → tiret)
  const slug = rawSlug.replace(/_/g, "-");
  console.log(`\n📂 Traitement : ${slug}`);

  const stageJsonPath = path.join(TRIPS_DIR, `${slug}.json`);

  const files = await listFilesInFolder(drive, folder.id);
  // Trie par nom pour que les GPX (01.gpx, 02.gpx…) soient dans l'ordre du trajet
  files.sort((a, b) => (a.name || "").localeCompare(b.name || "", undefined, { numeric: true }));
  console.log(`  → ${files.length} fichier(s) trouvé(s)`);

  const mediaDir = path.join(MEDIA_DIR, slug);
  fs.mkdirSync(mediaDir, { recursive: true });

  const tmpDir = path.join("/tmp", slug);
  fs.mkdirSync(tmpDir, { recursive: true });

  let coverWebp = null;
  let thumbWebp = null;
  const photos = [];
  let gpxStats = { distanceKm: 0, elevationGain: 0, maxAltitude: 0 };
  let gpxPublicPath = null;
  const gpxContents = [];
  let notes = {};

  // Parse date and title from rawSlug
  // Format: YYYY-MM-DD-depart_arrivee  (underscore = flèche entre villes)
  const parts = rawSlug.split("-");
  const date = parts.slice(0, 3).join("-");
  const slugRest = parts.slice(3).join("-");
  // Capitalise et transforme _ en flèche →
  const capitalize = (txt) => txt
    .split("-")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  const titleRaw = slugRest
    .split("_")                          // sépare départ_arrivée
    .map(part => capitalize(part))       // capitalise chaque ville
    .join(" → ");                        // relie par une flèche

  // ── Download and process each file ──
  for (const file of files) {
    const name = file.name.toLowerCase();
    const tmpPath = path.join(tmpDir, file.name);

    // Download
    await downloadFile(drive, file.id, tmpPath);

    // GPX — accumule tous les fichiers .gpx
    if (name.endsWith(".gpx")) {
      const gpxContent = fs.readFileSync(tmpPath, "utf-8");
      gpxContents.push(gpxContent);
      // Copie chaque GPX sous son nom original
      const gpxDest = path.join(GPX_DIR, `${slug}_${gpxContents.length}.gpx`);
      fs.copyFileSync(tmpPath, gpxDest);
      if (!gpxPublicPath) gpxPublicPath = `/gpx/${slug}_1.gpx`;
      console.log(`  📍 GPX #${gpxContents.length}: ${file.name}`);
    }

    // Notes
    if (name === "notes.md" || name === "notes.txt") {
      const content = fs.readFileSync(tmpPath, "utf-8");
      notes = parseNotes(content);
      console.log(`  📝 Notes parsées`);
    }

    // Images
    if (name.match(/\.(jpg|jpeg|png|webp)$/i)) {
      const baseName = path.basename(name, path.extname(name));
      const paths = await processImage(tmpPath, mediaDir, baseName);
      console.log(`  🖼  ${name} → ${paths.webp}`);

      // Titre lisible : retire préfixe numérique, underscores → espaces, capitalise
      const photoTitle = baseName
        .replace(/^\d+[-_]?/, "")           // retire "01_" ou "01-"
        .replace(/[-_]/g, " ")               // tirets/underscores → espaces
        .replace(/\b\w/g, c => c.toUpperCase()) // capitalise chaque mot
        .trim() || baseName;

      if (name.startsWith("cover")) {
        coverWebp = paths.webp;
        thumbWebp = paths.thumb;
      } else {
        photos.push({
          src: paths.webp,
          thumb: paths.thumb,
          alt: photoTitle,
        });
      }
    }
  }

  // Fusion de tous les GPX
  if (gpxContents.length > 0) {
    gpxStats = mergeGpxFiles(gpxContents);
    console.log(`  📍 Total GPX (${gpxContents.length} fichier(s)): ${gpxStats.distanceKm}km, +${gpxStats.elevationGain}m, max ${gpxStats.maxAltitude}m`);
    if (gpxStats.distanceKm === 0) {
      console.warn(`  ⚠️  ATTENTION : distance = 0 km pour ${slug}. GPX vide ou corrompu ?`);
    }
  }

  // Fallback cover
  if (!coverWebp && photos.length > 0) {
    coverWebp = photos[0].src;
    thumbWebp = photos[0].thumb;
  }

  // ── Reverse geocoding : noms de villes + région ──
  let startCity = null, endCity = null, region = null;
  if (gpxStats.startLat != null) {
    const startGeo = await reverseGeocode(gpxStats.startLat, gpxStats.startLng);
    startCity = startGeo.city;
    await new Promise(r => setTimeout(r, 1100));
    const endGeo = await reverseGeocode(gpxStats.endLat, gpxStats.endLng);
    endCity = endGeo.city;
    region = endGeo.region || startGeo.region;
    await new Promise(r => setTimeout(r, 1100));
    if (startCity || endCity) {
      console.log(`  📍 Trajet : ${startCity || "?"} → ${endCity || "?"} (${region || "région ?"})`);
    }
  }

  // ── Traduction du contenu (FR → EN/ES/IT/DE) ──
  const frContent = {
    summary: notes.summary || "",
    quote: notes.quote || null,
    fullStory: (notes.fullStory?.length > 0) ? notes.fullStory : ["Cette étape sera bientôt documentée."],
  };
  const translations = await translateContent(frContent);

  // ── Build stage JSON ──
  const stage = {
    slug,
    date,
    title: notes.title || titleRaw,
    day: `Jour ${computeDayNumber(date)}`,
    location: notes.location || titleRaw,
    country: detectCountry(slug, region),
    region: region || null,
    startCity: startCity || null,
    endCity: endCity || null,
    distanceKm: gpxStats.distanceKm,
    elevationGain: gpxStats.elevationGain,
    maxAltitude: gpxStats.maxAltitude || undefined,
    coverImage: coverWebp || "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&q=80&w=1600",
    heroVideo: null,
    // Contenu par défaut = français (rétrocompat)
    summary: frContent.summary,
    fullStory: frContent.fullStory,
    quote: frContent.quote,
    // Toutes les traductions
    translations,
    photos: coverWebp ? [{ src: coverWebp, thumb: thumbWebp, alt: "Cover" }, ...photos] : photos,
    videos: [],
    gpxFile: gpxPublicPath,
    mapLat: gpxStats.endLat ?? null,
    mapLng: gpxStats.endLng ?? null,
    startLat: gpxStats.startLat ?? null,
    startLng: gpxStats.startLng ?? null,
    track: gpxStats.track || [],
    segments: gpxStats.segments || [],
    elevProfile: gpxStats.elevProfile || [],
    minAltitude: gpxStats.minAltitude ?? null,
    highlights: notes.highlights || [],
    tags: notes.tags || [],
    weather: notes.weather || null,
  };

  fs.writeFileSync(stageJsonPath, JSON.stringify(stage, null, 2));
  console.log(`  ✅ ${stageJsonPath} généré`);

  return stage;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const START_DATE = new Date("2026-05-26");

function computeDayNumber(dateStr) {
  const d = new Date(dateStr);
  const diff = Math.floor((d - START_DATE) / (1000 * 60 * 60 * 24));
  return diff + 1;
}

// Crude country detection from slug keywords — étendre selon les besoins
function detectCountry(slug, region) {
  const s = slug.toLowerCase();
  // France — villes et régions
  if (s.includes("france") || s.includes("paris") || s.includes("lyon") || 
      s.includes("saint-nazaire") || s.includes("nazaire") || s.includes("nantes") ||
      s.includes("bordeaux") || s.includes("toulouse") || s.includes("marseille") ||
      s.includes("strasbourg") || s.includes("grenoble") || s.includes("annecy") ||
      s.includes("lepouliguen") || s.includes("pouliguen") || s.includes("larochelle") ||
      s.includes("rochelle") || s.includes("poitiers") || s.includes("tours") ||
      s.includes("orleans") || s.includes("dijon") || s.includes("besancon") ||
      s.includes("belfort") || s.includes("mulhouse") || s.includes("colmar") ||
      s.includes("metz") || s.includes("nancy") || s.includes("reims") ||
      s.includes("rennes") || s.includes("brest") || s.includes("lorient") ||
      s.includes("quimper") || s.includes("vannes") || s.includes("laval") ||
      s.includes("lemans") || s.includes("angers") || s.includes("saumur") ||
      s.includes("amboise") || s.includes("blois") || s.includes("chartres") ||
      s.includes("meung") || s.includes("gien") || s.includes("briare") ||
      s.includes("cosne") || s.includes("nevers") || s.includes("decize") ||
      s.includes("digoin") || s.includes("roanne") || s.includes("macon") ||
      s.includes("chalon") || s.includes("beaune") || s.includes("auxerre") ||
      s.includes("sens") || s.includes("fontainebleau") || s.includes("melun") ||
      s.includes("montereau") || s.includes("moret") || s.includes("nemours") ||
      s.includes("montargis") || s.includes("chateauneuf") || s.includes("sully") ||
      s.includes("beaugency") || s.includes("vendome") || s.includes("troyes") ||
      s.includes("chaumont") || s.includes("langres") || s.includes("vesoul") ||
      s.includes("gray") || s.includes("dole") || s.includes("pontarlier") ||
      s.includes("lons") || s.includes("bourg") || s.includes("menitre") ||
      s.includes("saumur") || s.includes("chinon") || s.includes("azay")) return "France";
  if (s.includes("italy") || s.includes("turin") || s.includes("milan") || s.includes("susa")) return "Italy";
  if (s.includes("austria") || s.includes("wien") || s.includes("salzburg")) return "Austria";
  if (s.includes("hungary") || s.includes("budapest")) return "Hungary";
  if (s.includes("romania") || s.includes("bucharest")) return "Romania";
  if (s.includes("turkey") || s.includes("istanbul")) return "Turkey";
  if (s.includes("iran")) return "Iran";
  if (s.includes("uzbekistan") || s.includes("bukhara") || s.includes("samarkand")) return "Uzbekistan";
  if (s.includes("tajikistan") || s.includes("pamir") || s.includes("dushanbe")) return "Tajikistan";
  if (s.includes("kyrgyzstan") || s.includes("bishkek")) return "Kyrgyzstan";
  if (s.includes("kazakhstan") || s.includes("almaty")) return "Kazakhstan";

  // Repli : déduit le pays depuis la région obtenue par géocodage inverse
  if (region) {
    const r = region.toLowerCase();
    const frenchRegions = ["loire", "bretagne", "normandie", "centre", "bourgogne", "franche-comté",
      "grand est", "alsace", "occitanie", "nouvelle-aquitaine", "auvergne", "rhône", "provence",
      "hauts-de-france", "île-de-france", "ile-de-france", "pays de la loire", "corse"];
    if (frenchRegions.some(fr => r.includes(fr))) return "France";
    if (r.includes("piemonte") || r.includes("piedmont") || r.includes("lombard")) return "Italy";
    if (r.includes("tirol") || r.includes("tyrol") || r.includes("steiermark") || r.includes("wien")) return "Austria";
  }
  return "—";
}

// ─── Entry point ─────────────────────────────────────────────────────────────

// Traite le dossier spécial _about (présentation + photos)
async function syncAbout(drive, folder) {
  console.log(`\n👤 Traitement de la présentation (_about)`);
  const files = await listFilesInFolder(drive, folder.id);

  const mediaDir = path.join(MEDIA_DIR, "_about");
  fs.mkdirSync(mediaDir, { recursive: true });
  const tmpDir = path.join("/tmp", "_about");
  fs.mkdirSync(tmpDir, { recursive: true });

  let presentation = "";
  let mePhoto = null;
  let bikePhoto = null;

  for (const file of files) {
    const name = file.name.toLowerCase();
    const tmpPath = path.join(tmpDir, file.name);

    // Google Doc → export en texte brut
    if (file.mimeType === "application/vnd.google-apps.document") {
      try {
        const res = await drive.files.export(
          { fileId: file.id, mimeType: "text/plain" },
          { responseType: "text" }
        );
        presentation = (typeof res.data === "string" ? res.data : "").trim();
        console.log(`  📝 Présentation lue (Google Doc) — ${presentation.length} caractères`);
      } catch (e) {
        console.log(`  ⚠️  Erreur export Google Doc : ${e.message}`);
      }
      continue;
    }

    await downloadFile(drive, file.id, tmpPath);

    if (name.endsWith(".md") || name.endsWith(".txt")) {
      presentation = fs.readFileSync(tmpPath, "utf-8").trim();
      console.log(`  📝 Présentation lue — ${presentation.length} caractères`);
    }

    if (name.match(/\.(jpg|jpeg|png|webp)$/i)) {
      const baseName = path.basename(name, path.extname(name));
      const paths = await processImage(tmpPath, mediaDir, baseName);
      if (name.startsWith("me") || name.includes("moi") || name.includes("portrait")) {
        mePhoto = paths.webp;
      } else if (name.startsWith("bike") || name.includes("velo") || name.includes("vélo")) {
        bikePhoto = paths.webp;
      } else if (!mePhoto) {
        mePhoto = paths.webp;
      } else if (!bikePhoto) {
        bikePhoto = paths.webp;
      }
      console.log(`  🖼  ${name}`);
    }
  }

  // Découpe la présentation en paragraphes
  // On retire les # de titre markdown au lieu de supprimer la ligne entière
  const paragraphs = presentation
    .split(/\n\s*\n/)              // sépare par lignes vides (vrais paragraphes)
    .flatMap(block => block.split("\n"))  // puis par retour ligne simple
    .map(l => l.replace(/^#+\s*/, "").trim())  // retire les # de titre
    .filter(l => l.length > 0);

  console.log(`  📝 ${paragraphs.length} paragraphe(s) extraits`);

  // Traduit la présentation
  const frPres = { summary: "", quote: null, fullStory: paragraphs };
  const translations = await translateContent(frPres);

  const aboutData = {
    paragraphs,
    translations: Object.fromEntries(
      Object.entries(translations).map(([lang, t]) => [lang, t.fullStory])
    ),
    mePhoto,
    bikePhoto,
  };

  fs.writeFileSync(path.join(DATA_DIR, "about.json"), JSON.stringify(aboutData, null, 2));
  console.log(`  ✅ about.json généré`);
}

async function main() {
  if (!ROOT_FOLDER_ID) {
    console.error("❌ DRIVE_FOLDER_ID manquant dans .env");
    process.exit(1);
  }

  console.log("🚴 The Cycling Beard — sync-drive.js");
  console.log("=====================================");

  // Setup dirs
  [DATA_DIR, TRIPS_DIR, MEDIA_DIR, GPX_DIR].forEach(d => fs.mkdirSync(d, { recursive: true }));

  const auth = getAuthClient();
  const drive = google.drive({ version: "v3", auth });

  // ── Étape 0 : traite les GPX bruts déposés dans _inbox ──
  await processInbox(drive, ROOT_FOLDER_ID);

  // List stage folders
  const folders = await listSubFolders(drive, ROOT_FOLDER_ID);
  console.log(`\n📁 ${folders.length} dossier(s) trouvé(s) sur Drive`);

  if (folders.length === 0) {
    console.log("Aucun dossier d'étape trouvé. Vérifiez DRIVE_FOLDER_ID.");
    return;
  }

  const stages = [];
  for (const folder of folders) {
    // Dossier spécial _about → page de présentation
    if (folder.name.toLowerCase() === "_about") {
      await syncAbout(drive, folder);
      continue;
    }
    // Only process folders named YYYY-MM-DD-*
    if (!/^\d{4}-\d{2}-\d{2}/.test(folder.name)) {
      console.log(`⚠️  Dossier ignoré (format inattendu): ${folder.name}`);
      continue;
    }
    const stage = await syncFolder(drive, folder);
    if (stage) stages.push(stage);
  }

  // ── Generate trips.json ──
  const trips = stages.map(s => ({
    slug: s.slug,
    date: s.date,
    title: s.title,
    country: s.country,
    region: s.region || null,
    startCity: s.startCity || null,
    endCity: s.endCity || null,
    distanceKm: s.distanceKm,
    elevationGain: s.elevationGain,
    coverImage: s.coverImage,
    thumbnail: s.photos[0]?.thumb || s.coverImage,
    shortDescription: s.summary || "",
    hasVideo: s.videos.length > 0,
    hasGpx: !!s.gpxFile,
    mapLat: s.mapLat ?? null,
    mapLng: s.mapLng ?? null,
    track: s.track || [],
    segments: s.segments || [],
    tags: s.tags || [],
    fullStory: s.fullStory || [],
    photos: s.photos || [],
    translations: s.translations || null,
    elevProfile: s.elevProfile || [],
    minAltitude: s.minAltitude ?? null,
  }));

  fs.writeFileSync(path.join(DATA_DIR, "trips.json"), JSON.stringify(trips, null, 2));
  console.log(`\n✅ trips.json mis à jour (${trips.length} étape(s))`);

  // ── Generate stats.json ──
  const totalKm = stages.reduce((acc, s) => acc + s.distanceKm, 0);
  const totalElevation = stages.reduce((acc, s) => acc + s.elevationGain, 0);
  const countries = [...new Set(stages.map(s => s.country).filter(c => c !== "—"))];
  const lastStage = stages[stages.length - 1];

  const stats = {
    totalKm: Math.round(totalKm),
    totalCountries: countries.length || 1,
    totalDays: stages.length,
    totalElevation: Math.round(totalElevation),
    currentCountry: lastStage?.country || "France",
    currentLocation: lastStage?.endCity || lastStage?.location || "Saint-Nazaire",
    startDate: "2026-05-26",
    lastUpdate: new Date().toISOString().split("T")[0],
    latestStageSlug: lastStage?.slug || "",
  };

  fs.writeFileSync(path.join(DATA_DIR, "stats.json"), JSON.stringify(stats, null, 2));
  console.log(`✅ stats.json mis à jour`);
  console.log(`\n📊 Résumé :`);
  console.log(`   ${stats.totalKm} km · ${stats.totalElevation} m D+ · ${stats.totalCountries} pays · ${stats.totalDays} étapes`);
  console.log("\n🎉 Synchronisation terminée !");
}

main().catch(err => {
  console.error("❌ Erreur fatale :", err);
  process.exit(1);
});
