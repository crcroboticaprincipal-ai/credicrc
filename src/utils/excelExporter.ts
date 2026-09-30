import ExcelJS from 'exceljs';
import type { Transaction, Installment } from '../types';

export interface ProviderData {
  id: string;
  nombre: string;
  categoria: string;
  cuenta_enlace: string;
  comision_colegio: number | string;
  rif?: string;
  pago_movil?: string;
}

export interface WorkerData {
  id: string;
  nombre: string;
  cedula: string;
  cargo: string;
  salario_base: number;
}

export interface LiquidationData {
  id: string;
  proveedor_id: string;
  tipo: 'liquidacion_ventas' | 'cobro_comision';
  monto_liquidado: number;
  monto_comision_corte: number;
  referencia_pago: string;
  fecha_corte: string;
  notas?: string;
}

// ─── COMPONENTES DE ESTILO EXCELJS ──────────────────────────────────────────
const COLOR_HEADER_BG = 'FF002855'; // Navy Ejecutivo
const COLOR_HEADER_TEXT = 'FFFFFFFF'; // Blanco
const COLOR_SUBHEADER_BG = 'FF1E3A8A'; // Navy Claro
const COLOR_KPI_BG = 'FFF1F5F9'; // Slate 100
const COLOR_BORDER = 'FFE2E8F0'; // Slate 200

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: COLOR_BORDER } },
  bottom: { style: 'thin', color: { argb: COLOR_BORDER } },
  left: { style: 'thin', color: { argb: COLOR_BORDER } },
  right: { style: 'thin', color: { argb: COLOR_BORDER } },
};

const doubleBottomBorder: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FF000000' } },
  bottom: { style: 'double', color: { argb: 'FF000000' } },
  left: { style: 'thin', color: { argb: COLOR_BORDER } },
  right: { style: 'thin', color: { argb: COLOR_BORDER } },
};

/**
 * Genera y descarga el reporte corporativo completo en Excel por Proveedor
 */
export async function exportSupplierReportExcel(
  provider: ProviderData,
  providerTransactions: Transaction[],
  providerLiquidations: LiquidationData[],
  bcvRate: number
) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CrediCRC Sistema de Créditos';
  workbook.created = new Date();

  const comisionPct = parseFloat(provider.comision_colegio as string || '0.03');
  const comisionRate = comisionPct > 1 ? comisionPct / 100 : comisionPct;

  // Totales
  const approvedTx = providerTransactions.filter(
    t => t.estatus === 'Aprobada' || t.estatus === 'Completada'
  );

  const totalBrutoUSD = approvedTx.reduce((s, t) => s + t.monto_usd, 0);
  const totalInicialUSD = approvedTx.reduce((s, t) => s + (t.monto_inicial_pagado_usd || 0), 0);
  const totalFinanciadoUSD = totalBrutoUSD - totalInicialUSD;
  const totalComisionUSD = approvedTx.reduce((s, t) => s + (t.comision_monto_usd || (t.monto_usd * comisionRate)), 0);
  const totalNetoUSD = totalBrutoUSD - totalComisionUSD;

  const totalBrutoVES = approvedTx.reduce((s, t) => s + (t.monto_ves || t.monto_usd * (t.tasa_bcv || bcvRate)), 0);
  const totalInicialVES = approvedTx.reduce((s, t) => s + ((t.monto_inicial_pagado_usd || 0) * (t.tasa_bcv || bcvRate)), 0);
  const totalFinanciadoVES = totalBrutoVES - totalInicialVES;
  const totalComisionVES = approvedTx.reduce((s, t) => s + ((t.comision_monto_usd || (t.monto_usd * comisionRate)) * (t.tasa_bcv || bcvRate)), 0);
  const totalNetoVES = totalBrutoVES - totalComisionVES;

  const liquidacionesVentas = providerLiquidations.filter(l => l.tipo === 'liquidacion_ventas');
  const cobrosComision = providerLiquidations.filter(l => l.tipo === 'cobro_comision');

  const totalLiquidadoUSD = liquidacionesVentas.reduce((s, l) => s + l.monto_liquidado, 0);
  const totalComisionesCobradasUSD = cobrosComision.reduce((s, l) => s + l.monto_comision_corte, 0);

  const saldoPendienteUSD = totalBrutoUSD - totalLiquidadoUSD;

  // ═══════════════════════════════════════════════════════════════════════════
  // PESTAÑA 1: RESUMEN EJECUTIVO
  // ═══════════════════════════════════════════════════════════════════════════
  const wsResumen = workbook.addWorksheet('Resumen Ejecutivo');
  wsResumen.views = [{ showGridLines: true }];

  // Banner Superior
  wsResumen.mergeCells('A1:G2');
  const titleCell = wsResumen.getCell('A1');
  titleCell.value = `REPORTE FINANCIERO DE VENTAS - ${provider.nombre.toUpperCase()}`;
  titleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: COLOR_HEADER_TEXT } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_HEADER_BG } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };

  // Fila de Info
  wsResumen.getCell('A3').value = 'Fecha de Emisión:';
  wsResumen.getCell('A3').font = { bold: true, size: 9 };
  wsResumen.getCell('B3').value = new Date().toLocaleString('es-VE');
  wsResumen.getCell('B3').font = { size: 9 };

  wsResumen.getCell('D3').value = 'Tasa BCV del Día:';
  wsResumen.getCell('D3').font = { bold: true, size: 9 };
  wsResumen.getCell('E3').value = bcvRate;
  wsResumen.getCell('E3').numFmt = 'Bs. #,##0.00';
  wsResumen.getCell('E3').font = { size: 9, bold: true };

  wsResumen.getCell('A4').value = 'Categoría Comercio:';
  wsResumen.getCell('A4').font = { bold: true, size: 9 };
  wsResumen.getCell('B4').value = provider.categoria || 'Aliado Comercial';
  wsResumen.getCell('B4').font = { size: 9 };

  wsResumen.getCell('D4').value = 'Comisión Pactada:';
  wsResumen.getCell('D4').font = { bold: true, size: 9 };
  wsResumen.getCell('E4').value = comisionRate;
  wsResumen.getCell('E4').numFmt = '0.0%';
  wsResumen.getCell('E4').font = { size: 9, bold: true };

  // Tabla KPI Summary
  wsResumen.mergeCells('A6:G6');
  const kpiHeader = wsResumen.getCell('A6');
  kpiHeader.value = 'BALANZA Y CONCILIACIÓN CON EL PROVEEDOR';
  kpiHeader.font = { name: 'Arial', size: 10, bold: true, color: { argb: COLOR_HEADER_TEXT } };
  kpiHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_SUBHEADER_BG } };
  kpiHeader.alignment = { vertical: 'middle', horizontal: 'left' };

  const summaryHeaders = ['Indicador Financiero', 'Monto USD ($)', 'Monto VES (Bs.)', 'Observación / Detalle'];
  wsResumen.getRow(7).values = [summaryHeaders[0], summaryHeaders[1], summaryHeaders[2], summaryHeaders[3]];
  wsResumen.getRow(7).font = { bold: true, size: 9, color: { argb: COLOR_HEADER_TEXT } };
  wsResumen.getRow(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };

  const summaryData = [
    ['Ventas Totales Brutas', totalBrutoUSD, totalBrutoVES, `${approvedTx.length} transacciones aprobadas`],
    ['(-) Iniciales Pagadas Directo', totalInicialUSD, totalInicialVES, 'Entregado por trabajadores en el comercio'],
    ['(=) Financiamiento Otorgado', totalFinanciadoUSD, totalFinanciadoVES, 'Monto asumido por CrediCRC'],
    ['(-) Comisión Colegio (3%)', totalComisionUSD, totalComisionVES, 'Descuento por servicios de plataforma'],
    ['(=) Neto a Pagar Proveedor', totalNetoUSD, totalNetoVES, 'Monto neto resultante post-comisión'],
    ['(-) Liquidaciones Pagadas', totalLiquidadoUSD, totalLiquidadoUSD * bcvRate, `${liquidacionesVentas.length} transferencias bancarias realizadas`],
    ['(-) Comisiones Cobradas al Proveedor', totalComisionesCobradasUSD, totalComisionesCobradasUSD * bcvRate, `${cobrosComision.length} cobros de comisión registrados`],
    ['(=) Saldo Pendiente por Liquidar', saldoPendienteUSD, saldoPendienteUSD * bcvRate, saldoPendienteUSD === 0 ? 'Al día sin deudas' : 'Pendiente por transferir al comercio'],
  ];

  summaryData.forEach((row, idx) => {
    const rowNum = 8 + idx;
    const r = wsResumen.getRow(rowNum);
    r.values = [row[0], row[1], row[2], row[3]];
    r.font = { size: 9, bold: idx === 4 || idx === 7 };
    r.getCell(1).border = thinBorder;
    r.getCell(2).border = thinBorder;
    r.getCell(2).numFmt = '$#,##0.00';
    r.getCell(3).border = thinBorder;
    r.getCell(3).numFmt = 'Bs. #,##0.00';
    r.getCell(4).border = thinBorder;

    if (idx === 4 || idx === 7) {
      r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_KPI_BG } };
    }
  });

  // Ajustar anchos
  wsResumen.getColumn(1).width = 32;
  wsResumen.getColumn(2).width = 18;
  wsResumen.getColumn(3).width = 22;
  wsResumen.getColumn(4).width = 40;

  // ═══════════════════════════════════════════════════════════════════════════
  // PESTAÑA 2: VENTAS DETALLADAS (VENTA POR VENTA)
  // ═══════════════════════════════════════════════════════════════════════════
  const wsVentas = workbook.addWorksheet('Ventas Detalladas');
  wsVentas.views = [{ showGridLines: true }];

  // Banner
  wsVentas.mergeCells('A1:L1');
  const vBanner = wsVentas.getCell('A1');
  vBanner.value = `DESGLOSE VENTA POR VENTA - ${provider.nombre.toUpperCase()}`;
  vBanner.font = { name: 'Arial', size: 12, bold: true, color: { argb: COLOR_HEADER_TEXT } };
  vBanner.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_HEADER_BG } };
  vBanner.alignment = { vertical: 'middle', horizontal: 'center' };

  // Headers de la tabla
  const vHeaders = [
    '#',
    'Fecha / Hora',
    'Trabajador / Cliente',
    'Cédula',
    'Monto Total ($)',
    'Inicial Pagada ($)',
    'Financiado ($)',
    'Tasa BCV',
    'Monto Total (Bs.)',
    'Comisión ($)',
    'Neto Proveedor ($)',
    'Estado Liquidación',
  ];

  const headerRow = wsVentas.getRow(3);
  headerRow.values = vHeaders;
  headerRow.font = { name: 'Arial', size: 9, bold: true, color: { argb: COLOR_HEADER_TEXT } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_HEADER_BG } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

  // Filas de Datos
  approvedTx.forEach((tx, idx) => {
    const rowNum = 4 + idx;
    const r = wsVentas.getRow(rowNum);
    const dateFormatted = new Date(tx.fecha_transaccion).toLocaleString('es-VE', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    const trabajadorNombre = tx.trabajadores_crc?.nombre || 'Cliente Contado';
    const trabajadorCedula = tx.trabajadores_crc?.cedula || '—';
    const inicialUSD = tx.monto_inicial_pagado_usd || 0;
    const financiadoUSD = tx.monto_usd - inicialUSD;
    const tasa = tx.tasa_bcv || bcvRate;
    const totalVES = tx.monto_ves || (tx.monto_usd * tasa);
    const comisionUSD = tx.comision_monto_usd || (tx.monto_usd * comisionRate);
    const netoUSD = tx.monto_usd - comisionUSD;
    const estadoLiq = tx.estado_liquidacion_proveedor === 'liquidado' ? 'Liquidado' : 'Pendiente';

    r.values = [
      idx + 1,
      dateFormatted,
      trabajadorNombre,
      trabajadorCedula,
      tx.monto_usd,
      inicialUSD,
      financiadoUSD,
      tasa,
      totalVES,
      comisionUSD,
      netoUSD,
      estadoLiq,
    ];

    r.font = { size: 9 };
    r.alignment = { vertical: 'middle' };

    // Alineaciones y Formatos
    r.getCell(1).alignment = { horizontal: 'center' };
    r.getCell(2).alignment = { horizontal: 'center' };
    r.getCell(4).alignment = { horizontal: 'center' };

    r.getCell(5).numFmt = '$#,##0.00';
    r.getCell(6).numFmt = '$#,##0.00';
    r.getCell(7).numFmt = '$#,##0.00';
    r.getCell(8).numFmt = 'Bs. #,##0.00';
    r.getCell(9).numFmt = 'Bs. #,##0.00';
    r.getCell(10).numFmt = '$#,##0.00';
    r.getCell(11).numFmt = '$#,##0.00';
    r.getCell(12).alignment = { horizontal: 'center' };

    // Bordes
    for (let c = 1; c <= 12; c++) {
      r.getCell(c).border = thinBorder;
    }
  });

  // Fila de Totales con Fórmulas
  const totalRowNum = 4 + approvedTx.length;
  const totRow = wsVentas.getRow(totalRowNum);
  const lastRow = totalRowNum - 1;

  totRow.values = [
    'TOTALES',
    '',
    '',
    '',
    { formula: `SUM(E4:E${lastRow})` },
    { formula: `SUM(F4:F${lastRow})` },
    { formula: `SUM(G4:G${lastRow})` },
    '',
    { formula: `SUM(I4:I${lastRow})` },
    { formula: `SUM(J4:J${lastRow})` },
    { formula: `SUM(K4:K${lastRow})` },
    '',
  ];

  totRow.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF000000' } };
  totRow.getCell(1).alignment = { horizontal: 'center' };
  totRow.getCell(5).numFmt = '$#,##0.00';
  totRow.getCell(6).numFmt = '$#,##0.00';
  totRow.getCell(7).numFmt = '$#,##0.00';
  totRow.getCell(9).numFmt = 'Bs. #,##0.00';
  totRow.getCell(10).numFmt = '$#,##0.00';
  totRow.getCell(11).numFmt = '$#,##0.00';

  for (let c = 1; c <= 12; c++) {
    totRow.getCell(c).border = doubleBottomBorder;
  }

  // Anchos
  const colWidthsVentas = [5, 18, 28, 14, 15, 15, 15, 14, 18, 14, 16, 16];
  colWidthsVentas.forEach((w, i) => {
    wsVentas.getColumn(i + 1).width = w;
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PESTAÑA 3: HISTORIAL DE CORTES Y LIQUIDACIONES
  // ═══════════════════════════════════════════════════════════════════════════
  const wsCortes = workbook.addWorksheet('Historial de Cortes');
  wsCortes.views = [{ showGridLines: true }];

  wsCortes.mergeCells('A1:G1');
  const cBanner = wsCortes.getCell('A1');
  cBanner.value = `HISTORIAL DE LIQUIDACIONES Y CORTES DE PAGO - ${provider.nombre.toUpperCase()}`;
  cBanner.font = { name: 'Arial', size: 12, bold: true, color: { argb: COLOR_HEADER_TEXT } };
  cBanner.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_HEADER_BG } };
  cBanner.alignment = { vertical: 'middle', horizontal: 'center' };

  const cHeaders = ['#', 'Fecha Corte', 'Tipo Operación', 'Referencia Bancaria', 'Monto Liquidado ($)', 'Comisión Corte ($)', 'Notas / Detalle'];
  const cHeaderRow = wsCortes.getRow(3);
  cHeaderRow.values = cHeaders;
  cHeaderRow.font = { name: 'Arial', size: 9, bold: true, color: { argb: COLOR_HEADER_TEXT } };
  cHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_HEADER_BG } };

  providerLiquidations.forEach((liq, idx) => {
    const rowNum = 4 + idx;
    const r = wsCortes.getRow(rowNum);
    const dateFormatted = new Date(liq.fecha_corte).toLocaleString('es-VE', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    });

    const tipoText = liq.tipo === 'liquidacion_ventas' ? 'Liquidación de Ventas' : 'Cobro de Comisión';

    r.values = [
      idx + 1,
      dateFormatted,
      tipoText,
      liq.referencia_pago || '—',
      liq.monto_liquidado || 0,
      liq.monto_comision_corte || 0,
      liq.notas || 'Corte procesado por Tesorería',
    ];

    r.font = { size: 9 };
    r.getCell(1).alignment = { horizontal: 'center' };
    r.getCell(2).alignment = { horizontal: 'center' };
    r.getCell(3).alignment = { horizontal: 'left' };
    r.getCell(4).alignment = { horizontal: 'center' };
    r.getCell(5).numFmt = '$#,##0.00';
    r.getCell(6).numFmt = '$#,##0.00';

    for (let c = 1; c <= 7; c++) {
      r.getCell(c).border = thinBorder;
    }
  });

  const cTotalRowNum = 4 + providerLiquidations.length;
  const cTotRow = wsCortes.getRow(cTotalRowNum);
  const cLastRow = cTotalRowNum - 1;

  cTotRow.values = [
    'TOTALES',
    '',
    '',
    '',
    { formula: `SUM(E4:E${cLastRow})` },
    { formula: `SUM(F4:F${cLastRow})` },
    '',
  ];

  cTotRow.font = { name: 'Arial', size: 9, bold: true };
  cTotRow.getCell(5).numFmt = '$#,##0.00';
  cTotRow.getCell(6).numFmt = '$#,##0.00';

  for (let c = 1; c <= 7; c++) {
    cTotRow.getCell(c).border = doubleBottomBorder;
  }

  const colWidthsCortes = [5, 16, 25, 22, 22, 22, 35];
  colWidthsCortes.forEach((w, i) => {
    wsCortes.getColumn(i + 1).width = w;
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DESCARGA EN EL NAVEGADOR
  // ═══════════════════════════════════════════════════════════════════════════
  const buffer = await workbook.xlsx.writeBuffer();
  const safeName = provider.nombre.replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `Reporte_Ventas_${safeName}.xlsx`;

  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Genera y descarga el reporte corporativo completo de NÓMINA en Excel
 * Reflejando desgloses de compras, iniciales pagadas y cuotas mensuales.
 */
export async function exportPayrollReportExcel(
  monthFilter: string,
  installments: Installment[],
  transactions: Transaction[],
  workers: WorkerData[],
  bcvRate: number
) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CrediCRC Sistema de Créditos';
  workbook.created = new Date();

  // Filtrar cuotas del mes
  const targets = installments.filter(
    i => (i.fecha_cobro || '').slice(0, 7) === monthFilter
  );

  // Formatear Mes
  const [yr, mo] = monthFilter.split('-');
  const mDate = new Date(parseInt(yr), parseInt(mo) - 1, 1);
  const monthLabel = mDate.toLocaleString('es-VE', { month: 'long', year: 'numeric' });
  const formattedMonthTitle = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);

  // Map de transacciones para acceder a iniciales
  const txMap: Record<string, Transaction> = {};
  transactions.forEach(t => {
    txMap[t.id] = t;
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PESTAÑA 1: RESUMEN DE NÓMINA POR EMPLEADO
  // ═══════════════════════════════════════════════════════════════════════════
  const wsResumen = workbook.addWorksheet('Resumen por Empleado');
  wsResumen.views = [{ showGridLines: true }];

  // Banner
  wsResumen.mergeCells('A1:J2');
  const titleCell = wsResumen.getCell('A1');
  titleCell.value = `REPORTE DE DESCUENTOS DE NÓMINA - CREDICRC (${formattedMonthTitle.toUpperCase()})`;
  titleCell.font = { name: 'Arial', size: 13, bold: true, color: { argb: COLOR_HEADER_TEXT } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_HEADER_BG } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };

  wsResumen.getCell('A3').value = 'Fecha de Emisión:';
  wsResumen.getCell('A3').font = { bold: true, size: 9 };
  wsResumen.getCell('B3').value = new Date().toLocaleString('es-VE');
  wsResumen.getCell('B3').font = { size: 9 };

  wsResumen.getCell('D3').value = 'Tasa BCV Aplicada:';
  wsResumen.getCell('D3').font = { bold: true, size: 9 };
  wsResumen.getCell('E3').value = bcvRate;
  wsResumen.getCell('E3').numFmt = 'Bs. #,##0.00';
  wsResumen.getCell('E3').font = { size: 9, bold: true };

  // Agrupar por trabajador
  const workerSummaryMap: Record<string, {
    nombre: string;
    cedula: string;
    cargo: string;
    salario_base: number;
    totalComprasUSD: number;
    totalInicialUSD: number;
    totalFinanciadoUSD: number;
    cuotaMesUSD: number;
    cuotaMesVES: number;
    cuotasCount: number;
  }> = {};

  targets.forEach(inst => {
    const tx = inst.transaccion_id ? txMap[inst.transaccion_id] : (inst as any).transacciones_credicrc;
    const w = (tx as any)?.trabajadores_crc || (inst as any).trabajadores_crc || workers.find(work => work.id === (inst as any).trabajador_id);
    const wId = w?.id || (inst as any).trabajador_id || 'general';

    if (!workerSummaryMap[wId]) {
      workerSummaryMap[wId] = {
        nombre: w?.nombre || 'Trabajador',
        cedula: w?.cedula || '—',
        cargo: w?.cargo || 'Personal',
        salario_base: w?.salario_base || 0,
        totalComprasUSD: 0,
        totalInicialUSD: 0,
        totalFinanciadoUSD: 0,
        cuotaMesUSD: 0,
        cuotaMesVES: 0,
        cuotasCount: 0,
      };
    }

    const item = workerSummaryMap[wId];
    const inicialTx = tx?.monto_inicial_pagado_usd || 0;
    const totalTxUSD = tx?.monto_usd || inst.monto_usd;

    item.totalComprasUSD += totalTxUSD;
    item.totalInicialUSD += inicialTx;
    item.totalFinanciadoUSD += (totalTxUSD - inicialTx);
    item.cuotaMesUSD += inst.monto_usd;

    const rate = inst.tasa_bcv_pago || bcvRate;
    item.cuotaMesVES += inst.monto_ves_pagado || Math.round(inst.monto_usd * rate * 100) / 100;
    item.cuotasCount += 1;
  });

  const workerSummaryList = Object.values(workerSummaryMap);

  const headersResumen = [
    '#',
    'Cédula',
    'Nombre del Empleado',
    'Cargo / Dpto.',
    'Salario Base ($)',
    'Nº Cuotas',
    'Iniciales Pagadas ($)',
    'Cuota Mes ($)',
    'Tasa BCV',
    'Descuento Nómina (Bs.)',
  ];

  const rHeader = wsResumen.getRow(5);
  rHeader.values = headersResumen;
  rHeader.font = { name: 'Arial', size: 9, bold: true, color: { argb: COLOR_HEADER_TEXT } };
  rHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_HEADER_BG } };
  rHeader.alignment = { vertical: 'middle', horizontal: 'center' };

  workerSummaryList.forEach((w, idx) => {
    const rowNum = 6 + idx;
    const r = wsResumen.getRow(rowNum);

    r.values = [
      idx + 1,
      w.cedula,
      w.nombre,
      w.cargo,
      w.salario_base,
      w.cuotasCount,
      w.totalInicialUSD,
      w.cuotaMesUSD,
      bcvRate,
      w.cuotaMesVES,
    ];

    r.font = { size: 9 };
    r.getCell(1).alignment = { horizontal: 'center' };
    r.getCell(2).alignment = { horizontal: 'center' };
    r.getCell(4).alignment = { horizontal: 'left' };
    r.getCell(5).numFmt = '$#,##0.00';
    r.getCell(6).alignment = { horizontal: 'center' };
    r.getCell(7).numFmt = '$#,##0.00';
    r.getCell(8).numFmt = '$#,##0.00';
    r.getCell(9).numFmt = 'Bs. #,##0.00';
    r.getCell(10).numFmt = 'Bs. #,##0.00';

    for (let c = 1; c <= 10; c++) {
      r.getCell(c).border = thinBorder;
    }
  });

  // Fila Totales
  const totRowNum = 6 + workerSummaryList.length;
  const totRow = wsResumen.getRow(totRowNum);
  const lastRow = totRowNum - 1;

  totRow.values = [
    'TOTALES',
    '',
    '',
    '',
    { formula: `SUM(E6:E${lastRow})` },
    { formula: `SUM(F6:F${lastRow})` },
    { formula: `SUM(G6:G${lastRow})` },
    { formula: `SUM(H6:H${lastRow})` },
    '',
    { formula: `SUM(J6:J${lastRow})` },
  ];

  totRow.font = { name: 'Arial', size: 9, bold: true };
  totRow.getCell(5).numFmt = '$#,##0.00';
  totRow.getCell(7).numFmt = '$#,##0.00';
  totRow.getCell(8).numFmt = '$#,##0.00';
  totRow.getCell(10).numFmt = 'Bs. #,##0.00';

  for (let c = 1; c <= 10; c++) {
    totRow.getCell(c).border = doubleBottomBorder;
  }

  const widthsResumen = [5, 14, 28, 22, 16, 12, 18, 16, 14, 22];
  widthsResumen.forEach((w, i) => {
    wsResumen.getColumn(i + 1).width = w;
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PESTAÑA 2: DETALLE VENTA POR VENTA Y CUOTAS (INCLUYE INICIALES)
  // ═══════════════════════════════════════════════════════════════════════════
  const wsDetalle = workbook.addWorksheet('Detalle de Cuotas');
  wsDetalle.views = [{ showGridLines: true }];

  wsDetalle.mergeCells('A1:N1');
  const dBanner = wsDetalle.getCell('A1');
  dBanner.value = `DESGLOSE DETALLADO DE CUOTAS Y COMPRAS CON INICIALES - ${formattedMonthTitle.toUpperCase()}`;
  dBanner.font = { name: 'Arial', size: 12, bold: true, color: { argb: COLOR_HEADER_TEXT } };
  dBanner.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_HEADER_BG } };
  dBanner.alignment = { vertical: 'middle', horizontal: 'center' };

  const dHeaders = [
    '#',
    'Fecha Cobro',
    'Cédula',
    'Trabajador / Empleado',
    'Comercio / Proveedor',
    'Monto Total Compra ($)',
    'Inicial Pagada ($)',
    'Inicial Pagada (Bs.)',
    'Saldo Financiado ($)',
    'Cuota Mes ($)',
    'Tasa BCV',
    'Descuento Nómina (Bs.)',
    'Estatus Cuota',
  ];

  const dHeaderRow = wsDetalle.getRow(3);
  dHeaderRow.values = dHeaders;
  dHeaderRow.font = { name: 'Arial', size: 9, bold: true, color: { argb: COLOR_HEADER_TEXT } };
  dHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_HEADER_BG } };
  dHeaderRow.alignment = { vertical: 'middle', horizontal: 'center' };

  targets.forEach((inst, idx) => {
    const rowNum = 4 + idx;
    const r = wsDetalle.getRow(rowNum);

    const tx = inst.transaccion_id ? txMap[inst.transaccion_id] : (inst as any).transacciones_credicrc;
    const w = (tx as any)?.trabajadores_crc || (inst as any).trabajadores_crc || workers.find(work => work.id === (inst as any).trabajador_id);
    const p = (tx as any)?.proveedores_aliados || (inst as any).proveedores_aliados;

    const inicialUSD = tx?.monto_inicial_pagado_usd || 0;
    const totalCompraUSD = tx?.monto_usd || inst.monto_usd;
    const tasa = inst.tasa_bcv_pago || tx?.tasa_bcv || bcvRate;
    const inicialVES = Math.round(inicialUSD * tasa * 100) / 100;
    const saldoFinanciadoUSD = totalCompraUSD - inicialUSD;
    const cuotaVES = inst.monto_ves_pagado || Math.round(inst.monto_usd * tasa * 100) / 100;

    r.values = [
      idx + 1,
      inst.fecha_cobro,
      w?.cedula || '—',
      w?.nombre || 'Trabajador',
      p?.nombre || 'Comercio Registrado',
      totalCompraUSD,
      inicialUSD,
      inicialVES,
      saldoFinanciadoUSD,
      inst.monto_usd,
      tasa,
      cuotaVES,
      inst.estatus,
    ];

    r.font = { size: 9 };
    r.getCell(1).alignment = { horizontal: 'center' };
    r.getCell(2).alignment = { horizontal: 'center' };
    r.getCell(3).alignment = { horizontal: 'center' };

    r.getCell(6).numFmt = '$#,##0.00';
    r.getCell(7).numFmt = '$#,##0.00';
    r.getCell(8).numFmt = 'Bs. #,##0.00';
    r.getCell(9).numFmt = '$#,##0.00';
    r.getCell(10).numFmt = '$#,##0.00';
    r.getCell(11).numFmt = 'Bs. #,##0.00';
    r.getCell(12).numFmt = 'Bs. #,##0.00';
    r.getCell(13).alignment = { horizontal: 'center' };

    for (let c = 1; c <= 13; c++) {
      r.getCell(c).border = thinBorder;
    }
  });

  const dTotalRowNum = 4 + targets.length;
  const dTotRow = wsDetalle.getRow(dTotalRowNum);
  const dLastRow = dTotalRowNum - 1;

  dTotRow.values = [
    'TOTALES',
    '',
    '',
    '',
    '',
    { formula: `SUM(F4:F${dLastRow})` },
    { formula: `SUM(G4:G${dLastRow})` },
    { formula: `SUM(H4:H${dLastRow})` },
    { formula: `SUM(I4:I${dLastRow})` },
    { formula: `SUM(J4:J${dLastRow})` },
    '',
    { formula: `SUM(L4:L${dLastRow})` },
    '',
  ];

  dTotRow.font = { name: 'Arial', size: 9, bold: true };
  dTotRow.getCell(6).numFmt = '$#,##0.00';
  dTotRow.getCell(7).numFmt = '$#,##0.00';
  dTotRow.getCell(8).numFmt = 'Bs. #,##0.00';
  dTotRow.getCell(9).numFmt = '$#,##0.00';
  dTotRow.getCell(10).numFmt = '$#,##0.00';
  dTotRow.getCell(12).numFmt = 'Bs. #,##0.00';

  for (let c = 1; c <= 13; c++) {
    dTotRow.getCell(c).border = doubleBottomBorder;
  }

  const dWidths = [5, 14, 14, 28, 24, 18, 16, 18, 18, 16, 14, 22, 16];
  dWidths.forEach((w, i) => {
    wsDetalle.getColumn(i + 1).width = w;
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DESCARGA EN EL NAVEGADOR
  // ═══════════════════════════════════════════════════════════════════════════
  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `Nomina_CrediCRC_${monthFilter}.xlsx`;

  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
