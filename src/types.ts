// ─── TIPOS COMPARTIDOS CREDICRC V2 ───────────────────────────────────────────
// Este archivo centraliza todas las interfaces nuevas para los módulos V2.
// Los tipos heredados permanecen en App.tsx para no romper el código existente.

export const CATEGORIAS_PROVEEDOR = [
  'Carnes',
  'Víveres',
  'Línea Doméstica',
  'Liquidez / Efectivo',
  'Farmacia & Salud',
  'Ferretería & Hogar',
  'Calzado & Vestido',
] as const;

export type CategoriaProveedor = typeof CATEGORIAS_PROVEEDOR[number];

export interface FeatureFlag {
  modulo_id: string;
  activo: boolean;
  descripcion: string;
  mensaje_bloqueo: string | null;
  updated_at: string;
}

export interface Transaction {
  id: string;
  trabajador_id: string;
  proveedor_id: string;
  monto_usd: number;
  tasa_bcv: number;
  monto_ves: number;
  monto_inicial_pagado_usd: number;
  dias_financiamiento: number;
  comision_monto_usd: number;
  token_aprobacion: string;
  estatus: 'Pendiente' | 'Aprobada' | 'Rechazada' | 'Completada';
  fecha_transaccion: string;
  estado_liquidacion_proveedor?: 'pendiente' | 'liquidado';
  estado_comision_colegio?: 'pendiente' | 'cobrado';
  trabajadores_crc?: { nombre: string; cedula?: string };
  proveedores_aliados?: { nombre: string; categoria?: string };
}

export interface Installment {
  id: string;
  transaccion_id: string;
  monto_usd: number;
  fecha_cobro: string;
  estatus: 'Pendiente' | 'Cobrado' | 'Vencido' | 'En Verificación' | 'Pagado Directo';
  fecha_pago_real: string | null;
  tasa_bcv_pago: number | null;
  monto_ves_pagado: number | null;
  created_at: string;
}

export interface ProductoProveedor {
  id: string;
  proveedor_id: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  stock_disponible: boolean;
  activo: boolean;
  imagen_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface CarritoItem {
  producto: ProductoProveedor;
  cantidad: number;
}

// ── Módulo Pedidos / Checkout ─────────────────────────────────────────────
export type OrderStatus =
  | 'pending'
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'in_transit'
  | 'delivered'
  | 'cancelled';

export type DeliveryMethod = 'pickup' | 'delivery';

export interface OrderItem {
  id: string;
  order_id: string;
  producto_id: string;
  nombre_producto: string;
  precio_usd: number;
  cantidad: number;
  subtotal_usd: number;
}

export interface Order {
  id: string;
  order_number: string;
  trabajador_id: string;
  proveedor_id: string;
  monto_total_usd: number;
  tasa_bcv: number;
  monto_total_ves: number;
  delivery_method: DeliveryMethod;
  delivery_address: string | null;
  status: OrderStatus;
  delivery_qr_token: string | null;
  delivery_qr_expires_at: string | null;
  notas_trabajador: string | null;
  notas_proveedor: string | null;
  created_at: string;
  updated_at: string;
  // relaciones
  order_items?: OrderItem[];
  trabajador?: { nombre: string; cedula: string };
  proveedor?: { nombre: string };
}

export interface OrderStatusHistory {
  id: string;
  order_id: string;
  status_from: string | null;
  status_to: string;
  actor_tipo: string;
  notas: string | null;
  created_at: string;
}

// Labels y colores para estados de pedido
export const ORDER_STATUS_CONFIG: Record<OrderStatus, {
  label: string; color: string; bg: string; border: string; icon: string;
}> = {
  pending:     { label: 'Pendiente',          color: 'text-amber-700',  bg: 'bg-amber-50',   border: 'border-amber-200',  icon: '⏳' },
  accepted:    { label: 'Aceptado',           color: 'text-blue-700',   bg: 'bg-blue-50',    border: 'border-blue-200',   icon: '✅' },
  preparing:   { label: 'En Preparación',     color: 'text-purple-700', bg: 'bg-purple-50',  border: 'border-purple-200', icon: '🔧' },
  ready:       { label: 'Listo para Retirar', color: 'text-emerald-700',bg: 'bg-emerald-50', border: 'border-emerald-200',icon: '📦' },
  in_transit:  { label: 'En Camino',          color: 'text-indigo-700', bg: 'bg-indigo-50',  border: 'border-indigo-200', icon: '🚚' },
  delivered:   { label: 'Entregado',          color: 'text-green-700',  bg: 'bg-green-50',   border: 'border-green-200',  icon: '🎉' },
  cancelled:   { label: 'Cancelado',          color: 'text-red-700',    bg: 'bg-red-50',     border: 'border-red-200',    icon: '❌' },
};

// Transiciones de estado permitidas por el proveedor
export const PROVIDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending:    ['accepted', 'cancelled'],
  accepted:   ['preparing', 'cancelled'],
  preparing:  ['ready', 'in_transit'],
  ready:      ['delivered'],
  in_transit: ['delivered'],
  delivered:  [],
  cancelled:  [],
};

// ── Módulo Línea Doméstica ────────────────────────────────────────────────
export interface LineaDomesticaSolicitud {
  id: string;
  trabajador_id: string;
  proveedor_id: string;
  descripcion_articulo: string;
  monto_total_usd: number;
  num_cuotas: number;
  valor_cuota_usd: number;
  tasa_bcv_registro: number;
  estatus: 'Pendiente' | 'Aprobado' | 'Rechazado' | 'En Pago' | 'Completado';
  notas: string | null;
  created_at: string;
  cuotas?: LineaDomesticaCuota[];
}

export interface LineaDomesticaCuota {
  id: string;
  solicitud_id: string;
  numero_cuota: number;
  monto_usd: number;
  fecha_cobro: string;
  estatus: 'Pendiente' | 'Cobrado' | 'Vencido' | 'Pagado Directo';
  fecha_pago_real: string | null;
}

// ── Módulo Avance de Efectivo ─────────────────────────────────────────────
export interface AvanceEfectivoSolicitud {
  id: string;
  trabajador_id: string;
  proveedor_liquidez_id: string;
  monto_capital_usd: number;
  num_cuotas: number;
  tipo_interes: 'porcentaje' | 'monto_fijo';
  valor_interes: number;
  monto_interes_total_usd: number;
  monto_total_usd: number;
  valor_cuota_usd: number;
  tasa_bcv_registro: number;
  estatus: 'Pendiente' | 'Aprobado' | 'Rechazado' | 'En Pago' | 'Completado';
  created_at: string;
  cuotas?: AvanceEfectivoCuota[];
}

export interface AvanceEfectivoCuota {
  id: string;
  solicitud_id: string;
  numero_cuota: number;
  monto_usd: number;
  capital_usd: number;
  interes_usd: number;
  fecha_cobro: string;
  estatus: 'Pendiente' | 'Cobrado' | 'Vencido' | 'Pagado Directo';
}

// ── Utilidades de cálculo de intereses ───────────────────────────────────
export function calcularAvanceEfectivo(
  capital: number,
  numCuotas: number,
  tipoInteres: 'porcentaje' | 'monto_fijo',
  valorInteres: number
): { interesTotal: number; montoTotal: number; valorCuota: number; cuotas: { capital: number; interes: number; total: number }[] } {
  let interesTotal: number;

  if (tipoInteres === 'porcentaje') {
    interesTotal = Math.round(capital * (valorInteres / 100) * 100) / 100;
  } else {
    interesTotal = Math.round(valorInteres * numCuotas * 100) / 100;
  }

  const montoTotal = Math.round((capital + interesTotal) * 100) / 100;
  const valorCuota = Math.round((montoTotal / numCuotas) * 100) / 100;
  const capitalCuota = Math.round((capital / numCuotas) * 100) / 100;
  const interesCuota = Math.round((valorCuota - capitalCuota) * 100) / 100;

  const cuotas = Array.from({ length: numCuotas }, () => ({
    capital: capitalCuota,
    interes: interesCuota,
    total: valorCuota,
  }));

  return { interesTotal, montoTotal, valorCuota, cuotas };
}
