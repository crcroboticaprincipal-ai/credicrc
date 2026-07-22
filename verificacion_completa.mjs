// verificacion_completa.mjs
// Diagnóstico completo: funciones + Resend logs + usuarios pendientes

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ghjbudoeuxgpcghkhasa.supabase.co';
const SERVICE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdoamJ1ZG9ldXhncGNnaGtoYXNhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTYzMjYwNCwiZXhwIjoyMDk3MjA4NjA0fQ.JbcNE7aXKlFwPe3h7y7xzqAk_865TCukayBVmPqmM-o';
const ANON_KEY     = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdoamJ1ZG9ldXhncGNnaGtoYXNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MzI2MDQsImV4cCI6MjA5NzIwODYwNH0.BSmFFIYSlXX1tPHSXnweBjkFqauseVntZ5w99ibp4Cs';
const RESEND_KEY   = 'process.env.RESEND_KEY'; // se pasa como argumento

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function callFunction(name, body) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ANON_KEY}` },
    body: JSON.stringify(body)
  });
  return { status: res.status, data: await res.json() };
}

async function run() {
  const RESEND_API_KEY = process.argv[2] || '';

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   CrediCRC — VERIFICACIÓN COMPLETA DE CORREOS               ║');
  console.log(`║   ${new Date().toLocaleString('es-VE',{timeZone:'America/Caracas'})}                                   ║`);
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // ── PASO 1: Test en vivo de welcome-notification ─────────────────────────
  console.log('🧪 [1/4] Test en vivo: welcome-notification');
  const r1 = await callFunction('welcome-notification', {
    email: 'crcroboticarafael@gmail.com',
    nombre: 'Test Diagnóstico',
    rol: 'trabajador'
  });
  if (r1.data?.emailId) {
    console.log(`   ✅ FUNCIONA — emailId: ${r1.data.emailId}`);
  } else {
    console.log(`   ❌ FALLO — ${JSON.stringify(r1.data)}`);
  }

  // ── PASO 2: Test en vivo de approval-notification ─────────────────────────
  console.log('\n🧪 [2/4] Test en vivo: approval-notification');
  const r2 = await callFunction('approval-notification', {
    email: 'crcroboticarafael@gmail.com',
    nombre: 'Test Diagnóstico',
    rol: 'trabajador'
  });
  if (r2.data?.emailId) {
    console.log(`   ✅ FUNCIONA — emailId: ${r2.data.emailId}`);
  } else {
    console.log(`   ❌ FALLO — ${JSON.stringify(r2.data)}`);
  }

  // ── PASO 3: Usuarios pendientes de aprobación ─────────────────────────────
  console.log('\n📋 [3/4] Usuarios PENDIENTES de aprobación (aprobado = false):');
  const { data: pendientes, error: pErr } = await supabase
    .from('usuarios_credicrc')
    .select('id, email, nombre, rol, aprobado, created_at')
    .eq('aprobado', false)
    .order('created_at', { ascending: false });

  if (pErr) {
    console.log(`   ❌ Error consultando BD: ${pErr.message}`);
  } else if (!pendientes || pendientes.length === 0) {
    console.log('   ℹ️  No hay usuarios pendientes de aprobación actualmente.');
  } else {
    console.log(`   📌 ${pendientes.length} usuario(s) esperando aprobación:\n`);
    pendientes.forEach(u => {
      const fecha = new Date(u.created_at).toLocaleString('es-VE', { timeZone: 'America/Caracas' });
      console.log(`   • ${u.nombre}`);
      console.log(`     📧 ${u.email}`);
      console.log(`     🎭 Rol: ${u.rol}  |  Registrado: ${fecha}`);
      console.log('');
    });
  }

  // ── PASO 4: Consultar logs recientes de Resend (si tenemos la clave) ──────
  if (RESEND_API_KEY) {
    console.log('\n📊 [4/4] Últimos 10 correos en Resend:');
    try {
      const resendRes = await fetch('https://api.resend.com/emails?limit=10', {
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}` }
      });
      const resendData = await resendRes.json();
      if (resendData?.data) {
        resendData.data.forEach(e => {
          const estado = e.last_event || e.status || 'unknown';
          const icon = estado === 'delivered' ? '✅' : estado === 'bounced' ? '🔴' : estado === 'clicked' ? '🖱️' : '📤';
          console.log(`   ${icon} ${e.to?.[0]} — ${estado} — ${e.subject?.substring(0, 50)}`);
        });
      } else {
        console.log('   ⚠️  No se pudieron obtener los logs:', JSON.stringify(resendData).substring(0, 200));
      }
    } catch(e) {
      console.log(`   ❌ Error consultando Resend: ${e.message}`);
    }
  } else {
    console.log('\n💡 [4/4] Para ver logs de Resend pasa tu API key como argumento:');
    console.log('   node verificacion_completa.mjs re_xxxxxxxxx');
  }

  console.log('\n' + '═'.repeat(65));
  console.log('DIAGNÓSTICO COMPLETADO');
  console.log('═'.repeat(65));
}

run().catch(console.error);
