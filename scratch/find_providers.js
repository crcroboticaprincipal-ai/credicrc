import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ghjbudoeuxgpcghkhasa.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdoamJ1ZG9ldXhncGNnaGtoYXNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MzI2MDQsImV4cCI6MjA5NzIwODYwNH0.BSmFFIYSlXX1tPHSXnweBjkFqauseVntZ5w99ibp4Cs';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function findProviders() {
  const { data: p, error } = await supabase
    .from('proveedores_aliados')
    .select('*');

  if (error) {
    console.error('Error fetching proveedores:', error);
    return;
  }

  console.log('--- TODOS LOS PROVEEDORES ALIADOS ---');
  p.forEach(prov => {
    console.log(`ID: ${prov.id} | Nombre: ${prov.nombre} | Categoría: ${prov.categoria}`);
  });

  const { data: u } = await supabase
    .from('usuarios_credicrc')
    .select('*')
    .eq('rol', 'proveedor');

  console.log('\n--- USUARIOS PROVEEDOR REGISTRADOS ---');
  u.forEach(user => {
    console.log(`User ID: ${user.id} | Email: ${user.email} | Nombre: ${user.nombre} | Proveedor_ID: ${user.proveedor_id} | Aprobado: ${user.aprobado}`);
  });
}

findProviders();
