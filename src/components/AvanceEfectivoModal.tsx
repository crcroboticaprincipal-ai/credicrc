import { useState, useEffect, useMemo } from 'react';
import {
  X, Banknote, AlertCircle, CheckCircle2, RefreshCw, DollarSign,
  Calendar, ShieldCheck, Phone, Clock
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import {
  DEFAULT_CONFIGURACION_LIQUIDEZ,
  calcularAvancePorPlazo,
  isLiquidityProvider,
  parseSolicitudMetadata,
  getOperacionesComprasStatus,
  type FeatureFlag,
  type ConfiguracionLiquidez,
  type AvanceEfectivoSolicitud,
} from '../types';
import { FeatureGuard } from './FeatureGuard';

interface ProviderOption {
  id: string;
  nombre: string;
  categoria: string;
  tipo_proveedor?: string | null;
}

interface AvanceEfectivoModalProps {
  trabajadorId: string;
  trabajadorNombre: string;
  trabajadorCedula?: string;
  /** Saldo disponible real del trabajador dentro de su cupo regular de $40.00 */
  saldoDisponible: number;
  limiteTotal?: number;
  /** Compatibilidad con props anteriores */
  cupoTotal?: number;
  cupoUsado?: number;
  providers: ProviderOption[];
  configLiquidezMap?: Record<string, ConfiguracionLiquidez>;
  misSolicitudes?: AvanceEfectivoSolicitud[];
  bcvRate: number;
  flags: FeatureFlag[];
  onClose: () => void;
  onSuccess: () => void;
  onNotification: (type: 'success' | 'warning' | 'info' | 'error', title: string, msg: string) => void;
}

const ESCALONES_MONTO = [10, 15, 20, 25, 30, 35, 40] as const;
const PLAZOS_CUOTAS = [1, 2, 3] as const;

export function AvanceEfectivoModal({
  trabajadorId,
  trabajadorNombre,
  trabajadorCedula = '',
  saldoDisponible,
  limiteTotal = 40,
  providers,
  configLiquidezMap = {},
  misSolicitudes = [],
  bcvRate,
  flags,
  onClose,
  onSuccess,
  onNotification,
}: AvanceEfectivoModalProps) {
  // Detectar proveedores de liquidez registrados; si aún no se ha marcado uno específicamente, usar el primero
  const liquidityProviders = useMemo(() => {
    const matching = providers.filter(p => isLiquidityProvider(p));
    return matching.length > 0 ? matching : providers.slice(0, 1);
  }, [providers]);

  const [selectedProviderId, setSelectedProviderId] = useState<string>(liquidityProviders[0]?.id ?? '');

  useEffect(() => {
    if (!selectedProviderId && liquidityProviders.length > 0) {
      setSelectedProviderId(liquidityProviders[0].id);
    }
  }, [liquidityProviders, selectedProviderId]);

  // Configuración activa del Proveedor de Liquidez
  const activeConfig: ConfiguracionLiquidez = useMemo(() => {
    const found = selectedProviderId ? configLiquidezMap[selectedProviderId] : undefined;
    const firstCfg = Object.values(configLiquidezMap)[0];
    const merged: ConfiguracionLiquidez = {
      ...DEFAULT_CONFIGURACION_LIQUIDEZ,
      ...(firstCfg || {}),
      ...(found || {}),
      proveedor_id: (found?.proveedor_id || firstCfg?.proveedor_id || selectedProviderId || 'default'),
    };
    return merged;
  }, [selectedProviderId, configLiquidezMap]);

  // Solicitudes pendientes del trabajador (para evitar que solicite más de su disponible)
  const montoEnSolicitudesPendientes = useMemo(() => {
    return misSolicitudes
      .filter(s => s.trabajador_id === trabajadorId && s.estatus === 'Pendiente')
      .reduce((acc, s) => acc + Number(s.monto_capital_usd || 0), 0);
  }, [misSolicitudes, trabajadorId]);

  // Techo estricto: mínimo entre su saldo_disponible actual, el tope configurado ($40.00) y su límite regular
  const techoDisponible = useMemo(() => {
    const dispReal = Math.max(0, Math.round((saldoDisponible - montoEnSolicitudesPendientes) * 100) / 100);
    return Math.min(dispReal, activeConfig.monto_maximo_usd, limiteTotal);
  }, [saldoDisponible, montoEnSolicitudesPendientes, activeConfig.monto_maximo_usd, limiteTotal]);

  const montoMinimo = activeConfig.monto_minimo_usd || 10;

  // Estados del Simulador y Formulario
  const [capitalInput, setCapitalInput] = useState<string>(() => {
    if (techoDisponible >= 20) return '20';
    if (techoDisponible >= 10) return String(Math.floor(techoDisponible));
    return '10';
  });
  const [numCuotas, setNumCuotas] = useState<1 | 2 | 3>(2);

  // Datos de Pago Móvil del Trabajador para recibir el dinero (recordados en localStorage)
  const storageKey = `credicrc_pm_worker_${trabajadorId}`;
  const savedPM = useMemo(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, [storageKey]);

  const [bancoTrabajador, setBancoTrabajador] = useState<string>(savedPM?.banco || '');
  const [telefonoPagoMovil, setTelefonoPagoMovil] = useState<string>(savedPM?.telefono || '');
  const [cedulaPagoMovil, setCedulaPagoMovil] = useState<string>(savedPM?.cedula || trabajadorCedula || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const capitalNum = parseFloat(capitalInput) || 0;

  // Regla de validación obligatoria: si el trabajador selecciona el monto mínimo de $10.00, bloquear 3 cuotas
  const isThreeInstallmentsBlocked = capitalNum <= 10.001;

  useEffect(() => {
    if (isThreeInstallmentsBlocked && numCuotas === 3) {
      setNumCuotas(2);
    }
  }, [isThreeInstallmentsBlocked, numCuotas]);

  // Cálculo Automático en Vivo
  const calculo = useMemo(() => {
    if (capitalNum <= 0) return null;
    const plazoEfectivo: 1 | 2 | 3 = isThreeInstallmentsBlocked && numCuotas === 3 ? 2 : numCuotas;
    return calcularAvancePorPlazo(capitalNum, plazoEfectivo, activeConfig);
  }, [capitalNum, numCuotas, isThreeInstallmentsBlocked, activeConfig]);

  const isMontoValido =
    capitalNum >= montoMinimo &&
    capitalNum <= techoDisponible &&
    !(capitalNum <= 10 && numCuotas === 3);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeConfig.recepcion_activa) {
      onNotification('warning', 'Recepción en Pausa', 'El Proveedor de Liquidez ha pausado temporalmente la recepción de solicitudes.');
      return;
    }
    if (!selectedProviderId) {
      onNotification('error', 'Sin Proveedor', 'No hay un Proveedor de Liquidez disponible en este momento.');
      return;
    }
    if (capitalNum < montoMinimo) {
      onNotification('error', 'Monto Mínimo', `El monto mínimo para solicitar un avance es de $${montoMinimo.toFixed(2)}.`);
      return;
    }
    if (capitalNum > techoDisponible) {
      onNotification('error', 'Supera tu Disponible', `El monto solicitado ($${capitalNum.toFixed(2)}) supera tu saldo disponible actual de $${techoDisponible.toFixed(2)}.`);
      return;
    }
    if (capitalNum <= 10 && numCuotas === 3) {
      onNotification('error', 'Plazo no permitido', 'Para el monto mínimo de $10.00 solo se permiten 1 o 2 cuotas.');
      return;
    }
    if (!bancoTrabajador.trim() || !telefonoPagoMovil.trim() || !cedulaPagoMovil.trim()) {
      onNotification('error', 'Datos de Pago Móvil Requeridos', 'Indica tu Banco, Teléfono y Cédula donde recibirás la transferencia del dinero.');
      return;
    }
    if (!calculo) return;

    setIsSubmitting(true);
    try {
      // Blindaje en vivo: verificar que operaciones_compras_activas sea TRUE antes de crear solicitud
      try {
        const { data: liveFlags } = await supabase.from('feature_flags').select('*');
        if (liveFlags) {
          const corte = getOperacionesComprasStatus(liveFlags as FeatureFlag[]);
          if (corte.enCorteNomina) {
            onNotification(
              'warning',
              '⏸️ Pausa Temporal por Corte de Nómina',
              corte.mensajeBloqueo || 'En este momento estamos actualizando los descuentos y saldos del periodo. El servicio se restablecerá automáticamente en un par de horas.'
            );
            return;
          }
        }
      } catch { /* ignorar error de red y continuar con validación de BD */ }

      // Guardar datos de Pago Móvil del trabajador en localStorage para próximas solicitudes
      try {
        localStorage.setItem(storageKey, JSON.stringify({
          banco: bancoTrabajador.trim(),
          telefono: telefonoPagoMovil.trim(),
          cedula: cedulaPagoMovil.trim(),
        }));
      } catch { /* ignorar */ }

      const notasMetadataJson = JSON.stringify({
        banco_trabajador: bancoTrabajador.trim(),
        telefono_pago_movil: telefonoPagoMovil.trim(),
        cedula_pago_movil: cedulaPagoMovil.trim(),
      });

      // 1. Intentar RPC atómico solicitar_avance_efectivo (crea solicitud en 'Pendiente' SIN descontar saldo)
      const { data: rpcData, error: rpcErr } = await supabase.rpc('solicitar_avance_efectivo', {
        p_trabajador_id: trabajadorId,
        p_proveedor_id: selectedProviderId,
        p_monto_capital_usd: Math.round(capitalNum * 100) / 100,
        p_num_cuotas: numCuotas,
        p_tasa_bcv: bcvRate,
        p_banco_trabajador: bancoTrabajador.trim(),
        p_telefono_pago_movil: telefonoPagoMovil.trim(),
        p_cedula_pago_movil: cedulaPagoMovil.trim(),
        p_notas: notasMetadataJson,
      });

      if (!rpcErr && rpcData && rpcData[0]) {
        const res = rpcData[0];
        if (!res.ok) {
          onNotification('error', 'Solicitud Rechazada', res.mensaje);
          return;
        }
        onNotification(
          'success',
          '✅ Solicitud Enviada',
          `Solicitaste $${capitalNum.toFixed(2)} en ${numCuotas} ${numCuotas === 1 ? 'cuota' : 'cuotas'} de $${Number(res.cuota_valor).toFixed(2)}. Tu cupo se descontará cuando el Proveedor de Liquidez transfiera tu dinero.`
        );
        onSuccess();
        onClose();
        return;
      }

      // 2. Fallback directo sobre la tabla avance_efectivo_solicitudes (sin tocar limite_disponible del trabajador)
      const { error: insErr } = await supabase.from('avance_efectivo_solicitudes').insert([{
        trabajador_id: trabajadorId,
        proveedor_liquidez_id: selectedProviderId,
        monto_capital_usd: Math.round(capitalNum * 100) / 100,
        num_cuotas: numCuotas,
        tipo_interes: calculo.modalidad,
        valor_interes: calculo.tasaAplicada,
        monto_interes_total_usd: calculo.interesTotal,
        monto_total_usd: calculo.montoTotal,
        valor_cuota_usd: calculo.valorCuota,
        tasa_bcv_registro: bcvRate,
        estatus: 'Pendiente',
        notas: notasMetadataJson,
      }]);

      if (insErr) throw insErr;

      onNotification(
        'success',
        '✅ Solicitud en Revisión',
        `Solicitud de $${capitalNum.toFixed(2)} creada en estado Pendiente por aprobar. Recibirás Bs. ${(capitalNum * bcvRate).toFixed(2)} al confirmarse el desembolso.`
      );
      onSuccess();
      onClose();
    } catch (err: any) {
      onNotification('error', 'Error al Solicitar', err.message || 'No se pudo registrar la solicitud.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const recentWorkerRequests = useMemo(
    () => misSolicitudes.filter(s => s.trabajador_id === trabajadorId).slice(0, 3),
    [misSolicitudes, trabajadorId]
  );

  return (
    <div className="fixed inset-0 bg-black/65 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
      <div
        className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto flex flex-col text-left"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 16px)' }}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-[#002855] via-[#073B73] to-emerald-800 p-5 rounded-t-3xl flex items-center justify-between sticky top-0 z-10 shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-emerald-400/20 border border-emerald-300/30 rounded-2xl flex items-center justify-center">
              <Banknote size={22} className="text-emerald-300" />
            </div>
            <div>
              <h3 className="text-white font-black text-base">Avance de Efectivo Inmediato</h3>
              <p className="text-emerald-200 text-xs font-medium">{trabajadorNombre}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/70 hover:text-white p-1.5 rounded-xl hover:bg-white/10 transition"
          >
            <X size={20} />
          </button>
        </div>

        <FeatureGuard moduloId="avance_efectivo" flags={flags}>
          <form onSubmit={handleSubmit} className="p-5 space-y-5">
            {/* Tarjeta de Cupo Consolidado ($40) */}
            <div className="bg-gradient-to-br from-slate-900 to-[#002855] rounded-2xl p-4 text-white flex items-center justify-between shadow-inner">
              <div>
                <span className="text-[10px] font-black text-blue-300 uppercase tracking-wider block">
                  Tu Saldo Disponible para Avance
                </span>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className="text-2xl font-black font-mono text-emerald-400">
                    ${techoDisponible.toFixed(2)}
                  </span>
                  <span className="text-xs text-slate-300 font-mono">
                    / ${limiteTotal.toFixed(2)} USD
                  </span>
                </div>
                {montoEnSolicitudesPendientes > 0 && (
                  <p className="text-[10px] text-amber-300 font-bold mt-1">
                    ⏳ Tienes ${montoEnSolicitudesPendientes.toFixed(2)} en solicitud pendiente por aprobar.
                  </p>
                )}
              </div>
              <div className="text-right">
                <span className="text-[10px] text-blue-200 font-bold uppercase block">Tasa BCV Hoy</span>
                <span className="text-sm font-black font-mono text-white">Bs. {bcvRate.toFixed(2)}</span>
                <span className="text-[10px] text-emerald-300 block font-mono">
                  Máx. Bs. {(techoDisponible * bcvRate).toFixed(2)}
                </span>
              </div>
            </div>

            {!activeConfig.recepcion_activa && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-2.5 text-xs text-amber-800 font-semibold">
                <AlertCircle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
                <span>
                  El Proveedor de Liquidez ha pausado temporalmente la recepción de solicitudes por cierre de lote. Intenta nuevamente en unos minutos.
                </span>
              </div>
            )}

            {/* 1. SELECCIÓN DE MONTO ($10.00 hasta saldo_disponible) */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-black text-slate-600 uppercase tracking-wider">
                  1. Selecciona el Monto a Solicitar (Mín. ${montoMinimo.toFixed(2)})
                </label>
                <span className="text-[11px] font-bold text-emerald-700">
                  Techo: ${techoDisponible.toFixed(2)}
                </span>
              </div>

              {/* Botones rápidos en escalones de $5 */}
              <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
                {ESCALONES_MONTO.map(m => {
                  const disabled = m > techoDisponible || m < montoMinimo;
                  const isSelected = Math.abs(capitalNum - m) < 0.01;
                  return (
                    <button
                      key={m}
                      type="button"
                      disabled={disabled}
                      onClick={() => setCapitalInput(String(m))}
                      className={`py-2.5 rounded-xl text-xs font-mono font-black border-2 transition-all ${
                        isSelected
                          ? 'bg-[#002855] text-white border-[#002855] shadow-md scale-[1.02]'
                          : disabled
                          ? 'bg-slate-100 text-slate-300 border-slate-100 cursor-not-allowed'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-[#002855]/40'
                      }`}
                    >
                      ${m}
                    </button>
                  );
                })}
              </div>

              {/* Campo de monto libre validado */}
              <div className="relative">
                <DollarSign size={15} className="text-slate-400 absolute left-3.5 top-3.5" />
                <input
                  type="number"
                  step="1"
                  min={montoMinimo}
                  max={techoDisponible}
                  value={capitalInput}
                  onChange={e => setCapitalInput(e.target.value)}
                  placeholder={`Ingresa un monto entre $${montoMinimo} y $${techoDisponible}`}
                  className="w-full border border-slate-200 rounded-xl pl-9 pr-28 py-3 text-sm font-mono font-black text-slate-800 focus:ring-2 focus:ring-[#002855]/20 focus:border-[#002855] outline-none"
                />
                {capitalNum > 0 && (
                  <span className="absolute right-3.5 top-3.5 text-xs font-mono font-bold text-emerald-700">
                    ≈ Bs. {(capitalNum * bcvRate).toFixed(2)}
                  </span>
                )}
              </div>

              {capitalNum > techoDisponible && (
                <p className="text-[11px] text-red-600 font-bold flex items-center gap-1">
                  <AlertCircle size={12} /> El monto no puede superar tu saldo disponible actual de ${techoDisponible.toFixed(2)}.
                </p>
              )}
              {capitalNum > 0 && capitalNum < montoMinimo && (
                <p className="text-[11px] text-red-600 font-bold flex items-center gap-1">
                  <AlertCircle size={12} /> El monto mínimo permitido es de ${montoMinimo.toFixed(2)}.
                </p>
              )}
            </div>

            {/* 2. SELECCIÓN DE PLAZO POR CORTE DE COBRO */}
            <div className="space-y-2">
              <label className="text-[11px] font-black text-slate-600 uppercase tracking-wider block">
                2. Selecciona el Plazo por Corte de Cobro
              </label>
              <p className="text-[11px] text-blue-700 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 font-semibold flex items-center gap-1.5">
                <Calendar size={13} className="flex-shrink-0 text-[#002855]" />
                Se descontará automáticamente en tus próximos <strong>{numCuotas}</strong> {numCuotas === 1 ? 'cobro de nómina' : 'cobros de nómina'}.
              </p>

              <div className="grid grid-cols-3 gap-2.5 pt-1">
                {PLAZOS_CUOTAS.map(n => {
                  const blocked = n === 3 && isThreeInstallmentsBlocked;
                  const isSelected = numCuotas === n;
                  const simN = capitalNum > 0 ? calcularAvancePorPlazo(capitalNum, n, activeConfig) : null;

                  return (
                    <button
                      key={n}
                      type="button"
                      disabled={blocked}
                      onClick={() => setNumCuotas(n)}
                      className={`p-3 rounded-2xl border-2 text-center transition-all relative ${
                        blocked
                          ? 'bg-slate-100 border-slate-200 text-slate-300 cursor-not-allowed'
                          : isSelected
                          ? 'bg-[#002855] text-white border-[#002855] shadow-md'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-[#002855]/40'
                      }`}
                    >
                      <span className="text-xs font-black block">
                        {n} {n === 1 ? 'Cuota' : 'Cuotas'}
                      </span>
                      <span className={`text-[10px] font-semibold block mt-0.5 ${
                        blocked ? 'text-slate-300' : isSelected ? 'text-blue-200' : 'text-slate-400'
                      }`}>
                        {n === 1 ? 'Próximo cobro' : `${n} cortes nómina`}
                      </span>
                      {simN && !blocked && (
                        <span className={`text-xs font-mono font-black block mt-1.5 ${
                          isSelected ? 'text-emerald-300' : 'text-emerald-700'
                        }`}>
                          ${simN.valorCuota.toFixed(2)} c/u
                        </span>
                      )}
                      {blocked && (
                        <span className="text-[9px] font-black text-red-400 block mt-1">
                          Solo &gt; $10
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {isThreeInstallmentsBlocked && (
                <p className="text-[10px] text-amber-700 font-semibold">
                  ℹ️ Para el monto mínimo de $10.00 están habilitadas únicamente 1 o 2 cuotas.
                </p>
              )}
            </div>

            {/* 3. CALCULADORA AUTOMÁTICA EN VIVO */}
            {calculo && capitalNum >= montoMinimo && capitalNum <= techoDisponible && (
              <div className="bg-gradient-to-br from-emerald-50 via-teal-50/60 to-white border-2 border-emerald-200 rounded-2xl p-4 space-y-3 shadow-sm">
                <div className="flex items-center justify-between border-b border-emerald-200/70 pb-2">
                  <span className="text-[10px] font-black text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldCheck size={14} className="text-emerald-600" /> Resumen Transparente de tu Avance
                  </span>
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                    {calculo.modalidad === 'porcentaje'
                      ? calculo.pisoAplicado
                        ? `Cargo mínimo $${activeConfig.cargo_minimo_1_cuota_usd.toFixed(2)}`
                        : `Tasa ${calculo.tasaAplicada}%`
                      : `Cargo fijo $${calculo.tasaAplicada.toFixed(2)}`}
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600 font-semibold">Monto a recibir en cuenta:</span>
                    <div className="text-right">
                      <strong className="text-base font-black text-emerald-700 font-mono">
                        ${capitalNum.toFixed(2)}
                      </strong>
                      <span className="text-[10px] text-slate-500 font-mono block">
                        Bs. {(capitalNum * bcvRate).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-slate-600 font-semibold">Costo del servicio / Interés:</span>
                    <strong className="font-bold text-amber-700 font-mono">
                      ${calculo.interesTotal.toFixed(2)}
                    </strong>
                  </div>

                  <div className="flex justify-between items-center pt-1.5 border-t border-emerald-200/60">
                    <span className="text-slate-800 font-black">Total a pagar (Capital + Interés):</span>
                    <strong className="text-sm font-black text-[#002855] font-mono">
                      ${calculo.montoTotal.toFixed(2)}
                    </strong>
                  </div>
                </div>

                {/* Monto exacto por cada cobro de nómina */}
                <div className="bg-[#002855] text-white rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-blue-200 font-bold uppercase block">
                      Monto exacto por cada cobro de nómina
                    </span>
                    <span className="text-xs text-white font-semibold">
                      Se retienen solo <strong>${capitalNum.toFixed(2)}</strong> de tu cupo al desembolsar
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-base font-black font-mono text-emerald-300">
                      {numCuotas} {numCuotas === 1 ? 'cuota' : 'cuotas'} de ${calculo.valorCuota.toFixed(2)}
                    </span>
                    <span className="text-[10px] text-blue-200 font-mono block">
                      ≈ Bs. {(calculo.valorCuota * bcvRate).toFixed(2)} c/u
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* 4. DATOS DE PAGO MÓVIL / BANCO DEL TRABAJADOR PARA RECIBIR EL DINERO */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
              <span className="text-[10px] font-black text-[#002855] uppercase tracking-wider flex items-center gap-1.5">
                <Phone size={13} className="text-blue-600" /> ¿Dónde deseas recibir tu Pago Móvil?
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 block mb-1">Banco Receptor *</label>
                  <input
                    type="text"
                    required
                    value={bancoTrabajador}
                    onChange={e => setBancoTrabajador(e.target.value)}
                    placeholder="Ej: Venezuela / Banesco"
                    className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-800 focus:border-[#002855] outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 block mb-1">Teléfono Pago Móvil *</label>
                  <input
                    type="tel"
                    required
                    value={telefonoPagoMovil}
                    onChange={e => setTelefonoPagoMovil(e.target.value)}
                    placeholder="Ej: 0412-1234567"
                    className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs font-mono font-bold text-slate-800 focus:border-[#002855] outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 block mb-1">Cédula Titular *</label>
                  <input
                    type="text"
                    required
                    value={cedulaPagoMovil}
                    onChange={e => setCedulaPagoMovil(e.target.value)}
                    placeholder="V-12345678"
                    className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs font-mono font-bold text-slate-800 focus:border-[#002855] outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Historial rápido de solicitudes del trabajador */}
            {recentWorkerRequests.length > 0 && (
              <div className="space-y-2 pt-1">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <Clock size={12} /> Mis Solicitudes Recientes
                </span>
                <div className="space-y-1.5">
                  {recentWorkerRequests.map(req => {
                    const meta = parseSolicitudMetadata(req);
                    return (
                      <div key={req.id} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs">
                        <div>
                          <strong className="font-mono text-slate-800">${Number(req.monto_capital_usd).toFixed(2)}</strong>
                          <span className="text-slate-500 ml-1.5">
                            ({req.num_cuotas}x ${Number(req.valor_cuota_usd).toFixed(2)})
                          </span>
                          {meta.referencia && (
                            <span className="block text-[10px] font-mono text-emerald-700 font-bold">
                              Ref. Pago Móvil: {meta.referencia}
                            </span>
                          )}
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                          req.estatus === 'Pendiente'
                            ? 'bg-amber-100 text-amber-800'
                            : req.estatus === 'Rechazado'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {req.estatus === 'Pendiente'
                            ? 'Pendiente por aprobar'
                            : req.estatus === 'En Pago'
                            ? 'Desembolsado'
                            : req.estatus}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Botones de Acción */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 bg-slate-100 text-slate-700 text-xs font-bold py-3.5 rounded-xl hover:bg-slate-200 transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !isMontoValido || !activeConfig.recepcion_activa}
                className="flex-1 bg-gradient-to-r from-[#002855] to-emerald-700 hover:from-[#073B73] hover:to-emerald-600 text-white text-xs font-black py-3.5 rounded-xl transition disabled:opacity-40 flex items-center justify-center gap-2 shadow-lg"
              >
                {isSubmitting ? (
                  <><RefreshCw size={14} className="animate-spin" /> Procesando...</>
                ) : (
                  <><CheckCircle2 size={15} /> Solicitar Avance</>
                )}
              </button>
            </div>
          </form>
        </FeatureGuard>
      </div>
    </div>
  );
}
