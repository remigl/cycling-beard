// Libellés des types de lieux dans la langue choisie.
// - POI OpenStreetMap : le sync stocke le type en français ("Musée"…)
// - Google Places : types techniques en anglais ("tourist_attraction"…)
type L = [fr: string, en: string, es: string, it: string, de: string, nl: string];
const LANGS = ["fr", "en", "es", "it", "de", "nl"];

const KINDS: Record<string, L> = {
  attraction: ["Attraction", "Attraction", "Atracción", "Attrazione", "Sehenswürdigkeit", "Bezienswaardigheid"],
  castle: ["Château / fort", "Castle / fort", "Castillo / fuerte", "Castello / forte", "Burg / Festung", "Kasteel / fort"],
  museum: ["Musée", "Museum", "Museo", "Museo", "Museum", "Museum"],
  monument: ["Monument / ruines", "Monument / ruins", "Monumento / ruinas", "Monumento / rovine", "Denkmal / Ruinen", "Monument / ruïnes"],
  viewpoint: ["Point de vue", "Viewpoint", "Mirador", "Punto panoramico", "Aussichtspunkt", "Uitzichtpunt"],
  worship: ["Édifice religieux", "Religious building", "Edificio religioso", "Edificio religioso", "Religiöses Bauwerk", "Religieus gebouw"],
  themepark: ["Parc à thème / zoo", "Theme park / zoo", "Parque temático / zoo", "Parco a tema / zoo", "Freizeitpark / Zoo", "Pretpark / dierentuin"],
  nature: ["Site naturel", "Natural site", "Sitio natural", "Sito naturale", "Naturstätte", "Natuurgebied"],
  art: ["Œuvre / art", "Artwork", "Obra de arte", "Opera d'arte", "Kunstwerk", "Kunstwerk"],
  park: ["Parc", "Park", "Parque", "Parco", "Park", "Park"],
  restaurant: ["Restaurant", "Restaurant", "Restaurante", "Ristorante", "Restaurant", "Restaurant"],
  cafe: ["Café", "Café", "Cafetería", "Caffè", "Café", "Café"],
  bar: ["Bar", "Bar", "Bar", "Bar", "Bar", "Bar"],
  hotel: ["Hébergement", "Accommodation", "Alojamiento", "Alloggio", "Unterkunft", "Accommodatie"],
  temple: ["Temple / sanctuaire", "Temple / shrine", "Templo / santuario", "Tempio / santuario", "Tempel / Schrein", "Tempel / heiligdom"],
  landmark: ["Lieu historique", "Historical landmark", "Lugar histórico", "Luogo storico", "Historische Stätte", "Historische plek"],
  market: ["Marché", "Market", "Mercado", "Mercato", "Markt", "Markt"],
  beach: ["Plage", "Beach", "Playa", "Spiaggia", "Strand", "Strand"],
  shopping: ["Boutique", "Shop", "Tienda", "Negozio", "Geschäft", "Winkel"],
};

// Type OSM (libellé français) ou type Google → clé
const ALIASES: Record<string, string> = {
  "Attraction": "attraction", "Château / fort": "castle", "Musée": "museum",
  "Monument / ruines": "monument", "Point de vue": "viewpoint", "Édifice religieux": "worship",
  "Parc à thème / zoo": "themepark", "Site naturel": "nature", "Œuvre / art": "art", "Parc": "park",
  tourist_attraction: "attraction", museum: "museum", art_gallery: "museum", park: "park",
  national_park: "nature", natural_feature: "nature", hiking_area: "nature", beach: "beach",
  church: "worship", place_of_worship: "worship", mosque: "worship", synagogue: "worship",
  hindu_temple: "temple", buddhist_temple: "temple", shinto_shrine: "temple",
  historical_landmark: "landmark", historical_place: "landmark", monument: "monument", castle: "castle",
  amusement_park: "themepark", zoo: "themepark", aquarium: "themepark",
  observation_deck: "viewpoint", restaurant: "restaurant", cafe: "cafe", coffee_shop: "cafe",
  bar: "bar", lodging: "hotel", hotel: "hotel", market: "market", shopping_mall: "shopping", store: "shopping",
};

/** Libellé traduit d'un type de lieu, ou "" s'il est inconnu (rien plutôt qu'une autre langue) */
export function placeKindLabel(kindOrTypes: string | string[] | null | undefined, lang: string): string {
  const list = Array.isArray(kindOrTypes) ? kindOrTypes : kindOrTypes ? [kindOrTypes] : [];
  const i = Math.max(0, LANGS.indexOf(lang));
  for (const k of list) {
    const key = ALIASES[k];
    if (key && KINDS[key]) return KINDS[key][i];
  }
  return "";
}
