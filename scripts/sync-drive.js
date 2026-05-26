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

async function downloadFile(drive, fileId, destPath) {
  const dest = fs.createWriteStream(destPath);
  const res = await drive.files.get({ fileId, alt: "media" }, { responseType: "stream" });
  await new Promise((resolve, reject) => {
    res.data.pipe(dest);
    res.data.on("end", resolve);
    res.data.on("error", reject);
  });
}

// ─── Image processing ─────────────────────────────────────────────────────────

async function processImage(srcPath, destDir, baseName) {
  const webpPath = path.join(destDir, `${baseName}.webp`);
  const thumbPath = path.join(destDir, `thumb_${baseName}.webp`);

  // Full WebP
  await sharp(srcPath)
    .webp({ quality: 85 })
    .resize(1600, null, { withoutEnlargement: true })
    .toFile(webpPath);

  // Thumbnail
  await sharp(srcPath)
    .webp({ quality: 70 })
    .resize(400, 260, { fit: "cover" })
    .toFile(thumbPath);

  return {
    webp: webpPath.replace("public", ""),
    thumb: thumbPath.replace("public", ""),
  };
}

// ─── GPX parsing ─────────────────────────────────────────────────────────────

function parseGpx(gpxContent) {
  const gpx = new GpxParser();
  gpx.parse(gpxContent);

  if (!gpx.tracks || gpx.tracks.length === 0) {
    return { distanceKm: 0, elevationGain: 0, maxAltitude: 0 };
  }

  const track = gpx.tracks[0];
  const distanceKm = Math.round(track.distance.total / 100) / 10;

  // Elevation gain (sum of positive deltas)
  let elevationGain = 0;
  let maxAlt = 0;
  const points = track.points;
  for (let i = 1; i < points.length; i++) {
    const delta = points[i].ele - points[i - 1].ele;
    if (delta > 0) elevationGain += delta;
    if (points[i].ele > maxAlt) maxAlt = points[i].ele;
  }

  return {
    distanceKm,
    elevationGain: Math.round(elevationGain),
    maxAltitude: Math.round(maxAlt),
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
  };

  let inStory = false;
  for (const line of lines) {
    if (line.startsWith("# ")) { result.title = line.slice(2); continue; }
    if (line.startsWith("summary:")) { result.summary = line.slice(8).trim(); continue; }
    if (line.startsWith("quote:")) { result.quote = line.slice(6).trim(); continue; }
    if (line.startsWith("location:")) { result.location = line.slice(9).trim(); continue; }
    if (line.startsWith("highlight:")) { result.highlights.push(line.slice(10).trim()); continue; }
    if (line.startsWith("weather:")) {
      // Format: weather: Ensoleillé, 22°C, 15kph
      const parts = line.slice(8).trim().split(",");
      result.weather = {
        condition: parts[0]?.trim() || "—",
        tempC: parseInt(parts[1]) || 0,
        windKph: parseInt(parts[2]) || 0,
      };
      continue;
    }
    if (line === "---") { inStory = !inStory; continue; }
    if (inStory && line.length > 10) result.fullStory.push(line);
  }

  return result;
}

// ─── Main sync logic ──────────────────────────────────────────────────────────

async function syncFolder(drive, folder) {
  const slug = folder.name; // e.g. "2026-08-14-turin-susa"
  console.log(`\n📂 Traitement : ${slug}`);

  // Check if already synced
  const stageJsonPath = path.join(TRIPS_DIR, `${slug}.json`);
  if (fs.existsSync(stageJsonPath)) {
    console.log(`  ✓ Déjà synchronisé, on passe.`);
    return JSON.parse(fs.readFileSync(stageJsonPath, "utf-8"));
  }

  const files = await listFilesInFolder(drive, folder.id);
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
  let notes = {};

  // Parse date and title from slug
  // Format: YYYY-MM-DD-from-to
  const parts = slug.split("-");
  const date = parts.slice(0, 3).join("-");
  const titleRaw = parts.slice(3).join(" → ").replace(/-/g, " → ");

  // ── Download and process each file ──
  for (const file of files) {
    const name = file.name.toLowerCase();
    const tmpPath = path.join(tmpDir, file.name);

    // Download
    await downloadFile(drive, file.id, tmpPath);

    // GPX
    if (name.endsWith(".gpx")) {
      const gpxContent = fs.readFileSync(tmpPath, "utf-8");
      gpxStats = parseGpx(gpxContent);
      const gpxDest = path.join(GPX_DIR, `${slug}.gpx`);
      fs.copyFileSync(tmpPath, gpxDest);
      gpxPublicPath = `/gpx/${slug}.gpx`;
      console.log(`  📍 GPX: ${gpxStats.distanceKm}km, +${gpxStats.elevationGain}m, max ${gpxStats.maxAltitude}m`);
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

      if (name.startsWith("cover")) {
        coverWebp = paths.webp;
        thumbWebp = paths.thumb;
      } else {
        photos.push({
          src: paths.webp,
          thumb: paths.thumb,
          alt: baseName,
        });
      }
    }
  }

  // Fallback cover
  if (!coverWebp && photos.length > 0) {
    coverWebp = photos[0].src;
    thumbWebp = photos[0].thumb;
  }

  // ── Build stage JSON ──
  const stage = {
    slug,
    date,
    title: notes.title || titleRaw,
    day: `Jour ${computeDayNumber(date)}`,
    location: notes.location || titleRaw,
    country: detectCountry(slug),
    distanceKm: gpxStats.distanceKm,
    elevationGain: gpxStats.elevationGain,
    maxAltitude: gpxStats.maxAltitude || undefined,
    coverImage: coverWebp || "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&q=80&w=1600",
    heroVideo: null,
    summary: notes.summary || "",
    fullStory: notes.fullStory.length > 0 ? notes.fullStory : ["Cette étape sera bientôt documentée."],
    quote: notes.quote || null,
    photos: coverWebp ? [{ src: coverWebp, thumb: thumbWebp, alt: "Cover" }, ...photos] : photos,
    videos: [],
    gpxFile: gpxPublicPath,
    highlights: notes.highlights,
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
function detectCountry(slug) {
  if (slug.includes("france") || slug.includes("paris") || slug.includes("lyon") || slug.includes("saint-nazaire")) return "France";
  if (slug.includes("italy") || slug.includes("turin") || slug.includes("milan") || slug.includes("susa")) return "Italy";
  if (slug.includes("austria") || slug.includes("wien") || slug.includes("salzburg")) return "Austria";
  if (slug.includes("hungary") || slug.includes("budapest")) return "Hungary";
  if (slug.includes("romania") || slug.includes("bucharest")) return "Romania";
  if (slug.includes("turkey") || slug.includes("istanbul")) return "Turkey";
  if (slug.includes("iran")) return "Iran";
  if (slug.includes("uzbekistan") || slug.includes("bukhara") || slug.includes("samarkand")) return "Uzbekistan";
  if (slug.includes("tajikistan") || slug.includes("pamir") || slug.includes("dushanbe")) return "Tajikistan";
  if (slug.includes("kyrgyzstan") || slug.includes("bishkek")) return "Kyrgyzstan";
  if (slug.includes("kazakhstan") || slug.includes("almaty")) return "Kazakhstan";
  return "—";
}

// ─── Entry point ─────────────────────────────────────────────────────────────

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

  // List stage folders
  const folders = await listSubFolders(drive, ROOT_FOLDER_ID);
  console.log(`\n📁 ${folders.length} dossier(s) trouvé(s) sur Drive`);

  if (folders.length === 0) {
    console.log("Aucun dossier d'étape trouvé. Vérifiez DRIVE_FOLDER_ID.");
    return;
  }

  const stages = [];
  for (const folder of folders) {
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
    distanceKm: s.distanceKm,
    elevationGain: s.elevationGain,
    coverImage: s.coverImage,
    thumbnail: s.photos[0]?.thumb || s.coverImage,
    shortDescription: s.summary || "",
    hasVideo: s.videos.length > 0,
    hasGpx: !!s.gpxFile,
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
    currentLocation: lastStage?.location || "Saint-Nazaire, France",
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
