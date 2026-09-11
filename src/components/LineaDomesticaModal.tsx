import { useState, memo, useMemo } from 'react';
import { X, Home, Calculator, RefreshCw, CheckCircle2, AlertCircle, ChevronDown } from 'lucide-react';
import { supabase } from '../supabaseClient';

interface LineaDomesticaModalProps {
  trabajadorId: string;
  proveedores: Array<{ id: string; nombre: string; categoria: string }>;
  cupoDisponible: number;    // cupo_linea_domestica - cupo_linea_domestica_usado
  cupoTotal: number;         // cupo_linea_domestica
  bcvRate: number;
  onClose: () => void;
  onSolicitudCreada: () => void;
  onNotification: (type: 'success' | 'error' | 'warning' | 'info', title: string, msg: string) => void;
}

const CUOTAS_OPTIONS = [2, 4, 6, 8, 10, 12] as const;

export const LineaDomesticaModal = memo(function LineaDomesticaModal({
  trabajadorId,
  proveedores,
  cupoDisponible,
  cupoTotal,
  bcvRate,
  onClose,
  onSolicitudCreada,
  onNotification,
}: LineaDomesticaModalProps) {
  const [step, setStep] = useState<'form' | 'preview' | 'success'>('form');
  const [proveedorId, setProveedorId] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [montoTotal, setMontoTotal] = useState('');
  const [numCuotas, setNumCuotas] = useState<2 | 4 | 6 | 8 | 10 | 12>(4);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const proveedoresDomestica = proveedores.filter(p => p.categoria === 'Línea Doméstica');

  const monto = parseFloat(montoTotal) || 0;
  const valorCuota = monto > 0 ? Math.round((monto / numCuotas) * 100) / 100 : 0;

  // Fecha de primera cuota (próxima quincena)
  const fechaPrimeraCuota = useMemo(() => {
    const now = new Date();
    const day = now.getDate();
    let nextDate: Date;
    if (day < 15) {
      nextDate = new Date(now.getFullYear(), now.getMonth(), 15);
    } else {
      nextDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    }
    return nextDate.toISOString().split('T')[0];
  }, []);

  const cuotasFechas = useMemo(() => {
    const inicio = new Date(fechaPrimeraCuota);
    return Array.from({ length: numCuotas }, (_, i) => {
      const d = new Date(inicio);
      d.setDate(d.getDate() + i * 15);
      return d.toLocaleDateString('es-VE', { day: 'numeric', month: 'short', year: 'numeric' });
    });
  }, [numCuotas, fechaPrimeraCuota]);

  const handleSubmit = async () => {
    if (!proveedorId) { onNotification('error', 'Proveedor Requerido', 'Selecciona el proveedor de línea doméstica.'); return; }
    if (!descripcion.trim()) { onNotification('error', 'Descripción Requerida', 'Describe el artículo a financiar.'); return; }
    if (monto <= 0 || monto > cupoDisponible) {
      onNotification('error', 'Monto Inválido', `El monto debe ser mayor a 0 y no superar tu cupo de $${cupoDisponible.toFixed(2)}.`);
      return;
    }

    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.rpc('crear_solicitud_linea_domestica', {
        p_trabajador_id: trabajadorId,
        p_proveedor_id: proveedorId,
        p_descripcion: descripcion.trim(),
        p_monto_total_usd: monto,
        p_num_cuotas: numCuotas,
        p_tasa_bcv: bcvRate,
        p_fecha_primera_cuota: fechaPrimeraCuota,
      });
      if (error) throw error;
      const res = data[0];
      if (!res.ok) throw new Error(res.mensaje);

      setStep('success');
      onSolicitudCreada();
      onNotification('success', 'Solicitud Enviada', 'Tu solicitud de Línea Doméstica fue registrada y está en revisión.');
    } catch (err: any) {
      onNotification('error', 'Error al solicitar', err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 animate-fade-in">
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden">

        {/* Header */}
        <div className="bg-gradient-to-r from-purple-700 to-purple-900 p-5 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-white/10 rounded-xl flex items-center justify-center">
              <Home className="text-white h-5 w-5" />
            </div>
            <div>
              <h3 className="text-white font-black text-sm">Línea Doméstica</h3>
              <p className="text-purple-200 text-[10px] font-semibold">Cupo disponible: ${cupoDisponible.toFixed(2)} USD</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto modal-scroll p-4 space-y-4">

          {/* ── ÉXITO ── */}
          {step === 'success' && (
            <div className="py-8 flex flex-col items-center text-center gap-4">
              <div className="w-20 h-20 bg-gradient-to-br from-purple-400 to-purple-600 rounded-3xl flex items-center justify-center shadow-lg animate-bounce">
                <CheckCircle2 className="text-white h-10 w-10" />
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-800">¡Solicitud Enviada!</h3>
                <p className="text-slate-500 text-sm font-medium mt-2">
                  Tu solicitud de Línea Doméstica por <strong>${monto.toFixed(2)} USD</strong> a {numCuotas} cuotas
                  está pendiente de aprobación.
                </p>
              </div>
              <button onClick={onClose} className="w-full bg-purple-700 hover:bg-purple-800 text-white font-black py-3 rounded-xl text-sm">
                Cerrar
              </button>
            </div>
          )}

          {/* ── FORMULARIO ── */}
          {step !== 'success' && (
            <>
              {/* Info cupo */}
              <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-[10px] font-bold text-purple-600 uppercase tracking-widest">Cupo Línea Doméstica</p>
                    <p className="text-xl font-black text-purple-800 font-mono mt-0.5">${cupoDisponible.toFixed(2)} <span className="text-sm font-normal">USD disp.</span></p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-purple-500">de ${cupoTotal.toFixed(2)} total</p>
                    <div className="w-16 h-2 bg-purple-100 rounded-full mt-1 overflow-hidden">
                      <div className="h-full bg-purple-500 rounded-full transition-all"
                        style={{ width: `${cupoTotal > 0 ? (cupoDisponible / cupoTotal) * 100 : 0}%` }} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Proveedor */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Proveedor de Línea Doméstica</label>
                <div className="relative">
                  <select
                    value={proveedorId}
                    onChange={e => setProveedorId(e.target.value)}
                    className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-xl p-3 pr-8 text-sm font-semibold focus:outline-none focus:border-purple-500"
                  >
                    <option value="">-- Seleccionar proveedor --</option>
                    {proveedoresDomestica.map(p => (
                      <option key={p.id} value={p.id}>{p.nombre}</option>
                    ))}
                    {proveedoresDomestica.length === 0 && (
                      <option disabled>No hay proveedores de Línea Doméstica activos</option>
                    )}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>

              {/* Descripción */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Artículo a Financiar</label>
                <input
                  type="text"
                  value={descripcion}
                  onChange={e => setDescripcion(e.target.value)}
                  placeholder="Ej: Televisor Samsung 55' 4K, Nevera LG 320L..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-semibold focus:outline-none focus:border-purple-500 transition"
                />
              </div>

              {/* Monto */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Monto Total del Artículo (USD)</label>
                <input
                  type="number"
                  value={montoTotal}
                  onChange={e => setMontoTotal(e.target.value)}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-mono font-bold focus:outline-none focus:border-purple-500 transition"
                />
                {monto > 0 && (
                  <p className="text-[10px] text-slate-400 font-semibold">≈ Bs. {(monto * bcvRate).toFixed(2)}</p>
                )}
                {monto > cupoDisponible && (
                  <p className="text-[10px] text-red-500 font-bold flex items-center gap-1">
                    <AlertCircle size={10} /> Supera tu cupo disponible
                  </p>
                )}
              </div>

              {/* Número de cuotas */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Número de Cuotas (quincenales)</label>
                <div className="grid grid-cols-6 gap-2">
                  {CUOTAS_OPTIONS.map(n => (
                    <button
                      key={n}
                      onClick={() => setNumCuotas(n)}
                      className={`py-2.5 rounded-xl text-sm font-black border transition-all ${
                        numCuotas === n
                          ? 'bg-purple-700 text-white border-purple-700 shadow-sm'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-purple-300'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {/* Preview de cuotas */}
              {monto > 0 && valorCuota > 0 && (
                <div className="bg-gradient-to-br from-purple-700 to-purple-900 rounded-2xl p-4 text-white space-y-3">
                  <div className="flex items-center gap-2">
                    <Calculator size={14} className="text-purple-300" />
                    <span className="text-[10px] font-black text-purple-300 uppercase tracking-wider">Desglose por Cuota</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-center">
                    <div className="bg-white/10 rounded-xl p-3">
                      <p className="text-[10px] text-purple-300 font-bold">Monto Total</p>
                      <p className="text-lg font-black font-mono">${monto.toFixed(2)}</p>
                    </div>
                    <div className="bg-white/10 rounded-xl p-3">
                      <p className="text-[10px] text-purple-300 font-bold">Valor por Cuota</p>
                      <p className="text-lg font-black font-mono">${valorCuota.toFixed(2)}</p>
                    </div>
                  </div>
                  <div className="bg-white/5 rounded-xl p-3 space-y-1.5 max-h-40 overflow-y-auto modal-scroll">
                    {cuotasFechas.map((fecha, i) => (
                      <div key={i} className="flex justify-between text-xs">
                        <span className="text-purple-300 font-semibold">Cuota {i + 1} · {fecha}</span>
                        <span className="font-mono font-bold">${valorCuota.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {step !== 'success' && (
          <div className="p-4 border-t border-slate-100 flex gap-3 flex-shrink-0 bg-white">
            <button onClick={onClose} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl text-sm transition">
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || monto <= 0 || monto > cupoDisponible || !proveedorId || !descripcion.trim()}
              className="flex-1 bg-purple-700 hover:bg-purple-800 disabled:opacity-40 text-white font-black py-3 rounded-xl text-sm transition flex items-center justify-center gap-2 shadow-sm"
            >
              {isSubmitting ? <><RefreshCw size={14} className="animate-spin" />Enviando...</> : 'Solicitar Financiamiento'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
});
