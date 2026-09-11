import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ghjbudoeuxgpcghkhasa.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdoamJ1ZG9ldXhncGNnaGtoYXNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MzI2MDQsImV4cCI6MjA5NzIwODYwNH0.BSmFFIYSlXX1tPHSXnweBjkFqauseVntZ5w99ibp4Cs';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function checkAndApprove() {
  console.log('=== TODOS LOS PROVEEDORES ===');
  const { data: p, error: pErr } = await supabase.from('proveedores_aliados').select('id, nombre, categoria');
  if (pErr) console.error('Error proveedores:', pErr.message);
  else console.log(JSON.stringify(p, null, 2));

  console.log('=== USUARIOS CON NOMBRE O EMAIL RELACIONADO ===');
  const { data: u, error: uErr } = await supabase.from('usuarios_credicrc').select('id, email, nombre, rol, aprobado, proveedor_id');
  if (uErr) console.error('Error usuarios:', uErr.message);
  else console.log(JSON.stringify(u, null, 2));

  // Asegurar que pedidos_checkout esté activo en feature_flags
  const { error: fUpErr } = await supabase
    .from('feature_flags')
    .upsert([
      { modulo_id: 'pedidos_checkout', activo: true, descripcion: '⚡ Pedidos & Checkout Online' }
    ]);
  if (fUpErr) console.error('Error al activar flag:', fUpErr.message);
  else console.log('✅ Feature flag pedidos_checkout asegurado a activo: true');

  // Aprobar todos los usuarios proveedores por si acaso (para que puedan publicar productos y usar la tienda)
  const { error: uUpErr } = await supabase
    .from('usuarios_credicrc')
    .update({ aprobado: true })
    .eq('rol', 'proveedor');
  if (uUpErr) console.error('Error aprobando proveedores:', uUpErr.message);
  else console.log('✅ Todos los usuarios proveedores fueron autorizados (aprobado = true).');
}

checkAndApprove();
