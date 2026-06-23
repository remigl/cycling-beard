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
 *   DRIVE_FOLDER_ID=<id du dossier racine sur Drive>
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
  // OAuth utilisateur : le script agit « en tant que toi » (ton quota Drive),
  // ce qui permet de CRÉER des fichiers (Google Docs de notes).
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("OAuth manquant : GOOGLE_OAUTH_CLIENT_ID / _SECRET / _REFRESH_TOKEN.");
  }
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
  oauth2.setCredentials({ refresh_token: refreshToken });
  return oauth2;
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
    fields: "files(id, name, mimeType, size, modifiedTime, md5Checksum)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  return res.data.files || [];
}

// Empreinte d'une étape : signature stable de TOUT son contenu Drive.
// - Fichiers binaires (photos, GPX) : id + nom + taille + md5 (le md5 capte un
//   remplacement de contenu même à nom identique ; le nom capte un renommage).
// - Fichiers Google natifs (Docs) : id + nom + modifiedTime (pas de md5/taille
//   fiables) → capte une édition, un renommage ou l'ajout d'un Doc.
// Tout changement (ajout, suppression, renommage, édition) modifie l'empreinte.
function fingerprintFiles(files) {
  return files
    .map(f => {
      const isGoogle = (f.mimeType || "").startsWith("application/vnd.google-apps");
      const content = isGoogle
        ? (f.modifiedTime || "")           // Doc : la date capte l'édition
        : `${f.size || 0}:${f.md5Checksum || ""}`; // binaire : taille + checksum
      return `${f.id}:${f.name}:${content}`;
    })
    .sort()
    .join("|");
}

// modifiedTime du Doc "notes" s'il existe (capte tes éditions de notes).
function notesDocModified(files) {
  const doc = files.find(f => f.mimeType === "application/vnd.google-apps.document"
    && f.name.toLowerCase() === "notes");
  return doc?.modifiedTime || "";
}

// Version du format de cache : à incrémenter si la structure des étapes change,
// pour forcer un resync complet propre lors d'un déploiement de nouvelle logique.
const SYNC_CACHE_VERSION = 1;

function loadSyncCache(cachePath) {
  try {
    const raw = JSON.parse(fs.readFileSync(cachePath, "utf8"));
    if (raw.version !== SYNC_CACHE_VERSION) {
      console.log(`  ♻️  Cache version ${raw.version} ≠ ${SYNC_CACHE_VERSION} → resync complet`);
      return { version: SYNC_CACHE_VERSION, stages: {} };
    }
    return raw;
  } catch {
    return { version: SYNC_CACHE_VERSION, stages: {} };
  }
}

async function downloadFile(drive, fileId, destPath, attempt = 1) {
  try {
    const res = await drive.files.get({ fileId, alt: "media", supportsAllDrives: true }, { responseType: "stream" });
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
    // Fichier Google natif (Doc/Sheet/Slides) : non téléchargeable en binaire.
    // Ce n'est pas une vraie erreur réseau → on ne réessaie pas, on signale juste.
    const reason = err?.errors?.[0]?.reason || err?.response?.data?.error?.errors?.[0]?.reason;
    if (reason === "fileNotDownloadable" || (err.message || "").includes("binary content")) {
      throw new Error("fichier Google natif non téléchargeable (ignoré)");
    }
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
  const empty = { city: null, region: null, department: null, country: null, countryCode: null };
  if (lat == null || lng == null) return empty;

  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=jsonv2&addressdetails=1&zoom=12&accept-language=fr`;

  // 3 tentatives avec timeout + délai croissant, car Nominatim peut être lent/occupé
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(url, {
        headers: { "User-Agent": "TheCyclingBeard/1.0 (cycling blog sync; contact@cyclingbeard.fr)" },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const a = data.address || {};
      const result = {
        city: a.city || a.town || a.village || a.municipality || a.hamlet || a.suburb || a.county || null,
        region: a.state || a.region || a.province || a.state_district || null,
        department: a.county || a.state_district || null,
        country: a.country || null,                                   // ex: France, Italie
        countryCode: a.country_code ? a.country_code.toUpperCase() : null,  // ex: FR, IT
      };
      // Si le pays manque encore, on considère l'essai comme incomplet et on réessaie
      if (!result.countryCode && !result.country && attempt < 3) {
        await new Promise(r => setTimeout(r, 1500));
        continue;
      }
      return result;
    } catch (err) {
      if (attempt < 3) {
        await new Promise(r => setTimeout(r, 1500 * attempt));
        continue;
      }
      console.log(`    ⚠️  Géocodage échoué (${err.message})`);
    }
  }
  return empty;
}

// Récupère les vrais lieux touristiques autour d'un point via Overpass (OSM).
// Côté serveur (GitHub Actions) → pas de CORS. Renvoie une liste triée par
// pertinence touristique puis distance. Tolérant : [] si échec.
async function fetchPois(lat, lng, wikiLang = "fr") {
  if (lat == null || lng == null) return [];

  const rank = (tags) => {
    const h = tags.historic, to = tags.tourism, l = tags.leisure, a = tags.amenity, n = tags.natural;
    if (to === "attraction") return { rank: 10, kind: "Attraction" };
    if (h === "castle" || h === "fort" || h === "city_gate") return { rank: 10, kind: "Château / fort" };
    if (to === "museum" || to === "gallery") return { rank: 9, kind: "Musée" };
    if (h === "monument" || h === "memorial" || h === "ruins" || h === "archaeological_site") return { rank: 8, kind: "Monument / ruines" };
    if (to === "viewpoint") return { rank: 8, kind: "Point de vue" };
    if (a === "place_of_worship" || h === "church" || h === "monastery") return { rank: 7, kind: "Édifice religieux" };
    if (to === "theme_park" || to === "zoo" || to === "aquarium") return { rank: 7, kind: "Parc à thème / zoo" };
    if (n === "waterfall" || n === "peak" || n === "cave_entrance") return { rank: 6, kind: "Site naturel" };
    if (to === "artwork") return { rank: 6, kind: "Œuvre / art" };
    if (l === "park" || to === "park") return { rank: 5, kind: "Parc" };
    return { rank: 0, kind: "" };
  };
  const haversine = (la1, lo1, la2, lo2) => {
    const R = 6371000, toRad = (d) => d * Math.PI / 180;
    const dLat = toRad(la2 - la1), dLng = toRad(lo2 - lo1);
    const aa = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(la1)) * Math.cos(toRad(la2)) * Math.sin(dLng / 2) ** 2;
    return Math.round(2 * R * Math.asin(Math.sqrt(aa)));
  };

  const radius = 12000;
  const q = `[out:json][timeout:25];(node["tourism"~"attraction|museum|gallery|viewpoint|artwork|theme_park|zoo|aquarium"](around:${radius},${lat},${lng});way["tourism"~"attraction|museum|gallery|viewpoint|theme_park|zoo"](around:${radius},${lat},${lng});node["historic"~"castle|fort|monument|memorial|ruins|archaeological_site|city_gate|church|monastery"](around:${radius},${lat},${lng});way["historic"~"castle|fort|monument|ruins|archaeological_site"](around:${radius},${lat},${lng});node["natural"~"waterfall|peak|cave_entrance"](around:${radius},${lat},${lng}););out center 80;`;
  const mirrors = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
  ];

  let data = null;
  for (const url of mirrors) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30000);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "TheCyclingBeard/1.0 (cycling blog sync)" },
        body: "data=" + encodeURIComponent(q),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) continue;
      data = await res.json();
      break;
    } catch { /* miroir suivant */ }
  }
  if (!data) { console.log("    ⚠️  Overpass injoignable (POI à réessayer au prochain sync)"); return null; }

  const seen = new Set();
  let list = [];
  for (const el of (data.elements || [])) {
    const tags = el.tags || {};
    const name = tags["name:" + wikiLang] || tags.name;
    if (!name || seen.has(name)) continue;
    const { rank: r, kind } = rank(tags);
    if (r === 0) continue;
    const elat = el.lat ?? el.center?.lat, elng = el.lon ?? el.center?.lon;
    if (elat == null || elng == null) continue;
    seen.add(name);
    let wikiTitle = null;
    if (tags.wikipedia) {
      const parts = tags.wikipedia.split(":");
      wikiTitle = parts.length > 1 ? parts.slice(1).join(":") : tags.wikipedia;
    }
    list.push({ title: name, dist: haversine(lat, lng, elat, elng), kind, rank: r, wikiTitle });
  }
  list.sort((a, b) => (b.rank - a.rank) || (a.dist - b.dist));
  list = list.slice(0, 15);
  console.log(`    🏛️  ${list.length} sites touristiques trouvés`);
  return list;
}

// Spécialités culinaires d'un pays via Wikidata (SPARQL). Côté serveur → pas de
// CORS. Renvoie une liste de plats {title, image, wikipedia} ou [] si échec.
const COUNTRY_QID = {
  FR: "Q142", CH: "Q39", DE: "Q183", AT: "Q40", SK: "Q214",
  HU: "Q28", HR: "Q224", RS: "Q403", RO: "Q218", BG: "Q219",
  BE: "Q31", NL: "Q55", IT: "Q38", ES: "Q29",
};
async function fetchSpecialties(countryCode, lang = "fr") {
  if (!countryCode) return [];
  const qid = COUNTRY_QID[countryCode.toUpperCase()];
  if (!qid) return [];

  // Vrais plats/spécialités du pays. On cible les sous-classes de "dish" (Q746549)
  // et "food" mais en exigeant un article Wikipédia (gage de notoriété, évite les
  // ingrédients obscurs), et on trie par notoriété (nb de sitelinks) + présence
  // d'image. Résultat : des spécialités connues, pas des entrées génériques.
  const sparql = `SELECT DISTINCT ?dish ?dishLabel ?image ?article ?linkcount WHERE {
    ?dish wdt:P495 wd:${qid} .
    {
      ?dish wdt:P31/wdt:P279* wd:Q746549 .   # plat
    } UNION {
      ?dish wdt:P31/wdt:P279* wd:Q2095 .      # aliment
      ?dish wdt:P279|wdt:P31 ?cls .
      FILTER(?cls != wd:Q2095)
    }
    ?dish wikibase:sitelinks ?linkcount .
    FILTER(?linkcount >= 3)                    # au moins 3 wikis → notable
    OPTIONAL { ?dish wdt:P18 ?image . }
    # Article dans la langue de l'utilisateur si dispo, sinon en anglais
    OPTIONAL { ?artLang schema:about ?dish ; schema:isPartOf <https://${lang}.wikipedia.org/> . }
    OPTIONAL { ?artEn schema:about ?dish ; schema:isPartOf <https://en.wikipedia.org/> . }
    BIND(COALESCE(?artLang, ?artEn) AS ?article)
    FILTER(BOUND(?article))
    SERVICE wikibase:label { bd:serviceParam wikibase:language "${lang},en". }
  }
  ORDER BY DESC(?linkcount)
  LIMIT 24`;

  try {
    const url = "https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(sparql);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    const res = await fetch(url, {
      headers: { "Accept": "application/sparql-results+json", "User-Agent": "TheCyclingBeard/1.0 (cycling blog sync)" },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) { console.log(`    ⚠️  Wikidata HTTP ${res.status} (spécialités à réessayer)`); return null; }
    const data = await res.json();
    const rows = data?.results?.bindings || [];
    const seen = new Set();
    const dishes = [];
    for (const r of rows) {
      const title = r.dishLabel?.value;
      if (!title || /^Q\d+$/.test(title) || seen.has(title)) continue;
      seen.add(title);
      dishes.push({
        title,
        image: r.image?.value || null,
        wikipedia: r.article?.value || null,
      });
      if (dishes.length >= 24) break;
    }
    console.log(`    🍽️  ${dishes.length} spécialités (${countryCode})`);
    return dishes;
  } catch (e) {
    console.log(`    ⚠️  Spécialités Wikidata échouées (${e.message}) — à réessayer`);
    return null;
  }
}

// Nom de pays propre depuis le code ISO (fiable, indépendant de la langue Nominatim)
function countryFromCode(code) {
  const map = {
    FR: "France", IT: "Italie", DE: "Allemagne", AT: "Autriche", CH: "Suisse",
    BE: "Belgique", NL: "Pays-Bas", ES: "Espagne", PT: "Portugal", LU: "Luxembourg",
    SK: "Slovaquie", HU: "Hongrie", RO: "Roumanie", RS: "Serbie", HR: "Croatie",
    BG: "Bulgarie", SI: "Slovénie", CZ: "Tchéquie", PL: "Pologne",
    GE: "Géorgie", TR: "Turquie", KG: "Kirghizistan", KZ: "Kazakhstan",
  };
  return map[code] || null;
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

// Vrai si un dossier de ce nom existe déjà sous le parent
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

  // ── Étape 1 : lire chaque GPX (date, coords départ/arrivée, heure de départ) ──
  const items = [];
  for (const file of gpxFiles) {
    console.log(`\n  📄 ${file.name}  (${file.size ?? "?"} octets)`);
    if (file.size != null && Number(file.size) === 0) {
      console.log("    ⚠️  Fichier vide sur Drive, ignoré.");
      continue;
    }
    const tmpDir = path.join("/tmp", "_inbox");
    fs.mkdirSync(tmpDir, { recursive: true });
    const tmpPath = path.join(tmpDir, `${file.id}.gpx`);
    let content;
    try {
      await downloadFile(drive, file.id, tmpPath);
      content = fs.readFileSync(tmpPath, "utf-8");
    } catch (err) {
      console.log(`    ⚠️  Téléchargement impossible (${err.message}), ignoré.`);
      continue;
    }
    const meta = extractGpxMeta(content);
    if (!meta) {
      console.log("    ⚠️  GPX sans points exploitables, ignoré.");
      continue;
    }
    const date = meta.date || new Date().toISOString().slice(0, 10);
    // Heure de départ précise (pour ordonner les GPX d'un même jour)
    const tm = content.match(/<time>([^<]+)<\/time>/);
    const startTime = tm ? new Date(tm[1]).getTime() : Number.MAX_SAFE_INTEGER;
    items.push({ file, date, startTime, meta });
  }

  if (items.length === 0) {
    console.log("\n📥 Aucun GPX exploitable.");
    return;
  }

  // ── Étape 2 : regrouper les GPX par JOUR ──
  const byDay = {};
  for (const it of items) {
    (byDay[it.date] = byDay[it.date] || []).push(it);
  }

  // ── Étape 3 : un dossier par jour ──
  let geocodes = 0;
  for (const date of Object.keys(byDay).sort()) {
    const dayItems = byDay[date].sort((a, b) => a.startTime - b.startTime);
    const first = dayItems[0];                       // GPX le plus tôt → départ
    const last = dayItems[dayItems.length - 1];      // GPX le plus tard → arrivée

    console.log(`\n  📅 ${date} — ${dayItems.length} GPX`);

    // Géocode le VRAI départ (début du 1er GPX) et la VRAIE arrivée (fin du dernier)
    const startGeo = await reverseGeocode(first.meta.startLat, first.meta.startLng);
    await new Promise(r => setTimeout(r, 1100));
    const endGeo = await reverseGeocode(last.meta.endLat, last.meta.endLng);
    await new Promise(r => setTimeout(r, 1100));
    geocodes += 2;

    const startCity = startGeo.city || "depart";
    const endCity = endGeo.city || "arrivee";
    const folderName = `${date}-${slugifyCity(startCity)}_${slugifyCity(endCity)}`;
    console.log(`    📂 ${folderName}  (${startCity} → ${endCity})`);

    const folderId = await findOrCreateFolder(drive, rootId, folderName);

    // Déplace TOUS les GPX du jour dans ce dossier, sans renommer (anti-écrasement)
    for (const it of dayItems) {
      let targetName = it.file.name;
      if (await fileExistsInFolder(drive, folderId, targetName)) {
        const dot = targetName.lastIndexOf(".");
        const base = dot > 0 ? targetName.slice(0, dot) : targetName;
        const ext = dot > 0 ? targetName.slice(dot) : "";
        let n = 2;
        while (await fileExistsInFolder(drive, folderId, `${base}-${n}${ext}`)) n++;
        targetName = `${base}-${n}${ext}`;
      }
      await moveAndRename(drive, it.file.id, folderId, inboxId, targetName);
      console.log(`    ✅ déplacé → ${targetName}`);
    }
  }
  console.log(`\n📥 Inbox traitée (${geocodes} géocodages).`);
}

// ─── GPX parsing ─────────────────────────────────────────────────────────────

function parseOneGpx(gpxContent) {
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
  // Point d'arrivée : dernier point du dernier GPX, ou à défaut le dernier point
  // du dernier segment valide (robustesse si le dernier GPX est mal formé).
  let endLat = lastResult.endLat;
  let endLng = lastResult.endLng;
  if ((endLat == null || endLng == null) && segments.length > 0) {
    const lastSeg = segments[segments.length - 1];
    const lastPt = lastSeg[lastSeg.length - 1];
    if (lastPt) { endLat = lastPt[0]; endLng = lastPt[1]; }
  }

  return {
    distanceKm: Math.round(totalDistance * 10) / 10,
    elevationGain: Math.round(totalElevation),
    maxAltitude: Math.round(maxAltitude),
    minAltitude: minAltitude === Infinity ? 0 : Math.round(minAltitude),
    elevProfile: fullProfile,
    endLat,
    endLng,
    startLat,
    startLng,
    track: segments[0] || [],
    segments,
  };
}

// ─── Notes Google Doc ─────────────────────────────────────────────────────────
// Le fichier de notes est un GOOGLE DOC (éditable depuis l'app Drive sur mobile),
// nommé "notes", avec 3 sections repérées par leurs titres.
const NOTES_DOC_NAME = "notes";
let docsClient = null; // client Google Docs partagé, initialisé dans main()
const NOTES_TEMPLATE =
  "Description\n\n\n" +
  "Hébergement\n\n\n" +
  "Remerciements\n\n";

async function findNotesDoc(drive, folderId) {
  const res = await drive.files.list({
    q: `'${folderId}' in parents and name = '${NOTES_DOC_NAME}' and mimeType = 'application/vnd.google-apps.document' and trashed = false`,
    fields: "files(id, name)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  return res.data.files && res.data.files[0] ? res.data.files[0] : null;
}

async function createNotesDoc(drive, folderId) {
  const created = await drive.files.create({
    requestBody: {
      name: NOTES_DOC_NAME,
      mimeType: "application/vnd.google-apps.document",
      parents: [folderId],
    },
    fields: "id",
    supportsAllDrives: true,
  });
  const docId = created.data.id;
  try {
    await docsClient.documents.batchUpdate({
      documentId: docId,
      requestBody: {
        requests: [{ insertText: { location: { index: 1 }, text: NOTES_TEMPLATE } }],
      },
    });
  } catch (e) {
    console.log(`    ⚠️  Doc créé mais gabarit non inséré (${e.message})`);
  }
  return docId;
}

async function exportDocText(drive, docId) {
  const res = await drive.files.export(
    { fileId: docId, mimeType: "text/plain" },
    { responseType: "text" }
  );
  return typeof res.data === "string" ? res.data : String(res.data || "");
}

// Réinsère le gabarit (titres) dans un Doc EXISTANT mais vide — utile pour
// les Docs créés sans gabarit (ex : Docs API pas encore activée au moment
// de leur création). N'écrase JAMAIS un Doc déjà rempli.
async function ensureTemplate(docId) {
  await docsClient.documents.batchUpdate({
    documentId: docId,
    requestBody: {
      requests: [{ insertText: { location: { index: 1 }, text: NOTES_TEMPLATE } }],
    },
  });
}

// Déduit un nom lisible à partir d'une URL d'hébergement.
// Ex : https://www.google.com/maps/place/Camping+du+Lac/... -> "Camping du Lac"
//      https://camping-du-lac.fr -> "camping-du-lac.fr"
// Déplie un lien court (maps.app.goo.gl, goo.gl/maps, bit.ly…) vers son URL
// longue en suivant les redirections, sans télécharger la page (méthode HEAD,
// repli GET). Renvoie l'URL d'origine si le dépliage échoue.
async function expandShortUrl(url) {
  try {
    const isShort = /(maps\.app\.goo\.gl|goo\.gl|bit\.ly|tinyurl\.com)/i.test(url);
    if (!isShort) return url;
    // fetch suit les redirections par défaut → res.url contient l'URL finale.
    const res = await fetch(url, { method: "GET", redirect: "follow" });
    return res.url || url;
  } catch {
    return url;
  }
}

function lodgingNameFromUrl(url) {
  try {
    const u = new URL(url);
    // Google Maps : /maps/place/<NOM>/...
    const placeMatch = u.pathname.match(/\/maps\/place\/([^/@]+)/);
    if (placeMatch) {
      return decodeURIComponent(placeMatch[1]).replace(/\+/g, " ").trim();
    }
    // Paramètre ?q=<NOM> (recherche Maps)
    const q = u.searchParams.get("q");
    if (q && u.hostname.includes("google")) return q.replace(/\+/g, " ").trim();
    // Sinon : nom de domaine sans "www."
    return u.hostname.replace(/^www\./, "");
  } catch {
    return url; // pas une URL valide : on renvoie le texte tel quel
  }
}

async function parseNotesDoc(text) {
  const clean = (text || "").replace(/\r/g, "");
  const sections = { description: "", lodging: "", thanks: "" };
  // Les titres acceptent un ":" final optionnel ET du contenu sur la même ligne
  // (ex : "Hébergement : https://..."). Le contenu après le titre est conservé.
  const map = [
    ["description", /^\s*description\s*:?\s*(.*)$/i],
    ["lodging", /^\s*(?:h[ée]bergement|logement|camping)\s*:?\s*(.*)$/i],
    ["thanks", /^\s*(?:remerciements?|merci)\s*:?\s*(.*)$/i],
  ];
  let current = null;
  for (const line of clean.split("\n")) {
    let matched = false;
    for (const [key, re] of map) {
      const m = line.match(re);
      if (m) {
        current = key;
        // Si du texte suit le titre sur la même ligne, on le garde.
        const inline = (m[1] || "").trim();
        if (inline) sections[current] += inline + "\n";
        matched = true;
        break;
      }
    }
    if (matched) continue;
    if (current) sections[current] += line + "\n";
  }
  const lodgingRaw = sections.lodging.trim();
  // L'hébergement est censé être une URL : on extrait l'URL, on déplie si c'est
  // un lien court, puis on en déduit un nom lisible.
  const urlMatch = lodgingRaw.match(/https?:\/\/\S+/);
  let lodgingUrl = urlMatch ? urlMatch[0] : "";
  let lodgingName = lodgingRaw;
  if (lodgingUrl) {
    const expanded = await expandShortUrl(lodgingUrl);
    lodgingName = lodgingNameFromUrl(expanded);
    lodgingUrl = expanded;
  }
  return {
    description: sections.description.trim(),
    lodgingUrl,
    lodgingName,
    thanks: sections.thanks.trim(),
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

async function syncFolder(drive, folder, cache, force) {
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

  // ── Sync incrémental : si l'empreinte n'a pas changé ET que le JSON existe
  //    encore sur disque ET qu'on a l'étape en cache → on saute tout le travail
  //    coûteux (géocodage, DeepL, conversion d'images) et on réutilise le cache.
  // Clé de cache = empreinte des fichiers binaires + date de modif du Doc notes.
  const fingerprint = fingerprintFiles(files) + "##notes:" + notesDocModified(files);
  const cached = cache?.stages?.[slug];
  if (!force && cached && cached.fingerprint === fingerprint && cached.stage
      && fs.existsSync(stageJsonPath)) {
    console.log(`  ⏭  Inchangé → réutilisé depuis le cache`);
    return { stage: cached.stage, fingerprint, fromCache: true };
  }
  // Diagnostic : pourquoi cette étape se resync-t-elle ?
  if (cached) {
    if (cached.fingerprint !== fingerprint) {
      console.log(`  🔍 Empreinte différente :`);
      console.log(`     ancienne : ${cached.fingerprint}`);
      console.log(`     nouvelle : ${fingerprint}`);
    } else if (!cached.stage) console.log(`  🔍 Cache sans 'stage' → resync`);
    else if (!fs.existsSync(stageJsonPath)) console.log(`  🔍 JSON absent du disque → resync`);
  } else {
    console.log(`  🔍 Aucune entrée de cache pour cette étape → resync`);
  }

  // ── Notes Google Doc : crée le Doc pré-structuré s'il manque, sinon le lit ──
  let docCreatedOrChanged = false;
  let docNotes = { description: "", lodgingUrl: "", lodgingName: "", thanks: "" };
  try {
    let doc = await findNotesDoc(drive, folder.id);
    if (!doc) {
      const id = await createNotesDoc(drive, folder.id);
      console.log(`  📝 Google Doc "notes" créé (à remplir)`);
      doc = { id };
      docCreatedOrChanged = true;
    } else {
      let text = await exportDocText(drive, doc.id);
      // (Re)insère le gabarit UNIQUEMENT si le Doc est vraiment VIDE (aucun texte).
      if (text.trim().length === 0) {
        try {
          await ensureTemplate(doc.id);
          console.log(`  📝 Gabarit inséré dans le Doc "notes" vide`);
          text = await exportDocText(drive, doc.id);
          docCreatedOrChanged = true;
        } catch (e) {
          console.log(`  ⚠️  Gabarit non inséré (${e.message})`);
        }
      }
      docNotes = await parseNotesDoc(text);
      const filled = docNotes.description || docNotes.lodgingUrl || docNotes.thanks;
      console.log(filled ? `  📝 Notes lues depuis le Google Doc` : `  📝 Google Doc "notes" encore vide`);
    }
  } catch (e) {
    console.log(`  ⚠️  Notes Doc : ${e.message}`);
  }

  const mediaDir = path.join(MEDIA_DIR, slug);
  fs.mkdirSync(mediaDir, { recursive: true });

  const tmpDir = path.join("/tmp", slug);
  fs.mkdirSync(tmpDir, { recursive: true });

  let coverWebp = null;
  let thumbWebp = null;
  const photos = [];
  let gpxStats = { distanceKm: 0, elevationGain: 0, maxAltitude: 0 };
  let gpxPublicPath = null;
  const gpxRaw = [];   // { content, startTime } pour tri chronologique
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

    // Ignore les fichiers Google natifs (Docs/Sheets/Slides) : ils ne sont pas
    // téléchargeables en binaire (erreur "Only files with binary content can be
    // downloaded"). Le Google Doc "notes" est déjà traité plus haut via export.
    if ((file.mimeType || "").startsWith("application/vnd.google-apps")) {
      continue;
    }

    // Download
    await downloadFile(drive, file.id, tmpPath);

    // GPX — accumule tous les fichiers .gpx avec leur heure de départ
    if (name.endsWith(".gpx")) {
      const gpxContent = fs.readFileSync(tmpPath, "utf-8");
      // Première balise <time> = heure de départ de ce GPX (pour le tri chronologique)
      const tm = gpxContent.match(/<time>([^<]+)<\/time>/);
      const startTime = tm ? new Date(tm[1]).getTime() : Number.MAX_SAFE_INTEGER;
      gpxRaw.push({ content: gpxContent, startTime, name: file.name });
      console.log(`  📍 GPX trouvé : ${file.name}`);
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

  // Fusion de tous les GPX, dans l'ORDRE CHRONOLOGIQUE (par heure de départ)
  if (gpxRaw.length > 0) {
    gpxRaw.sort((a, b) => a.startTime - b.startTime);
    const orderedContents = gpxRaw.map(g => g.content);

    // Écrit les GPX publics dans le bon ordre (_1, _2, …)
    orderedContents.forEach((content, i) => {
      fs.writeFileSync(path.join(GPX_DIR, `${slug}_${i + 1}.gpx`), content);
    });
    gpxPublicPath = `/gpx/${slug}_1.gpx`;

    gpxStats = mergeGpxFiles(orderedContents);
    console.log(`  📍 Total GPX (${orderedContents.length} fichier(s), triés par heure): ${gpxStats.distanceKm}km, +${gpxStats.elevationGain}m, max ${gpxStats.maxAltitude}m`);
    if (gpxStats.distanceKm === 0) {
      console.warn(`  ⚠️  ATTENTION : distance = 0 km pour ${slug}. GPX vide ou corrompu ?`);
    }
  }

  // Fallback cover
  if (!coverWebp && photos.length > 0) {
    coverWebp = photos[0].src;
    thumbWebp = photos[0].thumb;
  }

  // ── Reverse geocoding : noms de villes + région + pays ──
  let startCity = null, endCity = null, region = null, geoCountry = null, geoCountryCode = null;
  if (gpxStats.startLat != null) {
    const startGeo = await reverseGeocode(gpxStats.startLat, gpxStats.startLng);
    startCity = startGeo.city;
    await new Promise(r => setTimeout(r, 1100));
    const endGeo = await reverseGeocode(gpxStats.endLat, gpxStats.endLng);
    endCity = endGeo.city;
    region = endGeo.region || startGeo.region;
    // Pays via le code ISO (fiable) ; repli sur le nom brut Nominatim
    geoCountry = countryFromCode(endGeo.countryCode || startGeo.countryCode)
      || endGeo.country || startGeo.country || null;
    geoCountryCode = endGeo.countryCode || startGeo.countryCode || null;
    await new Promise(r => setTimeout(r, 1100));
    if (startCity || endCity) {
      console.log(`  📍 Trajet : ${startCity || "?"} → ${endCity || "?"} (${region || "région ?"}, ${geoCountry || "pays ?"})`);
    }
  }

  // ── Contenu : le Google Doc fait foi ──
  // Si la Description du Doc est remplie, elle devient le récit de l'étape.
  // Sinon, on retombe sur les anciennes notes (notes.md) ou le placeholder.
  const docStory = docNotes.description
    ? docNotes.description.split(/\n{2,}/).map(p => p.replace(/\n/g, " ").trim()).filter(Boolean)
    : [];

  const frContent = {
    summary: docNotes.description ? docStory[0] : (notes.summary || ""),
    quote: notes.quote || null,
    fullStory: docStory.length > 0
      ? docStory
      : (notes.fullStory?.length > 0 ? notes.fullStory : []),
  };
  const translations = await translateContent(frContent);

  // Remerciements : traduits (texte libre). L'hébergement est un nom propre +
  // une URL → pas de traduction, on le garde tel quel pour toutes les langues.
  const thanksTr = {};
  if (docNotes.thanks) {
    for (const [code, deeplCode] of Object.entries({ en: "EN", es: "ES", it: "IT", de: "DE", nl: "NL" })) {
      thanksTr[code] = await deeplTranslate(docNotes.thanks, deeplCode);
    }
    thanksTr.fr = docNotes.thanks;
  }

  // ── Points d'intérêt touristiques (Overpass/OSM, côté serveur) ──
  const poisRaw = await fetchPois(gpxStats.endLat, gpxStats.endLng, "fr");
  // ── Spécialités culinaires du pays (Wikidata, côté serveur) ──
  const specialtiesRaw = await fetchSpecialties(geoCountryCode, "fr");
  // null = échec réseau (à réessayer au prochain sync) ; [] = vraiment rien.
  const enrichmentFailed = (poisRaw === null) || (specialtiesRaw === null);
  const pois = poisRaw || [];
  const specialties = specialtiesRaw || [];

  // ── Build stage JSON ──
  const stage = {
    slug,
    date,
    title: notes.title || titleRaw,
    day: `Jour ${computeDayNumber(date)}`,
    location: notes.location || titleRaw,
    country: geoCountry || detectCountry(slug, region),
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
    // Sections supplémentaires du Google Doc (vides si non remplies)
    lodgingUrl: docNotes.lodgingUrl || "",
    lodgingName: docNotes.lodgingName || "",
    thanks: docNotes.thanks || "",
    thanksTranslations: thanksTr,
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
    pois,
    specialties,
  };

  fs.writeFileSync(stageJsonPath, JSON.stringify(stage, null, 2));
  console.log(`  ✅ ${stageJsonPath} généré`);

  // Si le Doc a été créé ou modifié pendant CE run, sa date a changé → on
  // recalcule l'empreinte pour que le cache stocke l'état FINAL. Sinon le run
  // suivant verrait une date différente et resyncerait pour rien.
  let finalFingerprint = fingerprint;
  if (docCreatedOrChanged) {
    const refreshed = await listFilesInFolder(drive, folder.id);
    finalFingerprint = fingerprintFiles(refreshed) + "##notes:" + notesDocModified(refreshed);
  }
  // Si POI ou spécialités ont échoué (réseau), on rend l'empreinte du cache
  // "incomplète" : au prochain sync, elle ne matchera pas → l'étape sera
  // réessayée pour récupérer ce qui manquait. Une fois réussie, l'empreinte
  // redevient normale et le cache reprend son rôle.
  if (enrichmentFailed) {
    finalFingerprint += "##retry:" + Date.now();
  }

  return { stage, fingerprint: finalFingerprint, fromCache: false };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Date du 1er jour de vélo — recalculée dynamiquement au début du sync
// (repli sur cette valeur si aucune date n'est trouvée).
let START_DATE = new Date("2026-05-26");

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

    // Tout autre fichier Google natif (Sheet, Slides, raccourci…) : non
    // téléchargeable en binaire → on l'ignore.
    if ((file.mimeType || "").startsWith("application/vnd.google-apps")) {
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
  docsClient = google.docs({ version: "v1", auth }); // client Docs partagé (création du gabarit)

  // ── Étape 0 : traite les GPX bruts déposés dans _inbox ──
  await processInbox(drive, ROOT_FOLDER_ID);

  // List stage folders
  const folders = await listSubFolders(drive, ROOT_FOLDER_ID);
  console.log(`\n📁 ${folders.length} dossier(s) trouvé(s) sur Drive`);

  if (folders.length === 0) {
    console.log("Aucun dossier d'étape trouvé. Vérifiez DRIVE_FOLDER_ID.");
    return;
  }

  // Détermine la date du 1er jour de vélo = plus ancien dossier daté
  const datedFolders = folders
    .map(f => (f.name.match(/^(\d{4}-\d{2}-\d{2})/) || [])[1])
    .filter(Boolean)
    .sort();
  if (datedFolders.length > 0) {
    START_DATE = new Date(datedFolders[0]);
    console.log(`🚴 Premier jour de vélo : ${datedFolders[0]}`);
  }

  // ── Cache de sync incrémental ──
  const CACHE_PATH = path.join(DATA_DIR, "sync-cache.json");
  const cache = loadSyncCache(CACHE_PATH);
  // Force un resync complet si la variable d'env FORCE_RESYNC=1 est passée
  // (utile pour un "vider le cache" manuel depuis GitHub Actions).
  const force = process.env.FORCE_RESYNC === "1";
  if (force) console.log("⚙️  FORCE_RESYNC=1 → resync complet force");
  const newCache = { version: SYNC_CACHE_VERSION, stages: {} };

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
    const result = await syncFolder(drive, folder, cache, force);
    if (result && result.stage) {
      stages.push(result.stage);
      // Alimente le nouveau cache (empreinte + étape complète réutilisable)
      newCache.stages[result.stage.slug] = {
        fingerprint: result.fingerprint,
        stage: result.stage,
      };
    }
  }

  // Sauvegarde le cache (versionne dans le repo via le commit du workflow)
  fs.writeFileSync(CACHE_PATH, JSON.stringify(newCache));
  const reused = Object.values(newCache.stages).length;
  console.log(`\n💾 Cache de sync mis à jour (${reused} étape(s))`);

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
    lodgingUrl: s.lodgingUrl || "",
    lodgingName: s.lodgingName || "",
    thanks: s.thanks || "",
    thanksTranslations: s.thanksTranslations || {},
    pois: s.pois || [],
    specialties: s.specialties || [],
  }));

  fs.writeFileSync(path.join(DATA_DIR, "trips.json"), JSON.stringify(trips, null, 2));
  console.log(`\n✅ trips.json mis à jour (${trips.length} étape(s))`);

  // ── Generate stats.json ──
  const totalKm = stages.reduce((acc, s) => acc + s.distanceKm, 0);
  const totalElevation = stages.reduce((acc, s) => acc + s.elevationGain, 0);
  const countries = [...new Set(stages.map(s => s.country).filter(c => c !== "—"))];
  const lastStage = stages[stages.length - 1];

  // Nombre de jours d'aventure = du premier GPX (1ère étape par date) jusqu'à aujourd'hui
  const dates = stages.map(s => s.date).filter(Boolean).sort();
  const firstDate = dates[0] || null;
  let totalDays = stages.length;  // repli si aucune date
  if (firstDate) {
    const start = new Date(firstDate);
    const now = new Date();
    // +1 pour inclure le jour de départ (jour 1 = premier jour de vélo)
    totalDays = Math.floor((now - start) / (1000 * 60 * 60 * 24)) + 1;
    if (totalDays < 1) totalDays = 1;
  }

  const stats = {
    totalKm: Math.round(totalKm),
    totalCountries: countries.length || 1,
    totalDays,
    totalStages: stages.length,
    totalElevation: Math.round(totalElevation),
    currentCountry: lastStage?.country || "France",
    currentLocation: lastStage?.endCity || lastStage?.location || "Saint-Nazaire",
    startDate: firstDate || "2026-05-26",
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
