// test_email_functions.js
// Verifica todas las Edge Functions de correo de CrediCRC
// Ejecutar: node test_email_functions.js

const SUPABASE_URL = 'https://ghjbudoeuxgpcghkhasa.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdoamJ1ZG9ldXhncGNnaGtoYXNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MzI2MDQsImV4cCI6MjA5NzIwODYwNH0.BSmFFIYSlXX1tPHSXnweBjkFqauseVntZ5w99ibp4Cs';

async function testFunction(name, body) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🔍 Probando: ${name}`);
  console.log(`📤 Body enviado: ${JSON.stringify(body, null, 2)}`);
  
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ANON_KEY}`
      },
      body: JSON.stringify(body)
    });
    
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    
    console.log(`📊 Status HTTP: ${res.status} ${res.statusText}`);
    console.log(`📨 Respuesta: ${JSON.stringify(data, null, 2)}`);
    
    if (res.status === 200 && data?.success) {
      console.log(`✅ ÉXITO: ${name} funcionando correctamente`);
    } else if (res.status === 404) {
      console.log(`❌ ERROR CRÍTICO: Función "${name}" NO EXISTE o no está desplegada`);
    } else if (res.status === 500) {
      console.log(`⚠️  ERROR SERVIDOR: ${name} - ${data?.error || 'Error interno'}`);
    } else {
      console.log(`⚠️  ADVERTENCIA: ${name} respondió con status ${res.status}`);
    }
    
    return { name, status: res.status, data, ok: res.status === 200 };
  } catch (err) {
    console.log(`💥 ERROR DE CONEXIÓN: ${err.message}`);
    return { name, status: 0, error: err.message, ok: false };
  }
}

async function runTests() {
  console.log('🚀 CrediCRC — Verificación del Sistema de Correos Automáticos');
  console.log(`📅 Fecha/Hora: ${new Date().toLocaleString('es-VE', { timeZone: 'America/Caracas' })}`);
  console.log(`🌐 Proyecto Supabase: ghjbudoeuxgpcghkhasa`);
  
  const results = [];
  
  // 1. Correo de Bienvenida (al registrarse)
  results.push(await testFunction('welcome-notification', {
    email: 'verificacion.credicrc@test.com',
    nombre: 'Usuario de Prueba',
    rol: 'trabajador'
  }));

  // 2. Correo de Aprobación (cuando admin aprueba un usuario)
  results.push(await testFunction('approval-notification', {
    email: 'verificacion.credicrc@test.com',
    nombre: 'Usuario de Prueba',
    rol: 'trabajador'
  }));

  // 3. Correo de Transacción (cuando proveedor procesa compra)
  results.push(await testFunction('transaction-notification', {
    transaccion_id: '00000000-0000-0000-0000-000000000000'
  }));

  // 4. Correo de Pago Confirmado (cuando admin confirma pago)
  results.push(await testFunction('payment-notification', {
    trabajador_id: '00000000-0000-0000-0000-000000000000',
    monto_usd: 10.00
  }));

  // 5. Reset de Contraseña
  results.push(await testFunction('handle-password-reset', {
    action: 'request',
    email: 'verificacion.credicrc@test.com'
  }));

  // Resumen final
  console.log(`\n${'='.repeat(60)}`);
  console.log('📋 RESUMEN DE VERIFICACIÓN:');
  console.log('='.repeat(60));
  
  const working = results.filter(r => r.status === 200 || (r.status !== 404 && r.status !== 0));
  const missing = results.filter(r => r.status === 404);
  const failed = results.filter(r => r.status === 0);
  
  results.forEach(r => {
    const icon = r.status === 200 ? '✅' : r.status === 404 ? '❌' : r.status === 0 ? '💥' : '⚠️';
    console.log(`${icon} ${r.name}: HTTP ${r.status} — ${r.data?.success ? 'OK' : r.data?.error || r.error || 'Ver detalle arriba'}`);
  });
  
  console.log(`\n📊 Funciones activas: ${working.length}/${results.length}`);
  if (missing.length > 0) {
    console.log(`❌ Funciones faltantes: ${missing.map(r => r.name).join(', ')}`);
  }
  if (failed.length > 0) {
    console.log(`💥 Errores de conexión: ${failed.map(r => r.name).join(', ')}`);
  }
}

runTests().catch(console.error);
