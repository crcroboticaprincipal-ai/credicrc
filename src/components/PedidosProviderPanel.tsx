import { useState, memo, useCallback } from 'react';
import { Package2, QrCode, ChevronRight, RefreshCw, CheckCircle2, Truck, Store } from 'lucide-react';
import type { Order, OrderStatus } from '../types';
import { ORDER_STATUS_CONFIG } from '../types';
import { supabase } from '../supabaseClient';

const TRANSITION_LABELS: Record<string, string> = {
  accepted:   '✅ Aceptar Pedido',
  preparing:  '🔧 Iniciar Preparación',
  ready:      '📦 Listo para Retirar',
  in_transit: '🚚 Marcar En Camino',
  delivered:  '🎉 Marcar como Entregado',
  cancelled:  '❌ Cancelar Pedido',
};

// Transiciones permitidas por estado actual
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending:    ['accepted', 'cancelled'],
  accepted:   ['preparing', 'cancelled'],
  preparing:  ['ready', 'in_transit'],
  ready:      ['delivered'],
  in_transit: ['delivered'],
  delivered:  [],
  cancelled:  [],
};

interface PedidosProviderPanelProps {
  orders: Order[];
  proveedorId: string;
  onStatusChange: () => void;
  onNotification: (type: 'success' | 'error' | 'warning' | 'info', title: string, msg: string) => void;
}

export const PedidosProviderPanel = memo(function PedidosProviderPanel({
  orders,
  proveedorId,
  onStatusChange,
  onNotification,
}: PedidosProviderPanelProps) {
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [showQRScanner, setShowQRScanner] = useState<string | null>(null);
  const [qrInputToken, setQrInputToken] = useState('');
  const [isValidatingQR, setIsValidatingQR] = useState(false);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');

  const providerOrders = orders.filter(o => o.proveedor_id === proveedorId);
  const filteredOrders = statusFilter === 'all'
    ? providerOrders
    : providerOrders.filter(o => o.status === statusFilter);

  // Contadores por estado para badges
  const pendingCount = providerOrders.filter(o => o.status === 'pending').length;
  const activeCount  = providerOrders.filter(o => ['accepted','preparing','ready','in_transit'].includes(o.status)).length;

  const handleStatusChange = useCallback(async (orderId: string, newStatus: OrderStatus) => {
    setProcessingId(orderId);
    try {
      const { data, error } = await supabase.rpc('actualizar_estado_pedido', {
        p_order_id: orderId,
        p_nuevo_estado: newStatus,
        p_actor_tipo: 'proveedor',
        p_notas: null,
      });
      if (error) throw error;
      const res = data[0];
      if (!res.ok) throw new Error(res.mensaje);

      onNotification('success', 'Estado Actualizado', res.mensaje);
      onStatusChange();
    } catch (err: any) {
      onNotification('error', 'Error al actualizar', err.message);
    } finally {
      setProcessingId(null);
    }
  }, [onNotification, onStatusChange]);

  const handleValidateDeliveryQR = async (orderId: string) => {
    if (!qrInputToken.trim()) {
      onNotification('error', 'Token requerido', 'Ingresa el código QR de entrega del trabajador.');
      return;
    }
    setIsValidatingQR(true);
    try {
      const { data, error } = await supabase.rpc('validar_qr_entrega', {
        p_qr_token: qrInputToken.trim(),
        p_order_id: orderId,
      });
      if (error) throw error;
      const res = data[0];
      if (!res.ok) throw new Error(res.mensaje);

      onNotification('success', '¡Entrega Validada!', res.mensaje);
      setShowQRScanner(null);
      setQrInputToken('');
      onStatusChange();
    } catch (err: any) {
      onNotification('error', 'QR Inválido', err.message);
    } finally {
      setIsValidatingQR(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header con contadores */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Nuevos', value: pendingCount, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
          { label: 'En proceso', value: activeCount, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' },
          { label: 'Total hoy', value: providerOrders.length, color: 'text-slate-600', bg: 'bg-slate-50', border: 'border-slate-200' },
        ].map(stat => (
          <div key={stat.label} className={`${stat.bg} border ${stat.border} rounded-2xl p-3 text-center`}>
            <p className={`text-xl font-black ${stat.color}`}>{stat.value}</p>
            <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wide mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Filtro de estado */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {([
          { key: 'all', label: 'Todos' },
          { key: 'pending', label: '⏳ Nuevos' },
          { key: 'accepted', label: '✅ Aceptados' },
          { key: 'preparing', label: '🔧 Preparando' },
          { key: 'ready', label: '📦 Listos' },
          { key: 'in_transit', label: '🚚 En camino' },
          { key: 'delivered', label: '🎉 Entregados' },
        ] as const).map(f => (
          <button
            key={f.key}
            onClick={() => setStatusFilter(f.key as any)}
            className={`flex-shrink-0 text-[10px] font-bold px-3 py-1.5 rounded-full border transition-all ${
              statusFilter === f.key
                ? 'bg-[#002855] text-white border-[#002855]'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Lista de pedidos */}
      {filteredOrders.length === 0 ? (
        <div className="py-12 text-center text-slate-400">
          <Package2 size={36} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm font-semibold">Sin pedidos en este estado</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredOrders.map(order => {
            const cfg = ORDER_STATUS_CONFIG[order.status];
            const isExpanded = activeOrderId === order.id;
            const transitions = TRANSITIONS[order.status];

            return (
              <div key={order.id} className={`bg-white border rounded-2xl overflow-hidden transition-shadow ${isExpanded ? 'shadow-md border-[#002855]/20' : 'border-slate-200'}`}>

                {/* Cabecera del pedido */}
                <button
                  className="w-full p-4 flex items-center gap-3 text-left hover:bg-slate-50 transition-colors"
                  onClick={() => setActiveOrderId(isExpanded ? null : order.id)}
                >
                  <div className={`w-10 h-10 ${cfg.bg} ${cfg.border} border rounded-xl flex items-center justify-center text-lg flex-shrink-0`}>
                    {cfg.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-black text-slate-800 font-mono">{order.order_number}</p>
                      <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color} border ${cfg.border} uppercase tracking-wide`}>
                        {cfg.label}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 font-semibold truncate mt-0.5">
                      {order.trabajador?.nombre || 'Trabajador'} • ${order.monto_total_usd.toFixed(2)} USD
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {order.delivery_method === 'pickup' ? (
                        <span className="text-[9px] text-slate-400 flex items-center gap-1"><Store size={9}/>Retiro</span>
                      ) : (
                        <span className="text-[9px] text-slate-400 flex items-center gap-1"><Truck size={9}/>Delivery</span>
                      )}
                      <span className="text-[9px] text-slate-300">•</span>
                      <span className="text-[9px] text-slate-400">
                        {new Date(order.created_at).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                  <ChevronRight size={16} className={`text-slate-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                </button>

                {/* Detalle expandido */}
                {isExpanded && (
                  <div className="border-t border-slate-100 px-4 pb-4 space-y-3 animate-fade-in">
                    {/* Ítems del pedido */}
                    {order.order_items && order.order_items.length > 0 && (
                      <div className="bg-slate-50 rounded-xl p-3 space-y-2">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Productos solicitados</p>
                        {order.order_items.map(item => (
                          <div key={item.id} className="flex justify-between items-center text-xs text-slate-700">
                            <span className="font-semibold">{item.nombre_producto} ×{item.cantidad}</span>
                            <span className="font-mono font-bold">${item.subtotal_usd.toFixed(2)}</span>
                          </div>
                        ))}
                        <div className="border-t border-slate-200 pt-2 flex justify-between text-sm font-black">
                          <span>Total</span>
                          <span className="font-mono text-[#002855]">${order.monto_total_usd.toFixed(2)} USD</span>
                        </div>
                      </div>
                    )}

                    {/* Dirección de entrega */}
                    {order.delivery_method === 'delivery' && order.delivery_address && (
                      <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3">
                        <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest mb-1">Dirección de entrega</p>
                        <p className="text-xs text-slate-700 font-semibold">{order.delivery_address}</p>
                      </div>
                    )}

                    {order.notas_trabajador && (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                        <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest mb-1">Notas del trabajador</p>
                        <p className="text-xs text-slate-700">{order.notas_trabajador}</p>
                      </div>
                    )}

                    {/* Botones de acción */}
                    {transitions.length > 0 && (
                      <div className="space-y-2">
                        {transitions.map(nextStatus => (
                          <button
                            key={nextStatus}
                            onClick={() => handleStatusChange(order.id, nextStatus)}
                            disabled={processingId === order.id}
                            className={`w-full py-2.5 rounded-xl text-xs font-black transition flex items-center justify-center gap-2 ${
                              nextStatus === 'cancelled'
                                ? 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100'
                                : 'bg-[#002855] hover:bg-[#073B73] text-white shadow-sm'
                            } disabled:opacity-40`}
                          >
                            {processingId === order.id ? <RefreshCw size={12} className="animate-spin" /> : null}
                            {TRANSITION_LABELS[nextStatus]}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Validación QR para pickup */}
                    {order.delivery_method === 'pickup' && order.status === 'ready' && (
                      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 space-y-2">
                        <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest">
                          📱 Validar Entrega por QR
                        </p>
                        {showQRScanner === order.id ? (
                          <div className="space-y-2">
                            <input
                              type="text"
                              value={qrInputToken}
                              onChange={e => setQrInputToken(e.target.value)}
                              placeholder="Ingresa o escanea el token QR del trabajador"
                              className="w-full bg-white border border-emerald-300 rounded-lg p-2.5 text-xs font-mono focus:outline-none focus:border-emerald-500"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => { setShowQRScanner(null); setQrInputToken(''); }}
                                className="flex-1 py-2 text-xs font-bold text-slate-500 bg-white border border-slate-200 rounded-lg"
                              >Cancelar</button>
                              <button
                                onClick={() => handleValidateDeliveryQR(order.id)}
                                disabled={isValidatingQR}
                                className="flex-1 py-2 text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg flex items-center justify-center gap-1"
                              >
                                {isValidatingQR ? <RefreshCw size={10} className="animate-spin" /> : <CheckCircle2 size={10} />}
                                Validar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => setShowQRScanner(order.id)}
                            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-lg flex items-center justify-center gap-2"
                          >
                            <QrCode size={13} /> Escanear QR de Retiro
                          </button>
                        )}
                      </div>
                    )}

                    {order.status === 'delivered' && (
                      <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl p-3 text-xs text-green-700 font-bold">
                        <CheckCircle2 size={14} /> Pedido entregado y cerrado exitosamente
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});
