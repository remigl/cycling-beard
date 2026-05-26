// ─── Trip list (trips.json) ──────────────────────────────────────────────────
export interface TripSummary {
  slug: string;
  date: string;
  title: string;
  country: string;
  distanceKm: number;
  elevationGain: number;
  coverImage: string;
  thumbnail: string;
  shortDescription: string;
  hasVideo: boolean;
  hasGpx: boolean;
  mapLat?: number;
  mapLng?: number;
}

// ─── Stats (stats.json) ──────────────────────────────────────────────────────
export interface SiteStats {
  totalKm: number;
  totalCountries: number;
  totalDays: number;
  totalElevation: number;
  currentCountry: string;
  currentLocation: string;
  startDate: string;
  lastUpdate: string;
  latestStageSlug: string;
}

// ─── Full stage detail (trips/<slug>.json) ───────────────────────────────────
export interface StagePhoto {
  src: string;
  thumb: string;
  alt: string;
}

export interface StageVideo {
  url: string;
  thumb?: string;
  title?: string;
}

export interface StageWeather {
  condition: string;
  tempC: number;
  windKph: number;
}

export interface StageDetail {
  slug: string;
  date: string;
  title: string;
  day: string;
  location: string;
  country: string;
  distanceKm: number;
  elevationGain: number;
  maxAltitude?: number;
  coverImage: string;
  heroVideo?: string | null;
  summary: string;
  fullStory: string[];
  quote?: string;
  photos: StagePhoto[];
  videos: StageVideo[];
  gpxFile?: string | null;
  mapLat?: number;
  mapLng?: number;
  highlights?: string[];
  weather?: StageWeather;
}

// ─── Legacy — kept for comments only ────────────────────────────────────────
export interface Comment {
  id: string;
  entryId: string;
  author: string;
  text: string;
  timestamp: string;
}
