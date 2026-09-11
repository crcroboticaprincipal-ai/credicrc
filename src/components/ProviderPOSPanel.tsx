import { useEffect } from 'react';
import {
  QrCode, Camera, Zap, CheckCircle2, AlertCircle, RefreshCw, TrendingUp, AlertTriangle, Check
} from 'lucide-react';

const CREDIT_LEVELS = [
  { nivel: 1, nombre: 'Básico',     icon: '⭐',    color: 'text-slate-500',   bg: 'bg-slate-100',   porcentaje_inicial: 0.40 },
  { nivel: 2, nombre: 'Confiable',  icon: '⭐⭐',  color: 'text-blue-600',    bg: 'bg-blue-50',     porcentaje_inicial: 0.35 },
  { nivel: 3, nombre: 'Preferente', icon: '⭐⭐⭐', color: 'text-purple-600',  bg: 'bg-purple-50',   porcentaje_inicial: 0.30 },
  { nivel: 4, nombre: 'Élite',      icon: '👑',    color: 'text-amber-600',   bg: 'bg-amber-50',    porcentaje_inicial: 0.20 },
];

function NivelBadge({ nivel, small = false }: { nivel: number; small?: boolean }) {
  const lvl = CREDIT_LEVELS.find(l => l.nivel === nivel) || CREDIT_LEVELS[0];
  return (
    <span className={`inline-flex items-center gap-1 font-extrabold rounded-full border ${small ? 'text-[9px] px-2 py-0.5' : 'text-xs px-3 py-1'} ${lvl.bg} ${lvl.color} border-current/20`}>
      <span>{lvl.icon}</span> {lvl.nombre}
    </span>
  );
}

export interface ProviderPOSPanelProps {
  currentProvider: {
    id: string;
    nombre: string;
    categoria: string;
  };
  scannedWorkerInfo: {
    nombre: string;
    cedula: string;
    nivel: number;
    limite_disponible: number;
  } | null;
  posAmount: string;
  setPosAmount: (val: string) => void;
  aplicaInicial: boolean;
  setAplicaInicial: (val: boolean) => void;
  posDays: number;
  setPosDays: (val: number) => void;
  isValidating: boolean;
  scanRetrying: boolean;
  scanRetryCount: number;
  validationResult: any;
  setValidationResult: (val: any) => void;
  inicialConfirmada: boolean;
  setInicialConfirmada: (val: boolean) => void;
  isProcessingPurchase: boolean;
  bcvRate: number;
  activeQR?: any;
  currentUserRole?: string;
  onOpenScanner: () => void;
  onSimulateScan?: () => void;
  onCancel: () => void;
  onCalculateAmount: () => void;
  onProcessPurchase: () => void;
}

export function ProviderPOSPanel({
  currentProvider,
  scannedWorkerInfo,
  posAmount,
  setPosAmount,
  aplicaInicial,
  setAplicaInicial,
  posDays,
  setPosDays,
  isValidating,
  scanRetrying,
  scanRetryCount,
  validationResult,
  setValidationResult,
  inicialConfirmada,
  setInicialConfirmada,
  isProcessingPurchase,
  bcvRate,
  activeQR,
  currentUserRole,
  onOpenScanner,
  onSimulateScan,
  onCancel,
  onCalculateAmount,
  onProcessPurchase,
}: ProviderPOSPanelProps) {

  // Auto-scroll al resultado de la operación en teléfonos móviles cuando se calculan cuotas
  useEffect(() => {
    if (validationResult) {
      const el = document.getElementById('pos-summary-result');
      if (el) {
        setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
      }
    }
  }, [validationResult]);

  // Enfocar input automáticamente al escanear
  useEffect(() => {
    if (scannedWorkerInfo && !posAmount) {
      const el = document.getElementById('pos-amount-input');
      if (el) {
        setTimeout(() => el.focus(), 150);
      }
    }
  }, [scannedWorkerInfo, posAmount]);

  return (
    <div className="space-y-4">
      {/* Header del Comercio */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-3">
        <div className="flex justify-between items-center">
          <span className="text-[10px] font-bold text-[#002855] bg-blue-50 border border-blue-100 py-1 px-3 rounded-full uppercase">
            {currentProvider.categoria}
          </span>
          <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 border border-emerald-200 py-1 px-3 rounded-full">
            Comercio Afiliado
          </span>
        </div>
        <div>
          <h3 className="text-slate-800 font-black text-sm">{currentProvider.nombre}</h3>
          <p className="text-[11px] text-slate-500 font-semibold mt-0.5">
            Escanea el QR de identidad del trabajador, luego ingresa el monto de la compra.
          </p>
        </div>

        {/* ── PASO 1: SIN TRABAJADOR ESCANEADO ── */}
        {!scannedWorkerInfo ? (
          <div className="space-y-3 mt-1">
            <div className="border-2 border-dashed border-slate-200 rounded-2xl py-8 flex flex-col items-center justify-center text-slate-400 gap-3 bg-slate-50/50">
              <QrCode size={44} className="stroke-1 animate-pulse text-[#002855]/40" />
              <p className="text-xs font-semibold text-center text-slate-600">
                Esperando QR del trabajador<br />
                <span className="text-[10px] text-slate-400">Escanea para verificar su cupo disponible</span>
              </p>
            </div>
            <button
              onClick={onOpenScanner}
              className="w-full bg-[#002855] hover:bg-[#073B73] active:scale-[0.98] text-white text-sm font-black py-4 px-4 rounded-2xl shadow-lg transition flex items-center justify-center gap-2.5"
            >
              <Camera size={20} className="text-amber-300 animate-bounce" />
              Activar Cámara y Escanear QR
            </button>
            {currentUserRole === 'admin' && activeQR && onSimulateScan && (
              <button
                onClick={onSimulateScan}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold py-2.5 px-4 rounded-xl border border-slate-200 transition flex items-center justify-center gap-1.5"
              >
                <Zap size={12} /> [Admin] Simular Escaneo del QR Activo
              </button>
            )}
          </div>
        ) : (
          /* ── PASO 2: TRABAJADOR IDENTIFICADO ── */
          <div className="space-y-4 mt-1">
            <div className="bg-gradient-to-br from-[#002855] to-[#073B73] rounded-2xl p-4 text-white shadow-md">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="text-emerald-400 h-4 w-4" />
                <span className="text-xs font-black text-emerald-300 uppercase tracking-wider">Trabajador Identificado</span>
              </div>
              <p className="font-black text-base">{scannedWorkerInfo.nombre}</p>
              <p className="text-blue-200 text-xs font-mono">{scannedWorkerInfo.cedula}</p>
              <div className="flex items-center justify-between mt-3 pt-2 border-t border-white/10">
                <NivelBadge nivel={scannedWorkerInfo.nivel} small />
                <span className="text-xs text-amber-300 font-black font-mono">
                  Cupo: ${scannedWorkerInfo.limite_disponible.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Ingrese Monto */}
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                Monto Total de la Compra ($)
              </label>
              <div className="flex gap-2">
                <input
                  id="pos-amount-input"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="1"
                  value={posAmount}
                  onChange={e => {
                    setPosAmount(e.target.value);
                    if (validationResult) setValidationResult(null);
                  }}
                  placeholder="0.00"
                  className="flex-1 bg-slate-50 border border-slate-300 rounded-xl p-3 text-2xl font-black font-mono text-slate-800 focus:outline-none focus:border-[#002855] focus:ring-2 focus:ring-[#002855]/20 transition text-center"
                />
              </div>
            </div>

            {/* Sugerencia de Inicial */}
            {scannedWorkerInfo && posAmount && parseFloat(posAmount) > 0 && (() => {
              const pct = scannedWorkerInfo.nivel === 4 ? 0.20 : scannedWorkerInfo.nivel === 3 ? 0.30 : scannedWorkerInfo.nivel === 2 ? 0.35 : 0.40;
              const sugerido = parseFloat(posAmount) * pct;
              return (
                <div className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3 flex flex-col gap-1 animate-fade-in">
                  <div className="flex justify-between items-center font-bold">
                    <span>Inicial Sugerida (Nivel {scannedWorkerInfo.nivel} - {Math.round(pct * 100)}%):</span>
                    <span className="font-mono text-sm">${sugerido.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center text-[11px] text-amber-700">
                    <span>Equivalente en Bolívares (BCV):</span>
                    <span className="font-mono font-bold">Bs. {(sugerido * bcvRate).toFixed(2)}</span>
                  </div>
                </div>
              );
            })()}

            {/* Requerimiento de Inicial */}
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                Requerimiento de Inicial
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setAplicaInicial(true);
                    if (validationResult) setValidationResult(null);
                  }}
                  className={`flex-1 py-2.5 text-xs font-black rounded-xl border transition ${aplicaInicial ? 'bg-[#002855] text-white border-[#002855]' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                >
                  Aplica Inicial
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAplicaInicial(false);
                    if (validationResult) setValidationResult(null);
                  }}
                  className={`flex-1 py-2.5 text-xs font-black rounded-xl border transition ${!aplicaInicial ? 'bg-[#002855] text-white border-[#002855]' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                >
                  Inicial Cero
                </button>
              </div>
            </div>

            {/* Plazo de Financiamiento */}
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                Plazo de Financiamiento
              </label>
              <div className="flex gap-2">
                {[7, 15].map(d => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      setPosDays(d);
                      if (validationResult) setValidationResult(null);
                    }}
                    className={`flex-1 py-2.5 text-xs font-black rounded-xl border transition ${posDays === d ? 'bg-[#002855] text-white border-[#002855]' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                  >
                    {d} Días
                  </button>
                ))}
              </div>
            </div>

            {/* Botones de acción inicial */}
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold py-3.5 px-3 rounded-xl transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={onCalculateAmount}
                disabled={isValidating || !posAmount || parseFloat(posAmount) <= 0}
                className="flex-1 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white text-xs font-black py-3.5 px-3 rounded-xl shadow-md transition flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {isValidating ? (
                  <><RefreshCw size={14} className="animate-spin" />Calculando...</>
                ) : (
                  <><TrendingUp size={14} />Calcular Cuotas</>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── PASO 3: RESUMEN Y PROCESAMIENTO DE LA VENTA ── */}
      {(validationResult || isValidating) && (
        <div id="pos-summary-result" className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-4 scroll-mt-4">
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Resumen de la Operación
          </h4>

          {isValidating ? (
            <div className="space-y-3 py-3">
              {scanRetrying ? (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                    <RefreshCw size={16} className="animate-spin text-amber-600 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-black text-amber-800">Conexión inestable, reintentando...</p>
                      <p className="text-[10px] text-amber-600 font-semibold mt-0.5">
                        Intento {scanRetryCount} de 3 · El QR escaneado está retenido en memoria.
                      </p>
                    </div>
                  </div>
                  <div className="w-full bg-amber-100 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-amber-500 h-1.5 rounded-full animate-pulse transition-all duration-1000"
                      style={{ width: `${(scanRetryCount / 3) * 100}%` }}
                    />
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <RefreshCw size={14} className="animate-spin text-[#64B5F6]" />
                  <span>Validando identidad y calculando cuotas...</span>
                </div>
              )}
            </div>
          ) : validationResult ? (
            <div className="space-y-4">
              {/* Alerta de Aprobación */}
              <div className={`p-4 rounded-xl border text-xs flex gap-3 ${validationResult.aprobado ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
                <div className="mt-0.5">
                  {validationResult.aprobado ? (
                    <CheckCircle2 className="text-green-600 h-5 w-5" />
                  ) : (
                    <AlertCircle className="text-red-600 h-5 w-5" />
                  )}
                </div>
                <div className="space-y-1 flex-1">
                  <strong className="block font-black text-sm">
                    {validationResult.aprobado ? 'Crédito Aprobado' : 'Crédito Denegado'}
                  </strong>
                  <p className="text-slate-600 leading-relaxed text-[11px] font-medium">
                    {validationResult.mensaje}
                  </p>
                </div>
              </div>

              {validationResult.aprobado && (
                <div className="space-y-4">
                  {/* Desglose */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                    <p className="text-[10px] text-slate-500 font-black uppercase tracking-wider">
                      Desglose Calculado por el Sistema
                    </p>
                    {[
                      ['Monto Total de la Compra', `$${parseFloat(posAmount).toFixed(2)}`, 'text-slate-800'],
                      ['Nivel del Trabajador', `${CREDIT_LEVELS[(validationResult.nivel_credito || 1) - 1]?.icon} ${CREDIT_LEVELS[(validationResult.nivel_credito || 1) - 1]?.nombre}`, 'text-blue-700'],
                      ['Pago Inicial (calculado)', `$${validationResult.monto_inicial_calculado.toFixed(2)}`, 'text-amber-700 font-black text-base'],
                      ['Cuota a Financiar (nómina)', `$${validationResult.cuota_financiada.toFixed(2)}`, 'text-[#002855] font-black text-base'],
                      ['Equiv. Bs. a Descontar', `Bs. ${(validationResult.cuota_financiada * bcvRate).toFixed(2)}`, 'text-[#E53935]'],
                      ['Plazo', `${posDays} días`, 'text-slate-600'],
                    ].map(([label, val, cls]) => (
                      <div key={label as string} className="flex justify-between text-xs">
                        <span className="text-slate-500 font-semibold">{label}</span>
                        <span className={`font-bold font-mono ${cls}`}>{val}</span>
                      </div>
                    ))}
                  </div>

                  {/* Banner Dinámico de Alerta de Inicial */}
                  {aplicaInicial && validationResult.monto_inicial_calculado > 0 ? (
                    <div className="rounded-2xl overflow-hidden shadow-xl">
                      <div className={`bg-gradient-to-br from-amber-500 via-orange-500 to-red-500 p-5 text-center space-y-2 ${!inicialConfirmada ? 'animate-pulse' : ''}`}>
                        <div className="flex items-center justify-center gap-2">
                          <AlertTriangle className="text-white h-6 w-6" />
                          <p className="text-white font-black text-sm uppercase tracking-widest">VERIFICAR PAGO DE INICIAL</p>
                        </div>
                        <p className="text-4xl font-black text-white font-mono tracking-tight">
                          ${validationResult.monto_inicial_calculado.toFixed(2)}
                        </p>
                        <p className="text-lg font-black text-amber-100 font-mono">
                          Bs. {(validationResult.monto_inicial_calculado * bcvRate).toFixed(2)}
                        </p>
                        <p className="text-[11px] text-amber-100 font-semibold leading-snug">
                          El trabajador debe pagar este monto exacto en tienda antes de registrar la venta.
                        </p>
                      </div>
                      {!inicialConfirmada ? (
                        <button
                          type="button"
                          onClick={() => setInicialConfirmada(true)}
                          className="w-full bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-sm py-4 px-4 flex items-center justify-center gap-2 transition-all duration-200 shadow-lg"
                        >
                          <CheckCircle2 size={20} />
                          Confirmar Recepción de Inicial en Tienda
                        </button>
                      ) : (
                        <div className="bg-emerald-500 text-white font-black text-xs py-3 px-4 flex items-center justify-center gap-2">
                          <CheckCircle2 size={16} /> Inicial confirmada — Puedes procesar la venta
                        </div>
                      )}
                    </div>
                  ) : !aplicaInicial ? (
                    <div className="bg-gradient-to-br from-emerald-500 to-green-600 rounded-2xl p-5 text-center space-y-2 shadow-xl">
                      <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mx-auto animate-bounce">
                        <CheckCircle2 className="text-white h-8 w-8" />
                      </div>
                      <p className="text-white font-black text-lg uppercase tracking-wide">Venta Autorizada</p>
                      <p className="text-emerald-100 font-black text-xl">Inicial Cero ✔</p>
                      <p className="text-emerald-200 text-xs font-semibold">
                        Cuota a financiar: <strong className="text-white font-mono">${validationResult.cuota_financiada.toFixed(2)}</strong>
                      </p>
                    </div>
                  ) : null}

                  {/* Acciones Finales */}
                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={onCancel}
                      className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold py-3.5 px-3 rounded-xl transition"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      disabled={isProcessingPurchase || (aplicaInicial && validationResult.monto_inicial_calculado > 0 && !inicialConfirmada)}
                      onClick={onProcessPurchase}
                      className="flex-1 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-emerald-600 hover:to-green-500 active:scale-[0.98] text-white text-xs font-extrabold py-3.5 px-4 rounded-xl shadow-lg transition flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {isProcessingPurchase ? (
                        <><RefreshCw size={14} className="animate-spin" />Registrando...</>
                      ) : (
                        <><Check size={14} />Confirmar y Procesar Venta</>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
