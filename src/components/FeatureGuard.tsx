import { memo } from 'react';
import { Lock, Wrench } from 'lucide-react';
import type { FeatureFlag } from '../types';

interface FeatureGuardProps {
  moduloId: string;
  flags: FeatureFlag[];
  children: React.ReactNode;
  /** Si true, en lugar de null muestra una pantalla de mantenimiento elegante */
  showBlockScreen?: boolean;
}

/**
 * HOC de protección de rutas y vistas basado en Feature Flags.
 * Si el módulo está desactivado:
 *   - showBlockScreen=false → retorna null (oculta el elemento sin rastro visual)
 *   - showBlockScreen=true  → muestra pantalla de mantenimiento institucional
 */
export const FeatureGuard = memo(function FeatureGuard({
  moduloId,
  flags,
  children,
  showBlockScreen = false,
}: FeatureGuardProps) {
  const flag = flags.find(f => f.modulo_id === moduloId);

  // Si el flag no existe en BD, mostrar el contenido (fail-open para no bloquear funciones base)
  if (!flag) return <>{children}</>;

  if (flag.activo) return <>{children}</>;

  if (!showBlockScreen) return null;

  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center animate-fade-in">
      <div className="w-20 h-20 bg-gradient-to-br from-slate-100 to-blue-50 rounded-3xl flex items-center justify-center mb-5 shadow-sm border border-slate-200">
        <Wrench className="text-[#002855] h-9 w-9 opacity-60" />
      </div>
      <div className="max-w-xs space-y-3">
        <div className="flex items-center justify-center gap-2">
          <Lock size={14} className="text-slate-400" />
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Módulo no disponible</span>
        </div>
        <h3 className="text-slate-800 font-black text-lg leading-tight">
          {flag.mensaje_bloqueo || 'Esta sección está temporalmente en mantenimiento'}
        </h3>
        <p className="text-slate-500 text-xs font-medium leading-relaxed">
          El equipo de administración de CrediCRC está trabajando para activar esta función. 
          Recibirás una notificación cuando esté disponible.
        </p>
        <div className="inline-flex items-center gap-1.5 bg-blue-50 border border-blue-100 text-blue-600 text-[10px] font-bold px-3 py-1.5 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          Próximamente disponible
        </div>
      </div>
    </div>
  );
});
