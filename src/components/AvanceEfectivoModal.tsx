import { useState, memo, useMemo } from 'react';
import { X, Banknote, Calculator, RefreshCw, CheckCircle2, AlertCircle, ChevronDown, Info } from 'lucide-react';
import { calcularAvanceEfectivo } from '../types';
import { supabase } from '../supabaseClient';

interface AvanceEfectivoModalProps {
  trabajadorId: string;
  proveedores: Array<{ id: string; nombre: string; categoria: string }>;
  cupoDisponible: number;
  cupoTotal: number;
  bcvRate: number;
  onClose: () => void;
  onSolicitudCreada: () => void;
  onNotification: (type: 'success' | 'error' | 'warning' | 'info', title: string, msg: string) => void;
}

const CUOTAS_OPTIONS = [1, 2, 3, 4] as const;

export const AvanceEfectivoModal = memo(function AvanceEfectivoModal({
  trabajadorId,
  proveedores,
  cupoDisponible,
  cupoTotal,
  bcvRate,
  onClose,
  onSolicitudCreada,
  onNotification,
}: AvanceEfectivoModalProps) {
  const [proveedorId, setProveedorId] = useState('');
  const [montoCapital, setMontoCapital] = useState('');
  const [numCuotas, setNumCuotas] = useState<1 | 2 | 3 | 4>(2);
  const [tipoInteres, setTipoInteres] = useState<'porcentaje' | 'monto_fijo'>('porcentaje');
  const [valorInteres, setValorInteres] = useState('5');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const proveedoresLiquidez = proveedores.filter(p => p.categoria === 'Proveedor de Liquidez');
  const capital = parseFloat(montoCapital) || 0;
  const interes = parseFloat(valorInteres) || 0;

  const calculo = useMemo(() => {
    if (capital <= 0 || interes < 0) return null;
    return calcularAvanceEfectivo(capital, numCuotas, tipoInteres, interes);
  }, [capital, numCuotas, tipoInteres, interes]);

  // Fecha de primera cuota
  const fechaPrimeraCuota = useMemo(() => {
    const now = new Date();
    const day = now.getDate();
    let nextDate = day < 15
      ? new Date(now.getFullYear(), now.getMonth(), 15)
      : new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return nextDate.toISOString().split('T')[0];
  }, []);

  const handleSubmit = async () => {
    if (!proveedorId) { onNotification('error', 'Proveedor Requerido', 'Selecciona el proveedor de liquidez.'); return; }
    if (capital <= 0 || capital > cupoDisponible) {
      onNotification('error', 'Monto Inválido', `El capital debe ser mayor a 0 y no superar $${cupoDisponible.toFixed(2)}.`);
      return;
    }
    if (interes < 0) { onNotification('error', 'Interés Inválido', 'El interés no puede ser negativo.'); return; }

    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.rpc('crear_solicitud_avance_efectivo', {
        p_trabajador_id: trabajadorId,
        p_proveedor_id: proveedorId,
        p_monto_capital_usd: capital,
        p_num_cuotas: numCuotas,
        p_tipo_interes: tipoInteres,
        p_valor_interes: interes,
        p_tasa_bcv: bcvRate,
        p_fecha_primera_cuota: fechaPrimeraCuota,
      });
      if (error) throw error;
      const res = data[0];
      if (!res.ok) throw new Error(res.mensaje);

      setIsSuccess(true);
      onSolicitudCreada();
      onNotification('success', 'Solicitud Enviada', `Avance de $${capital.toFixed(2)} registrado. Total a pagar: $${res.monto_total.toFixed(2)}.`);
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
        <div className="bg-gradient-to-r from-emerald-700 to-emerald-900 p-5 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-white/10 rounded-xl flex items-center justify-center">
              <Banknote className="text-white h-5 w-5" />
            </div>
            <div>
              <h3 className="text-white font-black text-sm">Avance de Efectivo</h3>
              <p className="text-emerald-200 text-[10px] font-semibold">Cupo: ${cupoDisponible.toFixed(2)} USD disponible</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto modal-scroll p-4 space-y-4">

          {/* Éxito */}
          {isSuccess && (
            <div className="py-8 flex flex-col items-center text-center gap-4">
              <div className="w-20 h-20 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-3xl flex items-center justify-center shadow-lg animate-bounce">
                <CheckCircle2 className="text-white h-10 w-10" />
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-800">¡Solicitud Enviada!</h3>
                <p className="text-slate-500 text-sm font-medium mt-2">
                  Tu avance de <strong>${capital.toFixed(2)} USD</strong> está en revisión.
                  {calculo && <> Total a devolver: <strong>${calculo.montoTotal.toFixed(2)}</strong> en {numCuotas} cuota(s).</>}
                </p>
              </div>
              <button onClick={onClose} className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-black py-3 rounded-xl text-sm">Cerrar</button>
            </div>
          )}

          {!isSuccess && (
            <>
              {/* Cupo */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Cupo Avance de Efectivo</p>
                    <p className="text-xl font-black text-emerald-800 font-mono mt-0.5">${cupoDisponible.toFixed(2)} <span className="text-sm font-normal">USD disp.</span></p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-emerald-500">de ${cupoTotal.toFixed(2)} total</p>
                    <div className="w-16 h-2 bg-emerald-100 rounded-full mt-1 overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full transition-all"
                        style={{ width: `${cupoTotal > 0 ? (cupoDisponible / cupoTotal) * 100 : 0}%` }} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Proveedor */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Proveedor de Liquidez</label>
                <div className="relative">
                  <select value={proveedorId} onChange={e => setProveedorId(e.target.value)}
                    className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-xl p-3 pr-8 text-sm font-semibold focus:outline-none focus:border-emerald-500">
                    <option value="">-- Seleccionar --</option>
                    {proveedoresLiquidez.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                    {proveedoresLiquidez.length === 0 && <option disabled>No hay proveedores de liquidez activos</option>}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>

              {/* Monto capital */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Monto Solicitado (USD)</label>
                <input type="number" value={montoCapital} onChange={e => setMontoCapital(e.target.value)}
                  placeholder="0.00" min="0" step="0.01"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-mono font-bold focus:outline-none focus:border-emerald-500 transition" />
                {capital > cupoDisponible && (
                  <p className="text-[10px] text-red-500 font-bold flex items-center gap-1">
                    <AlertCircle size={10} /> Supera tu cupo disponible
                  </p>
                )}
              </div>

              {/* Cuotas */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Número de Cuotas</label>
                <div className="grid grid-cols-4 gap-2">
                  {CUOTAS_OPTIONS.map(n => (
                    <button key={n} onClick={() => setNumCuotas(n)}
                      className={`py-2.5 rounded-xl text-sm font-black border transition-all ${
                        numCuotas === n ? 'bg-emerald-700 text-white border-emerald-700 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-300'
                      }`}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tipo de interés */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Tipo de Interés</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['porcentaje', 'monto_fijo'] as const).map(t => (
                    <button key={t} onClick={() => setTipoInteres(t)}
                      className={`py-2.5 rounded-xl text-xs font-bold border transition-all ${
                        tipoInteres === t ? 'bg-emerald-700 text-white border-emerald-700' : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-300'
                      }`}>
                      {t === 'porcentaje' ? '% sobre capital' : '$ fijo por cuota'}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input type="number" value={valorInteres} onChange={e => setValorInteres(e.target.value)}
                    placeholder={tipoInteres === 'porcentaje' ? '5' : '3.00'} min="0" step="0.01"
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-mono font-bold focus:outline-none focus:border-emerald-500" />
                  <span className="text-sm font-bold text-slate-500">
                    {tipoInteres === 'porcentaje' ? '%' : 'USD / cuota'}
                  </span>
                </div>
              </div>

              {/* ── VISTA PREVIA TRANSPARENTE ── */}
              {calculo && capital > 0 && (
                <div className="bg-gradient-to-br from-emerald-700 to-emerald-900 rounded-2xl p-4 text-white space-y-3">
                  <div className="flex items-center gap-2">
                    <Calculator size={14} className="text-emerald-300" />
                    <span className="text-[10px] font-black text-emerald-300 uppercase tracking-wider">Vista Previa Transparente</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: 'Monto solicitado', value: `$${capital.toFixed(2)}` },
                      { label: 'Interés total', value: `$${calculo.interesTotal.toFixed(2)}` },
                      { label: 'Total a pagar', value: `$${calculo.montoTotal.toFixed(2)}` },
                      { label: 'Valor por cuota', value: `$${calculo.valorCuota.toFixed(2)}` },
                    ].map(item => (
                      <div key={item.label} className="bg-white/10 rounded-xl p-2.5 text-center">
                        <p className="text-[9px] text-emerald-300 font-bold uppercase">{item.label}</p>
                        <p className="text-base font-black font-mono mt-0.5">{item.value}</p>
                      </div>
                    ))}
                  </div>
                  <div className="bg-white/5 rounded-xl p-3 space-y-1.5">
                    {calculo.cuotas.map((c, i) => (
                      <div key={i} className="flex justify-between text-xs">
                        <span className="text-emerald-300 font-semibold">Cuota {i + 1}</span>
                        <span className="text-emerald-200">Capital: ${c.capital.toFixed(2)} + Interés: ${c.interes.toFixed(2)}</span>
                        <span className="font-mono font-black">${c.total.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-start gap-2 bg-white/10 rounded-xl p-2.5">
                    <Info size={12} className="text-emerald-300 flex-shrink-0 mt-0.5" />
                    <p className="text-[10px] text-emerald-200 font-medium leading-relaxed">
                      Al confirmar, aceptas el descuento de ${calculo.valorCuota.toFixed(2)} USD por quincena hasta cancelar.
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!isSuccess && (
          <div className="p-4 border-t border-slate-100 flex gap-3 flex-shrink-0 bg-white">
            <button onClick={onClose} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl text-sm transition">Cancelar</button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || capital <= 0 || capital > cupoDisponible || !proveedorId || interes < 0}
              className="flex-1 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40 text-white font-black py-3 rounded-xl text-sm transition flex items-center justify-center gap-2 shadow-sm"
            >
              {isSubmitting ? <><RefreshCw size={14} className="animate-spin" />Enviando...</> : 'Solicitar Avance'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
});
