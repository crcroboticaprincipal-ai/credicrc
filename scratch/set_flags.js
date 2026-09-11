import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ghjbudoeuxgpcghkhasa.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdoamJ1ZG9ldXhncGNnaGtoYXNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MzI2MDQsImV4cCI6MjA5NzIwODYwNH0.BSmFFIYSlXX1tPHSXnweBjkFqauseVntZ5w99ibp4Cs';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function verifyFlags() {
  console.log('=== VERIFICANDO FEATURE FLAGS ===');
  const { data: flags, error } = await supabase.from('feature_flags').select('*');
  if (error) {
    console.error('Error al leer flags:', error);
    return;
  }
  console.log('Flags actuales:', flags);

  // Asegurar que tienda_online y pedidos_checkout existan y estén activos
  const flagsToUpsert = [
    { modulo_id: 'tienda_online', activo: true, descripcion: '🛍️ Vitrina & Catálogo Online de Proveedores' },
    { modulo_id: 'pedidos_checkout', activo: true, descripcion: '⚡ Pedidos & Checkout Online' },
  ];

  const { data: upsertData, error: upErr } = await supabase
    .from('feature_flags')
    .upsert(flagsToUpsert, { onConflict: 'modulo_id' })
    .select();

  if (upErr) {
    console.error('Error al upsert flags:', upErr.message);
  } else {
    console.log('✅ Feature flags actualizados con éxito:', upsertData);
  }
}

verifyFlags();
