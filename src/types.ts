// ─── Trip list (trips.json) ──────────────────────────────────────────────────
export interface TripSummary {
  slug: string;
  date: string;
  title: string;
  country: string;
  region?: string | null;
  startCity?: string | null;
  endCity?: string | null;
  distanceKm: number;
  elevationGain: number;
  coverImage: string;
  thumbnail: string;
  shortDescription: string;
  hasVideo: boolean;
  hasGpx: boolean;
  mapLat?: number;
  mapLng?: number;
  track?: [number, number][];
  segments?: [number, number][][];
  tags?: string[];
  fullStory?: string[];
  photos?: { src: string; thumb: string; alt: string }[];
  translations?: Record<string, { summary: string; quote: string | null; fullStory: string[] }>;
  elevProfile?: [number, number][];
  minAltitude?: number | null;
  lodgingUrl?: string;
  lodgingName?: string;
  thanks?: string;
  thanksTranslations?: Record<string, string>;
  pois?: Poi[];
  majorCities?: string[];
  specialties?: Specialty[];
}

export interface Specialty {
  title: string;
  image?: string | null;
  wikipedia?: string | null;
}

export interface Poi {
  title: string;
  dist: number;
  kind: string;
  rank: number;
  wikiTitle?: string | null;
}

// ─── Stats (stats.json) ──────────────────────────────────────────────────────
export interface SiteStats {
  totalKm: number;
  totalCountries: number;
  totalDays: number;
  totalElevation: number;
  currentCountry: string;
  currentCountryCode?: string;
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
  region?: string | null;
  startCity?: string | null;
  endCity?: string | null;
  distanceKm: number;
  elevationGain: number;
  maxAltitude?: number;
  minAltitude?: number | null;
  elevProfile?: [number, number][];
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
  track?: [number, number][];
  segments?: [number, number][][];
  tags?: string[];
  translations?: Record<string, { summary: string; quote: string | null; fullStory: string[] }>;
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
