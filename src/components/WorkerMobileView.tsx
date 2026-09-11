import { useState, memo } from 'react';
import {
  Home, Store, List, Menu, QrCode, Upload,
  History, Calendar, RefreshCw, ShoppingCart, LogOut, X,
  Lock, Eye, Clock, AlertTriangle, ChevronRight, ShieldCheck,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import type { FeatureFlag, ProductoProveedor, Order } from '../types';
import { ORDER_STATUS_CONFIG } from '../types';
import { FeatureGuard } from './FeatureGuard';
import { TiendaOnlineModal } from './TiendaOnlineModal';
import { LineaDomesticaModal } from './LineaDomesticaModal';
import { AvanceEfectivoModal } from './AvanceEfectivoModal';

// ─── Tipos locales mínimos para evitar dependencia circular con App.tsx ────────
interface WorkerMini {
  id: string; nombre: string; cedula: string; cargo: string;
  limite_total: number; limite_disponible: number; nivel_credito: number;
  pagos_puntuales_consecutivos: number; qr_bloqueado: boolean;
  cupo_linea_domestica: number; cupo_linea_domestica_usado: number;
  cupo_avance_efectivo: number; cupo_avance_efectivo_usado: number;
}
interface InstallmentMini {
  id: string; monto_usd: number; fecha_cobro: string;
  estatus: string; transacciones_credicrc?: { proveedores_aliados?: { nombre: string } };
}
interface TransactionMini {
  id: string; monto_usd: number; fecha_transaccion: string;
  proveedores_aliados?: { nombre: string };
}
interface ProviderMini { id: string; nombre: string; categoria: string; logo_url?: string | null; }
interface ActiveQRMini {
  qrId: string; workerName: string; workerCedula: string;
  tokenHash: string; payloadJson: string; nivel: number;
}

type BottomTab = 'inicio' | 'comercios' | 'movimientos' | 'menu';

interface WorkerMobileViewProps {
  worker: WorkerMini;
  installments: InstallmentMini[];
  transactions: TransactionMini[];
  providers: ProviderMini[];
  productos: ProductoProveedor[];
  orders: Order[];
  flags: FeatureFlag[];
  bcvRate: number;
  activeQR: ActiveQRMini | null;
  qrCountdown: number;
  isGeneratingQR: boolean;
  isUploadingPayment: boolean;
  onGenerateQR: () => void;
  onSubmitDirectPayment: (data: {
    cuotaId: string; monto: string; ref: string;
    tipo: string; banco: string; cedula: string; telefono: string;
    file: File | null;
  }) => Promise<void>;
  onLogout: () => void;
  onNotification: (type: 'success' | 'error' | 'warning' | 'info', title: string, msg: string) => void;
  onRefresh: () => void;
}

const CREDIT_LEVELS = [
  { nivel: 1, nombre: 'Básico',     icon: '⭐',    color: 'text-slate-600'  },
  { nivel: 2, nombre: 'Confiable',  icon: '⭐⭐',  color: 'text-blue-600'   },
  { nivel: 3, nombre: 'Preferente', icon: '⭐⭐⭐', color: 'text-purple-600' },
  { nivel: 4, nombre: 'Élite',      icon: '👑',    color: 'text-amber-600'  },
];

// ─── BOTTOM SHEET WRAPPER ─────────────────────────────────────────────────────
function BottomSheet({ open, onClose, title, children }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative w-full bg-white rounded-t-3xl shadow-2xl max-h-[90dvh] flex flex-col animate-slide-in-bottom"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-slate-100 flex-shrink-0">
          <div className="w-10 h-1 bg-slate-200 rounded-full absolute top-3 left-1/2 -translate-x-1/2" />
          <h3 className="text-sm font-black text-slate-800 mt-2">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto modal-scroll p-4">{children}</div>
      </div>
    </div>
  );
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
export const WorkerMobileView = memo(function WorkerMobileView({
  worker, installments, transactions, providers, productos, orders, flags,
  bcvRate, activeQR, qrCountdown, isGeneratingQR, isUploadingPayment,
  onGenerateQR, onSubmitDirectPayment, onLogout, onNotification, onRefresh,
}: WorkerMobileViewProps) {
  const [activeTab, setActiveTab] = useState<BottomTab>('inicio');

  // Sheet states
  const [showQRSheet, setShowQRSheet] = useState(false);
  const [showPaySheet, setShowPaySheet] = useState(false);
  const [showTienda, setShowTienda] = useState<string | null>(null); // proveedorId
  const [showLineaDom, setShowLineaDom] = useState(false);
  const [showAvanceEf, setShowAvanceEf] = useState(false);

  // Direct payment form
  const [dpCuotaId, setDpCuotaId] = useState('');
  const [dpMonto, setDpMonto] = useState('');
  const [dpRef, setDpRef] = useState('');
  const [dpTipo, setDpTipo] = useState<'Pago Móvil' | 'Transferencia'>('Pago Móvil');
  const [dpBanco, setDpBanco] = useState('');
  const [dpCedula, setDpCedula] = useState('');
  const [dpTelefono, setDpTelefono] = useState('');
  const [dpFile, setDpFile] = useState<File | null>(null);

  const pendingInstallments = installments.filter(i => i.estatus === 'Pendiente');
  const lvl = CREDIT_LEVELS.find(l => l.nivel === worker.nivel_credito) || CREDIT_LEVELS[0];
  const pct = worker.limite_total > 0 ? (worker.limite_disponible / worker.limite_total) * 100 : 0;

  const proveedorActivo = providers.find(p => p.id === showTienda);
  const productosProveedor = showTienda ? productos.filter(p => p.proveedor_id === showTienda) : [];

  const workerOrders = orders.filter(o => o.trabajador_id === worker.id).slice(0, 5);

  const handlePaySubmit = async () => {
    if (!dpCuotaId || !dpMonto || !dpRef || !dpBanco || !dpCedula) {
      onNotification('error', 'Datos incompletos', 'Completa todos los campos requeridos.'); return;
    }
    await onSubmitDirectPayment({
      cuotaId: dpCuotaId, monto: dpMonto, ref: dpRef,
      tipo: dpTipo, banco: dpBanco, cedula: dpCedula, telefono: dpTelefono, file: dpFile,
    });
    setShowPaySheet(false);
    setDpCuotaId(''); setDpMonto(''); setDpRef(''); setDpBanco(''); setDpCedula(''); setDpTelefono(''); setDpFile(null);
  };

  return (
    <div className="flex flex-col bg-slate-50 min-h-screen w-full max-w-4xl mx-auto relative shadow-2xl rounded-none md:rounded-3xl border-0 md:border md:border-slate-200 overflow-hidden my-0 md:my-4">

      {/* ─── HEADER FIJO ─── */}
      <header className="bg-gradient-to-r from-[#002855] to-[#073B73] text-white px-4 pt-safe-top flex-shrink-0 sticky top-0 z-30 shadow-md"
        style={{ paddingTop: `calc(env(safe-area-inset-top, 0px) + 12px)`, paddingBottom: '12px' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
              <span className="text-lg">{lvl.icon}</span>
            </div>
            <div>
              <p className="text-[10px] text-blue-300 font-bold uppercase tracking-wider">{lvl.nombre} · {worker.cargo || 'Trabajador'}</p>
              <p className="text-sm font-black leading-tight">{(worker.nombre || 'Trabajador').split(' ')[0]} {(worker.nombre || '').split(' ')[2] || ''}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-blue-300 font-bold">Disponible</p>
            <p className="text-2xl font-black font-mono leading-none">${(worker.limite_disponible ?? 0).toFixed(0)}</p>
            <p className="text-[10px] text-blue-300 font-semibold">de ${(worker.limite_total ?? 0).toFixed(0)} USD</p>
          </div>
        </div>
        {/* Barra de progreso del cupo */}
        <div className="mt-3 h-1.5 bg-white/20 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-[#64B5F6] to-emerald-400 rounded-full transition-all duration-700"
            style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
      </header>

      {/* ─── ÁREA PRINCIPAL (scroll nativo y fluido en toda la pantalla) ─── */}
      <main className="flex-1 w-full pb-36">

        {/* ════ TAB: INICIO ════ */}
        {activeTab === 'inicio' && (
          <div className="p-4 space-y-4">

            {/* Botón QR prominente */}
            <button
              onClick={() => { onGenerateQR(); setShowQRSheet(true); }}
              disabled={isGeneratingQR || worker.qr_bloqueado}
              className={`w-full py-5 rounded-2xl text-white font-black text-base shadow-lg transition flex items-center justify-center gap-3 ${
                worker.qr_bloqueado
                  ? 'bg-slate-300 opacity-60'
                  : 'bg-gradient-to-r from-[#002855] to-[#073B73] hover:from-[#073B73] hover:to-[#002855] active:scale-[0.98]'
              }`}
            >
              {worker.qr_bloqueado ? (
                <><Lock size={20} /> QR Bloqueado — Contacta Administración</>
              ) : isGeneratingQR ? (
                <><RefreshCw size={20} className="animate-spin" /> Generando QR...</>
              ) : (
                <><QrCode size={22} className="text-amber-300" /> Mostrar Mi Código QR</>
              )}
            </button>

            {/* QR activo badge */}
            {activeQR && qrCountdown > 0 && (
              <button
                onClick={() => setShowQRSheet(true)}
                className="w-full py-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-700 text-xs font-bold flex items-center justify-center gap-2"
              >
                <Eye size={14} /> Ver QR Activo ({Math.floor(qrCountdown / 60)}:{(qrCountdown % 60).toString().padStart(2, '0')})
              </button>
            )}

            {/* Próximas cuotas */}
            {pendingInstallments.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <Calendar size={14} className="text-[#64B5F6]" />
                    <span className="text-xs font-black text-slate-700 uppercase tracking-wide">Próximo descuento</span>
                  </div>
                  <button onClick={() => setShowPaySheet(true)}
                    className="flex items-center gap-1 bg-emerald-50 text-emerald-700 text-[10px] font-black px-3 py-1.5 rounded-full border border-emerald-200">
                    <Upload size={10} /> Pago Directo
                  </button>
                </div>
                <div className="p-4 space-y-2.5">
                  {pendingInstallments.slice(0, 3).map(inst => (
                    <div key={inst.id} className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-bold text-slate-800 font-mono">${inst.monto_usd.toFixed(2)}</p>
                        <p className="text-[10px] text-slate-500 font-semibold">
                          {inst.transacciones_credicrc?.proveedores_aliados?.nombre || 'Comercio'} ·{' '}
                          {new Date(inst.fecha_cobro).toLocaleDateString('es-VE', { day: 'numeric', month: 'short' })}
                        </p>
                      </div>
                      <span className="text-[10px] text-blue-600 font-black bg-blue-50 border border-blue-200 px-2 py-1 rounded-full">
                        {inst.estatus}
                      </span>
                    </div>
                  ))}
                  {pendingInstallments.length > 3 && (
                    <button onClick={() => setActiveTab('movimientos')}
                      className="w-full text-center text-[10px] text-slate-400 font-bold hover:text-slate-600 transition py-1">
                      Ver {pendingInstallments.length - 3} más →
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Tienda Online & Estado de Pedidos */}
            <FeatureGuard moduloId="tienda_online" flags={flags}>
              <div className="bg-gradient-to-r from-[#002855] to-[#073B73] rounded-2xl p-4 text-white shadow-sm flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-1.5 text-amber-400 font-extrabold text-xs uppercase tracking-wider">
                    <ShoppingCart size={14} /> Tienda Online & Pedidos
                  </div>
                  <p className="text-white font-black text-sm mt-1">Compra productos a crédito</p>
                  <p className="text-blue-200 text-[10px] font-medium mt-0.5">Explora catálogos de proveedores aliados</p>
                </div>
                <button
                  onClick={() => setActiveTab('comercios')}
                  className="bg-amber-400 text-[#002855] font-black text-xs px-3.5 py-2 rounded-xl shadow hover:bg-amber-300 transition flex-shrink-0 flex items-center gap-1"
                >
                  <Store size={12} /> Ir a Tiendas
                </button>
              </div>
            </FeatureGuard>

            {/* Estado de pedidos recientes */}
            <FeatureGuard moduloId="pedidos_checkout" flags={flags}>
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <ShoppingCart size={14} className="text-[#64B5F6]" />
                    <span className="text-xs font-black text-slate-700 uppercase tracking-wide">Mis Pedidos Online</span>
                  </div>
                  <button onClick={() => setActiveTab('comercios')} className="text-[10px] font-bold text-[#002855] hover:underline">
                    + Nuevo Pedido
                  </button>
                </div>
                <div className="p-3 space-y-2">
                  {workerOrders.length > 0 ? (
                    workerOrders.slice(0, 3).map(order => {
                      const cfg = ORDER_STATUS_CONFIG[order.status];
                      return (
                        <div key={order.id} className={`flex items-center justify-between p-3 rounded-xl border ${cfg.border} ${cfg.bg}`}>
                          <div>
                            <p className="text-xs font-black text-slate-800 font-mono">{order.order_number}</p>
                            <p className="text-[10px] text-slate-500">${order.monto_total_usd.toFixed(2)} USD</p>
                          </div>
                          <span className={`text-[9px] font-black px-2 py-1 rounded-full ${cfg.bg} ${cfg.color} ${cfg.border} border`}>
                            {cfg.icon} {cfg.label}
                          </span>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-4 text-slate-400">
                      <p className="text-xs font-semibold">No tienes pedidos recientes</p>
                      <p className="text-[10px] mt-0.5 text-slate-400">Entra en 'Comercios' para realizar tu primera compra online.</p>
                    </div>
                  )}
                </div>
              </div>
            </FeatureGuard>

            {/* Cupos especiales */}
            <div className="grid grid-cols-2 gap-3">
              <FeatureGuard moduloId="linea_domestica" flags={flags}>
                <button onClick={() => setShowLineaDom(true)}
                  className="bg-white border border-purple-200 rounded-2xl p-4 text-left hover:border-purple-400 hover:shadow-md transition-all active:scale-[0.98]">
                  <span className="text-2xl block mb-2">🏠</span>
                  <p className="text-xs font-black text-slate-800">Línea Doméstica</p>
                  <p className="text-[10px] text-slate-500 font-semibold mt-0.5">
                    ${(worker.cupo_linea_domestica - worker.cupo_linea_domestica_usado).toFixed(0)} disp.
                  </p>
                </button>
              </FeatureGuard>
              <FeatureGuard moduloId="avance_efectivo" flags={flags}>
                <button onClick={() => setShowAvanceEf(true)}
                  className="bg-white border border-emerald-200 rounded-2xl p-4 text-left hover:border-emerald-400 hover:shadow-md transition-all active:scale-[0.98]">
                  <span className="text-2xl block mb-2">💵</span>
                  <p className="text-xs font-black text-slate-800">Avance de Efectivo</p>
                  <p className="text-[10px] text-slate-500 font-semibold mt-0.5">
                    ${(worker.cupo_avance_efectivo - worker.cupo_avance_efectivo_usado).toFixed(0)} disp.
                  </p>
                </button>
              </FeatureGuard>
            </div>
          </div>
        )}

        {/* ════ TAB: COMERCIOS ════ */}
        {activeTab === 'comercios' && (
          <div className="p-4 space-y-4">
            <h2 className="text-sm font-black text-slate-700 uppercase tracking-wide">Proveedores Aliados</h2>

            {/* Filtro chips por categoría */}
            {(() => {
              const cats = [...new Set(providers.map(p => p.categoria))];
              return (
                <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
                  {cats.map(cat => (
                    <span key={cat} className="flex-shrink-0 text-[10px] font-bold px-3 py-1.5 rounded-full bg-white border border-slate-200 text-slate-600">
                      {cat}
                    </span>
                  ))}
                </div>
              );
            })()}

            {/* Grid de proveedores */}
            <div className="grid grid-cols-1 gap-3">
              {providers.map(prov => {
                const provProductos = productos.filter(p => p.proveedor_id === prov.id && p.activo);
                const flagTienda = flags.find(f => f.modulo_id === 'tienda_online');
                const isTiendaEnabled = !flagTienda || flagTienda.activo;

                return (
                  <div key={prov.id} className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-4 hover:border-blue-300 transition">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-50 to-slate-100 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden shadow-inner border border-slate-100">
                      {prov.logo_url
                        ? <img src={prov.logo_url} alt={prov.nombre} className="w-full h-full object-cover" />
                        : <Store size={20} className="text-[#002855]" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black text-slate-800 truncate">{prov.nombre}</p>
                      <p className="text-[10px] text-slate-500 font-semibold">{prov.categoria}</p>
                      {provProductos.length > 0 ? (
                        <p className="text-[10px] text-emerald-600 font-bold mt-0.5">🛒 {provProductos.length} productos en catálogo</p>
                      ) : (
                        <p className="text-[10px] text-slate-400 font-medium mt-0.5">Catálogo online habilitado</p>
                      )}
                    </div>
                    {isTiendaEnabled && (
                      <button
                        onClick={() => setShowTienda(prov.id)}
                        className="flex-shrink-0 bg-[#002855] text-white text-[10px] font-black px-3.5 py-2 rounded-xl flex items-center gap-1.5 hover:bg-[#073B73] transition shadow-sm"
                      >
                        <ShoppingCart size={12} /> Ver Tienda
                      </button>
                    )}
                  </div>
                );
              })}
              {providers.length === 0 && (
                <p className="text-center text-slate-400 text-sm py-8">Sin proveedores disponibles</p>
              )}
            </div>
          </div>
        )}

        {/* ════ TAB: MOVIMIENTOS ════ */}
        {activeTab === 'movimientos' && (
          <div className="p-4 space-y-4">
            {/* Cuotas pendientes */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
                <Calendar size={14} className="text-[#64B5F6]" />
                <span className="text-xs font-black text-slate-700 uppercase tracking-wide">Cuotas Pendientes</span>
                <span className="ml-auto bg-blue-50 text-blue-600 text-[10px] font-black px-2 py-0.5 rounded-full border border-blue-200">
                  {pendingInstallments.length}
                </span>
              </div>
              {pendingInstallments.length === 0 ? (
                <p className="text-center text-slate-400 text-xs py-6">Sin cuotas pendientes ✅</p>
              ) : (
                <div className="divide-y divide-slate-50">
                  {installments.map(inst => (
                    <div key={inst.id} className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className="text-sm font-bold text-slate-800 font-mono">${inst.monto_usd.toFixed(2)}</p>
                        <p className="text-[10px] text-slate-500 font-semibold">
                          {inst.transacciones_credicrc?.proveedores_aliados?.nombre} ·{' '}
                          {new Date(inst.fecha_cobro).toLocaleDateString('es-VE', { day: 'numeric', month: 'short' })}
                        </p>
                      </div>
                      <span className={`text-[9px] font-black px-2 py-1 rounded-full border ${
                        inst.estatus === 'Cobrado' ? 'bg-green-50 text-green-600 border-green-200' :
                        inst.estatus === 'En Verificación' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                        inst.estatus === 'Pagado Directo' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                        'bg-blue-50 text-blue-600 border-blue-200'
                      }`}>
                        {inst.estatus}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Historial de compras */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
                <History size={14} className="text-[#64B5F6]" />
                <span className="text-xs font-black text-slate-700 uppercase tracking-wide">Historial de Compras</span>
              </div>
              {transactions.length === 0 ? (
                <p className="text-center text-slate-400 text-xs py-6">Sin compras registradas</p>
              ) : (
                <div className="divide-y divide-slate-50">
                  {transactions.slice(0, 10).map(tx => (
                    <div key={tx.id} className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className="text-sm font-bold text-slate-800">{tx.proveedores_aliados?.nombre || 'Comercio'}</p>
                        <p className="text-[10px] text-slate-500 font-semibold">
                          {new Date(tx.fecha_transaccion).toLocaleDateString('es-VE', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                      </div>
                      <p className="text-sm font-black text-slate-800 font-mono">${tx.monto_usd.toFixed(2)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ════ TAB: MENÚ / SERVICIOS ════ */}
        {activeTab === 'menu' && (
          <div className="p-4 space-y-4">
            {/* Info del trabajador */}
            <div className="bg-gradient-to-br from-[#002855] to-[#073B73] rounded-2xl p-4 text-white">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center text-2xl">{lvl.icon}</div>
                <div>
                  <p className="font-black text-base">{worker.nombre}</p>
                  <p className="text-blue-300 text-xs font-semibold">C.I. {worker.cedula} · {worker.cargo}</p>
                  <p className="text-blue-200 text-[10px] font-bold mt-0.5">Nivel {lvl.nombre} · {worker.pagos_puntuales_consecutivos} pagos puntuales</p>
                </div>
              </div>
            </div>

            {/* Servicios especiales */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Servicios Financieros</p>
              </div>
              <div className="divide-y divide-slate-50">
                <FeatureGuard moduloId="linea_domestica" flags={flags}>
                  <button onClick={() => setShowLineaDom(true)}
                    className="w-full flex items-center gap-4 px-4 py-4 hover:bg-purple-50 transition text-left">
                    <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center text-xl flex-shrink-0">🏠</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black text-slate-800">Línea Doméstica</p>
                      <p className="text-[10px] text-slate-500 font-semibold">Electrodomésticos a cuotas · ${(worker.cupo_linea_domestica - worker.cupo_linea_domestica_usado).toFixed(0)} disp.</p>
                    </div>
                    <ChevronRight size={16} className="text-slate-300 flex-shrink-0" />
                  </button>
                </FeatureGuard>
                <FeatureGuard moduloId="avance_efectivo" flags={flags}>
                  <button onClick={() => setShowAvanceEf(true)}
                    className="w-full flex items-center gap-4 px-4 py-4 hover:bg-emerald-50 transition text-left">
                    <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center text-xl flex-shrink-0">💵</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black text-slate-800">Avance de Efectivo</p>
                      <p className="text-[10px] text-slate-500 font-semibold">Con cálculo de interés transparente · ${(worker.cupo_avance_efectivo - worker.cupo_avance_efectivo_usado).toFixed(0)} disp.</p>
                    </div>
                    <ChevronRight size={16} className="text-slate-300 flex-shrink-0" />
                  </button>
                </FeatureGuard>
                <button onClick={() => setShowPaySheet(true)}
                  className="w-full flex items-center gap-4 px-4 py-4 hover:bg-blue-50 transition text-left">
                  <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0"><Upload size={18} className="text-blue-600" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-slate-800">Reportar Pago Directo</p>
                    <p className="text-[10px] text-slate-500 font-semibold">Sube tu comprobante de pago</p>
                  </div>
                  <ChevronRight size={16} className="text-slate-300 flex-shrink-0" />
                </button>
              </div>
            </div>

            {/* Cerrar sesión */}
            <button onClick={onLogout}
              className="w-full flex items-center gap-3 px-4 py-3.5 bg-white border border-red-100 rounded-2xl text-red-500 font-bold text-sm hover:bg-red-50 transition">
              <LogOut size={16} /> Cerrar Sesión
            </button>
          </div>
        )}
      </main>

      {/* ─── BOTTOM NAVIGATION BAR ─── */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-4xl z-40 bg-white border-t border-slate-200 shadow-xl"
        style={{ paddingBottom: `calc(env(safe-area-inset-bottom, 0px) + 4px)` }}>
        <div className="flex">
          {([
            { id: 'inicio', icon: <Home size={20} />, label: 'Inicio' },
            { id: 'comercios', icon: <Store size={20} />, label: 'Comercios' },
            { id: 'movimientos', icon: <List size={20} />, label: 'Movimientos' },
            { id: 'menu', icon: <Menu size={20} />, label: 'Menú' },
          ] as const).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex flex-col items-center justify-center py-3 gap-1 transition-colors relative ${
                activeTab === tab.id ? 'text-[#002855]' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              {tab.id === 'inicio' && pendingInstallments.length > 0 && activeTab !== 'inicio' && (
                <span className="absolute top-2 right-1/4 w-2 h-2 bg-amber-400 rounded-full" />
              )}
              {tab.icon}
              <span className="text-[9px] font-bold uppercase tracking-wide">{tab.label}</span>
              {activeTab === tab.id && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-[#002855] rounded-full" />
              )}
            </button>
          ))}
        </div>
      </nav>

      {/* ─── BOTTOM SHEETS ─── */}

      {/* QR Sheet */}
      <BottomSheet open={showQRSheet} onClose={() => setShowQRSheet(false)} title="Mi Código QR de Identificación">
        {activeQR ? (
          <div className="space-y-4">
            <div className={`flex flex-col items-center p-6 rounded-2xl border-2 transition-all ${
              qrCountdown <= 0 ? 'border-red-300 opacity-50' :
              qrCountdown <= 60 ? 'border-amber-400' :
              'border-[#002855]/20'
            }`}>
              {qrCountdown > 0 ? (
                <QRCodeSVG value={activeQR.payloadJson} size={220} level="H" includeMargin fgColor="#002855" bgColor="#ffffff" />
              ) : (
                <div className="w-56 h-56 bg-red-50 rounded-xl flex flex-col items-center justify-center gap-2">
                  <AlertTriangle className="text-red-400 h-10 w-10" />
                  <p className="text-red-600 font-black text-sm text-center">Expirado — genera uno nuevo</p>
                </div>
              )}
              <div className="mt-4 flex items-center gap-2">
                <Clock size={14} className={qrCountdown <= 60 ? 'text-amber-500' : 'text-slate-400'} />
                <span className={`text-sm font-mono font-black ${qrCountdown <= 0 ? 'text-red-500' : qrCountdown <= 60 ? 'text-amber-600' : 'text-[#002855]'}`}>
                  {Math.floor(qrCountdown / 60)}:{(qrCountdown % 60).toString().padStart(2, '0')}
                </span>
              </div>
            </div>
            <div className="bg-gradient-to-br from-[#002855] to-[#073B73] rounded-2xl p-4 text-white">
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheck size={14} className="text-[#64B5F6]" />
                <span className="text-xs font-black">Código Verificado CrediCRC</span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div><p className="text-blue-300 text-[10px] font-bold">TITULAR</p><p className="font-black">{activeQR.workerName}</p></div>
                <div><p className="text-blue-300 text-[10px] font-bold">CÉDULA</p><p className="font-black font-mono">{activeQR.workerCedula}</p></div>
              </div>
            </div>
            <button onClick={onGenerateQR} disabled={isGeneratingQR}
              className="w-full bg-[#002855] text-white font-black py-3 rounded-xl text-sm flex items-center justify-center gap-2 disabled:opacity-50">
              {isGeneratingQR ? <><RefreshCw size={14} className="animate-spin" />Regenerando...</> : <><RefreshCw size={14} />Regenerar QR</>}
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center py-8 gap-4">
            <div className="w-20 h-20 bg-slate-100 rounded-2xl flex items-center justify-center">
              <QrCode size={36} className="text-slate-300" />
            </div>
            <p className="text-slate-500 text-sm font-semibold text-center">Toca el botón de abajo para generar tu QR de identidad</p>
            <button onClick={onGenerateQR} disabled={isGeneratingQR}
              className="w-full bg-[#002855] text-white font-black py-3 rounded-xl text-sm flex items-center justify-center gap-2 disabled:opacity-50">
              {isGeneratingQR ? <><RefreshCw size={14} className="animate-spin" />Generando...</> : <><QrCode size={14} className="text-amber-300" />Generar QR</>}
            </button>
          </div>
        )}
      </BottomSheet>

      {/* Pago Directo Sheet */}
      <BottomSheet open={showPaySheet} onClose={() => setShowPaySheet(false)} title="Reportar Pago Directo">
        <div className="space-y-3">
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Cuota a Pagar *</label>
            <select value={dpCuotaId} onChange={e => setDpCuotaId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-semibold focus:outline-none">
              <option value="">-- Seleccionar cuota --</option>
              {pendingInstallments.map(i => (
                <option key={i.id} value={i.id}>${i.monto_usd.toFixed(2)} — {i.transacciones_credicrc?.proveedores_aliados?.nombre} — {new Date(i.fecha_cobro).toLocaleDateString('es-VE')}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Monto ($) *</label>
              <input type="number" value={dpMonto} onChange={e => setDpMonto(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-mono font-bold" placeholder="0.00" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Referencia *</label>
              <input type="text" value={dpRef} onChange={e => setDpRef(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold" placeholder="Nro. ref." />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Tipo *</label>
              <select value={dpTipo} onChange={e => setDpTipo(e.target.value as any)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold">
                <option value="Pago Móvil">Pago Móvil</option>
                <option value="Transferencia">Transferencia</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Banco *</label>
              <input type="text" value={dpBanco} onChange={e => setDpBanco(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold" placeholder="Ej: Provincial" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Cédula *</label>
              <input type="text" value={dpCedula} onChange={e => setDpCedula(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold" placeholder="V-12345678" />
            </div>
            {dpTipo === 'Pago Móvil' && (
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Teléfono *</label>
                <input type="tel" value={dpTelefono} onChange={e => setDpTelefono(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold" placeholder="0414-..." />
              </div>
            )}
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Comprobante (foto)</label>
            <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 hover:border-emerald-300 rounded-xl p-5 cursor-pointer transition group">
              <Upload size={20} className="text-slate-300 group-hover:text-emerald-500 mb-2 transition" />
              <span className="text-xs text-slate-400 font-semibold">{dpFile ? dpFile.name : 'Toca para adjuntar imagen'}</span>
              <input type="file" accept="image/*" className="hidden" onChange={e => setDpFile(e.target.files?.[0] || null)} />
            </label>
          </div>
          <button onClick={handlePaySubmit} disabled={isUploadingPayment || !dpCuotaId || !dpMonto || !dpRef || !dpBanco || !dpCedula}
            className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-black py-3.5 rounded-xl text-sm flex items-center justify-center gap-2">
            {isUploadingPayment ? <><RefreshCw size={14} className="animate-spin" />Enviando...</> : <><Upload size={14} />Reportar Pago</>}
          </button>
        </div>
      </BottomSheet>

      {/* Modales de módulos */}
      {showTienda && proveedorActivo && (
        <TiendaOnlineModal
          proveedorId={proveedorActivo.id}
          proveedorNombre={proveedorActivo.nombre}
          productos={productosProveedor}
          limiteDisponible={worker.limite_disponible}
          trabajadorId={worker.id}
          bcvRate={bcvRate}
          featureActivo={true}
          onClose={() => setShowTienda(null)}
          onPedidoCreado={(_id, num) => { onNotification('success', '¡Pedido creado!', `Pedido ${num} enviado.`); }}
          onNotification={onNotification}
        />
      )}

      {showLineaDom && (
        <LineaDomesticaModal
          trabajadorId={worker.id}
          proveedores={providers}
          cupoDisponible={worker.cupo_linea_domestica - worker.cupo_linea_domestica_usado}
          cupoTotal={worker.cupo_linea_domestica}
          bcvRate={bcvRate}
          onClose={() => setShowLineaDom(false)}
          onSolicitudCreada={onRefresh}
          onNotification={onNotification}
        />
      )}

      {showAvanceEf && (
        <AvanceEfectivoModal
          trabajadorId={worker.id}
          proveedores={providers}
          cupoDisponible={worker.cupo_avance_efectivo - worker.cupo_avance_efectivo_usado}
          cupoTotal={worker.cupo_avance_efectivo}
          bcvRate={bcvRate}
          onClose={() => setShowAvanceEf(false)}
          onSolicitudCreada={onRefresh}
          onNotification={onNotification}
        />
      )}
    </div>
  );
});
