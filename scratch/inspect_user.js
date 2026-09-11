import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ghjbudoeuxgpcghkhasa.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdoamJ1ZG9ldXhncGNnaGtoYXNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MzI2MDQsImV4cCI6MjA5NzIwODYwNH0.BSmFFIYSlXX1tPHSXnweBjkFqauseVntZ5w99ibp4Cs';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function inspectUser() {
  const { data: u, error } = await supabase
    .from('usuarios_credicrc')
    .select('*')
    .eq('email', 'viveres@credicrc.com')
    .maybeSingle();

  if (error) {
    console.error('Error fetching user:', error);
  } else {
    console.log('Usuario viveres@credicrc.com:', u);
  }
}

inspectUser();
