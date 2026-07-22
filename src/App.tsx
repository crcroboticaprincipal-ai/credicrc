import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { supabase } from './supabaseClient';
import { QRCodeSVG } from 'qrcode.react';
import { Html5Qrcode } from 'html5-qrcode';
import {
  User, ShoppingBag, Sliders, QrCode, Calendar, History,
  CheckCircle2, AlertCircle, Bell, RefreshCw, TrendingUp,
  Percent, Search, Users, ShieldCheck, Download, Check,
  X, Home, Star, Lock, Upload, Eye, Zap,
  Award, ArrowUp, ArrowDown, Clock, AlertTriangle, Camera, CameraOff,
  Building2, Banknote, Phone, MapPin, BadgeCheck, ImagePlus
} from 'lucide-react';

// ─── HOOK: DISIPADOR DE PETICIONES DUPLICADAS (Alta Concurrencia) ─────────────
// Evita que botones críticos se disparen más de una vez en 800ms
function useDebounceClick(fn: (...args: any[]) => any, delay = 800) {
  const lastCall = useRef<number>(0);
  return useCallback((...args: any[]) => {
    const now = Date.now();
    if (now - lastCall.current < delay) return;
    lastCall.current = now;
    return fn(...args);
  }, [fn, delay]);
}

// ─── UTILS: WEB PUSH NOTIFICATIONS ───────────────────────────────────────────
function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function registerPushNotifications(userId: string) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.log('[Push SDK] Notificaciones push no soportadas en este navegador.');
    return;
  }

  try {
    let permission = Notification.permission;
    if (permission === 'default') {
      permission = await Notification.requestPermission();
    }

    if (permission !== 'granted') {
      console.log('[Push SDK] Permiso de notificaciones denegado.');
      return;
    }

    const registration = await navigator.serviceWorker.ready;
    const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY || 'BBObtjH-4d-2RuVVZEXXoO53zzbL8v5hdljLkfbwB9XdcYJO670oAfS6tV-SAgMJxvSfe9IfVrWkeCteRH-yjBw';
    
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
    });

    const subJSON = subscription.toJSON();
    const endpoint = subJSON.endpoint;
    const p256dh = subJSON.keys?.p256dh;
    const auth = subJSON.keys?.auth;

    if (!endpoint || !p256dh || !auth) {
      console.warn('[Push SDK] Suscripción criptográfica incompleta.');
      return;
    }

    const { error } = await supabase
      .from('device_tokens')
      .upsert({
        user_id: userId,
        endpoint,
        p256dh,
        auth
      }, { onConflict: 'endpoint' });

    if (error) {
      console.error('[Push SDK] Error registrando dispositivo en Supabase:', error.message);
    } else {
      console.log('[Push SDK] Dispositivo registrado exitosamente.');
    }
  } catch (err: any) {
    console.error('[Push SDK] Falló el registro de notificaciones push:', err.message || err);
  }
}

// ─── LOGO VECTORIAL ──────────────────────────────────────────────────────────
function SchoolLogo({ className = 'h-14 w-auto' }) {
  return (
    <svg className={className} viewBox="0 0 100 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <text x="50" y="12" dominantBaseline="middle" textAnchor="middle" fontFamily="'Outfit', sans-serif" fontWeight="700" fontSize="9.5" fill="#64B5F6" letterSpacing="1">U.E. COLEGIO</text>
      <rect x="15" y="22" width="22" height="55" rx="1.5" fill="#64B5F6"/>
      <path d="M 37 32 A 25 25 0 0 1 85 45 M 85 45 A 25 25 0 0 1 85 70" stroke="#64B5F6" strokeWidth="8.5" strokeLinecap="round" fill="none"/>
      <path d="M 48 44 A 12 12 0 0 1 80 47 M 80 47 A 12 12 0 0 1 80 62" stroke="#90CAF9" strokeWidth="8" strokeLinecap="round" fill="none"/>
      <circle cx="76" cy="54" r="7.5" fill="#E53935"/>
      <text x="50" y="93" dominantBaseline="middle" textAnchor="middle" fontFamily="'Outfit', sans-serif" fontWeight="800" fontSize="10.5" fill="#E53935" letterSpacing="0.2">RAFAEL CASTILLO</text>
      <line x1="8" y1="102" x2="92" y2="102" stroke="#64B5F6" strokeWidth="1.5"/>
      <text x="50" y="112" dominantBaseline="middle" textAnchor="middle" fontFamily="'Outfit', sans-serif" fontWeight="600" fontSize="6.8" fill="#64B5F6" letterSpacing="1.8">DUACA ESTADO LARA</text>
    </svg>
  );
}

// ─── HASH DE CONTRASEÑA (SHA-256 client-side — elimina plaintext en BD) ─────
async function hashPassword(plain: string): Promise<string> {
  const data = new TextEncoder().encode(plain);
  const buf  = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── CONSTANTES ──────────────────────────────────────────────────────────────
const STANDARD_CARGOS = ['Directivo', 'Docente', 'Administrativo', 'Servicios Generales'] as const;
type CargoCRC = typeof STANDARD_CARGOS[number];

const CREDIT_LEVELS = [
  { nivel: 1, nombre: 'Básico',     icon: '⭐',    color: 'text-slate-500',   bg: 'bg-slate-100',   porcentaje_inicial: 0.40, porcentaje_cupo: 0.30, pagos_req: 0  },
  { nivel: 2, nombre: 'Confiable',  icon: '⭐⭐',  color: 'text-blue-600',    bg: 'bg-blue-50',     porcentaje_inicial: 0.35, porcentaje_cupo: 0.33, pagos_req: 3  },
  { nivel: 3, nombre: 'Preferente', icon: '⭐⭐⭐', color: 'text-purple-600',  bg: 'bg-purple-50',   porcentaje_inicial: 0.30, porcentaje_cupo: 0.37, pagos_req: 6  },
  { nivel: 4, nombre: 'Élite',      icon: '👑',    color: 'text-amber-600',   bg: 'bg-amber-50',    porcentaje_inicial: 0.20, porcentaje_cupo: 0.40, pagos_req: 12 },
];

// ─── INTERFACES ──────────────────────────────────────────────────────────────
interface DBWorker {
  id: string; nombre: string; cedula: string; cargo: string;
  salario_base: string | number; antiguedad_anios: number;
  limite_personalizado: string | number | null;
  limite_total: string | number; limite_disponible: string | number;
  nivel_credito?: number; pagos_puntuales_consecutivos?: number;
  qr_bloqueado?: boolean; created_at: string;
}
interface Worker extends DBWorker {
  salario_base: number; limite_personalizado: number | null;
  limite_total: number; limite_disponible: number;
  nivel_credito: number; pagos_puntuales_consecutivos: number; qr_bloqueado: boolean;
}
interface Provider {
  id: string; nombre: string; categoria: 'Carnes' | 'Víveres';
  cuenta_enlace: string; comision_colegio: string | number; created_at: string;
  // Campos extendidos del perfil del comercio
  razon_social?: string; rif?: string; direccion?: string; telefono?: string;
  pago_movil_banco?: string; pago_movil_cedula?: string; pago_movil_telefono?: string;
  logo_url?: string;
}
interface Transaction {
  id: string; trabajador_id: string; proveedor_id: string;
  monto_usd: number; tasa_bcv: number; monto_ves: number;
  monto_inicial_pagado_usd: number; dias_financiamiento: number;
  comision_monto_usd: number; token_aprobacion: string;
  estatus: 'Pendiente' | 'Aprobada' | 'Rechazada' | 'Completada';
  fecha_transaccion: string;
  estado_liquidacion_proveedor?: 'pendiente' | 'liquidado';
  estado_comision_colegio?: 'pendiente' | 'cobrado';
  trabajadores_crc?: Worker; proveedores_aliados?: Provider;
}
interface Installment {
  id: string; transaccion_id: string; monto_usd: number;
  fecha_cobro: string;
  estatus: 'Pendiente' | 'Cobrado' | 'Vencido' | 'En Verificación' | 'Pagado Directo';
  fecha_pago_real: string | null; tasa_bcv_pago: number | null; monto_ves_pagado: number | null;
  created_at: string;
  transacciones_credicrc?: Transaction & { trabajadores_crc?: Worker; proveedores_aliados?: Provider };
}
interface DirectPayment {
  id: string; cuota_id: string; trabajador_id: string; monto_usd: number;
  referencia_bancaria: string; url_comprobante: string | null;
  estatus: 'Pendiente' | 'Verificado' | 'Rechazado'; notas_admin: string | null;
  es_saldo_favor: boolean; created_at: string;
  cronograma_cuotas?: Installment;
  trabajadores_crc?: Worker;
}
interface LiquidacionRecord {
  id: string;
  proveedor_id: string;
  tipo: 'liquidacion_ventas' | 'cobro_comision';
  monto_liquidado: number;
  monto_comision_corte: number;
  referencia_pago: string;
  fecha_corte: string;
  notas?: string;
  proveedores_aliados?: { nombre: string };
}
// QR de identidad — sin montos
interface ActiveQR {
  qrId: string; workerId: string; workerName: string; workerCedula: string;
  tokenHash: string; payloadJson: string; timestamp: number; expiresAt: number; nivel: number;
}
interface UserAccount {
  id: string; email: string; password?: string; nombre: string;
  rol: 'trabajador' | 'proveedor' | 'admin' | 'tesoreria';
  trabajador_id: string | null; proveedor_id: string | null; aprobado: boolean;
  datos_registro?: {
    cedula?: string; cargo?: string; categoria?: 'Carnes' | 'Víveres'; cuenta_enlace?: string;
    razon_social?: string; rif?: string; direccion?: string;
    banco_cuenta?: string; pago_movil_banco?: string; pago_movil_cedula?: string; pago_movil_telefono?: string;
  } | null;
  created_at: string;
}
interface LandingConfig {
  hero_title: string; hero_description: string;
  portal_trabajador_title: string; portal_trabajador_description: string;
  portal_proveedor_title: string; portal_proveedor_description: string;
  portal_admin_title: string; portal_admin_description: string;
  politicas_financiamiento_title: string; politicas_financiamiento_description: string;
  estabilidad_seguridad_title: string; estabilidad_seguridad_description: string;
  colegio_banco?: string;
  colegio_cuenta?: string;
  colegio_rif?: string;
  colegio_nombre?: string;
}
interface SystemNotification {
  id: string; timestamp: Date; type: 'success' | 'warning' | 'info' | 'error'; title: string; message: string;
}
interface ValidationResult {
  aprobado: boolean; mensaje: string;
  monto_inicial_calculado: number; cuota_financiada: number; limite_quincenal_max: number;
  trabajador_nombre?: string; trabajador_cedula?: string; nivel_credito?: number; limite_disponible?: number;
  tokenHash?: string; workerId?: string;
}

// ─── SKELETON LOADER ─────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm animate-pulse">
      <div className="h-3 bg-slate-200 rounded-full w-1/3 mb-4"/>
      <div className="h-8 bg-slate-200 rounded-full w-2/3 mb-3"/>
      <div className="h-3 bg-slate-100 rounded-full w-full mb-2"/>
      <div className="h-3 bg-slate-100 rounded-full w-4/5"/>
    </div>
  );
}

// ─── GAMIFICATION BADGE ──────────────────────────────────────────────────────
function NivelBadge({ nivel, small = false }: { nivel: number; small?: boolean }) {
  const lvl = CREDIT_LEVELS.find(l => l.nivel === nivel) || CREDIT_LEVELS[0];
  return (
    <span className={`inline-flex items-center gap-1 font-extrabold rounded-full border ${small ? 'text-[9px] px-2 py-0.5' : 'text-xs px-3 py-1'} ${lvl.bg} ${lvl.color} border-current/20`}>
      <span>{lvl.icon}</span> {lvl.nombre}
    </span>
  );
}

// ─── QR DISPLAY COMPONENT (identidad, sin montos) ────────────────────────────
function QRDisplay({ qr, countdown, onClose }: { qr: ActiveQR; countdown: number; onClose: () => void }) {
  const pct = countdown / 300; // 5 min
  const isExpiring = countdown <= 60;
  const isExpired = countdown <= 0;
  const radius = 44;
  const circ = 2 * Math.PI * radius;

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-lg animate-fade-in">
      <div className="flex flex-col md:flex-row items-center gap-6">
        <div className={`relative p-4 rounded-xl border-2 flex flex-col items-center transition-all duration-500 ${isExpired ? 'border-red-300 opacity-50' : isExpiring ? 'border-amber-400' : 'border-[#002855]/20'}`}>
          {isExpired ? (
            <div className="w-52 h-52 flex flex-col items-center justify-center bg-red-50 rounded-lg gap-2">
              <AlertCircle className="text-red-500 h-10 w-10"/>
              <p className="text-red-600 font-black text-xs text-center">Código Expirado<br/>Genera uno nuevo</p>
            </div>
          ) : (
            <QRCodeSVG
              value={qr.payloadJson}
              size={208}
              level="H"
              includeMargin={true}
              fgColor="#002855"
              bgColor="#ffffff"
            />
          )}
          <div className="relative mt-3 w-20 h-20 flex items-center justify-center">
            <svg className="w-20 h-20 -rotate-90 absolute" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r={radius} stroke="#e2e8f0" strokeWidth="8" fill="transparent"/>
              <circle cx="50" cy="50" r={radius} stroke={isExpired ? '#ef4444' : isExpiring ? '#f59e0b' : '#002855'}
                strokeWidth="8" fill="transparent"
                strokeDasharray={circ}
                strokeDashoffset={circ * (1 - pct)}
                strokeLinecap="round" className="transition-all duration-1000"/>
            </svg>
            <span className={`text-lg font-black font-mono z-10 ${isExpired ? 'text-red-500' : isExpiring ? 'text-amber-600' : 'text-[#002855]'}`}>
              {Math.floor(countdown / 60)}:{(countdown % 60).toString().padStart(2, '0')}
            </span>
          </div>
          <p className="text-[10px] text-slate-400 font-bold mt-1">Expira en</p>
        </div>

        <div className="flex-1 space-y-3 text-left">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-[#002855] font-black text-base">Mi QR de Identificación</h4>
              <p className="text-xs text-slate-500 font-semibold">Muéstralo al comercio para escanear</p>
            </div>
            <NivelBadge nivel={qr.nivel} small />
          </div>

          <div className="bg-gradient-to-br from-[#002855] to-[#073B73] p-4 rounded-xl text-white space-y-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-[#64B5F6]"/>
              <span className="text-xs font-black">Código Verificado CrediCRC</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div><span className="text-blue-300 text-[10px] block font-bold">TITULAR</span><strong className="text-white">{qr.workerName}</strong></div>
              <div><span className="text-blue-300 text-[10px] block font-bold">CÉDULA</span><strong className="text-white font-mono">{qr.workerCedula}</strong></div>
            </div>
            <div className="bg-white/10 rounded-lg px-3 py-2 text-[10px] text-blue-200 font-semibold">
              ℹ️ El proveedor ingresará el monto de tu compra y el sistema calculará automáticamente tu cuota según tu nivel.
            </div>
          </div>

          <div className="bg-slate-900 rounded-lg p-2.5 overflow-hidden">
            <p className="text-[9px] text-slate-400 font-mono mb-1">TOKEN DE SESIÓN</p>
            <code className="text-[10px] text-emerald-400 font-mono break-all leading-tight">{qr.tokenHash.substring(0, 32)}...</code>
          </div>

          {isExpiring && !isExpired && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 text-xs font-bold px-3 py-2 rounded-lg animate-pulse">
              <Clock size={12}/> ¡QR expira pronto! Muéstralo al proveedor ahora.
            </div>
          )}

          <div className="flex justify-end">
            <button onClick={onClose} className="text-xs text-slate-500 hover:text-slate-800 font-bold px-4 py-2 rounded-lg transition hover:bg-slate-100">
              Ocultar QR
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── QR SCANNER COMPONENT — versión optimizada ───────────────────────────────
// Mejoras v2.1:
//  • fps 25 + qrbox 240px para detección ultra-rápida incluso con brillo bajo
//  • experimentalFeatures.useBarCodeDetectorIfSupported → usa API nativa del SO
//  • Pre-calentamiento de cámara: el stream arranca al montar, no al hacer clic
//  • Animación verde de éxito + congelamiento inmediato del stream al detectar
//  • Debounce nativo con hasScanned.current (sin doble disparo)
const QR_SCANNER_CONFIG = {
  fps: 20,
  qrbox: { width: 240, height: 240 },
  showTorchButtonIfSupported: true,
} as const;

function QRScanner({ onScan, onClose }: { onScan: (token: string) => void; onClose: () => void }) {
  const [status, setStatus] = useState<'requesting' | 'scanning' | 'success' | 'denied' | 'error'>('requesting');
  const [errorMsg, setErrorMsg] = useState('');
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const hasScanned = useRef(false);
  const isCancelled = useRef(false);

  const stopScanner = useCallback(async () => {
    const s = scannerRef.current;
    if (!s) return;
    scannerRef.current = null;
    try {
      if (s.isScanning) await s.stop();
      s.clear();
    } catch { /* ignorar errores al detener */ }
  }, []);

  useEffect(() => {
    isCancelled.current = false;
    hasScanned.current = false;

    const init = async () => {
      setStatus('scanning');
      // Esperar brevemente a que el div 'credicrc-qr-reader' esté en el DOM
      await new Promise(resolve => setTimeout(resolve, 100));
      if (isCancelled.current) return;

      let startAttempts = 0;
      const maxAttempts = 3;
      while (startAttempts < maxAttempts && !isCancelled.current) {
        try {
          startAttempts++;
          // Detener/limpiar cualquier instancia huérfana previa
          try {
            const oldScanner = new Html5Qrcode('credicrc-qr-reader');
            if (oldScanner) {
              await oldScanner.stop();
              oldScanner.clear();
            }
          } catch { /* ignorar */ }

          const scanner = new Html5Qrcode('credicrc-qr-reader', { verbose: false });
          scannerRef.current = scanner;

          // Constraints adaptativos para inicializar el scanner
          let cameraConfig: any = { facingMode: { ideal: 'environment' } };
          if (startAttempts === 2) {
            cameraConfig = { facingMode: 'environment' };
          } else if (startAttempts >= 3) {
            try {
              const devices = await Html5Qrcode.getCameras();
              if (devices && devices.length > 0) {
                const backCamera = devices.find(d => 
                  d.label.toLowerCase().includes('back') || 
                  d.label.toLowerCase().includes('trasera') || 
                  d.label.toLowerCase().includes('environment')
                );
                cameraConfig = backCamera ? backCamera.id : devices[0].id;
              }
            } catch {
              cameraConfig = { facingMode: 'environment' };
            }
          }

          await scanner.start(
            cameraConfig,
            QR_SCANNER_CONFIG,
            (decodedText) => {
              if (hasScanned.current || isCancelled.current) return;
              hasScanned.current = true;
              setStatus('success');
              setTimeout(() => {
                stopScanner().then(() => {
                  try {
                    const payload = JSON.parse(decodedText);
                    onScan(payload.token || decodedText);
                  } catch {
                    onScan(decodedText);
                  }
                });
              }, 600);
            },
            () => { /* frame sin QR — ignorar */ }
          );
          break; // éxito
        } catch (err: any) {
          if (startAttempts >= maxAttempts) {
            if (isCancelled.current) return;
            if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError' || err === 'Permission denied') {
              setStatus('denied');
            } else {
              setStatus('error');
              setErrorMsg(`Error al iniciar lector: ${err?.message || err}`);
            }
            return;
          }
          await new Promise(r => setTimeout(r, 200));
        }
      }
    };

    init();

    return () => {
      isCancelled.current = true;
      stopScanner();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRetry = async () => {
    isCancelled.current = false;
    hasScanned.current = false;
    setStatus('requesting');
    setErrorMsg('');
    await stopScanner();
    
    setStatus('scanning');
    await new Promise(resolve => setTimeout(resolve, 100));
    if (isCancelled.current) return;

    let startAttempts = 0;
    const maxAttempts = 3;
    while (startAttempts < maxAttempts && !isCancelled.current) {
      try {
        startAttempts++;
        const scanner = new Html5Qrcode('credicrc-qr-reader', { verbose: false });
        scannerRef.current = scanner;
        
        let cameraConfig: any = { facingMode: { ideal: 'environment' } };
        if (startAttempts === 2) {
          cameraConfig = { facingMode: 'environment' };
        } else if (startAttempts >= 3) {
          try {
            const devices = await Html5Qrcode.getCameras();
            if (devices && devices.length > 0) {
              const backCamera = devices.find(d => 
                d.label.toLowerCase().includes('back') || 
                d.label.toLowerCase().includes('trasera') || 
                d.label.toLowerCase().includes('environment')
              );
              cameraConfig = backCamera ? backCamera.id : devices[0].id;
            }
          } catch {
            cameraConfig = { facingMode: 'environment' };
          }
        }

        await scanner.start(
          cameraConfig,
          QR_SCANNER_CONFIG,
          (decodedText) => {
            if (hasScanned.current || isCancelled.current) return;
            hasScanned.current = true;
            setStatus('success');
            setTimeout(() => {
              stopScanner().then(() => {
                try { onScan(JSON.parse(decodedText).token || decodedText); } catch { onScan(decodedText); }
              });
            }, 600);
          },
          () => {}
        );
        break;
      } catch (err: any) {
        if (startAttempts >= maxAttempts) {
          if (isCancelled.current) return;
          if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError' || err === 'Permission denied') {
            setStatus('denied');
          } else {
            setStatus('error');
            setErrorMsg(`Error al iniciar lector: ${err?.message || err}`);
          }
          return;
        }
        await new Promise(r => setTimeout(r, 200));
      }
    }
  };

  const isSuccess = status === 'success';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="bg-gradient-to-r from-[#002855] to-[#073B73] p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Camera className="text-[#64B5F6] h-5 w-5"/>
            <h3 className="text-white font-black text-sm">Escanear QR del Trabajador</h3>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white transition">
            <X size={20}/>
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* ── El div del escáner SIEMPRE está en el DOM (crítico para html5-qrcode) ── */}
          <div style={{ display: (status === 'scanning' || status === 'success') ? 'block' : 'none' }} className="space-y-3">
            {/* Borde verde animado al detectar QR con éxito */}
            <div className={`relative rounded-xl overflow-hidden transition-all duration-300 ${
              isSuccess
                ? 'ring-4 ring-emerald-400 ring-offset-2 shadow-[0_0_24px_4px_rgba(52,211,153,0.5)]'
                : 'border-2 border-[#002855]/20'
            }`}>
              <div
                id="credicrc-qr-reader"
                className="w-full bg-black"
                style={{ minHeight: '280px' }}
              />
              {/* Overlay de éxito sobre el viewfinder */}
              {isSuccess && (
                <div className="absolute inset-0 bg-emerald-500/20 flex flex-col items-center justify-center gap-3 animate-pulse">
                  <div className="w-16 h-16 bg-emerald-500 rounded-full flex items-center justify-center shadow-xl">
                    <CheckCircle2 className="text-white h-9 w-9"/>
                  </div>
                  <span className="text-emerald-700 font-black text-sm bg-white/90 px-4 py-1.5 rounded-full shadow">¡QR Detectado!</span>
                </div>
              )}
            </div>
            {!isSuccess && (
              <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-blue-700 font-semibold">
                <QrCode size={14} className="flex-shrink-0"/>
                Apunta la cámara al QR del trabajador. Detección automática ultra-rápida.
              </div>
            )}
          </div>

          {status === 'requesting' && (
            <div className="flex flex-col items-center gap-3 py-8">
              <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center">
                <RefreshCw className="h-7 w-7 text-[#002855] animate-spin"/>
              </div>
              <p className="text-sm font-bold text-slate-700 text-center">Activando cámara...</p>
              <p className="text-xs text-slate-400 text-center">Preparando el escáner de alta velocidad.</p>
            </div>
          )}

          {status === 'denied' && (
            <div className="flex flex-col items-center gap-4 py-6">
              <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center border-2 border-red-200">
                <CameraOff className="h-7 w-7 text-red-500"/>
              </div>
              <div className="text-center space-y-2">
                <h4 className="font-black text-slate-800 text-sm">Acceso a la cámara denegado</h4>
                <p className="text-xs text-slate-500 leading-relaxed">
                  El <strong>Colegio Rafael Castillo</strong> requiere acceso a la cámara para verificar la identidad del personal mediante el sistema CrediCRC.
                </p>
              </div>
              <div className="w-full bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs space-y-2">
                <p className="font-black text-amber-800 flex items-center gap-1"><AlertTriangle size={12}/> Instrucciones para activar la cámara:</p>
                <ul className="text-amber-700 space-y-1 font-semibold list-none">
                  <li>📱 <strong>iOS Safari:</strong> Ajustes → Safari → Cámara → Permitir</li>
                  <li>🤖 <strong>Android Chrome:</strong> Menú ⋮ → Configuración del sitio → Cámara → Permitir</li>
                  <li>🌐 <strong>Otros:</strong> Toca el ícono de candado en la barra de dirección</li>
                </ul>
              </div>
              <button onClick={handleRetry} className="w-full bg-[#002855] hover:bg-[#073B73] text-white font-black py-3 px-4 rounded-xl text-sm transition flex items-center justify-center gap-2 shadow-lg">
                <Camera size={16}/> Dar Acceso a la Cámara
              </button>
            </div>
          )}

          {status === 'error' && (
            <div className="flex flex-col items-center gap-4 py-6">
              <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center border-2 border-red-200">
                <AlertCircle className="h-7 w-7 text-red-500"/>
              </div>
              <div className="text-center">
                <h4 className="font-black text-slate-800 text-sm mb-1">Error al iniciar la cámara</h4>
                <p className="text-xs text-slate-500">{errorMsg}</p>
              </div>
              <button onClick={handleRetry} className="w-full bg-[#002855] text-white font-black py-3 px-4 rounded-xl text-sm transition flex items-center justify-center gap-2">
                <RefreshCw size={14}/> Reintentar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── MODAL DE TÉRMINOS Y POLÍTICAS LEGALES ─────────────────────────────────────
function TermsAndPoliciesModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]">
        <div className="bg-gradient-to-r from-[#002855] to-[#073B73] p-6 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="text-emerald-400 h-6 w-6"/>
            <h3 className="font-black text-base tracking-wide">Términos de Uso y Política de Privacidad</h3>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white transition">
            <X size={22}/>
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6 text-slate-600 text-xs leading-relaxed text-left">
          <section className="space-y-2">
            <h4 className="font-black text-slate-800 text-sm border-b border-slate-100 pb-1">1. Consentimiento de Deducción por Nómina</h4>
            <p>
              Al registrarse como Trabajador en la plataforma CrediCRC, el usuario otorga su autorización expresa, irrevocable y directa a la institución educativa (Colegio Rafael Castillo) para aplicar descuentos automáticos directamente sobre su salario y bonificaciones de nómina ordinaria o extraordinaria, equivalentes al monto de las cuotas de financiamiento aquí autorizadas.
            </p>
          </section>

          <section className="space-y-2">
            <h4 className="font-black text-slate-800 text-sm border-b border-slate-100 pb-1">2. Código QR y Seguridad de Identidad</h4>
            <p>
              El código QR de autorización generado por la aplicación es dinámico, de un solo uso, intransferible y posee un tiempo de expiración riguroso de cinco (5) minutos. El usuario es el único responsable de la custodia de su cuenta y del acceso a su portal personal. CrediCRC no se hace responsable por transacciones realizadas debido al descuido en la confidencialidad de la cuenta o el QR.
            </p>
          </section>

          <section className="space-y-2">
            <h4 className="font-black text-slate-800 text-sm border-b border-slate-100 pb-1">3. Límites de Crédito y Nivelación</h4>
            <p>
              La directiva del colegio asigna los límites de compra basándose en la capacidad de pago declarada por nómina de cada trabajador. Los niveles de crédito se rigen por un sistema dinámico: el cumplimiento oportuno y puntual de los pagos directos o de cuotas permitirá subir de nivel y obtener mejores límites y tasas, mientras que los retrasos o impagos resultarán en el bloqueo inmediato del código QR y del portal de compras.
            </p>
          </section>

          <section className="space-y-2">
            <h4 className="font-black text-slate-800 text-sm border-b border-slate-100 pb-1">4. Confidencialidad y Protección de Datos (Privacidad)</h4>
            <p>
              CrediCRC se compromete a salvaguardar la privacidad de sus usuarios. Toda la información personal, correos electrónicos, salarios base y registros comerciales son encriptados en tránsito y en reposo mediante protocolos de seguridad avanzados (SHA-256 e intercambio de llaves cifradas con Supabase). Ningún dato financiero confidencial del colegio o de los trabajadores será compartido con terceros no autorizados.
            </p>
          </section>

          <section className="space-y-2">
            <h4 className="font-black text-slate-800 text-sm border-b border-slate-100 pb-1">5. Afiliación de Comercios y Liquidación de Comisiones</h4>
            <p>
              Los Proveedores Aliados declaran que toda la información provista al registrarse (RIF, Cuenta Bancaria de 20 dígitos y datos de Pago Móvil) es verídica y de su titularidad exclusiva. Las comisiones acordadas con la institución se deducirán del monto neto a transferir y se utilizarán de manera confidencial para fines administrativos y operativos del colegio.
            </p>
          </section>
        </div>

        <div className="bg-slate-50 p-4 border-t border-slate-100 flex justify-end">
          <button onClick={onClose} className="bg-[#002855] hover:bg-[#073B73] text-white text-xs font-black px-6 py-2.5 rounded-xl shadow-md transition">
            Entendido y Aceptar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── SUCCESS OVERLAY ─────────────────────────────────────────────────────────
function SuccessOverlay({ onClose }: { onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t); }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl p-10 shadow-2xl flex flex-col items-center gap-4 text-center max-w-sm mx-4">
        <div className="w-20 h-20 bg-gradient-to-br from-emerald-400 to-green-600 rounded-full flex items-center justify-center shadow-lg animate-bounce">
          <Check className="text-white h-10 w-10"/>
        </div>
        <h2 className="text-2xl font-black text-[#002855]">¡Compra Exitosa!</h2>
        <p className="text-slate-500 text-sm font-semibold">Transacción registrada y cuota programada en nómina. Se enviaron confirmaciones por correo.</p>
        <div className="flex gap-1">
          {[...Array(5)].map((_, i) => <Star key={i} size={16} className="text-amber-400 fill-amber-400"/>)}
        </div>
        <button onClick={onClose} className="text-xs text-slate-400 hover:text-slate-600 font-bold">Cerrar</button>
      </div>
    </div>
  );
}

// ─── AUTH CARD (fuera de App para evitar re-renders destructivos en móvil) ───
interface AuthCardProps {
  role: 'trabajador' | 'proveedor' | 'admin';
  authMode: 'login' | 'register' | 'forgot-password' | 'reset-password';
  setAuthMode: (m: 'login' | 'register' | 'forgot-password' | 'reset-password') => void;
  authEmail: string; setAuthEmail: (v: string) => void;
  authPassword: string; setAuthPassword: (v: string) => void;
  authName: string; setAuthName: (v: string) => void;
  authRoleSelection: 'trabajador' | 'proveedor'; setAuthRoleSelection: (v: 'trabajador' | 'proveedor') => void;
  authWorkerCedula: string; setAuthWorkerCedula: (v: string) => void;
  authWorkerCargo: CargoCRC; setAuthWorkerCargo: (v: CargoCRC) => void;
  authProviderCategoria: 'Carnes' | 'Víveres'; setAuthProviderCategoria: (v: 'Carnes' | 'Víveres') => void;
  authProviderCuenta: string; setAuthProviderCuenta: (v: string) => void;
  // Campos extendidos Módulo 4A
  authProviderRazonSocial: string; setAuthProviderRazonSocial: (v: string) => void;
  authProviderRif: string; setAuthProviderRif: (v: string) => void;
  authProviderDireccion: string; setAuthProviderDireccion: (v: string) => void;
  authProviderBancoCuenta: string; setAuthProviderBancoCuenta: (v: string) => void;
  authProviderPagoMovilBanco: string; setAuthProviderPagoMovilBanco: (v: string) => void;
  authProviderPagoMovilCedula: string; setAuthProviderPagoMovilCedula: (v: string) => void;
  authProviderPagoMovilTelefono: string; setAuthProviderPagoMovilTelefono: (v: string) => void;
  // Aceptación de términos
  aceptoTerminos: boolean; setAceptoTerminos: (v: boolean) => void;
  setShowTermsModal: (v: boolean) => void;
  isAuthSubmitting: boolean;
  onLogin: (e: React.FormEvent) => void;
  onRegister: (e: React.FormEvent) => void;
  // Nuevos campos recuperación
  newPassword?: string; setNewPassword?: (v: string) => void;
  confirmNewPassword?: string; setConfirmNewPassword?: (v: string) => void;
  onSubmitForgotPassword?: (e: React.FormEvent) => void;
  onSubmitResetPassword?: (e: React.FormEvent) => void;
}

const AuthCard = memo(function AuthCard({
  role, authMode, setAuthMode, authEmail, setAuthEmail, authPassword, setAuthPassword,
  authName, setAuthName, setAuthRoleSelection,
  authWorkerCedula, setAuthWorkerCedula, authWorkerCargo, setAuthWorkerCargo,
  authProviderCategoria, setAuthProviderCategoria, authProviderCuenta: _unused,
  authProviderRazonSocial, setAuthProviderRazonSocial,
  authProviderRif, setAuthProviderRif,
  authProviderDireccion, setAuthProviderDireccion,
  authProviderBancoCuenta, setAuthProviderBancoCuenta,
  authProviderPagoMovilBanco, setAuthProviderPagoMovilBanco,
  authProviderPagoMovilCedula, setAuthProviderPagoMovilCedula,
  authProviderPagoMovilTelefono, setAuthProviderPagoMovilTelefono,
  aceptoTerminos, setAceptoTerminos, setShowTermsModal,
  isAuthSubmitting, onLogin, onRegister,
  newPassword = '', setNewPassword,
  confirmNewPassword = '', setConfirmNewPassword,
  onSubmitForgotPassword, onSubmitResetPassword
}: AuthCardProps) {
  const isAdmin = role === 'admin';
  
  const getFormSubmitHandler = () => {
    if (authMode === 'login') return onLogin;
    if (authMode === 'register') return onRegister;
    if (authMode === 'forgot-password') return onSubmitForgotPassword;
    if (authMode === 'reset-password') return onSubmitResetPassword;
    return (e: React.FormEvent) => e.preventDefault();
  };

  return (
    <div className="max-w-md mx-auto my-12 bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden animate-fade-in text-left">
      <div className={`text-white p-6 text-center space-y-2 relative ${isAdmin ? 'bg-gradient-to-br from-[#002855] to-[#E53935]/80' : role === 'proveedor' ? 'bg-gradient-to-br from-[#002855] to-[#64B5F6]/60' : 'bg-gradient-to-br from-[#002855] to-[#073B73]'}`}>
        <div className="absolute top-4 right-4 bg-white/10 text-white text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">
          {authMode === 'forgot-password' ? 'Recuperación' : authMode === 'reset-password' ? 'Nueva Clave' : isAdmin ? 'Panel Admin' : role === 'proveedor' ? 'Punto de Venta' : 'Módulo Trabajador'}
        </div>
        <div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-2">
          {authMode === 'forgot-password' || authMode === 'reset-password' ? (
            <Lock className="h-6 w-6 text-amber-300 animate-pulse"/>
          ) : isAdmin ? (
            <Sliders className="h-6 w-6 text-[#E53935]"/>
          ) : role === 'proveedor' ? (
            <ShoppingBag className="h-6 w-6 text-[#64B5F6]"/>
          ) : (
            <User className="h-6 w-6 text-amber-300"/>
          )}
        </div>
        <h3 className="text-lg font-black">
          {authMode === 'forgot-password' ? 'Recuperar Contraseña' : authMode === 'reset-password' ? 'Restablecer Contraseña' : isAdmin ? 'Panel de Control Colegio' : role === 'proveedor' ? 'Punto de Venta' : 'Portal del Trabajador'}
        </h3>
        <p className="text-xs text-slate-200 font-semibold">
          {authMode === 'forgot-password' ? 'Ingresa tu correo para recibir el enlace de restablecimiento' : authMode === 'reset-password' ? 'Introduce tu nueva contraseña de seguridad' : isAdmin ? 'Ingresa tus credenciales de directivo' : `Accede como ${role === 'proveedor' ? 'comercio aliado' : 'personal del colegio'}`}
        </p>
      </div>
      
      {!isAdmin && (authMode === 'login' || authMode === 'register') && (
        <div className="flex border-b border-slate-200 bg-slate-50">
          {(['login', 'register'] as const).map(m => (
            <button key={m} type="button" onClick={() => { setAuthMode(m); if (m === 'register') setAuthRoleSelection(role as 'trabajador' | 'proveedor'); }}
              className={`flex-1 py-3 text-center text-xs font-bold transition-all ${authMode === m ? 'bg-white border-b-2 border-[#002855] text-[#002855]' : 'text-slate-500 hover:text-slate-700'}`}>
              {m === 'login' ? 'Iniciar Sesión' : 'Registrarse'}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={getFormSubmitHandler()} className="p-6 space-y-4">
        {/* ── VISTA: RESTABLECER CONTRASEÑA (RESET PASSWORD) ── */}
        {authMode === 'reset-password' && (
          <>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase block">Nueva Contraseña</label>
              <input
                type="password" required value={newPassword} onChange={e => setNewPassword?.(e.target.value)}
                placeholder="Mínimo 5 caracteres"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-none focus:border-[#002855] transition font-semibold"/>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase block">Confirmar Nueva Contraseña</label>
              <input
                type="password" required value={confirmNewPassword} onChange={e => setConfirmNewPassword?.(e.target.value)}
                placeholder="Repite la contraseña"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-none focus:border-[#002855] transition font-semibold"/>
            </div>
            <button type="submit" disabled={isAuthSubmitting}
              className="w-full bg-[#00A2E8] text-white hover:bg-[#008bbf] transition p-3 rounded-lg text-xs font-bold shadow-md disabled:opacity-40 mt-2 flex items-center justify-center gap-2">
              {isAuthSubmitting && <RefreshCw size={12} className="animate-spin"/>}
              Actualizar Contraseña
            </button>
            <button type="button" onClick={() => setAuthMode('login')}
              className="text-[11px] text-slate-500 hover:text-[#002855] hover:underline font-bold block text-center mx-auto mt-2">
              Volver al Iniciar Sesión
            </button>
          </>
        )}

        {/* ── VISTA: RECUPERAR CONTRASEÑA (FORGOT PASSWORD) ── */}
        {authMode === 'forgot-password' && (
          <>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase block">Correo Electrónico Registrado</label>
              <input
                type="email" required value={authEmail} onChange={e => setAuthEmail(e.target.value)}
                placeholder="correo@ejemplo.com"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-none focus:border-[#002855] transition font-semibold"/>
            </div>
            <button type="submit" disabled={isAuthSubmitting}
              className="w-full bg-[#002855] text-white hover:bg-[#0b3c70] transition p-3 rounded-lg text-xs font-bold shadow-md disabled:opacity-40 mt-2 flex items-center justify-center gap-2">
              {isAuthSubmitting && <RefreshCw size={12} className="animate-spin"/>}
              Enviar Enlace de Recuperación
            </button>
            <button type="button" onClick={() => setAuthMode('login')}
              className="text-[11px] text-slate-500 hover:text-[#002855] hover:underline font-bold block text-center mx-auto mt-2">
              Volver al Iniciar Sesión
            </button>
          </>
        )}

        {/* ── VISTAS TRADICIONALES: LOGIN O REGISTRO ── */}
        {(authMode === 'login' || authMode === 'register') && (
          <>
            {authMode === 'register' && !isAdmin && (
              <>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase block">{role === 'proveedor' ? 'Nombre del Establecimiento' : 'Nombre Completo'}</label>
                  <input type="text" required value={authName} onChange={e => setAuthName(e.target.value)}
                    autoComplete="name"
                    placeholder={role === 'proveedor' ? 'Ej: Carnicería El Toro' : 'Ej: Prof. Juan García'}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-none focus:border-[#002855] transition font-semibold"/>
                </div>
                {role === 'trabajador' ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase block">Cédula</label>
                      <input type="text" required value={authWorkerCedula} onChange={e => setAuthWorkerCedula(e.target.value)}
                        autoComplete="off" placeholder="V-12.345.678"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-none focus:border-[#002855] transition font-semibold"/>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase block">Cargo</label>
                      <select value={authWorkerCargo} onChange={e => setAuthWorkerCargo(e.target.value as CargoCRC)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-none focus:border-[#002855] transition font-bold">
                        {STANDARD_CARGOS.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase block">Categoría</label>
                        <select value={authProviderCategoria} onChange={e => setAuthProviderCategoria(e.target.value as 'Carnes' | 'Víveres')}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-none focus:border-[#002855] transition font-bold">
                          <option>Carnes</option><option>Víveres</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase block">Razón Social</label>
                        <input type="text" value={authProviderRazonSocial} onChange={e => setAuthProviderRazonSocial(e.target.value)}
                          placeholder="Nombre legal del negocio"
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-none focus:border-[#002855] transition font-semibold"/>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase block">RIF *</label>
                        <input type="text" required value={authProviderRif} onChange={e => setAuthProviderRif(e.target.value)}
                          placeholder="J-12345678-9"
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-none focus:border-[#002855] transition font-mono font-semibold"/>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase block">Cuenta Bancaria (20 díg.) *</label>
                        <input type="text" required value={authProviderBancoCuenta} onChange={e => setAuthProviderBancoCuenta(e.target.value.replace(/\D/g,'').slice(0,20))}
                          placeholder="00000000000000000000"
                          maxLength={20} pattern="[0-9]{20}"
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-none focus:border-[#002855] transition font-mono font-semibold"/>
                        <p className="text-[9px] text-slate-400">{authProviderBancoCuenta.length}/20 dígitos</p>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase block">Dirección Física del Comercio *</label>
                      <input type="text" required value={authProviderDireccion} onChange={e => setAuthProviderDireccion(e.target.value)}
                        placeholder="Ej: Av. Libertador, C.C. Centro, Local 4-B"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-none focus:border-[#002855] transition font-semibold"/>
                    </div>
                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 space-y-2">
                      <p className="text-[10px] font-black text-[#002855] uppercase tracking-wider">Datos de Pago Móvil *</p>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="text-[9px] font-bold text-slate-500 block mb-1">Banco</label>
                          <input type="text" required value={authProviderPagoMovilBanco} onChange={e => setAuthProviderPagoMovilBanco(e.target.value)}
                            placeholder="Mercantil"
                            className="w-full bg-white border border-slate-200 rounded-lg p-2 text-[10px] focus:outline-none focus:border-[#002855] transition font-semibold"/>
                        </div>
                        <div>
                          <label className="text-[9px] font-bold text-slate-500 block mb-1">Cédula/RIF</label>
                          <input type="text" required value={authProviderPagoMovilCedula} onChange={e => setAuthProviderPagoMovilCedula(e.target.value)}
                            placeholder="J-12345678"
                            className="w-full bg-white border border-slate-200 rounded-lg p-2 text-[10px] focus:outline-none focus:border-[#002855] transition font-mono font-semibold"/>
                        </div>
                        <div>
                          <label className="text-[9px] font-bold text-slate-500 block mb-1">Teléfono</label>
                          <input type="tel" required value={authProviderPagoMovilTelefono} onChange={e => setAuthProviderPagoMovilTelefono(e.target.value)}
                            placeholder="0414-..."
                            className="w-full bg-white border border-slate-200 rounded-lg p-2 text-[10px] focus:outline-none focus:border-[#002855] transition font-semibold"/>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase block">Correo Electrónico</label>
              <input
                type="email" required value={authEmail} onChange={e => setAuthEmail(e.target.value)}
                autoComplete="email"
                placeholder={isAdmin ? 'admin@credicrc.com' : 'correo@ejemplo.com'}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-none focus:border-[#002855] transition font-semibold"/>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-bold text-slate-500 uppercase block">Contraseña</label>
                {authMode === 'login' && (
                  <button type="button" onClick={() => setAuthMode('forgot-password')} className="text-[9px] text-[#00A2E8] hover:text-[#002855] hover:underline font-bold transition">
                    ¿Olvidaste tu contraseña?
                  </button>
                )}
              </div>
              <input
                type="password" required value={authPassword} onChange={e => setAuthPassword(e.target.value)}
                autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                placeholder="••••••••"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-none focus:border-[#002855] transition font-semibold"/>
            </div>
            {authMode === 'register' && (
              <div className="flex items-start gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200 text-[10px]">
                <input
                  type="checkbox"
                  id="acepto-terminos-cb"
                  checked={aceptoTerminos}
                  onChange={e => setAceptoTerminos(e.target.checked)}
                  className="mt-0.5 h-3.5 w-3.5 text-[#002855] focus:ring-[#002855] border-slate-300 rounded cursor-pointer"
                />
                <label htmlFor="acepto-terminos-cb" className="text-slate-600 font-semibold leading-relaxed cursor-pointer select-none">
                  Acepto los{' '}
                  <button
                    type="button"
                    onClick={() => setShowTermsModal(true)}
                    className="text-blue-600 font-black hover:underline cursor-pointer"
                  >
                    Términos de Uso y Políticas de Privacidad
                  </button>{' '}
                  de la plataforma.
                </label>
              </div>
            )}
            <button type="submit" disabled={isAuthSubmitting || (authMode === 'register' && !aceptoTerminos)}
              className="w-full bg-[#002855] text-white hover:bg-[#0b3c70] transition p-3 rounded-lg text-xs font-bold shadow-md disabled:opacity-40 mt-2 flex items-center justify-center gap-2">
              {isAuthSubmitting && <RefreshCw size={12} className="animate-spin"/>}
              {authMode === 'login' ? (isAdmin ? 'Ingresar al Panel' : 'Iniciar Sesión') : 'Enviar Solicitud'}
            </button>
          </>
        )}
      </form>
      <div className="bg-slate-50 px-6 py-3 border-t border-slate-100 text-[10px] text-slate-500 text-center font-semibold">
        {isAdmin ? 'Acceso restringido al personal autorizado del Colegio Rafael Castillo.' : authMode === 'login' ? 'Sin cuenta? Regístrate en la pestaña Registrarse.' : authMode === 'forgot-password' ? 'Te enviaremos un enlace de recuperación único.' : authMode === 'reset-password' ? 'Ingresa una nueva contraseña segura.' : 'Tu cuenta estará Pendiente hasta que el admin la apruebe.'}
      </div>
    </div>
  );
});

// ─── MAIN APP ────────────────────────────────────────────────────────────────
export default function App() {
  // --- Estados Generales ---
  const [activeRole, setActiveRole] = useState<'inicio' | 'trabajador' | 'proveedor' | 'admin'>(() => {
    return (localStorage.getItem('credicrc_active_role') as any) || 'inicio';
  });
  const [bcvRate, setBcvRate] = useState<number>(36.85);
  const [logoError, setLogoError] = useState<boolean>(false);
  // const [isSeeding, setIsSeeding] = useState<boolean>(false); // Deshabilitado — botón de reseed bloqueado en producción
  const [showSuccessOverlay, setShowSuccessOverlay] = useState<boolean>(false);

  // --- Auth ---
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(() => {
    const saved = localStorage.getItem('credicrc_current_user');
    try {
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [systemUsers, setSystemUsers] = useState<UserAccount[]>([]);
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'forgot-password' | 'reset-password'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [authRoleSelection, setAuthRoleSelection] = useState<'trabajador' | 'proveedor'>('trabajador');
  const [authWorkerCedula, setAuthWorkerCedula] = useState('');
  const [authWorkerCargo, setAuthWorkerCargo] = useState<CargoCRC>('Docente');
  const [authProviderCategoria, setAuthProviderCategoria] = useState<'Carnes' | 'Víveres'>('Carnes');
  // authProviderCuenta reemplazado por authProviderBancoCuenta en el nuevo flujo de registro Módulo 4A
  // ─ Campos extendidos de registro de proveedor (Módulo 4A)
  const [authProviderRazonSocial, setAuthProviderRazonSocial] = useState('');
  const [authProviderRif, setAuthProviderRif] = useState('');
  const [authProviderDireccion, setAuthProviderDireccion] = useState('');
  const [authProviderBancoCuenta, setAuthProviderBancoCuenta] = useState('');
  const [authProviderPagoMovilBanco, setAuthProviderPagoMovilBanco] = useState('');
  const [authProviderPagoMovilCedula, setAuthProviderPagoMovilCedula] = useState('');
  const [authProviderPagoMovilTelefono, setAuthProviderPagoMovilTelefono] = useState('');
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
  // --- Políticas y Términos Legales (Google Play / cumplimiento legal) ---
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [aceptoTerminos, setAceptoTerminos] = useState(false);


  // --- Aprobación de cuentas ---
  const [approvingUserId, setApprovingUserId] = useState<string | null>(null);
  const [approveSalary, setApproveSalary] = useState('350');
  const [approveAntiguedad, setApproveAntiguedad] = useState('3');
  const [approveComision, setApproveComision] = useState('4.0');

  // --- Notificaciones ---
  const [notifications, setNotifications] = useState<SystemNotification[]>([{
    id: 'init', timestamp: new Date(), type: 'info',
    title: 'Sistema CrediCRC v2.0', message: 'Base de datos conectada. Sincronizando tasa BCV...'
  }]);

  // --- Datos BD ---
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [directPayments, setDirectPayments] = useState<DirectPayment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // --- Selección activa ---
  const [activeWorkerId, setActiveWorkerId] = useState(() => {
    return localStorage.getItem('credicrc_active_worker_id') || '';
  });
  const [activeProviderId, setActiveProviderId] = useState(() => {
    return localStorage.getItem('credicrc_active_provider_id') || '';
  });

  // --- QR de identidad (persistido en BD) ---
  const [activeQR, setActiveQR] = useState<ActiveQR | null>(null);
  const [qrCountdown, setQrCountdown] = useState(0);
  const qrTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showQRModal, setShowQRModal] = useState(false);
  const [isGeneratingQR, setIsGeneratingQR] = useState(false);

  // --- Módulo Trabajador: pago directo ---
  const [showDirectPaymentModal, setShowDirectPaymentModal] = useState(false);
  const [selectedInstallmentId, setSelectedInstallmentId] = useState('');
  const [directPayAmount, setDirectPayAmount] = useState('');
  const [directPayRef, setDirectPayRef] = useState('');
  const [directPayFile, setDirectPayFile] = useState<File | null>(null);
  const [directPayType, setDirectPayType] = useState<'Pago Móvil' | 'Transferencia'>('Pago Móvil');
  const [directPayBank, setDirectPayBank] = useState('');
  const [directPayPhone, setDirectPayPhone] = useState('');
  const [directPayCedula, setDirectPayCedula] = useState('');
  const [isUploadingPayment, setIsUploadingPayment] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);

  // --- Módulo Proveedor: nuevo flujo ---
  const [showQRScannerModal, setShowQRScannerModal] = useState(false);
  const [scannedToken, setScannedToken] = useState<string | null>(null);
  // Datos del trabajador obtenidos del QR (antes de ingresar el monto)
  const [scannedWorkerInfo, setScannedWorkerInfo] = useState<{
    nombre: string; cedula: string; nivel: number; limite_disponible: number;
  } | null>(null);
  // Monto ingresado por el proveedor
  const [posAmount, setPosAmount] = useState('');
  const [posDays, setPosDays] = useState(15);
  const [aplicaInicial, setAplicaInicial] = useState(true);
  const [inicialConfirmada, setInicialConfirmada] = useState(false); // Módulo 2: confirmación de recepción de inicial
  const [selectedReportMonth, setSelectedReportMonth] = useState('');
  const [providerSubTab, setProviderSubTab] = useState<'sales' | 'report' | 'profile'>('sales');
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  // --- Paginación historial ventas proveedor ---
  const [salesPage, setSalesPage] = useState(1);
  const SALES_PER_PAGE = 10;
  const [isValidating, setIsValidating] = useState(false);
  const [isProcessingPurchase, setIsProcessingPurchase] = useState(false);
  // --- Red: reintentos silenciosos tras escaneo ---
  const [scanRetrying, setScanRetrying] = useState(false);
  const [scanRetryCount, setScanRetryCount] = useState(0);
  const pendingTokenRef = useRef<string | null>(null);

  // --- Admin ---
  const [adminSearchWorker, setAdminSearchWorker] = useState('');
  const [selectedWorkerForEdit, setSelectedWorkerForEdit] = useState<Worker | null>(null);
  const [editSalary, setEditSalary] = useState('');
  const [editLimitOverride, setEditLimitOverride] = useState('');
  const [bulkCargo, setBulkCargo] = useState<CargoCRC>('Docente');
  const [bulkLimit, setBulkLimit] = useState('200');
  const [bulkSalary, setBulkSalary] = useState('');
  const [isApplyingBulk, setIsApplyingBulk] = useState(false);
  const [payrollFilterDate, setPayrollFilterDate] = useState('');
  const [isProcessingPayroll, setIsProcessingPayroll] = useState(false);
  const [showAddWorkerModal, setShowAddWorkerModal] = useState(false);
  const [newWorkerNombre, setNewWorkerNombre] = useState('');
  const [newWorkerCedula, setNewWorkerCedula] = useState('');
  const [newWorkerCargo, setNewWorkerCargo] = useState<CargoCRC>('Docente');
  const [newWorkerSalario, setNewWorkerSalario] = useState('300');
  const [newWorkerAntiguedad, setNewWorkerAntiguedad] = useState('0');
  const [isRegisteringWorker, setIsRegisteringWorker] = useState(false);
  const [showAddProviderModal, setShowAddProviderModal] = useState(false);
  const [newProviderNombre, setNewProviderNombre] = useState('');
  const [newProviderCategoria, setNewProviderCategoria] = useState<'Carnes' | 'Víveres'>('Carnes');
  const [newProviderCuenta, setNewProviderCuenta] = useState('');
  const [newProviderComision, setNewProviderComision] = useState('4.0');
  const [isRegisteringProvider, setIsRegisteringProvider] = useState(false);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [editProviderNombre, setEditProviderNombre] = useState('');
  const [editProviderCategoria, setEditProviderCategoria] = useState<'Carnes' | 'Víveres'>('Carnes');
  const [editProviderCuenta, setEditProviderCuenta] = useState('');
  const [editProviderComision, setEditProviderComision] = useState('4.0');
  const [isSavingProvider, setIsSavingProvider] = useState(false);
  const [isDeletingProviderId, setIsDeletingProviderId] = useState<string | null>(null);
  const [processingDirectPayId, setProcessingDirectPayId] = useState<string | null>(null);
  const [adminTab, setAdminTab] = useState<'dashboard' | 'workers' | 'payroll' | 'providers' | 'direct-payments' | 'gamification' | 'tesoreria' | 'notificaciones'>('dashboard');
  // ─ Perfil de Comercio (Módulo 4B)
  const [editProviderDireccion, setEditProviderDireccion] = useState('');
  const [editProviderTelefono, setEditProviderTelefono] = useState('');
  const [editProviderPagoMovilBanco, setEditProviderPagoMovilBanco] = useState('');
  const [editProviderPagoMovilCedula, setEditProviderPagoMovilCedula] = useState('');
  const [editProviderPagoMovilTelefono, setEditProviderPagoMovilTelefono] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // --- Estados del Módulo de Notificaciones Push (Vercel API) ---
  const [pushAudience, setPushAudience] = useState<'todos' | 'profesores' | 'proveedores'>('todos');
  const [pushTitle, setPushTitle] = useState('');
  const [pushBody, setPushBody] = useState('');
  const [pushRedirect, setPushRedirect] = useState('/');
  const [isSendingPush, setIsSendingPush] = useState(false);
  const [pushStatus, setPushStatus] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);

  // --- Estados del Módulo de Notificaciones de Correo Masivo (Supabase Edge Function) ---
  const [emailNotificationSubTab, setEmailNotificationSubTab] = useState<'push' | 'email'>('push');
  const [emailAudience, setEmailAudience] = useState<'todos' | 'profesores' | 'proveedores'>('todos');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailTitle, setEmailTitle] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailStatus, setEmailStatus] = useState<string | null>(null);

  // --- Módulo Conciliación y Liquidación de Proveedores (Sección 29) ---
  const [liquidaciones, setLiquidaciones] = useState<LiquidacionRecord[]>([]);
  const [providerAdminSubTab, setProviderAdminSubTab] = useState<'conciliacion' | 'historial'>('conciliacion');
  const [showLiquidarModal, setShowLiquidarModal] = useState<string | null>(null); // proveedor_id
  const [showComisionModal, setShowComisionModal] = useState<string | null>(null); // proveedor_id
  const [refLiquidacion, setRefLiquidacion] = useState('');
  const [refComision, setRefComision] = useState('');
  const [isProcessingLiquidacion, setIsProcessingLiquidacion] = useState(false);
  const [isProcessingComision, setIsProcessingComision] = useState(false);

  // --- Landing config ---
  const [editorTab, setEditorTab] = useState<'hero' | 'politicas' | 'banco'>('hero');
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [landingConfig, setLandingConfig] = useState<LandingConfig>({
    hero_title: 'Ecosistema Financiero Digital',
    hero_description: 'Adquiere alimentos y víveres con descuento directo por nómina. Un sistema seguro, ágil y transparente exclusivo para el personal del Colegio Rafael Castillo.',
    portal_trabajador_title: 'Portal del Trabajador',
    portal_trabajador_description: 'Consulta tu saldo disponible, genera tu código QR de identidad y muéstralo al comercio. El sistema calcula automáticamente tu cuota según tu nivel.',
    portal_proveedor_title: 'Punto de Venta Proveedor',
    portal_proveedor_description: 'Escanea el QR del trabajador con tu cámara, ingresa el monto de la compra y el sistema calcula la inicial automáticamente según el nivel del trabajador.',
    portal_admin_title: 'Panel Administrativo',
    portal_admin_description: 'Configura límites masivos, aprueba cuentas, gestiona gamificación de niveles, concilia pagos directos y liquida proveedores.',
    politicas_financiamiento_title: 'Políticas de Financiamiento Escolar',
    politicas_financiamiento_description: 'El personal cuenta con límite automático del 50% de su salario. Las cuotas se descuentan en la nómina quincenal, indexadas al BCV.',
    estabilidad_seguridad_title: 'Seguridad y Concurrencia Blindada',
    estabilidad_seguridad_description: 'Transacciones atómicas con bloqueos FOR UPDATE. QR de identidad con firma criptográfica, válidos por 5 minutos. Montos calculados en backend según nivel del trabajador. RLS activo en todas las tablas.',
    colegio_banco: 'Banco de Venezuela',
    colegio_cuenta: '0102-0987-65-4321098765',
    colegio_rif: 'G-20012345-6',
    colegio_nombre: 'U.E. Colegio Rafael Castillo'
  });

  // ─── NOTIFICACIONES ─────────────────────────────────────────────────────────
  const addNotification = useCallback((type: SystemNotification['type'], title: string, message: string) => {
    setNotifications(prev => [{ id: Math.random().toString(), timestamp: new Date(), type, title, message }, ...prev.slice(0, 19)]);
  }, []);

  // ─── TASA BCV ────────────────────────────────────────────────────────────────
  const fetchBcvRate = useCallback(async () => {
    try {
      const r = await fetch('https://ve.dolarapi.com/v1/dolares/oficial');
      if (!r.ok) throw new Error('API no disponible');
      const d = await r.json();
      const rate = d.promedio ?? d.venta;
      if (typeof rate === 'number') { setBcvRate(rate); addNotification('success', 'Tasa BCV Sincronizada', `Bs. ${rate.toFixed(2)} / USD`); }
    } catch { addNotification('warning', 'Tasa BCV Manual', `Usando Bs. ${bcvRate.toFixed(2)} / USD`); }
  }, [bcvRate, addNotification]);

  // ─── FETCH DATA ──────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [wRes, pRes, tRes, cRes, uRes, cfgRes, dpRes, liqRes] = await Promise.all([
        supabase.from('trabajadores_crc').select('*').order('nombre'),
        supabase.from('proveedores_aliados').select('*').order('nombre'),
        supabase.from('transacciones_credicrc').select('*, trabajadores_crc(*), proveedores_aliados(*)').order('fecha_transaccion', { ascending: false }),
        supabase.from('cronograma_cuotas').select('*, transacciones_credicrc(*, trabajadores_crc(*), proveedores_aliados(*))').order('fecha_cobro'),
        supabase.from('usuarios_credicrc').select('*').order('created_at', { ascending: false }),
        supabase.from('configuracion_inicio').select('*').eq('id', 1).maybeSingle(),
        supabase.from('pagos_directos_credicrc').select('*, cronograma_cuotas(*), trabajadores_crc(*)').order('created_at', { ascending: false }),
        supabase.from('historial_liquidaciones').select('*, proveedores_aliados(nombre)').order('fecha_corte', { ascending: false }),
      ]);

      const pw = (wRes.data || []).map((w: DBWorker): Worker => ({
        ...w, salario_base: parseFloat(w.salario_base as string),
        limite_personalizado: w.limite_personalizado ? parseFloat(w.limite_personalizado as string) : null,
        limite_total: parseFloat(w.limite_total as string),
        limite_disponible: parseFloat(w.limite_disponible as string),
        nivel_credito: w.nivel_credito ?? 1,
        pagos_puntuales_consecutivos: w.pagos_puntuales_consecutivos ?? 0,
        qr_bloqueado: w.qr_bloqueado ?? false,
      }));
      setWorkers(pw);
      if (pw.length > 0 && !activeWorkerId) setActiveWorkerId(pw[0].id);

      setProviders(pRes.data || []);
      if (pRes.data && pRes.data.length > 0 && !activeProviderId) setActiveProviderId(pRes.data[0].id);

      const pt = (tRes.data || []).map((t: any): Transaction => ({
        ...t,
        monto_usd: parseFloat(t.monto_usd), tasa_bcv: parseFloat(t.tasa_bcv),
        monto_ves: parseFloat(t.monto_ves), monto_inicial_pagado_usd: parseFloat(t.monto_inicial_pagado_usd),
        comision_monto_usd: parseFloat(t.comision_monto_usd),
        trabajadores_crc: t.trabajadores_crc ? { ...t.trabajadores_crc, salario_base: parseFloat(t.trabajadores_crc.salario_base), limite_total: parseFloat(t.trabajadores_crc.limite_total), limite_disponible: parseFloat(t.trabajadores_crc.limite_disponible), limite_personalizado: t.trabajadores_crc.limite_personalizado ? parseFloat(t.trabajadores_crc.limite_personalizado) : null, nivel_credito: t.trabajadores_crc.nivel_credito ?? 1, pagos_puntuales_consecutivos: t.trabajadores_crc.pagos_puntuales_consecutivos ?? 0, qr_bloqueado: t.trabajadores_crc.qr_bloqueado ?? false } : undefined,
      }));
      setTransactions(pt);

      const pi = (cRes.data || []).map((c: any): Installment => ({
        ...c, monto_usd: parseFloat(c.monto_usd),
        tasa_bcv_pago: c.tasa_bcv_pago ? parseFloat(c.tasa_bcv_pago) : null,
        monto_ves_pagado: c.monto_ves_pagado ? parseFloat(c.monto_ves_pagado) : null,
      }));
      setInstallments(pi);

      setSystemUsers(uRes.data || []);
      if (cfgRes.data) setLandingConfig(cfgRes.data);
      setDirectPayments((dpRes.data || []) as DirectPayment[]);
      setLiquidaciones((liqRes.data || []) as LiquidacionRecord[]);

      const pending = pi.filter(i => i.estatus === 'Pendiente').map(i => i.fecha_cobro);
      if (pending.length > 0 && !payrollFilterDate) setPayrollFilterDate(pending[0]);
    } catch (err: any) {
      addNotification('error', 'Error de Conexión', err.message || 'Error cargando datos');
    } finally {
      setIsLoading(false);
    }
  }, [activeWorkerId, activeProviderId, payrollFilterDate, addNotification]);

  useEffect(() => {
    fetchData();
    fetchBcvRate();

    // ─── DETECTOR DE ENLACE DE RESTABLECIMIENTO DE CLAVE ───
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const path = window.location.pathname;
    if (path === '/reset-password' || token) {
      if (token) {
        setResetToken(token);
        setAuthMode('reset-password');
        // Limpiar los query parameters de la URL de forma elegante sin recargar la página
        window.history.replaceState({}, document.title, window.location.pathname);
      } else {
        addNotification('error', 'Enlace Inválido', 'El enlace no contiene un token de restablecimiento válido.');
      }
    }
  }, [addNotification]);

  // ─── PERSISTENCIA DE SESIÓN A LOCALSTORAGE ───
  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('credicrc_current_user', JSON.stringify(currentUser));
    } else {
      localStorage.removeItem('credicrc_current_user');
    }
  }, [currentUser]);

  useEffect(() => {
    localStorage.setItem('credicrc_active_role', activeRole);
  }, [activeRole]);

  useEffect(() => {
    localStorage.setItem('credicrc_active_worker_id', activeWorkerId);
  }, [activeWorkerId]);

  useEffect(() => {
    localStorage.setItem('credicrc_active_provider_id', activeProviderId);
  }, [activeProviderId]);

  // ─── DETECTOR DE INSTALACIÓN PWA ───
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    const handleAppInstalled = () => {
      setIsInstallable(false);
      setDeferredPrompt(null);
      addNotification('success', '¡Aplicación Instalada!', 'CrediCRC se ha instalado correctamente en tu dispositivo.');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone) {
      setIsInstallable(false);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [addNotification]);

  const handleInstallPWA = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstallable(false);
      setDeferredPrompt(null);
    }
  };

  // ─── PUSH NOTIFICATIONS REGISTER HOOK ───
  useEffect(() => {
    if (currentUser?.id) {
      const timer = setTimeout(() => {
        registerPushNotifications(currentUser.id);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [currentUser]);

  // ─── AUTO-SYNC BCV CADA 30 MIN ───────────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => { fetchBcvRate(); }, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchBcvRate]);

  // ─── TIMER QR (auto-cierre al expirar) ──────────────────────────────────────
  useEffect(() => {
    if (qrCountdown > 0) {
      qrTimerRef.current = setTimeout(() => setQrCountdown(p => p - 1), 1000);
    } else if (qrCountdown === 0 && activeQR) {
      addNotification('warning', 'QR Expirado', `El código de ${activeQR.workerName} ha expirado.`);
      // Auto-cierre del modal a los 3 seg para forzar regeneración
      const closeTimer = setTimeout(() => {
        setActiveQR(null);
        setShowQRModal(false);
      }, 3000);
      return () => clearTimeout(closeTimer);
    }
    return () => { if (qrTimerRef.current) clearTimeout(qrTimerRef.current); };
  }, [qrCountdown, activeQR, addNotification]);

  // ─── REALTIME SYNC (auto-actualización trabajador al procesar compra) ──────────
  useEffect(() => {
    if (!activeWorkerId) return;

    // Suscribirse a inserciones de transacciones para este trabajador en tiempo real
    const channel = supabase
      .channel(`worker-txs-${activeWorkerId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'transacciones_credicrc',
          filter: `trabajador_id=eq.${activeWorkerId}`
        },
        (payload: any) => {
          // Recargar datos del trabajador silenciosamente en segundo plano
          void fetchData();
          // Cerrar modal de QR e invalidar token local
          setShowQRModal(false);
          setActiveQR(null);
          // Feedback de éxito en tiempo real
          addNotification('success', '¡Compra Autorizada!', `Tu transacción por $${parseFloat(payload.new.monto_usd || '0').toFixed(2)} ha sido procesada con éxito.`);
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeWorkerId, addNotification, fetchData]);

  // ─── AUTH ────────────────────────────────────────────────────────────────────

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAuthSubmitting(true);
    try {
      const pwHash = await hashPassword(authPassword);
      const email  = authEmail.trim().toLowerCase();

      // 1️⃣ Intentar con hash (sistema nuevo)
      let { data, error } = await supabase
        .from('usuarios_credicrc').select('*')
        .eq('email', email).eq('password', pwHash).maybeSingle();
      if (error) throw error;

      // 2️⃣ Migración automática: si no hay match, probar plaintext legacy
      if (!data) {
        const legacy = await supabase
          .from('usuarios_credicrc').select('*')
          .eq('email', email).eq('password', authPassword).maybeSingle();
        if (legacy.error) throw legacy.error;
        if (legacy.data) {
          // Actualizar la contraseña a hash silenciosamente
          await supabase.from('usuarios_credicrc')
            .update({ password: pwHash }).eq('id', legacy.data.id);
          data = legacy.data;
        }
      }

      if (!data) { addNotification('error', 'Credenciales Incorrectas', 'Correo o contraseña inválidos.'); return; }
      const user = data as UserAccount;
      if (!user.aprobado) { addNotification('warning', 'Cuenta Pendiente', 'Tu cuenta está en espera de aprobación.'); return; }
      setCurrentUser(user);
      // Módulo 5: Tesorería accede como 'admin' con vista restringida
      setActiveRole(user.rol === 'tesoreria' ? 'admin' : user.rol as any);
      if (user.rol === 'trabajador' && user.trabajador_id) setActiveWorkerId(user.trabajador_id);
      else if (user.rol === 'proveedor' && user.proveedor_id) setActiveProviderId(user.proveedor_id);
      else if (user.rol === 'tesoreria') setAdminTab('payroll'); // Iniciar en tab de nómina
      addNotification('success', 'Sesión Iniciada', `¡Bienvenido, ${user.nombre}!`);
      setAuthEmail(''); setAuthPassword('');
    } catch (err: any) {
      addNotification('error', 'Error de Autenticación', err.message);
    } finally { setIsAuthSubmitting(false); }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authEmail || !authPassword || !authName) { addNotification('error', 'Campos Incompletos', 'Complete todos los campos.'); return; }
    
    // Validar checkbox de aceptación de políticas
    if (!aceptoTerminos) {
      addNotification('error', 'Consentimiento Requerido', 'Debe aceptar los Términos de Uso y Políticas de Privacidad para registrarse.');
      return;
    }

    const regData: any = {
      acepto_terminos: true,
      fecha_aceptacion: new Date().toISOString()
    };

    if (authRoleSelection === 'trabajador') {
      if (!authWorkerCedula) { addNotification('error', 'Cédula Requerida', 'Ingrese su cédula de identidad.'); return; }
      regData.cedula = authWorkerCedula.trim(); regData.cargo = authWorkerCargo;
    } else {
      // Validaciones estrictas Módulo 4A
      if (!authProviderRif.trim()) { addNotification('error', 'RIF Requerido', 'Ingrese el RIF del establecimiento.'); return; }
      if (!authProviderDireccion.trim()) { addNotification('error', 'Dirección Requerida', 'Ingrese la dirección física del comercio.'); return; }
      if (!authProviderBancoCuenta.trim() || authProviderBancoCuenta.replace(/\D/g, '').length !== 20) {
        addNotification('error', 'Cuenta Inválida', 'La cuenta bancaria debe tener exactamente 20 dígitos.'); return;
      }
      if (!authProviderPagoMovilBanco.trim() || !authProviderPagoMovilCedula.trim() || !authProviderPagoMovilTelefono.trim()) {
        addNotification('error', 'Pago Móvil Incompleto', 'Complete todos los datos de Pago Móvil.'); return;
      }
      regData.categoria = authProviderCategoria;
      regData.cuenta_enlace = authProviderBancoCuenta.replace(/\D/g, '');
      regData.razon_social = authProviderRazonSocial.trim() || authName.trim();
      regData.rif = authProviderRif.trim();
      regData.direccion = authProviderDireccion.trim();
      regData.banco_cuenta = authProviderBancoCuenta.replace(/\D/g, '');
      regData.pago_movil_banco = authProviderPagoMovilBanco.trim();
      regData.pago_movil_cedula = authProviderPagoMovilCedula.trim();
      regData.pago_movil_telefono = authProviderPagoMovilTelefono.trim();
    }
    setIsAuthSubmitting(true);
    try {
      const pwHash = await hashPassword(authPassword);
      const { error } = await supabase.from('usuarios_credicrc').insert([{ email: authEmail.trim().toLowerCase(), password: pwHash, nombre: authName.trim(), rol: authRoleSelection, aprobado: false, datos_registro: regData }]);
      if (error) { if (error.code === '23505') throw new Error('Este correo ya está registrado.'); throw error; }
      


      addNotification('success', 'Registro Exitoso', 'Tu solicitud fue enviada. El admin la aprobará pronto.');
      setAuthEmail(''); setAuthPassword(''); setAuthName(''); setAuthWorkerCedula('');
      setAuthProviderRazonSocial(''); setAuthProviderRif(''); setAuthProviderDireccion('');
      setAuthProviderBancoCuenta(''); setAuthProviderPagoMovilBanco(''); setAuthProviderPagoMovilCedula(''); setAuthProviderPagoMovilTelefono('');
      setAceptoTerminos(false);
      setAuthMode('login'); await fetchData();

    } catch (err: any) { addNotification('error', 'Error al Registrarse', err.message); }
    finally { setIsAuthSubmitting(false); }

  };

  // ─── SOLICITAR RECUPERACIÓN DE CLAVE ───
  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authEmail) {
      addNotification('error', 'Correo Requerido', 'Por favor ingresa tu correo electrónico.');
      return;
    }
    setIsAuthSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('handle-password-reset', {
        body: { action: 'request', email: authEmail }
      });
      if (error) throw error;
      if (data?.success) {
        addNotification('success', 'Enlace Enviado', 'Te hemos enviado un enlace seguro para restablecer tu contraseña. Revisa tu correo.');
        setAuthMode('login');
      } else {
        addNotification('error', 'Error de Envío', data?.error || 'No se pudo enviar el enlace.');
      }
    } catch (err: any) {
      addNotification('error', 'Error de Conexión', err.message);
    } finally {
      setIsAuthSubmitting(false);
    }
  };

  // ─── CONFIRMAR RESTABLECIMIENTO DE CLAVE ───
  const handleConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || !confirmNewPassword) {
      addNotification('error', 'Campos Incompletos', 'Completa ambos campos.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      addNotification('error', 'Contraseñas No Coinciden', 'Las contraseñas ingresadas deben ser idénticas.');
      return;
    }
    if (newPassword.length < 5) {
      addNotification('error', 'Contraseña Muy Corta', 'La contraseña debe tener al menos 5 caracteres.');
      return;
    }
    if (!resetToken) {
      addNotification('error', 'Token Ausente', 'Falta el token de recuperación seguro.');
      return;
    }

    setIsAuthSubmitting(true);
    try {
      // Hashing client-side first
      const pwHash = await hashPassword(newPassword);

      const { data, error } = await supabase.functions.invoke('handle-password-reset', {
        body: { action: 'confirm', token: resetToken, password: pwHash }
      });
      if (error) throw error;
      if (data?.success) {
        addNotification('success', 'Contraseña Actualizada', 'Tu contraseña ha sido restablecida exitosamente.');
        setShowSuccessOverlay(true); // Mostrar el check animado
        setNewPassword('');
        setConfirmNewPassword('');
        setResetToken(null);
        setAuthMode('login');
      } else {
        addNotification('error', 'Enlace Expirado / Inválido', data?.error || 'No se pudo restablecer la contraseña.');
      }
    } catch (err: any) {
      addNotification('error', 'Error al Restablecer', err.message);
    } finally {
      setIsAuthSubmitting(false);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setActiveRole('inicio');
    setActiveWorkerId('');
    setActiveProviderId('');
    localStorage.removeItem('credicrc_current_user');
    localStorage.removeItem('credicrc_active_role');
    localStorage.removeItem('credicrc_active_worker_id');
    localStorage.removeItem('credicrc_active_provider_id');
    addNotification('info', 'Sesión Cerrada', 'Has salido de la plataforma.');
  };

  // ─── ENVIAR NOTIFICACIONES PUSH ──────────────────────────────────────────────
  const handleSendPushNotifications = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pushTitle.trim() || !pushBody.trim()) {
      addNotification('error', 'Campos Incompletos', 'El título y el mensaje son requeridos.');
      return;
    }

    setIsSendingPush(true);
    setPushStatus('Conectando con el servidor de notificaciones...');

    try {
      const res = await fetch('/api/send-push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tipo: 'masivo',
          target: pushAudience,
          titulo: pushTitle.trim(),
          cuerpo: pushBody.trim(),
          urlDestino: pushRedirect.trim() || '/',
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Error al enviar notificaciones.');
      }

      setPushStatus(null);
      addNotification('success', 'Envío Exitoso', `Notificaciones enviadas. Exitosas: ${data.sent || 0}. Fallidas (eliminadas): ${data.failed || 0}`);
      setPushTitle('');
      setPushBody('');
      setPushRedirect('/');
    } catch (err: any) {
      console.error('[Push Client Error]:', err);
      setPushStatus(null);
      addNotification('error', 'Error al enviar', err.message || 'No se pudo conectar con el servidor.');
    } finally {
      setIsSendingPush(false);
    }
  };

  // ─── ENVIAR CORREOS MASIVOS ──────────────────────────────────────────────────
  const handleSendBulkEmails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailSubject.trim() || !emailTitle.trim() || !emailBody.trim()) {
      addNotification('error', 'Campos Incompletos', 'Todos los campos son requeridos para el envío masivo.');
      return;
    }

    setIsSendingEmail(true);
    setEmailStatus('Obteniendo destinatarios y despachando correos...');
    try {
      const { data, error } = await supabase.functions.invoke('comunicacion-interna', {
        body: {
          audience: emailAudience,
          subject: emailSubject.trim(),
          title: emailTitle.trim(),
          body: emailBody.trim(),
        }
      });

      if (error) {
        throw new Error(error.message || 'Error al conectar con la Edge Function.');
      }

      if (data && data.success === false) {
        throw new Error(data.error || 'Error al enviar correos masivos.');
      }

      setEmailStatus(null);
      addNotification('success', 'Envío Exitoso', `Correos masivos enviados. Exitosos: ${data?.sent || 0}. Fallidos: ${data?.failed || 0}`);
      setEmailSubject('');
      setEmailTitle('');
      setEmailBody('');
    } catch (err: any) {
      console.error('[Bulk Email Client Error]:', err);
      setEmailStatus(null);
      addNotification('error', 'Error al enviar', err.message || 'No se pudo conectar con el servidor.');
    } finally {
      setIsSendingEmail(false);
    }
  };

  // ─── APROBAR USUARIO ─────────────────────────────────────────────────────────
  const handleApproveUser = async (userId: string) => {
    const user = systemUsers.find(u => u.id === userId); if (!user) return;
    try {
      if (user.rol === 'trabajador') {
        const salary = parseFloat(approveSalary); const years = parseInt(approveAntiguedad);
        if (isNaN(salary) || salary <= 0) { addNotification('error', 'Dato Inválido', 'Ingrese un salario válido.'); return; }
        const { data: wData, error: wError } = await supabase.from('trabajadores_crc').insert([{ nombre: user.nombre, cedula: user.datos_registro?.cedula || 'V-00.000.000', cargo: user.datos_registro?.cargo || 'Docente', salario_base: salary, antiguedad_anios: isNaN(years) ? 0 : years }]).select().single();
        if (wError) throw wError;
        const { error: uError } = await supabase.from('usuarios_credicrc').update({ trabajador_id: wData.id, aprobado: true }).eq('id', userId);
        if (uError) throw uError;



        addNotification('success', 'Trabajador Aprobado', `${user.nombre} activado en nómina.`);
      } else if (user.rol === 'proveedor') {
        const comision = parseFloat(approveComision) / 100;
        if (isNaN(comision) || comision < 0.01 || comision > 0.10) { addNotification('error', 'Comisión Inválida', 'La comisión debe estar entre 1% y 10%.'); return; }
        const { data: pData, error: pError } = await supabase.from('proveedores_aliados').insert([{
          nombre: user.nombre,
          categoria: user.datos_registro?.categoria || 'Víveres',
          cuenta_enlace: user.datos_registro?.cuenta_enlace || '',
          comision_colegio: comision,
          razon_social: user.datos_registro?.razon_social || null,
          rif: user.datos_registro?.rif || null,
          direccion: user.datos_registro?.direccion || null,
          pago_movil_banco: user.datos_registro?.pago_movil_banco || null,
          pago_movil_cedula: user.datos_registro?.pago_movil_cedula || null,
          pago_movil_telefono: user.datos_registro?.pago_movil_telefono || null
        }]).select().single();
        if (pError) throw pError;
        const { error: uError } = await supabase.from('usuarios_credicrc').update({ proveedor_id: pData.id, aprobado: true }).eq('id', userId);
        if (uError) throw uError;



        addNotification('success', 'Proveedor Aprobado', `${user.nombre} afiliado al sistema.`);
      }
      setApprovingUserId(null); await fetchData();
    } catch (err: any) { addNotification('error', 'Error al Aprobar', err.message); }
  };


  // ─── RESEED — DESHABILITADO EN PRODUCCIÓN ────────────────────────────────────
  // El botón fue bloqueado permanentemente en la UI (ver Zona de Peligro en panel admin).
  // Esta función se conserva como referencia pero no está conectada a ningún elemento interactivo.


  // ─── LANDING CONFIG ──────────────────────────────────────────────────────────
  const handleSaveLandingConfig = async () => {
    setIsSavingConfig(true);
    try {
      const { error } = await supabase.from('configuracion_inicio').update(landingConfig).eq('id', 1);
      if (error) throw error;
      addNotification('success', 'Config Guardada', 'Textos de la página de inicio actualizados.');
    } catch (err: any) { addNotification('error', 'Error al Guardar', err.message); }
    finally { setIsSavingConfig(false); }
  };

  // ─── GENERAR QR DE IDENTIDAD (sin montos) ────────────────────────────────────
  const handleGenerateQR = async () => {
    const worker = workers.find(w => w.id === activeWorkerId); if (!worker) return;
    if (worker.qr_bloqueado) { addNotification('error', 'QR Bloqueado', 'Tu QR está bloqueado por un retraso de pago. Contacta administración.'); return; }

    setIsGeneratingQR(true);
    try {
      const { data, error } = await supabase.rpc('crear_qr_token_credicrc', {
        p_trabajador_id: worker.id
      });
      if (error) throw error;
      const res = data[0];
      const expAt = new Date(res.expires_at).getTime();
      const secsLeft = Math.max(0, Math.floor((expAt - Date.now()) / 1000));
      const newQR: ActiveQR = {
        qrId: res.qr_id, workerId: worker.id, workerName: worker.nombre, workerCedula: worker.cedula,
        tokenHash: res.token_hash,
        payloadJson: JSON.stringify({ ...res.payload_json, token: res.token_hash }),
        timestamp: Date.now(), expiresAt: expAt, nivel: res.nivel_actual,
      };
      setActiveQR(newQR); setQrCountdown(secsLeft); setShowQRModal(true);
      addNotification('info', 'QR Generado', `Código de identidad activo por 5 minutos. Muéstralo al proveedor.`);
    } catch (err: any) { addNotification('error', 'Error al Generar QR', err.message); }
    finally { setIsGeneratingQR(false); }
  };

  // ─── MANEJAR ESCANEO QR (proveedor) — con reintentos silenciosos ─────────────
  const handleQRScanned = useCallback(async (token: string) => {
    setShowQRScannerModal(false);
    // Retener el token en ref por si hay corte de red durante los reintentos
    pendingTokenRef.current = token;
    setScannedToken(token);
    setValidationResult(null);
    setScannedWorkerInfo(null);
    setPosAmount('');
    setAplicaInicial(true);
    setScanRetrying(false);
    setScanRetryCount(0);

    const MAX_RETRIES = 3;
    const RETRY_DELAYS = [1500, 3000, 5000]; // backoff exponencial suave

    const attemptValidation = async (attempt: number): Promise<void> => {
      try {
        if (attempt > 0) {
          setScanRetrying(true);
          setScanRetryCount(attempt);
          await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt - 1]));
        }
        setIsValidating(true);

        const { data, error } = await supabase.rpc('validar_y_consumir_qr', {
          p_token_hash: pendingTokenRef.current ?? token,
          p_proveedor_id: activeProviderId,
          p_monto_usd: 0,
          p_dias_financiamiento: posDays,
        });

        if (error) throw error;

        setScanRetrying(false);
        setScanRetryCount(0);
        pendingTokenRef.current = null;

        const res = data[0];
        if (!res.aprobado && !res.trabajador_nombre) {
          addNotification('error', 'QR Inválido', res.mensaje);
          setScannedToken(null);
          return;
        }
        setScannedWorkerInfo({
          nombre: res.trabajador_nombre,
          cedula: res.trabajador_cedula,
          nivel: res.nivel_credito,
          limite_disponible: parseFloat(res.limite_disponible || '0'),
        });
        addNotification('success', 'QR Detectado', `Trabajador: ${res.trabajador_nombre}. Ingresa el monto de la compra.`);

      } catch (err: any) {
        const isNetworkErr = !navigator.onLine ||
          err?.message?.toLowerCase().includes('network') ||
          err?.message?.toLowerCase().includes('fetch') ||
          err?.code === 'NETWORK_ERROR';

        if (isNetworkErr && attempt < MAX_RETRIES) {
          // Reintento silencioso — el token queda en pendingTokenRef
          return attemptValidation(attempt + 1);
        }

        // Agotados los reintentos o error no-red
        setScanRetrying(false);
        setScanRetryCount(0);
        if (isNetworkErr) {
          addNotification('error', 'Sin Conexión', 'No se pudo validar el QR. Verifica tu señal e inténtalo de nuevo.');
        } else {
          addNotification('error', 'Error de Validación', err.message);
        }
        setScannedToken(null);
        pendingTokenRef.current = null;
      } finally {
        setIsValidating(false);
      }
    };

    await attemptValidation(0);
  }, [activeProviderId, posDays, addNotification]);

  // Simulación para modo Admin (testing)
  const handleSimulateScan = () => {
    if (!activeQR) { addNotification('warning', 'Sin QR Activo', 'Genera un QR desde el portal del trabajador primero.'); return; }
    handleQRScanned(activeQR.tokenHash);
  };

  // ─── CALCULAR MONTOS (proveedor ingresa monto) ───────────────────────────────
  const handleCalculateAmount = async () => {
    const amount = parseFloat(posAmount);
    if (!scannedToken || isNaN(amount) || amount <= 0) {
      addNotification('error', 'Monto Inválido', 'Ingresa un monto mayor a cero.');
      return;
    }
    setIsValidating(true);
    try {
      const { data, error } = await supabase.rpc('validar_y_consumir_qr', {
        p_token_hash: scannedToken,
        p_proveedor_id: activeProviderId,
        p_monto_usd: amount,
        p_dias_financiamiento: posDays,
        p_aplica_inicial: aplicaInicial,
      });
      if (error) throw error;
      const res = data[0];
      setValidationResult({
        aprobado: res.aprobado,
        mensaje: res.mensaje,
        monto_inicial_calculado: parseFloat(res.monto_inicial_calculado || '0'),
        cuota_financiada: parseFloat(res.cuota_financiada || '0'),
        limite_quincenal_max: parseFloat(res.limite_quincenal || '0'),
        trabajador_nombre: res.trabajador_nombre,
        trabajador_cedula: res.trabajador_cedula,
        nivel_credito: res.nivel_credito,
        limite_disponible: parseFloat(res.limite_disponible || '0'),
        tokenHash: scannedToken,
        workerId: scannedWorkerInfo ? workers.find(w => w.cedula === scannedWorkerInfo.cedula)?.id : undefined,
      });
      if (res.aprobado) {
        if (aplicaInicial) {
          addNotification('success', 'Montos Calculados', `Inicial: $${parseFloat(res.monto_inicial_calculado || '0').toFixed(2)} · Cuota: $${parseFloat(res.cuota_financiada || '0').toFixed(2)}`);
        } else {
          addNotification('success', 'Montos Calculados', `Inicial Cero · Cuota a Financiar: $${parseFloat(res.cuota_financiada || '0').toFixed(2)}`);
        }
      }
      else addNotification('error', 'Crédito Denegado', res.mensaje);
    } catch (err: any) { addNotification('error', 'Error al Calcular', err.message); }
    finally { setIsValidating(false); }
  };

  // ─── PROCESAR COMPRA ─────────────────────────────────────────────────────────
  const handleProcessPurchase = async () => {
    if (!validationResult?.aprobado || !scannedToken) return;
    const amount = parseFloat(posAmount);
    // Encontrar el trabajador por nombre/cedula
    const worker = workers.find(w => w.cedula === scannedWorkerInfo?.cedula || w.nombre === validationResult.trabajador_nombre);
    if (!worker) { addNotification('error', 'Error', 'No se pudo identificar al trabajador.'); return; }

    setIsProcessingPurchase(true);
    try {
      const txId = await supabase.rpc('crear_transaccion_credicrc', {
        p_trabajador_id: worker.id,
        p_proveedor_id: activeProviderId,
        p_monto_usd: amount,
        p_monto_inicial_usd: validationResult.monto_inicial_calculado,
        p_tasa_bcv: bcvRate,
        p_dias_financiamiento: posDays,
        p_token_aprobacion: scannedToken,
      });
      if (txId.error) throw txId.error;
      // El correo se envía automáticamente vía database triggers en transacciones_credicrc

      setShowSuccessOverlay(true);
      setActiveQR(null); setScannedToken(null); setValidationResult(null);
      setScannedWorkerInfo(null); setShowQRModal(false); setPosAmount('');
      setAplicaInicial(true); setInicialConfirmada(false);
      await fetchData();
    } catch (err: any) { addNotification('error', 'Error al Procesar', err.message); }
    finally { setIsProcessingPurchase(false); }
  };

  // Módulo 3: Versión anti-duplicado del procesador de compra (debounced 800ms)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleProcessPurchaseDebounced = useDebounceClick(handleProcessPurchase, 800);

  // ─── GUARDAR PERFIL DE COMERCIO (Módulo 4B) ──────────────────────────────────
  const handleSaveProviderProfile = async () => {
    if (!currentProvider) return;
    setIsSavingProfile(true);
    try {
      let logo_url = currentProvider.logo_url;
      if (logoFile) {
        setIsUploadingLogo(true);
        const ext = logoFile.name.split('.').pop();
        const fileName = `${currentProvider.id}_${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from('logos-proveedores').upload(fileName, logoFile, { upsert: true });
        if (!upErr) {
          const { data: urlData } = supabase.storage.from('logos-proveedores').getPublicUrl(fileName);
          logo_url = urlData.publicUrl;
        }
        setIsUploadingLogo(false);
      }
      const { error } = await supabase.from('proveedores_aliados').update({
        direccion: editProviderDireccion || null,
        telefono: editProviderTelefono || null,
        pago_movil_banco: editProviderPagoMovilBanco || null,
        pago_movil_cedula: editProviderPagoMovilCedula || null,
        pago_movil_telefono: editProviderPagoMovilTelefono || null,
        logo_url,
      }).eq('id', currentProvider.id);
      if (error) throw error;
      setLogoFile(null);
      addNotification('success', 'Perfil Actualizado', 'Los datos de tu comercio han sido guardados exitosamente.');
      await fetchData();
    } catch (err: any) { addNotification('error', 'Error al Guardar Perfil', err.message); }
    finally { setIsSavingProfile(false); setIsUploadingLogo(false); }
  };

  // ─── PAGO DIRECTO (trabajador sube comprobante) ──────────────────────────────

  const handleSubmitDirectPayment = async () => {
    if (!selectedInstallmentId || !directPayRef.trim() || !directPayAmount || !directPayBank.trim() || !directPayCedula.trim()) { 
      addNotification('error', 'Datos Incompletos', 'Seleccione cuota, monto, referencia, banco y cédula titular.'); 
      return; 
    }
    if (directPayType === 'Pago Móvil' && !directPayPhone.trim()) {
      addNotification('error', 'Teléfono Requerido', 'Indique el número de teléfono del Pago Móvil de origen.');
      return;
    }
    const monto = parseFloat(directPayAmount);
    if (isNaN(monto) || monto <= 0) { addNotification('error', 'Monto Inválido', 'Ingrese un monto válido.'); return; }
    setIsUploadingPayment(true);
    try {
      let urlComprobante: string | null = null;
      if (directPayFile) {
        const fileName = `${Date.now()}_${directPayFile.name}`;
        const { error: upError } = await supabase.storage.from('comprobantes-pago').upload(fileName, directPayFile);
        if (upError) {
          addNotification('warning', 'Sin Imagen', 'No se pudo subir la imagen. El pago se registra sin comprobante visual.');
        } else {
          const { data: urlData } = supabase.storage.from('comprobantes-pago').getPublicUrl(fileName);
          urlComprobante = urlData.publicUrl;
        }
      }

      const cuota = installments.find(i => i.id === selectedInstallmentId);
      const horasHastaCobro = cuota ? (new Date(cuota.fecha_cobro).getTime() - Date.now()) / 3600000 : 999;
      const esPostCorte = horasHastaCobro < 48;

      const { error } = await supabase.from('pagos_directos_credicrc').insert([{
        cuota_id: selectedInstallmentId,
        trabajador_id: activeWorkerId,
        monto_usd: monto,
        referencia_bancaria: directPayRef.trim(),
        url_comprobante: urlComprobante,
        estatus: 'Pendiente',
        tipo_operacion: directPayType,
        banco_origen: directPayBank.trim(),
        telefono_origen: directPayType === 'Pago Móvil' ? directPayPhone.trim() : null,
        cedula_titular: directPayCedula.trim(),
      }]);
      if (error) throw error;

      await supabase.from('cronograma_cuotas').update({ estatus: 'En Verificación' }).eq('id', selectedInstallmentId);

      if (esPostCorte) {
        addNotification('warning', 'Fecha de Corte Superada', 'El descuento ya está en lote. Tu abono será aplicado como saldo a favor en la siguiente quincena.');
      } else {
        addNotification('success', 'Pago Reportado', 'Tu comprobante está En Verificación. El admin lo revisará pronto.');
      }
      setShowDirectPaymentModal(false); 
      setSelectedInstallmentId(''); 
      setDirectPayRef(''); 
      setDirectPayAmount(''); 
      setDirectPayFile(null);
      setDirectPayType('Pago Móvil');
      setDirectPayBank('');
      setDirectPayPhone('');
      setDirectPayCedula('');
      await fetchData();
    } catch (err: any) { addNotification('error', 'Error al Reportar Pago', err.message); }
    finally { setIsUploadingPayment(false); }
  };

  // ─── CONFIRMAR PAGO DIRECTO (admin) ─────────────────────────────────────────
  const handleConfirmDirectPayment = async (pagoId: string, _trabajadorId: string, _montoUsd: number, _esSaldoFavor: boolean) => {
    setProcessingDirectPayId(pagoId);
    try {
      const { data, error } = await supabase.rpc('procesar_pago_directo', { p_pago_directo_id: pagoId });
      if (error) throw error;
      const res = data[0];
      // El correo se envía automáticamente vía database triggers en pagos_directos_credicrc

      addNotification('success', 'Pago Confirmado', res.mensaje);
      await fetchData();
    } catch (err: any) { addNotification('error', 'Error al Confirmar', err.message); }
    finally { setProcessingDirectPayId(null); }
  };

  // ─── GAMIFICACIÓN (admin) ────────────────────────────────────────────────────
  const handleEvaluateLevel = async (workerId: string, tipo: 'PUNTUAL' | 'RETRASO') => {
    try {
      const { data, error } = await supabase.rpc('evaluar_nivel_trabajador', { p_trabajador_id: workerId, p_tipo: tipo });
      if (error) throw error;
      const res = data[0];
      addNotification(tipo === 'PUNTUAL' ? 'success' : 'warning', tipo === 'PUNTUAL' ? 'Pago Puntual Registrado' : 'Retraso Aplicado', res.mensaje);
      await fetchData();
    } catch (err: any) { addNotification('error', 'Error de Gamificación', err.message); }
  };

  const handleUnblockQR = async (workerId: string) => {
    try {
      const { error } = await supabase.from('trabajadores_crc').update({ qr_bloqueado: false }).eq('id', workerId);
      if (error) throw error;
      addNotification('success', 'QR Desbloqueado', 'El trabajador puede generar QR nuevamente.');
      await fetchData();
    } catch (err: any) { addNotification('error', 'Error', err.message); }
  };

  // ─── ADMIN: REGISTRAR TRABAJADOR ─────────────────────────────────────────────
  const handleRegisterWorker = async () => {
    const name = newWorkerNombre.trim(); const cedula = newWorkerCedula.trim();
    const salary = parseFloat(newWorkerSalario); const seniority = parseInt(newWorkerAntiguedad);
    if (!name || !cedula || isNaN(salary) || salary <= 0) { addNotification('error', 'Datos Inválidos', 'Complete todos los campos correctamente.'); return; }
    setIsRegisteringWorker(true);
    try {
      const { error } = await supabase.from('trabajadores_crc').insert([{ nombre: name, cedula, cargo: newWorkerCargo, salario_base: salary, antiguedad_anios: isNaN(seniority) ? 0 : seniority }]);
      if (error) throw error;
      addNotification('success', 'Trabajador Registrado', `${name} agregado al sistema.`);
      setNewWorkerNombre(''); setNewWorkerCedula(''); setNewWorkerCargo('Docente'); setNewWorkerSalario('300'); setNewWorkerAntiguedad('0');
      setShowAddWorkerModal(false); await fetchData();
    } catch (err: any) { addNotification('error', 'Error al Registrar', err.message); }
    finally { setIsRegisteringWorker(false); }
  };

  // ─── ADMIN: REGISTRAR PROVEEDOR ──────────────────────────────────────────────
  const handleRegisterProvider = async () => {
    const name = newProviderNombre.trim(); const bank = newProviderCuenta.trim();
    const commPct = parseFloat(newProviderComision);
    if (!name || !bank || isNaN(commPct) || commPct < 1 || commPct > 10) { addNotification('error', 'Datos Inválidos', 'Complete todos los campos (comisión entre 1% y 10%).'); return; }
    setIsRegisteringProvider(true);
    try {
      const { error } = await supabase.from('proveedores_aliados').insert([{ nombre: name, categoria: newProviderCategoria, cuenta_enlace: bank, comision_colegio: commPct / 100 }]);
      if (error) throw error;
      addNotification('success', 'Proveedor Registrado', `${name} afiliado con comisión ${commPct}%.`);
      setNewProviderNombre(''); setNewProviderCuenta(''); setNewProviderCategoria('Carnes'); setNewProviderComision('4.0');
      setShowAddProviderModal(false); await fetchData();
    } catch (err: any) { addNotification('error', 'Error al Registrar', err.message); }
    finally { setIsRegisteringProvider(false); }
  };

  // ─── ADMIN: EDITAR / ELIMINAR PROVEEDOR ──────────────────────────────────────
  const handleUpdateProvider = async () => {
    if (!editingProvider) return;
    const name = editProviderNombre.trim();
    const bank = editProviderCuenta.trim();
    const commPct = parseFloat(editProviderComision);
    if (!name || !bank || isNaN(commPct) || commPct < 1 || commPct > 10) {
      addNotification('error', 'Datos Inválidos', 'Complete todos los campos (comisión entre 1% y 10%).');
      return;
    }
    setIsSavingProvider(true);
    try {
      const { error } = await supabase
        .from('proveedores_aliados')
        .update({
          nombre: name,
          categoria: editProviderCategoria,
          cuenta_enlace: bank,
          comision_colegio: commPct / 100
        })
        .eq('id', editingProvider.id);
      if (error) throw error;
      addNotification('success', 'Proveedor Actualizado', `${name} modificado correctamente.`);
      setEditingProvider(null);
      await fetchData();
    } catch (err: any) {
      addNotification('error', 'Error al Guardar', err.message);
    } finally {
      setIsSavingProvider(false);
    }
  };

  const handleDeleteProvider = async (id: string) => {
    const prov = providers.find(p => p.id === id);
    if (!prov) return;

    // Validar si tiene transacciones
    const provTrans = transactions.filter(t => t.proveedor_id === id);
    if (provTrans.length > 0) {
      addNotification('error', 'No se puede eliminar', `El proveedor ${prov.nombre} tiene transacciones asociadas. Te sugerimos editar sus datos en su lugar.`);
      return;
    }

    if (!window.confirm(`¿Estás seguro de que deseas eliminar al proveedor ${prov.nombre}? Esta acción es irreversible.`)) {
      return;
    }

    setIsDeletingProviderId(id);
    try {
      const { error } = await supabase.from('proveedores_aliados').delete().eq('id', id);
      if (error) throw error;
      addNotification('success', 'Proveedor Eliminado', `${prov.nombre} ha sido removido del sistema.`);
      await fetchData();
    } catch (err: any) {
      addNotification('error', 'Error al Eliminar', err.message);
    } finally {
      setIsDeletingProviderId(null);
    }
  };

  // ─── ADMIN: LIQUIDAR CICLO DE VENTAS AL PROVEEDOR (Bloque A) ─────────────────
  const handleLiquidarCiclo = async () => {
    if (!showLiquidarModal || !refLiquidacion.trim()) {
      addNotification('error', 'Referencia Requerida', 'Ingrese la referencia de la transferencia enviada al proveedor.');
      return;
    }
    setIsProcessingLiquidacion(true);
    try {
      const pId = showLiquidarModal;
      const pendingTxs = transactions.filter(t =>
        t.proveedor_id === pId &&
        (t.estatus === 'Aprobada' || t.estatus === 'Completada') &&
        (t.estado_liquidacion_proveedor ?? 'pendiente') === 'pendiente'
      );
      if (pendingTxs.length === 0) {
        addNotification('info', 'Sin Pendientes', 'No hay ventas pendientes de liquidar para este proveedor.');
        setShowLiquidarModal(null);
        return;
      }
      const montoLiquidado = pendingTxs.reduce((s, t) => s + t.monto_usd, 0);
      const montoComisionCorte = pendingTxs.reduce((s, t) => s + t.comision_monto_usd, 0);
      const ids = pendingTxs.map(t => t.id);
      const { error: upErr } = await supabase
        .from('transacciones_credicrc')
        .update({ estado_liquidacion_proveedor: 'liquidado' })
        .in('id', ids);
      if (upErr) throw upErr;
      const prov = providers.find(p => p.id === pId);
      const { error: insErr } = await supabase.from('historial_liquidaciones').insert([{
        proveedor_id: pId,
        tipo: 'liquidacion_ventas',
        monto_liquidado: montoLiquidado,
        monto_comision_corte: montoComisionCorte,
        referencia_pago: refLiquidacion.trim(),
      }]);
      if (insErr) throw insErr;
      addNotification('success', '✅ Ciclo Liquidado', `$${montoLiquidado.toFixed(2)} marcados como liquidados a ${prov?.nombre}. Ref: ${refLiquidacion.trim()}`);
      setShowLiquidarModal(null);
      setRefLiquidacion('');
      await fetchData();
    } catch (err: any) {
      addNotification('error', 'Error al Liquidar', err.message);
    } finally {
      setIsProcessingLiquidacion(false);
    }
  };

  // ─── ADMIN: REGISTRAR COBRO DE COMISIÓN (Bloque B) ───────────────────────────
  const handleCobrarComision = async () => {
    if (!showComisionModal || !refComision.trim()) {
      addNotification('error', 'Referencia Requerida', 'Ingrese la referencia de la transferencia recibida del proveedor.');
      return;
    }
    setIsProcessingComision(true);
    try {
      const pId = showComisionModal;
      const pendingTxs = transactions.filter(t =>
        t.proveedor_id === pId &&
        (t.estatus === 'Aprobada' || t.estatus === 'Completada') &&
        (t.estado_comision_colegio ?? 'pendiente') === 'pendiente'
      );
      if (pendingTxs.length === 0) {
        addNotification('info', 'Sin Pendientes', 'No hay comisiones pendientes de cobrar para este proveedor.');
        setShowComisionModal(null);
        return;
      }
      const montoComision = pendingTxs.reduce((s, t) => s + t.comision_monto_usd, 0);
      const ids = pendingTxs.map(t => t.id);
      const { error: upErr } = await supabase
        .from('transacciones_credicrc')
        .update({ estado_comision_colegio: 'cobrado' })
        .in('id', ids);
      if (upErr) throw upErr;
      const prov = providers.find(p => p.id === pId);
      const { error: insErr } = await supabase.from('historial_liquidaciones').insert([{
        proveedor_id: pId,
        tipo: 'cobro_comision',
        monto_liquidado: 0,
        monto_comision_corte: montoComision,
        referencia_pago: refComision.trim(),
      }]);
      if (insErr) throw insErr;
      addNotification('success', '🏦 Comisión Registrada', `$${montoComision.toFixed(2)} de comisión cobrados de ${prov?.nombre}. Ref: ${refComision.trim()}`);
      setShowComisionModal(null);
      setRefComision('');
      await fetchData();
    } catch (err: any) {
      addNotification('error', 'Error al Registrar Comisión', err.message);
    } finally {
      setIsProcessingComision(false);
    }
  };

  // ─── ADMIN: EDITAR TRABAJADOR ────────────────────────────────────────────────
  const handleSaveWorkerEdit = async () => {
    if (!selectedWorkerForEdit) return;
    const salary = parseFloat(editSalary); const override = editLimitOverride.trim() === '' ? null : parseFloat(editLimitOverride);
    if (isNaN(salary) || salary <= 0) { addNotification('error', 'Dato Inválido', 'Salario debe ser positivo.'); return; }
    try {
      const { error } = await supabase.from('trabajadores_crc').update({ salario_base: salary, limite_personalizado: override }).eq('id', selectedWorkerForEdit.id);
      if (error) throw error;
      addNotification('success', 'Ficha Actualizada', `${selectedWorkerForEdit.nombre} modificado.`);
      setSelectedWorkerForEdit(null); await fetchData();
    } catch (err: any) { addNotification('error', 'Error al Guardar', err.message); }
  };

  // ─── ADMIN: AJUSTE MASIVO ────────────────────────────────────────────────────
  const handleApplyBulkAdjust = async () => {
    const limitVal = bulkLimit.trim() === '' ? null : parseFloat(bulkLimit);
    const salaryVal = bulkSalary.trim() === '' ? null : parseFloat(bulkSalary);
    if (limitVal === null && salaryVal === null) { addNotification('warning', 'Sin Cambios', 'Ingrese al menos un valor.'); return; }
    setIsApplyingBulk(true);
    try {
      const payload: any = {};
      if (salaryVal !== null) payload.salario_base = salaryVal;
      payload.limite_personalizado = limitVal;
      const { error } = await supabase.from('trabajadores_crc').update(payload).eq('cargo', bulkCargo);
      if (error) throw error;
      addNotification('success', 'Ajuste Masivo Aplicado', `Límites actualizados para "${bulkCargo}".`);
      setBulkLimit('200'); setBulkSalary(''); await fetchData();
    } catch (err: any) { addNotification('error', 'Error Masivo', err.message); }
    finally { setIsApplyingBulk(false); }
  };

  // ─── ADMIN: PROCESAR NÓMINA ──────────────────────────────────────────────────
  const handleProcessPayrollDeductions = async () => {
    const targets = installments.filter(i => i.fecha_cobro === payrollFilterDate && i.estatus === 'Pendiente');
    if (targets.length === 0) { addNotification('warning', 'Sin Cuotas', 'No hay cuotas pendientes para esta fecha.'); return; }
    setIsProcessingPayroll(true);
    try {
      const ids = targets.map(i => i.id);
      const { error } = await supabase.from('cronograma_cuotas').update({ estatus: 'Cobrado', fecha_pago_real: new Date().toISOString(), tasa_bcv_pago: bcvRate }).in('id', ids);
      if (error) throw error;
      for (const inst of targets) {
        await supabase.from('cronograma_cuotas').update({ monto_ves_pagado: Math.round(inst.monto_usd * bcvRate * 100) / 100 }).eq('id', inst.id);
        if (inst.transacciones_credicrc?.trabajador_id) {
          void supabase.rpc('evaluar_nivel_trabajador', { p_trabajador_id: inst.transacciones_credicrc.trabajador_id, p_tipo: 'PUNTUAL' }).then(() => {});
        }
      }
      addNotification('success', 'Nómina Procesada', `${targets.length} cuotas descontadas exitosamente.`);
      await fetchData();
    } catch (err: any) { addNotification('error', 'Error de Nómina', err.message); }
    finally { setIsProcessingPayroll(false); }
  };

  // ─── ADMIN: EXPORTAR CSV ─────────────────────────────────────────────────────
  const handleExportPayrollCSV = () => {
    const targets = installments.filter(i => i.fecha_cobro === payrollFilterDate && i.estatus === 'Pendiente');
    if (targets.length === 0) { addNotification('warning', 'Sin Datos', 'No hay cuotas pendientes para exportar.'); return; }
    const headers = ['Trabajador','Cedula','Cargo','Salario Base (USD)','Cuota (USD)','Tasa BCV','A Descontar (VES)','Fecha Cobro','Proveedor'];
    const rows = targets.map(i => {
      const w = i.transacciones_credicrc?.trabajadores_crc;
      const p = i.transacciones_credicrc?.proveedores_aliados;
      return [`"${w?.nombre||''}"`,`"${w?.cedula||''}"`,`"${w?.cargo||''}"`,w?.salario_base||0,i.monto_usd,bcvRate,(i.monto_usd * bcvRate).toFixed(2),i.fecha_cobro,`"${p?.nombre||''}"`];
    });
    const csv = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `Nomina_CrediCRC_${payrollFilterDate}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    addNotification('success', 'CSV Exportado', `Reporte de nómina ${payrollFilterDate} descargado.`);
  };

  // ─── CÁLCULOS ────────────────────────────────────────────────────────────────
  const totalVolume = transactions.filter(t => t.estatus === 'Aprobada' || t.estatus === 'Completada').reduce((s, t) => s + (t.monto_usd - t.monto_inicial_pagado_usd), 0);
  const totalCommissions = transactions.filter(t => t.estatus === 'Aprobada' || t.estatus === 'Completada').reduce((s, t) => s + t.comision_monto_usd, 0);
  const pendingDeductionsCount = installments.filter(i => i.estatus === 'Pendiente').length;
  const pendingDirectPayments = directPayments.filter(d => d.estatus === 'Pendiente').length;
  const currentWorker = workers.find(w => w.id === activeWorkerId);
  const currentWorkerTransactions = transactions.filter(t => t.trabajador_id === activeWorkerId);
  const currentWorkerInstallments = installments.filter(i => i.transacciones_credicrc?.trabajador_id === activeWorkerId);
  const currentProvider = providers.find(p => p.id === activeProviderId);
  const currentProviderTransactions = transactions.filter(t => t.proveedor_id === activeProviderId);

  // Reporte Financiero Mensual del Proveedor
  const reportMonths = Array.from(new Set(currentProviderTransactions.map(t => {
    const d = new Date(t.fecha_transaccion);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }))).sort().reverse();

  const activeReportMonth = selectedReportMonth || reportMonths[0] || '';

  const monthlyTransactions = currentProviderTransactions.filter(t => {
    const d = new Date(t.fecha_transaccion);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === activeReportMonth;
  });

  const monthlyStats = monthlyTransactions.reduce((acc, t) => {
    const txInstallments = installments.filter(inst => inst.transaccion_id === t.id);
    const isPaid = txInstallments.length > 0 && txInstallments.every(inst => inst.estatus === 'Cobrado' || inst.estatus === 'Pagado Directo');
    
    acc.bruto += t.monto_usd;
    acc.comision += t.comision_monto_usd;
    if (isPaid) {
      acc.pagado += t.monto_usd;
      acc.comision_pagada += t.comision_monto_usd;
    } else {
      acc.pendiente += t.monto_usd;
      acc.comision_pendiente += t.comision_monto_usd;
    }
    return acc;
  }, { bruto: 0, comision: 0, pagado: 0, pendiente: 0, comision_pagada: 0, comision_pendiente: 0 });
  const supplierReconciliation = providers.map(p => {
    const pt = transactions.filter(t => t.proveedor_id === p.id && (t.estatus === 'Aprobada' || t.estatus === 'Completada'));
    const totalVendido = pt.reduce((s, t) => s + t.monto_usd, 0);
    const totalComision = pt.reduce((s, t) => s + t.comision_monto_usd, 0);
    // Bloque A: ventas pendientes de liquidar al proveedor
    const ptPendientesLiq = pt.filter(t => (t.estado_liquidacion_proveedor ?? 'pendiente') === 'pendiente');
    const montoPendienteProveedor = ptPendientesLiq.reduce((s, t) => s + t.monto_usd, 0);
    const txPendientesLiqCount = ptPendientesLiq.length;
    // Bloque B: comisiones pendientes de cobrar al proveedor (independiente del Bloque A)
    const ptPendientesComision = pt.filter(t => (t.estado_comision_colegio ?? 'pendiente') === 'pendiente');
    const comisionPendienteColegio = ptPendientesComision.reduce((s, t) => s + t.comision_monto_usd, 0);
    return { ...p, totalVendido, totalComision, netoPagar: totalVendido - totalComision, montoPendienteProveedor, txPendientesLiqCount, comisionPendienteColegio };
  });


  // ─── HELPERS ─────────────────────────────────────────────────────────────────
  function WorkerCreditCard({ worker }: { worker: Worker }) {
    const lvl = CREDIT_LEVELS.find(l => l.nivel === worker.nivel_credito) || CREDIT_LEVELS[0];
    const nextLvl = CREDIT_LEVELS.find(l => l.nivel === worker.nivel_credito + 1);
    const progressPct = nextLvl ? Math.min(100, (worker.pagos_puntuales_consecutivos / nextLvl.pagos_req) * 100) : 100;
    return (
      <div className="md:col-span-1 bg-gradient-to-br from-[#002855] via-[#003775] to-[#073B73] p-6 rounded-2xl border border-[#002855] shadow-lg relative overflow-hidden flex flex-col justify-between min-h-[300px]">
        <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-white/5 rounded-full border-8 border-white/5"/>
        {worker.qr_bloqueado && (
          <div className="absolute inset-0 bg-red-900/80 flex flex-col items-center justify-center gap-2 rounded-2xl z-10 backdrop-blur-sm">
            <Lock className="text-red-300 h-8 w-8"/>
            <p className="text-white font-black text-sm">QR Bloqueado</p>
            <p className="text-red-200 text-xs font-semibold text-center px-4">Contacta a administración para desbloquear</p>
          </div>
        )}
        <div className="absolute top-4 right-4 bg-white/10 p-2 rounded-xl"><ShieldCheck className="text-white h-5 w-5"/></div>
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[9px] bg-white/20 text-white font-bold py-1 px-3 rounded-full uppercase tracking-wider">{worker.cargo}</span>
            <NivelBadge nivel={worker.nivel_credito} small />
          </div>
          <h3 className="text-lg font-bold text-white tracking-wide leading-tight">{worker.nombre}</h3>
          <p className="text-xs text-blue-200 mt-1 font-mono">CI: {worker.cedula}</p>
        </div>
        {nextLvl && (
          <div className="mt-3">
            <div className="flex justify-between text-[9px] text-blue-200 mb-1 font-bold">
              <span>Progreso al {nextLvl.nombre}</span>
              <span>{worker.pagos_puntuales_consecutivos}/{nextLvl.pagos_req} pagos</span>
            </div>
            <div className="w-full bg-white/10 rounded-full h-2">
              <div className="bg-gradient-to-r from-[#64B5F6] to-[#D4AF37] h-2 rounded-full transition-all duration-700" style={{ width: `${progressPct}%` }}/>
            </div>
          </div>
        )}
        {!nextLvl && <div className="flex items-center gap-2 mt-3"><Award className="text-amber-400 h-5 w-5"/><span className="text-amber-300 text-xs font-black">¡Nivel Máximo Alcanzado!</span></div>}
        <div className="border-t border-white/10 pt-4 mt-4 space-y-2">
          {[
            ['Límite de Crédito:', `$${worker.limite_total.toFixed(2)}`, 'text-white'],
            ['Cupo Disponible:', `$${worker.limite_disponible.toFixed(2)}`, 'text-green-300'],
            [`Inicial según Nivel (${(lvl.porcentaje_inicial * 100).toFixed(0)}%):`, 'calculada al escanear', 'text-blue-200'],
          ].map(([label, val, cls]) => (
            <div key={label as string} className="flex justify-between text-xs text-blue-100">
              <span>{label}</span><span className={`font-bold font-mono ${cls}`}>{val}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ─── AUTH CARD PROPS ─────────────────────────────────────────────────────────
  const authCardProps: Omit<AuthCardProps, 'role'> = {
    authMode, setAuthMode, authEmail, setAuthEmail, authPassword, setAuthPassword,
    authName, setAuthName, authRoleSelection, setAuthRoleSelection,
    authWorkerCedula, setAuthWorkerCedula, authWorkerCargo, setAuthWorkerCargo,
    authProviderCategoria, setAuthProviderCategoria, authProviderCuenta: '', setAuthProviderCuenta: () => {},
    // Campos extendidos Módulo 4A
    authProviderRazonSocial, setAuthProviderRazonSocial,
    authProviderRif, setAuthProviderRif,
    authProviderDireccion, setAuthProviderDireccion,
    authProviderBancoCuenta, setAuthProviderBancoCuenta,
    authProviderPagoMovilBanco, setAuthProviderPagoMovilBanco,
    authProviderPagoMovilCedula, setAuthProviderPagoMovilCedula,
    authProviderPagoMovilTelefono, setAuthProviderPagoMovilTelefono,
    // Aceptación de términos
    aceptoTerminos, setAceptoTerminos, setShowTermsModal,
    isAuthSubmitting, onLogin: handleLogin, onRegister: handleRegister,
    // Nuevas propiedades recuperación de contraseña
    newPassword, setNewPassword,
    confirmNewPassword, setConfirmNewPassword,
    onSubmitForgotPassword: handleRequestReset,
    onSubmitResetPassword: handleConfirmReset
  };

  // ─── RESUMEN FINANCIERO MENSUAL (computado) ────────────────────────────────
  const _now = new Date();
  const _curMonth = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}`;
  const monthlyTx = transactions.filter(t => t.fecha_transaccion?.slice(0, 7) === _curMonth);
  type MonthlySummaryRow = { nombre: string; cedula: string; totalComprado: number; totalInicial: number; totalFinanciado: number; proveedores: string[] };
  const _byWorker: Record<string, { nombre: string; cedula: string; totalComprado: number; totalInicial: number; totalFinanciado: number; proveedores: Set<string> }> = {};
  monthlyTx.forEach(t => {
    const wId = t.trabajador_id;
    if (!_byWorker[wId]) _byWorker[wId] = { nombre: t.trabajadores_crc?.nombre ?? '—', cedula: t.trabajadores_crc?.cedula ?? '—', totalComprado: 0, totalInicial: 0, totalFinanciado: 0, proveedores: new Set<string>() };
    _byWorker[wId].totalComprado += t.monto_usd;
    _byWorker[wId].totalInicial += t.monto_inicial_pagado_usd;
    _byWorker[wId].totalFinanciado += (t.monto_usd - t.monto_inicial_pagado_usd);
    if (t.proveedores_aliados?.nombre) _byWorker[wId].proveedores.add(t.proveedores_aliados.nombre);
  });
  const monthlySummaryRows: MonthlySummaryRow[] = Object.values(_byWorker).map(r => ({ ...r, proveedores: Array.from(r.proveedores) }));
  const monthlyGrandTotal = monthlySummaryRows.reduce((s, r) => s + r.totalComprado, 0);

  // ─── RENDER ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#f1f5f9] text-slate-800 flex flex-col antialiased">

      {showSuccessOverlay && <SuccessOverlay onClose={() => setShowSuccessOverlay(false)}/>}
      {showQRScannerModal && <QRScanner onScan={handleQRScanned} onClose={() => setShowQRScannerModal(false)}/>}
      {showTermsModal && <TermsAndPoliciesModal onClose={() => setShowTermsModal(false)}/>}

      {/* ── NAVBAR ── */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm px-4 md:px-8 py-3.5 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div onClick={() => setActiveRole('inicio')} className="shadow-md hover:scale-105 transition duration-300 p-1.5 bg-slate-50 rounded-xl border border-slate-100 cursor-pointer flex items-center justify-center">
            {!logoError ? <img src="/logo.png" alt="Logo Colegio" className="h-16 w-auto object-contain" onError={() => setLogoError(true)}/> : <SchoolLogo className="h-16 w-auto"/>}
          </div>
          <div className="border-l border-slate-200 pl-4 cursor-pointer" onClick={() => setActiveRole('inicio')}>
            <h1 className="text-2xl font-black tracking-tight text-[#002855] flex items-center gap-1">Credi<span className="text-[#E53935]">CRC</span></h1>
            <p className="text-[10px] text-slate-500 tracking-wider font-extrabold uppercase">v2.1 · Ecosistema Financiero</p>
          </div>
        </div>
        <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
          {isInstallable && (
            <button onClick={handleInstallPWA}
              className="bg-[#D4AF37] hover:bg-[#E5C158] text-[#002855] px-4 py-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-2 shadow-sm transition-all duration-300 hover:scale-105 w-full md:w-auto">
              <Download size={14} className="animate-bounce"/> Instalar App
            </button>
          )}
          {currentUser && (
            <div className="bg-[#002855]/5 border border-[#002855]/10 rounded-xl px-3.5 py-1.5 flex items-center gap-2 text-xs w-full md:w-auto justify-between md:justify-start">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"/>
                <span className="text-[#002855] font-bold">{currentUser.nombre}</span>
                <span className="text-slate-400 font-medium capitalize">({currentUser.rol})</span>
              </div>
              <button onClick={handleLogout} className="ml-2 bg-[#E53935]/10 text-[#E53935] hover:bg-[#E53935] hover:text-white transition px-2.5 py-1 rounded-md text-[10px] font-extrabold uppercase tracking-wider">Salir</button>
            </div>
          )}
          <div className="bg-slate-100 p-1 rounded-xl border border-slate-200 flex flex-wrap gap-1 w-full md:w-auto shadow-inner">
            {([
              { role: 'inicio', icon: <Home size={14}/>, label: 'Inicio' },
              { role: 'trabajador', icon: <User size={14}/>, label: 'Trabajador', restricted: ['trabajador', 'admin'] },
              { role: 'proveedor', icon: <ShoppingBag size={14}/>, label: 'Proveedor', restricted: ['proveedor', 'admin'] },
              { role: 'admin', icon: <Sliders size={14}/>, label: 'Admin', restricted: ['admin'] },
            ] as any[]).map(item => {
              const isVisible = !item.restricted || !currentUser || item.restricted.includes(currentUser.rol);
              if (!isVisible) return null;
              return (
                <button key={item.role} onClick={() => setActiveRole(item.role)}
                  className={`flex-1 md:flex-initial px-4 py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all duration-300 ${activeRole === item.role ? 'bg-[#002855] text-white shadow-md' : 'text-slate-600 hover:text-[#002855] hover:bg-slate-200/50'}`}>
                  {item.icon}{item.label}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* ── MAIN ── */}
      <main className="flex-1 p-4 md:p-6 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-4 gap-6">

        {isLoading ? (
          <div className="col-span-1 lg:col-span-4 grid grid-cols-1 md:grid-cols-3 gap-6 py-6">
            {[...Array(6)].map((_, i) => <SkeletonCard key={i}/>)}
          </div>
        ) : activeRole === 'inicio' ? (

          /* ══════════════════ LANDING ══════════════════ */
          <div className="col-span-1 lg:col-span-4 space-y-8 py-6">
            <div className="relative overflow-hidden bg-gradient-to-r from-[#002855] via-[#0b3c70] to-[#002855] text-white rounded-3xl p-8 md:p-12 shadow-xl border border-[#001f42] flex flex-col md:flex-row items-center justify-between gap-8 animate-fade-in text-left">
              <div className="absolute top-0 right-0 w-64 h-64 bg-[#D4AF37] opacity-10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"/>
              <div className="absolute bottom-0 left-0 w-64 h-64 bg-[#64B5F6] opacity-10 rounded-full blur-3xl -ml-16 -mb-16 pointer-events-none"/>
              <div className="space-y-4 max-w-2xl relative z-10">
                <span className="bg-[#D4AF37]/20 border border-[#D4AF37]/30 text-[#D4AF37] font-bold text-xs px-3.5 py-1.5 rounded-full uppercase tracking-wider">Plataforma Oficial BNPL v2.0</span>
                <h2 className="text-3xl md:text-4xl font-black tracking-tight leading-tight">{landingConfig.hero_title}</h2>
                <p className="text-slate-200 text-sm md:text-base font-medium leading-relaxed max-w-xl">{landingConfig.hero_description}</p>
                {isInstallable && (
                  <button 
                    onClick={handleInstallPWA}
                    className="mt-3 bg-[#D4AF37] hover:bg-[#E5C158] text-[#002855] text-xs font-black py-2.5 px-5 rounded-xl shadow-lg transition-all duration-300 flex items-center gap-2 border border-[#D4AF37] uppercase tracking-wider hover:scale-105"
                  >
                    <Download size={14}/> Instalar CrediCRC en este Dispositivo
                  </button>
                )}
                <div className="flex flex-wrap items-center gap-3 pt-2 text-xs">
                  {[
                    { icon: <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"/>, label: 'Tasa BCV:', val: `Bs. ${bcvRate.toFixed(2)}` },
                    { icon: <Users size={14} className="text-[#64B5F6]"/>, label: 'Personal:', val: `${workers.length}` },
                    { icon: <ShoppingBag size={14} className="text-[#D4AF37]"/>, label: 'Comercios:', val: `${providers.length}` },
                    { icon: <ShieldCheck size={14} className="text-emerald-400"/>, label: 'Pagos Directos Pendientes:', val: `${pendingDirectPayments}` },
                  ].map((p, i) => (
                    <div key={i} className="flex items-center gap-2 bg-black/20 border border-white/10 px-3.5 py-2 rounded-xl">
                      {p.icon}<span className="font-semibold text-slate-300">{p.label} <strong className="text-white">{p.val}</strong></span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex-shrink-0 relative z-10 bg-white/5 backdrop-blur-md p-6 rounded-2xl border border-white/10 shadow-inner max-w-sm w-full space-y-4">
                <div className="flex items-center gap-3">
                  <div className="bg-[#64B5F6]/10 p-2.5 rounded-xl border border-[#64B5F6]/20"><TrendingUp className="text-[#64B5F6] h-5 w-5"/></div>
                  <div><h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Actividad Total</h4><p className="text-lg font-black text-white">${totalVolume.toFixed(2)} USD</p></div>
                </div>
                <div className="grid grid-cols-2 gap-4 text-xs pt-2 border-t border-white/10">
                  <div><span className="text-slate-400 block font-semibold">Ventas Procesadas</span><strong className="text-white text-sm font-mono">${totalVolume.toFixed(2)}</strong></div>
                  <div><span className="text-slate-400 block font-semibold">Cuotas Cobradas</span><strong className="text-[#D4AF37] text-sm font-mono">{installments.filter(i => i.estatus === 'Cobrado').length}/{installments.length}</strong></div>
                  <div><span className="text-slate-400 block font-semibold">Pagos Directos</span><strong className="text-emerald-400 text-sm font-mono">{directPayments.filter(d => d.estatus === 'Verificado').length}</strong></div>
                  <div><span className="text-slate-400 block font-semibold">Operaciones Exitosas</span><strong className="text-amber-400 text-sm font-mono">{transactions.filter(t => t.estatus === 'Aprobada' || t.estatus === 'Completada').length}</strong></div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { role: 'trabajador' as const, icon: <User size={26}/>, color: '#002855', title: landingConfig.portal_trabajador_title, desc: landingConfig.portal_trabajador_description, cta: 'Ingresar al Portal' },
                { role: 'proveedor' as const, icon: <ShoppingBag size={26}/>, color: '#64B5F6', title: landingConfig.portal_proveedor_title, desc: landingConfig.portal_proveedor_description, cta: 'Ingresar al POS' },
                { role: 'admin' as const, icon: <Sliders size={26}/>, color: '#E53935', title: landingConfig.portal_admin_title, desc: landingConfig.portal_admin_description, cta: 'Panel de Control' },
              ].map(card => (
                <div key={card.role} onClick={() => setActiveRole(card.role)}
                  className="group cursor-pointer bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between h-72">
                  <div className="space-y-4">
                    <div className="p-4 rounded-2xl w-14 h-14 flex items-center justify-center border border-slate-100 transition-all duration-300"
                      style={{ backgroundColor: `${card.color}08`, color: card.color }}>
                      {card.icon}
                    </div>
                    <div><h4 className="text-base font-extrabold text-[#002855]">{card.title}</h4>
                      <p className="text-xs text-slate-500 leading-relaxed font-semibold mt-1">{card.desc}</p></div>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-bold border-t border-slate-100 pt-4 mt-auto" style={{ color: card.color }}>
                    <span>{card.cta}</span><span className="group-hover:translate-x-1.5 transition-transform duration-300">→</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-slate-100 border border-slate-200 p-6 rounded-2xl grid grid-cols-1 md:grid-cols-2 gap-6 text-xs text-slate-600 font-semibold text-left">
              <div><h5 className="font-extrabold text-[#002855] uppercase tracking-wider text-[10px] mb-2">{landingConfig.politicas_financiamiento_title}</h5>
                <p className="leading-relaxed text-[11px]">{landingConfig.politicas_financiamiento_description}</p></div>
              <div className="border-t md:border-t-0 md:border-l border-slate-200 pt-4 md:pt-0 md:pl-6">
                <h5 className="font-extrabold text-[#002855] uppercase tracking-wider text-[10px] mb-2">{landingConfig.estabilidad_seguridad_title}</h5>
                <p className="leading-relaxed text-[11px]">{landingConfig.estabilidad_seguridad_description}</p></div>
            </div>
          </div>

        ) : (
          <>
            {/* ── COLUMNA PRINCIPAL ── */}
            <div className="col-span-1 lg:col-span-3 space-y-6">

              {/* ════════════ MÓDULO TRABAJADOR ════════════ */}
              {activeRole === 'trabajador' && (
                currentUser && (currentUser.rol === 'trabajador' || currentUser.rol === 'admin') ? (
                  <div className="space-y-6 animate-fade-in">
                    {currentUser.rol === 'admin' && (
                      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Modo Admin: Simular Trabajador</h2>
                          <p className="text-sm text-slate-600 font-medium">Selecciona un trabajador para ver su panel:</p>
                        </div>
                        <select value={activeWorkerId} onChange={e => { setActiveWorkerId(e.target.value); setActiveQR(null); }}
                          className="bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-4 text-sm text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-[#64B5F6] cursor-pointer">
                          {workers.map(w => <option key={w.id} value={w.id}>{w.nombre} ({w.cargo})</option>)}
                        </select>
                      </div>
                    )}

                    {currentWorker ? (
                      <>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                          <WorkerCreditCard worker={currentWorker}/>

                          {/* Crédito disponible */}
                          <div className="md:col-span-1 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center justify-center text-center">
                            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Crédito Disponible</h4>
                            <div className="relative w-40 h-40 flex items-center justify-center">
                              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                                <circle cx="50" cy="50" r="40" stroke="#e2e8f0" strokeWidth="8" fill="transparent"/>
                                <circle cx="50" cy="50" r="40"
                                  stroke={currentWorker.limite_disponible > 0 ? '#64B5F6' : '#E53935'}
                                  strokeWidth="8" fill="transparent"
                                  strokeDasharray={`${2 * Math.PI * 40}`}
                                  strokeDashoffset={`${2 * Math.PI * 40 * (1 - (currentWorker.limite_total > 0 ? currentWorker.limite_disponible / currentWorker.limite_total : 0))}`}
                                  strokeLinecap="round" className="transition-all duration-500 ease-out"/>
                              </svg>
                              <div className="absolute flex flex-col items-center justify-center">
                                <span className="text-3xl font-extrabold text-slate-800 font-mono">${currentWorker.limite_disponible.toFixed(0)}</span>
                                <span className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">de ${currentWorker.limite_total.toFixed(0)}</span>
                              </div>
                            </div>
                            <NivelBadge nivel={currentWorker.nivel_credito}/>
                            <p className="text-[11px] text-slate-500 mt-3 leading-normal">Nivel {currentWorker.nivel_credito}: Inicial {(CREDIT_LEVELS[currentWorker.nivel_credito - 1]?.porcentaje_inicial * 100).toFixed(0)}% calculada por el proveedor</p>
                          </div>

                          {/* Generador de QR de identidad */}
                          <div className="md:col-span-1 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
                            <div>
                              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                                <QrCode size={14} className="text-[#64B5F6]"/>Mi Código QR de Identificación
                              </h4>
                              <div className="bg-gradient-to-br from-slate-50 to-blue-50 border border-blue-100 rounded-xl p-4 space-y-3 text-xs">
                                <div className="flex items-start gap-3">
                                  <div className="w-8 h-8 bg-[#002855] rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                                    <span className="text-white font-black text-base">1</span>
                                  </div>
                                  <div>
                                    <p className="font-black text-slate-800">Genera tu QR de identidad</p>
                                    <p className="text-slate-500 font-medium">Válido por 5 minutos, sin montos.</p>
                                  </div>
                                </div>
                                <div className="flex items-start gap-3">
                                  <div className="w-8 h-8 bg-[#64B5F6] rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                                    <span className="text-white font-black text-base">2</span>
                                  </div>
                                  <div>
                                    <p className="font-black text-slate-800">El proveedor escanea tu QR</p>
                                    <p className="text-slate-500 font-medium">Ingresa el monto de la compra en su terminal.</p>
                                  </div>
                                </div>
                                <div className="flex items-start gap-3">
                                  <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                                    <span className="text-white font-black text-base">3</span>
                                  </div>
                                  <div>
                                    <p className="font-black text-slate-800">Cuota calculada automáticamente</p>
                                    <p className="text-slate-500 font-medium">Según tu Nivel {currentWorker.nivel_credito} ({(CREDIT_LEVELS[currentWorker.nivel_credito - 1]?.porcentaje_inicial * 100).toFixed(0)}% de inicial).</p>
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div className="space-y-2 mt-4">
                              {currentWorker.qr_bloqueado ? (
                                <div className="w-full flex items-center justify-center gap-2 bg-red-50 border border-red-200 text-red-600 text-xs font-bold py-3 px-4 rounded-xl">
                                  <Lock size={14}/> QR Bloqueado — Contacta Administración
                                </div>
                              ) : (
                                <button onClick={handleGenerateQR} disabled={isGeneratingQR}
                                  className="w-full bg-gradient-to-r from-[#002855] to-[#073B73] hover:from-[#073B73] hover:to-[#002855] text-white text-xs font-bold py-3.5 px-4 rounded-xl shadow-md transition duration-300 flex items-center justify-center gap-1.5 disabled:opacity-50">
                                  {isGeneratingQR ? <><RefreshCw size={14} className="animate-spin"/>Generando...</> : <><QrCode size={14} className="text-amber-300"/>Generar Mi QR de Identificación</>}
                                </button>
                              )}
                              {activeQR && activeQR.workerId === currentWorker.id && !showQRModal && (
                                <button onClick={() => setShowQRModal(true)}
                                  className="w-full bg-slate-100 hover:bg-slate-200 text-[#002855] text-xs font-bold py-2.5 px-4 rounded-xl border border-slate-200 transition flex items-center justify-center gap-1.5">
                                  <Eye size={14}/> Ver QR Activo ({Math.floor(qrCountdown / 60)}:{(qrCountdown % 60).toString().padStart(2, '0')})
                                </button>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* QR Modal */}
                        {showQRModal && activeQR && (
                          <QRDisplay qr={activeQR} countdown={qrCountdown} onClose={() => setShowQRModal(false)}/>
                        )}

                        {/* Cuotas y Pagos Directos */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                            <div className="flex items-center justify-between mb-4">
                              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                <Calendar size={14} className="text-[#64B5F6]"/>Próximos Descuentos
                              </h4>
                              <button onClick={() => setShowDirectPaymentModal(true)}
                                className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[10px] font-bold px-3 py-1.5 rounded-full border border-emerald-200 flex items-center gap-1 transition">
                                <Upload size={10}/> Pago Directo
                              </button>
                            </div>
                            {currentWorkerInstallments.length === 0 ? (
                              <p className="text-xs text-slate-400 text-center py-8">No tienes cuotas pendientes registradas.</p>
                            ) : (
                              <div className="space-y-3">
                                {currentWorkerInstallments.map(inst => (
                                  <div key={inst.id} className={`p-3.5 rounded-xl border flex items-center justify-between text-xs transition ${inst.estatus === 'Cobrado' ? 'bg-slate-50/60 border-slate-100 opacity-60' : inst.estatus === 'En Verificación' ? 'bg-amber-50 border-amber-200' : inst.estatus === 'Pagado Directo' ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200'}`}>
                                    <div className="space-y-1">
                                      <div className="flex items-center gap-2">
                                        <span className="font-bold text-slate-800 font-mono">${inst.monto_usd.toFixed(2)}</span>
                                        <span className="text-slate-400">→</span>
                                        <span className="text-[#E53935] font-bold font-mono">Bs. {(inst.monto_usd * bcvRate).toFixed(2)}</span>
                                      </div>
                                      <div className="text-[10px] text-slate-500 font-medium">
                                        Vence: {new Date(inst.fecha_cobro).toLocaleDateString('es-VE', { day: 'numeric', month: 'long', year: 'numeric' })}
                                      </div>
                                    </div>
                                    <span className={`px-2.5 py-1 rounded-full text-[9px] font-extrabold uppercase tracking-wide border ${inst.estatus === 'Cobrado' ? 'bg-green-50 text-green-600 border-green-200' : inst.estatus === 'En Verificación' ? 'bg-amber-50 text-amber-700 border-amber-200' : inst.estatus === 'Pagado Directo' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-blue-50 text-blue-600 border-blue-200'}`}>
                                      {inst.estatus}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-1.5">
                              <History size={14} className="text-[#64B5F6]"/>Historial de Compras
                            </h4>
                            {currentWorkerTransactions.length === 0 ? (
                              <p className="text-xs text-slate-400 text-center py-8">No has realizado compras con CrediCRC.</p>
                            ) : (
                              <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
                                {currentWorkerTransactions.map(trans => (
                                  <div key={trans.id} className="p-3.5 bg-white rounded-xl border border-slate-200 text-xs flex items-center justify-between hover:border-slate-300 transition">
                                    <div>
                                      <strong className="text-slate-800 block">{trans.proveedores_aliados?.nombre || 'Comercio'}</strong>
                                      <span className="text-[10px] text-slate-500">{new Date(trans.fecha_transaccion).toLocaleDateString('es-VE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                                    </div>
                                    <div className="text-right">
                                      <div className="font-bold text-slate-800 font-mono">${trans.monto_usd.toFixed(2)}</div>
                                      <div className="text-[9px] text-slate-400 font-bold">Inicial: ${trans.monto_inicial_pagado_usd.toFixed(0)}</div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Modal Pago Directo */}
                        {showDirectPaymentModal && (
                          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
                              <div className="bg-gradient-to-r from-emerald-600 to-green-500 p-5 rounded-t-2xl text-white flex items-center justify-between">
                                <div><h3 className="font-black text-base">Reportar Pago Directo</h3><p className="text-xs text-emerald-100 mt-0.5">Sube tu comprobante para liberar cupo inmediatamente</p></div>
                                <button onClick={() => setShowDirectPaymentModal(false)}><X className="text-white/80 h-5 w-5"/></button>
                              </div>
                              <div className="p-6 space-y-4">
                                <div>
                                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Cuota a Pagar</label>
                                  <select value={selectedInstallmentId} onChange={e => setSelectedInstallmentId(e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 font-bold cursor-pointer">
                                    <option value="">-- Seleccionar cuota --</option>
                                    {currentWorkerInstallments.filter(i => i.estatus === 'Pendiente').map(i => (
                                      <option key={i.id} value={i.id}>${i.monto_usd.toFixed(2)} — Vence {new Date(i.fecha_cobro).toLocaleDateString('es-VE')} — {i.transacciones_credicrc?.proveedores_aliados?.nombre || 'Comercio'}</option>
                                    ))}
                                  </select>
                                </div>

                                {/* ── Datos de pago del proveedor ── */}
                                {(() => {
                                  const inst = currentWorkerInstallments.find(i => i.id === selectedInstallmentId);
                                  const prov = inst?.transacciones_credicrc?.proveedores_aliados;
                                  if (!selectedInstallmentId) return (
                                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-2.5">
                                      <span className="text-blue-400 text-lg leading-none">ℹ️</span>
                                      <p className="text-xs text-blue-700 font-semibold">Selecciona una cuota arriba para ver los datos de pago del comercio al que debes realizar la transferencia.</p>
                                    </div>
                                  );
                                  if (!prov) return null;
                                  const tienePagoMovil = prov.pago_movil_banco && prov.pago_movil_cedula && prov.pago_movil_telefono;
                                  const tieneCuenta   = prov.cuenta_enlace;
                                  return (
                                    <div className="bg-gradient-to-br from-emerald-50 to-green-50 border border-emerald-300 rounded-xl p-4 space-y-3">
                                      <div className="flex items-center gap-2 mb-1">
                                        <span className="text-emerald-600 text-base">🏪</span>
                                        <p className="text-[11px] font-black text-emerald-800 uppercase tracking-wide">Datos de Pago — {prov.nombre}</p>
                                      </div>
                                      {tienePagoMovil && (
                                        <div className="bg-white/70 rounded-lg p-3 space-y-1.5 border border-emerald-200">
                                          <p className="text-[10px] font-black text-emerald-700 uppercase tracking-wider mb-2">📱 Pago Móvil</p>
                                          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                                            <div>
                                              <p className="text-[9px] text-slate-400 font-bold uppercase">Banco</p>
                                              <p className="text-xs font-bold text-slate-800">{prov.pago_movil_banco}</p>
                                            </div>
                                            <div>
                                              <p className="text-[9px] text-slate-400 font-bold uppercase">Teléfono</p>
                                              <p className="text-xs font-bold text-slate-800 font-mono">{prov.pago_movil_telefono}</p>
                                            </div>
                                            <div className="col-span-2">
                                              <p className="text-[9px] text-slate-400 font-bold uppercase">Cédula / RIF</p>
                                              <p className="text-xs font-bold text-slate-800 font-mono">{prov.pago_movil_cedula}</p>
                                            </div>
                                          </div>
                                        </div>
                                      )}
                                      {tieneCuenta && (
                                        <div className="bg-white/70 rounded-lg p-3 border border-emerald-200">
                                          <p className="text-[10px] font-black text-emerald-700 uppercase tracking-wider mb-1.5">🏦 Cuenta Bancaria</p>
                                          <p className="text-xs font-bold text-slate-800 font-mono break-all">{prov.cuenta_enlace}</p>
                                        </div>
                                      )}
                                      {!tienePagoMovil && !tieneCuenta && (
                                        <p className="text-xs text-amber-700 font-semibold">⚠️ Este comercio no tiene datos de pago registrados. Contáctalo directamente.</p>
                                      )}
                                    </div>
                                  );
                                })()}

                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Monto Pagado ($)</label>
                                    <input type="number" value={directPayAmount} onChange={e => setDirectPayAmount(e.target.value)} placeholder="0.00"
                                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-mono font-bold"/>
                                    {directPayAmount && parseFloat(directPayAmount) > 0 && (
                                      <p className="text-[10px] text-emerald-600 font-bold mt-1 font-mono">
                                        ≈ Bs. {(parseFloat(directPayAmount) * bcvRate).toFixed(2)}
                                      </p>
                                    )}
                                  </div>
                                  <div>
                                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Referencia Bancaria</label>
                                    <input type="text" value={directPayRef} onChange={e => setDirectPayRef(e.target.value)} placeholder="Nro. de referencia"
                                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold"/>
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Tipo de Operación</label>
                                    <select value={directPayType} onChange={e => setDirectPayType(e.target.value as any)}
                                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 font-bold cursor-pointer">
                                      <option value="Pago Móvil">Pago Móvil</option>
                                      <option value="Transferencia">Transferencia Bancaria</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Banco Emisor / Origen</label>
                                    <input type="text" value={directPayBank} onChange={e => setDirectPayBank(e.target.value)} placeholder="Ej: Provincial"
                                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold" required/>
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Cédula del Titular</label>
                                    <input type="text" value={directPayCedula} onChange={e => setDirectPayCedula(e.target.value)} placeholder="Ej: V-12345678"
                                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold" required/>
                                  </div>
                                  <div>
                                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                                      {directPayType === 'Pago Móvil' ? 'Teléfono del Pago Móvil' : 'Teléfono del Titular (Opcional)'}
                                    </label>
                                    <input type="tel" value={directPayPhone} onChange={e => setDirectPayPhone(e.target.value)} placeholder="Ej: 0414-1234567"
                                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold"
                                      required={directPayType === 'Pago Móvil'}/>
                                  </div>
                                </div>
                                <div>
                                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Comprobante (Foto del Recibo)</label>
                                  <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 hover:border-emerald-300 rounded-xl p-6 cursor-pointer transition hover:bg-emerald-50/30 group">
                                    <Upload size={24} className="text-slate-300 group-hover:text-emerald-500 transition mb-2"/>
                                    <span className="text-xs text-slate-400 font-semibold">{directPayFile ? directPayFile.name : 'Clic para adjuntar imagen'}</span>
                                    <input type="file" accept="image/*" className="hidden" onChange={e => setDirectPayFile(e.target.files?.[0] || null)}/>
                                  </label>
                                </div>
                                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700 font-semibold flex gap-2">
                                  <AlertTriangle size={14} className="flex-shrink-0 mt-0.5"/>
                                  <span>Si el pago se reporta con menos de 48h antes del cierre de nómina, se aplicará como saldo a favor en la siguiente quincena.</span>
                                </div>
                                <div className="flex gap-3 justify-end">
                                  <button onClick={() => setShowDirectPaymentModal(false)} className="bg-slate-100 text-slate-600 text-xs font-bold px-4 py-2.5 rounded-xl hover:bg-slate-200 transition">Cancelar</button>
                                  <button onClick={handleSubmitDirectPayment} disabled={isUploadingPayment}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-5 py-2.5 rounded-xl shadow transition flex items-center gap-1.5 disabled:opacity-50">
                                    {isUploadingPayment ? <><RefreshCw size={12} className="animate-spin"/>Enviando...</> : <><Upload size={12}/>Reportar Pago</>}
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </>
                    ) : null}
                  </div>
                ) : <AuthCard role="trabajador" {...authCardProps}/>
              )}

              {/* ════════════ MÓDULO PROVEEDOR ════════════ */}
              {activeRole === 'proveedor' && (
                currentUser && (currentUser.rol === 'proveedor' || currentUser.rol === 'admin') ? (
                  <div className="space-y-6 animate-fade-in">
                    {currentUser.rol === 'admin' && (
                      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Modo Admin: Simular POS Proveedor</h2>
                          <p className="text-sm text-slate-600 font-medium">Simula el punto de venta de:</p>
                        </div>
                        <select value={activeProviderId} onChange={e => { setActiveProviderId(e.target.value); setScannedToken(null); setValidationResult(null); setScannedWorkerInfo(null); }}
                          className="bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-4 text-sm text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-[#64B5F6] cursor-pointer">
                          {providers.map(p => <option key={p.id} value={p.id}>{p.nombre} ({p.categoria})</option>)}
                        </select>
                      </div>
                    )}

                    {currentProvider ? (
                      <div className="space-y-6">
                        {/* POS Principal */}
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                          {/* Panel izquierdo: escanear + ingresar monto */}
                          <div className="md:col-span-5 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-5">
                            <div>
                              <div className="flex justify-between items-center mb-3">
                                <span className="text-[10px] font-bold text-[#002855] bg-blue-50 border border-blue-100 py-1 px-3 rounded-full uppercase">{currentProvider.categoria}</span>
                                {/* Comisión es confidencial del colegio — no se muestra al proveedor */}
                                <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 border border-emerald-200 py-1 px-3 rounded-full">Comercio Afiliado</span>
                              </div>
                              <h3 className="text-slate-800 font-black text-sm mb-1">{currentProvider.nombre}</h3>
                              <p className="text-[11px] text-slate-500 font-semibold">Escanea el QR de identidad del trabajador, luego ingresa el monto de la compra.</p>
                            </div>

                            {/* Paso 1: Escanear QR */}
                            {!scannedWorkerInfo ? (
                              <div className="space-y-3">
                                <div className="border-2 border-dashed border-slate-200 rounded-2xl py-10 flex flex-col items-center justify-center text-slate-400 gap-3">
                                  <QrCode size={44} className="stroke-1 animate-pulse text-slate-300"/>
                                  <p className="text-xs font-semibold text-center">Esperando QR del trabajador<br/>Escanea para identificarlo</p>
                                </div>
                                <button
                                  onClick={() => setShowQRScannerModal(true)}
                                  className="w-full bg-[#002855] hover:bg-[#073B73] text-white text-sm font-black py-4 px-4 rounded-xl shadow-lg transition flex items-center justify-center gap-2">
                                  <Camera size={18} className="text-amber-300"/>
                                  Activar Cámara y Escanear QR
                                </button>
                                {/* Simulación solo visible para admin */}
                                {currentUser?.rol === 'admin' && activeQR && (
                                  <button onClick={handleSimulateScan}
                                    className="w-full bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold py-2.5 px-4 rounded-xl border border-slate-200 transition flex items-center justify-center gap-1.5">
                                    <Zap size={12}/> [Admin] Simular Escaneo del QR Activo
                                  </button>
                                )}
                              </div>
                            ) : (
                              /* Paso 2: Trabajador identificado — ingresar monto */
                              <div className="space-y-4">
                                <div className="bg-gradient-to-br from-[#002855] to-[#073B73] rounded-xl p-4 text-white">
                                  <div className="flex items-center gap-2 mb-2">
                                    <CheckCircle2 className="text-emerald-400 h-4 w-4"/>
                                    <span className="text-xs font-black text-emerald-300">TRABAJADOR IDENTIFICADO</span>
                                  </div>
                                  <p className="font-black text-base">{scannedWorkerInfo.nombre}</p>
                                  <p className="text-blue-200 text-xs font-mono">{scannedWorkerInfo.cedula}</p>
                                  <div className="flex items-center justify-between mt-2">
                                    <NivelBadge nivel={scannedWorkerInfo.nivel} small/>
                                    <span className="text-[10px] text-blue-200 font-bold">Cupo: ${scannedWorkerInfo.limite_disponible.toFixed(2)}</span>
                                  </div>
                                </div>

                                <div>
                                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">MONTO TOTAL DE LA COMPRA ($)</label>
                                  <div className="flex gap-2">
                                    <input
                                      type="number" step="0.01" min="1"
                                      value={posAmount}
                                      onChange={e => { setPosAmount(e.target.value); setValidationResult(null); }}
                                      placeholder="0.00"
                                      className="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-3 text-2xl font-black font-mono text-slate-800 focus:outline-none focus:border-[#002855] transition text-center"/>
                                  </div>
                                </div>

                                {scannedWorkerInfo && posAmount && parseFloat(posAmount) > 0 && (() => {
                                  const pct = scannedWorkerInfo.nivel === 4 ? 0.20 : scannedWorkerInfo.nivel === 3 ? 0.30 : scannedWorkerInfo.nivel === 2 ? 0.35 : 0.40;
                                  const sugerido = parseFloat(posAmount) * pct;
                                  return (
                                    <div className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3 flex flex-col gap-1">
                                      <div className="flex justify-between items-center font-bold">
                                        <span>Inicial Sugerida (Nivel {scannedWorkerInfo.nivel} - {Math.round(pct * 100)}%):</span>
                                        <span className="font-mono text-sm">${sugerido.toFixed(2)}</span>
                                      </div>
                                      <div className="flex justify-between items-center text-[11px] text-amber-700">
                                        <span>Equivalente en Bolívares (BCV):</span>
                                        <span className="font-mono font-bold">Bs. {(sugerido * bcvRate).toFixed(2)}</span>
                                      </div>
                                    </div>
                                  );
                                })()}

                                <div>
                                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">REQUERIMIENTO DE INICIAL</label>
                                  <div className="flex gap-2">
                                    <button
                                      type="button"
                                      onClick={() => { setAplicaInicial(true); setValidationResult(null); }}
                                      className={`flex-1 py-2 text-xs font-black rounded-xl border transition ${aplicaInicial ? 'bg-[#002855] text-white border-[#002855]' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                                    >
                                      Aplica Inicial
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => { setAplicaInicial(false); setValidationResult(null); }}
                                      className={`flex-1 py-2 text-xs font-black rounded-xl border transition ${!aplicaInicial ? 'bg-[#002855] text-white border-[#002855]' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                                    >
                                      Inicial Cero
                                    </button>
                                  </div>
                                </div>

                                <div>
                                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">PLAZO DE FINANCIAMIENTO</label>
                                  <div className="flex gap-2">
                                    {[7, 15].map(d => (
                                      <button key={d} onClick={() => { setPosDays(d); setValidationResult(null); }}
                                        className={`flex-1 py-2.5 text-xs font-black rounded-xl border transition ${posDays === d ? 'bg-[#002855] text-white border-[#002855]' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}>
                                        {d} Días
                                      </button>
                                    ))}
                                  </div>
                                </div>

                                <div className="flex gap-2">
                                  <button
                                    onClick={() => { setScannedWorkerInfo(null); setScannedToken(null); setValidationResult(null); setPosAmount(''); }}
                                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold py-2.5 px-3 rounded-xl transition">
                                    Cancelar
                                  </button>
                                  <button
                                    onClick={handleCalculateAmount}
                                    disabled={isValidating || !posAmount || parseFloat(posAmount) <= 0}
                                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black py-2.5 px-3 rounded-xl shadow transition flex items-center justify-center gap-1.5 disabled:opacity-50">
                                    {isValidating ? <><RefreshCw size={12} className="animate-spin"/>Calculando...</> : <><TrendingUp size={12}/>Calcular Cuotas</>}
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Panel derecho: resultado de validación y confirmación */}
                          <div className="md:col-span-7 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
                            <div>
                              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Resumen de la Operación</h4>
                              {!validationResult && !isValidating ? (
                                <div className="border-2 border-dashed border-slate-200 rounded-2xl py-14 flex flex-col items-center justify-center text-slate-400 gap-3">
                                  <ShieldCheck size={44} className="stroke-1 text-slate-200"/>
                                  <p className="text-xs font-semibold text-center">Escanea el QR del trabajador<br/>e ingresa el monto para ver el resumen</p>
                                </div>
                              ) : isValidating ? (
                                <div className="space-y-3 py-3">
                                  {scanRetrying ? (
                                    <div className="flex flex-col gap-3">
                                      <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                                        <RefreshCw size={16} className="animate-spin text-amber-600 flex-shrink-0"/>
                                        <div>
                                          <p className="text-xs font-black text-amber-800">Conexión inestable, reintentando...</p>
                                          <p className="text-[10px] text-amber-600 font-semibold mt-0.5">
                                            Intento {scanRetryCount} de 3 · El QR escaneado está retenido en memoria.
                                          </p>
                                        </div>
                                      </div>
                                      <div className="w-full bg-amber-100 rounded-full h-1.5 overflow-hidden">
                                        <div
                                          className="bg-amber-500 h-1.5 rounded-full animate-pulse transition-all duration-1000"
                                          style={{ width: `${(scanRetryCount / 3) * 100}%` }}
                                        />
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-2 text-xs text-slate-500">
                                      <RefreshCw size={14} className="animate-spin text-[#64B5F6]"/>
                                      <span>Validando identidad y calculando cuotas...</span>
                                    </div>
                                  )}
                                </div>
                              ) : validationResult ? (
                                <div className="space-y-4">
                                  <div className={`p-4 rounded-xl border text-xs flex gap-3 ${validationResult.aprobado ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
                                    <div className="mt-0.5">{validationResult.aprobado ? <CheckCircle2 className="text-green-600 h-5 w-5"/> : <AlertCircle className="text-red-600 h-5 w-5"/>}</div>
                                    <div className="space-y-1 flex-1">
                                      <strong className="block font-black text-sm">{validationResult.aprobado ? 'Crédito Aprobado' : 'Crédito Denegado'}</strong>
                                      <p className="text-slate-600 leading-relaxed text-[11px] font-medium">{validationResult.mensaje}</p>
                                    </div>
                                  </div>

                                  {validationResult.aprobado && (
                                    <div className="space-y-4">
                                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                                        <p className="text-[10px] text-slate-500 font-black uppercase tracking-wider">Desglose Calculado por el Sistema</p>
                                        {[
                                          ['Monto Total de la Compra', `$${parseFloat(posAmount).toFixed(2)}`, 'text-slate-800'],
                                          ['Nivel del Trabajador', `${CREDIT_LEVELS[(validationResult.nivel_credito || 1) - 1]?.icon} ${CREDIT_LEVELS[(validationResult.nivel_credito || 1) - 1]?.nombre}`, 'text-blue-700'],
                                          ['Pago Inicial (calculado)', `$${validationResult.monto_inicial_calculado.toFixed(2)}`, 'text-amber-700 font-black text-base'],
                                          ['Cuota a Financiar (nómina)', `$${validationResult.cuota_financiada.toFixed(2)}`, 'text-[#002855] font-black text-base'],
                                          ['Equiv. Bs. a Descontar', `Bs. ${(validationResult.cuota_financiada * bcvRate).toFixed(2)}`, 'text-[#E53935]'],
                                          ['Plazo', `${posDays} días`, 'text-slate-600'],
                                        ].map(([label, val, cls]) => (
                                          <div key={label as string} className="flex justify-between text-xs">
                                            <span className="text-slate-500 font-semibold">{label}</span>
                                            <span className={`font-bold font-mono ${cls}`}>{val}</span>
                                          </div>
                                        ))}
                                      </div>

                                      {/* ─── MÓDULO 2: BANNERS DINÁMICOS DE INICIAL ────────────────── */}
                                      {aplicaInicial && validationResult.monto_inicial_calculado > 0 ? (
                                        // ESTADO A: Inicial Requerida — Banner gigante de alerta
                                        <div className="rounded-2xl overflow-hidden shadow-xl">
                                          <div className={`bg-gradient-to-br from-amber-500 via-orange-500 to-red-500 p-6 text-center space-y-3 ${!inicialConfirmada ? 'animate-pulse' : ''}`}>
                                            <div className="flex items-center justify-center gap-2">
                                              <AlertTriangle className="text-white h-7 w-7" />
                                              <p className="text-white font-black text-lg uppercase tracking-widest">VERIFICAR PAGO DE INICIAL</p>
                                            </div>
                                            <p className="text-5xl font-black text-white font-mono tracking-tight">${validationResult.monto_inicial_calculado.toFixed(2)}</p>
                                            <p className="text-xl font-black text-amber-100 font-mono">Bs. {(validationResult.monto_inicial_calculado * bcvRate).toFixed(2)}</p>
                                            <p className="text-xs text-amber-100 font-semibold leading-snug">El trabajador debe pagar este monto exacto en tienda antes de registrar la venta.</p>
                                          </div>
                                          {!inicialConfirmada ? (
                                            <button
                                              onClick={() => setInicialConfirmada(true)}
                                              className="w-full bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-base py-4 px-4 flex items-center justify-center gap-3 transition-all duration-200 shadow-lg"
                                            >
                                              <CheckCircle2 size={22}/>
                                              Confirmar Recepción de Inicial en Tienda
                                            </button>
                                          ) : (
                                            <div className="bg-emerald-500 text-white font-black text-sm py-3 px-4 flex items-center justify-center gap-2">
                                              <CheckCircle2 size={18}/> Inicial confirmada — Puedes procesar la venta
                                            </div>
                                          )}
                                        </div>
                                      ) : !aplicaInicial ? (
                                        // ESTADO B: Inicial Cero — Banner de éxito verde
                                        <div className="bg-gradient-to-br from-emerald-500 to-green-600 rounded-2xl p-6 text-center space-y-3 shadow-xl">
                                          <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto animate-bounce">
                                            <CheckCircle2 className="text-white h-10 w-10"/>
                                          </div>
                                          <p className="text-white font-black text-xl uppercase tracking-wide">Venta Autorizada</p>
                                          <p className="text-emerald-100 font-black text-2xl">Inicial Cero ✔</p>
                                          <p className="text-emerald-200 text-sm font-semibold">Cuota a financiar: <strong className="text-white font-mono">${validationResult.cuota_financiada.toFixed(2)}</strong></p>
                                        </div>
                                      ) : null}
                                    </div>
                                  )}
                                </div>
                              ) : null}
                            </div>
                            {validationResult?.aprobado && (
                              <div className="flex gap-3 mt-6">
                                <button onClick={() => { setScannedWorkerInfo(null); setScannedToken(null); setValidationResult(null); setPosAmount(''); setInicialConfirmada(false); }}
                                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold py-2.5 px-4 rounded-xl transition">
                                  Cancelar
                                </button>
                                <button
                                  disabled={isProcessingPurchase || (aplicaInicial && validationResult.monto_inicial_calculado > 0 && !inicialConfirmada)}
                                  onClick={() => handleProcessPurchaseDebounced()}
                                  title={aplicaInicial && validationResult.monto_inicial_calculado > 0 && !inicialConfirmada ? 'Confirma la recepción de la inicial primero' : ''}
                                  className="flex-1 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-emerald-600 hover:to-green-500 text-white text-xs font-extrabold py-2.5 px-4 rounded-xl shadow transition flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed">
                                  {isProcessingPurchase ? <><RefreshCw size={14} className="animate-spin"/>Registrando...</> : <><Check size={14}/>Confirmar y Procesar Venta</>}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Historial de ventas */}
                        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                          {/* Tabs de Historial y Reporte */}
                          <div className="flex border-b border-slate-200 gap-6 overflow-x-auto">
                            <button type="button" onClick={() => setProviderSubTab('sales')}
                              className={`pb-3 text-xs font-black uppercase tracking-wider transition whitespace-nowrap ${providerSubTab === 'sales' ? 'text-[#002855] border-b-2 border-[#002855]' : 'text-slate-400 hover:text-slate-600'}`}>
                              <span className="flex items-center gap-1.5"><History size={14}/>Ventas Recientes</span>
                            </button>
                            <button type="button" onClick={() => setProviderSubTab('report')}
                              className={`pb-3 text-xs font-black uppercase tracking-wider transition whitespace-nowrap ${providerSubTab === 'report' ? 'text-[#002855] border-b-2 border-[#002855]' : 'text-slate-400 hover:text-slate-600'}`}>
                              <span className="flex items-center gap-1.5"><Percent size={14}/>Reporte Financiero</span>
                            </button>
                            <button type="button" onClick={() => {
                              setProviderSubTab('profile');
                              setEditProviderDireccion(currentProvider?.direccion || '');
                              setEditProviderTelefono(currentProvider?.telefono || '');
                              setEditProviderPagoMovilBanco(currentProvider?.pago_movil_banco || '');
                              setEditProviderPagoMovilCedula(currentProvider?.pago_movil_cedula || '');
                              setEditProviderPagoMovilTelefono(currentProvider?.pago_movil_telefono || '');
                            }}
                              className={`pb-3 text-xs font-black uppercase tracking-wider transition whitespace-nowrap ${providerSubTab === 'profile' ? 'text-[#002855] border-b-2 border-[#002855]' : 'text-slate-400 hover:text-slate-600'}`}>
                              <span className="flex items-center gap-1.5"><Building2 size={14}/>Mi Comercio</span>
                            </button>
                          </div>

                          {providerSubTab === 'sales' ? (
                            <div>
                              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Ventas Recientes Financiadas</h4>
                              {currentProviderTransactions.length === 0 ? (
                                <p className="text-xs text-slate-400 text-center py-8">No hay ventas financiadas en este comercio.</p>
                              ) : (() => {
                                const totalPages = Math.ceil(currentProviderTransactions.length / SALES_PER_PAGE);
                                const paginated = currentProviderTransactions.slice((salesPage - 1) * SALES_PER_PAGE, salesPage * SALES_PER_PAGE);
                                return (
                                  <div className="space-y-3">
                                    <div className="overflow-x-auto">
                                      <table className="w-full text-xs text-left text-slate-600">
                                        <thead className="text-[10px] bg-slate-50 text-slate-500 uppercase tracking-wider border-b border-slate-200">
                                          {/* Comisión oculta del proveedor — confidencial del colegio */}
                                          <tr><th className="py-3 px-4">Trabajador</th><th className="py-3 px-4">Fecha</th><th className="py-3 px-4 text-right">Total ($)</th><th className="py-3 px-4 text-right">Inicial ($)</th><th className="py-3 px-4 text-right text-green-600">Financiado ($)</th></tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                          {paginated.map(t => (
                                            <tr key={t.id} className="hover:bg-slate-50/50 transition">
                                              <td className="py-3 px-4 font-bold text-slate-800">{t.trabajadores_crc?.nombre || 'N/A'}</td>
                                              <td className="py-3 px-4 text-slate-500">{new Date(t.fecha_transaccion).toLocaleDateString('es-VE')}</td>
                                              <td className="py-3 px-4 text-right font-mono font-bold">${t.monto_usd.toFixed(2)}</td>
                                              <td className="py-3 px-4 text-right font-mono">${t.monto_inicial_pagado_usd.toFixed(2)}</td>
                                              <td className="py-3 px-4 text-right font-bold text-green-600 font-mono">${(t.monto_usd - t.monto_inicial_pagado_usd).toFixed(2)}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                    {totalPages > 1 && (
                                      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                                        <span className="text-[10px] text-slate-400 font-semibold">
                                          Mostrando {(salesPage - 1) * SALES_PER_PAGE + 1}–{Math.min(salesPage * SALES_PER_PAGE, currentProviderTransactions.length)} de {currentProviderTransactions.length} ventas
                                        </span>
                                        <div className="flex gap-1">
                                          <button onClick={() => setSalesPage(p => Math.max(1, p - 1))} disabled={salesPage === 1}
                                            className="px-3 py-1.5 text-[10px] font-bold rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 transition">← Ant.</button>
                                          {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                                            <button key={p} onClick={() => setSalesPage(p)}
                                              className={`px-3 py-1.5 text-[10px] font-bold rounded-lg border transition ${
                                                p === salesPage ? 'bg-[#002855] text-white border-[#002855]' : 'border-slate-200 bg-white hover:bg-slate-50'
                                              }`}>{p}</button>
                                          ))}
                                          <button onClick={() => setSalesPage(p => Math.min(totalPages, p + 1))} disabled={salesPage === totalPages}
                                            className="px-3 py-1.5 text-[10px] font-bold rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 transition">Sig. →</button>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                            </div>
                          ) : (
                            <div className="space-y-6">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div>
                                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Reporte de Conciliación de Comisiones</h4>
                                  <p className="text-xs text-slate-500 font-medium">Visualiza los montos a transferir por comisiones al colegio al inicio de mes.</p>
                                </div>
                                {reportMonths.length > 0 && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-slate-500 font-bold">Seleccionar Mes:</span>
                                    <select
                                      value={activeReportMonth}
                                      onChange={e => setSelectedReportMonth(e.target.value)}
                                      className="bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-[#002855] cursor-pointer"
                                    >
                                      {reportMonths.map(m => {
                                        const [y, monthNum] = m.split('-');
                                        const date = new Date(parseInt(y), parseInt(monthNum) - 1, 1);
                                        const label = date.toLocaleDateString('es-VE', { month: 'long', year: 'numeric' });
                                        return <option key={m} value={m}>{label.charAt(0).toUpperCase() + label.slice(1)}</option>;
                                      })}
                                    </select>
                                  </div>
                                )}
                              </div>

                              {reportMonths.length === 0 ? (
                                <p className="text-xs text-slate-400 text-center py-8">No hay transacciones registradas para generar reportes financieros.</p>
                              ) : (
                                <div className="space-y-6">
                                  {/* Tarjetas de Métricas del Mes */}
                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col justify-between">
                                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Ventas Totales del Mes</span>
                                      <div className="mt-2">
                                        <h5 className="text-lg font-extrabold text-slate-800 font-mono">${monthlyStats.bruto.toFixed(2)}</h5>
                                        <p className="text-[10px] text-slate-500 font-semibold font-mono">Bs. {(monthlyStats.bruto * bcvRate).toFixed(2)}</p>
                                      </div>
                                    </div>
                                    <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 flex flex-col justify-between">
                                      <span className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider">Ventas Cobradas (Pagadas)</span>
                                      <div className="mt-2">
                                        <h5 className="text-lg font-extrabold text-emerald-800 font-mono">${monthlyStats.pagado.toFixed(2)}</h5>
                                        <p className="text-[10px] text-emerald-600 font-semibold font-mono">Bs. {(monthlyStats.pagado * bcvRate).toFixed(2)}</p>
                                      </div>
                                    </div>
                                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col justify-between">
                                      <span className="text-[10px] text-amber-700 font-bold uppercase tracking-wider">Comisión Colegio a Pagar</span>
                                      <div className="mt-2">
                                        <h5 className="text-lg font-extrabold text-amber-800 font-mono">${monthlyStats.comision.toFixed(2)}</h5>
                                        <p className="text-[10px] text-amber-700 font-semibold font-mono">Bs. {(monthlyStats.comision * bcvRate).toFixed(2)}</p>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Detalles y Cuentas de Transferencia */}
                                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                                    <div className="lg:col-span-8 space-y-4">
                                      <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Detalle de Compras del Periodo</h5>
                                      <div className="overflow-x-auto border border-slate-200 rounded-xl">
                                        <table className="w-full text-[11px] text-left text-slate-600">
                                          <thead className="bg-slate-50 text-slate-500 uppercase text-[9px] tracking-wider border-b border-slate-200">
                                            <tr>
                                              <th className="py-2.5 px-3">Trabajador</th>
                                              <th className="py-2.5 px-3">Fecha</th>
                                              <th className="py-2.5 px-3 text-right">Compra</th>
                                              <th className="py-2.5 px-3 text-right text-amber-700">Comisión</th>
                                              <th className="py-2.5 px-3 text-center">Estado Cobro</th>
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-slate-100">
                                            {monthlyTransactions.map(t => {
                                              const txInstallments = installments.filter(inst => inst.transaccion_id === t.id);
                                              const isPaid = txInstallments.length > 0 && txInstallments.every(inst => inst.estatus === 'Cobrado' || inst.estatus === 'Pagado Directo');
                                              return (
                                                <tr key={t.id} className="hover:bg-slate-50/30 transition">
                                                  <td className="py-2.5 px-3 font-bold text-slate-800">{t.trabajadores_crc?.nombre || 'N/A'}</td>
                                                  <td className="py-2.5 px-3 text-slate-500">{new Date(t.fecha_transaccion).toLocaleDateString('es-VE')}</td>
                                                  <td className="py-2.5 px-3 text-right font-mono font-semibold">${t.monto_usd.toFixed(2)}</td>
                                                  <td className="py-2.5 px-3 text-right font-mono text-amber-700 font-bold">${t.comision_monto_usd.toFixed(2)}</td>
                                                  <td className="py-2.5 px-3 text-center">
                                                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${isPaid ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                                                      {isPaid ? 'Cobrado' : 'En Lote/Pendiente'}
                                                    </span>
                                                  </td>
                                                </tr>
                                              );
                                            })}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>

                                    <div className="lg:col-span-4 bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4 flex flex-col justify-between">
                                      <div className="space-y-3">
                                        <h5 className="text-xs font-black text-slate-800 uppercase tracking-wide flex items-center gap-1.5"><ShieldCheck size={14} className="text-[#002855]"/>Pago de Comisión</h5>
                                        <p className="text-[10px] text-slate-500 font-semibold leading-relaxed">
                                          Al inicio de mes, el proveedor debe transferir el acumulado de comisiones correspondiente a las ventas del periodo anterior.
                                        </p>
                                        <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2 text-[10px] font-semibold text-slate-600">
                                          <p className="font-bold text-[#002855]">Datos de Cuenta del Colegio:</p>
                                          <div className="space-y-1">
                                            <p><span className="text-slate-400">Banco:</span> {landingConfig.colegio_banco || 'Banco de Venezuela'}</p>
                                            <p><span className="text-slate-400">Cuenta:</span> {landingConfig.colegio_cuenta || '0102-0987-65-4321098765'}</p>
                                            <p><span className="text-slate-400">RIF:</span> {landingConfig.colegio_rif || 'G-20012345-6'}</p>
                                            <p><span className="text-slate-400">Nombre:</span> {landingConfig.colegio_nombre || 'U.E. Colegio Rafael Castillo'}</p>
                                          </div>
                                        </div>
                                      </div>
                                      
                                      <div className="space-y-2">
                                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
                                          <p className="text-[9px] font-bold text-amber-700 uppercase tracking-wider">Monto a Transferir:</p>
                                          <p className="text-lg font-black text-amber-800 font-mono">${monthlyStats.comision.toFixed(2)}</p>
                                          <p className="text-[11px] font-bold text-amber-700 font-mono">Bs. {(monthlyStats.comision * bcvRate).toFixed(2)}</p>
                                        </div>
                                        
                                        <button 
                                          onClick={() => window.print()}
                                          className="w-full bg-[#002855] hover:bg-[#073B73] text-white text-[11px] font-black py-2 px-3 rounded-xl transition flex items-center justify-center gap-1"
                                        >
                                          <Download size={12}/> Imprimir Reporte Financiero
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                          {/* ─── TAB: MI COMERCIO (Módulo 4B) ───────────────────────── */}
                          {providerSubTab === 'profile' && currentProvider && (
                            <div className="space-y-6">
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                {/* Avatar / Logo */}
                                <div className="flex flex-col items-center gap-4 p-6 bg-gradient-to-br from-[#002855] to-[#073B73] rounded-2xl text-white">
                                  <div className="relative">
                                    {currentProvider.logo_url ? (
                                      <img src={currentProvider.logo_url} alt="Logo" className="w-24 h-24 rounded-full object-cover border-4 border-white/30 shadow-xl"/>
                                    ) : (
                                      <div className="w-24 h-24 rounded-full bg-white/20 flex items-center justify-center border-4 border-white/30 shadow-xl">
                                        <span className="text-3xl font-black text-white">{currentProvider.nombre.charAt(0).toUpperCase()}</span>
                                      </div>
                                    )}
                                    <label className="absolute -bottom-1 -right-1 bg-amber-400 hover:bg-amber-500 text-white w-8 h-8 rounded-full flex items-center justify-center cursor-pointer shadow-lg transition">
                                      <ImagePlus size={14}/>
                                      <input type="file" accept="image/*" className="hidden" onChange={e => setLogoFile(e.target.files?.[0] || null)}/>
                                    </label>
                                  </div>
                                  <div className="text-center">
                                    <h4 className="font-black text-base">{currentProvider.nombre}</h4>
                                    <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded-full font-bold uppercase">{currentProvider.categoria}</span>
                                  </div>
                                  {logoFile && (
                                    <p className="text-[10px] text-amber-200 font-semibold text-center">✓ Logo listo para subir: {logoFile.name}</p>
                                  )}
                                </div>

                                {/* Datos de Sólo Lectura */}
                                <div className="space-y-4">
                                  <h5 className="text-xs font-black text-slate-500 uppercase tracking-wider">Datos del Establecimiento</h5>
                                  <div className="space-y-3">
                                    {[
                                      { label: 'Razón Social', val: currentProvider.razon_social || '(No registrado)' },
                                      { label: 'RIF', val: currentProvider.rif || '(No registrado)' },
                                      { label: 'Cuenta Bancaria (Liquidación)', val: currentProvider.cuenta_enlace ? currentProvider.cuenta_enlace.replace(/(.{4})/g,'$1-').slice(0,-1) : '(No registrado)' },
                                    ].map(item => (
                                      <div key={item.label} className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{item.label}</p>
                                        <p className="text-sm font-bold text-slate-800 mt-0.5 font-mono">{item.val}</p>
                                      </div>
                                    ))}
                                  </div>
                                </div>

                                {/* Datos Editables */}
                                <div className="space-y-4">
                                  <h5 className="text-xs font-black text-slate-500 uppercase tracking-wider">Datos de Contacto (Editable)</h5>
                                  <div className="space-y-3">
                                    <div>
                                      <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1 flex items-center gap-1"><MapPin size={10}/>Dirección Comercial</label>
                                      <input type="text" value={editProviderDireccion} onChange={e => setEditProviderDireccion(e.target.value)}
                                        placeholder="Ej: Av. Principal, Local 3, Duaca"
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-semibold focus:outline-none focus:border-[#002855] transition"/>
                                    </div>
                                    <div>
                                      <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1 flex items-center gap-1"><Phone size={10}/>Teléfono de Contacto</label>
                                      <input type="tel" value={editProviderTelefono} onChange={e => setEditProviderTelefono(e.target.value)}
                                        placeholder="Ej: 0414-123-4567"
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-semibold focus:outline-none focus:border-[#002855] transition"/>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Pago Móvil */}
                              <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 space-y-4">
                                <h5 className="text-xs font-black text-[#002855] uppercase tracking-wider flex items-center gap-2"><Banknote size={14}/>Datos de Pago Móvil</h5>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                  <div>
                                    <label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Banco</label>
                                    <input type="text" value={editProviderPagoMovilBanco} onChange={e => setEditProviderPagoMovilBanco(e.target.value)}
                                      placeholder="Ej: Banco Mercantil"
                                      className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs font-semibold focus:outline-none focus:border-[#002855] transition"/>
                                  </div>
                                  <div>
                                    <label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Cédula / RIF</label>
                                    <input type="text" value={editProviderPagoMovilCedula} onChange={e => setEditProviderPagoMovilCedula(e.target.value)}
                                      placeholder="Ej: J-12345678-9"
                                      className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs font-mono font-semibold focus:outline-none focus:border-[#002855] transition"/>
                                  </div>
                                  <div>
                                    <label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Teléfono</label>
                                    <input type="tel" value={editProviderPagoMovilTelefono} onChange={e => setEditProviderPagoMovilTelefono(e.target.value)}
                                      placeholder="Ej: 0414-123-4567"
                                      className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs font-semibold focus:outline-none focus:border-[#002855] transition"/>
                                  </div>
                                </div>
                              </div>

                              <div className="flex justify-end">
                                <button onClick={handleSaveProviderProfile} disabled={isSavingProfile || isUploadingLogo}
                                  className="bg-gradient-to-r from-[#002855] to-[#073B73] hover:from-[#073B73] hover:to-[#002855] text-white text-xs font-black px-6 py-3 rounded-xl shadow-md transition flex items-center gap-2 disabled:opacity-50">
                                  {isSavingProfile ? <><RefreshCw size={14} className="animate-spin"/>Guardando...</> : isUploadingLogo ? <><RefreshCw size={14} className="animate-spin"/>Subiendo Logo...</> : <><BadgeCheck size={14}/>Guardar Cambios del Perfil</>}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : <AuthCard role="proveedor" {...authCardProps}/>
              )}

              {/* ════════════ PANEL ADMIN / TESORERÍA ════════════ */}
              {activeRole === 'admin' && (
                currentUser && (currentUser.rol === 'admin' || currentUser.rol === 'tesoreria') ? (
                  <div className="space-y-6 animate-fade-in">

                    {/* Métricas — solo rol admin las ve completas; Tesorería ve versión reducida */}
                    {currentUser?.rol === 'admin' ? (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {[
                        { label: 'Volumen Financiado', val: `$${totalVolume.toFixed(2)}`, sub: 'Por cobrar vía nómina', icon: <TrendingUp size={20}/>, color: 'text-[#64B5F6]', bg: 'bg-blue-50', border: 'border-blue-100' },
                        { label: 'Comisión Colegio', val: `$${totalCommissions.toFixed(2)}`, sub: 'Ganancias 3%-5%', icon: <Percent size={20}/>, color: 'text-[#E53935]', bg: 'bg-red-50', border: 'border-red-100' },
                        { label: 'Cuotas Pendientes', val: pendingDeductionsCount.toString(), sub: 'En nómina próxima', icon: <Calendar size={20}/>, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100' },
                        { label: 'Pagos Directos', val: pendingDirectPayments.toString(), sub: 'Por verificar', icon: <Upload size={20}/>, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
                      ].map(m => (
                        <div key={m.label} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                          <div className="space-y-1">
                            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">{m.label}</span>
                            <h4 className={`text-xl font-extrabold ${m.color} font-mono`}>{m.val}</h4>
                            <p className="text-[9px] text-slate-500 font-semibold">{m.sub}</p>
                          </div>
                          <div className={`h-10 w-10 ${m.bg} ${m.color} flex items-center justify-center rounded-xl border ${m.border}`}>{m.icon}</div>
                        </div>
                      ))}
                    </div>
                    ) : (
                    <div className="grid grid-cols-2 gap-4">
                      {[
                        { label: 'Cuotas Pendientes de Nómina', val: pendingDeductionsCount.toString(), sub: 'Por descontar en próxima nómina', icon: <Calendar size={20}/>, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100' },
                        { label: 'Pagos Directos Pendientes', val: pendingDirectPayments.toString(), sub: 'Comprobantes por verificar', icon: <Upload size={20}/>, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
                      ].map(m => (
                        <div key={m.label} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                          <div className="space-y-1">
                            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">{m.label}</span>
                            <h4 className={`text-xl font-extrabold ${m.color} font-mono`}>{m.val}</h4>
                            <p className="text-[9px] text-slate-500 font-semibold">{m.sub}</p>
                          </div>
                          <div className={`h-10 w-10 ${m.bg} ${m.color} flex items-center justify-center rounded-xl border ${m.border}`}>{m.icon}</div>
                        </div>
                      ))}
                    </div>
                    )}

                    {/* Tabs admin — filtrados según rol: Tesorería solo ve nómina, pagos directos y liquidación */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="flex overflow-x-auto border-b border-slate-200 bg-slate-50">
                        {([
                          ...(currentUser?.rol === 'admin' ? [
                            { id: 'dashboard', label: 'Dashboard', icon: <Home size={13}/> },
                            { id: 'workers', label: 'Trabajadores', icon: <Users size={13}/> },
                          ] : []),
                          { id: 'payroll', label: 'Nómina', icon: <Calendar size={13}/> },
                          { id: 'direct-payments', label: `Pagos Directos${pendingDirectPayments > 0 ? ` (${pendingDirectPayments})` : ''}`, icon: <Upload size={13}/> },
                          { id: 'providers', label: 'Proveedores', icon: <ShoppingBag size={13}/> },
                          ...(currentUser?.rol === 'admin' ? [
                            { id: 'gamification', label: 'Gamificación', icon: <Award size={13}/> },
                            { id: 'notificaciones', label: 'Notificaciones', icon: <Bell size={13}/> },
                          ] : []),
                        ] as { id: typeof adminTab, label: string, icon: any }[]).map(tab => (

                          <button key={tab.id} onClick={() => setAdminTab(tab.id)}
                            className={`flex items-center gap-1.5 px-4 py-3 text-[10px] font-bold whitespace-nowrap transition-all ${adminTab === tab.id ? 'bg-white border-b-2 border-[#002855] text-[#002855]' : 'text-slate-500 hover:text-slate-700'}`}>
                            {tab.icon}{tab.label}
                          </button>
                        ))}
                      </div>

                      <div className="p-6">
                        {/* Dashboard tab */}
                        {adminTab === 'dashboard' && (
                          <div className="space-y-4">
                            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-5 rounded-xl border border-blue-100">
                              <h4 className="text-xs font-black text-[#002855] uppercase tracking-wider mb-3">Credenciales de Prueba</h4>
                              <div className="flex flex-wrap gap-4 text-[10px] text-slate-700 font-bold font-mono">
                                <div><span className="text-[#002855] block uppercase text-[8px] font-sans">Admin</span>admin@credicrc.com / DirectivaCRC2026</div>
                                <div className="border-l border-slate-200 pl-4"><span className="text-emerald-600 block uppercase text-[8px] font-sans">Trabajador (Docente)</span>maria@credicrc.com / 12345</div>
                                <div className="border-l border-slate-200 pl-4"><span className="text-[#64B5F6] block uppercase text-[8px] font-sans">Proveedor</span>viveres@credicrc.com / 12345</div>
                                <div className="border-l border-slate-200 pl-4"><span className="text-purple-600 block uppercase text-[8px] font-sans">Tesorería</span>tesoreria@credicrc.com / password</div>
                              </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                                <h5 className="text-xs font-bold text-slate-600 mb-3">Tasa BCV Activa</h5>
                                <div className="flex items-center gap-3">
                                  <span className="text-2xl font-black font-mono text-[#E53935]">Bs. {bcvRate.toFixed(2)}</span>
                                  <input type="number" step="0.01" value={bcvRate}
                                    onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v) && v > 0) setBcvRate(v); }}
                                    className="w-24 bg-white border border-slate-200 rounded-lg p-2 text-xs font-mono text-center font-bold"/>
                                  <button onClick={fetchBcvRate} className="bg-[#002855] text-white text-[10px] font-bold px-3 py-2 rounded-lg flex items-center gap-1 transition hover:bg-[#073B73]">
                                    <RefreshCw size={10}/>Sincronizar
                                  </button>
                                </div>
                              </div>
                              <div className="bg-red-50 p-4 rounded-xl border border-red-200">
                                <h5 className="text-xs font-bold text-red-700 mb-1 flex items-center gap-1.5"><AlertTriangle size={12}/>Zona de Peligro — Solo Desarrollo</h5>
                                <p className="text-[10px] text-red-500 mb-3 leading-snug">Deshabilitado en producción para proteger datos reales de trabajadores y proveedores.</p>
                                <button
                                  disabled={true}
                                  title="Deshabilitado permanentemente en producción"
                                  className="text-red-300 bg-red-100 border border-red-200 text-[10px] font-bold px-3 py-2 rounded-lg flex items-center gap-1.5 cursor-not-allowed opacity-50 select-none w-full justify-center"
                                >
                                  <RefreshCw size={12}/>Reiniciar BD (Bloqueado en Producción)
                                </button>
                              </div>
                            </div>
                            {/* Solicitudes pendientes */}
                            {systemUsers.filter(u => !u.aprobado).length > 0 && (
                              <div className="border border-amber-200 bg-amber-50 rounded-xl p-4">
                                <h5 className="text-xs font-black text-amber-800 mb-3 flex items-center gap-2">
                                  <Bell size={14}/> {systemUsers.filter(u => !u.aprobado).length} Solicitud(es) Pendiente(s) de Aprobación
                                </h5>
                                {systemUsers.filter(u => !u.aprobado).map(user => (
                                  <div key={user.id} className="bg-white rounded-xl p-4 border border-amber-200 mb-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
                                    <div className="space-y-1">
                                      <div className="flex items-center gap-2">
                                        <strong className="text-slate-800 text-sm">{user.nombre}</strong>
                                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase border ${user.rol === 'trabajador' ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-green-50 text-green-600 border-green-100'}`}>{user.rol}</span>
                                      </div>
                                      <p className="text-[11px] text-slate-500">{user.email} · {user.datos_registro?.cedula || user.datos_registro?.categoria}</p>
                                    </div>
                                    {approvingUserId === user.id ? (
                                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2 w-full md:w-72 text-xs">
                                        {user.rol === 'trabajador' ? (
                                          <div className="grid grid-cols-2 gap-2">
                                            <div><label className="text-[9px] font-bold text-slate-500 block">Sueldo ($)</label>
                                              <input type="number" value={approveSalary} onChange={e => setApproveSalary(e.target.value)} className="w-full bg-white border border-slate-200 rounded p-1.5 text-xs font-bold"/></div>
                                            <div><label className="text-[9px] font-bold text-slate-500 block">Antigüedad</label>
                                              <input type="number" value={approveAntiguedad} onChange={e => setApproveAntiguedad(e.target.value)} className="w-full bg-white border border-slate-200 rounded p-1.5 text-xs font-bold"/></div>
                                          </div>
                                        ) : (
                                          <div><label className="text-[9px] font-bold text-slate-500 block">Comisión (1-10%)</label>
                                            <input type="number" step="0.1" value={approveComision} onChange={e => setApproveComision(e.target.value)} className="w-full bg-white border border-slate-200 rounded p-1.5 text-xs font-bold"/></div>
                                        )}
                                        <div className="flex gap-2 justify-end">
                                          <button onClick={() => setApprovingUserId(null)} className="bg-slate-100 text-slate-600 px-3 py-1.5 rounded text-[10px] font-bold">Cancelar</button>
                                          <button onClick={() => handleApproveUser(user.id)} className="bg-emerald-600 text-white px-3.5 py-1.5 rounded text-[10px] font-bold shadow">Confirmar</button>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="flex gap-2">
                                        <button onClick={async () => { if (confirm(`¿Rechazar solicitud de ${user.nombre}?`)) { const { error } = await supabase.from('usuarios_credicrc').delete().eq('id', user.id); if (!error) { addNotification('success', 'Rechazado', `Solicitud de ${user.nombre} eliminada.`); fetchData(); } } }} className="border border-slate-200 hover:bg-red-50 hover:text-red-600 text-slate-500 px-4 py-2 rounded-xl text-xs font-bold transition">Rechazar</button>
                                        <button onClick={() => { setApprovingUserId(user.id); if (user.rol === 'trabajador') { setApproveSalary('350'); setApproveAntiguedad('3'); } else { setApproveComision('4.0'); } }} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs font-bold shadow transition flex items-center gap-1"><Check size={12}/>Aprobar</button>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Workers tab */}
                        {adminTab === 'workers' && (
                          <div className="space-y-4">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                              <div className="relative w-full md:w-64">
                                <input type="text" placeholder="Buscar por nombre o cédula..." value={adminSearchWorker} onChange={e => setAdminSearchWorker(e.target.value)}
                                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-[#64B5F6] font-bold"/>
                                <Search size={14} className="text-slate-400 absolute left-3 top-2.5"/>
                              </div>
                              <button onClick={() => setShowAddWorkerModal(true)} className="bg-[#002855] hover:bg-[#073B73] text-white text-xs font-bold py-2 px-4 rounded-xl shadow-sm transition flex items-center gap-1.5">
                                <Users size={14}/>Registrar Trabajador
                              </button>
                            </div>
                            {showAddWorkerModal && (
                              <div className="bg-slate-50 border border-[#64B5F6]/40 p-5 rounded-2xl animate-fade-in space-y-4 shadow-inner">
                                <div className="flex justify-between items-center border-b border-slate-200 pb-2.5">
                                  <h4 className="text-[#002855] font-black text-xs uppercase tracking-wider flex items-center gap-1.5"><Users size={14}/>Nuevo Trabajador</h4>
                                  <button onClick={() => setShowAddWorkerModal(false)}><X size={16} className="text-slate-400 hover:text-slate-600"/></button>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
                                  {[
                                    { label: 'NOMBRE COMPLETO', el: <input type="text" placeholder="Prof. Francisco Pinto" value={newWorkerNombre} onChange={e => setNewWorkerNombre(e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs font-bold"/> },
                                    { label: 'CÉDULA', el: <input type="text" placeholder="V-12.345.678" value={newWorkerCedula} onChange={e => setNewWorkerCedula(e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs font-mono font-bold"/> },
                                    { label: 'CARGO', el: <select value={newWorkerCargo} onChange={e => setNewWorkerCargo(e.target.value as CargoCRC)} className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs font-bold cursor-pointer">{STANDARD_CARGOS.map(c => <option key={c}>{c}</option>)}</select> },
                                    { label: 'SUELDO MENSUAL ($)', el: <input type="number" value={newWorkerSalario} onChange={e => setNewWorkerSalario(e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs font-mono font-bold"/> },
                                    { label: 'ANTIGÜEDAD (AÑOS)', el: <input type="number" value={newWorkerAntiguedad} onChange={e => setNewWorkerAntiguedad(e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs font-mono font-bold"/> },
                                  ].map(f => <div key={f.label as string}><label className="text-[10px] text-slate-500 block mb-1 font-bold">{f.label as string}</label>{f.el}</div>)}
                                </div>
                                <div className="flex justify-end gap-2 pt-2">
                                  <button onClick={() => setShowAddWorkerModal(false)} className="bg-white border border-slate-200 text-slate-600 text-xs font-bold py-2.5 px-4 rounded-xl hover:bg-slate-100 transition">Cancelar</button>
                                  <button disabled={isRegisteringWorker} onClick={handleRegisterWorker} className="bg-[#002855] text-white text-xs font-bold py-2.5 px-5 rounded-xl shadow transition flex items-center gap-1.5">
                                    {isRegisteringWorker ? <><RefreshCw size={14} className="animate-spin"/>Registrando...</> : <><Check size={14}/>Registrar en Nómina</>}
                                  </button>
                                </div>
                              </div>
                            )}
                            {selectedWorkerForEdit && (
                              <div className="bg-slate-50 border border-slate-200 p-5 rounded-2xl animate-fade-in space-y-4 shadow-inner">
                                <div className="flex justify-between items-center border-b border-slate-200 pb-2.5">
                                  <h4 className="text-[#002855] font-black text-xs uppercase tracking-wider flex items-center gap-1.5"><Sliders size={14} className="text-[#64B5F6]"/>Modificar: {selectedWorkerForEdit.nombre}</h4>
                                  <button onClick={() => setSelectedWorkerForEdit(null)}><X size={16} className="text-slate-400 hover:text-slate-600"/></button>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                  <div><label className="text-[10px] text-slate-500 block mb-1 font-bold">SALARIO MENSUAL ($)</label>
                                    <input type="number" value={editSalary} onChange={e => setEditSalary(e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs font-mono font-bold"/></div>
                                  <div><label className="text-[10px] text-slate-500 block mb-1 font-bold">LÍMITE PERSONALIZADO ($)</label>
                                    <input type="number" value={editLimitOverride} onChange={e => setEditLimitOverride(e.target.value)} placeholder="Vacío = 50% salario" className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs font-mono font-bold"/></div>
                                  <div className="flex items-end gap-2">
                                    <button onClick={handleSaveWorkerEdit} className="flex-1 bg-[#002855] text-white text-xs font-bold py-3 px-4 rounded-xl shadow transition hover:bg-[#073B73]">Guardar</button>
                                    <button onClick={() => setSelectedWorkerForEdit(null)} className="bg-white border border-slate-200 text-slate-600 text-xs font-bold py-3 px-4 rounded-xl hover:bg-slate-100 transition">Cancelar</button>
                                  </div>
                                </div>
                              </div>
                            )}
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs text-left text-slate-600">
                                <thead className="text-[10px] bg-slate-50 text-slate-500 uppercase tracking-wider border-b border-slate-200">
                                  <tr><th className="py-3 px-4">Nombre</th><th className="py-3 px-4">Cédula</th><th className="py-3 px-4">Cargo</th><th className="py-3 px-4 text-center">Nivel</th><th className="py-3 px-4 text-right">Salario</th><th className="py-3 px-4 text-right">Disponible</th><th className="py-3 px-4 text-center">Acciones</th></tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {workers.filter(w => w.nombre.toLowerCase().includes(adminSearchWorker.toLowerCase()) || w.cedula.toLowerCase().includes(adminSearchWorker.toLowerCase())).map(w => (
                                    <tr key={w.id} className="hover:bg-slate-50/50 transition">
                                      <td className="py-3 px-4 font-bold text-slate-800">{w.nombre} {w.qr_bloqueado && <Lock size={10} className="inline text-red-500 ml-1"/>}</td>
                                      <td className="py-3 px-4 font-mono font-bold text-slate-500">{w.cedula}</td>
                                      <td className="py-3 px-4 font-medium">{w.cargo}</td>
                                      <td className="py-3 px-4 text-center"><NivelBadge nivel={w.nivel_credito} small/></td>
                                      <td className="py-3 px-4 text-right font-mono font-bold">${w.salario_base.toFixed(2)}</td>
                                      <td className="py-3 px-4 text-right font-black text-green-600 font-mono">${w.limite_disponible.toFixed(2)}</td>
                                      <td className="py-3 px-4 text-center">
                                        <button onClick={() => { setSelectedWorkerForEdit(w); setEditSalary(w.salario_base.toString()); setEditLimitOverride(w.limite_personalizado?.toString() || ''); }} className="text-xs text-[#002855] hover:bg-slate-100 bg-slate-50 py-1.5 px-3.5 rounded-xl border border-slate-200 transition font-bold">Editar</button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                              <h5 className="text-xs font-bold text-slate-500 uppercase">Ajuste Masivo por Cargo</h5>
                              <div className="flex flex-wrap gap-3 items-end">
                                <div><label className="text-[9px] font-bold text-slate-500 block mb-1">CARGO</label>
                                  <select value={bulkCargo} onChange={e => setBulkCargo(e.target.value as CargoCRC)} className="bg-white border border-slate-200 rounded-xl p-2.5 text-xs font-bold cursor-pointer">{STANDARD_CARGOS.map(c => <option key={c}>{c}</option>)}</select></div>
                                <div><label className="text-[9px] font-bold text-slate-500 block mb-1">NUEVO SALARIO ($)</label>
                                  <input type="number" placeholder="Opcional" value={bulkSalary} onChange={e => setBulkSalary(e.target.value)} className="bg-white border border-slate-200 rounded-xl p-2.5 text-xs font-mono font-bold w-28"/></div>
                                <div><label className="text-[9px] font-bold text-slate-500 block mb-1">LÍMITE ($)</label>
                                  <input type="number" placeholder="Vacío=50%" value={bulkLimit} onChange={e => setBulkLimit(e.target.value)} className="bg-white border border-slate-200 rounded-xl p-2.5 text-xs font-mono font-bold w-28"/></div>
                                <button onClick={handleApplyBulkAdjust} disabled={isApplyingBulk} className="bg-[#002855] text-white text-xs font-bold py-2.5 px-4 rounded-xl shadow transition flex items-center gap-1.5">
                                  {isApplyingBulk ? <><RefreshCw size={12} className="animate-spin"/>Aplicando...</> : <><Users size={12}/>Aplicar Masivo</>}
                                </button>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Payroll tab */}
                        {adminTab === 'payroll' && (
                          <>
                          <div className="space-y-4">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                              <div>
                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Centro de Cobros de Nómina</h4>
                                <p className="text-xs text-slate-500 font-semibold mt-1">Selecciona una fecha para ver y procesar descuentos.</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <select value={payrollFilterDate} onChange={e => setPayrollFilterDate(e.target.value)} className="bg-slate-50 border border-slate-200 rounded-xl py-2 px-3.5 text-xs font-bold focus:outline-none">
                                  {Array.from(new Set(installments.map(i => i.fecha_cobro))).sort().map(d => (
                                    <option key={d} value={d}>Nómina: {new Date(d).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' })}</option>
                                  ))}
                                  {installments.length === 0 && <option value="">Sin cuotas</option>}
                                </select>
                                <button onClick={handleExportPayrollCSV} className="bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold py-2 px-4 rounded-xl border border-slate-200 flex items-center gap-1 transition">
                                  <Download size={14} className="text-[#64B5F6]"/>CSV
                                </button>
                              </div>
                            </div>
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs text-left text-slate-600">
                                <thead className="text-[10px] bg-slate-50 text-slate-500 uppercase tracking-wider border-b border-slate-200">
                                  <tr><th className="py-3 px-4">Trabajador</th><th className="py-3 px-4">Cédula</th><th className="py-3 px-4">Comercio Aliado</th><th className="py-3 px-4">Concepto</th><th className="py-3 px-4 text-right">Cuota ($)</th><th className="py-3 px-4 text-right">A Descontar (VES)</th><th className="py-3 px-4 text-center">Estatus</th></tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {installments.filter(i => i.fecha_cobro === payrollFilterDate).map(i => {
                                    const w = i.transacciones_credicrc?.trabajadores_crc;
                                    const p = i.transacciones_credicrc?.proveedores_aliados;
                                    const txDate = i.transacciones_credicrc?.fecha_transaccion
                                      ? new Date(i.transacciones_credicrc.fecha_transaccion).toLocaleDateString('es-VE', { day:'2-digit', month:'2-digit', year:'2-digit' })
                                      : '—';
                                    return (
                                      <tr key={i.id} className={`hover:bg-slate-50/50 transition ${i.estatus === 'Pagado Directo' || i.estatus === 'En Verificación' ? 'opacity-60' : ''}`}>
                                        <td className="py-3 px-4 font-bold text-slate-800">{w?.nombre ?? '—'}</td>
                                        <td className="py-3 px-4 font-mono font-bold text-slate-500">{w?.cedula ?? '—'}</td>
                                        <td className="py-3 px-4 font-semibold text-slate-700">{p?.nombre ?? '—'}</td>
                                        <td className="py-3 px-4 text-slate-500 text-[10px]">Compra {txDate} · {p?.categoria ?? '—'}</td>
                                        <td className="py-3 px-4 text-right font-mono font-bold">${i.monto_usd.toFixed(2)}</td>
                                        <td className="py-3 px-4 text-right font-black text-[#E53935] font-mono">Bs. {(i.monto_usd * bcvRate).toFixed(2)}</td>
                                        <td className="py-3 px-4 text-center">
                                          <span className={`px-2.5 py-1 rounded-full text-[9px] font-extrabold border ${i.estatus === 'Cobrado' ? 'bg-green-50 text-green-600 border-green-200' : i.estatus === 'Pagado Directo' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : i.estatus === 'En Verificación' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-blue-50 text-blue-600 border-blue-200'}`}>{i.estatus}</span>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                  {installments.filter(i => i.fecha_cobro === payrollFilterDate).length === 0 && (
                                    <tr><td colSpan={7} className="text-center py-8 text-slate-400 font-semibold">Sin cuotas para esta fecha.</td></tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                            {installments.filter(i => i.fecha_cobro === payrollFilterDate && i.estatus === 'Pendiente').length > 0 && (
                              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                                <div className="text-xs text-slate-500 font-bold">
                                  Total a descontar:{' '}
                                  <strong className="text-slate-800 font-mono text-sm">${installments.filter(i => i.fecha_cobro === payrollFilterDate && i.estatus === 'Pendiente').reduce((s, i) => s + i.monto_usd, 0).toFixed(2)}</strong>
                                  {' / '}
                                  <strong className="text-[#E53935] font-mono text-sm">Bs. {installments.filter(i => i.fecha_cobro === payrollFilterDate && i.estatus === 'Pendiente').reduce((s, i) => s + i.monto_usd * bcvRate, 0).toFixed(2)}</strong>
                                </div>
                                <button onClick={handleProcessPayrollDeductions} disabled={isProcessingPayroll}
                                  className="bg-[#002855] hover:bg-[#073B73] text-white text-xs font-bold py-2.5 px-5 rounded-xl shadow transition flex items-center justify-center gap-1.5">
                                  {isProcessingPayroll ? <><RefreshCw size={14} className="animate-spin"/>Procesando...</> : <><CheckCircle2 size={14}/>Aplicar Descuentos y Conciliar</>}
                                </button>
                              </div>
                            )}
                          </div>

                          <div className="mt-6 space-y-3">
                            <div className="flex items-center justify-between">
                              <div>
                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Resumen Financiero Mensual</h4>
                                <p className="text-[10px] text-slate-400 mt-0.5">{_now.toLocaleString('es-VE', { month: 'long', year: 'numeric' })} &middot; {monthlyTx.length} transacciones</p>
                              </div>
                              <span className="text-xs font-black text-[#002855] bg-blue-50 border border-blue-200 rounded-full px-3 py-1">Total: ${monthlyGrandTotal.toFixed(2)}</span>
                            </div>
                            {monthlySummaryRows.length === 0 ? (
                              <div className="border-2 border-dashed border-slate-200 rounded-xl py-8 text-center text-slate-400 text-xs font-semibold">Sin transacciones este mes.</div>
                            ) : (
                              <div className="overflow-x-auto rounded-xl border border-slate-200">
                                <table className="w-full text-xs text-left text-slate-600">
                                  <thead className="text-[10px] bg-slate-50 text-slate-500 uppercase tracking-wider border-b border-slate-200">
                                    <tr>
                                      <th className="py-3 px-4">Trabajador</th>
                                      <th className="py-3 px-4">Cédula</th>
                                      <th className="py-3 px-4 text-right">Total Comprado</th>
                                      <th className="py-3 px-4 text-right">Inicial Pagada</th>
                                      <th className="py-3 px-4 text-right">Pendiente Nómina</th>
                                      <th className="py-3 px-4">Comercios</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {monthlySummaryRows.map((r, idx) => (
                                      <tr key={idx} className="hover:bg-slate-50/50 transition">
                                        <td className="py-3 px-4 font-bold text-slate-800">{r.nombre}</td>
                                        <td className="py-3 px-4 font-mono text-slate-500">{r.cedula}</td>
                                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-800">${r.totalComprado.toFixed(2)}</td>
                                        <td className="py-3 px-4 text-right font-mono text-emerald-600 font-bold">${r.totalInicial.toFixed(2)}</td>
                                        <td className="py-3 px-4 text-right font-mono text-[#E53935] font-bold">${r.totalFinanciado.toFixed(2)}</td>
                                        <td className="py-3 px-4 text-slate-500 text-[10px] leading-relaxed">{r.proveedores.join(', ') || '—'}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                          </>
                        )}

                        {/* Direct Payments tab */}

                        {adminTab === 'direct-payments' && (
                          <div className="space-y-4">
                            <div>
                              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Panel de Conciliación — Pagos Directos</h4>
                              <p className="text-xs text-slate-500 font-semibold mt-1">Revisa los comprobantes subidos por los trabajadores y confirma el pago.</p>
                            </div>
                            {directPayments.length === 0 ? (
                              <div className="border-2 border-dashed border-slate-200 rounded-2xl py-12 flex flex-col items-center text-slate-400 gap-2">
                                <Upload size={32} className="stroke-1"/>
                                <p className="text-sm font-semibold">No hay pagos directos registrados aún.</p>
                              </div>
                            ) : (
                              <div className="space-y-4">
                                {directPayments.map(pago => (
                                  <div key={pago.id} className={`p-4 rounded-xl border bg-white flex flex-col md:flex-row md:items-center justify-between gap-4 ${pago.estatus === 'Pendiente' ? 'border-amber-200 shadow-sm' : pago.estatus === 'Verificado' ? 'border-green-200 opacity-70' : 'border-red-200 opacity-60'}`}>
                                    <div className="space-y-1.5">
                                      <div className="flex items-center gap-2">
                                        <strong className="text-slate-800 text-sm">{(pago as any).trabajadores_crc?.nombre || 'Trabajador'}</strong>
                                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold border ${pago.estatus === 'Pendiente' ? 'bg-amber-50 text-amber-700 border-amber-200' : pago.estatus === 'Verificado' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>{pago.estatus}</span>
                                      </div>
                                      <p className="text-xs text-slate-500 font-semibold">
                                        Ref: <strong>{pago.referencia_bancaria}</strong> · Monto: <strong className="text-[#002855] font-mono">${pago.monto_usd.toFixed(2)}</strong> · {new Date(pago.created_at).toLocaleDateString('es-VE')}
                                      </p>
                                      {((pago as any).tipo_operacion || (pago as any).banco_origen) && (
                                        <div className="text-[10px] bg-slate-50 border border-slate-100 p-2.5 rounded-lg text-slate-600 font-semibold space-y-0.5 mt-1 max-w-sm">
                                          <p><span className="text-slate-400 font-bold">Operación:</span> {(pago as any).tipo_operacion || 'Pago Móvil'}</p>
                                          <p><span className="text-slate-400 font-bold">Banco Origen:</span> {(pago as any).banco_origen || 'No indicado'}</p>
                                          <p><span className="text-slate-400 font-bold">Cédula Titular:</span> {(pago as any).cedula_titular || 'No indicada'}</p>
                                          {(pago as any).telefono_origen && (
                                            <p><span className="text-slate-400 font-bold">Teléfono Pago Móvil:</span> {(pago as any).telefono_origen}</p>
                                          )}
                                        </div>
                                      )}
                                      {pago.url_comprobante && (
                                        <a href={pago.url_comprobante} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] text-blue-600 font-bold hover:underline">
                                          <Eye size={10}/> Ver Comprobante
                                        </a>
                                      )}
                                      {!pago.url_comprobante && <span className="text-[10px] text-slate-400 font-semibold">Sin imagen de comprobante</span>}
                                    </div>
                                    {pago.estatus === 'Pendiente' && (
                                      <div className="flex gap-2">
                                        <button onClick={async () => { await supabase.from('pagos_directos_credicrc').update({ estatus: 'Rechazado' }).eq('id', pago.id); addNotification('warning', 'Pago Rechazado', 'El comprobante fue rechazado.'); fetchData(); }} className="border border-red-200 text-red-600 text-xs font-bold px-4 py-2 rounded-xl hover:bg-red-50 transition">Rechazar</button>
                                        <button onClick={() => handleConfirmDirectPayment(pago.id, pago.trabajador_id, pago.monto_usd, false)} disabled={processingDirectPayId === pago.id}
                                          className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-xl shadow transition flex items-center gap-1.5">
                                          {processingDirectPayId === pago.id ? <><RefreshCw size={12} className="animate-spin"/>Procesando...</> : <><CheckCircle2 size={12}/>Confirmar Pago</>}
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Gamification tab */}
                        {adminTab === 'gamification' && (
                          <div className="space-y-4">
                            <div>
                              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Sistema de Niveles de Crédito</h4>
                              <p className="text-xs text-slate-500 font-semibold mt-1">Gestiona los niveles y registra manualmente retrasos o pagos puntuales.</p>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                              {CREDIT_LEVELS.map(lvl => (
                                <div key={lvl.nivel} className={`${lvl.bg} p-4 rounded-xl border border-current/10`}>
                                  <div className="text-xl mb-1">{lvl.icon}</div>
                                  <h5 className={`font-black text-sm ${lvl.color}`}>{lvl.nombre}</h5>
                                  <p className="text-[10px] text-slate-500 mt-1">Inicial: {(lvl.porcentaje_inicial * 100).toFixed(0)}%</p>
                                  <p className="text-[10px] text-slate-500">Cupo: {(lvl.porcentaje_cupo * 100).toFixed(0)}%</p>
                                  <p className="text-[10px] text-slate-400">Req: {lvl.pagos_req} pagos</p>
                                </div>
                              ))}
                            </div>
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs text-left text-slate-600">
                                <thead className="text-[10px] bg-slate-50 text-slate-500 uppercase tracking-wider border-b border-slate-200">
                                  <tr><th className="py-3 px-4">Trabajador</th><th className="py-3 px-4">Cargo</th><th className="py-3 px-4 text-center">Nivel</th><th className="py-3 px-4 text-center">Pagos Puntuales</th><th className="py-3 px-4 text-center">Estado QR</th><th className="py-3 px-4 text-center">Acciones</th></tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {workers.map(w => (
                                    <tr key={w.id} className="hover:bg-slate-50/50 transition">
                                      <td className="py-3 px-4 font-bold text-slate-800">{w.nombre}</td>
                                      <td className="py-3 px-4">{w.cargo}</td>
                                      <td className="py-3 px-4 text-center"><NivelBadge nivel={w.nivel_credito} small/></td>
                                      <td className="py-3 px-4 text-center font-mono font-bold">{w.pagos_puntuales_consecutivos}</td>
                                      <td className="py-3 px-4 text-center">
                                        {w.qr_bloqueado ? (
                                          <span className="text-[9px] bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded-full font-extrabold flex items-center gap-1 justify-center"><Lock size={8}/>Bloqueado</span>
                                        ) : (
                                          <span className="text-[9px] bg-green-50 text-green-600 border border-green-200 px-2 py-0.5 rounded-full font-extrabold">Activo</span>
                                        )}
                                      </td>
                                      <td className="py-3 px-4 text-center">
                                        <div className="flex items-center justify-center gap-1.5">
                                          <button onClick={() => handleEvaluateLevel(w.id, 'PUNTUAL')} title="Registrar pago puntual" className="bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 text-[10px] font-bold px-2 py-1 rounded-lg flex items-center gap-0.5 transition">
                                            <ArrowUp size={10}/>Puntual
                                          </button>
                                          <button onClick={() => handleEvaluateLevel(w.id, 'RETRASO')} title="Registrar retraso" className="bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-[10px] font-bold px-2 py-1 rounded-lg flex items-center gap-0.5 transition">
                                            <ArrowDown size={10}/>Retraso
                                          </button>
                                          {w.qr_bloqueado && (
                                            <button onClick={() => handleUnblockQR(w.id)} className="bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-[10px] font-bold px-2 py-1 rounded-lg flex items-center gap-0.5 transition">
                                              <Zap size={10}/>Desbloquear
                                            </button>
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {/* Providers & Tesorería / Liquidación Proveedores tab */}
                        {(adminTab === 'providers' || adminTab === 'tesoreria') && (

                          <div className="space-y-4">
                            {/* Header */}
                            <div className="flex flex-wrap justify-between items-center gap-3">
                              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Gestión y Conciliación de Proveedores</h4>
                              <button onClick={() => { setShowAddProviderModal(true); setEditingProvider(null); }} className="bg-[#002855] text-white text-xs font-bold py-2 px-4 rounded-xl shadow-sm transition hover:bg-[#073B73] flex items-center gap-1.5">
                                <ShoppingBag size={14}/>Registrar Proveedor
                              </button>
                            </div>
                            {/* Sub-tabs */}
                            <div className="flex bg-slate-100 p-1 rounded-xl gap-1 w-fit">
                              {(['conciliacion','historial'] as const).map(id => (
                                <button key={id} onClick={() => setProviderAdminSubTab(id)}
                                  className={`text-[11px] font-bold px-4 py-2 rounded-lg transition ${providerAdminSubTab === id ? 'bg-white text-[#002855] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                                  {id === 'conciliacion' ? '📊 Conciliación' : '📋 Historial de Cortes'}
                                </button>
                              ))}
                            </div>
                            {/* ── Conciliacion sub-tab ── */}
                            {providerAdminSubTab === 'conciliacion' && (<>
                              {showAddProviderModal && (
                                <div className="bg-slate-50 border border-[#64B5F6]/40 p-5 rounded-2xl animate-fade-in space-y-4 shadow-inner">
                                  <div className="flex justify-between items-center border-b border-slate-200 pb-2.5">
                                    <h4 className="text-[#002855] font-black text-xs uppercase tracking-wider flex items-center gap-1.5"><ShoppingBag size={14}/>Nuevo Proveedor</h4>
                                    <button onClick={() => setShowAddProviderModal(false)}><X size={16} className="text-slate-400 hover:text-slate-600"/></button>
                                  </div>
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    <div><label className="text-[10px] font-bold text-slate-500 block mb-1">NOMBRE</label><input type="text" value={newProviderNombre} onChange={e => setNewProviderNombre(e.target.value)} placeholder="Ej: Carnicería X" className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs font-bold"/></div>
                                    <div><label className="text-[10px] font-bold text-slate-500 block mb-1">CATEGORÍA</label><select value={newProviderCategoria} onChange={e => setNewProviderCategoria(e.target.value as 'Carnes' | 'Víveres')} className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs font-bold cursor-pointer"><option>Carnes</option><option>Víveres</option></select></div>
                                    <div><label className="text-[10px] font-bold text-slate-500 block mb-1">CUENTA BANCARIA</label><input type="text" value={newProviderCuenta} onChange={e => setNewProviderCuenta(e.target.value)} placeholder="Banco: 0102-..." className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs font-bold"/></div>
                                    <div><label className="text-[10px] font-bold text-slate-500 block mb-1">COMISIÓN (%)</label><input type="number" step="0.1" value={newProviderComision} onChange={e => setNewProviderComision(e.target.value)} min="1" max="10" className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs font-mono font-bold"/></div>
                                  </div>
                                  <div className="flex justify-end gap-2">
                                    <button onClick={() => setShowAddProviderModal(false)} className="bg-white border border-slate-200 text-slate-600 text-xs font-bold py-2.5 px-4 rounded-xl hover:bg-slate-100 transition">Cancelar</button>
                                    <button disabled={isRegisteringProvider} onClick={handleRegisterProvider} className="bg-[#002855] text-white text-xs font-bold py-2.5 px-5 rounded-xl shadow transition flex items-center gap-1.5">
                                      {isRegisteringProvider ? <><RefreshCw size={14} className="animate-spin"/>Registrando...</> : <><Check size={14}/>Afiliar Comercio</>}
                                    </button>
                                  </div>
                                </div>
                              )}
                              {editingProvider && (
                                <div className="bg-blue-50 border border-blue-200 p-5 rounded-2xl animate-fade-in space-y-4 shadow-sm">
                                  <div className="flex justify-between items-center border-b border-blue-200 pb-2.5">
                                    <h4 className="text-[#002855] font-black text-xs uppercase tracking-wider flex items-center gap-1.5"><Sliders size={14}/>Editar: {editingProvider.nombre}</h4>
                                    <button onClick={() => setEditingProvider(null)}><X size={16} className="text-slate-400 hover:text-slate-600"/></button>
                                  </div>
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    <div><label className="text-[10px] font-bold text-slate-500 block mb-1">NOMBRE</label><input type="text" value={editProviderNombre} onChange={e => setEditProviderNombre(e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs font-bold"/></div>
                                    <div><label className="text-[10px] font-bold text-slate-500 block mb-1">CATEGORÍA</label><select value={editProviderCategoria} onChange={e => setEditProviderCategoria(e.target.value as 'Carnes' | 'Víveres')} className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs font-bold cursor-pointer"><option>Carnes</option><option>Víveres</option></select></div>
                                    <div><label className="text-[10px] font-bold text-slate-500 block mb-1">CUENTA BANCARIA</label><input type="text" value={editProviderCuenta} onChange={e => setEditProviderCuenta(e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs font-bold"/></div>
                                    <div><label className="text-[10px] font-bold text-slate-500 block mb-1">COMISIÓN (%)</label><input type="number" step="0.1" value={editProviderComision} onChange={e => setEditProviderComision(e.target.value)} min="1" max="10" className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs font-mono font-bold"/></div>
                                  </div>
                                  <div className="flex justify-end gap-2">
                                    <button onClick={() => setEditingProvider(null)} className="bg-white border border-slate-200 text-slate-600 text-xs font-bold py-2.5 px-4 rounded-xl hover:bg-slate-100 transition">Cancelar</button>
                                    <button disabled={isSavingProvider} onClick={handleUpdateProvider} className="bg-[#002855] text-white text-xs font-bold py-2.5 px-5 rounded-xl shadow transition flex items-center gap-1.5">
                                      {isSavingProvider ? <><RefreshCw size={14} className="animate-spin"/>Guardando...</> : <><Check size={14}/>Guardar Cambios</>}
                                    </button>
                                  </div>
                                </div>
                              )}
                              {/* Tarjetas financieras por proveedor */}
                              <div className="space-y-4">
                                {supplierReconciliation.length === 0 && <div className="text-center py-10 text-slate-400 text-sm">No hay proveedores registrados.</div>}
                                {supplierReconciliation.map(p => {
                                  const commPct = (parseFloat(p.comision_colegio as string) * 100).toFixed(1);
                                  return (
                                    <div key={p.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                                      <div className="bg-gradient-to-r from-[#002855] to-[#073B73] px-5 py-3.5 flex flex-wrap items-center justify-between gap-2">
                                        <div className="flex items-center gap-3">
                                          <div className="w-8 h-8 bg-white/10 rounded-xl flex items-center justify-center"><ShoppingBag size={15} className="text-white/80"/></div>
                                          <div>
                                            <p className="text-white font-black text-sm">{p.nombre}</p>
                                            <p className="text-blue-200 text-[10px]">{p.categoria} · Comisión: {commPct}%</p>
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <span className="text-[10px] text-blue-200 font-mono bg-white/10 px-2.5 py-1 rounded-lg">Total ventas: <span className="text-white font-bold">${p.totalVendido.toFixed(2)}</span></span>
                                          <button title="Editar" onClick={() => { setEditingProvider(p); setEditProviderNombre(p.nombre); setEditProviderCategoria(p.categoria); setEditProviderCuenta(p.cuenta_enlace); setEditProviderComision((parseFloat(p.comision_colegio as string)*100).toString()); setShowAddProviderModal(false); }} className="p-1.5 text-blue-200 hover:text-white rounded-lg hover:bg-white/10 transition"><Sliders size={13}/></button>
                                          <button title="Eliminar" disabled={isDeletingProviderId === p.id} onClick={() => handleDeleteProvider(p.id)} className="p-1.5 text-red-300 hover:text-red-200 rounded-lg hover:bg-white/10 transition disabled:opacity-40">{isDeletingProviderId === p.id ? <RefreshCw size={13} className="animate-spin"/> : <X size={13}/>}</button>
                                        </div>
                                      </div>
                                      <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-100">
                                        {/* BLOQUE A */}
                                        <div className="p-5 space-y-3">
                                          <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 bg-blue-500 rounded-full ring-2 ring-blue-100"/>
                                            <span className="text-[9px] font-black text-blue-600 uppercase tracking-widest">Bloque A — Colegio → Proveedor</span>
                                          </div>
                                          <p className="text-[10px] text-slate-400">Ventas pendientes de transferir al proveedor (monto bruto completo)</p>
                                          <div className="bg-blue-50 rounded-xl p-3 space-y-1.5">
                                            <div className="flex justify-between text-xs"><span className="text-slate-500">Transacciones pendientes</span><span className="font-bold">{p.txPendientesLiqCount}</span></div>
                                            <div className="flex justify-between items-end"><span className="text-[10px] text-slate-500">Monto a transferir</span><span className={`font-black text-xl font-mono ${p.montoPendienteProveedor > 0 ? 'text-blue-700' : 'text-slate-300'}`}>${p.montoPendienteProveedor.toFixed(2)}</span></div>
                                          </div>
                                          <button disabled={p.montoPendienteProveedor === 0 || isProcessingLiquidacion} onClick={() => { setShowLiquidarModal(p.id); setRefLiquidacion(''); }}
                                            className="w-full bg-blue-600 text-white text-[11px] font-bold py-2.5 rounded-xl hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                                            💸 Liquidar y Cerrar Ciclo de Ventas
                                          </button>
                                          {p.montoPendienteProveedor === 0 && <p className="text-[9px] text-center text-green-600 font-bold">✅ Sin ventas pendientes</p>}
                                        </div>
                                        {/* BLOQUE B */}
                                        <div className="p-5 space-y-3">
                                          <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 bg-amber-500 rounded-full ring-2 ring-amber-100"/>
                                            <span className="text-[9px] font-black text-amber-600 uppercase tracking-widest">Bloque B — Proveedor → Colegio</span>
                                          </div>
                                          <p className="text-[10px] text-slate-400">Comisión acumulada a cobrar al proveedor — independiente del Bloque A</p>
                                          <div className="bg-amber-50 rounded-xl p-3 space-y-1.5">
                                            <div className="flex justify-between text-xs"><span className="text-slate-500">Tasa de comisión</span><span className="font-bold">{commPct}%</span></div>
                                            <div className="flex justify-between items-end"><span className="text-[10px] text-slate-500">Comisión pendiente</span><span className={`font-black text-xl font-mono ${p.comisionPendienteColegio > 0 ? 'text-amber-600' : 'text-slate-300'}`}>${p.comisionPendienteColegio.toFixed(2)}</span></div>
                                          </div>
                                          <button disabled={p.comisionPendienteColegio === 0 || isProcessingComision} onClick={() => { setShowComisionModal(p.id); setRefComision(''); }}
                                            className="w-full bg-amber-500 text-white text-[11px] font-bold py-2.5 rounded-xl hover:bg-amber-600 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                                            🏦 Registrar Cobro de Comisión
                                          </button>
                                          {p.comisionPendienteColegio === 0 && <p className="text-[9px] text-center text-green-600 font-bold">✅ Sin comisiones pendientes</p>}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </>)}
                            {/* ── Historial sub-tab ── */}
                            {providerAdminSubTab === 'historial' && (
                              <div className="space-y-3">
                                <p className="text-[10px] text-slate-400 font-semibold">Registro inmutable de liquidaciones y cobros de comisión. Los montos originales de ventas no se alteran jamás.</p>
                                {liquidaciones.length === 0 ? (
                                  <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-300">
                                    <p className="text-slate-400 text-sm font-semibold">Sin cortes registrados aún</p>
                                    <p className="text-slate-300 text-xs mt-1">Los cortes aparecerán aquí al liquidar ventas o cobrar comisiones.</p>
                                  </div>
                                ) : (
                                  <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-sm">
                                    <table className="w-full text-xs text-left text-slate-600">
                                      <thead className="text-[10px] bg-slate-50 text-slate-500 uppercase tracking-wider border-b border-slate-200">
                                        <tr>
                                          <th className="py-3 px-4">Proveedor</th>
                                          <th className="py-3 px-4">Tipo</th>
                                          <th className="py-3 px-4 text-right">Monto Liquidado</th>
                                          <th className="py-3 px-4 text-right text-amber-600">Comisión en Corte</th>
                                          <th className="py-3 px-4">Referencia</th>
                                          <th className="py-3 px-4">Fecha</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100">
                                        {liquidaciones.map(liq => (
                                          <tr key={liq.id} className="hover:bg-slate-50/50 transition">
                                            <td className="py-3 px-4 font-bold text-slate-800">{liq.proveedores_aliados?.nombre ?? '—'}</td>
                                            <td className="py-3 px-4">{liq.tipo === 'liquidacion_ventas' ? <span className="bg-blue-100 text-blue-700 text-[9px] font-black px-2 py-0.5 rounded-full">💸 Liquidación Ventas</span> : <span className="bg-amber-100 text-amber-700 text-[9px] font-black px-2 py-0.5 rounded-full">🏦 Cobro Comisión</span>}</td>
                                            <td className="py-3 px-4 text-right font-mono font-bold text-blue-700">${parseFloat(liq.monto_liquidado as any).toFixed(2)}</td>
                                            <td className="py-3 px-4 text-right font-mono text-amber-600">${parseFloat(liq.monto_comision_corte as any).toFixed(2)}</td>
                                            <td className="py-3 px-4 font-mono text-[10px] text-slate-500 max-w-[140px] truncate" title={liq.referencia_pago}>{liq.referencia_pago}</td>
                                            <td className="py-3 px-4 text-slate-500 whitespace-nowrap">{new Date(liq.fecha_corte).toLocaleString('es-VE',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            )}
                            {/* Modal: Liquidar Ciclo */}
                            {showLiquidarModal && (() => { const prov = supplierReconciliation.find(p => p.id === showLiquidarModal); if (!prov) return null; return (
                              <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
                                  <div className="bg-gradient-to-r from-blue-600 to-blue-800 p-5 rounded-t-2xl">
                                    <h3 className="text-white font-black text-base">💸 Liquidar Ciclo de Ventas</h3>
                                    <p className="text-blue-200 text-xs mt-1">Proveedor: <span className="font-bold text-white">{prov.nombre}</span></p>
                                  </div>
                                  <div className="p-5 space-y-4">
                                    <div className="bg-blue-50 rounded-xl p-4 space-y-2 text-xs">
                                      <div className="flex justify-between"><span className="text-slate-500">Transacciones a cerrar</span><span className="font-bold">{prov.txPendientesLiqCount}</span></div>
                                      <div className="flex justify-between"><span className="text-slate-500">Monto bruto a transferir</span><span className="font-black text-blue-700 text-base">${prov.montoPendienteProveedor.toFixed(2)}</span></div>
                                      <p className="text-[10px] text-slate-400 border-t border-blue-100 pt-2">El colegio transfiere el monto bruto completo. La comisión se gestiona por el Bloque B de forma independiente.</p>
                                    </div>
                                    <div>
                                      <label className="text-[10px] font-black text-slate-600 uppercase tracking-wider block mb-1.5">Referencia de Transferencia Enviada *</label>
                                      <input type="text" value={refLiquidacion} onChange={e => setRefLiquidacion(e.target.value)} placeholder="Ej: REF-20240722-BBVA" className="w-full border border-slate-200 rounded-xl p-3 text-xs font-mono focus:ring-2 focus:ring-blue-300 outline-none"/>
                                    </div>
                                    <div className="flex gap-2">
                                      <button onClick={() => setShowLiquidarModal(null)} className="flex-1 bg-slate-100 text-slate-700 text-xs font-bold py-3 rounded-xl hover:bg-slate-200 transition">Cancelar</button>
                                      <button disabled={isProcessingLiquidacion || !refLiquidacion.trim()} onClick={handleLiquidarCiclo} className="flex-1 bg-blue-600 text-white text-xs font-bold py-3 rounded-xl hover:bg-blue-700 transition disabled:opacity-50 flex items-center justify-center gap-2">
                                        {isProcessingLiquidacion ? <><RefreshCw size={14} className="animate-spin"/>Procesando...</> : '✅ Confirmar Liquidación'}
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ); })()}
                            {/* Modal: Cobrar Comisión */}
                            {showComisionModal && (() => { const prov = supplierReconciliation.find(p => p.id === showComisionModal); if (!prov) return null; return (
                              <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
                                  <div className="bg-gradient-to-r from-amber-500 to-amber-700 p-5 rounded-t-2xl">
                                    <h3 className="text-white font-black text-base">🏦 Registrar Cobro de Comisión</h3>
                                    <p className="text-amber-100 text-xs mt-1">Proveedor: <span className="font-bold text-white">{prov.nombre}</span></p>
                                  </div>
                                  <div className="p-5 space-y-4">
                                    <div className="bg-amber-50 rounded-xl p-4 space-y-2 text-xs">
                                      <div className="flex justify-between"><span className="text-slate-500">Tasa de comisión</span><span className="font-bold">{(parseFloat(prov.comision_colegio as string)*100).toFixed(1)}%</span></div>
                                      <div className="flex justify-between"><span className="text-slate-500">Comisión a registrar como cobrada</span><span className="font-black text-amber-600 text-base">${prov.comisionPendienteColegio.toFixed(2)}</span></div>
                                      <p className="text-[10px] text-slate-400 border-t border-amber-100 pt-2">Esta acción registra que el proveedor ya transfirió su comisión al colegio. No afecta el Bloque A de ventas.</p>
                                    </div>
                                    <div>
                                      <label className="text-[10px] font-black text-slate-600 uppercase tracking-wider block mb-1.5">Referencia de Transferencia Recibida *</label>
                                      <input type="text" value={refComision} onChange={e => setRefComision(e.target.value)} placeholder="Ej: REF-COM-20240722" className="w-full border border-slate-200 rounded-xl p-3 text-xs font-mono focus:ring-2 focus:ring-amber-300 outline-none"/>
                                    </div>
                                    <div className="flex gap-2">
                                      <button onClick={() => setShowComisionModal(null)} className="flex-1 bg-slate-100 text-slate-700 text-xs font-bold py-3 rounded-xl hover:bg-slate-200 transition">Cancelar</button>
                                      <button disabled={isProcessingComision || !refComision.trim()} onClick={handleCobrarComision} className="flex-1 bg-amber-500 text-white text-xs font-bold py-3 rounded-xl hover:bg-amber-600 transition disabled:opacity-50 flex items-center justify-center gap-2">
                                        {isProcessingComision ? <><RefreshCw size={14} className="animate-spin"/>Procesando...</> : '✅ Confirmar Cobro'}
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ); })()}
                          </div>
                        )}

                        {/* Notificaciones tab */}

                        {adminTab === 'notificaciones' && (
                          <div className="space-y-6 max-w-xl mx-auto bg-slate-50 border border-slate-200 p-6 rounded-2xl animate-fade-in shadow-inner text-left">
                            {/* Selector de Sub-Pestaña */}
                            <div className="flex bg-slate-200/50 p-1.5 rounded-xl gap-1.5">
                              <button 
                                type="button"
                                onClick={() => setEmailNotificationSubTab('push')}
                                className={`flex-1 py-2 px-3 text-xs font-black rounded-lg transition flex items-center justify-center gap-1.5 ${emailNotificationSubTab === 'push' ? 'bg-[#002855] text-white shadow-sm' : 'text-slate-600 hover:text-slate-800 hover:bg-slate-200/30'}`}
                              >
                                <Bell size={13}/> Notificaciones Push
                              </button>
                              <button 
                                type="button"
                                onClick={() => setEmailNotificationSubTab('email')}
                                className={`flex-1 py-2 px-3 text-xs font-black rounded-lg transition flex items-center justify-center gap-1.5 ${emailNotificationSubTab === 'email' ? 'bg-[#002855] text-white shadow-sm' : 'text-slate-600 hover:text-slate-800 hover:bg-slate-200/30'}`}
                              >
                                <Users size={13}/> Correos Masivos
                              </button>
                            </div>

                            {emailNotificationSubTab === 'push' ? (
                              <div className="space-y-4 animate-fade-in">
                                <div>
                                  <h4 className="text-xs font-bold text-[#002855] uppercase tracking-widest flex items-center gap-2">
                                    <Bell size={16} className="text-[#E53935]"/> Difusión de Notificaciones Push Nativas
                                  </h4>
                                  <p className="text-xs text-slate-500 font-semibold mt-1">
                                    Envía alertas masivas en tiempo real a los navegadores y dispositivos móviles registrados.
                                  </p>
                                </div>

                                <form onSubmit={handleSendPushNotifications} className="space-y-4">
                                  <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase block">Audiencia / Destinatarios</label>
                                    <select 
                                      value={pushAudience} 
                                      onChange={e => setPushAudience(e.target.value as any)}
                                      className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs font-bold cursor-pointer focus:outline-none focus:border-[#002855]"
                                    >
                                      <option value="todos">Todos los usuarios suscritos</option>
                                      <option value="profesores">Solo Personal / Profesores</option>
                                      <option value="proveedores">Solo Comercios / Proveedores</option>
                                    </select>
                                  </div>

                                  <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase block">Título de la Alerta</label>
                                    <input 
                                      type="text" 
                                      value={pushTitle} 
                                      onChange={e => setPushTitle(e.target.value)} 
                                      placeholder="Ej: ¡Nueva Promoción de Fin de Semana!"
                                      className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs font-bold focus:outline-none focus:border-[#002855]"
                                      required
                                    />
                                  </div>

                                  <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase block">Mensaje / Cuerpo de la Notificación</label>
                                    <textarea 
                                      rows={3} 
                                      value={pushBody} 
                                      onChange={e => setPushBody(e.target.value)} 
                                      placeholder="Ej: Aprovecha un 10% de descuento en el combo de carne pagando hoy con CrediCRC."
                                      className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs font-semibold focus:outline-none focus:border-[#002855]"
                                      required
                                    />
                                  </div>

                                  <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase block">Ruta de Redirección (URL interna)</label>
                                    <input 
                                      type="text" 
                                      value={pushRedirect} 
                                      onChange={e => setPushRedirect(e.target.value)} 
                                      placeholder="Ej: / (Inicio) o /admin/payroll"
                                      className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs font-bold focus:outline-none focus:border-[#002855]"
                                    />
                                  </div>

                                  {pushStatus && (
                                    <div className="bg-blue-50 border border-blue-200 p-3.5 rounded-xl flex items-center gap-2 text-blue-700 text-xs font-semibold">
                                      <RefreshCw size={14} className="animate-spin"/>
                                      <span>{pushStatus}</span>
                                    </div>
                                  )}

                                  <div className="flex justify-end pt-2">
                                    <button 
                                      type="submit" 
                                      disabled={isSendingPush}
                                      className="w-full sm:w-auto bg-[#002855] hover:bg-[#073B73] disabled:opacity-50 text-white text-xs font-black py-3 px-6 rounded-xl shadow-sm transition flex items-center justify-center gap-2 uppercase tracking-wider"
                                    >
                                      {isSendingPush ? (
                                        <><RefreshCw size={14} className="animate-spin"/> Lanzando Notificaciones...</>
                                      ) : (
                                        <><Bell size={14}/> Lanzar Notificación Masiva</>
                                      )}
                                    </button>
                                  </div>
                                </form>
                              </div>
                            ) : (
                              <div className="space-y-4 animate-fade-in">
                                <div>
                                  <h4 className="text-xs font-bold text-[#002855] uppercase tracking-widest flex items-center gap-2">
                                    <Users size={16} className="text-[#E53935]"/> Difusión de Correos Masivos
                                  </h4>
                                  <p className="text-xs text-slate-500 font-semibold mt-1">
                                    Envía comunicados oficiales directamente a la bandeja de entrada de los usuarios.
                                  </p>
                                </div>

                                <form onSubmit={handleSendBulkEmails} className="space-y-4">
                                  <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase block">Audiencia / Destinatarios</label>
                                    <select 
                                      value={emailAudience} 
                                      onChange={e => setEmailAudience(e.target.value as any)}
                                      className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs font-bold cursor-pointer focus:outline-none focus:border-[#002855]"
                                    >
                                      <option value="todos">Todos los usuarios (Trabajadores y Proveedores)</option>
                                      <option value="profesores">Solo Personal / Profesores</option>
                                      <option value="proveedores">Solo Comercios / Proveedores</option>
                                    </select>
                                  </div>

                                  <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase block">Asunto del Correo</label>
                                    <input 
                                      type="text" 
                                      value={emailSubject} 
                                      onChange={e => setEmailSubject(e.target.value)} 
                                      placeholder="Ej: Comunicado sobre el inicio del periodo escolar"
                                      className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs font-bold focus:outline-none focus:border-[#002855]"
                                      required
                                    />
                                  </div>

                                  <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase block">Título del Mensaje (Encabezado)</label>
                                    <input 
                                      type="text" 
                                      value={emailTitle} 
                                      onChange={e => setEmailTitle(e.target.value)} 
                                      placeholder="Ej: Inicio de Actividades y Novedades del Sistema"
                                      className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs font-bold focus:outline-none focus:border-[#002855]"
                                      required
                                    />
                                  </div>

                                  <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase block">Cuerpo del Comunicado</label>
                                    <textarea 
                                      rows={6} 
                                      value={emailBody} 
                                      onChange={e => setEmailBody(e.target.value)} 
                                      placeholder="Ej: Estimada comunidad, les escribimos para notificarles que...&#10;&#10;Pueden separar párrafos con doble salto de línea para una mejor legibilidad."
                                      className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs font-semibold focus:outline-none focus:border-[#002855]"
                                      required
                                    />
                                  </div>

                                  {emailStatus && (
                                    <div className="bg-blue-50 border border-blue-200 p-3.5 rounded-xl flex items-center gap-2 text-blue-700 text-xs font-semibold">
                                      <RefreshCw size={14} className="animate-spin"/>
                                      <span>{emailStatus}</span>
                                    </div>
                                  )}

                                  <div className="flex justify-end pt-2">
                                    <button 
                                      type="submit" 
                                      disabled={isSendingEmail}
                                      className="w-full sm:w-auto bg-[#002855] hover:bg-[#073B73] disabled:opacity-50 text-white text-xs font-black py-3 px-6 rounded-xl shadow-sm transition flex items-center justify-center gap-2 uppercase tracking-wider"
                                    >
                                      {isSendingEmail ? (
                                        <><RefreshCw size={14} className="animate-spin"/> Despachando Lotes...</>
                                      ) : (
                                        <><Users size={14}/> Despachar Correos</>
                                      )}
                                    </button>
                                  </div>
                                </form>
                              </div>
                            )}
                          </div>
                        )}


                      </div>
                    </div>

                    {/* Editor landing */}
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm text-left">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 border-b border-slate-100 pb-3">
                        <div><h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Editor de Página de Inicio</h4><p className="text-xs text-slate-500 font-semibold mt-0.5">Modifica textos sin tocar código.</p></div>
                        <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[10px] font-bold text-slate-600">
                          <button onClick={() => setEditorTab('hero')} className={`px-3 py-1 rounded-md transition ${editorTab === 'hero' ? 'bg-[#002855] text-white shadow-sm' : 'text-slate-600 hover:text-[#002855]'}`}>Héroe & Portales</button>
                          <button onClick={() => setEditorTab('politicas')} className={`px-3 py-1 rounded-md transition ${editorTab === 'politicas' ? 'bg-[#002855] text-white shadow-sm' : 'text-slate-600 hover:text-[#002855]'}`}>Políticas & Footer</button>
                          <button onClick={() => setEditorTab('banco')} className={`px-3 py-1 rounded-md transition ${editorTab === 'banco' ? 'bg-[#002855] text-white shadow-sm' : 'text-slate-600 hover:text-[#002855]'}`}>Cuenta del Colegio</button>
                        </div>
                      </div>
                      {editorTab === 'hero' && (
                        <div className="space-y-4">
                          {[{ label: 'Título Principal', key: 'hero_title', type: 'input' }, { label: 'Descripción Hero', key: 'hero_description', type: 'textarea' }].map(f => (
                            <div key={f.key} className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase block">{f.label}</label>
                              {f.type === 'input' ? <input type="text" value={(landingConfig as any)[f.key]} onChange={e => setLandingConfig({ ...landingConfig, [f.key]: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-none focus:border-[#002855] transition font-bold"/> : <textarea rows={2} value={(landingConfig as any)[f.key]} onChange={e => setLandingConfig({ ...landingConfig, [f.key]: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-none focus:border-[#002855] transition font-semibold"/>}
                            </div>
                          ))}
                        </div>
                      )}
                      {editorTab === 'politicas' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {[
                            { title: 'Políticas de Financiamiento', t: 'politicas_financiamiento_title', d: 'politicas_financiamiento_description' },
                            { title: 'Estabilidad & Seguridad', t: 'estabilidad_seguridad_title', d: 'estabilidad_seguridad_description' },
                          ].map(s => (
                            <div key={s.t} className="space-y-3">
                              <span className="text-[10px] font-extrabold text-[#002855] uppercase tracking-wider">{s.title}</span>
                              <div className="space-y-1"><label className="text-[9px] font-bold text-slate-400 uppercase block">Título</label><input type="text" value={(landingConfig as any)[s.t]} onChange={e => setLandingConfig({ ...landingConfig, [s.t]: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs font-bold"/></div>
                              <div className="space-y-1"><label className="text-[9px] font-bold text-slate-400 uppercase block">Descripción</label><textarea rows={4} value={(landingConfig as any)[s.d]} onChange={e => setLandingConfig({ ...landingConfig, [s.d]: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs font-semibold"/></div>
                            </div>
                          ))}
                        </div>
                      )}
                      {editorTab === 'banco' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {[
                            { label: 'Nombre del Beneficiario / Institución', key: 'colegio_nombre' },
                            { label: 'Banco de Destino', key: 'colegio_banco' },
                            { label: 'Número de Cuenta (20 dígitos)', key: 'colegio_cuenta' },
                            { label: 'RIF del Colegio', key: 'colegio_rif' },
                          ].map(f => (
                            <div key={f.key} className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase block">{f.label}</label>
                              <input 
                                type="text" 
                                value={(landingConfig as any)[f.key] || ''} 
                                onChange={e => setLandingConfig({ ...landingConfig, [f.key]: e.target.value })} 
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-none focus:border-[#002855] transition font-bold"
                              />
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="flex justify-end border-t border-slate-100 pt-4 mt-4">
                        <button onClick={handleSaveLandingConfig} disabled={isSavingConfig} className="bg-[#002855] hover:bg-[#073B73] text-white text-xs font-bold py-2.5 px-6 rounded-xl shadow transition flex items-center gap-1.5 disabled:opacity-50">
                          {isSavingConfig ? <><RefreshCw size={14} className="animate-spin"/>Guardando...</> : <><Check size={14}/>Guardar Cambios</>}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : <AuthCard role="admin" {...authCardProps}/>
              )}
            </div>

            {/* ── BARRA LATERAL: NOTIFICACIONES ── */}
            <div className="col-span-1 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between max-h-[85vh] overflow-hidden">
              <div className="flex flex-col h-full overflow-hidden">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                  <div className="flex items-center gap-1.5"><Bell className="text-[#64B5F6] h-4 w-4"/><h4 className="text-xs font-bold text-slate-700 uppercase tracking-widest">Actividad</h4></div>
                  <span className="bg-slate-100 text-slate-600 text-[10px] py-0.5 px-2.5 rounded-full font-bold">{notifications.length}</span>
                </div>
                <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-left">
                  {notifications.map(n => (
                    <div key={n.id} className={`p-3.5 rounded-xl border text-xs space-y-1.5 transition duration-300 animate-fade-in ${n.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' : n.type === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-800' : n.type === 'error' ? 'bg-red-50 border-red-200 text-red-800' : 'bg-slate-50 border-slate-200 text-slate-700'}`}>
                      <div className="flex justify-between items-center font-bold">
                        <span className="text-[10px] uppercase tracking-wide">{n.title}</span>
                        <span className="text-[9px] text-slate-400">{n.timestamp.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                      </div>
                      <p className="text-[10px] text-slate-600 leading-relaxed font-medium">{n.message}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-slate-100 text-center text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                <p>CrediCRC v2.0 · Fintech Escolar</p>
                <p className="mt-1 text-[8px] text-slate-300">Colegio Rafael Castillo · Duaca, Lara</p>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
