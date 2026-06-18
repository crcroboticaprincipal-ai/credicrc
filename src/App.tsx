import { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import {
  User,
  ShoppingBag,
  Sliders,
  QrCode,
  Calendar,
  History,
  CheckCircle2,
  AlertCircle,
  Bell,
  RefreshCw,
  TrendingUp,
  Percent,
  Search,
  Users,
  ShieldCheck,
  Download,
  Check,
  X,
  Home
} from 'lucide-react';

// --- LOGO VECTORIAL DE LA UNIDAD EDUCATIVA COLEGIO RAFAEL CASTILLO ---
function SchoolLogo({ className = "h-14 w-auto" }) {
  return (
    <svg className={className} viewBox="0 0 100 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* U.E. COLEGIO */}
      <text x="50" y="12" dominantBaseline="middle" textAnchor="middle" fontFamily="'Outfit', sans-serif" fontWeight="700" fontSize="9.5" fill="#64B5F6" letterSpacing="1">U.E. COLEGIO</text>
      
      {/* rc Emblem shapes matching the school shield */}
      {/* Vertical bar of r */}
      <rect x="15" y="22" width="22" height="55" rx="1.5" fill="#64B5F6"/>
      {/* Outer concentric arc (c) */}
      <path d="M 37 32 A 25 25 0 0 1 85 45 M 85 45 A 25 25 0 0 1 85 70" stroke="#64B5F6" strokeWidth="8.5" strokeLinecap="round" fill="none"/>
      {/* Inner concentric arc */}
      <path d="M 48 44 A 12 12 0 0 1 80 47 M 80 47 A 12 12 0 0 1 80 62" stroke="#90CAF9" strokeWidth="8" strokeLinecap="round" fill="none"/>
      {/* Red bullseye dot */}
      <circle cx="76" cy="54" r="7.5" fill="#E53935"/>
      
      {/* RAFAEL CASTILLO in Red */}
      <text x="50" y="93" dominantBaseline="middle" textAnchor="middle" fontFamily="'Outfit', sans-serif" fontWeight="800" fontSize="10.5" fill="#E53935" letterSpacing="0.2">RAFAEL CASTILLO</text>
      
      {/* Dividing light blue line */}
      <line x1="8" y1="102" x2="92" y2="102" stroke="#64B5F6" strokeWidth="1.5"/>
      
      {/* DUACA ESTADO LARA */}
      <text x="50" y="112" dominantBaseline="middle" textAnchor="middle" fontFamily="'Outfit', sans-serif" fontWeight="600" fontSize="6.8" fill="#64B5F6" letterSpacing="1.8">DUACA ESTADO LARA</text>
    </svg>
  );
}

// Interfaces para TypeScript
interface DBWorker {
  id: string;
  nombre: string;
  cedula: string;
  cargo: string;
  salario_base: string | number;
  antiguedad_anios: number;
  limite_personalizado: string | number | null;
  limite_total: string | number;
  limite_disponible: string | number;
  created_at: string;
}

interface Worker extends DBWorker {
  salario_base: number;
  limite_personalizado: number | null;
  limite_total: number;
  limite_disponible: number;
}

interface Provider {
  id: string;
  nombre: string;
  categoria: 'Carnes' | 'Víveres';
  cuenta_enlace: string;
  comision_colegio: string | number;
  created_at: string;
}

interface Transaction {
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
  trabajadores_crc?: Worker;
  proveedores_aliados?: Provider;
}

interface Installment {
  id: string;
  transaccion_id: string;
  monto_usd: number;
  fecha_cobro: string;
  estatus: 'Pendiente' | 'Cobrado' | 'Vencido';
  fecha_pago_real: string | null;
  tasa_bcv_pago: number | null;
  monto_ves_pagado: number | null;
  created_at: string;
  transacciones_credicrc?: Transaction & {
    trabajadores_crc?: Worker;
    proveedores_aliados?: Provider;
  };
}

interface ActiveQR {
  workerId: string;
  workerName: string;
  montoUsd: number;
  montoInicialUsd: number;
  diasFinanciamiento: number;
  token: string;
  timestamp: number;
}

interface UserAccount {
  id: string;
  email: string;
  password?: string;
  nombre: string;
  rol: 'trabajador' | 'proveedor' | 'admin';
  trabajador_id: string | null;
  proveedor_id: string | null;
  aprobado: boolean;
  datos_registro?: {
    cedula?: string;
    cargo?: string;
    categoria?: 'Carnes' | 'Víveres';
    cuenta_enlace?: string;
  } | null;
  created_at: string;
}

interface LandingConfig {
  hero_title: string;
  hero_description: string;
  portal_trabajador_title: string;
  portal_trabajador_description: string;
  portal_proveedor_title: string;
  portal_proveedor_description: string;
  portal_admin_title: string;
  portal_admin_description: string;
  politicas_financiamiento_title: string;
  politicas_financiamiento_description: string;
  estabilidad_seguridad_title: string;
  estabilidad_seguridad_description: string;
}

interface SystemNotification {
  id: string;
  timestamp: Date;
  type: 'success' | 'warning' | 'info' | 'error';
  title: string;
  message: string;
}

export default function App() {
  // --- Estados Generales del Simulador ---
  const [activeRole, setActiveRole] = useState<'inicio' | 'trabajador' | 'proveedor' | 'admin'>('inicio');
  const [bcvRate, setBcvRate] = useState<number>(36.85);
  const [logoError, setLogoError] = useState<boolean>(false);
  const [isSeeding, setIsSeeding] = useState<boolean>(false);
  
  // --- Estados de Autenticación Premium ---
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [systemUsers, setSystemUsers] = useState<UserAccount[]>([]);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authEmail, setAuthEmail] = useState<string>('');
  const [authPassword, setAuthPassword] = useState<string>('');
  const [authName, setAuthName] = useState<string>('');
  const [authRoleSelection, setAuthRoleSelection] = useState<'trabajador' | 'proveedor'>('trabajador');
  const [authWorkerCedula, setAuthWorkerCedula] = useState<string>('');
  const [authWorkerCargo, setAuthWorkerCargo] = useState<string>('Docente de Primaria');
  const [authProviderCategoria, setAuthProviderCategoria] = useState<'Carnes' | 'Víveres'>('Carnes');
  const [authProviderCuenta, setAuthProviderCuenta] = useState<string>('');
  const [isAuthSubmitting, setIsAuthSubmitting] = useState<boolean>(false);

  // --- Estados de Aprobación de Cuentas ---
  const [approvingUserId, setApprovingUserId] = useState<string | null>(null);
  const [approveSalary, setApproveSalary] = useState<string>('350');
  const [approveAntiguedad, setApproveAntiguedad] = useState<string>('3');
  const [approveComision, setApproveComision] = useState<string>('4.0');

  const [notifications, setNotifications] = useState<SystemNotification[]>([
    {
      id: 'init',
      timestamp: new Date(),
      type: 'info',
      title: 'Sistema CrediCRC Iniciado',
      message: 'Base de datos conectada. Sincronizando tasa cambiaria oficial...'
    }
  ]);

  // --- Datos de la Base de Datos ---
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // --- Selección Activa por Roles ---
  const [activeWorkerId, setActiveWorkerId] = useState<string>('');
  const [activeProviderId, setActiveProviderId] = useState<string>('');

  // --- Estado de QR Compartido (Simulación en memoria) ---
  const [activeQR, setActiveQR] = useState<ActiveQR | null>(null);
  const [qrCountdown, setQrCountdown] = useState<number>(0);
  const qrTimerRef = useRef<any>(null);

  // --- Estados de los Módulos ---
  // Trabajador
  const [wPurchaseAmount, setWPurchaseAmount] = useState<string>('50');
  const [wDownPayment, setWDownPayment] = useState<string>('15');
  const [wDays, setWDays] = useState<number>(15);
  const [showQRModal, setShowQRModal] = useState<boolean>(false);

  // Proveedor POS
  const [posAmount, setPosAmount] = useState<string>('0');
  const [posDownPayment, setPosDownPayment] = useState<string>('0');
  const [scannedQR, setScannedQR] = useState<ActiveQR | null>(null);
  const [validationResult, setValidationResult] = useState<{
    aprobado: boolean;
    mensaje: string;
    cuota_restante: number;
    limite_quincenal_max: number;
  } | null>(null);
  const [isValidating, setIsValidating] = useState<boolean>(false);
  const [isProcessingPurchase, setIsProcessingPurchase] = useState<boolean>(false);

  // Admin
  const [adminSearchWorker, setAdminSearchWorker] = useState<string>('');
  const [selectedWorkerForEdit, setSelectedWorkerForEdit] = useState<Worker | null>(null);
  const [editSalary, setEditSalary] = useState<string>('');
  const [editLimitOverride, setEditLimitOverride] = useState<string>('');
  const [bulkCargo, setBulkCargo] = useState<string>('Docente de Primaria');
  const [bulkLimit, setBulkLimit] = useState<string>('200');
  const [bulkSalary, setBulkSalary] = useState<string>('');
  const [isApplyingBulk, setIsApplyingBulk] = useState<boolean>(false);
  const [payrollFilterDate, setPayrollFilterDate] = useState<string>('');
  const [isProcessingPayroll, setIsProcessingPayroll] = useState<boolean>(false);

  // Admin Add Worker Form
  const [showAddWorkerModal, setShowAddWorkerModal] = useState<boolean>(false);
  const [newWorkerNombre, setNewWorkerNombre] = useState<string>('');
  const [newWorkerCedula, setNewWorkerCedula] = useState<string>('');
  const [newWorkerCargo, setNewWorkerCargo] = useState<string>('Docente de Primaria');
  const [newWorkerSalario, setNewWorkerSalario] = useState<string>('300');
  const [newWorkerAntiguedad, setNewWorkerAntiguedad] = useState<string>('0');
  const [isRegisteringWorker, setIsRegisteringWorker] = useState<boolean>(false);

  // Admin Add Provider Form
  const [showAddProviderModal, setShowAddProviderModal] = useState<boolean>(false);
  const [newProviderNombre, setNewProviderNombre] = useState<string>('');
  const [newProviderCategoria, setNewProviderCategoria] = useState<'Carnes' | 'Víveres'>('Carnes');
  const [newProviderCuenta, setNewProviderCuenta] = useState<string>('');
  const [newProviderComision, setNewProviderComision] = useState<string>('4.0');
  const [isRegisteringProvider, setIsRegisteringProvider] = useState<boolean>(false);

  // Editor de Página de Inicio
  const [editorTab, setEditorTab] = useState<'hero' | 'politicas'>('hero');
  const [landingConfig, setLandingConfig] = useState<LandingConfig>({
    hero_title: 'Ecosistema Financiero Digital',
    hero_description: 'Adquiere alimentos y víveres con descuento directo por nómina. Un sistema seguro, ágil y transparente diseñado exclusivamente para el personal docente y administrativo.',
    portal_trabajador_title: 'Portal del Trabajador',
    portal_trabajador_description: 'Diseñado para el personal docente, administrativo y de mantenimiento. Consulta tu saldo disponible, genera códigos QR de compra y visualiza tus cuotas de pago.',
    portal_proveedor_title: 'Punto de Venta Proveedor',
    portal_proveedor_description: 'Reservado para los comercios aliados autorizados (Víveres y Carnes). Procesa compras escaneando el QR dinámico de los trabajadores y verifica límites de crédito.',
    portal_admin_title: 'Panel Administrativo',
    portal_admin_description: 'Acceso para la directiva del Colegio. Configura límites masivos, registra nuevos trabajadores y comercios aliados, consulta nóminas y liquida pagos a comercios.',
    politicas_financiamiento_title: 'Políticas de Financiamiento Escolar',
    politicas_financiamiento_description: 'El personal afiliado cuenta con un límite automático del 50% de su salario. Las cuotas son cobradas a los 7 o 15 días directamente mediante deducción de nómina de la institución. No aplica recargo de interés moratorio, solo se indexa al tipo de cambio oficial del BCV del día de cobro.',
    estabilidad_seguridad_title: 'Estabilidad y Seguridad de Datos',
    estabilidad_seguridad_description: 'Todas las transacciones son atómicas, encriptadas y seguras. Al escanear el QR del trabajador, el punto de venta valida de forma automatizada y en tiempo real si la cuota generada se encuentra dentro del límite disponible y respeta la capacidad de endeudamiento saludable (máximo 30% del ingreso).'
  });

  const fetchBcvRate = async () => {
    try {
      const response = await fetch('https://ve.dolarapi.com/v1/dolares/oficial');
      if (!response.ok) throw new Error('No se pudo obtener la tasa oficial de DolarAPI');
      const data = await response.json();
      if (data && typeof data.promedio === 'number') {
        setBcvRate(data.promedio);
        addNotification(
          'success',
          'Tasa BCV Sincronizada',
          `Conexión real establecida. La tasa oficial del BCV del día se actualizó a Bs. ${data.promedio.toFixed(2)} / USD.`
        );
      } else if (data && typeof data.venta === 'number') {
        setBcvRate(data.venta);
        addNotification(
          'success',
          'Tasa BCV Sincronizada',
          `Conexión real establecida. La tasa oficial del BCV del día se actualizó a Bs. ${data.venta.toFixed(2)} / USD.`
        );
      } else {
        throw new Error('Formato de datos de tasa no reconocido');
      }
    } catch (err: any) {
      console.error('Error fetching BCV rate:', err);
      addNotification(
        'warning',
        'Tasa BCV Predeterminada',
        `No se pudo sincronizar automáticamente con el BCV (${err.message || 'Error de conexión'}). Se mantiene la tasa manual de Bs. ${bcvRate.toFixed(2)} / USD.`
      );
    }
  };

  // Carga inicial y recargas
  useEffect(() => {
    fetchData();
    fetchBcvRate();
  }, []);

  // Timer del QR
  useEffect(() => {
    if (qrCountdown > 0) {
      qrTimerRef.current = setTimeout(() => {
        setQrCountdown(prev => prev - 1);
      }, 1000);
    } else if (qrCountdown === 0 && activeQR) {
      addNotification('warning', 'QR Expirado', `El código QR generado para ${activeQR.workerName} ha expirado.`);
      setActiveQR(null);
    }
    return () => {
      if (qrTimerRef.current) clearTimeout(qrTimerRef.current);
    };
  }, [qrCountdown, activeQR]);

  const addNotification = (type: 'success' | 'warning' | 'info' | 'error', title: string, message: string) => {
    setNotifications(prev => [
      {
        id: Math.random().toString(),
        timestamp: new Date(),
        type,
        title,
        message
      },
      ...prev
    ]);
  };

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // 1. Trabajadores
      const { data: wData, error: wError } = await supabase
        .from('trabajadores_crc')
        .select('*')
        .order('nombre');
      if (wError) throw wError;
      
      const parsedWorkers = (wData || []).map((w: DBWorker) => ({
        ...w,
        salario_base: parseFloat(w.salario_base as string),
        limite_personalizado: w.limite_personalizado ? parseFloat(w.limite_personalizado as string) : null,
        limite_total: parseFloat(w.limite_total as string),
        limite_disponible: parseFloat(w.limite_disponible as string)
      })) as Worker[];
      setWorkers(parsedWorkers);
      if (parsedWorkers.length > 0 && !activeWorkerId) {
        setActiveWorkerId(parsedWorkers[0].id);
      }

      // 2. Proveedores
      const { data: pData, error: pError } = await supabase
        .from('proveedores_aliados')
        .select('*')
        .order('nombre');
      if (pError) throw pError;
      setProviders(pData || []);
      if (pData && pData.length > 0 && !activeProviderId) {
        setActiveProviderId(pData[0].id);
      }

      // 3. Transacciones
      const { data: tData, error: tError } = await supabase
        .from('transacciones_credicrc')
        .select('*, trabajadores_crc(*), proveedores_aliados(*)')
        .order('fecha_transaccion', { ascending: false });
      if (tError) throw tError;
      
      const parsedTransactions = (tData || []).map((t: any) => ({
        ...t,
        monto_usd: parseFloat(t.monto_usd),
        tasa_bcv: parseFloat(t.tasa_bcv),
        monto_ves: parseFloat(t.monto_ves),
        monto_inicial_pagado_usd: parseFloat(t.monto_inicial_pagado_usd),
        comision_monto_usd: parseFloat(t.comision_monto_usd),
        trabajadores_crc: {
          ...t.trabajadores_crc,
          salario_base: parseFloat(t.trabajadores_crc.salario_base),
          limite_personalizado: t.trabajadores_crc.limite_personalizado ? parseFloat(t.trabajadores_crc.limite_personalizado) : null,
          limite_total: parseFloat(t.trabajadores_crc.limite_total),
          limite_disponible: parseFloat(t.trabajadores_crc.limite_disponible)
        }
      })) as Transaction[];
      setTransactions(parsedTransactions);

      // 4. Cuotas
      const { data: cData, error: cError } = await supabase
        .from('cronograma_cuotas')
        .select('*, transacciones_credicrc(*, trabajadores_crc(*), proveedores_aliados(*))')
        .order('fecha_cobro', { ascending: true });
      if (cError) throw cError;

      const parsedInstallments = (cData || []).map((c: any) => ({
        ...c,
        monto_usd: parseFloat(c.monto_usd),
        tasa_bcv_pago: c.tasa_bcv_pago ? parseFloat(c.tasa_bcv_pago) : null,
        monto_ves_pagado: c.monto_ves_pagado ? parseFloat(c.monto_ves_pagado) : null,
        transacciones_credicrc: {
          ...c.transacciones_credicrc,
          monto_usd: parseFloat(c.transacciones_credicrc.monto_usd),
          tasa_bcv: parseFloat(c.transacciones_credicrc.tasa_bcv),
          monto_ves: parseFloat(c.transacciones_credicrc.monto_ves),
          monto_inicial_pagado_usd: parseFloat(c.transacciones_credicrc.monto_inicial_pagado_usd),
          comision_monto_usd: parseFloat(c.transacciones_credicrc.comision_monto_usd),
          trabajadores_crc: {
            ...c.transacciones_credicrc.trabajadores_crc,
            salario_base: parseFloat(c.transacciones_credicrc.trabajadores_crc.salario_base),
            limite_personalizado: c.transacciones_credicrc.trabajadores_crc.limite_personalizado ? parseFloat(c.transacciones_credicrc.trabajadores_crc.limite_personalizado) : null,
            limite_total: parseFloat(c.transacciones_credicrc.trabajadores_crc.limite_total),
            limite_disponible: parseFloat(c.transacciones_credicrc.trabajadores_crc.limite_disponible)
          }
        }
      })) as Installment[];
      setInstallments(parsedInstallments);

      // 5. Usuarios de CrediCRC
      const { data: uData, error: uError } = await supabase
        .from('usuarios_credicrc')
        .select('*')
        .order('created_at', { ascending: false });
      if (uError) throw uError;
      setSystemUsers(uData || []);

      // Configurar fecha de filtro de nómina por defecto a la fecha más próxima de cuotas pendientes
      const pendingDates = parsedInstallments
        .filter(i => i.estatus === 'Pendiente')
        .map(i => i.fecha_cobro);
      if (pendingDates.length > 0 && !payrollFilterDate) {
        setPayrollFilterDate(pendingDates[0]);
      }

      // 6. Configuración de la Página de Inicio
      const { data: configData, error: configError } = await supabase
        .from('configuracion_inicio')
        .select('*')
        .eq('id', 1)
        .maybeSingle();
      if (!configError && configData) {
        setLandingConfig(configData);
      }
    } catch (err: any) {
      console.error('Error fetching data:', err);
      addNotification('error', 'Error de Conexión', err.message || 'Error cargando datos del servidor');
    } finally {
      setIsLoading(false);
    }
  };

  // --- CONTROL DE ACCESO Y AUTENTICACIÓN ---
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authEmail || !authPassword) {
      addNotification('error', 'Campos Incompletos', 'Por favor, ingrese su correo y contraseña.');
      return;
    }
    setIsAuthSubmitting(true);
    try {
      const { data, error } = await supabase
        .from('usuarios_credicrc')
        .select('*')
        .eq('email', authEmail.trim().toLowerCase())
        .eq('password', authPassword)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        addNotification('error', 'Credenciales Incorrectas', 'El correo o la contraseña son inválidos.');
        setIsAuthSubmitting(false);
        return;
      }

      const user = data as UserAccount;
      if (!user.aprobado) {
        addNotification('warning', 'Cuenta Pendiente', 'Su cuenta ha sido registrada pero está en espera de aprobación por la administración del colegio.');
        setIsAuthSubmitting(false);
        return;
      }

      // Login exitoso
      setCurrentUser(user);
      addNotification('success', 'Sesión Iniciada', `¡Bienvenido al sistema, ${user.nombre}!`);
      
      // Limpiar campos
      setAuthEmail('');
      setAuthPassword('');
      
      // Redirigir al rol correspondiente
      setActiveRole(user.rol);
      if (user.rol === 'trabajador' && user.trabajador_id) {
        setActiveWorkerId(user.trabajador_id);
      } else if (user.rol === 'proveedor' && user.proveedor_id) {
        setActiveProviderId(user.proveedor_id);
      }
    } catch (err: any) {
      console.error(err);
      addNotification('error', 'Error de Autenticación', err.message || 'No se pudo conectar con el servidor.');
    } finally {
      setIsAuthSubmitting(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authEmail || !authPassword || !authName) {
      addNotification('error', 'Campos Incompletos', 'Por favor complete todos los datos requeridos.');
      return;
    }

    // Validaciones específicas de rol
    const regData: any = {};
    if (authRoleSelection === 'trabajador') {
      if (!authWorkerCedula || !authWorkerCargo) {
        addNotification('error', 'Campos Incompletos', 'La cédula y el cargo son requeridos para docentes.');
        return;
      }
      regData.cedula = authWorkerCedula.trim();
      regData.cargo = authWorkerCargo;
    } else {
      if (!authProviderCuenta) {
        addNotification('error', 'Campos Incompletos', 'La cuenta de enlace bancario es requerida para comercios.');
        return;
      }
      regData.categoria = authProviderCategoria;
      regData.cuenta_enlace = authProviderCuenta.trim();
    }

    setIsAuthSubmitting(true);
    try {
      const { error } = await supabase
        .from('usuarios_credicrc')
        .insert([
          {
            email: authEmail.trim().toLowerCase(),
            password: authPassword,
            nombre: authName.trim(),
            rol: authRoleSelection,
            aprobado: false,
            datos_registro: regData
          }
        ]);

      if (error) {
        if (error.code === '23505') {
          throw new Error('Este correo electrónico ya se encuentra registrado.');
        }
        throw error;
      }

      addNotification('success', 'Registro Exitoso', 'Su solicitud de cuenta ha sido registrada. Debe ser aprobada por el Admin para ingresar.');
      
      // Limpiar campos
      setAuthEmail('');
      setAuthPassword('');
      setAuthName('');
      setAuthWorkerCedula('');
      setAuthProviderCuenta('');
      
      // Volver a login
      setAuthMode('login');
      await fetchData();
    } catch (err: any) {
      console.error(err);
      addNotification('error', 'Error al Registrarse', err.message || 'No se pudo registrar la cuenta.');
    } finally {
      setIsAuthSubmitting(false);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setActiveRole('inicio');
    addNotification('info', 'Sesión Cerrada', 'Has cerrado sesión correctamente de la plataforma.');
  };

  const handleApproveUser = async (userId: string) => {
    const userToApprove = systemUsers.find(u => u.id === userId);
    if (!userToApprove) return;

    try {
      addNotification('info', 'Procesando Aprobación', `Aprobando cuenta de ${userToApprove.nombre}...`);
      
      if (userToApprove.rol === 'trabajador') {
        const salary = parseFloat(approveSalary);
        const years = parseInt(approveAntiguedad);
        if (isNaN(salary) || salary <= 0) {
          addNotification('error', 'Monto Inválido', 'El sueldo base mensual debe ser mayor a cero.');
          return;
        }

        // 1. Insertar trabajador
        const { data: wData, error: wError } = await supabase
          .from('trabajadores_crc')
          .insert([
            {
              nombre: userToApprove.nombre,
              cedula: userToApprove.datos_registro?.cedula || 'V-00.000.000',
              cargo: userToApprove.datos_registro?.cargo || 'Docente',
              salario_base: salary,
              antiguedad_anios: isNaN(years) ? 0 : years
            }
          ])
          .select()
          .single();

        if (wError) throw wError;

        // 2. Asociar y aprobar usuario
        const { error: uError } = await supabase
          .from('usuarios_credicrc')
          .update({
            trabajador_id: wData.id,
            aprobado: true
          })
          .eq('id', userId);

        if (uError) throw uError;
        addNotification('success', 'Trabajador Aprobado', `El docente ${userToApprove.nombre} ha sido activado en nómina con límite de crédito.`);

      } else if (userToApprove.rol === 'proveedor') {
        const comision = parseFloat(approveComision) / 100;
        if (isNaN(comision) || comision < 0.03 || comision > 0.05) {
          addNotification('error', 'Comisión Inválida', 'La comisión del colegio debe estar entre 3% y 5%.');
          return;
        }

        // 1. Insertar proveedor
        const { data: pData, error: pError } = await supabase
          .from('proveedores_aliados')
          .insert([
            {
              nombre: userToApprove.nombre,
              categoria: userToApprove.datos_registro?.categoria || 'Víveres',
              cuenta_enlace: userToApprove.datos_registro?.cuenta_enlace || 'Bco. Central',
              comision_colegio: comision
            }
          ])
          .select()
          .single();

        if (pError) throw pError;

        // 2. Asociar y aprobar usuario
        const { error: uError } = await supabase
          .from('usuarios_credicrc')
          .update({
            proveedor_id: pData.id,
            aprobado: true
          })
          .eq('id', userId);

        if (uError) throw uError;
        addNotification('success', 'Proveedor Aprobado', `El comercio ${userToApprove.nombre} ha sido afiliado al sistema.`);
      }

      setApprovingUserId(null);
      await fetchData();
    } catch (err: any) {
      console.error(err);
      addNotification('error', 'Error al Aprobar', err.message || 'No se pudo aprobar el registro.');
    }
  };

  // --- REINICIAR Y SEMBRAR BASE DE DATOS ---
  const handleReseed = async () => {
    setIsSeeding(true);
    addNotification('info', 'Reiniciando Base de Datos', 'Limpiando tablas y sembrando datos escolares...');
    try {
      const { error } = await supabase.rpc('sembrar_datos_credicrc');
      if (error) throw error;
      
      setActiveQR(null);
      setScannedQR(null);
      setValidationResult(null);
      addNotification('success', 'Restablecimiento Exitoso', 'La base de datos del Colegio Rafael Castillo ha sido restaurada con datos iniciales.');
      await fetchData();
    } catch (err: any) {
      console.error(err);
      addNotification('error', 'Error al Sembrar', err.message || 'Fallo el restablecimiento de datos en el servidor');
    } finally {
      setIsSeeding(false);
    }
  };

  // --- ADMIN: GUARDAR CONFIGURACIÓN DE PÁGINA DE INICIO ---
  const [isSavingConfig, setIsSavingConfig] = useState<boolean>(false);
  const handleSaveLandingConfig = async () => {
    setIsSavingConfig(true);
    try {
      const { error } = await supabase
        .from('configuracion_inicio')
        .update(landingConfig)
        .eq('id', 1);
      if (error) throw error;
      addNotification('success', 'Configuración Guardada', 'Los textos de la página de inicio se han actualizado en el servidor.');
      await fetchData();
    } catch (err: any) {
      console.error(err);
      addNotification('error', 'Error al Guardar', err.message || 'No se pudo guardar la configuración en el servidor.');
    } finally {
      setIsSavingConfig(false);
    }
  };

  // --- TRABAJADOR: GENERACIÓN DE QR ---
  const handleGenerateQR = () => {
    const worker = workers.find(w => w.id === activeWorkerId);
    if (!worker) return;

    const amount = parseFloat(wPurchaseAmount);
    const initial = parseFloat(wDownPayment);

    if (isNaN(amount) || amount <= 0) {
      addNotification('error', 'Monto Inválido', 'El monto de compra debe ser un número mayor a cero.');
      return;
    }
    if (isNaN(initial) || initial < 0) {
      addNotification('error', 'Monto Inválido', 'El pago inicial no puede ser negativo.');
      return;
    }
    if (initial >= amount) {
      addNotification('error', 'Pago Inicial Excedido', 'El pago inicial debe ser menor al monto total de la compra.');
      return;
    }

    const remaining = amount - initial;

    // Validación rápida local de cupo antes de generar QR
    if (remaining > worker.limite_disponible) {
      addNotification('warning', 'Cupo de Crédito Insuficiente', `El saldo restante a financiar ($${remaining.toFixed(2)}) supera tu cupo disponible ($${worker.limite_disponible.toFixed(2)}).`);
      return;
    }

    // Capacidad del 30% local rápida (mensual / 2 * 0.30 = mensual * 0.15)
    const biweeklyLimit = worker.salario_base * 0.15;
    if (remaining > biweeklyLimit) {
      addNotification('warning', 'Excede Capacidad de Pago', `El cobro único restante ($${remaining.toFixed(2)}) supera tu capacidad máxima de descuento por nómina ($${biweeklyLimit.toFixed(2)} por quincena).`);
      return;
    }

    const token = `CRC-QR-${worker.cedula.replace(/[^0-9]/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;
    
    const newQR: ActiveQR = {
      workerId: worker.id,
      workerName: worker.nombre,
      montoUsd: amount,
      montoInicialUsd: initial,
      diasFinanciamiento: wDays,
      token,
      timestamp: Date.now()
    };

    setActiveQR(newQR);
    setQrCountdown(300); // 5 minutos
    setShowQRModal(true);
    addNotification('info', 'Código QR Generado', `QR de compra por $${amount.toFixed(2)} ($${initial.toFixed(2)} inicial, $${remaining.toFixed(2)} a ${wDays} días) listo para escanear.`);
  };

  // --- PROVEEDOR: ESCANEAR QR ACTIVO SIMULADO ---
  const handleSimulateScan = () => {
    if (!activeQR) {
      addNotification('warning', 'Sin QR Activo', 'No hay ningún código QR generado actualmente en el simulador. Ve al Módulo del Trabajador y genera un QR.');
      return;
    }
    
    setScannedQR(activeQR);
    setPosAmount(activeQR.montoUsd.toString());
    setPosDownPayment(activeQR.montoInicialUsd.toString());
    setValidationResult(null);
    addNotification('success', 'Código QR Escaneado', `Código detectado de ${activeQR.workerName}. Iniciando validación transaccional...`);
    validatePurchase(activeQR);
  };

  // --- PROVEEDOR: VALIDAR COMPRA EN TIEMPO REAL ---
  const validatePurchase = async (qr: ActiveQR) => {
    setIsValidating(true);
    try {
      const { data, error } = await supabase.rpc('validar_capacidad_credicrc', {
        p_trabajador_id: qr.workerId,
        p_monto_usd: qr.montoUsd,
        p_monto_inicial_usd: qr.montoInicialUsd,
        p_dias_financiamiento: qr.diasFinanciamiento
      });

      if (error) throw error;

      if (data && data.length > 0) {
        const res = data[0];
        setValidationResult({
          aprobado: res.aprobado,
          mensaje: res.mensaje,
          cuota_restante: parseFloat(res.cuota_restante),
          limite_quincenal_max: parseFloat(res.limite_quincenal_max)
        });

        if (res.aprobado) {
          addNotification('success', 'Validación Financiera Aprobada', `Trabajador: ${qr.workerName}. Crédito aprobado para cuota de $${parseFloat(res.cuota_restante).toFixed(2)}.`);
        } else {
          addNotification('error', 'Validación Fallida', `La transacción de ${qr.workerName} fue rechazada: ${res.mensaje}`);
        }
      }
    } catch (err: any) {
      console.error(err);
      addNotification('error', 'Fallo en Validación', err.message || 'Error de base de datos durante validación');
    } finally {
      setIsValidating(false);
    }
  };

  // --- PROVEEDOR: CONFIRMAR COMPRA ---
  const handleProcessPurchase = async () => {
    if (!scannedQR || !validationResult || !validationResult.aprobado) return;
    
    setIsProcessingPurchase(true);
    addNotification('info', 'Procesando Transacción', 'Registrando transacción y creando cuotas...');
    try {
      const { error } = await supabase.rpc('crear_transaccion_credicrc', {
        p_trabajador_id: scannedQR.workerId,
        p_proveedor_id: activeProviderId,
        p_monto_usd: scannedQR.montoUsd,
        p_monto_inicial_usd: scannedQR.montoInicialUsd,
        p_tasa_bcv: bcvRate,
        p_dias_financiamiento: scannedQR.diasFinanciamiento,
        p_token_aprobacion: scannedQR.token
      });

      if (error) throw error;

      const provider = providers.find(p => p.id === activeProviderId);
      
      // Notificaciones Push/Email simuladas
      addNotification('success', '¡Compra Exitosa!', `Transacción registrada. Trabajador ${scannedQR.workerName} financió $${(scannedQR.montoUsd - scannedQR.montoInicialUsd).toFixed(2)} en ${provider?.nombre}.`);
      addNotification('info', 'Descuento de Nómina Programado', `Cuota de $${(scannedQR.montoUsd - scannedQR.montoInicialUsd).toFixed(2)} en bolívares agregada para el trabajador.`);
      
      // Resetear estados
      setActiveQR(null);
      setScannedQR(null);
      setValidationResult(null);
      setShowQRModal(false);
      
      // Actualizar datos
      await fetchData();
    } catch (err: any) {
      console.error(err);
      addNotification('error', 'Error al Procesar Compra', err.message || 'Fallo la transacción en el servidor');
    } finally {
      setIsProcessingPurchase(false);
    }
  };

  // --- ADMIN: REGISTRAR NUEVO TRABAJADOR ---
  const handleRegisterWorker = async () => {
    const name = newWorkerNombre.trim();
    const cedula = newWorkerCedula.trim();
    const salary = parseFloat(newWorkerSalario);
    const seniority = parseInt(newWorkerAntiguedad);

    if (name === '') {
      addNotification('error', 'Dato Inválido', 'El nombre del trabajador no puede estar vacío.');
      return;
    }
    if (cedula === '') {
      addNotification('error', 'Dato Inválido', 'La cédula del trabajador no puede estar vacía.');
      return;
    }
    if (isNaN(salary) || salary <= 0) {
      addNotification('error', 'Dato Inválido', 'El salario mensual debe ser un número positivo.');
      return;
    }
    if (isNaN(seniority) || seniority < 0) {
      addNotification('error', 'Dato Inválido', 'La antigüedad debe ser un número mayor o igual a cero.');
      return;
    }

    setIsRegisteringWorker(true);
    addNotification('info', 'Registrando Trabajador', `Creando ficha para ${name} en base de datos...`);
    try {
      const { error } = await supabase
        .from('trabajadores_crc')
        .insert([
          {
            nombre: name,
            cedula: cedula,
            cargo: newWorkerCargo,
            salario_base: salary,
            antiguedad_anios: seniority
          }
        ]);

      if (error) throw error;

      addNotification('success', 'Trabajador Registrado', `Se registró a ${name} con éxito. El límite de crédito del 50% ($${(salary * 0.5).toFixed(2)}) se asignó automáticamente.`);
      
      // Reset form
      setNewWorkerNombre('');
      setNewWorkerCedula('');
      setNewWorkerCargo('Docente de Primaria');
      setNewWorkerSalario('300');
      setNewWorkerAntiguedad('0');
      setShowAddWorkerModal(false);
      
      await fetchData();
    } catch (err: any) {
      console.error(err);
      addNotification('error', 'Fallo al Registrar', err.message || 'Error en el servidor');
    } finally {
      setIsRegisteringWorker(false);
    }
  };

  // --- ADMIN: REGISTRAR NUEVO PROVEEDOR ---
  const handleRegisterProvider = async () => {
    const name = newProviderNombre.trim();
    const bank = newProviderCuenta.trim();
    const commPct = parseFloat(newProviderComision);

    if (name === '') {
      addNotification('error', 'Dato Inválido', 'El nombre del comercio no puede estar vacío.');
      return;
    }
    if (bank === '') {
      addNotification('error', 'Dato Inválido', 'Los datos de la cuenta de enlace bancario no pueden estar vacíos.');
      return;
    }
    if (isNaN(commPct) || commPct < 3.0 || commPct > 5.0) {
      addNotification('error', 'Comisión Fuera de Rango', 'La comisión retenida para el colegio debe estar en el rango de 3.0% a 5.0%.');
      return;
    }

    setIsRegisteringProvider(true);
    addNotification('info', 'Registrando Proveedor', `Agregando comercio aliado ${name} en base de datos...`);
    try {
      const { error } = await supabase
        .from('proveedores_aliados')
        .insert([
          {
            nombre: name,
            categoria: newProviderCategoria,
            cuenta_enlace: bank,
            comision_colegio: commPct / 100
          }
        ]);

      if (error) throw error;

      addNotification('success', 'Proveedor Registrado', `Se afilió a ${name} con éxito (Categoría: ${newProviderCategoria}, Comisión: ${commPct}%).`);
      
      // Reset form
      setNewProviderNombre('');
      setNewProviderCuenta('');
      setNewProviderCategoria('Carnes');
      setNewProviderComision('4.0');
      setShowAddProviderModal(false);
      
      await fetchData();
    } catch (err: any) {
      console.error(err);
      addNotification('error', 'Fallo al Registrar Proveedor', err.message || 'Error en el servidor');
    } finally {
      setIsRegisteringProvider(false);
    }
  };

  // --- ADMIN: EDITAR SUELDO Y LÍMITES INDIVIDUALES ---
  const handleSaveWorkerEdit = async () => {
    if (!selectedWorkerForEdit) return;

    const salary = parseFloat(editSalary);
    const override = editLimitOverride.trim() === '' ? null : parseFloat(editLimitOverride);

    if (isNaN(salary) || salary <= 0) {
      addNotification('error', 'Dato Inválido', 'El salario mensual debe ser un número positivo.');
      return;
    }
    if (override !== null && (isNaN(override) || override < 0)) {
      addNotification('error', 'Dato Inválido', 'El límite personalizado debe ser un número mayor o igual a cero.');
      return;
    }

    try {
      const { error } = await supabase
        .from('trabajadores_crc')
        .update({
          salario_base: salary,
          limite_personalizado: override
        })
        .eq('id', selectedWorkerForEdit.id);

      if (error) throw error;

      addNotification('success', 'Límites Actualizados', `Se actualizó la ficha de ${selectedWorkerForEdit.nombre}. Límite total recalculado.`);
      setSelectedWorkerForEdit(null);
      await fetchData();
    } catch (err: any) {
      console.error(err);
      addNotification('error', 'Fallo al Guardar Ficha', err.message || 'Error en el servidor');
    }
  };

  // --- ADMIN: AJUSTE MASIVO POR CARGO ---
  const handleApplyBulkAdjust = async () => {
    const limitVal = bulkLimit.trim() === '' ? null : parseFloat(bulkLimit);
    const salaryVal = bulkSalary.trim() === '' ? null : parseFloat(bulkSalary);

    if (limitVal === null && salaryVal === null) {
      addNotification('warning', 'Sin Cambios', 'Debes ingresar al menos un salario base o un límite personalizado para aplicar de forma masiva.');
      return;
    }
    if (limitVal !== null && (isNaN(limitVal) || limitVal < 0)) {
      addNotification('error', 'Dato Inválido', 'El límite personalizado masivo debe ser positivo.');
      return;
    }
    if (salaryVal !== null && (isNaN(salaryVal) || salaryVal <= 0)) {
      addNotification('error', 'Dato Inválido', 'El salario base masivo debe ser mayor a cero.');
      return;
    }

    setIsApplyingBulk(true);
    addNotification('info', 'Aplicando Ajuste Masivo', `Actualizando límites y salarios de todos los trabajadores con cargo: "${bulkCargo}"...`);
    try {
      const updatePayload: any = {};
      if (salaryVal !== null) updatePayload.salario_base = salaryVal;
      updatePayload.limite_personalizado = limitVal; // Si es null, se borra la sobreescritura y vuelve al 50% por defecto

      const { error } = await supabase
        .from('trabajadores_crc')
        .update(updatePayload)
        .eq('cargo', bulkCargo);

      if (error) throw error;

      addNotification('success', 'Ajuste Masivo Completado', `Se ajustaron con éxito los límites de todos los trabajadores con el cargo: "${bulkCargo}".`);
      setBulkLimit('200');
      setBulkSalary('');
      await fetchData();
    } catch (err: any) {
      console.error(err);
      addNotification('error', 'Fallo en Ajuste Masivo', err.message || 'Error en el servidor');
    } finally {
      setIsApplyingBulk(false);
    }
  };

  // --- ADMIN: PROCESAR DESCUENTO DE NÓMINA (MARCAR COMO COBRADO) ---
  const handleProcessPayrollDeductions = async () => {
    if (!payrollFilterDate) return;
    
    const targetInstallments = installments.filter(
      i => i.fecha_cobro === payrollFilterDate && i.estatus === 'Pendiente'
    );

    if (targetInstallments.length === 0) {
      addNotification('warning', 'Sin Cuotas', 'No hay cuotas pendientes de cobro para esta fecha de nómina.');
      return;
    }

    setIsProcessingPayroll(true);
    addNotification('info', 'Cobrando Cuotas', `Procesando descuentos de nómina para la fecha ${payrollFilterDate}...`);
    try {
      const idsToUpdate = targetInstallments.map(i => i.id);
      
      const { error } = await supabase
        .from('cronograma_cuotas')
        .update({
          estatus: 'Cobrado',
          fecha_pago_real: new Date().toISOString(),
          tasa_bcv_pago: bcvRate,
          monto_ves_pagado: null
        })
        .in('id', idsToUpdate);

      if (error) throw error;

      // Actualizar montos en bolívares pagados en JS y guardarlos en base
      for (const inst of targetInstallments) {
        const vesValue = Math.round(inst.monto_usd * bcvRate * 100) / 100;
        await supabase
          .from('cronograma_cuotas')
          .update({
            monto_ves_pagado: vesValue
          })
          .eq('id', inst.id);
      }

      addNotification('success', 'Nómina Procesada', `Se descontaron con éxito ${targetInstallments.length} cuotas correspondientes a la nómina de esta quincena.`);
      await fetchData();
    } catch (err: any) {
      console.error(err);
      addNotification('error', 'Fallo de Cobro', err.message || 'Error de base de datos');
    } finally {
      setIsProcessingPayroll(false);
    }
  };

  // --- ADMIN: EXPORTAR CSV DE DESCUENTOS ---
  const handleExportPayrollCSV = () => {
    if (!payrollFilterDate) return;
    
    const targetInstallments = installments.filter(
      i => i.fecha_cobro === payrollFilterDate && i.estatus === 'Pendiente'
    );

    if (targetInstallments.length === 0) {
      addNotification('warning', 'Exportación Vacía', 'No hay cuotas pendientes para esta nómina, el reporte estará vacío.');
      return;
    }

    const headers = [
      'Trabajador',
      'Cedula',
      'Cargo',
      'Salario Base (USD)',
      'Cuota Financiada (USD)',
      'Tasa BCV Aplicada',
      'Descuento Nomina (VES)',
      'Fecha Cobro',
      'Proveedor de la Compra'
    ];

    const rows = targetInstallments.map(i => {
      const t = i.transacciones_credicrc;
      const w = t?.trabajadores_crc;
      const p = t?.proveedores_aliados;
      const vesAmount = (i.monto_usd * bcvRate).toFixed(2);
      
      return [
        `"${w?.nombre || 'N/A'}"`,
        `"${w?.cedula || 'N/A'}"`,
        `"${w?.cargo || 'N/A'}"`,
        w?.salario_base || 0,
        i.monto_usd,
        bcvRate,
        vesAmount,
        i.fecha_cobro,
        `"${p?.nombre || 'N/A'}"`
      ];
    });

    const csvContent = "\uFEFF" + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Deducciones_CrediCRC_${payrollFilterDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    addNotification('success', 'Reporte Descargado', `Reporte de nómina para el ${payrollFilterDate} guardado como archivo CSV.`);
  };

  // --- CÁLCULOS ADMINISTRATIVOS ---
  const totalVolume = transactions
    .filter(t => t.estatus === 'Aprobada' || t.estatus === 'Completada')
    .reduce((sum, t) => sum + (t.monto_usd - t.monto_inicial_pagado_usd), 0);

  const totalCommissions = transactions
    .filter(t => t.estatus === 'Aprobada' || t.estatus === 'Completada')
    .reduce((sum, t) => sum + t.comision_monto_usd, 0);

  const pendingDeductionsCount = installments.filter(i => i.estatus === 'Pendiente').length;
  const delinquentDeductionsCount = installments.filter(
    i => i.estatus === 'Vencido' || (i.estatus === 'Pendiente' && new Date(i.fecha_cobro) < new Date())
  ).length;

  const currentWorker = workers.find(w => w.id === activeWorkerId);
  const currentWorkerTransactions = transactions.filter(t => t.trabajador_id === activeWorkerId);
  const currentWorkerInstallments = installments.filter(
    i => i.transacciones_credicrc?.trabajador_id === activeWorkerId
  );

  const currentProvider = providers.find(p => p.id === activeProviderId);
  const currentProviderTransactions = transactions.filter(t => t.proveedor_id === activeProviderId);

  // Agrupar conciliación de proveedores
  const supplierReconciliation = providers.map(p => {
    const pTrans = transactions.filter(
      t => t.proveedor_id === p.id && (t.estatus === 'Aprobada' || t.estatus === 'Completada')
    );
    const totalVendido = pTrans.reduce((sum, t) => sum + t.monto_usd, 0);
    const totalComision = pTrans.reduce((sum, t) => sum + t.comision_monto_usd, 0);
    const netoPagar = totalVendido - totalComision;
    return {
      ...p,
      totalVendido,
      totalComision,
      netoPagar
    };
  });

  return (
    <div className="min-h-screen bg-[#f1f5f9] text-slate-800 flex flex-col antialiased">


      {/* --- NAVBAR DE ALTO IMPACTO (LIGHT THEME) --- */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm px-4 md:px-8 py-3.5 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {/* Logo del Colegio con fallback */}
          <div 
            onClick={() => setActiveRole('inicio')}
            className="shadow-md hover:scale-105 transition duration-300 p-1.5 bg-slate-50 rounded-xl border border-slate-100 cursor-pointer flex items-center justify-center"
          >
            {!logoError ? (
              <img 
                src="/logo.png" 
                alt="Logo Colegio" 
                className="h-16 w-auto object-contain" 
                onError={() => setLogoError(true)}
              />
            ) : (
              <SchoolLogo className="h-16 w-auto" />
            )}
          </div>
          <div className="border-l border-slate-200 pl-4 cursor-pointer" onClick={() => setActiveRole('inicio')}>
            <h1 className="text-2xl font-black tracking-tight text-[#002855] flex items-center gap-1">
              Credi<span className="text-[#E53935]">CRC</span>
            </h1>
            <p className="text-[10px] text-slate-500 tracking-wider font-extrabold uppercase">Ecosistema Financiero Digital</p>
          </div>
        </div>

        {/* SELECTOR DE ROLES CLARO */}
        <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
          {currentUser && (
            <div className="bg-[#002855]/5 border border-[#002855]/10 rounded-xl px-3.5 py-1.5 flex items-center gap-2 text-xs w-full md:w-auto justify-between md:justify-start">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="text-[#002855] font-bold">
                  {currentUser.nombre} <span className="text-slate-400 font-medium">({currentUser.rol === 'admin' ? 'Admin' : currentUser.rol === 'trabajador' ? 'Docente' : 'Comercio'})</span>
                </span>
              </div>
              <button 
                onClick={handleLogout}
                className="ml-2 bg-[#E53935]/10 text-[#E53935] hover:bg-[#E53935] hover:text-white transition px-2.5 py-1 rounded-md text-[10px] font-extrabold uppercase tracking-wider"
              >
                Salir
              </button>
            </div>
          )}

          <div className="bg-slate-100 p-1 rounded-xl border border-slate-200 flex flex-wrap gap-1 w-full md:w-auto shadow-inner">
            <button
              onClick={() => setActiveRole('inicio')}
              className={`flex-1 md:flex-initial px-4 py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all duration-300 ${
                activeRole === 'inicio'
                  ? 'bg-[#002855] text-white shadow-md'
                  : 'text-slate-600 hover:text-[#002855] hover:bg-slate-200/50'
              }`}
            >
              <Home size={14} className={activeRole === 'inicio' ? 'text-colegio-gold' : 'text-slate-500'} />
              Inicio
            </button>

            {(!currentUser || currentUser.rol === 'trabajador' || currentUser.rol === 'admin') && (
              <button
                onClick={() => setActiveRole('trabajador')}
                className={`flex-1 md:flex-initial px-4 py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all duration-300 ${
                  activeRole === 'trabajador'
                    ? 'bg-[#002855] text-white shadow-md'
                    : 'text-slate-600 hover:text-[#002855] hover:bg-slate-200/50'
                }`}
              >
                <User size={14} className={activeRole === 'trabajador' ? 'text-colegio-gold' : 'text-slate-500'} />
                Módulo Trabajador
              </button>
            )}

            {(!currentUser || currentUser.rol === 'proveedor' || currentUser.rol === 'admin') && (
              <button
                onClick={() => setActiveRole('proveedor')}
                className={`flex-1 md:flex-initial px-4 py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all duration-300 ${
                  activeRole === 'proveedor'
                    ? 'bg-[#002855] text-white shadow-md'
                    : 'text-slate-600 hover:text-[#002855] hover:bg-slate-200/50'
                }`}
              >
                <ShoppingBag size={14} className={activeRole === 'proveedor' ? 'text-[#64B5F6]' : 'text-slate-500'} />
                Módulo Proveedor
              </button>
            )}

            {(!currentUser || currentUser.rol === 'admin') && (
              <button
                onClick={() => setActiveRole('admin')}
                className={`flex-1 md:flex-initial px-4 py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all duration-300 ${
                  activeRole === 'admin'
                    ? 'bg-[#002855] text-white shadow-md'
                    : 'text-slate-600 hover:text-[#002855] hover:bg-slate-200/50'
                }`}
              >
                <Sliders size={14} className={activeRole === 'admin' ? 'text-[#E53935]' : 'text-slate-500'} />
                Panel Colegio
              </button>
            )}
          </div>
        </div>
      </header>

      {/* --- CONTENIDO PRINCIPAL --- */}
      <main className="flex-1 p-4 md:p-6 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {isLoading ? (
          <div className="col-span-1 lg:col-span-4 flex flex-col items-center justify-center py-24 gap-3">
            <RefreshCw className="animate-spin text-[#64B5F6] h-12 w-12" />
            <p className="text-slate-500 text-sm font-semibold">Cargando base de datos escolar...</p>
          </div>
        ) : activeRole === 'inicio' ? (
          /* Welcome Landing Page */
          <div className="col-span-1 lg:col-span-4 space-y-8 py-6">
            {/* Hero Banner */}
            <div className="relative overflow-hidden bg-gradient-to-r from-[#002855] via-[#0b3c70] to-[#002855] text-white rounded-3xl p-8 md:p-12 shadow-xl border border-[#001f42] flex flex-col md:flex-row items-center justify-between gap-8 animate-fade-in text-left">
              {/* Background decorative elements */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-[#D4AF37] opacity-10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
              <div className="absolute bottom-0 left-0 w-64 h-64 bg-[#64B5F6] opacity-10 rounded-full blur-3xl -ml-16 -mb-16 pointer-events-none"></div>
              
              <div className="space-y-4 max-w-2xl relative z-10">
                <span className="bg-[#D4AF37]/20 border border-[#D4AF37]/30 text-[#D4AF37] font-bold text-xs px-3.5 py-1.5 rounded-full uppercase tracking-wider">
                  Plataforma Oficial BNPL
                </span>
                <h2 className="text-3xl md:text-4xl font-black tracking-tight leading-tight">
                  {landingConfig.hero_title}
                </h2>
                <p className="text-slate-200 text-sm md:text-base font-medium leading-relaxed max-w-xl">
                  {landingConfig.hero_description}
                </p>
                
                {/* Status Pills */}
                <div className="flex flex-wrap items-center gap-4 pt-2 text-xs">
                  <div className="flex items-center gap-2 bg-black/20 border border-white/10 px-3.5 py-2 rounded-xl">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span className="font-semibold text-slate-300">Tasa Oficial BCV: <strong className="text-white">Bs. {bcvRate.toFixed(2)}</strong></span>
                  </div>
                  <div className="flex items-center gap-2 bg-black/20 border border-white/10 px-3.5 py-2 rounded-xl">
                    <Users size={14} className="text-[#64B5F6]" />
                    <span className="font-semibold text-slate-300">Personal Afiliado: <strong className="text-white">{workers.length}</strong></span>
                  </div>
                  <div className="flex items-center gap-2 bg-black/20 border border-white/10 px-3.5 py-2 rounded-xl">
                    <ShoppingBag size={14} className="text-[#D4AF37]" />
                    <span className="font-semibold text-slate-300">Comercios Aliados: <strong className="text-white">{providers.length}</strong></span>
                  </div>
                </div>
              </div>

              <div className="flex-shrink-0 relative z-10 bg-white/5 backdrop-blur-md p-6 rounded-2xl border border-white/10 shadow-inner max-w-sm w-full space-y-4">
                <div className="flex items-center gap-3">
                  <div className="bg-[#64B5F6]/10 p-2.5 rounded-xl border border-[#64B5F6]/20">
                    <TrendingUp className="text-[#64B5F6] h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Actividad de la Plataforma</h4>
                    <p className="text-lg font-black text-white">${totalVolume.toFixed(2)} USD</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 text-xs pt-2 border-t border-white/10">
                  <div>
                    <span className="text-slate-400 block font-semibold">Créditos Emitidos</span>
                    <strong className="text-white text-sm font-mono">{transactions.filter(t => t.estatus === 'Aprobada' || t.estatus === 'Completada').length}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-semibold">Cuotas Recaudadas</span>
                    <strong className="text-[#D4AF37] text-sm font-mono">{installments.filter(i => i.estatus === 'Cobrado').length} / {installments.length}</strong>
                  </div>
                </div>
              </div>
            </div>

            {/* Portal Selector Cards */}
            <div className="space-y-4 text-left">
              <div>
                <h3 className="text-lg font-black text-[#002855] tracking-tight">Selección de Portal de Acceso</h3>
                <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider">Elige tu rol para interactuar con la plataforma</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Card: Trabajador */}
                <div 
                  onClick={() => setActiveRole('trabajador')}
                  className="group cursor-pointer bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-xl hover:-translate-y-1 hover:border-[#002855]/30 transition-all duration-300 flex flex-col justify-between h-72"
                >
                  <div className="space-y-4">
                    <div className="bg-[#002855]/5 text-[#002855] group-hover:bg-[#002855] group-hover:text-white transition-all duration-300 p-4 rounded-2xl w-14 h-14 flex items-center justify-center border border-slate-100">
                      <User size={26} className="text-inherit" />
                    </div>
                    <div className="space-y-2">
                      <h4 className="text-base font-extrabold text-[#002855] transition-colors">{landingConfig.portal_trabajador_title}</h4>
                      <p className="text-xs text-slate-500 leading-relaxed font-semibold">
                        {landingConfig.portal_trabajador_description}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-bold text-[#002855] border-t border-slate-100 pt-4 mt-auto">
                    <span>Ingresar al Portal</span>
                    <span className="group-hover:translate-x-1.5 transition-transform duration-300">&rarr;</span>
                  </div>
                </div>

                {/* Card: Proveedor */}
                <div 
                  onClick={() => setActiveRole('proveedor')}
                  className="group cursor-pointer bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-xl hover:-translate-y-1 hover:border-[#64B5F6]/30 transition-all duration-300 flex flex-col justify-between h-72"
                >
                  <div className="space-y-4">
                    <div className="bg-[#64B5F6]/5 text-[#64B5F6] group-hover:bg-[#64B5F6] group-hover:text-white transition-all duration-300 p-4 rounded-2xl w-14 h-14 flex items-center justify-center border border-slate-100">
                      <ShoppingBag size={26} className="text-inherit" />
                    </div>
                    <div className="space-y-2">
                      <h4 className="text-base font-extrabold text-[#002855] transition-colors">{landingConfig.portal_proveedor_title}</h4>
                      <p className="text-xs text-slate-500 leading-relaxed font-semibold">
                        {landingConfig.portal_proveedor_description}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-bold text-[#64B5F6] border-t border-slate-100 pt-4 mt-auto">
                    <span>Ingresar al Punto de Venta</span>
                    <span className="group-hover:translate-x-1.5 transition-transform duration-300">&rarr;</span>
                  </div>
                </div>

                {/* Card: Admin */}
                <div 
                  onClick={() => setActiveRole('admin')}
                  className="group cursor-pointer bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-xl hover:-translate-y-1 hover:border-[#E53935]/30 transition-all duration-300 flex flex-col justify-between h-72"
                >
                  <div className="space-y-4">
                    <div className="bg-[#E53935]/5 text-[#E53935] group-hover:bg-[#E53935] group-hover:text-white transition-all duration-300 p-4 rounded-2xl w-14 h-14 flex items-center justify-center border border-slate-100">
                      <Sliders size={26} className="text-inherit" />
                    </div>
                    <div className="space-y-2">
                      <h4 className="text-base font-extrabold text-[#002855] transition-colors">{landingConfig.portal_admin_title}</h4>
                      <p className="text-xs text-slate-500 leading-relaxed font-semibold">
                        {landingConfig.portal_admin_description}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-bold text-[#E53935] border-t border-slate-100 pt-4 mt-auto">
                    <span>Ingresar al Panel de Control</span>
                    <span className="group-hover:translate-x-1.5 transition-transform duration-300">&rarr;</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Informative footer */}
            <div className="bg-slate-100 border border-slate-200 p-6 rounded-2xl grid grid-cols-1 md:grid-cols-2 gap-6 text-xs text-slate-600 font-semibold text-left">
              <div className="space-y-2">
                <h5 className="font-extrabold text-[#002855] uppercase tracking-wider text-[10px]">{landingConfig.politicas_financiamiento_title}</h5>
                <p className="leading-relaxed text-[11px]">
                  {landingConfig.politicas_financiamiento_description}
                </p>
              </div>
              <div className="space-y-2 border-t md:border-t-0 md:border-l border-slate-200 pt-4 md:pt-0 md:pl-6">
                <h5 className="font-extrabold text-[#002855] uppercase tracking-wider text-[10px]">{landingConfig.estabilidad_seguridad_title}</h5>
                <p className="leading-relaxed text-[11px]">
                  {landingConfig.estabilidad_seguridad_description}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* COLUMNA PRINCIPAL DE ROLES (Toma 3 columnas) */}
            <div className="col-span-1 lg:col-span-3 space-y-6">
              
              {/* ==================== 🧑‍🏫 MÓDULO TRABAJADOR ==================== */}
              {activeRole === 'trabajador' && (
                currentUser && (currentUser.rol === 'trabajador' || currentUser.rol === 'admin') ? (
                  <div className="space-y-6 animate-fade-in">
                    
                    {/* Selector de Trabajador - Solo visible para Admin */}
                    {currentUser.rol === 'admin' && (
                      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Ficha de Personal Activo (Modo Admin)</h2>
                          <p className="text-sm text-slate-600 font-medium">Selecciona un docente o administrativo para simular su panel:</p>
                        </div>
                        <select
                          value={activeWorkerId}
                          onChange={(e) => {
                            setActiveWorkerId(e.target.value);
                            setActiveQR(null);
                            setWPurchaseAmount('50');
                            setWDownPayment('15');
                          }}
                          className="bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-4 text-sm text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-[#64B5F6] cursor-pointer"
                        >
                          {workers.map(w => (
                            <option key={w.id} value={w.id}>
                              {w.nombre} ({w.cargo})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {currentWorker ? (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      
                      {/* Tarjeta de Trabajador (Diseño de tarjeta de crédito) */}
                      <div className="md:col-span-1 bg-gradient-to-br from-[#002855] via-[#003775] to-[#073B73] p-6 rounded-2xl border border-[#002855] shadow-lg relative overflow-hidden flex flex-col justify-between min-h-[300px]">
                        {/* Marca de agua circular del escudo en el fondo */}
                        <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-white/5 rounded-full border-8 border-white/5"></div>
                        <div className="absolute top-4 right-4 bg-white/10 p-2 rounded-xl">
                          <ShieldCheck className="text-white h-5 w-5" />
                        </div>
                        
                        <div>
                          <span className="text-[9px] bg-white/20 text-white font-bold py-1 px-3 rounded-full uppercase tracking-wider">
                            {currentWorker.cargo}
                          </span>
                          <div className="mt-5">
                            <h3 className="text-lg font-bold text-white tracking-wide leading-tight">{currentWorker.nombre}</h3>
                            <p className="text-xs text-blue-200 mt-1 font-mono">CI: {currentWorker.cedula}</p>
                            <p className="text-[11px] text-blue-200 font-medium">Antigüedad: {currentWorker.antiguedad_anios} años en la institución</p>
                          </div>
                        </div>

                        <div className="border-t border-white/10 pt-4 mt-4 space-y-2">
                          <div className="flex justify-between text-xs text-blue-100">
                            <span>Sueldo Mensual Base:</span>
                            <span className="font-bold text-white font-mono">${currentWorker.salario_base.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-xs text-blue-100">
                            <span>Límite de Crédito Total:</span>
                            <span className="font-bold text-white font-mono">${currentWorker.limite_total.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-xs text-blue-100">
                            <span>Cupo Disponible:</span>
                            <span className="font-bold text-green-300 font-mono">${currentWorker.limite_disponible.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-[11px] text-amber-200">
                            <span>Capacidad Quincenal (30%):</span>
                            <span className="font-bold font-mono">${(currentWorker.salario_base * 0.15).toFixed(2)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Progreso de cupo en arco claro */}
                      <div className="md:col-span-1 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center justify-center text-center">
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Crédito Disponible</h4>
                        
                        <div className="relative w-40 h-40 flex items-center justify-center">
                          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                            <circle
                              cx="50"
                              cy="50"
                              r="40"
                              stroke="#e2e8f0"
                              strokeWidth="8"
                              fill="transparent"
                            />
                            <circle
                              cx="50"
                              cy="50"
                              r="40"
                              stroke={currentWorker.limite_disponible > 0 ? "#64B5F6" : "#E53935"}
                              strokeWidth="8"
                              fill="transparent"
                              strokeDasharray={`${2 * Math.PI * 40}`}
                              strokeDashoffset={`${2 * Math.PI * 40 * (1 - (currentWorker.limite_total > 0 ? currentWorker.limite_disponible / currentWorker.limite_total : 0))}`}
                              strokeLinecap="round"
                              className="transition-all duration-500 ease-out"
                            />
                          </svg>
                          <div className="absolute flex flex-col items-center justify-center">
                            <span className="text-3xl font-extrabold text-slate-800 font-mono">${currentWorker.limite_disponible.toFixed(0)}</span>
                            <span className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">de ${currentWorker.limite_total.toFixed(0)}</span>
                          </div>
                        </div>

                        <p className="text-[11px] text-slate-500 mt-4 leading-normal">
                          Tu cupo disponible se calcula como el límite total menos la deuda acumulada de tus cuotas pendientes.
                        </p>
                      </div>

                      {/* Generador de QR Claro */}
                      <div className="md:col-span-1 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
                        <div>
                          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                            <QrCode size={14} className="text-[#64B5F6]" />
                            Nueva Compra CrediCRC
                          </h4>
                          
                          <div className="space-y-3">
                            <div>
                              <label className="text-[10px] text-slate-500 block mb-1 font-bold">MONTO TOTAL COMPRA ($)</label>
                              <input
                                type="number"
                                value={wPurchaseAmount}
                                onChange={(e) => setWPurchaseAmount(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#64B5F6] font-mono font-bold"
                              />
                            </div>
                            
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-[10px] text-slate-500 block mb-1 font-bold">PAGO INICIAL ($)</label>
                                <input
                                  type="number"
                                  value={wDownPayment}
                                  onChange={(e) => setWDownPayment(e.target.value)}
                                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#64B5F6] font-mono font-bold"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] text-slate-500 block mb-1 font-bold">PLAZO RESTANTE</label>
                                <select
                                  value={wDays}
                                  onChange={(e) => setWDays(parseInt(e.target.value))}
                                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#64B5F6] font-bold cursor-pointer"
                                >
                                  <option value={7}>07 Días</option>
                                  <option value={15}>15 Días</option>
                                </select>
                              </div>
                            </div>

                            {/* Desglose claro */}
                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs space-y-1">
                              <div className="flex justify-between text-slate-600">
                                <span>Inicial a pagar en tienda:</span>
                                <span className="font-bold text-slate-800">${parseFloat(wDownPayment || '0').toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between text-slate-600">
                                <span>Financiado (Cuota Única):</span>
                                <span className="font-bold text-[#002855]">${(parseFloat(wPurchaseAmount || '0') - parseFloat(wDownPayment || '0')).toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between text-slate-500 border-t border-slate-200 pt-1 mt-1 font-semibold">
                                <span>Equiv. Bs. (BCV {bcvRate}):</span>
                                <span className="text-[#E53935]">Bs. {((parseFloat(wPurchaseAmount || '0') - parseFloat(wDownPayment || '0')) * bcvRate).toFixed(2)}</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <button
                            onClick={handleGenerateQR}
                            className="w-full mt-4 bg-gradient-to-r from-[#002855] to-[#073B73] hover:from-[#073B73] hover:to-[#002855] text-white text-xs font-bold py-3 px-4 rounded-xl shadow-md transition duration-300 flex items-center justify-center gap-1.5"
                          >
                            <QrCode size={14} className="text-colegio-gold" />
                            Generar QR CrediCRC
                          </button>

                          {activeQR && activeQR.workerId === currentWorker.id && !showQRModal && (
                            <button
                              onClick={() => setShowQRModal(true)}
                              className="w-full bg-slate-100 hover:bg-slate-200 text-[#002855] text-xs font-bold py-2.5 px-4 rounded-xl border border-slate-200 shadow-sm transition duration-300 flex items-center justify-center gap-1.5"
                            >
                              <QrCode size={14} className="text-[#002855]" />
                              Ver Código QR Activo
                            </button>
                          )}
                        </div>
                      </div>

                    </div>
                  ) : null}

                  {/* Modal de QR Claro */}
                  {showQRModal && activeQR && (
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-md flex flex-col md:flex-row items-center gap-6 animate-fade-in">
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-inner flex flex-col items-center">
                        <svg className="w-32 h-32 text-[#002855]" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M2 2h6v6H2V2zm1 1v4h4V3H3zm12-1h6v6h-6V2zm1 1v4h4V3h-4zM2 16h6v6H2v-6zm1 1v4h4v-4H3zm10-2h2v2h-2v-2zm2 2h2v2h-2v-2zm-2 2h2v2h-2v-2zm6-2h2v6h-2v-6zm-4 4h2v2h-2v-2zm2-4h2v2h-2v-2zm-8-3h2v2H7v-2zm2 2h2v2H9v-2zm-2 2h2v2H7v-2zm8-5h2v2h-2V9zm-2 2h2v2h-2v-2zm4-2h2v2h-2V9zm-2 2h2v2h-2v-2zm-4 4h2v2h-2v-2zm-2-2h2v2H9v-2zm2 2h2v2h-2v-2zm-4-4h2v2H7v-2zm2 2h2v2H9v-2zm-2 2h2v2H7v-2zm8-9h2v2h-2V6zm-2 2h2v2h-2V8zm4-2h2v2h-2V6zm-2 2h2v2h-2V8z" />
                        </svg>
                        <div className="text-xs text-slate-500 font-mono font-bold mt-2">{activeQR.token}</div>
                      </div>
                      
                      <div className="flex-1 space-y-3 text-center md:text-left">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                          <h4 className="text-[#002855] font-black text-md">Código QR Listo para Escaneo</h4>
                          <span className="text-xs font-bold text-[#E53935] bg-red-50 border border-red-100 py-1 px-3 rounded-full">
                            Expira en: {Math.floor(qrCountdown / 60)}:{(qrCountdown % 60).toString().padStart(2, '0')}
                          </span>
                        </div>
                        
                        <p className="text-xs text-slate-600 leading-normal">
                          Muestra este código QR al comercio para realizar tu consumo. La tienda validará tu saldo restante y la quincena de cobro de forma automatizada.
                        </p>
                        
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs inline-block text-left w-full">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div>
                              <span className="text-[10px] text-slate-400 block font-bold">CLIENTE</span>
                              <strong className="text-slate-800">{activeQR.workerName}</strong>
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-400 block font-bold">MONTO TOTAL</span>
                              <strong className="text-slate-800 font-mono">${activeQR.montoUsd.toFixed(2)}</strong>
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-400 block font-bold">PAGO INICIAL</span>
                              <strong className="text-green-600 font-mono">${activeQR.montoInicialUsd.toFixed(2)}</strong>
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-400 block font-bold">CUOTA RESTANTE</span>
                              <strong className="text-[#002855] font-mono">${(activeQR.montoUsd - activeQR.montoInicialUsd).toFixed(2)}</strong>
                            </div>
                          </div>
                        </div>
                        <div className="flex justify-end">
                          <button
                            onClick={() => {
                              setShowQRModal(false);
                            }}
                            className="text-xs text-slate-500 hover:text-slate-800 font-bold px-4 py-2 rounded-lg transition"
                          >
                            Ocultar QR
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Cuotas y Transacciones */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    
                    {/* Cuota Pendiente Calendario */}
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-1.5">
                        <Calendar size={14} className="text-[#64B5F6]" />
                        Próximos Descuentos de Nómina
                      </h4>

                      {currentWorkerInstallments.length === 0 ? (
                        <p className="text-xs text-slate-400 text-center py-8">No tienes cuotas de pago pendientes registradas.</p>
                      ) : (
                        <div className="space-y-3">
                          {currentWorkerInstallments.map(inst => {
                            const vesValue = inst.monto_usd * bcvRate;
                            const isPaid = inst.estatus === 'Cobrado';
                            return (
                              <div
                                key={inst.id}
                                className={`p-3.5 rounded-xl border flex items-center justify-between text-xs transition ${
                                  isPaid 
                                    ? 'bg-slate-50/60 border-slate-100 opacity-60' 
                                    : 'bg-white border-slate-200 hover:border-slate-300'
                                }`}
                              >
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-slate-800 font-mono">
                                      ${inst.monto_usd.toFixed(2)}
                                    </span>
                                    <span className="text-slate-400">&rarr;</span>
                                    <span className="text-[#E53935] font-bold font-mono">
                                      Bs. {vesValue.toFixed(2)}
                                    </span>
                                  </div>
                                  <div className="text-[10px] text-slate-500 font-medium">
                                    Vencimiento: {new Date(inst.fecha_cobro).toLocaleDateString('es-VE', { day: 'numeric', month: 'long', year: 'numeric' })}
                                  </div>
                                </div>
                                <div className="text-right">
                                  <span className={`px-2.5 py-1 rounded-full text-[9px] font-extrabold uppercase tracking-wide border ${
                                    inst.estatus === 'Cobrado' 
                                      ? 'bg-green-50 text-green-600 border-green-200' 
                                      : 'bg-amber-50 text-amber-600 border-amber-200'
                                  }`}>
                                    {inst.estatus}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Historial de Compras */}
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-1.5">
                        <History size={14} className="text-[#64B5F6]" />
                        Historial de Compras CrediCRC
                      </h4>

                      {currentWorkerTransactions.length === 0 ? (
                        <p className="text-xs text-slate-400 text-center py-8">No has realizado consumos con CrediCRC.</p>
                      ) : (
                        <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
                          {currentWorkerTransactions.map(trans => (
                            <div key={trans.id} className="p-3.5 bg-white rounded-xl border border-slate-200 text-xs flex items-center justify-between hover:border-slate-300 transition">
                              <div>
                                <strong className="text-slate-800 block text-xs">
                                  {trans.proveedores_aliados?.nombre || 'Comercio Aliado'}
                                </strong>
                                <span className="text-[10px] text-slate-500 block mt-0.5">
                                  {new Date(trans.fecha_transaccion).toLocaleDateString('es-VE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                              <div className="text-right space-y-1">
                                <div className="font-bold text-slate-800 font-mono">
                                  ${trans.monto_usd.toFixed(2)}
                                </div>
                                <div className="text-[9px] text-slate-400 font-bold">
                                  Inicial: ${trans.monto_inicial_pagado_usd.toFixed(0)} ({trans.dias_financiamiento}d)
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                  </div>

                </div>
                ) : (
                  /* Login/Register Card for Worker */
                  <div className="max-w-md mx-auto my-12 bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden animate-fade-in text-left">
                    {/* Header */}
                    <div className="bg-[#002855] text-white p-6 text-center space-y-2 relative">
                      <div className="absolute top-4 right-4 bg-white/10 text-white text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">
                        Módulo Trabajador
                      </div>
                      <div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-2">
                        <User className="h-6 w-6 text-colegio-gold" />
                      </div>
                      <h3 className="text-lg font-black">Portal del Trabajador</h3>
                      <p className="text-xs text-slate-200 font-semibold">Ingresa para consultar tu saldo y generar tu QR de pago</p>
                    </div>
                    
                    {/* Tabs Login / Register */}
                    <div className="flex border-b border-slate-200 bg-slate-50">
                      <button 
                        type="button"
                        onClick={() => setAuthMode('login')}
                        className={`flex-1 py-3 text-center text-xs font-bold transition-all ${
                          authMode === 'login' 
                            ? 'bg-white border-b-2 border-[#002855] text-[#002855]' 
                            : 'text-slate-500 hover:text-slate-700'
                        }`}
                      >
                        Iniciar Sesión
                      </button>
                      <button 
                        type="button"
                        onClick={() => {
                          setAuthMode('register');
                          setAuthRoleSelection('trabajador');
                        }}
                        className={`flex-1 py-3 text-center text-xs font-bold transition-all ${
                          authMode === 'register' 
                            ? 'bg-white border-b-2 border-[#002855] text-[#002855]' 
                            : 'text-slate-500 hover:text-slate-700'
                        }`}
                      >
                        Registrarse
                      </button>
                    </div>

                    {/* Form */}
                    <form onSubmit={authMode === 'login' ? handleLogin : handleRegister} className="p-6 space-y-4">
                      {authMode === 'register' && (
                        <>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase block">Nombre Completo</label>
                            <input 
                              type="text" 
                              required
                              value={authName}
                              onChange={(e) => setAuthName(e.target.value)}
                              placeholder="Ej: Prof. Alejandro Silva"
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-none focus:border-[#002855] transition font-semibold"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase block">Cédula de Identidad</label>
                              <input 
                                type="text" 
                                required
                                value={authWorkerCedula}
                                onChange={(e) => setAuthWorkerCedula(e.target.value)}
                                placeholder="Ej: V-15.555.444"
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-none focus:border-[#002855] transition font-semibold"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase block">Cargo</label>
                              <select
                                value={authWorkerCargo}
                                onChange={(e) => setAuthWorkerCargo(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-none focus:border-[#002855] transition font-bold"
                              >
                                <option value="Docente de Primaria">Docente de Primaria</option>
                                <option value="Docente de Bachillerato">Docente de Bachillerato</option>
                                <option value="Personal Administrativo">Personal Administrativo</option>
                                <option value="Personal de Mantenimiento">Personal de Mantenimiento</option>
                                <option value="Coordinador / Directivo">Coordinador / Directivo</option>
                              </select>
                            </div>
                          </div>
                        </>
                      )}
                      
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase block">Correo Electrónico</label>
                        <input 
                          type="email" 
                          required
                          value={authEmail}
                          onChange={(e) => setAuthEmail(e.target.value)}
                          placeholder="correo@ejemplo.com"
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-none focus:border-[#002855] transition font-semibold"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase block">Contraseña</label>
                        <input 
                          type="password" 
                          required
                          value={authPassword}
                          onChange={(e) => setAuthPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-none focus:border-[#002855] transition font-semibold"
                        />
                      </div>

                      <button 
                        type="submit" 
                        disabled={isAuthSubmitting}
                        className="w-full bg-[#002855] text-white hover:bg-[#0b3c70] transition p-3 rounded-lg text-xs font-bold shadow-md hover:shadow-lg disabled:opacity-50 mt-2 flex items-center justify-center gap-2"
                      >
                        {isAuthSubmitting && <RefreshCw size={12} className="animate-spin" />}
                        {authMode === 'login' ? 'Iniciar Sesión' : 'Enviar Solicitud de Registro'}
                      </button>
                    </form>
                    
                    <div className="bg-slate-50 px-6 py-4 border-t border-slate-100 text-[10px] text-slate-500 text-center font-semibold">
                      {authMode === 'login' 
                        ? '¿No tienes cuenta? Haz clic en la pestaña "Registrarse" para enviar una solicitud de afiliación.'
                        : 'Tu cuenta se registrará con estatus "Pendiente" y deberá ser habilitada por el Administrador del colegio en su panel.'
                      }
                    </div>
                  </div>
                )
              )}


              {/* ==================== 🏪 MÓDULO PROVEEDOR ==================== */}
              {activeRole === 'proveedor' && (
                currentUser && (currentUser.rol === 'proveedor' || currentUser.rol === 'admin') ? (
                  <div className="space-y-6 animate-fade-in">
                    
                    {/* Selector de Comercio Aliado - Solo visible para Admin */}
                    {currentUser.rol === 'admin' && (
                      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Punto de Venta Aliado (POS) (Modo Admin)</h2>
                          <p className="text-sm text-slate-600 font-medium">Actuar como el siguiente establecimiento comercial:</p>
                        </div>
                        <select
                          value={activeProviderId}
                          onChange={(e) => {
                            setActiveProviderId(e.target.value);
                            setScannedQR(null);
                            setValidationResult(null);
                          }}
                          className="bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-4 text-sm text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-[#64B5F6] cursor-pointer"
                        >
                          {providers.map(p => (
                            <option key={p.id} value={p.id}>
                              {p.nombre} ({p.categoria})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {currentProvider ? (
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                      
                      {/* Teclado y Entrada del POS Claro */}
                      <div className="md:col-span-5 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between min-h-[350px]">
                        <div>
                          <div className="flex justify-between items-center mb-4">
                            <span className="text-[10px] font-bold text-[#002855] bg-blue-50 border border-blue-100 py-1 px-3 rounded-full uppercase tracking-wider">
                              {currentProvider.categoria}
                            </span>
                            <span className="text-[10px] text-slate-500 font-bold">Comisión: {(parseFloat(currentProvider.comision_colegio as string) * 100).toFixed(1)}%</span>
                          </div>

                          <h3 className="text-slate-800 font-black text-sm mb-1">{currentProvider.nombre}</h3>
                          <p className="text-[11px] text-slate-500 mb-4 font-semibold">Monto del consumo a procesar por crédito.</p>

                          {/* Entrada de Monto Grande */}
                          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-center relative shadow-inner">
                            <span className="absolute top-2 left-3 text-xs text-slate-400 font-bold">$ USD</span>
                            <span className="text-4xl font-black text-slate-800 font-mono">
                              {posAmount}
                            </span>
                          </div>

                          {/* Detalles del Cobro */}
                          <div className="mt-4 space-y-2 text-xs border-t border-slate-100 pt-3">
                            <div className="flex justify-between text-slate-600">
                              <span>Monto Inicial a Cobrar:</span>
                              <span className="font-bold text-slate-800">${parseFloat(posDownPayment).toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-slate-600">
                              <span>Monto a Financiar (Cuota):</span>
                              <span className="font-bold text-[#002855]">${(parseFloat(posAmount) - parseFloat(posDownPayment)).toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-slate-400">
                              <span>Retención Comisión Colegio:</span>
                              <span>-${(parseFloat(posAmount) * parseFloat(currentProvider.comision_colegio as string)).toFixed(2)}</span>
                            </div>
                          </div>
                        </div>

                        {/* Simulación del Escáner */}
                        <div className="mt-6">
                          <button
                            onClick={handleSimulateScan}
                            className="w-full bg-[#002855] hover:bg-[#073B73] text-white text-xs font-bold py-3.5 px-4 rounded-xl shadow-md transition flex items-center justify-center gap-2"
                          >
                            <QrCode size={14} className="text-colegio-gold" />
                            Escanear / Detectar QR de Trabajador
                          </button>
                        </div>
                      </div>

                      {/* Pantalla del Escáner y Resultados */}
                      <div className="md:col-span-7 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
                        <div>
                          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Consola del Escáner de Compras</h4>

                          {!scannedQR ? (
                            <div className="border-2 border-dashed border-slate-200 rounded-2xl py-14 flex flex-col items-center justify-center text-slate-400 gap-3">
                              <QrCode size={44} className="stroke-1 animate-pulse text-slate-300" />
                              <p className="text-xs font-semibold">Esperando lectura de código QR del trabajador...</p>
                            </div>
                          ) : (
                            <div className="space-y-4">
                              {/* Tarjeta de QR detectado */}
                              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-[9px] text-green-600 bg-green-50 border border-green-200 py-0.5 px-2.5 rounded font-extrabold uppercase tracking-wider">QR VÁLIDO</span>
                                  <span className="text-[10px] text-slate-500 font-mono font-bold">{scannedQR.token}</span>
                                </div>
                                <div className="grid grid-cols-2 gap-4 text-xs pt-1">
                                  <div>
                                    <span className="text-slate-400 block font-bold">CLIENTE</span>
                                    <strong className="text-slate-800">{scannedQR.workerName}</strong>
                                  </div>
                                  <div>
                                    <span className="text-slate-400 block font-bold">MONTO TOTAL</span>
                                    <strong className="text-slate-800 font-mono">${scannedQR.montoUsd.toFixed(2)}</strong>
                                  </div>
                                  <div>
                                    <span className="text-slate-400 block font-bold">PAGO INICIAL</span>
                                    <strong className="text-slate-800 font-mono">${scannedQR.montoInicialUsd.toFixed(2)}</strong>
                                  </div>
                                  <div>
                                    <span className="text-slate-400 block font-bold">PLAZO FINANCIADO</span>
                                    <strong className="text-slate-800 font-mono">{scannedQR.diasFinanciamiento} días</strong>
                                  </div>
                                </div>
                              </div>

                              {/* Estado de validación en tiempo real */}
                              {isValidating ? (
                                <div className="flex items-center gap-2 text-xs text-slate-500 py-2">
                                  <RefreshCw size={14} className="animate-spin text-[#64B5F6]" />
                                  <span>Evaluando capacidad crediticia y límite del 30% en base de datos...</span>
                                </div>
                              ) : validationResult ? (
                                <div className={`p-4 rounded-xl border text-xs flex gap-3 ${
                                  validationResult.aprobado 
                                    ? 'bg-green-50 border-green-200 text-green-800' 
                                    : 'bg-red-50 border-red-200 text-red-800'
                                }`}>
                                  <div className="mt-0.5">
                                    {validationResult.aprobado ? (
                                      <CheckCircle2 className="text-green-600 h-5 w-5" />
                                    ) : (
                                      <AlertCircle className="text-red-600 h-5 w-5" />
                                    )}
                                  </div>
                                  <div className="space-y-1 flex-1">
                                    <strong className="block font-black text-sm">
                                      {validationResult.aprobado ? 'Crédito Pre-Aprobado' : 'Crédito Denegado'}
                                    </strong>
                                    <p className="text-slate-600 leading-relaxed text-[11px] font-medium">{validationResult.mensaje}</p>
                                    
                                    {validationResult.aprobado && (
                                      <div className="mt-2 border-t border-slate-200 pt-2 grid grid-cols-2 gap-2 text-[10px] text-slate-500">
                                        <div>
                                          Cuota Restante a Financiar: <strong className="text-green-600">${validationResult.cuota_restante.toFixed(2)}</strong>
                                        </div>
                                        <div>
                                          Capacidad Máxima Permitida: <strong className="text-slate-700">${validationResult.limite_quincenal_max.toFixed(2)}</strong>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          )}
                        </div>

                        {/* Acciones */}
                        {scannedQR && validationResult && (
                          <div className="flex gap-3 mt-6">
                            <button
                              onClick={() => {
                                setScannedQR(null);
                                setValidationResult(null);
                                setPosAmount('0');
                                setPosDownPayment('0');
                              }}
                              className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold py-2.5 px-4 rounded-xl transition"
                            >
                              Rechazar / Limpiar
                            </button>
                            <button
                              disabled={!validationResult.aprobado || isProcessingPurchase}
                              onClick={handleProcessPurchase}
                              className={`flex-1 text-xs font-extrabold py-2.5 px-4 rounded-xl shadow transition flex items-center justify-center gap-1.5 ${
                                validationResult.aprobado && !isProcessingPurchase
                                  ? 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-emerald-600 hover:to-green-500 text-white cursor-pointer'
                                  : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                              }`}
                            >
                              {isProcessingPurchase ? (
                                <>
                                  <RefreshCw size={14} className="animate-spin" />
                                  Registrando...
                                </>
                              ) : (
                                <>
                                  <Check size={14} />
                                  Procesar Venta y Crédito
                                </>
                              )}
                            </button>
                          </div>
                        )}
                      </div>

                    </div>
                  ) : null}

                  {/* Historial de Ventas del Establecimiento */}
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center justify-between">
                      <span>Ventas Recientes Realizadas (Financiadas)</span>
                      <span className="text-[10px] text-[#002855] bg-slate-50 border border-slate-200 py-1 px-3 rounded-full font-bold">Establecimiento Activo</span>
                    </h4>

                    {currentProviderTransactions.length === 0 ? (
                      <p className="text-xs text-slate-400 text-center py-8">No se registran ventas financiadas en este comercio.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left text-slate-600">
                          <thead className="text-[10px] bg-slate-50 text-slate-500 uppercase tracking-wider border-b border-slate-200">
                            <tr>
                              <th className="py-3 px-4">Trabajador</th>
                              <th className="py-3 px-4">Fecha</th>
                              <th className="py-3 px-4 text-right">Total ($)</th>
                              <th className="py-3 px-4 text-right">Inicial ($)</th>
                              <th className="py-3 px-4 text-right text-amber-600">Comisión Colegio ($)</th>
                              <th className="py-3 px-4 text-right text-green-600">Neto Comercio ($)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {currentProviderTransactions.map(trans => {
                              const neto = trans.monto_usd - trans.comision_monto_usd;
                              return (
                                <tr key={trans.id} className="hover:bg-slate-50/50 transition">
                                  <td className="py-3 px-4 font-bold text-slate-800">
                                    {trans.trabajadores_crc?.nombre || 'Docente/Admin'}
                                  </td>
                                  <td className="py-3 px-4 text-slate-500">
                                    {new Date(trans.fecha_transaccion).toLocaleDateString('es-VE')}
                                  </td>
                                  <td className="py-3 px-4 text-right font-mono font-bold">${trans.monto_usd.toFixed(2)}</td>
                                  <td className="py-3 px-4 text-right font-mono">${trans.monto_inicial_pagado_usd.toFixed(2)}</td>
                                  <td className="py-3 px-4 text-right text-amber-600 font-mono">${trans.comision_monto_usd.toFixed(2)}</td>
                                  <td className="py-3 px-4 text-right font-bold text-green-600 font-mono">${neto.toFixed(2)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                </div>
                ) : (
                  /* Login/Register Card for Provider */
                  <div className="max-w-md mx-auto my-12 bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden animate-fade-in text-left">
                    {/* Header */}
                    <div className="bg-[#002855] text-white p-6 text-center space-y-2 relative">
                      <div className="absolute top-4 right-4 bg-white/10 text-white text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">
                        Punto de Venta Proveedor
                      </div>
                      <div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-2">
                        <ShoppingBag className="h-6 w-6 text-[#64B5F6]" />
                      </div>
                      <h3 className="text-lg font-black">Punto de Venta Proveedor</h3>
                      <p className="text-xs text-slate-200 font-semibold">Ingresa para procesar compras y verificar límites de crédito</p>
                    </div>
                    
                    {/* Tabs Login / Register */}
                    <div className="flex border-b border-slate-200 bg-slate-50">
                      <button 
                        type="button"
                        onClick={() => setAuthMode('login')}
                        className={`flex-1 py-3 text-center text-xs font-bold transition-all ${
                          authMode === 'login' 
                            ? 'bg-white border-b-2 border-[#002855] text-[#002855]' 
                            : 'text-slate-500 hover:text-slate-700'
                        }`}
                      >
                        Iniciar Sesión
                      </button>
                      <button 
                        type="button"
                        onClick={() => {
                          setAuthMode('register');
                          setAuthRoleSelection('proveedor');
                        }}
                        className={`flex-1 py-3 text-center text-xs font-bold transition-all ${
                          authMode === 'register' 
                            ? 'bg-white border-b-2 border-[#002855] text-[#002855]' 
                            : 'text-slate-500 hover:text-slate-700'
                        }`}
                      >
                        Registrarse
                      </button>
                    </div>

                    {/* Form */}
                    <form onSubmit={authMode === 'login' ? handleLogin : handleRegister} className="p-6 space-y-4">
                      {authMode === 'register' && (
                        <>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase block">Nombre de Establecimiento</label>
                            <input 
                              type="text" 
                              required
                              value={authName}
                              onChange={(e) => setAuthName(e.target.value)}
                              placeholder="Ej: Carnicería El Toro de Oro"
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-none focus:border-[#002855] transition font-semibold"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase block">Categoría</label>
                              <select
                                value={authProviderCategoria}
                                onChange={(e) => setAuthProviderCategoria(e.target.value as 'Carnes' | 'Víveres')}
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-none focus:border-[#002855] transition font-bold"
                              >
                                <option value="Carnes">Carnes</option>
                                <option value="Víveres">Víveres</option>
                              </select>
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase block">Cuenta Enlace Bancario</label>
                              <input 
                                type="text" 
                                required
                                value={authProviderCuenta}
                                onChange={(e) => setAuthProviderCuenta(e.target.value)}
                                placeholder="Ej: Bco Central: 0102-..."
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-none focus:border-[#002855] transition font-semibold"
                              />
                            </div>
                          </div>
                        </>
                      )}
                      
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase block">Correo Electrónico</label>
                        <input 
                          type="email" 
                          required
                          value={authEmail}
                          onChange={(e) => setAuthEmail(e.target.value)}
                          placeholder="comercio@ejemplo.com"
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-none focus:border-[#002855] transition font-semibold"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase block">Contraseña</label>
                        <input 
                          type="password" 
                          required
                          value={authPassword}
                          onChange={(e) => setAuthPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-none focus:border-[#002855] transition font-semibold"
                        />
                      </div>

                      <button 
                        type="submit" 
                        disabled={isAuthSubmitting}
                        className="w-full bg-[#002855] text-white hover:bg-[#0b3c70] transition p-3 rounded-lg text-xs font-bold shadow-md hover:shadow-lg disabled:opacity-50 mt-2 flex items-center justify-center gap-2"
                      >
                        {isAuthSubmitting && <RefreshCw size={12} className="animate-spin" />}
                        {authMode === 'login' ? 'Iniciar Sesión' : 'Enviar Solicitud de Registro'}
                      </button>
                    </form>
                    
                    <div className="bg-slate-50 px-6 py-4 border-t border-slate-100 text-[10px] text-slate-500 text-center font-semibold">
                      {authMode === 'login' 
                        ? '¿No tienes cuenta? Haz clic en la pestaña "Registrarse" para enviar una solicitud de afiliación.'
                        : 'Tu cuenta se registrará con estatus "Pendiente" y deberá ser habilitada por el Administrador del colegio en su panel.'
                      }
                    </div>
                  </div>
                )
              )}


              {/* ==================== 🏢 PANEL ADMINISTRATIVO ==================== */}
              {activeRole === 'admin' && (
                currentUser && currentUser.rol === 'admin' ? (
                  <div className="space-y-6 animate-fade-in">
                    
                    {/* Grid de Métricas Principales */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    
                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                      <div className="space-y-1">
                        <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Volumen Financiado</span>
                        <h4 className="text-xl font-extrabold text-slate-800 font-mono">${totalVolume.toFixed(2)}</h4>
                        <p className="text-[9px] text-slate-500 font-semibold">Por cobrar vía nómina</p>
                      </div>
                      <div className="h-10 w-10 bg-blue-50 text-[#64B5F6] flex items-center justify-center rounded-xl shadow-inner border border-blue-100">
                        <TrendingUp size={20} />
                      </div>
                    </div>

                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                      <div className="space-y-1">
                        <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Comisión Colegio</span>
                        <h4 className="text-xl font-extrabold text-[#E53935] font-mono">${totalCommissions.toFixed(2)}</h4>
                        <p className="text-[9px] text-slate-500 font-semibold">Ganancia del colegio (3%-5%)</p>
                      </div>
                      <div className="h-10 w-10 bg-red-50 text-[#E53935] flex items-center justify-center rounded-xl border border-red-100">
                        <Percent size={20} />
                      </div>
                    </div>

                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                      <div className="space-y-1">
                        <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Deducciones por Cobrar</span>
                        <h4 className="text-xl font-extrabold text-amber-600 font-mono">{pendingDeductionsCount}</h4>
                        <p className="text-[9px] text-slate-500 font-semibold">Cuotas programadas activas</p>
                      </div>
                      <div className="h-10 w-10 bg-amber-50 text-amber-600 flex items-center justify-center rounded-xl border border-amber-100">
                        <Calendar size={20} />
                      </div>
                    </div>

                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                      <div className="space-y-1">
                        <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Cuotas Vencidas (Mora)</span>
                        <h4 className="text-xl font-extrabold text-red-600 font-mono">{delinquentDeductionsCount}</h4>
                        <p className="text-[9px] text-slate-500 font-semibold">Excedieron fecha quincena</p>
                      </div>
                      <div className="h-10 w-10 bg-red-50 text-red-600 flex items-center justify-center rounded-xl border border-red-100">
                        <AlertCircle size={20} />
                      </div>
                    </div>

                  </div>

                  {/* Tarjeta de Información de Credenciales de Prueba (Solo visible para Admin Logueado) */}
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-5 rounded-2xl border border-blue-100 flex flex-col md:flex-row md:items-center justify-between gap-4 text-left shadow-sm">
                    <div className="space-y-1">
                      <h4 className="text-xs font-black text-[#002855] uppercase tracking-wider">Cuentas de Prueba & Simulación (Modo Admin)</h4>
                      <p className="text-[11px] text-slate-600 font-semibold leading-relaxed">
                        Como administrador, puedes usar estas cuentas precargadas en tus navegadores o pestañas de incógnito para probar y simular la experiencia de otros roles:
                      </p>
                      <div className="flex flex-wrap gap-4 pt-1.5 text-[10px] text-slate-700 font-bold font-mono">
                        <div>
                          <span className="text-[#002855] block uppercase text-[8px] font-sans">Administración</span>
                          admin@credicrc.com / DirectivaCRC2026
                        </div>
                        <div className="border-l border-slate-200 pl-4">
                          <span className="text-[#E53935] block uppercase text-[8px] font-sans">Docente (Trabajador)</span>
                          maria@credicrc.com / 12345
                        </div>
                        <div className="border-l border-slate-200 pl-4">
                          <span className="text-[#64B5F6] block uppercase text-[8px] font-sans">Víveres (Proveedor)</span>
                          viveres@credicrc.com / 12345
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Sección: Solicitudes de Registro (Aprobación) */}
                  {systemUsers.filter(u => !u.aprobado).length > 0 && (
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4 text-left">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                        <div className="flex items-center gap-2">
                          <Users className="text-[#E53935] h-5 w-5" />
                          <h3 className="text-base font-black text-[#002855]">Solicitudes de Registro Pendientes</h3>
                        </div>
                        <span className="bg-[#E53935]/15 text-[#E53935] font-black text-xs px-3 py-1 rounded-full uppercase">
                          {systemUsers.filter(u => !u.aprobado).length} por aprobar
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-1 gap-4">
                        {systemUsers.filter(u => !u.aprobado).map(user => (
                          <div key={user.id} className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4 transition hover:border-[#E53935]/30">
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-2">
                                <span className="font-extrabold text-slate-800 text-sm">{user.nombre}</span>
                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase border ${
                                  user.rol === 'trabajador' 
                                    ? 'bg-blue-50 text-blue-600 border-blue-100' 
                                    : 'bg-green-50 text-green-600 border-green-100'
                                }`}>
                                  {user.rol === 'trabajador' ? 'Docente/Personal' : 'Comercio'}
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-500 font-semibold space-y-0.5">
                                <div>Email: <strong className="text-slate-700">{user.email}</strong></div>
                                {user.rol === 'trabajador' ? (
                                  <>
                                    <div>Cédula: <strong className="text-slate-700">{user.datos_registro?.cedula}</strong></div>
                                    <div>Cargo propuesto: <strong className="text-slate-700">{user.datos_registro?.cargo}</strong></div>
                                  </>
                                ) : (
                                  <>
                                    <div>Categoría: <strong className="text-slate-700">{user.datos_registro?.categoria}</strong></div>
                                    <div>Cuenta Enlace: <strong className="text-slate-700">{user.datos_registro?.cuenta_enlace}</strong></div>
                                  </>
                                )}
                              </div>
                            </div>
                            
                            {approvingUserId === user.id ? (
                              <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3 w-full md:w-80 text-xs shadow-sm">
                                <h4 className="font-extrabold text-[#002855] border-b border-slate-100 pb-1 mb-2">Configurar Parámetros</h4>
                                {user.rol === 'trabajador' ? (
                                  <div className="grid grid-cols-2 gap-2">
                                    <div className="space-y-0.5">
                                      <label className="text-[9px] font-bold text-slate-500 block uppercase">Sueldo Base ($)</label>
                                      <input 
                                        type="number"
                                        value={approveSalary}
                                        onChange={(e) => setApproveSalary(e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-200 rounded p-1.5 text-xs text-slate-800 font-bold"
                                      />
                                    </div>
                                    <div className="space-y-0.5">
                                      <label className="text-[9px] font-bold text-slate-500 block uppercase">Antigüedad (Años)</label>
                                      <input 
                                        type="number"
                                        value={approveAntiguedad}
                                        onChange={(e) => setApproveAntiguedad(e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-200 rounded p-1.5 text-xs text-slate-800 font-bold"
                                      />
                                    </div>
                                  </div>
                                ) : (
                                  <div className="space-y-0.5">
                                    <label className="text-[9px] font-bold text-slate-500 block uppercase">Comisión Colegio (3.0% - 5.0%)</label>
                                    <input 
                                      type="number"
                                      step="0.1"
                                      value={approveComision}
                                      onChange={(e) => setApproveComision(e.target.value)}
                                      className="w-full bg-slate-50 border border-slate-200 rounded p-1.5 text-xs text-slate-800 font-bold"
                                    />
                                  </div>
                                )}
                                <div className="flex justify-end gap-2 pt-1">
                                  <button 
                                    onClick={() => setApprovingUserId(null)}
                                    className="bg-slate-100 text-slate-600 font-bold px-3 py-1.5 rounded-lg text-[10px]"
                                  >
                                    Cancelar
                                  </button>
                                  <button 
                                    onClick={() => handleApproveUser(user.id)}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3.5 py-1.5 rounded-lg text-[10px] shadow"
                                  >
                                    Confirmar
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <button 
                                  onClick={async () => {
                                    if (window.confirm(`¿Está seguro de rechazar y eliminar la solicitud de ${user.nombre}?`)) {
                                      const { error } = await supabase.from('usuarios_credicrc').delete().eq('id', user.id);
                                      if (error) {
                                        addNotification('error', 'Error al Eliminar', error.message);
                                      } else {
                                        addNotification('success', 'Registro Rechazado', `La solicitud de ${user.nombre} ha sido rechazada.`);
                                        await fetchData();
                                      }
                                    }
                                  }}
                                  className="border border-slate-200 hover:bg-red-50 hover:text-red-600 hover:border-red-100 text-slate-500 transition px-4 py-2 rounded-xl text-xs font-bold"
                                >
                                  Rechazar
                                </button>
                                <button 
                                  onClick={() => {
                                    setApprovingUserId(user.id);
                                    if (user.rol === 'trabajador') {
                                      setApproveSalary('350');
                                      setApproveAntiguedad('3');
                                    } else {
                                      setApproveComision('4.0');
                                    }
                                  }}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white transition px-4.5 py-2 rounded-xl text-xs font-bold shadow-md hover:shadow-lg flex items-center gap-1"
                                >
                                  <Check size={14} />
                                  Aprobar Acceso
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Sección de Gestión de Trabajadores */}
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4 border-b border-slate-100 pb-3">
                      <div>
                        <h3 className="text-[#002855] font-black text-sm">Créditos de Trabajadores y Ajustes</h3>
                        <p className="text-xs text-slate-500 font-semibold">Modifica sueldos base y establece límites personalizados individuales o por cargo.</p>
                      </div>
                      
                      <div className="flex flex-col sm:flex-row items-center gap-2 w-full md:w-auto">
                        {/* Buscador */}
                        <div className="relative w-full sm:w-56">
                          <input
                            type="text"
                            placeholder="Buscar por nombre o cédula..."
                            value={adminSearchWorker}
                            onChange={(e) => setAdminSearchWorker(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-[#64B5F6] font-bold"
                          />
                          <Search size={14} className="text-slate-400 absolute left-3 top-2.5" />
                        </div>
                        
                        {/* Botón Registrar */}
                        <button
                          onClick={() => setShowAddWorkerModal(true)}
                          className="w-full sm:w-auto bg-[#002855] hover:bg-[#073B73] text-white text-xs font-bold py-2 px-4 rounded-xl shadow-sm transition flex items-center justify-center gap-1.5 whitespace-nowrap"
                        >
                          <Users size={14} className="text-colegio-gold" />
                          Registrar Trabajador
                        </button>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left text-slate-600">
                        <thead className="text-[10px] bg-slate-50 text-slate-500 uppercase tracking-wider border-b border-slate-200">
                          <tr>
                            <th className="py-3 px-4">Nombre</th>
                            <th className="py-3 px-4">Cédula</th>
                            <th className="py-3 px-4">Cargo</th>
                            <th className="py-3 px-4 text-right">Salario Mensual</th>
                            <th className="py-3 px-4 text-right">Límite Total</th>
                            <th className="py-3 px-4 text-right">Límite Disponible</th>
                            <th className="py-3 px-4 text-center">Acciones</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {workers
                            .filter(w => 
                              w.nombre.toLowerCase().includes(adminSearchWorker.toLowerCase()) || 
                              w.cedula.toLowerCase().includes(adminSearchWorker.toLowerCase())
                            )
                            .map(w => (
                              <tr key={w.id} className="hover:bg-slate-50/50 transition">
                                <td className="py-3 px-4 font-bold text-slate-800">{w.nombre}</td>
                                <td className="py-3 px-4 font-mono font-bold text-slate-500">{w.cedula}</td>
                                <td className="py-3 px-4 font-medium">{w.cargo}</td>
                                <td className="py-3 px-4 text-right font-mono font-bold">${w.salario_base.toFixed(2)}</td>
                                <td className="py-3 px-4 text-right font-bold text-colegio-gold font-mono">
                                  ${w.limite_total.toFixed(2)}
                                  {w.limite_personalizado !== null && (
                                    <span className="text-[9px] text-amber-600 bg-amber-50 border border-amber-100 py-0.5 px-2 rounded-full ml-1.5 font-sans font-extrabold uppercase">
                                      Manual
                                    </span>
                                  )}
                                </td>
                                <td className="py-3 px-4 text-right font-black text-green-600 font-mono">${w.limite_disponible.toFixed(2)}</td>
                                <td className="py-3 px-4 text-center">
                                  <button
                                    onClick={() => {
                                      setSelectedWorkerForEdit(w);
                                      setEditSalary(w.salario_base.toString());
                                      setEditLimitOverride(w.limite_personalizado?.toString() || '');
                                    }}
                                    className="text-xs text-[#002855] hover:bg-slate-100 bg-slate-50 py-1.5 px-3.5 rounded-xl border border-slate-200 transition font-bold"
                                  >
                                    Editar Ficha
                                  </button>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Registro de Trabajador (Simulado en Fila) */}
                  {showAddWorkerModal && (
                    <div className="bg-slate-50 border border-[#64B5F6]/40 p-5 rounded-2xl animate-fade-in space-y-4 shadow-inner mb-4">
                      <div className="flex justify-between items-center border-b border-slate-200 pb-2.5">
                        <h4 className="text-[#002855] font-black text-xs uppercase tracking-wider flex items-center gap-1.5">
                          <Users size={14} className="text-colegio-gold" />
                          Registrar Nuevo Trabajador
                        </h4>
                        <button onClick={() => setShowAddWorkerModal(false)} className="text-slate-400 hover:text-slate-600 transition">
                          <X size={16} />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
                        <div>
                          <label className="text-[10px] text-slate-500 block mb-1 font-bold">NOMBRE COMPLETO</label>
                          <input
                            type="text"
                            placeholder="Ej: Prof. Francisco Pinto"
                            value={newWorkerNombre}
                            onChange={(e) => setNewWorkerNombre(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#64B5F6] font-bold"
                          />
                        </div>
                        
                        <div>
                          <label className="text-[10px] text-slate-500 block mb-1 font-bold font-mono">CÉDULA DE IDENTIDAD</label>
                          <input
                            type="text"
                            placeholder="Ej: V-12.345.678"
                            value={newWorkerCedula}
                            onChange={(e) => setNewWorkerCedula(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#64B5F6] font-mono font-bold"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] text-slate-500 block mb-1 font-bold">CARGO</label>
                          <select
                            value={newWorkerCargo}
                            onChange={(e) => setNewWorkerCargo(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 font-bold cursor-pointer"
                          >
                            <option value="Docente de Primaria">Docente de Primaria</option>
                            <option value="Docente de Química Bachillerato">Docente de Química Bachillerato</option>
                            <option value="Asistente Administrativo">Asistente Administrativo</option>
                            <option value="Coordinadora de Evaluación">Coordinadora de Evaluación</option>
                            <option value="Personal de Mantenimiento">Personal de Mantenimiento</option>
                            <option value="Directivo">Directivo</option>
                          </select>
                        </div>

                        <div>
                          <label className="text-[10px] text-slate-500 block mb-1 font-bold">SUELDO BASE MENSUAL ($)</label>
                          <input
                            type="number"
                            value={newWorkerSalario}
                            onChange={(e) => setNewWorkerSalario(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#64B5F6] font-mono font-bold"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] text-slate-500 block mb-1 font-bold">ANTIGÜEDAD (AÑOS)</label>
                          <input
                            type="number"
                            value={newWorkerAntiguedad}
                            onChange={(e) => setNewWorkerAntiguedad(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#64B5F6] font-mono font-bold"
                          />
                        </div>
                      </div>

                      <div className="flex justify-end gap-2 pt-2">
                        <button
                          onClick={() => setShowAddWorkerModal(false)}
                          className="bg-white border border-slate-200 text-slate-600 text-xs font-bold py-2.5 px-4 rounded-xl transition hover:bg-slate-100"
                        >
                          Cancelar
                        </button>
                        <button
                          disabled={isRegisteringWorker}
                          onClick={handleRegisterWorker}
                          className="bg-[#002855] hover:bg-[#073B73] text-white text-xs font-bold py-2.5 px-5 rounded-xl shadow transition flex items-center gap-1.5"
                        >
                          {isRegisteringWorker ? (
                            <>
                              <RefreshCw size={14} className="animate-spin" />
                              Registrando...
                            </>
                          ) : (
                            <>
                              <Check size={14} />
                              Registrar en Nómina
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Edición en Fila Modal simulada */}
                  {selectedWorkerForEdit && (
                    <div className="bg-slate-50 border border-slate-200 p-5 rounded-2xl animate-fade-in space-y-4 shadow-inner">
                      <div className="flex justify-between items-center border-b border-slate-200 pb-2.5">
                        <h4 className="text-[#002855] font-black text-xs uppercase tracking-wider flex items-center gap-1.5">
                          <Sliders size={14} className="text-[#64B5F6]" />
                          Modificar Parámetros: {selectedWorkerForEdit.nombre}
                        </h4>
                        <button onClick={() => setSelectedWorkerForEdit(null)} className="text-slate-400 hover:text-slate-600 transition">
                          <X size={16} />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="text-[10px] text-slate-500 block mb-1 font-bold">SALARIO MENSUAL ($ USD)</label>
                          <input
                            type="number"
                            value={editSalary}
                            onChange={(e) => setEditSalary(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#64B5F6] font-mono font-bold"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-500 block mb-1 font-bold">SOBREESCRITURA DE LÍMITE ($ USD)</label>
                          <input
                            type="number"
                            value={editLimitOverride}
                            placeholder="Dejar vacío para usar 50% de salario"
                            onChange={(e) => setEditLimitOverride(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#64B5F6] font-mono font-bold"
                          />
                        </div>
                        <div className="flex items-end gap-2">
                          <button
                            onClick={handleSaveWorkerEdit}
                            className="flex-1 bg-gradient-to-r from-[#002855] to-[#073B73] text-white text-xs font-bold py-3 px-4 rounded-xl shadow transition"
                          >
                            Guardar Ficha
                          </button>
                          <button
                            onClick={() => setSelectedWorkerForEdit(null)}
                            className="bg-white border border-slate-200 text-slate-600 text-xs font-bold py-3 px-4 rounded-xl transition hover:bg-slate-100"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Panel de Ajuste Masivo por Cargos y Configuración BCV */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    
                    {/* Ajuste masivo */}
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
                      <div>
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Ajuste Masivo de Crédito por Cargo</h4>
                        <p className="text-xs text-slate-500 mb-4 font-semibold">
                          Permite establecer un salario o límite predeterminado a todos los empleados de cierta categoría simultáneamente.
                        </p>

                        <div className="space-y-3">
                          <div>
                            <label className="text-[10px] text-slate-500 block mb-1 font-bold">SELECCIONAR CARGO</label>
                            <select
                              value={bulkCargo}
                              onChange={(e) => setBulkCargo(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 font-bold cursor-pointer"
                            >
                              <option value="Docente de Primaria">Docente de Primaria</option>
                              <option value="Docente de Química Bachillerato">Docente de Química Bachillerato</option>
                              <option value="Asistente Administrativo">Asistente Administrativo</option>
                              <option value="Coordinadora de Evaluación">Coordinadora de Evaluación</option>
                              <option value="Personal de Mantenimiento">Personal de Mantenimiento</option>
                            </select>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[10px] text-slate-500 block mb-1 font-bold">NUEVO SALARIO ($)</label>
                              <input
                                type="number"
                                placeholder="Opcional: No cambiar"
                                value={bulkSalary}
                                onChange={(e) => setBulkSalary(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 font-mono font-bold"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] text-slate-500 block mb-1 font-bold">LÍMITE PERSONALIZADO ($)</label>
                              <input
                                type="number"
                                placeholder="Vacío = 50% de salario"
                                value={bulkLimit}
                                onChange={(e) => setBulkLimit(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 font-mono font-bold"
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={handleApplyBulkAdjust}
                        disabled={isApplyingBulk}
                        className="w-full mt-4 bg-gradient-to-r from-[#002855] to-[#073B73] hover:from-[#073B73] hover:to-[#002855] text-white text-xs font-bold py-3 px-4 rounded-xl shadow transition flex items-center justify-center gap-1.5"
                      >
                        {isApplyingBulk ? (
                          <>
                            <RefreshCw size={14} className="animate-spin" />
                            Aplicando...
                          </>
                        ) : (
                          <>
                            <Users size={14} />
                            Aplicar Masivamente
                          </>
                        )}
                      </button>
                    </div>

                    {/* Editor de Tasa BCV y Conciliación general */}
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
                          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Tasa Cambiaria BCV Activa</h4>
                          <button 
                            onClick={handleReseed} 
                            disabled={isSeeding}
                            className="text-slate-500 hover:text-[#002855] hover:bg-slate-100 transition flex items-center gap-1 bg-slate-50 text-[10px] font-bold px-2 py-1 rounded border border-slate-200 disabled:opacity-50"
                            title="Reiniciar y sembrar base de datos con valores por defecto"
                          >
                            <RefreshCw size={10} className={isSeeding ? 'animate-spin' : ''} />
                            Reiniciar Simulación
                          </button>
                        </div>
                        <p className="text-xs text-slate-500 mb-4 font-semibold">
                          Los créditos se indexan al dólar, pero las cuotas de nómina se descuentan en Bolívares. Modifica esta tasa y todas las cuotas en bolívares se actualizarán automáticamente.
                        </p>

                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex items-center justify-between gap-4">
                          <div className="space-y-1">
                            <span className="text-[10px] text-slate-500 block uppercase font-bold">Tasa del Día (VES/USD)</span>
                            <span className="text-2xl font-black font-mono text-[#E53935]">Bs. {bcvRate.toFixed(2)}</span>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              step="0.01"
                              value={bcvRate}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value);
                                if (!isNaN(val) && val > 0) {
                                  setBcvRate(val);
                                  addNotification('info', 'Tasa BCV Cambiada', `La tasa de cambio se ajustó a Bs. ${val.toFixed(2)}. Cuotas re-calculadas.`);
                                }
                              }}
                              className="w-24 bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 font-mono text-center font-bold"
                            />
                            <span className="text-xs text-slate-500 font-bold">Bs.</span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 pt-4 border-t border-slate-100 space-y-2 text-xs">
                        <h5 className="font-bold text-slate-700 mb-1">Resumen del Estado de Cuentas:</h5>
                        <div className="flex justify-between text-slate-600">
                          <span>Volumen Financiado en VES:</span>
                          <span className="font-bold text-slate-800">Bs. {(totalVolume * bcvRate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex justify-between text-slate-600">
                          <span>Comisiones del Colegio en VES:</span>
                          <span className="font-bold text-[#E53935]">Bs. {(totalCommissions * bcvRate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                      </div>
                    </div>

                  </div>

                  {/* MÓDULO DE RECAUDACIÓN DE NÓMINA (Deducciones Quincenales) */}
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4 border-b border-slate-100 pb-3">
                      <div>
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Centro de Cobros de Nómina</h4>
                        <p className="text-xs text-slate-500 font-semibold mt-1">
                          Selecciona una fecha de nómina para consultar los descuentos pendientes por aplicar a los salarios de los trabajadores.
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Selector de Fecha de Nómina */}
                        <select
                          value={payrollFilterDate}
                          onChange={(e) => setPayrollFilterDate(e.target.value)}
                          className="bg-slate-50 border border-slate-200 rounded-xl py-2 px-3.5 text-xs text-slate-800 font-bold focus:outline-none"
                        >
                          {Array.from(new Set(installments.map(i => i.fecha_cobro)))
                            .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
                            .map(date => (
                              <option key={date} value={date}>
                                Nómina: {new Date(date).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                              </option>
                            ))}
                          {installments.length === 0 && <option value="">Sin Cuotas Registradas</option>}
                        </select>

                        {/* Botón Exportar */}
                        <button
                          onClick={handleExportPayrollCSV}
                          className="bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold py-2 px-4 rounded-xl border border-slate-200 flex items-center gap-1 transition"
                        >
                          <Download size={14} className="text-[#64B5F6]" />
                          Exportar CSV
                        </button>
                      </div>
                    </div>

                    {/* Tabla de Deducciones Filtradas */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left text-slate-600">
                        <thead className="text-[10px] bg-slate-50 text-slate-500 uppercase tracking-wider border-b border-slate-200">
                          <tr>
                            <th className="py-3 px-4">Trabajador</th>
                            <th className="py-3 px-4">Cédula</th>
                            <th className="py-3 px-4 text-right">Salario Base</th>
                            <th className="py-3 px-4 text-right">Monto Cuota ($)</th>
                            <th className="py-3 px-4 text-right text-[#002855]">A Descontar (VES)</th>
                            <th className="py-3 px-4 text-center">Estatus</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {installments
                            .filter(i => i.fecha_cobro === payrollFilterDate)
                            .map(i => {
                              const t = i.transacciones_credicrc;
                              const w = t?.trabajadores_crc;
                              const vesValue = i.monto_usd * bcvRate;
                              return (
                                <tr key={i.id} className="hover:bg-slate-50/50 transition">
                                  <td className="py-3 px-4 font-bold text-slate-800">{w?.nombre}</td>
                                  <td className="py-3 px-4 font-mono font-bold text-slate-500">{w?.cedula}</td>
                                  <td className="py-3 px-4 text-right font-mono font-bold">${w?.salario_base.toFixed(2)}</td>
                                  <td className="py-3 px-4 text-right font-bold font-mono">${i.monto_usd.toFixed(2)}</td>
                                  <td className="py-3 px-4 text-right font-black text-[#E53935] font-mono">
                                    Bs. {vesValue.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </td>
                                  <td className="py-3 px-4 text-center">
                                    <span className={`px-2.5 py-1 rounded-full text-[9px] font-extrabold border ${
                                      i.estatus === 'Cobrado'
                                        ? 'bg-green-50 text-green-600 border-green-200'
                                        : 'bg-amber-50 text-amber-600 border-amber-200'
                                    }`}>
                                      {i.estatus}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          {installments.filter(i => i.fecha_cobro === payrollFilterDate).length === 0 && (
                            <tr>
                              <td colSpan={6} className="text-center py-8 text-slate-400 font-semibold">
                                Selecciona una fecha válida con cuotas registradas para ver el listado de descuentos.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Acciones de Nómina */}
                    {installments.filter(i => i.fecha_cobro === payrollFilterDate && i.estatus === 'Pendiente').length > 0 && (
                      <div className="mt-4 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                        <div className="text-xs text-slate-500 font-bold">
                          Deducciones Quincenales del Periodo:{' '}
                          <strong className="text-slate-800 font-mono text-sm">
                            ${installments
                              .filter(i => i.fecha_cobro === payrollFilterDate && i.estatus === 'Pendiente')
                              .reduce((sum, i) => sum + i.monto_usd, 0)
                              .toFixed(2)}
                          </strong>
                          {' / '}
                          <strong className="text-[#E53935] font-mono text-sm">
                            Bs. {installments
                              .filter(i => i.fecha_cobro === payrollFilterDate && i.estatus === 'Pendiente')
                              .reduce((sum, i) => sum + i.monto_usd * bcvRate, 0)
                              .toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </strong>
                        </div>

                        <button
                          onClick={handleProcessPayrollDeductions}
                          disabled={isProcessingPayroll}
                          className="bg-[#002855] hover:bg-[#073B73] text-white text-xs font-bold py-2.5 px-5 rounded-xl shadow transition flex items-center justify-center gap-1.5"
                        >
                          {isProcessingPayroll ? (
                            <>
                              <RefreshCw size={14} className="animate-spin" />
                              Descontando de Nómina...
                            </>
                          ) : (
                            <>
                              <CheckCircle2 size={14} />
                              Aplicar Descuentos y Conciliar Nómina
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Tabla de Conciliación a Proveedores */}
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 border-b border-slate-100 pb-3">
                      <div>
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Conciliación Financiera de Proveedores Aliados</h4>
                        <p className="text-xs text-slate-500 font-semibold mt-0.5">Comercios afiliados habilitados en el ecosistema CrediCRC.</p>
                      </div>
                      <button
                        onClick={() => setShowAddProviderModal(true)}
                        className="bg-[#002855] hover:bg-[#073B73] text-white text-xs font-bold py-2 px-4 rounded-xl shadow-sm transition flex items-center justify-center gap-1.5 whitespace-nowrap"
                      >
                        <ShoppingBag size={14} className="text-[#64B5F6]" />
                        Registrar Proveedor
                      </button>
                    </div>

                    {/* Registro de Proveedor (Simulado en Fila) */}
                    {showAddProviderModal && (
                      <div className="bg-slate-50 border border-[#64B5F6]/40 p-5 rounded-2xl animate-fade-in space-y-4 shadow-inner mb-4">
                        <div className="flex justify-between items-center border-b border-slate-200 pb-2.5">
                          <h4 className="text-[#002855] font-black text-xs uppercase tracking-wider flex items-center gap-1.5">
                            <ShoppingBag size={14} className="text-[#64B5F6]" />
                            Afiliar Nuevo Comercio Proveedor
                          </h4>
                          <button onClick={() => setShowAddProviderModal(false)} className="text-slate-400 hover:text-slate-600 transition">
                            <X size={16} />
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                          <div>
                            <label className="text-[10px] text-slate-500 block mb-1 font-bold font-sans">NOMBRE DEL COMERCIO</label>
                            <input
                              type="text"
                              placeholder="Ej: Distribuidora El Castillo Express"
                              value={newProviderNombre}
                              onChange={(e) => setNewProviderNombre(e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#64B5F6] font-bold"
                            />
                          </div>

                          <div>
                            <label className="text-[10px] text-slate-500 block mb-1 font-bold">CATEGORÍA</label>
                            <select
                              value={newProviderCategoria}
                              onChange={(e) => setNewProviderCategoria(e.target.value as 'Carnes' | 'Víveres')}
                              className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 font-bold cursor-pointer"
                            >
                              <option value="Carnes">Carnes 🥩</option>
                              <option value="Víveres">Víveres 🛒</option>
                            </select>
                          </div>

                          <div>
                            <label className="text-[10px] text-slate-500 block mb-1 font-bold font-mono">CUENTA BANCARIA DE ENLACE</label>
                            <input
                              type="text"
                              placeholder="Ej: Mercantil: 0105-..."
                              value={newProviderCuenta}
                              onChange={(e) => setNewProviderCuenta(e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#64B5F6] font-bold"
                            />
                          </div>

                          <div>
                            <label className="text-[10px] text-slate-500 block mb-1 font-bold">% COMISIÓN COLEGIO (3.0% - 5.0%)</label>
                            <input
                              type="number"
                              step="0.1"
                              value={newProviderComision}
                              onChange={(e) => setNewProviderComision(e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#64B5F6] font-mono font-bold"
                            />
                          </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-2">
                          <button
                            onClick={() => setShowAddProviderModal(false)}
                            className="bg-white border border-slate-200 text-slate-600 text-xs font-bold py-2.5 px-4 rounded-xl transition hover:bg-slate-100"
                          >
                            Cancelar
                          </button>
                          <button
                            disabled={isRegisteringProvider}
                            onClick={handleRegisterProvider}
                            className="bg-[#002855] hover:bg-[#073B73] text-white text-xs font-bold py-2.5 px-5 rounded-xl shadow transition flex items-center gap-1.5"
                          >
                            {isRegisteringProvider ? (
                              <>
                                <RefreshCw size={14} className="animate-spin" />
                                Afiliando...
                              </>
                            ) : (
                              <>
                                <Check size={14} />
                                Afiliar Establecimiento
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    )}
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left text-slate-600">
                        <thead className="text-[10px] bg-slate-50 text-slate-500 uppercase tracking-wider border-b border-slate-200">
                          <tr>
                            <th className="py-3 px-4">Proveedor</th>
                            <th className="py-3 px-4">Categoría</th>
                            <th className="py-3 px-4">Cuenta Enlace Bancario</th>
                            <th className="py-3 px-4 text-right">Comisión %</th>
                            <th className="py-3 px-4 text-right">Venta Total ($)</th>
                            <th className="py-3 px-4 text-right text-amber-600">Retención Colegio ($)</th>
                            <th className="py-3 px-4 text-right text-green-600">Neto a Depositar ($)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {supplierReconciliation.map(p => (
                            <tr key={p.id} className="hover:bg-slate-50/50 transition">
                              <td className="py-3 px-4 font-bold text-slate-800">{p.nombre}</td>
                              <td className="py-3 px-4">
                                <span className={`px-2.5 py-1 rounded-full text-[9px] font-extrabold uppercase border ${
                                  p.categoria === 'Carnes' 
                                    ? 'bg-red-50 text-red-600 border-red-100' 
                                    : 'bg-green-50 text-green-600 border-green-100'
                                }`}>
                                  {p.categoria}
                                </span>
                              </td>
                              <td className="py-3 px-4 font-mono text-slate-500 font-bold text-[10px]">{p.cuenta_enlace}</td>
                              <td className="py-3 px-4 text-right font-mono">{(parseFloat(p.comision_colegio as string) * 100).toFixed(1)}%</td>
                              <td className="py-3 px-4 text-right font-mono">${p.totalVendido.toFixed(2)}</td>
                              <td className="py-3 px-4 text-right text-amber-600 font-mono">${p.totalComision.toFixed(2)}</td>
                              <td className="py-3 px-4 text-right font-bold text-green-600 font-mono">${p.netoPagar.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Editor de la Página de Inicio */}
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm text-left">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 border-b border-slate-100 pb-3">
                      <div>
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Editor de Contenidos de la Página de Inicio</h4>
                        <p className="text-xs text-slate-500 font-semibold mt-0.5">Modifica los textos principales de la landing page sin editar código.</p>
                      </div>
                      <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[10px] font-bold text-slate-600">
                        <button
                          type="button"
                          onClick={() => setEditorTab('hero')}
                          className={`px-3 py-1 rounded-md transition ${editorTab === 'hero' ? 'bg-[#002855] text-white shadow-sm' : 'text-slate-600 hover:text-[#002855]'}`}
                        >
                          Héroe & Portales
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditorTab('politicas')}
                          className={`px-3 py-1 rounded-md transition ${editorTab === 'politicas' ? 'bg-[#002855] text-white shadow-sm' : 'text-slate-600 hover:text-[#002855]'}`}
                        >
                          Políticas & Footer
                        </button>
                      </div>
                    </div>

                    {editorTab === 'hero' ? (
                      <div className="space-y-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 uppercase block">Título Principal (Hero)</label>
                          <input
                            type="text"
                            value={landingConfig.hero_title}
                            onChange={(e) => setLandingConfig({ ...landingConfig, hero_title: e.target.value })}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-none focus:border-[#002855] transition font-bold"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 uppercase block">Descripción del Héroe</label>
                          <textarea
                            rows={2}
                            value={landingConfig.hero_description}
                            onChange={(e) => setLandingConfig({ ...landingConfig, hero_description: e.target.value })}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-none focus:border-[#002855] transition font-semibold"
                          />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-slate-100 pt-4">
                          <div className="space-y-4">
                            <span className="text-[10px] font-extrabold text-[#002855] uppercase tracking-wider">Módulo Trabajador</span>
                            <div className="space-y-1">
                              <label className="text-[9px] font-bold text-slate-400 uppercase block">Título</label>
                              <input
                                type="text"
                                value={landingConfig.portal_trabajador_title}
                                onChange={(e) => setLandingConfig({ ...landingConfig, portal_trabajador_title: e.target.value })}
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-800 focus:outline-none focus:border-[#002855] transition font-bold"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[9px] font-bold text-slate-400 uppercase block">Descripción</label>
                              <textarea
                                rows={3}
                                value={landingConfig.portal_trabajador_description}
                                onChange={(e) => setLandingConfig({ ...landingConfig, portal_trabajador_description: e.target.value })}
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-800 focus:outline-none focus:border-[#002855] transition font-semibold"
                              />
                            </div>
                          </div>
                          <div className="space-y-4 border-t md:border-t-0 md:border-l border-slate-100 pt-4 md:pt-0 md:pl-4">
                            <span className="text-[10px] font-extrabold text-[#64B5F6] uppercase tracking-wider">Módulo Proveedor</span>
                            <div className="space-y-1">
                              <label className="text-[9px] font-bold text-slate-400 uppercase block">Título</label>
                              <input
                                type="text"
                                value={landingConfig.portal_proveedor_title}
                                onChange={(e) => setLandingConfig({ ...landingConfig, portal_proveedor_title: e.target.value })}
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-800 focus:outline-none focus:border-[#002855] transition font-bold"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[9px] font-bold text-slate-400 uppercase block">Descripción</label>
                              <textarea
                                rows={3}
                                value={landingConfig.portal_proveedor_description}
                                onChange={(e) => setLandingConfig({ ...landingConfig, portal_proveedor_description: e.target.value })}
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-800 focus:outline-none focus:border-[#002855] transition font-semibold"
                              />
                            </div>
                          </div>
                          <div className="space-y-4 border-t md:border-t-0 md:border-l border-slate-100 pt-4 md:pt-0 md:pl-4">
                            <span className="text-[10px] font-extrabold text-[#E53935] uppercase tracking-wider">Panel Administrativo</span>
                            <div className="space-y-1">
                              <label className="text-[9px] font-bold text-slate-400 uppercase block">Título</label>
                              <input
                                type="text"
                                value={landingConfig.portal_admin_title}
                                onChange={(e) => setLandingConfig({ ...landingConfig, portal_admin_title: e.target.value })}
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-800 focus:outline-none focus:border-[#002855] transition font-bold"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[9px] font-bold text-slate-400 uppercase block">Descripción</label>
                              <textarea
                                rows={3}
                                value={landingConfig.portal_admin_description}
                                onChange={(e) => setLandingConfig({ ...landingConfig, portal_admin_description: e.target.value })}
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-800 focus:outline-none focus:border-[#002855] transition font-semibold"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-4">
                            <span className="text-[10px] font-extrabold text-[#002855] uppercase tracking-wider">Políticas de Financiamiento</span>
                            <div className="space-y-1">
                              <label className="text-[9px] font-bold text-slate-400 uppercase block">Título Sección</label>
                              <input
                                type="text"
                                value={landingConfig.politicas_financiamiento_title}
                                onChange={(e) => setLandingConfig({ ...landingConfig, politicas_financiamiento_title: e.target.value })}
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-none focus:border-[#002855] transition font-bold"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[9px] font-bold text-slate-400 uppercase block">Descripción/Contenido</label>
                              <textarea
                                rows={4}
                                value={landingConfig.politicas_financiamiento_description}
                                onChange={(e) => setLandingConfig({ ...landingConfig, politicas_financiamiento_description: e.target.value })}
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-none focus:border-[#002855] transition font-semibold"
                              />
                            </div>
                          </div>
                          <div className="space-y-4 border-t md:border-t-0 md:border-l border-slate-100 pt-4 md:pt-0 md:pl-6">
                            <span className="text-[10px] font-extrabold text-[#002855] uppercase tracking-wider">Estabilidad & Seguridad de Datos</span>
                            <div className="space-y-1">
                              <label className="text-[9px] font-bold text-slate-400 uppercase block">Título Sección</label>
                              <input
                                type="text"
                                value={landingConfig.estabilidad_seguridad_title}
                                onChange={(e) => setLandingConfig({ ...landingConfig, estabilidad_seguridad_title: e.target.value })}
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-none focus:border-[#002855] transition font-bold"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[9px] font-bold text-slate-400 uppercase block">Descripción/Contenido</label>
                              <textarea
                                rows={4}
                                value={landingConfig.estabilidad_seguridad_description}
                                onChange={(e) => setLandingConfig({ ...landingConfig, estabilidad_seguridad_description: e.target.value })}
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-none focus:border-[#002855] transition font-semibold"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="flex justify-end border-t border-slate-100 pt-4 mt-4">
                      <button
                        type="button"
                        onClick={handleSaveLandingConfig}
                        disabled={isSavingConfig}
                        className="bg-[#002855] hover:bg-[#073B73] text-white text-xs font-bold py-2.5 px-6 rounded-xl shadow transition flex items-center justify-center gap-1.5 disabled:opacity-50 animate-pulse-slow"
                      >
                        {isSavingConfig ? (
                          <>
                            <RefreshCw size={14} className="animate-spin" />
                            Guardando...
                          </>
                        ) : (
                          <>
                            <Check size={14} />
                            Guardar Cambios de la Página de Inicio
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                </div>
                ) : (
                  /* Login Card for Admin */
                  <div className="max-w-md mx-auto my-12 bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden animate-fade-in text-left">
                    {/* Header */}
                    <div className="bg-[#002855] text-white p-6 text-center space-y-2 relative">
                      <div className="absolute top-4 right-4 bg-[#E53935] text-white text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">
                        Módulo Administrativo
                      </div>
                      <div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-2">
                        <Sliders className="h-6 w-6 text-[#E53935]" />
                      </div>
                      <h3 className="text-lg font-black">Panel de Control Colegio</h3>
                      <p className="text-xs text-slate-200 font-semibold">Ingresa tus credenciales de directivo para gestionar la nómina y los límites de crédito</p>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleLogin} className="p-6 space-y-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase block">Correo Electrónico de Directivo</label>
                        <input 
                          type="email" 
                          required
                          value={authEmail}
                          onChange={(e) => setAuthEmail(e.target.value)}
                          placeholder="admin@credicrc.com"
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-none focus:border-[#002855] transition font-semibold"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase block">Contraseña de Acceso</label>
                        <input 
                          type="password" 
                          required
                          value={authPassword}
                          onChange={(e) => setAuthPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-none focus:border-[#002855] transition font-semibold"
                        />
                      </div>

                      <button 
                        type="submit" 
                        disabled={isAuthSubmitting}
                        className="w-full bg-[#002855] text-white hover:bg-[#0b3c70] transition p-3 rounded-lg text-xs font-bold shadow-md hover:shadow-lg disabled:opacity-50 mt-2 flex items-center justify-center gap-2"
                      >
                        {isAuthSubmitting && <RefreshCw size={12} className="animate-spin" />}
                        Ingresar al Panel Administrativo
                      </button>
                    </form>
                    
                    <div className="bg-slate-50 px-6 py-4 border-t border-slate-100 text-[10px] text-slate-500 text-center font-semibold">
                      Acceso de seguridad restringido únicamente al personal autorizado del Colegio Rafael Castillo.
                    </div>
                  </div>
                )
              )}

            </div>

            {/* BARRA LATERAL DERECHA: ALERTAS Y NOTIFICACIONES SIMULADAS (CLARO) */}
            <div className="col-span-1 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between max-h-[85vh] overflow-hidden">
              <div className="flex flex-col h-full overflow-hidden">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                  <div className="flex items-center gap-1.5">
                    <Bell className="text-[#64B5F6] h-4 w-4" />
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-widest">Panel de Actividades</h4>
                  </div>
                  <span className="bg-slate-100 text-slate-600 text-[10px] py-0.5 px-2.5 rounded-full font-bold">
                    {notifications.length}
                  </span>
                </div>

                {/* Lista de Eventos */}
                <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-left">
                  {notifications.map(notif => (
                    <div
                      key={notif.id}
                      className={`p-3.5 rounded-xl border text-xs space-y-1.5 transition duration-300 animate-fade-in ${
                        notif.type === 'success'
                          ? 'bg-green-50 border-green-200 text-green-800'
                          : notif.type === 'warning'
                          ? 'bg-amber-50 border-amber-200 text-amber-800'
                          : notif.type === 'error'
                          ? 'bg-red-50 border-red-200 text-red-800'
                          : 'bg-slate-50 border-slate-200 text-slate-700'
                      }`}
                    >
                      <div className="flex justify-between items-center font-bold">
                        <span className="text-[10px] uppercase tracking-wide">
                          {notif.title}
                        </span>
                        <span className="text-[9px] text-slate-400">
                          {notif.timestamp.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-600 leading-relaxed font-medium">{notif.message}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Pie de Firma de la Plataforma */}
              <div className="mt-4 pt-4 border-t border-slate-100 text-center text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                <p>CrediCRC v1.3 &bull; Fintech Escolar</p>
                <p className="mt-1 text-[8px] text-slate-300">Colegio Rafael Castillo</p>
              </div>
            </div>
          </>
        )}

      </main>
    </div>
  );
}
