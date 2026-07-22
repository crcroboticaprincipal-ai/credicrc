import React from 'react';
import { AlertTriangle, RefreshCw, Phone } from 'lucide-react';

interface EBState { hasError: boolean; error: Error | null; }

export class ErrorBoundary extends React.Component<React.PropsWithChildren, EBState> {
  constructor(props: React.PropsWithChildren) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): EBState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Log interno — no interrumpe la UX
    console.error('[CrediCRC] Error capturado por ErrorBoundary:', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden animate-fade-in">
          {/* Header institucional */}
          <div className="bg-gradient-to-r from-[#002855] to-[#073B73] p-8 text-center">
            <div className="w-16 h-16 bg-red-500/20 border-2 border-red-400/40 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="h-8 w-8 text-red-400" />
            </div>
            <h1 className="text-white font-black text-xl tracking-tight">
              Credi<span className="text-red-400">CRC</span>
            </h1>
            <p className="text-blue-200 text-xs font-semibold mt-1 uppercase tracking-widest">
              Colegio Rafael Castillo
            </p>
          </div>

          {/* Cuerpo del mensaje */}
          <div className="p-8 text-center space-y-4">
            <h2 className="text-slate-800 font-black text-lg">
              Servicio Temporalmente Interrumpido
            </h2>
            <p className="text-slate-500 text-sm leading-relaxed">
              El sistema CrediCRC experimentó un error inesperado. Tu sesión y tus datos están seguros.
              Esto puede ocurrir por una conexión inestable o una actualización del servicio.
            </p>

            {/* Detalle técnico colapsable */}
            <details className="text-left bg-slate-50 border border-slate-200 rounded-xl p-3 cursor-pointer">
              <summary className="text-xs font-bold text-slate-600 select-none">Ver detalle técnico</summary>
              <code className="text-[10px] text-red-600 font-mono break-all mt-2 block leading-relaxed">
                {this.state.error?.message || 'Error desconocido'}
              </code>
            </details>

            {/* Botones de acción */}
            <div className="space-y-3 pt-2">
              <button
                id="error-boundary-retry-btn"
                onClick={() => {
                  this.setState({ hasError: false, error: null });
                  window.location.reload();
                }}
                className="w-full bg-[#002855] hover:bg-[#073B73] active:scale-95 text-white font-black py-3.5 px-6 rounded-xl text-sm transition-all flex items-center justify-center gap-2 shadow-lg min-h-[48px]"
              >
                <RefreshCw size={16} />
                Reintentar
              </button>

              <a
                id="error-boundary-support-link"
                href="mailto:soporte@credicrc.com"
                className="w-full border-2 border-slate-200 hover:border-[#002855] text-slate-600 hover:text-[#002855] font-bold py-3 px-6 rounded-xl text-sm transition-all flex items-center justify-center gap-2 min-h-[48px]"
              >
                <Phone size={15} />
                Contactar Soporte
              </a>
            </div>

            <p className="text-slate-300 text-[10px] font-bold uppercase tracking-widest pt-2">
              CrediCRC v2.0 · Fintech Escolar
            </p>
          </div>
        </div>
      </div>
    );
  }
}
