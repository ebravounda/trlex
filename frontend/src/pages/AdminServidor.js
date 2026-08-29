import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Monitor, ChevronDown, ChevronUp, ExternalLink, Copy, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

const STEPS_WINDOWS = [
  {
    title: "Abre Google Chrome",
    desc: "Si no lo tienes, descargalo desde google.com/chrome e instalalo."
  },
  {
    title: "Inicia sesion en Chrome con la cuenta de Tramilex",
    desc: "Haz clic en el icono de perfil (esquina superior derecha de Chrome) y selecciona 'Agregar cuenta'. Usa estas credenciales:",
    credentials: true
  },
  {
    title: "Accede a Chrome Remote Desktop",
    desc: "Abre esta direccion en Chrome:",
    link: "https://remotedesktop.google.com/access"
  },
  {
    title: "Instala la extension de Chrome Remote Desktop",
    desc: "Si te pide instalar una extension, haz clic en 'Agregar a Chrome' y luego en 'Agregar extension'. Si ya aparece el equipo listado, salta al paso 5."
  },
  {
    title: "Conectate al servidor",
    desc: "Veras un equipo listado con el nombre del servidor. Haz clic sobre el para conectarte."
  },
  {
    title: "Ingresa el PIN de acceso",
    desc: "Te pedira un PIN de 6 digitos. Escribelo y haz clic en 'Conectar':",
    pin: "258000"
  },
  {
    title: "Listo!",
    desc: "Ya estas conectado al escritorio remoto. Puedes trabajar como si estuvieras frente al equipo. Para desconectarte, cierra la pestana o haz clic en 'Desconectar'."
  }
];

const STEPS_MAC = [
  {
    title: "Abre Google Chrome",
    desc: "Si no lo tienes, descargalo desde google.com/chrome. Arrastra Chrome a la carpeta Aplicaciones e instalalo."
  },
  {
    title: "Inicia sesion en Chrome con la cuenta de Tramilex",
    desc: "Haz clic en el icono de perfil (esquina superior derecha de Chrome) y selecciona 'Agregar cuenta'. Usa estas credenciales:",
    credentials: true
  },
  {
    title: "Accede a Chrome Remote Desktop",
    desc: "Abre esta direccion en Chrome:",
    link: "https://remotedesktop.google.com/access"
  },
  {
    title: "Instala la extension de Chrome Remote Desktop",
    desc: "Si te pide instalar una extension, haz clic en 'Agregar a Chrome' y confirma. En Mac puede pedir permisos de Accesibilidad: ve a Preferencias del Sistema > Seguridad y Privacidad > Privacidad > Accesibilidad y activa Chrome Remote Desktop."
  },
  {
    title: "Conectate al servidor",
    desc: "Veras un equipo listado con el nombre del servidor. Haz clic sobre el para conectarte."
  },
  {
    title: "Ingresa el PIN de acceso",
    desc: "Te pedira un PIN de 6 digitos. Escribelo y haz clic en 'Conectar':",
    pin: "258000"
  },
  {
    title: "Listo!",
    desc: "Ya estas conectado al escritorio remoto. Puedes trabajar como si estuvieras frente al equipo. Para desconectarte, cierra la pestana o haz clic en 'Desconectar'."
  }
];

function StepCard({ step, number }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success('Copiado');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex gap-4 py-4" data-testid={`step-${number}`}>
      <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center text-sm font-bold shrink-0">
        {number}
      </div>
      <div className="flex-1 space-y-2">
        <p className="text-sm font-semibold text-slate-900">{step.title}</p>
        <p className="text-sm text-slate-600">{step.desc}</p>

        {step.credentials && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2 mt-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500">Correo</p>
                <p className="text-sm font-mono font-semibold text-slate-900">tramilex2027@gmail.com</p>
              </div>
              <button onClick={() => handleCopy('tramilex2027@gmail.com')} className="text-slate-400 hover:text-slate-600 p-1.5 rounded-md hover:bg-slate-100">
                {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500">Clave</p>
                <p className="text-sm font-mono font-semibold text-slate-900">Madrid2026</p>
              </div>
              <button onClick={() => handleCopy('Madrid2026')} className="text-slate-400 hover:text-slate-600 p-1.5 rounded-md hover:bg-slate-100">
                <Copy className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {step.link && (
          <a href={step.link} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-sky-600 hover:text-sky-700 font-medium mt-1"
            data-testid="remote-desktop-link">
            <ExternalLink className="w-3.5 h-3.5" /> {step.link}
          </a>
        )}

        {step.pin && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mt-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500">PIN de acceso</p>
                <p className="text-2xl font-mono font-bold text-slate-900 tracking-widest">{step.pin}</p>
              </div>
              <button onClick={() => handleCopy(step.pin)} className="text-slate-400 hover:text-slate-600 p-1.5 rounded-md hover:bg-slate-100">
                {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminServidor() {
  const [os, setOs] = useState('windows');

  const steps = os === 'windows' ? STEPS_WINDOWS : STEPS_MAC;

  return (
    <div className="max-w-2xl space-y-6" data-testid="admin-servidor-page">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500 mb-1">Conexion remota</p>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>Servidor</h1>
        <p className="text-sm text-slate-500 mt-1">Conectate al equipo de trabajo usando Chrome Remote Desktop</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {/* OS Selector */}
        <div className="p-5 border-b border-slate-100">
          <p className="text-sm font-medium text-slate-700 mb-3">Selecciona tu sistema operativo:</p>
          <div className="flex gap-3">
            <button onClick={() => setOs('windows')}
              className={`flex-1 h-11 rounded-lg border text-sm font-semibold transition-all ${
                os === 'windows' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
              }`} data-testid="os-windows-btn">
              Windows
            </button>
            <button onClick={() => setOs('mac')}
              className={`flex-1 h-11 rounded-lg border text-sm font-semibold transition-all ${
                os === 'mac' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
              }`} data-testid="os-mac-btn">
              Mac
            </button>
          </div>
        </div>

        {/* Steps */}
        <div className="px-5 divide-y divide-slate-100">
          {steps.map((step, i) => (
            <StepCard key={`${os}-${i}`} step={step} number={i + 1} />
          ))}
        </div>

        {/* Quick access button */}
        <div className="p-5 bg-slate-50 border-t border-slate-100">
          <a href="https://remotedesktop.google.com/access" target="_blank" rel="noopener noreferrer">
            <Button className="w-full h-11 bg-slate-900 hover:bg-slate-800 rounded-lg font-medium gap-2" data-testid="open-remote-btn">
              <Monitor className="w-4 h-4" /> Abrir Chrome Remote Desktop
            </Button>
          </a>
        </div>
      </div>
    </div>
  );
}
