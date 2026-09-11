import { memo } from 'react';
import { Zap, ShoppingBag, Home as HomeIcon, Banknote, ToggleLeft, ToggleRight, RefreshCw, Settings } from 'lucide-react';
import type { FeatureFlag } from '../types';

interface FeatureFlagPanelProps {
  flags: FeatureFlag[];
  onToggle: (moduloId: string, nuevoEstado: boolean) => Promise<void>;
  isLoading?: boolean;
}

const MODULE_ICONS: Record<string, React.ReactNode> = {
  tienda_online:        <ShoppingBag size={18} className="text-blue-500" />,
  linea_domestica:      <HomeIcon size={18} className="text-purple-500" />,
  avance_efectivo:      <Banknote size={18} className="text-emerald-500" />,
  registro_proveedores: <Settings size={18} className="text-slate-500" />,
  pedidos_checkout:     <Zap size={18} className="text-amber-500" />,
};

const MODULE_LABELS: Record<string, string> = {
  tienda_online:        '🛒 Tienda Online de Proveedores',
  linea_domestica:      '🏠 Línea Doméstica / Electrodomésticos',
  avance_efectivo:      '💵 Avance de Efectivo',
  registro_proveedores: '➕ Registro de Nuevos Proveedores',
  pedidos_checkout:     '⚡ Pedidos & Checkout Online',
};

export const FeatureFlagPanel = memo(function FeatureFlagPanel({
  flags,
  onToggle,
  isLoading,
}: FeatureFlagPanelProps) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="bg-gradient-to-r from-[#002855] to-[#073B73] p-5 flex items-center gap-3">
        <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
          <Settings className="text-white h-5 w-5" />
        </div>
        <div>
          <h3 className="text-white font-black text-sm">Control de Módulos (Feature Flags)</h3>
          <p className="text-blue-200 text-xs font-medium mt-0.5">
            Activa o desactiva funciones en tiempo real sin redeploy
          </p>
        </div>
        {isLoading && <RefreshCw size={16} className="text-white/60 animate-spin ml-auto" />}
      </div>

      <div className="divide-y divide-slate-100">
        {flags.map((flag) => (
          <div
            key={flag.modulo_id}
            className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-start gap-3 flex-1">
              <div className="mt-0.5">{MODULE_ICONS[flag.modulo_id] || <Settings size={18} className="text-slate-400" />}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-800">
                  {MODULE_LABELS[flag.modulo_id] || flag.modulo_id}
                </p>
                <p className="text-xs text-slate-500 font-medium mt-0.5 leading-relaxed">
                  {flag.descripcion}
                </p>
                {flag.mensaje_bloqueo && (
                  <p className="text-[10px] text-slate-400 mt-1 italic">
                    Mensaje: "{flag.mensaje_bloqueo}"
                  </p>
                )}
              </div>
            </div>

            <button
              onClick={() => onToggle(flag.modulo_id, !flag.activo)}
              className={`ml-4 flex-shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all duration-200 ${
                flag.activo
                  ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}
              aria-label={`${flag.activo ? 'Desactivar' : 'Activar'} ${flag.modulo_id}`}
            >
              {flag.activo ? (
                <><ToggleRight size={18} className="text-emerald-500" /> Activo</>
              ) : (
                <><ToggleLeft size={18} className="text-slate-400" /> Inactivo</>
              )}
            </button>
          </div>
        ))}

        {flags.length === 0 && (
          <div className="p-8 text-center text-slate-400 text-sm">
            Cargando configuración de módulos...
          </div>
        )}
      </div>

      <div className="bg-amber-50 border-t border-amber-100 p-3 text-[10px] text-amber-700 font-semibold text-center">
        ⚡ Los cambios se aplican en tiempo real para todos los usuarios conectados
      </div>
    </div>
  );
});
