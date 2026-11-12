// Types d'étape (mode de déplacement) : couleur du tracé, style, icône.
// Source unique utilisée par la carte, l'itinéraire et les stats.
export type StageType = "bike" | "boat" | "bus" | "plane" | "train" | "transport";

export const STAGE_TYPE_ORDER: StageType[] = ["bike", "train", "bus", "boat", "plane", "transport"];

export interface StageTypeMeta {
  emoji: string;
  color: string;          // couleur du tracé / des pastilles
  dashArray?: string;     // style Leaflet du tracé (absent = trait plein)
  weight: number;
  hasElevation: boolean;  // le dénivelé n'a de sens qu'à vélo
}

export const STAGE_TYPE_META: Record<StageType, StageTypeMeta> = {
  bike:      { emoji: "🚴", color: "#E8620A", weight: 5, hasElevation: true },
  train:     { emoji: "🚆", color: "#C2398B", dashArray: "12 7", weight: 4, hasElevation: false },
  bus:       { emoji: "🚌", color: "#2E9E5B", dashArray: "9 8", weight: 4, hasElevation: false },
  boat:      { emoji: "⛴️", color: "#1E88C9", dashArray: "2 9", weight: 4, hasElevation: false },
  plane:     { emoji: "✈️", color: "#7C5CD6", dashArray: "1 12", weight: 4, hasElevation: false },
  transport: { emoji: "🧭", color: "#5B7C8A", dashArray: "6 9", weight: 4, hasElevation: false },
};

// Les anciennes étapes n'ont pas de champ `type` : vélo par défaut,
// ou "transport" si elles sont marquées `transport`.
export function tripType(t: { type?: string; transport?: boolean }): StageType {
  const ty = t.type as StageType | undefined;
  if (ty && ty in STAGE_TYPE_META) return ty;
  return t.transport ? "transport" : "bike";
}
