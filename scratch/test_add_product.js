import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ghjbudoeuxgpcghkhasa.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdoamJ1ZG9ldXhncGNnaGtoYXNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MzI2MDQsImV4cCI6MjA5NzIwODYwNH0.BSmFFIYSlXX1tPHSXnweBjkFqauseVntZ5w99ibp4Cs';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testAddProduct() {
  console.log('Testing RPC agregar_producto_proveedor...');
  const { data, error } = await supabase.rpc('agregar_producto_proveedor', {
    p_proveedor_id: '6f8c5b00-d4df-4571-bd61-497d38b180ba', // Víveres Rafael Castillo
    p_nombre: 'Harina PAN 1kg (Prueba)',
    p_descripcion: 'Harina de maíz blanco precocida 1kg',
    p_precio: 1.25,
    p_imagen_url: null
  });

  if (error) {
    console.error('RPC Error:', error);
  } else {
    console.log('RPC Result:', data);
  }

  console.log('Testing direct INSERT on productos_proveedor...');
  const { data: insData, error: insErr } = await supabase
    .from('productos_proveedor')
    .insert([
      {
        proveedor_id: '6f8c5b00-d4df-4571-bd61-497d38b180ba',
        nombre: 'Arroz Primor 1kg (Prueba)',
        descripcion: 'Arroz blanco de primera calidad 1kg',
        precio: 1.40,
        stock_disponible: true,
        activo: true
      }
    ])
    .select();

  if (insErr) {
    console.error('Direct INSERT Error:', insErr);
  } else {
    console.log('Direct INSERT Result:', insData);
  }
}

testAddProduct();
