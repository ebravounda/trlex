import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Users, Building2, CalendarCheck, ListTodo, DollarSign, FileSpreadsheet,
  FileText, UserCog, Inbox, Mail, Settings, Upload, ClipboardList,
  ArrowRight, ArrowLeft, X, Sparkles, CheckCircle2, Briefcase
} from 'lucide-react';

const ADMIN_STEPS = [
  { icon: Sparkles, title: 'Bienvenido a Tramilex!', desc: 'Tu plataforma completa para gestionar tramites de inmigracion. Te mostraremos las herramientas que tienes disponibles.', color: 'from-slate-900 to-slate-700' },
  { icon: Users, title: 'Clientes', desc: 'Visualiza todos tus clientes, busca por nombre o email, revisa sus documentos, genera fichas PDF y envia correos directamente.', color: 'from-blue-600 to-blue-800' },
  { icon: Building2, title: 'Empresas', desc: 'Gestiona empresas con CIF/NIF, agrega trabajadores, asigna tramites, sube documentos para firmar y envia credenciales automaticamente.', color: 'from-violet-600 to-violet-800' },
  { icon: CalendarCheck, title: 'Citas', desc: 'Sistema completo de citas. Comparte el enlace de reserva, los clientes pagan via Stripe y la cita se confirma automaticamente. Bloquea dias desde configuracion.', color: 'from-emerald-600 to-emerald-800' },
  { icon: ListTodo, title: 'Tareas', desc: 'Crea y asigna tareas con prioridad (baja/media/alta), agrega comentarios, cambia estados. Notificaciones automaticas al equipo.', color: 'from-amber-600 to-amber-800' },
  { icon: DollarSign, title: 'Contabilidad', desc: 'Control completo de cobros y pagos. Registra montos, pagos parciales, estados de deuda y mantiene el historial financiero de cada cliente.', color: 'from-green-600 to-green-800' },
  { icon: FileSpreadsheet, title: 'Presupuestos', desc: 'Genera presupuestos profesionales en PDF con tu logo, datos de empresa, IVA (19%/21%), datos de pago y numeracion automatica.', color: 'from-cyan-600 to-cyan-800' },
  { icon: FileText, title: 'Tramites', desc: 'Gestiona los tramites del sistema, crea tramites personalizados con requisitos especificos para cada pais (Chile/Espana).', color: 'from-rose-600 to-rose-800' },
  { icon: UserCog, title: 'Equipo', desc: 'Crea usuarios del despacho (staff) con acceso al panel. Al crearse reciben un email con credenciales y deben cambiar la clave en su primer acceso.', color: 'from-indigo-600 to-indigo-800' },
  { icon: Inbox, title: 'Inbox y Correo', desc: 'Lee correos de Outlook directamente desde la plataforma y envia notificaciones a clientes con autocompletado de destinatarios.', color: 'from-orange-600 to-orange-800' },
  { icon: Settings, title: 'Configuracion', desc: 'Configura SMTP, Mailgun, datos de empresa, telefonos por pais, cuentas bancarias (IBAN/Chile) y cambia tu contrasena.', color: 'from-slate-600 to-slate-800' },
  { icon: CheckCircle2, title: 'Listo!', desc: 'Ya conoces todas las herramientas. Puedes acceder a este tutorial nuevamente desde el menu de configuracion. A trabajar!', color: 'from-emerald-600 to-emerald-700' },
];

const CLIENT_STEPS = [
  { icon: Sparkles, title: 'Bienvenido a Tramilex!', desc: 'Tu plataforma para gestionar tus documentos de inmigracion de forma segura y eficiente.', color: 'from-slate-900 to-slate-700' },
  { icon: ClipboardList, title: 'Requisitos del tramite', desc: 'En tu panel podras ver todos los documentos que necesitas para tu tramite. En movil, pulsa "Requisitos" para desplegarlos.', color: 'from-blue-600 to-blue-800' },
  { icon: Upload, title: 'Subir documentos', desc: 'Selecciona la categoria (Identificacion, Residencia, Trabajo, etc.) y arrastra o haz clic para subir archivos. Maximo 5MB por archivo.', color: 'from-emerald-600 to-emerald-800' },
  { icon: FileText, title: 'Estado de documentos', desc: 'Revisa el estado de tus documentos: "Pendiente de revision" o "Revisado". Tambien puedes descargarlos en cualquier momento.', color: 'from-amber-600 to-amber-800' },
  { icon: CheckCircle2, title: 'Todo listo!', desc: 'Ya sabes como funciona tu panel. Si tienes dudas, usa el chat de asistencia en la esquina inferior derecha.', color: 'from-emerald-600 to-emerald-700' },
];

const COMPANY_STEPS = [
  { icon: Sparkles, title: 'Bienvenido a Tramilex!', desc: 'Portal de empresa para gestionar tramites de inmigracion de tus trabajadores.', color: 'from-slate-900 to-slate-700' },
  { icon: Briefcase, title: 'Tramites', desc: 'Visualiza los tramites contratados y su estado (pendiente, en proceso, completado). Cada tramite tiene requisitos especificos.', color: 'from-blue-600 to-blue-800' },
  { icon: Users, title: 'Trabajadores', desc: 'Agrega trabajadores con todos sus datos personales. Por cada trabajador podras subir los documentos requeridos para su tramite.', color: 'from-violet-600 to-violet-800' },
  { icon: Upload, title: 'Documentos', desc: 'Sube documentos por trabajador seleccionando la categoria. Verifica el estado de revision de cada documento subido.', color: 'from-emerald-600 to-emerald-800' },
  { icon: FileText, title: 'Firma electronica', desc: 'Si el abogado te sube documentos para firmar, aparecen con alerta amarilla. Descarga, firma con tu certificado y sube el documento firmado.', color: 'from-amber-600 to-amber-800' },
  { icon: CheckCircle2, title: 'Todo listo!', desc: 'Ya conoces tu portal de empresa. Usa el chat de asistencia si necesitas ayuda.', color: 'from-emerald-600 to-emerald-700' },
];

export default function InteractiveTutorial({ role, onComplete }) {
  const [step, setStep] = useState(0);
  const [exiting, setExiting] = useState(false);

  const steps = role === 'admin' || role === 'staff' ? ADMIN_STEPS : role === 'company' ? COMPANY_STEPS : CLIENT_STEPS;
  const current = steps[step];
  const isLast = step === steps.length - 1;
  const progress = ((step + 1) / steps.length) * 100;

  const handleDismiss = async () => {
    setExiting(true);
    try { await api.put('/auth/tutorial-seen'); } catch {}
    setTimeout(() => onComplete(), 300);
  };

  const Icon = current.icon;

  return (
    <div className={`fixed inset-0 z-[90] flex items-center justify-center transition-opacity duration-300 ${exiting ? 'opacity-0' : 'opacity-100'}`} data-testid="interactive-tutorial">
      <div className="absolute inset-0 bg-slate-900/70 backdrop-blur-md" />
      <div className={`relative max-w-lg w-full mx-4 rounded-2xl overflow-hidden shadow-2xl transition-all duration-500 ${exiting ? 'scale-95' : 'scale-100'}`}>
        {/* Gradient header */}
        <div className={`bg-gradient-to-br ${current.color} p-8 pb-12 text-center relative overflow-hidden`}>
          <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 30% 50%, white 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
          <button onClick={handleDismiss} className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors" data-testid="tutorial-close">
            <X className="w-4 h-4 text-white" />
          </button>
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl bg-white/15 flex items-center justify-center mx-auto mb-4 backdrop-blur-sm border border-white/10">
              <Icon className="w-8 h-8 text-white" strokeWidth={1.5} />
            </div>
            <h2 className="text-2xl font-bold text-white" style={{ fontFamily: 'Manrope, sans-serif' }}>{current.title}</h2>
          </div>
        </div>

        {/* Content */}
        <div className="bg-white p-6">
          <p className="text-sm text-slate-600 leading-relaxed text-center mb-6">{current.desc}</p>

          {/* Progress bar */}
          <div className="w-full h-1.5 bg-slate-100 rounded-full mb-5 overflow-hidden">
            <div className="h-full bg-slate-900 rounded-full transition-all duration-500 ease-out" style={{ width: `${progress}%` }} />
          </div>

          {/* Step dots */}
          <div className="flex justify-center gap-1.5 mb-5">
            {steps.map((_, i) => (
              <button key={i} onClick={() => setStep(i)}
                className={`w-2 h-2 rounded-full transition-all duration-300 ${i === step ? 'bg-slate-900 w-6' : i < step ? 'bg-slate-400' : 'bg-slate-200'}`} />
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between">
            <div>
              {step > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setStep(s => s - 1)} className="gap-1.5 text-slate-500">
                  <ArrowLeft className="w-3.5 h-3.5" /> Anterior
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={handleDismiss} className="text-slate-400 hover:text-slate-600 text-xs" data-testid="tutorial-skip">
                No mostrar mas
              </Button>
              {isLast ? (
                <Button onClick={handleDismiss} className="bg-slate-900 hover:bg-slate-800 gap-1.5 h-9 px-5 rounded-lg" data-testid="tutorial-finish">
                  Comenzar <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              ) : (
                <Button onClick={() => setStep(s => s + 1)} className="bg-slate-900 hover:bg-slate-800 gap-1.5 h-9 px-5 rounded-lg" data-testid="tutorial-next">
                  Siguiente <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
