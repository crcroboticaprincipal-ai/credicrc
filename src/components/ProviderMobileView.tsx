import { useState, memo } from 'react';
import {
  Package2, QrCode, Store, User, LogOut, Upload, X, RefreshCw, Camera,
} from 'lucide-react';
import type { Order, ProductoProveedor, FeatureFlag } from '../types';
import { FeatureGuard } from './FeatureGuard';
import { PedidosProviderPanel } from './PedidosProviderPanel';

type ProviderTab = 'pos' | 'pedidos' | 'productos' | 'perfil';

// ─── Tipos mínimos ─────────────────────────────────────────────────────────────
interface ProviderMini {
  id: string; nombre: string; categoria: string; logo_url?: string | null;
  cuenta_enlace: string; comision_colegio: number; comision_por_cobrar?: number;
  direccion?: string | null; telefono?: string | null;
}

interface ProviderMobileViewProps {
  provider: ProviderMini;
  productos: ProductoProveedor[];
  orders: Order[];
  flags: FeatureFlag[];
  posSlot?: React.ReactNode;
  onOpenScanner?: () => void;
  onAddProduct: (data: { nombre: string; descripcion: string; precio: string; imagen?: File }) => Promise<void>;
  onToggleProduct: (id: string, activo: boolean) => Promise<void>;
  onToggleStock: (id: string, disponible: boolean) => Promise<void>;
  onDeleteProduct: (id: string) => Promise<void>;
  onOrderStatusChange: () => void;
  onNotification: (type: 'success' | 'error' | 'warning' | 'info', title: string, msg: string) => void;
  onLogout: () => void;
}

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
  flags,
  posSlot,
  onOpenScanner,
  onAddProduct,
  onToggleProduct,
  onToggleStock,
  onDeleteProduct,
  onOrderStatusChange,
  onNotification,
  onLogout,
}: ProviderMobileViewProps) {
  const [activeTab, setActiveTab] = useState<ProviderTab>('pos');
  const [showAddProduct, setShowAddProduct] = useState(false);

  // Nuevo producto form
  const [npNombre, setNpNombre] = useState('');
  const [npDesc, setNpDesc] = useState('');
  const [npPrecio, setNpPrecio] = useState('');
  const [npImagen, setNpImagen] = useState<File | undefined>();
  const [isAddingProduct, setIsAddingProduct] = useState(false);

  const provProductos = productos.filter(p => p.proveedor_id === provider.id);
  const productosActivos = provProductos.filter(p => p.activo).length;
  const pendingOrders = orders.filter(o => o.proveedor_id === provider.id && o.status === 'pending').length;

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

  return (
    <div className="flex flex-col bg-slate-50 min-h-screen w-full relative">

      {/* ─── HEADER FIJO ─── */}
      <header className="bg-gradient-to-r from-[#002855] to-[#073B73] text-white px-4 flex-shrink-0 sticky top-0 z-30 shadow-md"
        style={{ paddingTop: `calc(env(safe-area-inset-top, 0px) + 12px)`, paddingBottom: '12px' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center overflow-hidden">
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

      {/* ─── ÁREA PRINCIPAL (scroll nativo y fluido en toda la pantalla) ─── */}
      <main className="flex-1 w-full pb-36">

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

        {/* ════ TAB: PRODUCTOS (VITRINA) ════ */}
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
                      className="bg-[#002855] hover:bg-[#073B73] text-white text-xs font-black px-4 py-2 rounded-xl flex items-center gap-1.5 transition">
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

        {/* ════ TAB: PERFIL ════ */}
        {activeTab === 'perfil' && (
          <div className="p-4 space-y-4">
            <div className="bg-gradient-to-br from-[#002855] to-[#073B73] rounded-2xl p-5 text-white">
              <p className="text-[10px] text-blue-300 font-bold uppercase tracking-widest mb-1">Cuenta Enlace (CoDigo)</p>
              <p className="text-lg font-black font-mono">{provider.cuenta_enlace}</p>
              <p className="text-[10px] text-blue-300 mt-2">Comisión acordada: {(provider.comision_colegio * 100).toFixed(0)}%</p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden divide-y divide-slate-50">
              <div className="px-4 py-4">
                <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Dirección</p>
                <p className="text-sm font-semibold text-slate-800">{provider.direccion || '—'}</p>
              </div>
              <div className="px-4 py-4">
                <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Teléfono</p>
                <p className="text-sm font-semibold text-slate-800">{provider.telefono || '—'}</p>
              </div>
            </div>

            <button onClick={onLogout}
              className="w-full flex items-center gap-3 px-4 py-3.5 bg-white border border-red-100 rounded-2xl text-red-500 font-bold text-sm hover:bg-red-50 transition">
              <LogOut size={16} /> Cerrar Sesión
            </button>
          </div>
        )}
      </main>

      {/* ─── BOTTOM NAVIGATION BAR ─── */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 shadow-xl"
        style={{ paddingBottom: `calc(env(safe-area-inset-bottom, 0px) + 4px)` }}>
        <div className="flex">
          {([
            { id: 'pos', icon: <QrCode size={20} />, label: 'POS' },
            { id: 'pedidos', icon: <Package2 size={20} />, label: 'Pedidos', badge: pendingOrders },
            { id: 'productos', icon: <Store size={20} />, label: 'Mi Tienda' },
            { id: 'perfil', icon: <User size={20} />, label: 'Perfil' },
          ] as Array<{ id: ProviderTab; icon: React.ReactNode; label: string; badge?: number }>).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex flex-col items-center justify-center py-3 gap-1 transition-colors relative ${
                activeTab === tab.id ? 'text-[#002855]' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              {tab.badge && tab.badge > 0 && (
                <span className="absolute top-2 right-2 bg-red-500 text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center">
                  {tab.badge}
                </span>
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
