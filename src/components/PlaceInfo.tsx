import { X } from "lucide-react";
import { TripSummary } from "../types";
import { Lang } from "../i18n";
import BirdList from "./BirdList";

interface PlaceInfoProps {
  trip: TripSummary;
  lang: Lang;
  onClose: () => void;
  t: (key: string) => string;
}

// Popup eBird : simple habillage autour de BirdList (aucune logique dupliquée)
export default function PlaceInfo({ trip, lang, onClose, t }: PlaceInfoProps) {
  return (
    <div className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center p-3" onClick={onClose}>
      <div
        className="relative w-full max-w-lg bg-[#1c1b1b] rounded-2xl border border-white/10 flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header fixe avec croix */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
          <span className="font-display font-bold text-sm text-white uppercase tracking-wider truncate">
            {trip.startCity || trip.title}
          </span>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center text-white cursor-pointer shrink-0 ml-2">
            <X size={18} />
          </button>
        </div>

        {/* Contenu défilable */}
        <div className="overflow-y-auto px-5 py-4">
          <BirdList lat={trip.mapLat} lng={trip.mapLng} lang={lang} t={t} />
        </div>
      </div>
    </div>
  );
}
