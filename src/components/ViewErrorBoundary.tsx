import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
  label?: string;
}
interface State {
  error: string | null;
}

// Filet de sécurité générique : si une vue plante à l'exécution, on affiche
// le message d'erreur exact au lieu d'un écran blanc silencieux. Essentiel
// pour diagnostiquer sans avoir accès aux outils de développement du
// navigateur (cas typique sur mobile).
export default class ViewErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(err: any) {
    return { error: err?.message || String(err) || "erreur inconnue" };
  }

  componentDidCatch(err: any, info: any) {
    console.error(`Crash (${this.props.label || "vue"}):`, err, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="w-full min-h-[50vh] flex items-center justify-center p-6">
          <div className="max-w-md text-center">
            <p className="font-mono text-xs text-red-400 uppercase tracking-wider mb-2">
              {this.props.label || "Erreur"}
            </p>
            <p className="font-mono text-[10px] text-red-300 break-all">
              {this.state.error}
            </p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
