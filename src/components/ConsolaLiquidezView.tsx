import { useState, useEffect, useMemo } from 'react';
import {
  Banknote, CheckCircle2, XCircle, Clock, Sliders, FileSpreadsheet,
  TrendingUp, ShieldCheck, RefreshCw, Copy, Check,
  Calendar, Phone, LogOut, PauseCircle, PlayCircle
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import {
  DEFAULT_CONFIGURACION_LIQUIDEZ,
  calcularAvancePorPlazo,
  parseSolicitudMetadata,
  getOperacionesComprasStatus,
  type FeatureFlag,
  type ConfiguracionLiquidez,
  type AvanceEfectivoSolicitud,
  type AvanceEfectivoCuota,
} from '../types';

interface ProviderInfo {
  id: string;
  nombre: string;
  categoria: string;
  tipo_proveedor?: string | null;
  cuenta_enlace?: string;
  telefono?: string;
  pago_movil_banco?: string;
  pago_movil_cedula?: string;
  pago_movil_telefono?: string;
}

interface WorkerBasic {
  id: string;
  nombre: string;
  cedula: string;
  cargo: string;
  salario_base: number;
  limite_total: number;
  limite_disponible: number;
}

interface ConsolaLiquidezViewProps {
  provider: ProviderInfo;
  solicitudes: AvanceEfectivoSolicitud[];
  cuotas: AvanceEfectivoCuota[];
  workers: WorkerBasic[];
  configLiquidez: ConfiguracionLiquidez | null;
  bcvRate: number;
  enCorteNomina?: boolean;
  mensajeCorteNomina?: string;
  onSaveConfig: (cfg: ConfiguracionLiquidez) => Promise<void>;
  onRefresh: () => Promise<void>;
  onNotification: (type: 'success' | 'warning' | 'info' | 'error', title: string, message: string) => void;
  onLogout: () => void;
}

type ConsoleTab = 'bandeja' | 'configurador' | 'reporte';
type BandejaFilter = 'pendientes' | 'aprobados' | 'rechazados' | 'todos';

export function ConsolaLiquidezView({
  provider,
  solicitudes,
  cuotas,
  workers,
  configLiquidez,
  bcvRate,
  enCorteNomina = false,
  mensajeCorteNomina,
  onSaveConfig,
  onRefresh,
  onNotification,
  onLogout,
}: ConsolaLiquidezViewProps) {
  const [activeTab, setActiveTab] = useState<ConsoleTab>('bandeja');
  const [bandejaFilter, setBandejaFilter] = useState<BandejaFilter>('pendientes');

  // Estado local del Configurador Dinámico
  const effectiveConfig: ConfiguracionLiquidez = useMemo(() => ({
    proveedor_id: provider.id,
    ...DEFAULT_CONFIGURACION_LIQUIDEZ,
    ...(configLiquidez || {}),
  }), [provider.id, configLiquidez]);

  const [recepcionActiva, setRecepcionActiva] = useState<boolean>(effectiveConfig.recepcion_activa);
  const [modalidadRecargo, setModalidadRecargo] = useState<'porcentaje' | 'monto_fijo'>(effectiveConfig.modalidad_recargo);
  const [tasa1Cuota, setTasa1Cuota] = useState<string>(String(effectiveConfig.tasa_1_cuota));
  const [cargoMinimo1Cuota, setCargoMinimo1Cuota] = useState<string>(String(effectiveConfig.cargo_minimo_1_cuota_usd));
  const [tasa2Cuotas, setTasa2Cuotas] = useState<string>(String(effectiveConfig.tasa_2_cuotas));
  const [tasa3Cuotas, setTasa3Cuotas] = useState<string>(String(effectiveConfig.tasa_3_cuotas));
  const [montoMinimo, setMontoMinimo] = useState<string>(String(effectiveConfig.monto_minimo_usd));
  const [montoMaximo, setMontoMaximo] = useState<string>(String(effectiveConfig.monto_maximo_usd));
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  // Sincronizar cuando cambia el proveedor activo o la configuración cargada
  useEffect(() => {
    setRecepcionActiva(effectiveConfig.recepcion_activa);
    setModalidadRecargo(effectiveConfig.modalidad_recargo);
    setTasa1Cuota(String(effectiveConfig.tasa_1_cuota));
    setCargoMinimo1Cuota(String(effectiveConfig.cargo_minimo_1_cuota_usd));
    setTasa2Cuotas(String(effectiveConfig.tasa_2_cuotas));
    setTasa3Cuotas(String(effectiveConfig.tasa_3_cuotas));
    setMontoMinimo(String(effectiveConfig.monto_minimo_usd));
    setMontoMaximo(String(effectiveConfig.monto_maximo_usd));
  }, [effectiveConfig]);

  // Estado de desembolso y rechazo por solicitud
  const [referenciasInput, setReferenciasInput] = useState<Record<string, string>>({});
  const [motivosRechazoInput, setMotivosRechazoInput] = useState<Record<string, string>>({});
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isExportingExcel, setIsExportingExcel] = useState(false);

  // Mapa rápido de trabajadores
  const workerMap = useMemo(() => {
    const m: Record<string, WorkerBasic> = {};
    workers.forEach(w => { m[w.id] = w; });
    return m;
  }, [workers]);

  // Solicitudes pertenecientes a este proveedor de liquidez (o todas si es el único proveedor de liquidez)
  const providerSolicitudes = useMemo(() => {
    return solicitudes.filter(s => !s.proveedor_liquidez_id || s.proveedor_liquidez_id === provider.id);
  }, [solicitudes, provider.id]);

  const pendingSolicitudes = useMemo(
    () => providerSolicitudes.filter(s => s.estatus === 'Pendiente'),
    [providerSolicitudes]
  );
  const approvedSolicitudes = useMemo(
    () => providerSolicitudes.filter(s =>
      s.estatus === 'Aprobado' || s.estatus === 'Desembolsado' || s.estatus === 'En Pago' || s.estatus === 'Completado'
    ),
    [providerSolicitudes]
  );
  const rejectedSolicitudes = useMemo(
    () => providerSolicitudes.filter(s => s.estatus === 'Rechazado'),
    [providerSolicitudes]
  );

  const filteredSolicitudes = useMemo(() => {
    if (bandejaFilter === 'pendientes') return pendingSolicitudes;
    if (bandejaFilter === 'aprobados') return approvedSolicitudes;
    if (bandejaFilter === 'rechazados') return rejectedSolicitudes;
    return providerSolicitudes;
  }, [bandejaFilter, pendingSolicitudes, approvedSolicitudes, rejectedSolicitudes, providerSolicitudes]);

  // Cálculo de próxima fecha de corte de nómina (día 15 o fin de mes)
  const getNextPayrollCutoffDate = (): string => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const d = now.getDate();
    if (d <= 12) {
      return new Date(y, m, 15).toISOString().split('T')[0];
    }
    const lastDay = new Date(y, m + 1, 0).getDate();
    if (d <= 25) {
      return new Date(y, m, lastDay).toISOString().split('T')[0];
    }
    return new Date(y, m + 1, 15).toISOString().split('T')[0];
  };

  // ── Acción: Guardar Configuración de Condiciones y Tasas ──
  const handleSaveConfigSubmit = async (e?: React.FormEvent, overrideActiva?: boolean) => {
    if (e) e.preventDefault();
    const t1 = parseFloat(tasa1Cuota);
    const p1 = parseFloat(cargoMinimo1Cuota);
    const t2 = parseFloat(tasa2Cuotas);
    const t3 = parseFloat(tasa3Cuotas);
    const minVal = parseFloat(montoMinimo);
    const maxVal = parseFloat(montoMaximo);

    if ([t1, p1, t2, t3, minVal, maxVal].some(v => isNaN(v) || v < 0)) {
      onNotification('error', 'Valores Inválidos', 'Revisa que todas las tasas y montos sean números válidos.');
      return;
    }
    if (minVal < 5 || maxVal > 40 || minVal > maxVal) {
      onNotification('error', 'Rango de Montos Inválido', 'El monto mínimo debe ser al menos $5.00 y el máximo hasta $40.00.');
      return;
    }

    setIsSavingConfig(true);
    try {
      const newCfg: ConfiguracionLiquidez = {
        proveedor_id: provider.id,
        recepcion_activa: overrideActiva !== undefined ? overrideActiva : recepcionActiva,
        modalidad_recargo: modalidadRecargo,
        tasa_1_cuota: Math.round(t1 * 100) / 100,
        cargo_minimo_1_cuota_usd: Math.round(p1 * 100) / 100,
        tasa_2_cuotas: Math.round(t2 * 100) / 100,
        tasa_3_cuotas: Math.round(t3 * 100) / 100,
        monto_minimo_usd: Math.round(minVal * 100) / 100,
        monto_maximo_usd: Math.round(maxVal * 100) / 100,
        updated_at: new Date().toISOString(),
      };
      await onSaveConfig(newCfg);
      onNotification('success', 'Condiciones Actualizadas', 'Las tasas y parámetros de liquidez se guardaron en tiempo real.');
    } catch (err: any) {
      onNotification('error', 'Error al Guardar', err.message || 'No se pudo actualizar la configuración.');
    } finally {
      setIsSavingConfig(false);
    }
  };

  // ── Acción: Confirmar Desembolso (Retención Atómica de Capital en el Cupo de $40) ──
  const handleConfirmDisbursement = async (sol: AvanceEfectivoSolicitud) => {
    if (enCorteNomina) {
      onNotification('warning', '⏸️ Corte de Nómina en Curso', 'Por favor no procese desembolsos en este momento hasta que concluya la conciliación administrativa.');
      return;
    }
    const ref = (referenciasInput[sol.id] || '').trim();
    if (!ref) {
      onNotification('warning', 'Referencia Requerida', 'Ingresa los últimos dígitos o referencia del Pago Móvil enviado al trabajador.');
      return;
    }
    if (processingId) return;

    const worker = workerMap[sol.trabajador_id];
    const capitalSolicitado = Number(sol.monto_capital_usd);

    setProcessingId(sol.id);
    try {
      // Blindaje en vivo: verificar que operaciones_compras_activas sea TRUE antes de descontar saldo
      try {
        const { data: liveFlags } = await supabase.from('feature_flags').select('*');
        if (liveFlags) {
          const corte = getOperacionesComprasStatus(liveFlags as FeatureFlag[]);
          if (corte.enCorteNomina) {
            onNotification(
              'warning',
              '⏸️ Corte de Nómina en Curso',
              corte.mensajeBloqueo || 'Por favor no procese desembolsos en este momento. El sistema reabrirá la facturación en breve una vez concluya la conciliación administrativa.'
            );
            return;
          }
        }
      } catch { /* ignorar error de red */ }

      const fechaPrimeraCuota = getNextPayrollCutoffDate();

      // 1. Intentar RPC atómico en PostgreSQL (FOR UPDATE)
      const { data: rpcData, error: rpcErr } = await supabase.rpc('desembolsar_avance_efectivo', {
        p_solicitud_id: sol.id,
        p_referencia_pago: ref,
        p_fecha_primera_cuota: fechaPrimeraCuota,
      });

      if (!rpcErr && rpcData && rpcData[0]) {
        const res = rpcData[0];
        if (!res.ok) {
          onNotification('error', 'No se pudo desembolsar', res.mensaje);
          return;
        }
        onNotification('success', '💸 Desembolso Confirmado', res.mensaje);
        setReferenciasInput(prev => ({ ...prev, [sol.id]: '' }));
        await onRefresh();
        return;
      }

      // 2. Fallback transaccional seguro si la función RPC aún no ha sido aplicada en el SQL Editor
      const { data: freshWorker, error: wErr } = await supabase
        .from('trabajadores_crc')
        .select('id, limite_total, limite_disponible')
        .eq('id', sol.trabajador_id)
        .single();
      if (wErr || !freshWorker) throw new Error('No se pudo verificar el saldo disponible del trabajador.');

      const dispActual = parseFloat(String(freshWorker.limite_disponible));
      if (dispActual < capitalSolicitado) {
        onNotification(
          'error',
          'Cupo Insuficiente',
          `El trabajador posee actualmente $${dispActual.toFixed(2)} disponibles y el capital solicitado es $${capitalSolicitado.toFixed(2)}.`
        );
        return;
      }

      // Verificar que la solicitud siga en 'Pendiente'
      const { data: freshSol } = await supabase
        .from('avance_efectivo_solicitudes')
        .select('estatus, notas')
        .eq('id', sol.id)
        .single();
      if (freshSol && freshSol.estatus !== 'Pendiente') {
        onNotification('warning', 'Solicitud Ya Procesada', `La solicitud ya se encuentra en estado ${freshSol.estatus}.`);
        await onRefresh();
        return;
      }

      // Restar ÚNICAMENTE el monto del capital prestado del limite_disponible (jamás el interés)
      const nuevoDisponible = Math.max(0, Math.round((dispActual - capitalSolicitado) * 100) / 100);
      const { error: upWorkerErr } = await supabase
        .from('trabajadores_crc')
        .update({ limite_disponible: nuevoDisponible })
        .eq('id', sol.trabajador_id);
      if (upWorkerErr) throw upWorkerErr;

      // Preservar metadatos en JSON dentro de notas además de intentar columnas nuevas
      const currentMeta = parseSolicitudMetadata(sol);
      const updatedNotasJson = JSON.stringify({
        banco_trabajador: currentMeta.banco,
        telefono_pago_movil: currentMeta.telefono,
        cedula_pago_movil: currentMeta.cedula,
        referencia_desembolso: ref,
        fecha_desembolso: new Date().toISOString(),
        nota_libre: currentMeta.notaLibre,
      });

      const { error: upSolErr } = await supabase
        .from('avance_efectivo_solicitudes')
        .update({
          estatus: 'En Pago',
          notas: updatedNotasJson,
        })
        .eq('id', sol.id);
      if (upSolErr) throw upSolErr;

      // Generar cuotas exactas vinculadas a los cortes de nómina si aún no existen
      const existingCuotas = cuotas.filter(c => c.solicitud_id === sol.id);
      if (existingCuotas.length === 0) {
        const numCuotas = (sol.num_cuotas === 1 || sol.num_cuotas === 2 || sol.num_cuotas === 3 ? sol.num_cuotas : 1) as 1 | 2 | 3;
        const calc = calcularAvancePorPlazo(capitalSolicitado, numCuotas, {
          modalidad_recargo: sol.tipo_interes,
          tasa_1_cuota: Number(sol.valor_interes),
          tasa_2_cuotas: Number(sol.valor_interes),
          tasa_3_cuotas: Number(sol.valor_interes),
          cargo_minimo_1_cuota_usd: Number(sol.monto_interes_total_usd),
        });

        const baseDate = new Date(`${fechaPrimeraCuota}T12:00:00`);
        const cuotasRows = calc.cuotas.map((c, idx) => {
          const d = new Date(baseDate.getTime() + idx * 15 * 86400000);
          return {
            solicitud_id: sol.id,
            numero_cuota: c.numero,
            capital_usd: c.capital,
            interes_usd: c.interes,
            monto_usd: c.total,
            fecha_cobro: d.toISOString().split('T')[0],
            estatus: 'Pendiente',
          };
        });
        const { error: insCuotasErr } = await supabase.from('avance_efectivo_cuotas').insert(cuotasRows);
        if (insCuotasErr) throw insCuotasErr;
      }

      onNotification(
        'success',
        '💸 Desembolso Confirmado',
        `Transferencia Ref. ${ref} registrada para ${worker?.nombre || 'el trabajador'}. Cupo disponible actualizado a $${nuevoDisponible.toFixed(2)} (retenido solo capital de $${capitalSolicitado.toFixed(2)}).`
      );
      setReferenciasInput(prev => ({ ...prev, [sol.id]: '' }));
      await onRefresh();
    } catch (err: any) {
      onNotification('error', 'Error al Desembolsar', err.message || 'Error procesando el desembolso.');
    } finally {
      setProcessingId(null);
    }
  };

  // ── Acción: Rechazar Solicitud (Sin tocar cupo del trabajador) ──
  const handleRejectRequest = async (sol: AvanceEfectivoSolicitud) => {
    if (processingId) return;
    const motivo = (motivosRechazoInput[sol.id] || '').trim() || 'Solicitud rechazada por disponibilidad o datos bancarios.';
    setProcessingId(sol.id);
    try {
      const { data: rpcData, error: rpcErr } = await supabase.rpc('rechazar_avance_efectivo', {
        p_solicitud_id: sol.id,
        p_motivo: motivo,
      });

      if (!rpcErr && rpcData && rpcData[0]) {
        if (!rpcData[0].ok) {
          onNotification('error', 'Error', rpcData[0].mensaje);
          return;
        }
        onNotification('info', 'Solicitud Rechazada', rpcData[0].mensaje);
        setRejectingId(null);
        await onRefresh();
        return;
      }

      // Fallback
      const currentMeta = parseSolicitudMetadata(sol);
      const updatedNotasJson = JSON.stringify({
        banco_trabajador: currentMeta.banco,
        telefono_pago_movil: currentMeta.telefono,
        cedula_pago_movil: currentMeta.cedula,
        motivo_rechazo: motivo,
        nota_libre: currentMeta.notaLibre,
      });

      const { error } = await supabase
        .from('avance_efectivo_solicitudes')
        .update({ estatus: 'Rechazado', notas: updatedNotasJson })
        .eq('id', sol.id);
      if (error) throw error;

      onNotification('info', 'Solicitud Rechazada', 'La solicitud fue rechazada sin afectar el cupo del trabajador.');
      setRejectingId(null);
      await onRefresh();
    } catch (err: any) {
      onNotification('error', 'Error al Rechazar', err.message);
    } finally {
      setProcessingId(null);
    }
  };

  // ── Métricas Financieras para el Reporte (0% Comisión Plataforma / 100% Neto) ──
  const financialMetrics = useMemo(() => {
    let capitalActivo = 0;
    let interesesProyectados = 0;
    let totalRecaudado = 0;
    let pendienteNomina = 0;

    approvedSolicitudes.forEach(sol => {
      const solCuotas = cuotas.filter(c => c.solicitud_id === sol.id);
      interesesProyectados += Number(sol.monto_interes_total_usd || 0);

      if (solCuotas.length > 0) {
        solCuotas.forEach(c => {
          if (c.estatus === 'Cobrado' || c.estatus === 'Pagado Directo') {
            totalRecaudado += Number(c.monto_usd || 0);
          } else if (c.estatus === 'Pendiente') {
            capitalActivo += Number(c.capital_usd || 0);
            pendienteNomina += Number(c.monto_usd || 0);
          }
        });
      } else if (sol.estatus !== 'Completado') {
        capitalActivo += Number(sol.monto_capital_usd || 0);
        pendienteNomina += Number(sol.monto_total_usd || 0);
      } else {
        totalRecaudado += Number(sol.monto_total_usd || 0);
      }
    });

    return {
      capitalActivo: Math.round(capitalActivo * 100) / 100,
      interesesProyectados: Math.round(interesesProyectados * 100) / 100,
      totalRecaudado: Math.round(totalRecaudado * 100) / 100,
      pendienteNomina: Math.round(pendienteNomina * 100) / 100,
    };
  }, [approvedSolicitudes, cuotas]);

  const handleCopyPagoMovil = (solId: string, text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedId(solId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDownloadExcel = async () => {
    setIsExportingExcel(true);
    try {
      const { exportLiquidityReportExcel } = await import('../utils/excelExporter');
      await exportLiquidityReportExcel(provider.nombre, providerSolicitudes, cuotas, workers, bcvRate);
      onNotification('success', 'Excel Descargado', 'El Reporte Financiero de Liquidez (.xlsx) se generó exitosamente.');
    } catch (err: any) {
      onNotification('error', 'Error al Exportar Excel', err.message || 'No se pudo generar el archivo Excel.');
    } finally {
      setIsExportingExcel(false);
    }
  };

  // Previsualización en vivo de la matriz de simulación ($10, $15, $20, $25, $30, $40)
  const previewAmounts = [10, 15, 20, 25, 30, 40];
  const previewConfig: Partial<ConfiguracionLiquidez> = {
    modalidad_recargo: modalidadRecargo,
    tasa_1_cuota: parseFloat(tasa1Cuota) || 0,
    cargo_minimo_1_cuota_usd: parseFloat(cargoMinimo1Cuota) || 0,
    tasa_2_cuotas: parseFloat(tasa2Cuotas) || 0,
    tasa_3_cuotas: parseFloat(tasa3Cuotas) || 0,
  };

  return (
    <div
      className="w-full min-h-screen bg-[#f1f5f9] flex flex-col text-left"
      style={{ paddingBottom: 'calc(6.5rem + env(safe-area-inset-bottom, 24px))' }}
    >
      {/* ── ENCABEZADO CORPORATIVO DE CONSOLA DE LIQUIDEZ ── */}
      <div className="bg-gradient-to-r from-[#002855] via-[#073B73] to-emerald-900 text-white px-4 md:px-8 pt-6 pb-6 rounded-b-3xl lg:rounded-3xl shadow-xl border border-[#001f42]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center flex-shrink-0 shadow-inner">
              <Banknote size={24} className="text-emerald-300" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                  Consola Exclusiva · Proveedor de Liquidez
                </span>
                <span className="bg-amber-400/20 border border-amber-300/40 text-amber-200 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                  0% Comisión Plataforma · 100% Neto
                </span>
              </div>
              <h2 className="text-xl md:text-2xl font-black tracking-tight mt-1">{provider.nombre}</h2>
              <p className="text-xs text-blue-200 font-medium mt-0.5">
                Gestión de Avances de Efectivo, Tasas por Corte de Nómina y Desembolsos Pago Móvil · Tasa BCV: <strong className="text-white font-mono">Bs. {bcvRate.toFixed(2)}</strong>
              </p>
            </div>
          </div>

          {/* Interruptor Rápido de Disponibilidad de Caja + Logout Móvil */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                const next = !recepcionActiva;
                setRecepcionActiva(next);
                void handleSaveConfigSubmit(undefined, next);
              }}
              className={`px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-2 border transition shadow-sm ${
                recepcionActiva
                  ? 'bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-400'
                  : 'bg-amber-500 hover:bg-amber-600 text-white border-amber-400'
              }`}
            >
              {recepcionActiva ? <PlayCircle size={15} /> : <PauseCircle size={15} />}
              {recepcionActiva ? 'Recepción de Solicitudes: ACTIVA' : 'Recepción PAUSADA (Sin Caja)'}
            </button>

            <button
              type="button"
              onClick={() => onRefresh()}
              className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition"
              title="Actualizar bandeja en tiempo real"
            >
              <RefreshCw size={15} />
            </button>

            <button
              type="button"
              onClick={onLogout}
              className="lg:hidden p-2.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-200 transition"
              title="Cerrar sesión"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>

        {/* Barra de Pestañas Desktop */}
        <div className="hidden md:flex items-center gap-2 mt-6 pt-4 border-t border-white/10">
          {([
            { id: 'bandeja', label: 'Bandeja de Solicitudes y Desembolsos', icon: <Clock size={15} />, badge: pendingSolicitudes.length },
            { id: 'configurador', label: 'Configurador Dinámico de Condiciones y Tasas', icon: <Sliders size={15} /> },
            { id: 'reporte', label: 'Reporte Financiero y Exportación Excel (.xlsx)', icon: <FileSpreadsheet size={15} /> },
          ] as const).map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 transition-all ${
                activeTab === tab.id
                  ? 'bg-white text-[#002855] shadow-md'
                  : 'bg-white/10 text-blue-100 hover:bg-white/20'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
              {'badge' in tab && tab.badge > 0 && (
                <span className="bg-[#E53935] text-white text-[10px] font-black px-2 py-0.5 rounded-full">
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── CONTENIDO DE LAS 3 SECCIONES CLAVE ── */}
      <div className="p-4 md:p-6 space-y-6 flex-1">

        {/* ══════════════════════════════════════════════════════════════════════
            SECCIÓN 1: BANDEJA DE SOLICITUDES Y DESEMBOLSOS
        ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'bandeja' && (
          <div className="space-y-5 animate-fade-in">
            {/* Alerta de Pausa Temporal por Corte de Nómina */}
            {enCorteNomina && (
              <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-300 rounded-2xl p-4 space-y-1.5 shadow-sm">
                <div className="flex items-center gap-2 text-amber-900 font-black text-xs">
                  <Clock size={16} className="text-amber-600 flex-shrink-0 animate-pulse" />
                  <span>⏸️ Corte de Nómina en Curso</span>
                </div>
                <p className="text-xs text-amber-800 font-semibold leading-relaxed">
                  ⏸️ Corte de Nómina en Curso: Por favor no procese ventas ni desembolsos en este momento. El sistema reabrirá la facturación en breve una vez concluya la conciliación administrativa.
                </p>
                {mensajeCorteNomina && (
                  <p className="text-[11px] text-amber-700 font-bold bg-white/80 border border-amber-200 rounded-xl px-3 py-1.5 mt-1">
                    {mensajeCorteNomina}
                  </p>
                )}
              </div>
            )}

            {/* Sub-filtros por estado */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex flex-wrap gap-1.5">
                {([
                  { id: 'pendientes', label: 'Pendientes por Aprobar', count: pendingSolicitudes.length, dot: 'bg-amber-400' },
                  { id: 'aprobados', label: 'Aprobados / Desembolsados', count: approvedSolicitudes.length, dot: 'bg-emerald-500' },
                  { id: 'rechazados', label: 'Rechazados', count: rejectedSolicitudes.length, dot: 'bg-red-500' },
                  { id: 'todos', label: 'Todos', count: providerSolicitudes.length, dot: 'bg-blue-500' },
                ] as const).map(f => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setBandejaFilter(f.id)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition ${
                      bandejaFilter === f.id
                        ? 'bg-[#002855] text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${f.dot}`} />
                    <span>{f.label}</span>
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                      bandejaFilter === f.id ? 'bg-white/20 text-white' : 'bg-white text-slate-700'
                    }`}>
                      {f.count}
                    </span>
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-slate-500 font-semibold">
                El cupo del trabajador solo se retiene al confirmar el desembolso.
              </p>
            </div>

            {filteredSolicitudes.length === 0 ? (
              <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center space-y-3 shadow-sm">
                <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                  <Banknote size={28} />
                </div>
                <h3 className="text-sm font-black text-slate-700">Sin solicitudes en esta bandeja</h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  {bandejaFilter === 'pendientes'
                    ? 'Actualmente no hay solicitudes pendientes por desembolsar.'
                    : 'No se encontraron registros para el filtro seleccionado.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {filteredSolicitudes.map(sol => {
                  const worker = sol.trabajadores_crc || workerMap[sol.trabajador_id];
                  const meta = parseSolicitudMetadata(sol);
                  const solCuotas = cuotas
                    .filter(c => c.solicitud_id === sol.id)
                    .sort((a, b) => a.numero_cuota - b.numero_cuota);

                  // Si aún está Pendiente, previsualizar las cuotas que se generarán
                  const numC = (sol.num_cuotas === 1 || sol.num_cuotas === 2 || sol.num_cuotas === 3 ? sol.num_cuotas : 1) as 1 | 2 | 3;
                  const simulatedCuotas = solCuotas.length > 0
                    ? solCuotas.map(c => ({
                        numero: c.numero_cuota,
                        capital: Number(c.capital_usd),
                        interes: Number(c.interes_usd),
                        total: Number(c.monto_usd),
                        estatus: c.estatus,
                        fecha_cobro: c.fecha_cobro,
                      }))
                    : calcularAvancePorPlazo(Number(sol.monto_capital_usd), numC, {
                        modalidad_recargo: sol.tipo_interes,
                        tasa_1_cuota: Number(sol.valor_interes),
                        tasa_2_cuotas: Number(sol.valor_interes),
                        tasa_3_cuotas: Number(sol.valor_interes),
                        cargo_minimo_1_cuota_usd: Number(sol.monto_interes_total_usd),
                      }).cuotas.map(c => ({
                        ...c,
                        estatus: 'Pendiente' as const,
                        fecha_cobro: '',
                      }));

                  const montoCapitalBs = Math.round(Number(sol.monto_capital_usd) * bcvRate * 100) / 100;
                  const copyString = `Banco: ${meta.banco || 'N/D'} | Tel: ${meta.telefono || 'N/D'} | CI: ${meta.cedula || worker?.cedula || 'N/D'} | Monto: Bs. ${montoCapitalBs.toFixed(2)} ($${Number(sol.monto_capital_usd).toFixed(2)})`;

                  const isPending = sol.estatus === 'Pendiente';
                  const isRejected = sol.estatus === 'Rechazado';
                  const isCompleted = sol.estatus === 'Completado';

                  return (
                    <div
                      key={sol.id}
                      className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition ${
                        isPending
                          ? 'border-amber-300 ring-1 ring-amber-200/50'
                          : isRejected
                          ? 'border-red-200 opacity-80'
                          : 'border-emerald-200'
                      }`}
                    >
                      {/* Cabecera de la solicitud */}
                      <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-[#002855] text-white font-black text-sm flex items-center justify-center">
                            {(worker?.nombre || 'T').charAt(0)}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-black text-slate-800 text-sm">{worker?.nombre || 'Trabajador'}</h4>
                              <span className="text-[11px] font-mono font-bold text-slate-500 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                                CI: {worker?.cedula || meta.cedula || '—'}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-400 font-semibold">
                              Solicitado: {new Date(sol.created_at).toLocaleString('es-VE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              {worker?.limite_disponible !== undefined && (
                                <span className="ml-2 text-emerald-700 font-bold">
                                  · Cupo actual del trabajador: ${Number(worker.limite_disponible).toFixed(2)}
                                </span>
                              )}
                            </p>
                          </div>
                        </div>

                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                          isPending
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : isRejected
                            ? 'bg-red-50 text-red-700 border-red-200'
                            : isCompleted
                            ? 'bg-green-50 text-green-700 border-green-200'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}>
                          {isPending
                            ? '⏳ Pendiente por Aprobar'
                            : isRejected
                            ? '❌ Rechazado'
                            : isCompleted
                            ? '🎉 Completado (Pagado)'
                            : '✅ Aprobado / Desembolsado'}
                        </span>
                      </div>

                      {/* Cuerpo en 3 columnas */}
                      <div className="p-5 grid grid-cols-1 lg:grid-cols-3 gap-5">
                        {/* Columna 1: Datos de Pago Móvil / Banco del Trabajador */}
                        <div className="bg-blue-50/70 border border-blue-200 rounded-2xl p-4 space-y-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black text-[#002855] uppercase tracking-wider flex items-center gap-1.5">
                              <Phone size={13} className="text-blue-600" /> Datos para Transferir al Trabajador
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopyPagoMovil(sol.id, copyString)}
                              className="text-[10px] font-bold bg-white hover:bg-blue-100 text-[#002855] px-2.5 py-1 rounded-lg border border-blue-200 flex items-center gap-1 transition"
                            >
                              {copiedId === sol.id ? <><Check size={11} className="text-emerald-600" /> Copiado</> : <><Copy size={11} /> Copiar</>}
                            </button>
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-xs bg-white p-3 rounded-xl border border-blue-100">
                            <div>
                              <span className="text-[9px] text-slate-400 font-bold uppercase block">Banco Destino</span>
                              <strong className="text-slate-800">{meta.banco || 'No especificado'}</strong>
                            </div>
                            <div>
                              <span className="text-[9px] text-slate-400 font-bold uppercase block">Teléfono Pago Móvil</span>
                              <strong className="text-slate-800 font-mono">{meta.telefono || 'No especificado'}</strong>
                            </div>
                            <div className="col-span-2 pt-1 border-t border-slate-100 flex justify-between items-center">
                              <div>
                                <span className="text-[9px] text-slate-400 font-bold uppercase block">Cédula Titular</span>
                                <strong className="text-slate-800 font-mono">{meta.cedula || worker?.cedula || '—'}</strong>
                              </div>
                              <div className="text-right">
                                <span className="text-[9px] text-emerald-700 font-bold uppercase block">Monto a Transferir</span>
                                <strong className="text-emerald-700 font-mono text-sm">
                                  ${Number(sol.monto_capital_usd).toFixed(2)} (Bs. {montoCapitalBs.toFixed(2)})
                                </strong>
                              </div>
                            </div>
                          </div>
                          {meta.notaLibre && (
                            <p className="text-[11px] text-slate-600 italic">Nota: "{meta.notaLibre}"</p>
                          )}
                        </div>

                        {/* Columna 2: Monto Solicitado, Plazo y Desglose de Cuotas */}
                        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                          <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                            <Calendar size={13} className="text-[#002855]" /> Desglose Financiero ({sol.num_cuotas} {sol.num_cuotas === 1 ? 'Cuota' : 'Cuotas'})
                          </span>

                          <div className="grid grid-cols-3 gap-2 text-center bg-white p-2.5 rounded-xl border border-slate-200">
                            <div>
                              <span className="text-[9px] text-slate-400 font-bold uppercase block">Capital</span>
                              <strong className="text-sm font-black text-slate-800 font-mono">${Number(sol.monto_capital_usd).toFixed(2)}</strong>
                            </div>
                            <div className="border-x border-slate-100">
                              <span className="text-[9px] text-emerald-600 font-bold uppercase block">Ganancia Interés</span>
                              <strong className="text-sm font-black text-emerald-600 font-mono">+${Number(sol.monto_interes_total_usd).toFixed(2)}</strong>
                            </div>
                            <div>
                              <span className="text-[9px] text-[#002855] font-bold uppercase block">Total Retorno</span>
                              <strong className="text-sm font-black text-[#002855] font-mono">${Number(sol.monto_total_usd).toFixed(2)}</strong>
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            {simulatedCuotas.map(c => (
                              <div key={c.numero} className="flex items-center justify-between text-[11px] bg-white px-3 py-1.5 rounded-lg border border-slate-200">
                                <span className="font-bold text-slate-700">
                                  Cuota #{c.numero} {c.fecha_cobro ? `(${new Date(c.fecha_cobro + 'T12:00:00').toLocaleDateString('es-VE', { day: '2-digit', month: 'short' })})` : ''}
                                </span>
                                <span className="font-mono text-slate-500">
                                  Cap: ${c.capital.toFixed(2)} + Int: ${c.interes.toFixed(2)} = <strong className="text-slate-900">${c.total.toFixed(2)}</strong>
                                </span>
                                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${
                                  c.estatus === 'Cobrado' || c.estatus === 'Pagado Directo'
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : 'bg-amber-50 text-amber-700'
                                }`}>
                                  {c.estatus}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Columna 3: Acción de Desembolso o Detalle de Operación */}
                        <div className="flex flex-col justify-between bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                          {isPending ? (
                            <>
                              <div className="space-y-2">
                                <label className="text-[10px] font-black text-[#002855] uppercase tracking-wider block">
                                  Referencia / Últimos Dígitos de Pago Móvil *
                                </label>
                                <input
                                  type="text"
                                  value={referenciasInput[sol.id] || ''}
                                  onChange={e => setReferenciasInput(prev => ({ ...prev, [sol.id]: e.target.value }))}
                                  placeholder="Ej: 849201 (Ref. transferencia)"
                                  className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold text-slate-800 focus:outline-none focus:border-[#002855] focus:ring-2 focus:ring-[#002855]/20"
                                />
                                <p className="text-[10px] text-slate-500 leading-relaxed">
                                  Al confirmar, se descontarán únicamente <strong>${Number(sol.monto_capital_usd).toFixed(2)}</strong> del cupo disponible del trabajador y se programarán sus <strong>{sol.num_cuotas} cuotas</strong> en nómina.
                                </p>
                              </div>

                              {rejectingId === sol.id ? (
                                <div className="space-y-2 pt-2 border-t border-slate-200">
                                  <input
                                    type="text"
                                    value={motivosRechazoInput[sol.id] || ''}
                                    onChange={e => setMotivosRechazoInput(prev => ({ ...prev, [sol.id]: e.target.value }))}
                                    placeholder="Motivo del rechazo (opcional)"
                                    className="w-full bg-white border border-red-200 rounded-xl px-3 py-2 text-xs font-semibold"
                                  />
                                  <div className="flex gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setRejectingId(null)}
                                      className="flex-1 py-2 rounded-xl text-xs font-bold bg-slate-200 text-slate-700"
                                    >
                                      Cancelar
                                    </button>
                                    <button
                                      type="button"
                                      disabled={processingId === sol.id}
                                      onClick={() => handleRejectRequest(sol)}
                                      className="flex-1 py-2 rounded-xl text-xs font-black bg-red-600 hover:bg-red-700 text-white"
                                    >
                                      Confirmar Rechazo
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex gap-2 pt-1">
                                  <button
                                    type="button"
                                    onClick={() => setRejectingId(sol.id)}
                                    disabled={processingId === sol.id}
                                    className="px-3.5 py-3 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold transition flex items-center gap-1"
                                  >
                                    <XCircle size={14} /> Rechazar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleConfirmDisbursement(sol)}
                                    disabled={enCorteNomina || processingId === sol.id}
                                    className="flex-1 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-md transition flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    {processingId === sol.id ? (
                                      <><RefreshCw size={14} className="animate-spin" /> Procesando...</>
                                    ) : enCorteNomina ? (
                                      <><Clock size={14} /> Corte en Curso</>
                                    ) : (
                                      <><CheckCircle2 size={15} /> Confirmar Desembolso</>
                                    )}
                                  </button>
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="space-y-2.5 my-auto">
                              <div className="flex items-center gap-2 text-xs font-black text-slate-700">
                                {isRejected ? (
                                  <><XCircle size={16} className="text-red-500" /> Solicitud Rechazada</>
                                ) : (
                                  <><CheckCircle2 size={16} className="text-emerald-600" /> Desembolso Ejecutado</>
                                )}
                              </div>
                              {!isRejected && (
                                <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-1 text-xs">
                                  <div className="flex justify-between">
                                    <span className="text-slate-400 font-bold">Ref. Pago Móvil:</span>
                                    <span className="font-mono font-black text-[#002855]">{meta.referencia || 'Registrado'}</span>
                                  </div>
                                  {meta.fechaDesembolso && (
                                    <div className="flex justify-between">
                                      <span className="text-slate-400 font-bold">Fecha Desembolso:</span>
                                      <span className="font-semibold text-slate-700">
                                        {new Date(meta.fechaDesembolso).toLocaleString('es-VE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              )}
                              {isRejected && meta.motivoRechazo && (
                                <p className="text-xs text-red-600 bg-red-50 p-2.5 rounded-xl border border-red-100 font-semibold">
                                  Motivo: {meta.motivoRechazo}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            SECCIÓN 2: CONFIGURADOR DINÁMICO DE CONDICIONES Y TASAS
        ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'configurador' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fade-in">
            {/* Formulario de Configuración */}
            <form onSubmit={e => handleSaveConfigSubmit(e)} className="lg:col-span-7 bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-6">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div>
                  <h3 className="text-base font-black text-[#002855] flex items-center gap-2">
                    <Sliders size={18} className="text-emerald-600" /> Configurador Dinámico de Condiciones y Tasas
                  </h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    Define en tiempo real las tasas vinculadas a los cortes de nómina del trabajador.
                  </p>
                </div>
              </div>

              {/* Interruptor de Recepción de Solicitudes */}
              <div className={`p-4 rounded-2xl border flex items-center justify-between gap-4 ${
                recepcionActiva ? 'bg-emerald-50/70 border-emerald-200' : 'bg-amber-50 border-amber-200'
              }`}>
                <div>
                  <p className="text-xs font-black text-slate-800">
                    Interruptor de Disponibilidad de Caja (Recepción de Solicitudes)
                  </p>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    {recepcionActiva
                      ? 'Los trabajadores pueden enviarte solicitudes de avance de efectivo en tiempo real.'
                      : 'Recepción pausada temporalmente. Los trabajadores verán un aviso de pausa.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setRecepcionActiva(!recepcionActiva)}
                  className={`px-4 py-2 rounded-xl text-xs font-black transition shadow-sm ${
                    recepcionActiva ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-white'
                  }`}
                >
                  {recepcionActiva ? 'ACTIVO' : 'PAUSADO'}
                </button>
              </div>

              {/* Modalidad de Recargo */}
              <div className="space-y-2">
                <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider block">
                  Modalidad de Recargo Financiero
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setModalidadRecargo('porcentaje')}
                    className={`p-3.5 rounded-2xl border-2 text-left transition ${
                      modalidadRecargo === 'porcentaje'
                        ? 'border-[#002855] bg-[#002855]/5'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <p className="text-xs font-black text-[#002855]">Porcentaje (%) sobre el Capital</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">Calcula interés porcentual según el plazo (con piso mínimo en 1 cuota).</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalidadRecargo('monto_fijo')}
                    className={`p-3.5 rounded-2xl border-2 text-left transition ${
                      modalidadRecargo === 'monto_fijo'
                        ? 'border-[#002855] bg-[#002855]/5'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <p className="text-xs font-black text-[#002855]">Monto Fijo ($) por Plazo</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">Define un cargo fijo en dólares para 1, 2 o 3 cuotas.</p>
                  </button>
                </div>
              </div>

              {/* Valores para los 3 Plazos Permitidos */}
              <div className="space-y-3">
                <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider block">
                  Tasas por Plazo (Cortes de Cobro de Nómina)
                </label>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* 1 Cuota */}
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2">
                    <span className="text-[10px] font-black text-[#002855] uppercase bg-blue-100 px-2 py-0.5 rounded-md">
                      1 Cuota (Próximo cobro)
                    </span>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block mb-1">
                        {modalidadRecargo === 'porcentaje' ? 'Porcentaje (%)' : 'Cargo Fijo ($)'}
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={tasa1Cuota}
                        onChange={e => setTasa1Cuota(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-sm font-mono font-black text-slate-800"
                      />
                    </div>
                    {modalidadRecargo === 'porcentaje' && (
                      <div>
                        <label className="text-[10px] font-bold text-emerald-700 block mb-1">
                          Cargo Mínimo Piso ($)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={cargoMinimo1Cuota}
                          onChange={e => setCargoMinimo1Cuota(e.target.value)}
                          className="w-full bg-emerald-50 border border-emerald-200 rounded-xl p-2 text-xs font-mono font-black text-emerald-800"
                        />
                        <p className="text-[9px] text-slate-400 mt-1">
                          Ej: En $10 al 10% ($1.00), aplica el piso de ${cargoMinimo1Cuota || '1.50'}.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* 2 Cuotas */}
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2">
                    <span className="text-[10px] font-black text-[#002855] uppercase bg-blue-100 px-2 py-0.5 rounded-md">
                      2 Cuotas (2 fechas de cobro)
                    </span>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block mb-1">
                        {modalidadRecargo === 'porcentaje' ? 'Porcentaje sobre capital (%)' : 'Cargo Fijo Total ($)'}
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={tasa2Cuotas}
                        onChange={e => setTasa2Cuotas(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-sm font-mono font-black text-slate-800"
                      />
                    </div>
                    <p className="text-[10px] text-slate-400">
                      Valor por defecto recomendado: 16% sobre el capital.
                    </p>
                  </div>

                  {/* 3 Cuotas */}
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2">
                    <span className="text-[10px] font-black text-[#002855] uppercase bg-blue-100 px-2 py-0.5 rounded-md">
                      3 Cuotas (3 fechas de cobro)
                    </span>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block mb-1">
                        {modalidadRecargo === 'porcentaje' ? 'Porcentaje sobre capital (%)' : 'Cargo Fijo Total ($)'}
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={tasa3Cuotas}
                        onChange={e => setTasa3Cuotas(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-sm font-mono font-black text-slate-800"
                      />
                    </div>
                    <p className="text-[10px] text-slate-400">
                      Valor por defecto: 24% (bloqueado automáticamente en avances de $10).
                    </p>
                  </div>
                </div>
              </div>

              {/* Límites de Monto Mínimo y Máximo */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase block mb-1">
                    Monto Mínimo Permitido ($)
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="5"
                    max="40"
                    value={montoMinimo}
                    onChange={e => setMontoMinimo(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-mono font-black text-slate-800"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase block mb-1">
                    Monto Máximo (Tope Cupo $40.00)
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="10"
                    max="40"
                    value={montoMaximo}
                    onChange={e => setMontoMaximo(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-mono font-black text-slate-800"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={isSavingConfig}
                  className="w-full md:w-auto bg-[#002855] hover:bg-[#073B73] text-white text-xs font-black py-3.5 px-6 rounded-xl shadow-md transition flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isSavingConfig ? <><RefreshCw size={15} className="animate-spin" /> Guardando...</> : <><Check size={15} /> Guardar Condiciones y Tasas</>}
                </button>
              </div>
            </form>

            {/* Tabla de Verificación en Vivo ($10, $15, $20, $25, $30, $40 en 1, 2 y 3 cuotas) */}
            <div className="lg:col-span-5 bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
              <div>
                <h4 className="text-sm font-black text-[#002855] flex items-center gap-2">
                  <TrendingUp size={16} className="text-emerald-600" /> Matriz de Simulación en Tiempo Real
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Comprobación inmediata de cuotas para cada escalón de monto ($10 a $40).
                </p>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                <table className="w-full text-xs text-left">
                  <thead className="bg-[#002855] text-white text-[10px] uppercase">
                    <tr>
                      <th className="py-2.5 px-3">Capital</th>
                      <th className="py-2.5 px-3">1 Cuota</th>
                      <th className="py-2.5 px-3">2 Cuotas</th>
                      <th className="py-2.5 px-3">3 Cuotas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {previewAmounts.map(amt => {
                      const c1 = calcularAvancePorPlazo(amt, 1, previewConfig);
                      const c2 = calcularAvancePorPlazo(amt, 2, previewConfig);
                      const c3 = calcularAvancePorPlazo(amt, 3, previewConfig);
                      const block3 = amt <= 10;
                      return (
                        <tr key={amt} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 font-mono font-black text-[#002855]">${amt.toFixed(2)}</td>
                          <td className="py-2.5 px-3 font-mono">
                            <span className="font-bold text-slate-800">1x ${c1.valorCuota.toFixed(2)}</span>
                            <span className="block text-[10px] text-emerald-600">+${c1.interesTotal.toFixed(2)} int.</span>
                          </td>
                          <td className="py-2.5 px-3 font-mono">
                            <span className="font-bold text-slate-800">2x ${c2.valorCuota.toFixed(2)}</span>
                            <span className="block text-[10px] text-emerald-600">Tot: ${c2.montoTotal.toFixed(2)}</span>
                          </td>
                          <td className="py-2.5 px-3 font-mono">
                            {block3 ? (
                              <span className="text-[10px] font-bold text-red-500 bg-red-50 px-2 py-0.5 rounded">
                                Bloqueado ($10)
                              </span>
                            ) : (
                              <>
                                <span className="font-bold text-slate-800">3x ${c3.valorCuota.toFixed(2)}</span>
                                <span className="block text-[10px] text-emerald-600">Tot: ${c3.montoTotal.toFixed(2)}</span>
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            SECCIÓN 3: REPORTE FINANCIERO DE LIQUIDEZ Y EXPORTACIÓN A EXCEL (.XLSX)
        ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'reporte' && (
          <div className="space-y-6 animate-fade-in">
            {/* Banner 0% Comisión + Botón Descargar Excel */}
            <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center flex-shrink-0">
                  <ShieldCheck size={20} className="text-emerald-600" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-black text-[#002855]">Reporte Financiero de Liquidez</h3>
                    <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black px-2.5 py-0.5 rounded-full">
                      0% Comisión Plataforma · 100% Neto
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    El 100% del capital recuperado más el 100% de los intereses generados pertenecen íntegramente al Proveedor de Liquidez.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleDownloadExcel}
                disabled={isExportingExcel}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black py-3 px-5 rounded-xl shadow-md transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isExportingExcel ? (
                  <><RefreshCw size={15} className="animate-spin" /> Generando Excel...</>
                ) : (
                  <><FileSpreadsheet size={16} /> Descargar Reporte en Excel (.xlsx)</>
                )}
              </button>
            </div>

            {/* 4 Tarjetas de Resumen KPI */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">
                  Capital Total Prestado Activo ($)
                </span>
                <p className="text-2xl font-black text-[#002855] font-mono mt-2">
                  ${financialMetrics.capitalActivo.toFixed(2)}
                </p>
                <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                  Bs. {(financialMetrics.capitalActivo * bcvRate).toFixed(2)}
                </p>
              </div>

              <div className="bg-emerald-50/70 p-5 rounded-2xl border border-emerald-200 shadow-sm">
                <span className="text-[10px] font-black text-emerald-700 uppercase tracking-wider block">
                  Intereses Proyectados (100% Neto)
                </span>
                <p className="text-2xl font-black text-emerald-700 font-mono mt-2">
                  +${financialMetrics.interesesProyectados.toFixed(2)}
                </p>
                <p className="text-[11px] text-emerald-600 font-mono mt-0.5">
                  Bs. {(financialMetrics.interesesProyectados * bcvRate).toFixed(2)}
                </p>
              </div>

              <div className="bg-blue-50/70 p-5 rounded-2xl border border-blue-200 shadow-sm">
                <span className="text-[10px] font-black text-blue-700 uppercase tracking-wider block">
                  Total Recaudado en el Ciclo ($)
                </span>
                <p className="text-2xl font-black text-blue-800 font-mono mt-2">
                  ${financialMetrics.totalRecaudado.toFixed(2)}
                </p>
                <p className="text-[11px] text-blue-600 font-mono mt-0.5">
                  Bs. {(financialMetrics.totalRecaudado * bcvRate).toFixed(2)}
                </p>
              </div>

              <div className="bg-amber-50/70 p-5 rounded-2xl border border-amber-200 shadow-sm">
                <span className="text-[10px] font-black text-amber-700 uppercase tracking-wider block">
                  Pendiente por Cobrar en Nómina ($)
                </span>
                <p className="text-2xl font-black text-amber-700 font-mono mt-2">
                  ${financialMetrics.pendienteNomina.toFixed(2)}
                </p>
                <p className="text-[11px] text-amber-600 font-mono mt-0.5">
                  Bs. {(financialMetrics.pendienteNomina * bcvRate).toFixed(2)}
                </p>
              </div>
            </div>

            {/* Tabla Detallada de Préstamos */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <h4 className="text-xs font-black text-[#002855] uppercase tracking-wider">
                  Detalle de Avances de Efectivo y Ganancia Neta (0% Comisión)
                </h4>
                <span className="text-xs text-slate-400 font-bold">{approvedSolicitudes.length} operaciones</span>
              </div>

              {approvedSolicitudes.length === 0 ? (
                <div className="p-10 text-center text-xs text-slate-400 font-semibold">
                  Aún no hay desembolsos confirmados en el ciclo actual.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left text-slate-600">
                    <thead className="bg-slate-50 text-[10px] text-slate-500 uppercase tracking-wider border-b border-slate-200">
                      <tr>
                        <th className="py-3 px-4">Fecha</th>
                        <th className="py-3 px-4">Trabajador</th>
                        <th className="py-3 px-4">Ref. Pago Móvil</th>
                        <th className="py-3 px-4 text-right">Capital ($)</th>
                        <th className="py-3 px-4 text-right text-emerald-700">Ganancia Neta ($)</th>
                        <th className="py-3 px-4 text-right">Total a Pagar ($)</th>
                        <th className="py-3 px-4 text-center">Cuotas Pagadas</th>
                        <th className="py-3 px-4 text-center">Cuotas Pendientes</th>
                        <th className="py-3 px-4 text-right">Recaudado ($)</th>
                        <th className="py-3 px-4 text-right">Pendiente ($)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {approvedSolicitudes.map(sol => {
                        const w = sol.trabajadores_crc || workerMap[sol.trabajador_id];
                        const meta = parseSolicitudMetadata(sol);
                        const solCuotas = cuotas.filter(c => c.solicitud_id === sol.id);
                        const pagadas = solCuotas.filter(c => c.estatus === 'Cobrado' || c.estatus === 'Pagado Directo').length;
                        const pendientes = solCuotas.length > 0
                          ? solCuotas.filter(c => c.estatus === 'Pendiente').length
                          : sol.num_cuotas;
                        const recaudado = solCuotas
                          .filter(c => c.estatus === 'Cobrado' || c.estatus === 'Pagado Directo')
                          .reduce((s, c) => s + Number(c.monto_usd), 0);
                        const pendiente = solCuotas.length > 0
                          ? solCuotas.filter(c => c.estatus === 'Pendiente').reduce((s, c) => s + Number(c.monto_usd), 0)
                          : Number(sol.monto_total_usd);

                        return (
                          <tr key={sol.id} className="hover:bg-slate-50/70 transition">
                            <td className="py-3 px-4 whitespace-nowrap">
                              {new Date(sol.created_at).toLocaleDateString('es-VE')}
                            </td>
                            <td className="py-3 px-4">
                              <strong className="text-slate-800 block">{w?.nombre || 'Trabajador'}</strong>
                              <span className="text-[10px] font-mono text-slate-400">{w?.cedula || meta.cedula}</span>
                            </td>
                            <td className="py-3 px-4 font-mono text-[11px] font-bold text-[#002855]">
                              {meta.referencia || '—'}
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-bold text-slate-800">
                              ${Number(sol.monto_capital_usd).toFixed(2)}
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-black text-emerald-600">
                              +${Number(sol.monto_interes_total_usd).toFixed(2)}
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-black text-[#002855]">
                              ${Number(sol.monto_total_usd).toFixed(2)}
                            </td>
                            <td className="py-3 px-4 text-center">
                              <span className="bg-emerald-50 text-emerald-700 font-black px-2 py-0.5 rounded-full text-[10px]">
                                {pagadas} / {sol.num_cuotas}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center">
                              <span className="bg-amber-50 text-amber-700 font-black px-2 py-0.5 rounded-full text-[10px]">
                                {pendientes}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-bold text-blue-700">
                              ${recaudado.toFixed(2)}
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-bold text-amber-700">
                              ${pendiente.toFixed(2)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── BARRA DE NAVEGACIÓN INFERIOR EXCLUSIVA PARA MÓVIL (RESPETANDO SAFE-AREA) ── */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="flex items-stretch h-16">
          {([
            { id: 'bandeja', label: 'Solicitudes', icon: <Clock size={20} />, badge: pendingSolicitudes.length },
            { id: 'configurador', label: 'Tasas y Cupo', icon: <Sliders size={20} /> },
            { id: 'reporte', label: 'Reporte Excel', icon: <FileSpreadsheet size={20} /> },
          ] as const).map(item => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 relative transition-all ${
                  isActive ? 'text-[#002855]' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                {isActive && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-0.5 bg-emerald-600 rounded-full" />
                )}
                <div className="relative">
                  {item.icon}
                  {'badge' in item && item.badge > 0 && (
                    <span className="absolute -top-1.5 -right-2.5 bg-[#E53935] text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center">
                      {item.badge > 9 ? '9+' : item.badge}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-extrabold tracking-tight">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
