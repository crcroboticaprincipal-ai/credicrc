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

// ── Módulo Avance de Efectivo y Consola de Proveedor de Liquidez ──────────
export interface ConfiguracionLiquidez {
  proveedor_id: string;
  recepcion_activa: boolean;
  modalidad_recargo: 'porcentaje' | 'monto_fijo';
  tasa_1_cuota: number;
  cargo_minimo_1_cuota_usd: number;
  tasa_2_cuotas: number;
  tasa_3_cuotas: number;
  monto_minimo_usd: number;
  monto_maximo_usd: number;
  updated_at?: string;
}

export const DEFAULT_CONFIGURACION_LIQUIDEZ: Omit<ConfiguracionLiquidez, 'proveedor_id'> = {
  recepcion_activa: true,
  modalidad_recargo: 'porcentaje',
  tasa_1_cuota: 10.00,
  cargo_minimo_1_cuota_usd: 1.50,
  tasa_2_cuotas: 16.00,
  tasa_3_cuotas: 24.00,
  monto_minimo_usd: 10.00,
  monto_maximo_usd: 40.00,
};

export function isLiquidityProvider(provider?: {
  tipo_proveedor?: string | null;
  categoria?: string | null;
  nombre?: string | null;
} | null): boolean {
  if (!provider) return false;
  return (
    provider.tipo_proveedor === 'liquidez' ||
    provider.categoria === 'Liquidez / Efectivo' ||
    provider.categoria === 'Proveedor de Liquidez'
  );
}

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
  estatus: 'Pendiente' | 'Aprobado' | 'Desembolsado' | 'Rechazado' | 'En Pago' | 'Completado';
  banco_trabajador?: string | null;
  telefono_pago_movil?: string | null;
  cedula_pago_movil?: string | null;
  referencia_desembolso?: string | null;
  fecha_desembolso?: string | null;
  motivo_rechazo?: string | null;
  notas?: string | null;
  created_at: string;
  updated_at?: string;
  cuotas?: AvanceEfectivoCuota[];
  trabajadores_crc?: {
    id: string;
    nombre: string;
    cedula: string;
    cargo?: string;
    limite_total?: number;
    limite_disponible?: number;
  };
  proveedores_aliados?: {
    id: string;
    nombre: string;
    categoria?: string;
  };
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
  fecha_pago_real?: string | null;
  tasa_bcv_pago?: number | null;
  monto_ves_pagado?: number | null;
  created_at?: string;
  avance_efectivo_solicitudes?: AvanceEfectivoSolicitud;
}

// Helper para extraer metadatos bancarios/referencia tanto de columnas nativas como de JSON en notas
export function parseSolicitudMetadata(sol: AvanceEfectivoSolicitud): {
  banco: string;
  telefono: string;
  cedula: string;
  referencia: string;
  fechaDesembolso: string | null;
  motivoRechazo: string | null;
  notaLibre: string;
} {
  let parsed: any = {};
  if (sol.notas && sol.notas.trim().startsWith('{')) {
    try {
      parsed = JSON.parse(sol.notas);
    } catch {
      parsed = {};
    }
  }
  return {
    banco: sol.banco_trabajador || parsed.banco_trabajador || '',
    telefono: sol.telefono_pago_movil || parsed.telefono_pago_movil || '',
    cedula: sol.cedula_pago_movil || parsed.cedula_pago_movil || sol.trabajadores_crc?.cedula || '',
    referencia: sol.referencia_desembolso || parsed.referencia_desembolso || '',
    fechaDesembolso: sol.fecha_desembolso || parsed.fecha_desembolso || null,
    motivoRechazo: sol.motivo_rechazo || parsed.motivo_rechazo || null,
    notaLibre: parsed.nota_libre ?? (sol.notas && !sol.notas.trim().startsWith('{') ? sol.notas : ''),
  };
}

// ── Utilidades de cálculo de intereses (con soporte de piso mínimo y cuadre al centavo) ──
export function calcularAvancePorPlazo(
  capital: number,
  numCuotas: 1 | 2 | 3,
  config?: Partial<ConfiguracionLiquidez>
): {
  modalidad: 'porcentaje' | 'monto_fijo';
  tasaAplicada: number;
  pisoAplicado: boolean;
  interesTotal: number;
  montoTotal: number;
  valorCuota: number;
  cuotas: { numero: number; capital: number; interes: number; total: number }[];
} {
  const cfg = { ...DEFAULT_CONFIGURACION_LIQUIDEZ, ...config };
  const modalidad = cfg.modalidad_recargo;
  const tasaAplicada =
    numCuotas === 1 ? cfg.tasa_1_cuota :
    numCuotas === 2 ? cfg.tasa_2_cuotas :
    cfg.tasa_3_cuotas;

  const capRedondeado = Math.round(capital * 100) / 100;
  let interesTotal = 0;
  let pisoAplicado = false;

  if (modalidad === 'porcentaje') {
    const interesBruto = Math.round(capRedondeado * (tasaAplicada / 100) * 100) / 100;
    if (numCuotas === 1 && interesBruto < cfg.cargo_minimo_1_cuota_usd) {
      interesTotal = Math.round(cfg.cargo_minimo_1_cuota_usd * 100) / 100;
      pisoAplicado = true;
    } else {
      interesTotal = interesBruto;
    }
  } else {
    // Modalidad Monto Fijo ($) definido directamente para el plazo seleccionado
    interesTotal = Math.round(tasaAplicada * 100) / 100;
  }

  const montoTotal = Math.round((capRedondeado + interesTotal) * 100) / 100;
  const valorCuota = Math.round((montoTotal / numCuotas) * 100) / 100;

  // Desglose por cuota asegurando que SUM(capital) === capRedondeado exacto al centavo
  const capBase = Math.round((capRedondeado / numCuotas) * 100) / 100;
  const intBase = Math.round((interesTotal / numCuotas) * 100) / 100;
  let capAcum = 0;
  let intAcum = 0;

  const cuotas: { numero: number; capital: number; interes: number; total: number }[] = [];
  for (let i = 1; i <= numCuotas; i++) {
    let cCap: number;
    let cInt: number;
    if (i < numCuotas) {
      cCap = capBase;
      cInt = intBase;
      capAcum = Math.round((capAcum + cCap) * 100) / 100;
      intAcum = Math.round((intAcum + cInt) * 100) / 100;
    } else {
      cCap = Math.round((capRedondeado - capAcum) * 100) / 100;
      cInt = Math.round((interesTotal - intAcum) * 100) / 100;
    }
    cuotas.push({
      numero: i,
      capital: cCap,
      interes: cInt,
      total: Math.round((cCap + cInt) * 100) / 100,
    });
  }

  return {
    modalidad,
    tasaAplicada,
    pisoAplicado,
    interesTotal,
    montoTotal,
    valorCuota,
    cuotas,
  };
}

export function calcularAvanceEfectivo(
  capital: number,
  numCuotas: number,
  tipoInteres: 'porcentaje' | 'monto_fijo',
  valorInteres: number,
  cargoMinimo1CuotaUsd = 1.50
): { interesTotal: number; montoTotal: number; valorCuota: number; cuotas: { capital: number; interes: number; total: number }[] } {
  const n = (numCuotas === 1 || numCuotas === 2 || numCuotas === 3 ? numCuotas : 1) as 1 | 2 | 3;
  const res = calcularAvancePorPlazo(capital, n, {
    modalidad_recargo: tipoInteres,
    tasa_1_cuota: valorInteres,
    tasa_2_cuotas: valorInteres,
    tasa_3_cuotas: valorInteres,
    cargo_minimo_1_cuota_usd: cargoMinimo1CuotaUsd,
  });
  return {
    interesTotal: res.interesTotal,
    montoTotal: res.montoTotal,
    valorCuota: res.valorCuota,
    cuotas: res.cuotas.map(c => ({ capital: c.capital, interes: c.interes, total: c.total })),
  };
}

// ─── INTERRUPTOR MAESTRO: MODO CORTE DE NÓMINA ('operaciones_compras_activas') ─
export const MODO_CORTE_MODULO_ID = 'operaciones_compras_activas';
export const MODO_CORTE_DESC = 'Control global de compras y cobros (Pausa por Corte de Nómina)';
export const MODO_CORTE_DEFAULT_MSG =
  'Estamos realizando el corte y conciliación de nómina. Las compras y cobros estarán disponibles nuevamente en breve (aprox. 1 a 2 horas).';

export function getOperacionesComprasStatus(flags: FeatureFlag[]): {
  operacionesActivas: boolean;
  enCorteNomina: boolean;
  mensajeBloqueo: string;
} {
  const directFlag = flags.find(f => f.modulo_id === MODO_CORTE_MODULO_ID);
  if (directFlag) {
    return {
      operacionesActivas: directFlag.activo !== false,
      enCorteNomina: directFlag.activo === false,
      mensajeBloqueo: (directFlag.mensaje_bloqueo && directFlag.mensaje_bloqueo.trim()) || MODO_CORTE_DEFAULT_MSG,
    };
  }
  // Fallback si la fila aún no fue insertada por SQL y se respaldó en promo_sin_inicial.mensaje_bloqueo
  const promoFlag = flags.find(f => f.modulo_id === 'promo_sin_inicial');
  if (promoFlag?.mensaje_bloqueo && promoFlag.mensaje_bloqueo.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(promoFlag.mensaje_bloqueo);
      if (typeof parsed.operaciones_compras_activas === 'boolean') {
        return {
          operacionesActivas: parsed.operaciones_compras_activas,
          enCorteNomina: !parsed.operaciones_compras_activas,
          mensajeBloqueo: (parsed.mensaje_bloqueo && String(parsed.mensaje_bloqueo).trim()) || MODO_CORTE_DEFAULT_MSG,
        };
      }
    } catch {
      // ignore
    }
  }
  return {
    operacionesActivas: true,
    enCorteNomina: false,
    mensajeBloqueo: MODO_CORTE_DEFAULT_MSG,
  };
}

