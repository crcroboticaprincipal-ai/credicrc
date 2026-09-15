import { useState, memo, useMemo } from 'react';
import {
  Package2, QrCode, Store, LogOut, Upload, X, RefreshCw, Camera,
  History, Percent, Building2, Save
} from 'lucide-react';
import type { Order, ProductoProveedor, FeatureFlag, Transaction, Installment } from '../types';
import { FeatureGuard } from './FeatureGuard';
import { PedidosProviderPanel } from './PedidosProviderPanel';

export type ProviderTab = 'pos' | 'pedidos' | 'ventas' | 'productos' | 'perfil';

export interface ProviderMini {
  id: string; nombre: string; categoria: string; logo_url?: string | null;
  cuenta_enlace: string; comision_colegio: number; comision_por_cobrar?: number;
  direccion?: string | null; telefono?: string | null;
  pago_movil_banco?: string | null; pago_movil_cedula?: string | null; pago_movil_telefono?: string | null;
}

interface ProviderMobileViewProps {
  provider: ProviderMini;
  productos: ProductoProveedor[];
  orders: Order[];
  transactions?: Transaction[];
  installments?: Installment[];
  bcvRate?: number;
  flags: FeatureFlag[];
  posSlot?: React.ReactNode;
  onOpenScanner?: () => void;
  onAddProduct: (data: { nombre: string; descripcion: string; precio: string; imagen?: File }) => Promise<void>;
  onToggleProduct: (id: string, activo: boolean) => Promise<void>;
  onToggleStock: (id: string, disponible: boolean) => Promise<void>;
  onDeleteProduct: (id: string) => Promise<void>;
  onOrderStatusChange: () => void;
  onSaveProfile?: (data: {
    direccion: string;
    telefono: string;
    pago_movil_banco: string;
    pago_movil_cedula: string;
    pago_movil_telefono: string;
    logoFile?: File | null;
  }) => Promise<void>;
  onNotification: (type: 'success' | 'error' | 'warning' | 'info', title: string, msg: string) => void;
  onLogout: () => void;
}

const SALES_PER_PAGE = 5;

// ─── BOTTOM SHEET ─────────────────────────────────────────────────────────────
function BottomSheet({ open, onClose, title, children }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative w-full bg-white rounded-t-3xl shadow-2xl max-h-[90dvh] flex flex-col animate-slide-in-bottom"
        onClick={e => e.stopPropagation()}>
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
export const ProviderMobileView = memo(function ProviderMobileView({
  provider,
  productos,
  orders,
  transactions = [],
  installments = [],
  bcvRate = 36.5,
  flags,
  posSlot,
  onOpenScanner,
  onAddProduct,
  onToggleProduct,
  onToggleStock,
  onDeleteProduct,
  onOrderStatusChange,
  onSaveProfile,
  onNotification,
  onLogout,
}: ProviderMobileViewProps) {
  const [activeTab, setActiveTab] = useState<ProviderTab>('pos');
  const [ventasSubTab, setVentasSubTab] = useState<'ventas' | 'reporte'>('ventas');
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [salesPage, setSalesPage] = useState(1);

  // Formulario Perfil Comercio
  const [editDireccion, setEditDireccion] = useState(provider.direccion || '');
  const [editTelefono, setEditTelefono] = useState(provider.telefono || '');
  const [editPmBanco, setEditPmBanco] = useState(provider.pago_movil_banco || '');
  const [editPmCedula, setEditPmCedula] = useState(provider.pago_movil_cedula || '');
  const [editPmTelefono, setEditPmTelefono] = useState(provider.pago_movil_telefono || '');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Nuevo producto form
  const [npNombre, setNpNombre] = useState('');
  const [npDesc, setNpDesc] = useState('');
  const [npPrecio, setNpPrecio] = useState('');
  const [npImagen, setNpImagen] = useState<File | undefined>();
  const [isAddingProduct, setIsAddingProduct] = useState(false);

  const provProductos = productos.filter(p => p.proveedor_id === provider.id);
  const productosActivos = provProductos.filter(p => p.activo).length;
  const pendingOrders = orders.filter(o => o.proveedor_id === provider.id && o.status === 'pending').length;

  // Transacciones del proveedor
  const providerTransactions = useMemo(() => {
    return transactions.filter(t => t.proveedor_id === provider.id);
  }, [transactions, provider.id]);

  // Meses disponibles para reportes
  const reportMonths = useMemo(() => {
    return Array.from(new Set(providerTransactions.map(t => t.fecha_transaccion ? t.fecha_transaccion.slice(0, 7) : ''))).filter(Boolean).sort().reverse();
  }, [providerTransactions]);

  const [selectedReportMonth, setSelectedReportMonth] = useState<string>('');
  const activeReportMonth = selectedReportMonth || (reportMonths.length > 0 ? reportMonths[0] : '');

  // Transacciones del mes seleccionado
  const monthlyTransactions = useMemo(() => {
    if (!activeReportMonth) return [];
    return providerTransactions.filter(t => t.fecha_transaccion && t.fecha_transaccion.startsWith(activeReportMonth));
  }, [providerTransactions, activeReportMonth]);

  // Estadísticas del mes
  const monthlyStats = useMemo(() => {
    let bruto = 0;
    let pagado = 0;
    let comision = 0;

    monthlyTransactions.forEach(t => {
      bruto += t.monto_usd;
      comision += t.comision_monto_usd;
      const txInsts = installments.filter(i => i.transaccion_id === t.id);
      const isPaid = txInsts.length > 0 && txInsts.every(i => i.estatus === 'Cobrado' || i.estatus === 'Pagado Directo');
      if (isPaid) {
        pagado += t.monto_usd;
      }
    });

    return { bruto, pagado, comision, neto: bruto - comision };
  }, [monthlyTransactions, installments]);

  const handleAddProduct = async () => {
    if (!npNombre.trim() || !npPrecio) {
      onNotification('error', 'Datos incompletos', 'Nombre y precio son requeridos.'); return;
    }
    setIsAddingProduct(true);
    try {
      await onAddProduct({ nombre: npNombre, descripcion: npDesc, precio: npPrecio, imagen: npImagen });
      setNpNombre(''); setNpDesc(''); setNpPrecio(''); setNpImagen(undefined);
      setShowAddProduct(false);
      onNotification('success', 'Producto Añadido', 'Producto publicado exitosamente en tu vitrina.');
    } catch (err: any) {
      onNotification('error', 'Error al publicar', err?.message || 'No se pudo guardar el producto.');
    } finally {
      setIsAddingProduct(false);
    }
  };

  const handleSaveProfileSubmit = async () => {
    if (!onSaveProfile) return;
    setIsSavingProfile(true);
    try {
      await onSaveProfile({
        direccion: editDireccion,
        telefono: editTelefono,
        pago_movil_banco: editPmBanco,
        pago_movil_cedula: editPmCedula,
        pago_movil_telefono: editPmTelefono,
        logoFile,
      });
      setLogoFile(null);
      onNotification('success', 'Perfil Actualizado', 'Los datos de tu comercio se han guardado correctamente.');
    } catch (err: any) {
      onNotification('error', 'Error al guardar', err?.message || 'No se pudo actualizar el perfil');
    } finally {
      setIsSavingProfile(false);
    }
  };

  return (
    <div className="flex flex-col bg-slate-50 min-h-screen w-full max-w-4xl mx-auto relative shadow-2xl rounded-none md:rounded-3xl border-0 md:border md:border-slate-200 my-0 md:my-4">

      {/* ─── HEADER FIJO CON SAFE AREA ─── */}
      <header className="bg-gradient-to-r from-[#002855] to-[#073B73] text-white px-4 flex-shrink-0 sticky top-0 z-30 shadow-md"
        style={{ paddingTop: `calc(env(safe-area-inset-top, 0px) + 12px)`, paddingBottom: '12px' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center overflow-hidden border border-white/20 shadow-inner">
              {provider.logo_url
                ? <img src={provider.logo_url} alt={provider.nombre} className="w-full h-full object-cover" />
                : <Store className="text-white h-5 w-5" />}
            </div>
            <div>
              <p className="text-[10px] text-blue-300 font-bold uppercase tracking-wider">{provider.categoria}</p>
              <p className="text-sm font-black">{provider.nombre}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-blue-300 font-bold">Por cobrar</p>
            <p className="text-xl font-black font-mono">${(provider.comision_por_cobrar ?? 0).toFixed(2)}</p>
          </div>
        </div>
      </header>

      {/* ─── ÁREA PRINCIPAL (PADDING INFERIOR DE SEGURIDAD GARANTIZADO PARA SCROLL) ─── */}
      <main className="flex-1 w-full pb-36" style={{ paddingBottom: 'calc(8.5rem + env(safe-area-inset-bottom, 24px))' }}>

        {/* ════ TAB: POS ════ */}
        {activeTab === 'pos' && (
          <div className="p-4 space-y-4">
            <FeatureGuard moduloId="tienda_online" flags={flags}>
              <div className="bg-gradient-to-r from-[#002855] to-[#073B73] rounded-2xl p-4 text-white shadow-sm flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-1.5 text-amber-400 font-extrabold text-xs uppercase tracking-wider">
                    <Store size={14} /> Tienda Online & Pedidos
                  </div>
                  <p className="text-white font-black text-sm mt-0.5">{productosActivos}/10 Productos en Catálogo</p>
                  <p className="text-blue-200 text-[10px] font-medium mt-0.5">
                    {pendingOrders > 0 ? `⚠️ Tienes ${pendingOrders} pedido(s) por procesar` : 'Gestiona tus productos y pedidos de compra'}
                  </p>
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                  <button onClick={() => setActiveTab('productos')} className="bg-amber-400 text-[#002855] font-black text-xs px-3 py-2 rounded-xl shadow hover:bg-amber-300 transition">
                    Catálogo
                  </button>
                  <button onClick={() => setActiveTab('pedidos')} className="bg-white/10 text-white font-black text-xs px-3 py-2 rounded-xl border border-white/20 hover:bg-white/20 transition relative">
                    Pedidos {pendingOrders > 0 && <span className="inline-block w-2 h-2 bg-red-400 rounded-full ml-1 animate-pulse" />}
                  </button>
                </div>
              </div>
            </FeatureGuard>
            {posSlot ? posSlot : (
              <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-sm text-center">
                <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto text-[#002855]">
                  <QrCode size={36} className="animate-pulse" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-800">Escanear QR de Trabajador</h3>
                  <p className="text-xs text-slate-500 font-semibold mt-1 leading-relaxed">
                    Escanea el código QR de identidad del trabajador para verificar su cupo disponible y procesar la venta en tienda.
                  </p>
                </div>
                <button
                  onClick={onOpenScanner}
                  className="w-full bg-[#002855] hover:bg-[#073B73] active:scale-[0.98] text-white text-sm font-black py-4 px-4 rounded-2xl shadow-lg transition flex items-center justify-center gap-2.5"
                >
                  <Camera size={20} className="text-amber-300 animate-bounce" />
                  Activar Cámara y Escanear QR
                </button>
              </div>
            )}
          </div>
        )}

        {/* ════ TAB: PEDIDOS ════ */}
        {activeTab === 'pedidos' && (
          <div className="p-4">
            <FeatureGuard moduloId="pedidos_checkout" flags={flags} showBlockScreen>
              <PedidosProviderPanel
                orders={orders}
                proveedorId={provider.id}
                onStatusChange={onOrderStatusChange}
                onNotification={onNotification}
              />
            </FeatureGuard>
          </div>
        )}

        {/* ════ TAB: VENTAS & REPORTES FINANCIEROS ════ */}
        {activeTab === 'ventas' && (
          <div className="p-4 space-y-4">
            {/* Subtabs Ventas vs Reportes */}
            <div className="flex bg-slate-200/60 p-1 rounded-2xl gap-1">
              <button
                onClick={() => setVentasSubTab('ventas')}
                className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 ${
                  ventasSubTab === 'ventas' ? 'bg-white text-[#002855] shadow-sm' : 'text-slate-600 hover:text-slate-800'
                }`}
              >
                <History size={14} /> Ventas Recientes ({providerTransactions.length})
              </button>
              <button
                onClick={() => setVentasSubTab('reporte')}
                className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 ${
                  ventasSubTab === 'reporte' ? 'bg-white text-[#002855] shadow-sm' : 'text-slate-600 hover:text-slate-800'
                }`}
              >
                <Percent size={14} /> Reporte Financiero
              </button>
            </div>

            {ventasSubTab === 'ventas' ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-slate-700 uppercase tracking-widest">Historial de Ventas Financiadas</h4>
                  <span className="text-[10px] text-slate-400 font-bold">Total: {providerTransactions.length}</span>
                </div>

                {providerTransactions.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-400 space-y-2">
                    <History size={36} className="mx-auto opacity-30" />
                    <p className="text-sm font-bold">No hay ventas registradas en tu comercio</p>
                  </div>
                ) : (() => {
                  const totalPages = Math.ceil(providerTransactions.length / SALES_PER_PAGE);
                  const paginated = providerTransactions.slice((salesPage - 1) * SALES_PER_PAGE, salesPage * SALES_PER_PAGE);
                  return (
                    <div className="space-y-3">
                      {paginated.map(t => {
                        const isLiquidado = t.estado_liquidacion_proveedor === 'liquidado';
                        return (
                          <div key={t.id} className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-sm">
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="text-sm font-black text-slate-800">{t.trabajadores_crc?.nombre || 'Trabajador'}</p>
                                <p className="text-[10px] text-slate-400 font-semibold">{new Date(t.fecha_transaccion).toLocaleDateString('es-VE', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
                              </div>
                              <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wide ${
                                isLiquidado ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-blue-50 text-blue-700 border border-blue-200'
                              }`}>
                                {isLiquidado ? '✅ Liquidado' : '⏳ Pendiente'}
                              </span>
                            </div>

                            <div className="grid grid-cols-3 gap-2 bg-slate-50 rounded-xl p-3 text-center border border-slate-100">
                              <div>
                                <p className="text-[9px] text-slate-400 font-bold uppercase">Monto Venta</p>
                                <p className="text-xs font-black font-mono text-[#002855]">${t.monto_usd.toFixed(2)}</p>
                              </div>
                              <div>
                                <p className="text-[9px] text-slate-400 font-bold uppercase">Pago Inicial</p>
                                <p className="text-xs font-black font-mono text-emerald-600">${t.monto_inicial_pagado_usd.toFixed(2)}</p>
                              </div>
                              <div>
                                <p className="text-[9px] text-slate-400 font-bold uppercase">Financiado</p>
                                <p className="text-xs font-black font-mono text-blue-600">${(t.monto_usd - t.monto_inicial_pagado_usd).toFixed(2)}</p>
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {/* Paginar */}
                      {totalPages > 1 && (
                        <div className="flex items-center justify-between pt-2">
                          <button onClick={() => setSalesPage(p => Math.max(1, p - 1))} disabled={salesPage === 1}
                            className="px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 transition">
                            ← Ant.
                          </button>
                          <span className="text-xs text-slate-500 font-bold">Página {salesPage} de {totalPages}</span>
                          <button onClick={() => setSalesPage(p => Math.min(totalPages, p + 1))} disabled={salesPage === totalPages}
                            className="px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 transition">
                            Sig. →
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div className="space-y-4">
                {/* Selector de Mes */}
                <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-slate-700">Conciliación de Comisiones</p>
                    <p className="text-[10px] text-slate-400 font-medium">Selecciona el periodo para ver métricas</p>
                  </div>
                  {reportMonths.length > 0 && (
                    <select
                      value={activeReportMonth}
                      onChange={e => setSelectedReportMonth(e.target.value)}
                      className="bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-bold text-[#002855] focus:outline-none focus:ring-2 focus:ring-[#002855]"
                    >
                      {reportMonths.map(m => {
                        const [y, monthNum] = m.split('-');
                        const date = new Date(parseInt(y), parseInt(monthNum) - 1, 1);
                        const label = date.toLocaleDateString('es-VE', { month: 'long', year: 'numeric' });
                        return <option key={m} value={m}>{label.charAt(0).toUpperCase() + label.slice(1)}</option>;
                      })}
                    </select>
                  )}
                </div>

                {reportMonths.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-400 space-y-2">
                    <Percent size={36} className="mx-auto opacity-30" />
                    <p className="text-sm font-bold">No hay transacciones registradas para reportes</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Tarjetas de Métricas de Ventas Totales del Mes */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Ventas Totales del Mes</span>
                        <h5 className="text-xl font-black text-slate-800 font-mono mt-1">${monthlyStats.bruto.toFixed(2)} USD</h5>
                        <p className="text-[10px] text-slate-500 font-bold font-mono mt-0.5">≈ Bs. {(monthlyStats.bruto * bcvRate).toFixed(2)}</p>
                      </div>
                      <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 shadow-sm">
                        <span className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider">Ventas Cobradas</span>
                        <h5 className="text-xl font-black text-emerald-800 font-mono mt-1">${monthlyStats.pagado.toFixed(2)} USD</h5>
                        <p className="text-[10px] text-emerald-600 font-bold font-mono mt-0.5">≈ Bs. {(monthlyStats.pagado * bcvRate).toFixed(2)}</p>
                      </div>
                      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 shadow-sm">
                        <span className="text-[10px] text-amber-700 font-bold uppercase tracking-wider">Comisión Colegio</span>
                        <h5 className="text-xl font-black text-amber-800 font-mono mt-1">${monthlyStats.comision.toFixed(2)} USD</h5>
                        <p className="text-[10px] text-amber-700 font-bold font-mono mt-0.5">≈ Bs. {(monthlyStats.comision * bcvRate).toFixed(2)}</p>
                      </div>
                    </div>

                    {/* Detalle de Compras del Periodo */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-sm">
                      <h5 className="text-xs font-black text-slate-700 uppercase tracking-wider">Detalles de Compra del Periodo</h5>
                      <div className="space-y-2">
                        {monthlyTransactions.map(t => {
                          const txInstallments = installments.filter(inst => inst.transaccion_id === t.id);
                          const isPaid = txInstallments.length > 0 && txInstallments.every(inst => inst.estatus === 'Cobrado' || inst.estatus === 'Pagado Directo');
                          return (
                            <div key={t.id} className="flex justify-between items-center p-3 bg-slate-50 border border-slate-100 rounded-xl text-xs">
                              <div>
                                <p className="font-bold text-slate-800">{t.trabajadores_crc?.nombre || 'Trabajador'}</p>
                                <p className="text-[10px] text-slate-400">{new Date(t.fecha_transaccion).toLocaleDateString('es-VE')}</p>
                              </div>
                              <div className="text-right">
                                <p className="font-mono font-black text-[#002855]">${t.monto_usd.toFixed(2)} USD</p>
                                <p className="text-[10px] text-amber-700 font-bold font-mono">Comisión: ${t.comision_monto_usd.toFixed(2)}</p>
                                <span className={`inline-block mt-0.5 px-2 py-0.5 rounded-full text-[8px] font-black uppercase ${
                                  isPaid ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                                }`}>
                                  {isPaid ? 'Cobrado' : 'Pendiente'}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ════ TAB: PRODUCTOS (VITRINA ONLINE) ════ */}
        {activeTab === 'productos' && (
          <div className="p-4 space-y-4">
            <FeatureGuard moduloId="tienda_online" flags={flags} showBlockScreen>
              <>
                {/* Encabezado con límite */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-black text-slate-800">Mi Vitrina Online</p>
                    <p className="text-[10px] text-slate-500 font-semibold">
                      {productosActivos}/10 productos activos
                    </p>
                  </div>
                  {productosActivos < 10 && (
                    <button onClick={() => setShowAddProduct(true)}
                      className="bg-[#002855] hover:bg-[#073B73] text-white text-xs font-black px-4 py-2 rounded-xl flex items-center gap-1.5 transition shadow">
                      + Añadir
                    </button>
                  )}
                </div>

                {/* Barra de capacidad */}
                <div className="bg-white rounded-xl border border-slate-200 p-3">
                  <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-1.5">
                    <span>Capacidad de Vitrina</span>
                    <span>{productosActivos}/10</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${productosActivos >= 10 ? 'bg-red-400' : productosActivos >= 7 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                      style={{ width: `${(productosActivos / 10) * 100}%` }} />
                  </div>
                </div>

                {/* Lista de productos */}
                <div className="space-y-3">
                  {provProductos.length === 0 ? (
                    <div className="py-10 text-center text-slate-400">
                      <Package2 size={36} className="mx-auto mb-3 opacity-30" />
                      <p className="text-sm font-semibold">Sin productos. ¡Añade el primero!</p>
                    </div>
                  ) : (
                    provProductos.map(prod => (
                      <div key={prod.id} className={`bg-white border rounded-2xl p-4 flex items-center gap-3 transition-opacity ${!prod.activo ? 'opacity-50' : ''}`}>
                        <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center overflow-hidden flex-shrink-0">
                          {prod.imagen_url
                            ? <img src={prod.imagen_url} alt={prod.nombre} className="w-full h-full object-cover" />
                            : <Package2 size={18} className="text-slate-300" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-black text-slate-800 truncate">{prod.nombre}</p>
                          <p className="text-xs font-mono font-bold text-[#002855]">${prod.precio.toFixed(2)}</p>
                          <div className="flex gap-2 mt-1">
                            <button onClick={() => onToggleProduct(prod.id, !prod.activo)}
                              className={`text-[9px] font-bold px-2 py-0.5 rounded-full border transition ${prod.activo ? 'bg-green-50 text-green-600 border-green-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                              {prod.activo ? '● Activo' : '○ Inactivo'}
                            </button>
                            <button onClick={() => onToggleStock(prod.id, !prod.stock_disponible)}
                              className={`text-[9px] font-bold px-2 py-0.5 rounded-full border transition ${prod.stock_disponible ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-orange-50 text-orange-600 border-orange-200'}`}>
                              {prod.stock_disponible ? 'En stock' : 'Sin stock'}
                            </button>
                          </div>
                        </div>
                        <button onClick={() => onDeleteProduct(prod.id)}
                          className="flex-shrink-0 w-8 h-8 bg-red-50 hover:bg-red-100 text-red-400 rounded-xl flex items-center justify-center transition">
                          <X size={14} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </>
            </FeatureGuard>
          </div>
        )}

        {/* ════ TAB: MI COMERCIO & PERFIL ════ */}
        {activeTab === 'perfil' && (
          <div className="p-4 space-y-4">
            {/* Tarjeta de Cuenta Enlace */}
            <div className="bg-gradient-to-br from-[#002855] to-[#073B73] rounded-2xl p-5 text-white shadow-md">
              <p className="text-[10px] text-blue-300 font-bold uppercase tracking-widest mb-1">Cuenta Enlace (CoDigo)</p>
              <p className="text-lg font-black font-mono">{provider.cuenta_enlace}</p>
              <p className="text-[10px] text-blue-300 mt-2">Comisión acordada: {(provider.comision_colegio * 100).toFixed(0)}%</p>
            </div>

            {/* Formulario de Información y Pago Móvil del Comercio */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-sm">
              <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <Building2 size={16} className="text-[#002855]" /> Información de Mi Comercio
              </h4>

              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Dirección del Comercio</label>
                <input
                  value={editDireccion}
                  onChange={e => setEditDireccion(e.target.value)}
                  placeholder="Ej: Carrera 9 esquina calle 15, Duaca"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-semibold focus:outline-none focus:border-[#002855]"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Teléfono de Contacto</label>
                <input
                  value={editTelefono}
                  onChange={e => setEditTelefono(e.target.value)}
                  placeholder="Ej: 0414-5000000"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-semibold focus:outline-none focus:border-[#002855]"
                />
              </div>

              <div className="pt-2 border-t border-slate-100">
                <p className="text-xs font-bold text-[#002855] uppercase tracking-wide mb-3">Datos para Pago Móvil de Comercio</p>
                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Banco Receptivo</label>
                    <input
                      value={editPmBanco}
                      onChange={e => setEditPmBanco(e.target.value)}
                      placeholder="Ej: Banesco, Provincial, Mercantil"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-semibold focus:outline-none focus:border-[#002855]"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Cédula / RIF Titular</label>
                    <input
                      value={editPmCedula}
                      onChange={e => setEditPmCedula(e.target.value)}
                      placeholder="Ej: J-12345678-0"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-semibold focus:outline-none focus:border-[#002855]"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Teléfono de Pago Móvil</label>
                    <input
                      value={editPmTelefono}
                      onChange={e => setEditPmTelefono(e.target.value)}
                      placeholder="Ej: 0412-0000000"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-semibold focus:outline-none focus:border-[#002855]"
                    />
                  </div>
                </div>
              </div>

              {onSaveProfile && (
                <button
                  onClick={handleSaveProfileSubmit}
                  disabled={isSavingProfile}
                  className="w-full bg-[#002855] hover:bg-[#073B73] disabled:opacity-50 text-white font-black py-3 rounded-xl text-xs transition flex items-center justify-center gap-2 shadow"
                >
                  {isSavingProfile ? <><RefreshCw size={14} className="animate-spin" /> Guardando...</> : <><Save size={14} /> Guardar Cambios de Mi Comercio</>}
                </button>
              )}
            </div>

            <button onClick={onLogout}
              className="w-full flex items-center justify-center gap-2 px-4 py-3.5 bg-white border border-red-200 rounded-2xl text-red-500 font-black text-xs hover:bg-red-50 transition shadow-sm">
              <LogOut size={16} /> Cerrar Sesión
            </button>
          </div>
        )}
      </main>

      {/* ─── BARRA DE NAVEGACIÓN INFERIOR FIJA (NATIVA CON SAFE-AREA-INSET-BOTTOM Y Z-INDEX SEGURO) ─── */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-4xl z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-2xl"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)' }}>
        <div className="flex">
          {([
            { id: 'pos', icon: <QrCode size={19} />, label: 'POS' },
            { id: 'pedidos', icon: <Package2 size={19} />, label: 'Pedidos', badge: pendingOrders },
            { id: 'ventas', icon: <History size={19} />, label: 'Ventas' },
            { id: 'productos', icon: <Store size={19} />, label: 'Mi Tienda' },
            { id: 'perfil', icon: <Building2 size={19} />, label: 'Comercio' },
          ] as Array<{ id: ProviderTab; icon: React.ReactNode; label: string; badge?: number }>).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex flex-col items-center justify-center py-2.5 gap-1 transition-colors relative ${
                activeTab === tab.id ? 'text-[#002855]' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              {tab.badge && tab.badge > 0 && (
                <span className="absolute top-1.5 right-2 bg-red-500 text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow">
                  {tab.badge}
                </span>
              )}
              {tab.icon}
              <span className="text-[9px] font-extrabold uppercase tracking-tight">{tab.label}</span>
              {activeTab === tab.id && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-7 h-0.5 bg-[#002855] rounded-full" />
              )}
            </button>
          ))}
        </div>
      </nav>

      {/* ─── BOTTOM SHEET: Añadir Producto ─── */}
      <BottomSheet open={showAddProduct} onClose={() => setShowAddProduct(false)} title="Añadir Producto a Vitrina">
        <div className="space-y-3">
          {productosActivos >= 10 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-600 text-xs font-bold">
              ⚠️ Límite de 10 productos alcanzado. Desactiva uno para añadir otro.
            </div>
          )}
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Nombre *</label>
            <input value={npNombre} onChange={e => setNpNombre(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold focus:outline-none focus:border-[#002855]"
              placeholder="Ej: Arroz Diana 1kg" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Descripción</label>
            <textarea value={npDesc} onChange={e => setNpDesc(e.target.value)} rows={2}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-semibold focus:outline-none focus:border-[#002855] resize-none"
              placeholder="Descripción breve del producto..." />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Precio (USD) *</label>
            <input type="number" value={npPrecio} onChange={e => setNpPrecio(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-mono font-bold focus:outline-none focus:border-[#002855]"
              placeholder="0.00" min="0" step="0.01" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Imagen (opcional)</label>
            <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 hover:border-blue-300 rounded-xl p-4 cursor-pointer transition">
              <Upload size={18} className="text-slate-300 mb-1" />
              <span className="text-xs text-slate-400 font-semibold">{npImagen ? npImagen.name : 'Subir imagen'}</span>
              <input type="file" accept="image/*" className="hidden" onChange={e => setNpImagen(e.target.files?.[0])} />
            </label>
          </div>
          <button onClick={handleAddProduct} disabled={isAddingProduct || !npNombre.trim() || !npPrecio || productosActivos >= 10}
            className="w-full bg-[#002855] hover:bg-[#073B73] disabled:opacity-40 text-white font-black py-3.5 rounded-xl text-sm flex items-center justify-center gap-2">
            {isAddingProduct ? <><RefreshCw size={14} className="animate-spin" />Guardando...</> : 'Publicar Producto'}
          </button>
        </div>
      </BottomSheet>
    </div>
  );
});
