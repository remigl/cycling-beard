import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
}
interface State {
  error: string | null;
}

// Filet de sécurité : si le globe 3D plante à l'exécution (erreur WebGL,
// incompatibilité de version three.js, etc.), on affiche le message d'erreur
// au lieu d'un espace vide silencieux. Sans ça, une erreur de rendu React
// démonte le composant sans laisser de trace visible.
export default class GlobeErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(err: any) {
    return { error: err?.message || String(err) || "erreur inconnue" };
  }

  componentDidCatch(err: any, info: any) {
    console.error("Globe crash:", err, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="absolute inset-0 bg-[#FAF9F6] flex items-center justify-center p-4">
          <p className="font-mono text-[10px] text-red-500 text-center break-all max-w-full">
            Globe : {this.state.error}
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
