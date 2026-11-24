// Nom de pays dans la langue choisie, dérivé du code ISO (Intl.DisplayNames).
// Les données du sync stockent le nom en français + le code ISO : on traduit à
// partir du code, ce qui couvre TOUS les pays (plus de liste à compléter).
const FR_TO_CODE: Record<string, string> = {
  // Repli pour les anciennes étapes qui n'ont pas encore de code ISO
  France: "FR", Suisse: "CH", Allemagne: "DE", Autriche: "AT", Slovaquie: "SK",
  Hongrie: "HU", Croatie: "HR", Serbie: "RS", Roumanie: "RO", Bulgarie: "BG",
  Italie: "IT", Slovénie: "SI",
};

/** Mémorise les couples (nom FR → code) présents dans les données */
export function registerCountryCodes(items: { country?: string; countryCode?: string | null }[]) {
  for (const it of items) {
    if (it.country && it.countryCode && it.country !== "—") FR_TO_CODE[it.country] = it.countryCode.toUpperCase();
  }
}

const displayNames = new Map<string, Intl.DisplayNames | null>();
function namesFor(lang: string): Intl.DisplayNames | null {
  if (!displayNames.has(lang)) {
    try { displayNames.set(lang, new Intl.DisplayNames([lang], { type: "region" })); }
    catch { displayNames.set(lang, null); }
  }
  return displayNames.get(lang) || null;
}

/** "Japon" + "en" → "Japan" ; renvoie le nom d'origine si la traduction est impossible */
export function countryName(frName: string, lang: string, code?: string | null): string {
  if (!frName || frName === "—" || lang === "fr") return frName;
  const c = (code || FR_TO_CODE[frName] || "").toUpperCase();
  if (!c) return frName;
  try {
    const n = namesFor(lang)?.of(c);
    return n && n !== c ? n : frName;
  } catch { return frName; }
}

/** Drapeau emoji d'un pays (depuis son code ISO, ou son nom français) */
export function countryFlag(frName?: string | null, code?: string | null): string {
  const c = (code || (frName ? FR_TO_CODE[frName] : "") || "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return "";
  return c.replace(/./g, ch => String.fromCodePoint(127397 + ch.charCodeAt(0)));
}
