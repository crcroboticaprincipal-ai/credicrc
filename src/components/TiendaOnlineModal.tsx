import { useState, memo, useCallback } from 'react';
import { X, Package, Plus, Minus, Trash2, ShoppingCart, MapPin, Store, Truck, ChevronRight, AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react';
import type { ProductoProveedor, CarritoItem, DeliveryMethod } from '../types';
import { supabase } from '../supabaseClient';

interface TiendaOnlineModalProps {
  proveedorId: string;
  proveedorNombre: string;
  productos: ProductoProveedor[];
  limiteDisponible: number;
  trabajadorId: string;
  bcvRate: number;
  featureActivo: boolean;
  onClose: () => void;
  onPedidoCreado: (orderId: string, orderNumber: string) => void;
  onNotification: (type: 'success' | 'error' | 'warning' | 'info', title: string, msg: string) => void;
}

type Step = 'catalogo' | 'carrito' | 'checkout' | 'confirmado';

export const TiendaOnlineModal = memo(function TiendaOnlineModal({
  proveedorId,
  proveedorNombre,
  productos,
  limiteDisponible,
  trabajadorId,
  bcvRate,
  onClose,
  onPedidoCreado,
  onNotification,
}: TiendaOnlineModalProps) {
  const [step, setStep] = useState<Step>('catalogo');
  const [carrito, setCarrito] = useState<CarritoItem[]>([]);
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>('pickup');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [notas, setNotas] = useState('');
  const [isOrdering, setIsOrdering] = useState(false);
  const [orderResult, setOrderResult] = useState<{ orderNumber: string; qrToken: string | null } | null>(null);

  const totalCarrito = carrito.reduce((sum, item) => sum + item.producto.precio * item.cantidad, 0);
  const productosActivos = productos.filter(p => p.activo && p.stock_disponible);

  const addToCart = useCallback((producto: ProductoProveedor) => {
    setCarrito(prev => {
      const exists = prev.find(i => i.producto.id === producto.id);
      if (exists) {
        return prev.map(i => i.producto.id === producto.id ? { ...i, cantidad: i.cantidad + 1 } : i);
      }
      return [...prev, { producto, cantidad: 1 }];
    });
  }, []);

  const removeFromCart = useCallback((productoId: string) => {
    setCarrito(prev => prev.filter(i => i.producto.id !== productoId));
  }, []);

  const updateQty = useCallback((productoId: string, delta: number) => {
    setCarrito(prev =>
      prev.map(i => i.producto.id === productoId
        ? { ...i, cantidad: Math.max(1, i.cantidad + delta) }
        : i
      )
    );
  }, []);

  const handleConfirmOrder = async () => {
    if (carrito.length === 0) return;
    if (deliveryMethod === 'delivery' && !deliveryAddress.trim()) {
      onNotification('error', 'Dirección Requerida', 'Ingresa la dirección de entrega.');
      return;
    }
    if (totalCarrito > limiteDisponible) {
      onNotification('error', 'Cupo Insuficiente', `Tu cupo disponible es $${limiteDisponible.toFixed(2)} USD.`);
      return;
    }

    setIsOrdering(true);
    try {
      const productos_json = carrito.map(item => ({
        producto_id: item.producto.id,
        cantidad: item.cantidad,
      }));

      const { data, error } = await supabase.rpc('crear_pedido_online', {
        p_trabajador_id: trabajadorId,
        p_proveedor_id: proveedorId,
        p_productos: productos_json,
        p_delivery_method: deliveryMethod,
        p_delivery_address: deliveryMethod === 'delivery' ? deliveryAddress.trim() : null,
        p_notas: notas.trim() || null,
        p_tasa_bcv: bcvRate,
      });

      if (error) throw error;
      const res = data[0];
      if (!res.ok) throw new Error(res.mensaje);

      setOrderResult({ orderNumber: res.order_number, qrToken: res.qr_token });
      setStep('confirmado');
      onPedidoCreado(res.order_id, res.order_number);
      onNotification('success', '¡Pedido Creado!', `Tu pedido ${res.order_number} fue enviado al proveedor.`);

      // Disparar correo de notificación en tiempo real al proveedor
      supabase.functions.invoke('order-notification', {
        body: { order_id: res.order_id }
      }).catch(err => console.error('[Order Notification Invoke Error]:', err));
    } catch (err: any) {
      onNotification('error', 'Error al crear pedido', err.message);
    } finally {
      setIsOrdering(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 animate-fade-in">
      <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden">

        {/* Header */}
        <div className="bg-gradient-to-r from-[#002855] to-[#073B73] p-5 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-white/10 rounded-xl flex items-center justify-center">
              <ShoppingCart className="text-white h-5 w-5" />
            </div>
            <div>
              <h3 className="text-white font-black text-sm">{proveedorNombre}</h3>
              <p className="text-blue-200 text-[10px] font-semibold">
                {step === 'catalogo' ? `${productosActivos.length} productos · Cupo: $${limiteDisponible.toFixed(2)}` :
                 step === 'carrito' ? `${carrito.length} ítem(s) · $${totalCarrito.toFixed(2)} USD` :
                 step === 'checkout' ? 'Confirmar pedido' : '¡Pedido confirmado!'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white transition p-1">
            <X size={20} />
          </button>
        </div>

        {/* Steps indicator */}
        {step !== 'confirmado' && (
          <div className="flex bg-slate-50 border-b border-slate-100 px-4 py-2 gap-1 flex-shrink-0">
            {(['catalogo', 'carrito', 'checkout'] as Step[]).map(s => (
              <div key={s} className="flex items-center gap-1">
                <div className={`h-1.5 rounded-full transition-all ${s === step ? 'bg-[#002855] w-8' : 'bg-slate-200 w-4'}`} />
              </div>
            ))}
            <span className="ml-auto text-[10px] text-slate-400 font-bold">
              {step === 'catalogo' ? 'Seleccionar productos' : step === 'carrito' ? 'Revisar carrito' : 'Datos de entrega'}
            </span>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto modal-scroll">

          {/* ── CATÁLOGO ── */}
          {step === 'catalogo' && (
            <div className="p-4 space-y-3">
              {productosActivos.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <Package size={40} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm font-semibold">Sin productos disponibles</p>
                </div>
              ) : (
                productosActivos.map(producto => {
                  const inCart = carrito.find(i => i.producto.id === producto.id);
                  return (
                    <div key={producto.id}
                      className="flex items-center gap-3 p-3.5 bg-white border border-slate-200 rounded-2xl hover:border-blue-200 hover:shadow-sm transition-all"
                    >
                      <div className="w-14 h-14 bg-gradient-to-br from-slate-100 to-blue-50 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden">
                        {producto.imagen_url ? (
                          <img src={producto.imagen_url} alt={producto.nombre} className="w-full h-full object-cover" />
                        ) : (
                          <Package size={22} className="text-slate-300" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-black text-slate-800 truncate">{producto.nombre}</p>
                        {producto.descripcion && (
                          <p className="text-[10px] text-slate-500 font-medium truncate">{producto.descripcion}</p>
                        )}
                        <p className="text-sm font-black text-[#002855] mt-0.5 font-mono">
                          ${producto.precio.toFixed(2)} <span className="text-[10px] text-slate-400 font-normal">USD</span>
                        </p>
                      </div>
                      {inCart ? (
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button onClick={() => updateQty(producto.id, -1)}
                            className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition">
                            <Minus size={12} />
                          </button>
                          <span className="text-sm font-black w-5 text-center">{inCart.cantidad}</span>
                          <button onClick={() => updateQty(producto.id, 1)}
                            className="w-7 h-7 rounded-full bg-[#002855] hover:bg-[#073B73] text-white flex items-center justify-center transition">
                            <Plus size={12} />
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => addToCart(producto)}
                          className="flex-shrink-0 w-9 h-9 bg-[#002855] hover:bg-[#073B73] text-white rounded-xl flex items-center justify-center transition shadow-sm">
                          <Plus size={16} />
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* ── CARRITO ── */}
          {step === 'carrito' && (
            <div className="p-4 space-y-3">
              {carrito.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <ShoppingCart size={40} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm font-semibold">Carrito vacío</p>
                </div>
              ) : (
                <>
                  {carrito.map(item => (
                    <div key={item.producto.id}
                      className="flex items-center gap-3 p-3.5 bg-white border border-slate-200 rounded-2xl"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-800">{item.producto.nombre}</p>
                        <p className="text-xs text-slate-500 font-mono mt-0.5">
                          ${item.producto.precio.toFixed(2)} × {item.cantidad} = <strong>${(item.producto.precio * item.cantidad).toFixed(2)}</strong>
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button onClick={() => updateQty(item.producto.id, -1)}
                          className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center">
                          <Minus size={12} />
                        </button>
                        <span className="text-sm font-black w-5 text-center">{item.cantidad}</span>
                        <button onClick={() => updateQty(item.producto.id, 1)}
                          className="w-7 h-7 rounded-full bg-[#002855] text-white flex items-center justify-center">
                          <Plus size={12} />
                        </button>
                        <button onClick={() => removeFromCart(item.producto.id)}
                          className="w-7 h-7 rounded-full bg-red-50 hover:bg-red-100 text-red-500 flex items-center justify-center ml-1">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}

                  <div className="bg-gradient-to-br from-[#002855] to-[#073B73] rounded-2xl p-4 text-white mt-2">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-bold text-blue-200">Total del pedido</span>
                      <span className="text-xl font-black font-mono">${totalCarrito.toFixed(2)} USD</span>
                    </div>
                    <div className="flex justify-between items-center text-xs text-blue-300">
                      <span>≈ Bs. {(totalCarrito * bcvRate).toFixed(2)}</span>
                      <span>Cupo restante: ${(limiteDisponible - totalCarrito).toFixed(2)}</span>
                    </div>
                    {totalCarrito > limiteDisponible && (
                      <div className="mt-2 flex items-center gap-1.5 text-red-300 text-xs font-bold">
                        <AlertCircle size={12} /> Cupo insuficiente
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── CHECKOUT ── */}
          {step === 'checkout' && (
            <div className="p-4 space-y-4">
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Método de entrega</p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setDeliveryMethod('pickup')}
                    className={`p-4 rounded-2xl border-2 text-left transition-all ${deliveryMethod === 'pickup' ? 'border-[#002855] bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                  >
                    <Store size={20} className={`mb-2 ${deliveryMethod === 'pickup' ? 'text-[#002855]' : 'text-slate-400'}`} />
                    <p className={`text-sm font-black ${deliveryMethod === 'pickup' ? 'text-[#002855]' : 'text-slate-700'}`}>Retiro en Tienda</p>
                    <p className="text-[10px] text-slate-500 font-medium mt-0.5">Pick-up con QR</p>
                  </button>
                  <button
                    onClick={() => setDeliveryMethod('delivery')}
                    className={`p-4 rounded-2xl border-2 text-left transition-all ${deliveryMethod === 'delivery' ? 'border-[#002855] bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                  >
                    <Truck size={20} className={`mb-2 ${deliveryMethod === 'delivery' ? 'text-[#002855]' : 'text-slate-400'}`} />
                    <p className={`text-sm font-black ${deliveryMethod === 'delivery' ? 'text-[#002855]' : 'text-slate-700'}`}>Delivery</p>
                    <p className="text-[10px] text-slate-500 font-medium mt-0.5">A domicilio</p>
                  </button>
                </div>
              </div>

              {deliveryMethod === 'delivery' && (
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5">
                    <MapPin size={10} className="inline mr-1" />Dirección de entrega *
                  </label>
                  <input
                    type="text"
                    value={deliveryAddress}
                    onChange={e => setDeliveryAddress(e.target.value)}
                    placeholder="Ej: Av. Libertador, C.C. Centro, Apto 4-B"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-semibold focus:outline-none focus:border-[#002855] transition"
                    required
                  />
                </div>
              )}

              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5">Notas al proveedor (opcional)</label>
                <textarea
                  value={notas}
                  onChange={e => setNotas(e.target.value)}
                  rows={2}
                  placeholder="Indicaciones especiales para tu pedido..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-semibold focus:outline-none focus:border-[#002855] transition resize-none"
                />
              </div>

              {/* Resumen */}
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-2">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Resumen del pedido</p>
                {carrito.map(item => (
                  <div key={item.producto.id} className="flex justify-between text-xs text-slate-700">
                    <span className="font-semibold">{item.producto.nombre} ×{item.cantidad}</span>
                    <span className="font-mono font-bold">${(item.producto.precio * item.cantidad).toFixed(2)}</span>
                  </div>
                ))}
                <div className="border-t border-slate-200 pt-2 flex justify-between text-sm font-black text-slate-800">
                  <span>Total</span>
                  <span className="font-mono text-[#002855]">${totalCarrito.toFixed(2)} USD</span>
                </div>
              </div>
            </div>
          )}

          {/* ── CONFIRMADO ── */}
          {step === 'confirmado' && orderResult && (
            <div className="p-6 flex flex-col items-center text-center gap-4">
              <div className="w-20 h-20 bg-gradient-to-br from-emerald-400 to-green-500 rounded-3xl flex items-center justify-center shadow-lg animate-bounce">
                <CheckCircle2 className="text-white h-10 w-10" />
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-800">¡Pedido Enviado!</h3>
                <p className="text-slate-500 text-sm font-medium mt-1">El proveedor ha sido notificado</p>
              </div>
              <div className="w-full bg-gradient-to-br from-[#002855] to-[#073B73] rounded-2xl p-4 text-white text-left space-y-2">
                <div>
                  <p className="text-[10px] text-blue-300 font-bold uppercase">Número de Pedido</p>
                  <p className="text-xl font-black font-mono">{orderResult.orderNumber}</p>
                </div>
                {orderResult.qrToken && (
                  <div className="bg-white/10 rounded-xl p-3">
                    <p className="text-[10px] text-blue-200 font-bold mb-1">QR de Retiro (muéstralo en tienda)</p>
                    <p className="text-xs font-mono text-white/80 break-all">{orderResult.qrToken.substring(0, 24)}...</p>
                  </div>
                )}
                <div className="flex items-center gap-2 text-xs text-blue-200 font-medium">
                  <Store size={12} />
                  {deliveryMethod === 'pickup' ? 'Retiro en Tienda — presenta tu QR' : 'Delivery — espera en tu domicilio'}
                </div>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Puedes revisar el estado de tu pedido en la sección <strong>Movimientos</strong>
              </p>
            </div>
          )}
        </div>

        {/* Footer con botones de navegación */}
        {step !== 'confirmado' && (
          <div className="p-4 border-t border-slate-100 flex gap-3 flex-shrink-0 bg-white">
            {step !== 'catalogo' && (
              <button
                onClick={() => setStep(step === 'checkout' ? 'carrito' : 'catalogo')}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl text-sm transition"
              >
                ← Atrás
              </button>
            )}
            <button
              onClick={() => {
                if (step === 'catalogo') setStep('carrito');
                else if (step === 'carrito') setStep('checkout');
                else handleConfirmOrder();
              }}
              disabled={
                (step === 'catalogo' && carrito.length === 0) ||
                (step === 'carrito' && (carrito.length === 0 || totalCarrito > limiteDisponible)) ||
                isOrdering
              }
              className="flex-1 bg-[#002855] hover:bg-[#073B73] disabled:opacity-40 text-white font-black py-3 rounded-xl text-sm transition flex items-center justify-center gap-2 shadow-sm"
            >
              {isOrdering ? (
                <><RefreshCw size={14} className="animate-spin" /> Procesando...</>
              ) : step === 'catalogo' ? (
                <><ShoppingCart size={14} /> Ver Carrito ({carrito.length})</>
              ) : step === 'carrito' ? (
                <>Continuar <ChevronRight size={14} /></>
              ) : (
                <>Confirmar Pedido ✓</>
              )}
            </button>
          </div>
        )}

        {step === 'confirmado' && (
          <div className="p-4 border-t border-slate-100 flex-shrink-0">
            <button onClick={onClose} className="w-full bg-[#002855] text-white font-black py-3 rounded-xl text-sm">
              Entendido, cerrar
            </button>
          </div>
        )}
      </div>
    </div>
  );
});
