import { ChevronLeft, MapPin, TrendingUp, Calendar, Mountain, Send, Sparkles, AlertTriangle } from "lucide-react";
import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { StageDetail } from "../types";
import { Lang } from "../i18n";
import RideReplay from "./RideReplay";

interface StageDetailViewProps {
  slug: string;
  onNavigate: (tab: string, arg?: string) => void;
  lang: Lang;
  t: (key: string) => string;
}

interface Comment {
  id: string;
  author: string;
  text: string;
  date: string;
}

export default function StageDetailView({ slug, onNavigate, lang, t }: StageDetailViewProps) {
  const [stage, setStage] = useState<StageDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [activeTab, setActiveTab] = useState<"story" | "technical" | "replay">("story");
  const [comments, setComments] = useState<Comment[]>([]);
  const [authorName, setAuthorName] = useState("");
  const [commentText, setCommentText] = useState("");
  const [success, setSuccess] = useState(false);
  const [lightbox, setLightbox] = useState<number | null>(null);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    setError(false);
    fetch(`/data/trips/${slug}.json`)
      .then(r => {
        if (!r.ok) throw new Error("not found");
        return r.json();
      })
      .then((data: StageDetail) => {
        setStage(data);
        setLoading(false);
        const saved = localStorage.getItem(`tcb_comments_${slug}`);
        if (saved) setComments(JSON.parse(saved));
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, [slug]);

  const handlePostComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!authorName.trim() || !commentText.trim() || !stage) return;
    const newComment: Comment = {
      id: Date.now().toString(),
      author: authorName,
      text: commentText,
      date: new Date().toLocaleDateString("fr-FR"),
    };
    const updated = [...comments, newComment];
    setComments(updated);
    localStorage.setItem(`tcb_comments_${slug}`, JSON.stringify(updated));
    setAuthorName("");
    setCommentText("");
    setSuccess(true);
    setTimeout(() => setSuccess(false), 3000);
  };

  if (loading) {
    return (
      <div className="w-full min-h-screen pt-24 flex items-center justify-center bg-bg-dark">
        <div className="font-mono text-[10px] text-brand-sand uppercase tracking-widest animate-pulse">
          {t("loading")}
        </div>
      </div>
    );
  }

  if (error || !stage) {
    return (
      <div className="w-full min-h-screen pt-24 flex flex-col items-center justify-center bg-bg-dark gap-4">
        <AlertTriangle size={32} className="text-brand-sand" />
        <p className="font-mono text-xs text-text-dim">{t("not_found")}</p>
        <button onClick={() => onNavigate("journey")} className="text-brand-sand text-xs font-mono underline cursor-pointer">
          {t("stage.back")}
        </button>
      </div>
    );
  }

  // Photos de galerie = toutes sauf la cover (index 0)
  const galleryPhotos = stage.photos.length > 1 ? stage.photos.slice(1) : stage.photos;

  // Contenu localisé : on prend la traduction si dispo, sinon le français par défaut
  const localized = stage.translations?.[lang] || {
    summary: stage.summary,
    quote: stage.quote,
    fullStory: stage.fullStory,
  };
  const dispSummary = localized.summary || stage.summary;
  const dispQuote = localized.quote ?? stage.quote;
  const dispStory = (localized.fullStory && localized.fullStory.length > 0) ? localized.fullStory : stage.fullStory;

  const placeholderTexts = ["Cette étape sera bientôt documentée.", "This stage will be documented soon."];
  const hasStory = dispStory.length > 0 && !placeholderTexts.includes(dispStory[0]);
  const hasSummary = dispSummary && dispSummary.trim().length > 0;

  return (
    <div className="w-full flex flex-col pt-16 bg-bg-dark text-text-on text-left">

      {/* Lightbox */}
      {lightbox !== null && (
        <div
          className="fixed inset-0 z-[9999] bg-black/95 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <div className="max-w-5xl w-full flex flex-col items-center gap-3" onClick={e => e.stopPropagation()}>
            <img
              src={galleryPhotos[lightbox]?.src}
              alt={galleryPhotos[lightbox]?.alt}
              className="max-h-[80vh] w-auto object-contain rounded"
            />
            {galleryPhotos[lightbox]?.alt && (
              <p className="font-mono text-xs text-brand-sand uppercase tracking-wider">
                {galleryPhotos[lightbox].alt}
              </p>
            )}
            <div className="flex items-center gap-6 mt-2">
              <button
                onClick={() => setLightbox(i => i !== null && i > 0 ? i - 1 : galleryPhotos.length - 1)}
                className="text-text-dim hover:text-white font-mono text-xs cursor-pointer"
              >← Préc.</button>
              <span className="font-mono text-[10px] text-text-dim">{lightbox + 1} / {galleryPhotos.length}</span>
              <button
                onClick={() => setLightbox(i => i !== null && i < galleryPhotos.length - 1 ? i + 1 : 0)}
                className="text-text-dim hover:text-white font-mono text-xs cursor-pointer"
              >Suiv. →</button>
            </div>
            <button onClick={() => setLightbox(null)} className="mt-2 font-mono text-[10px] text-text-dim hover:text-white cursor-pointer uppercase tracking-wider">
              Fermer ✕
            </button>
          </div>
        </div>
      )}

      {/* Hero */}
      <div className="relative w-full h-[60vh] md:h-[70vh] flex items-end justify-start overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-t from-bg-dark via-black/40 to-transparent z-10" />
        <img
          src={stage.coverImage}
          alt={stage.title}
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover filter brightness-80 saturate-90 scale-102"
        />
        <div className="relative z-20 px-6 md:px-14 pb-10 max-w-4xl">
          <button
            onClick={() => onNavigate("journey")}
            className="flex items-center gap-1.5 font-mono text-[9px] text-brand-sand uppercase tracking-wider mb-4 hover:underline cursor-pointer"
          >
            <ChevronLeft size={12} /> {t("stage.back")}
          </button>
          <span className="bg-brand-sand/30 text-brand-sand border border-brand-sand/30 font-mono text-[9px] uppercase tracking-widest px-3 py-1 rounded">
            {stage.day} — {stage.country}
          </span>
          <h1 className="font-display font-black text-3xl sm:text-5xl md:text-6xl text-text-on uppercase mt-3 leading-tight tracking-tight">
            {stage.title}
          </h1>
          <div className="flex flex-wrap items-center gap-5 mt-4 text-xs font-mono text-text-dim text-opacity-80">
            <span className="flex items-center gap-1"><MapPin size={12} className="text-brand-sand" /> {stage.location}</span>
            <span>•</span>
            <span className="flex items-center gap-1"><Calendar size={12} /> {stage.date}</span>
            {stage.distanceKm > 0 && (
              <><span>•</span><span className="flex items-center gap-1"><TrendingUp size={12} /> {stage.distanceKm} km</span></>
            )}
            {stage.elevationGain > 0 && (
              <><span>•</span><span className="flex items-center gap-1"><Mountain size={12} /> +{stage.elevationGain} m</span></>
            )}
          </div>
        </div>
      </div>

      {/* Tab nav */}
      <div className="border-y border-white/5 bg-[#1c1b1b] px-6 md:px-14 py-3 sticky top-[48px] z-40">
        <div className="max-w-7xl mx-auto flex gap-6 font-display text-[10px] uppercase tracking-widest font-bold">
          {(["story", "technical", "replay"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-0.5 cursor-pointer transition-colors ${
                activeTab === tab
                  ? "text-brand-sand border-b-2 border-brand-sand font-black"
                  : "text-text-dim text-opacity-60 hover:text-opacity-100"
              }`}
            >
              {tab === "story" ? t("stage.story") : tab === "technical" ? t("stage.technical") : t("stage.replay")}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 md:px-14 py-12 md:py-20 w-full">
        {activeTab === "story" ? (
          <div className="grid lg:grid-cols-12 gap-12 items-start">

            {/* Story */}
            <div className="lg:col-span-8 flex flex-col gap-6">

              {/* Summary / description courte */}
              {hasSummary && (
                <p className="text-base md:text-lg text-text-on font-light leading-relaxed border-l-2 border-brand-sand/40 pl-4">
                  {dispSummary}
                </p>
              )}

              {/* Récit complet */}
              {hasStory && (
                <div className="flex flex-col gap-5 text-sm md:text-base text-text-dim leading-relaxed font-light">
                  {dispStory.map((para, i) => (
                    <p key={i}>
                      {i === 0 ? (
                        <>
                          <span className="font-display font-black text-4xl md:text-5xl text-brand-sand float-left mr-3 mt-1 leading-none">
                            {para.charAt(0)}
                          </span>
                          {para.slice(1)}
                        </>
                      ) : para}
                    </p>
                  ))}
                </div>
              )}

              {!hasStory && !hasSummary && (
                <p className="text-sm text-text-dim text-opacity-50 italic">
                  {t("stage.soon")}
                </p>
              )}

              {dispQuote && (
                <div className="my-4 border-l-2 border-brand-sand pl-6 italic text-brand-sand/90 text-base md:text-lg">
                  "{dispQuote}"
                </div>
              )}

              {/* Galerie photos avec titres */}
              {galleryPhotos.length > 0 && (
                <div className="mt-4">
                  <h3 className="font-display font-bold text-xs uppercase text-text-on tracking-wider mb-4 flex items-center gap-2">
                    <span className="w-1 h-4 bg-brand-sand rounded" />
                    {t("stage.photos")} ({galleryPhotos.length})
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    {galleryPhotos.map((photo, i) => (
                      <div
                        key={i}
                        className="flex flex-col gap-1 cursor-pointer group"
                        onClick={() => setLightbox(i)}
                      >
                        <div className="overflow-hidden rounded-lg aspect-video">
                          <img
                            src={photo.src}
                            alt={photo.alt}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        </div>
                        {photo.alt && (
                          <p className="font-mono text-[9px] text-text-dim text-opacity-60 uppercase tracking-wider px-0.5">
                            {photo.alt}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Comments */}
              <div className="mt-16 pt-10 border-t border-white/5">
                <div className="flex items-center gap-2 mb-6">
                  <Sparkles size={16} className="text-brand-sand" />
                  <h3 className="font-display text-lg font-bold uppercase text-text-on">
                    {t("stage.comments")} ({comments.length})
                  </h3>
                </div>
                <div className="flex flex-col gap-4 mb-10">
                  {comments.length === 0 ? (
                    <p className="text-xs text-text-dim text-opacity-40 italic">{t("stage.no_comment")}</p>
                  ) : (
                    comments.map(c => (
                      <div key={c.id} className="bg-[#1c1b1b] border border-white/5 rounded p-4 text-xs">
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-display font-bold text-text-on uppercase tracking-wide">{c.author}</span>
                          <span className="font-mono text-[9px] text-text-dim text-opacity-40">{c.date}</span>
                        </div>
                        <p className="text-text-dim text-opacity-90 leading-relaxed italic">"{c.text}"</p>
                      </div>
                    ))
                  )}
                </div>
                <form onSubmit={handlePostComment} className="bg-[#1c1b1b] border border-white/5 rounded-lg p-6 max-w-xl">
                  <span className="font-mono text-[9px] text-brand-sand font-bold tracking-widest uppercase block mb-3">
                    {t("stage.leave_comment")}
                  </span>
                  <div className="mb-4">
                    <label className="block text-text-dim text-opacity-50 font-mono text-[8px] uppercase tracking-wider mb-1">{t("stage.your_name")}</label>
                    <input
                      type="text" required placeholder="Votre prénom"
                      value={authorName} onChange={e => setAuthorName(e.target.value)}
                      className="w-full bg-bg-dark border border-white/10 rounded px-3 py-2 text-xs text-text-on focus:outline-none focus:border-brand-sand"
                    />
                  </div>
                  <div className="mb-4">
                    <label className="block text-text-dim text-opacity-50 font-mono text-[8px] uppercase tracking-wider mb-1">{t("stage.comment")}</label>
                    <textarea
                      rows={3} required placeholder="Votre message..."
                      value={commentText} onChange={e => setCommentText(e.target.value)}
                      className="w-full bg-bg-dark border border-white/10 rounded px-3 py-2 text-xs text-text-on focus:outline-none focus:border-brand-sand resize-none"
                    />
                  </div>
                  <button type="submit" className="bg-brand-sand text-bg-dark font-display text-[9px] font-bold uppercase tracking-widest px-5 py-2 rounded cursor-pointer hover:bg-opacity-90 transition-all flex items-center gap-1.5">
                    <Send size={11} /> Publier
                  </button>
                  {success && (
                    <div className="mt-3 bg-brand-green/20 text-brand-sand border border-brand-sand/30 p-2 rounded text-xs text-center">
                      {t("stage.published")}
                    </div>
                  )}
                </form>
              </div>
            </div>

            {/* Sidebar */}
            <div className="lg:col-span-4 flex flex-col gap-6 sticky top-[120px]">
              <div className="bg-[#1c1b1b] border border-white/5 rounded-lg p-6">
                <h3 className="font-display font-black text-xs uppercase text-text-on tracking-wider mb-4 border-b border-white/5 pb-2">
                  {t("stage.stats")}
                </h3>
                <div className="flex flex-col gap-4 font-mono text-xs">
                  {stage.startCity && (
                    <div className="flex justify-between">
                      <span className="text-text-dim text-opacity-50">{t("stage.start")}</span>
                      <span className="text-text-on">{stage.startCity}</span>
                    </div>
                  )}
                  {stage.endCity && (
                    <div className="flex justify-between">
                      <span className="text-text-dim text-opacity-50">{t("stage.end")}</span>
                      <span className="text-text-on">{stage.endCity}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-text-dim text-opacity-50">{t("stage.distance")}</span>
                    <span className="text-brand-sand font-bold">{stage.distanceKm > 0 ? `${stage.distanceKm} km` : "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-dim text-opacity-50">{t("stage.elevation")}</span>
                    <span className="text-text-on font-semibold">{stage.elevationGain > 0 ? `${stage.elevationGain} m` : "—"}</span>
                  </div>
                  {stage.maxAltitude && (
                    <div className="flex justify-between">
                      <span className="text-text-dim text-opacity-50">{t("stage.altitude")}</span>
                      <span className="text-text-on font-semibold">{stage.maxAltitude} m</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-text-dim text-opacity-50">{t("stage.country")}</span>
                    <span className="text-text-on">{stage.country !== "—" ? stage.country : "France"}</span>
                  </div>
                  {stage.weather && (
                    <div className="flex justify-between">
                      <span className="text-text-dim text-opacity-50">{t("stage.weather")}</span>
                      <span className="text-text-on">{stage.weather.condition}, {stage.weather.tempC}°C</span>
                    </div>
                  )}
                </div>
              </div>

              {stage.highlights && stage.highlights.length > 0 && (
                <div className="bg-[#1c1b1b] border border-white/5 rounded-lg p-6">
                  <h3 className="font-display font-black text-xs uppercase text-text-on tracking-wider mb-4 border-b border-white/5 pb-2">
                    {t("stage.highlights")}
                  </h3>
                  <ul className="flex flex-col gap-2">
                    {stage.highlights.map((h, i) => (
                      <li key={i} className="flex items-center gap-2 font-mono text-xs text-text-dim">
                        <span className="w-1 h-1 rounded-full bg-brand-sand shrink-0" />
                        {h}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="bg-[#1c1b1b] border border-white/5 rounded-lg p-6">
                <h3 className="font-display font-bold text-xs uppercase text-text-on tracking-wider mb-2">{t("stage.view_map")}</h3>
                <button
                  onClick={() => onNavigate("map")}
                  className="w-full bg-bg-dark border border-white/10 hover:border-brand-sand text-brand-sand font-display text-[9px] font-bold uppercase tracking-widest py-2.5 rounded text-center transition-all cursor-pointer mt-2"
                >
                  {t("stage.open_map")}
                </button>
              </div>
            </div>
          </div>
        ) : activeTab === "technical" ? (
          /* Technical tab */
          <div className="flex flex-col gap-8">
            <div className="grid md:grid-cols-3 gap-6">
              <div className="bg-[#1c1b1b] border border-white/5 rounded-lg p-6">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp size={16} className="text-brand-sand" />
                  <h4 className="font-display font-bold text-xs uppercase text-text-on">{t("stage.distance")}</h4>
                </div>
                <p className="font-mono text-3xl font-black text-brand-sand">
                  {stage.distanceKm > 0 ? `${stage.distanceKm}` : "—"}
                </p>
                <p className="text-xs text-text-dim text-opacity-50 uppercase font-mono tracking-wider mt-1">{t("stage.km_done")}</p>
              </div>
              <div className="bg-[#1c1b1b] border border-white/5 rounded-lg p-6">
                <div className="flex items-center gap-2 mb-3">
                  <Mountain size={16} className="text-brand-sand" />
                  <h4 className="font-display font-bold text-xs uppercase text-text-on">{t("stage.elevation")}</h4>
                </div>
                <p className="font-mono text-3xl font-black text-brand-sand">
                  {stage.elevationGain > 0 ? `+${stage.elevationGain}` : "—"}
                </p>
                <p className="text-xs text-text-dim text-opacity-50 uppercase font-mono tracking-wider mt-1">mètres D+</p>
              </div>
              <div className="bg-[#1c1b1b] border border-white/5 rounded-lg p-6">
                <div className="flex items-center gap-2 mb-3">
                  <MapPin size={16} className="text-brand-sand" />
                  <h4 className="font-display font-bold text-xs uppercase text-text-on">{t("stage.altitude")}</h4>
                </div>
                <p className="font-mono text-3xl font-black text-brand-sand">
                  {stage.maxAltitude ?? "—"}
                </p>
                <p className="text-xs text-text-dim text-opacity-50 uppercase font-mono tracking-wider mt-1">mètres</p>
              </div>
            </div>

            {/* Profil altimétrique */}
            {stage.elevProfile && stage.elevProfile.length > 1 && (
              <div className="bg-[#1c1b1b] border border-white/5 rounded-lg p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Mountain size={16} className="text-brand-sand" />
                  <h4 className="font-display font-bold text-xs uppercase text-text-on tracking-wider">{t("stage.profile")}</h4>
                </div>
                {(() => {
                  const profile = stage.elevProfile!;
                  const w = 800, h = 180, pad = 30;
                  const elevs = profile.map(p => p[1]);
                  const dists = profile.map(p => p[0]);
                  const minE = Math.min(...elevs), maxE = Math.max(...elevs);
                  const maxD = Math.max(...dists) || 1;
                  const range = maxE - minE || 1;
                  const pts = profile.map(([d, e]) => {
                    const x = pad + (d / maxD) * (w - 2 * pad);
                    const y = h - pad - ((e - minE) / range) * (h - 2 * pad);
                    return [x, y];
                  });
                  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
                  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${h - pad} L${pts[0][0].toFixed(1)},${h - pad} Z`;
                  return (
                    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto">
                      <path d={area} fill="#E8620A" opacity="0.12" />
                      <path d={line} fill="none" stroke="#E8620A" strokeWidth="2" />
                      <text x={pad} y={h - pad + 18} className="fill-text-dim" style={{ fontSize: "11px", fontFamily: "monospace" }}>0 km</text>
                      <text x={w - pad} y={h - pad + 18} textAnchor="end" className="fill-text-dim" style={{ fontSize: "11px", fontFamily: "monospace" }}>{maxD.toFixed(0)} km</text>
                      <text x={pad - 4} y={pad} textAnchor="end" className="fill-text-dim" style={{ fontSize: "11px", fontFamily: "monospace" }}>{maxE} m</text>
                      <text x={pad - 4} y={h - pad} textAnchor="end" className="fill-text-dim" style={{ fontSize: "11px", fontFamily: "monospace" }}>{minE} m</text>
                    </svg>
                  );
                })()}
              </div>
            )}

            {stage.gpxFile && (
              <div className="bg-[#1c1b1b] border border-white/5 rounded-lg p-6">
                <h3 className="font-display font-bold text-xs uppercase text-text-on tracking-wider mb-2">Fichier GPX</h3>
                <a
                  href={stage.gpxFile}
                  download
                  className="inline-flex items-center gap-2 text-brand-sand font-mono text-xs hover:underline"
                >
                  {t("stage.download_gpx")}
                </a>
              </div>
            )}
          </div>
        ) : (
          /* Replay 3D tab */
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 mb-1">
              <Mountain size={16} className="text-brand-sand" />
              <h4 className="font-display font-bold text-xs uppercase text-text-on tracking-wider">{t("stage.replay")}</h4>
            </div>
            <RideReplay segments={stage.segments} track={stage.track} distanceKm={stage.distanceKm} t={t} />
          </div>
        )}
      </div>
    </div>
  );
}
