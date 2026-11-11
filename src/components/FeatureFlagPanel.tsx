import { memo, useState } from 'react';
import { Zap, ShoppingBag, Home as HomeIcon, Banknote, ToggleLeft, ToggleRight, RefreshCw, Settings, PartyPopper, PauseCircle, Check } from 'lucide-react';
import type { FeatureFlag } from '../types';
import { MODO_CORTE_MODULO_ID, MODO_CORTE_DEFAULT_MSG } from '../types';

interface FeatureFlagPanelProps {
  flags: FeatureFlag[];
  onToggle: (moduloId: string, nuevoEstado: boolean) => Promise<void>;
  onUpdateMessage?: (moduloId: string, nuevoMensaje: string) => Promise<void>;
  isLoading?: boolean;
}

const MODULE_ICONS: Record<string, React.ReactNode> = {
  operaciones_compras_activas: <PauseCircle size={18} className="text-amber-600" />,
  tienda_online:        <ShoppingBag size={18} className="text-blue-500" />,
  linea_domestica:      <HomeIcon size={18} className="text-purple-500" />,
  avance_efectivo:      <Banknote size={18} className="text-emerald-500" />,
  registro_proveedores: <Settings size={18} className="text-slate-500" />,
  pedidos_checkout:     <Zap size={18} className="text-amber-500" />,
  promo_sin_inicial:    <PartyPopper size={18} className="text-rose-500" />,
};

const MODULE_LABELS: Record<string, string> = {
  operaciones_compras_activas: '🛑 Estado de Caja / Modo Corte de Nómina (Compras y Cobros)',
  tienda_online:        '🛒 Tienda Online de Proveedores',
  linea_domestica:      '🏠 Línea Doméstica / Electrodomésticos',
  avance_efectivo:      '💵 Avance de Efectivo',
  registro_proveedores: '➕ Registro de Nuevos Proveedores',
  pedidos_checkout:     '⚡ Pedidos & Checkout Online',
  promo_sin_inicial:    '🎉 Promoción: Compras SIN Inicial',
};

export const FeatureFlagPanel = memo(function FeatureFlagPanel({
  flags,
  onToggle,
  onUpdateMessage,
  isLoading,
}: FeatureFlagPanelProps) {
  const corteFlag = flags.find(f => f.modulo_id === MODO_CORTE_MODULO_ID);
  const [editMsg, setEditMsg] = useState(corteFlag?.mensaje_bloqueo || MODO_CORTE_DEFAULT_MSG);
  const [savingMsg, setSavingMsg] = useState(false);

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
            className={`p-4 transition-colors ${
              flag.modulo_id === MODO_CORTE_MODULO_ID
                ? flag.activo
                  ? 'bg-emerald-50/40 hover:bg-emerald-50/70'
                  : 'bg-amber-50/70 hover:bg-amber-50'
                : 'hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-start gap-3 flex-1">
                <div className="mt-0.5">{MODULE_ICONS[flag.modulo_id] || <Settings size={18} className="text-slate-400" />}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-800">
                    {MODULE_LABELS[flag.modulo_id] || flag.modulo_id}
                  </p>
                  <p className="text-xs text-slate-500 font-medium mt-0.5 leading-relaxed">
                    {flag.descripcion}
                  </p>
                  {flag.mensaje_bloqueo && !flag.mensaje_bloqueo.trim().startsWith('{') && (
                    <p className="text-[10px] text-slate-500 mt-1 italic">
                      Mensaje actual: "{flag.mensaje_bloqueo}"
                    </p>
                  )}
                </div>
              </div>

              <button
                onClick={() => onToggle(flag.modulo_id, !flag.activo)}
                className={`ml-4 flex-shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all duration-200 ${
                  flag.activo
                    ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                    : flag.modulo_id === MODO_CORTE_MODULO_ID
                      ? 'bg-amber-500 text-white hover:bg-amber-600 shadow-sm'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
                aria-label={`${flag.activo ? 'Desactivar' : 'Activar'} ${flag.modulo_id}`}
              >
                {flag.activo ? (
                  <><ToggleRight size={18} className="text-emerald-500" /> {flag.modulo_id === MODO_CORTE_MODULO_ID ? 'Compras Habilitadas' : 'Activo'}</>
                ) : (
                  <><ToggleLeft size={18} className={flag.modulo_id === MODO_CORTE_MODULO_ID ? 'text-white' : 'text-slate-400'} /> {flag.modulo_id === MODO_CORTE_MODULO_ID ? 'En Pausa por Corte' : 'Inactivo'}</>
                )}
              </button>
            </div>

            {flag.modulo_id === MODO_CORTE_MODULO_ID && onUpdateMessage && (
              <div className="mt-3 pl-7 flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={editMsg}
                  onChange={e => setEditMsg(e.target.value)}
                  placeholder="Mensaje personalizado durante la pausa por corte de nómina..."
                  className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-700 focus:outline-none focus:border-[#002855]"
                />
                <button
                  type="button"
                  disabled={savingMsg}
                  onClick={async () => {
                    setSavingMsg(true);
                    try {
                      await onUpdateMessage(MODO_CORTE_MODULO_ID, editMsg);
                    } finally {
                      setSavingMsg(false);
                    }
                  }}
                  className="bg-[#002855] hover:bg-[#073B73] text-white text-xs font-bold px-3.5 py-2 rounded-xl transition flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <Check size={13} /> Guardar Mensaje
                </button>
              </div>
            )}
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
