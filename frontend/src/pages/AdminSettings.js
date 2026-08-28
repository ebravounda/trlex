import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
  Settings, Save, Mail, Server, Lock, User, KeyRound, Building2, Phone,
  CreditCard, Globe, ChevronDown, ChevronUp, Send
} from 'lucide-react';

function Section({ icon: Icon, title, desc, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-3 p-5 hover:bg-slate-50 transition-colors text-left">
        <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5 text-slate-600" strokeWidth={1.5} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>{title}</p>
          <p className="text-xs text-slate-500">{desc}</p>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>
      {open && <div className="px-5 pb-5 pt-1 border-t border-slate-100">{children}</div>}
    </div>
  );
}

export default function AdminSettings() {
  const [smtp, setSmtp] = useState({ smtp_host: '', smtp_port: 587, smtp_user: '', smtp_password: '', from_email: '', notify_email: '' });
  const [mailgun, setMailgun] = useState({ mailgun_domain: '', mailgun_api_key: '', mailgun_from_email: '' });
  const [resendCfg, setResendCfg] = useState({ resend_api_key: '', resend_from_email: '' });
  const [company, setCompany] = useState({ company_name: 'Tramilex', company_email: 'info@tramilex.es', phone_spain: '', phone_chile: '', phone_mexico: '', phone_peru: '', iban: '', bank_name_eu: '', cuenta_chile: '', bank_name_chile: '', extra_payment_info: '' });
  const [pwForm, setPwForm] = useState({ current_password: '', new_password: '', confirm_password: '' });

  const [savingSmtp, setSavingSmtp] = useState(false);
  const [savingMailgun, setSavingMailgun] = useState(false);
  const [savingResend, setSavingResend] = useState(false);
  const [savingCompany, setSavingCompany] = useState(false);
  const [changingPw, setChangingPw] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    try {
      const [smtpRes, mailgunRes, resendRes, companyRes] = await Promise.all([
        api.get('/settings/smtp'),
        api.get('/settings/mailgun'),
        api.get('/settings/resend'),
        api.get('/settings/company-info'),
      ]);
      setSmtp(s => ({ ...s, ...smtpRes.data }));
      setMailgun(m => ({ ...m, ...mailgunRes.data }));
      setResendCfg(r => ({ ...r, ...resendRes.data }));
      setCompany(c => ({ ...c, ...companyRes.data }));
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleSaveSmtp = async (e) => {
    e.preventDefault();
    setSavingSmtp(true);
    try { await api.put('/settings/smtp', smtp); toast.success('SMTP guardado'); } catch { toast.error('Error'); }
    setSavingSmtp(false);
  };

  const handleSaveMailgun = async (e) => {
    e.preventDefault();
    setSavingMailgun(true);
    try { await api.put('/settings/mailgun', mailgun); toast.success('Mailgun guardado'); } catch { toast.error('Error'); }
    setSavingMailgun(false);
  };

  const handleSaveResend = async (e) => {
    e.preventDefault();
    setSavingResend(true);
    try { await api.put('/settings/resend', resendCfg); toast.success('Resend guardado'); } catch { toast.error('Error'); }
    setSavingResend(false);
  };

  const handleSaveCompany = async (e) => {
    e.preventDefault();
    setSavingCompany(true);
    try { await api.put('/settings/company-info', company); toast.success('Datos de empresa guardados'); } catch { toast.error('Error'); }
    setSavingCompany(false);
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (pwForm.new_password.length < 6) { toast.error('Min. 6 caracteres'); return; }
    if (pwForm.new_password !== pwForm.confirm_password) { toast.error('No coinciden'); return; }
    setChangingPw(true);
    try {
      await api.put('/auth/change-password', { current_password: pwForm.current_password, new_password: pwForm.new_password });
      toast.success('Contrasena actualizada');
      setPwForm({ current_password: '', new_password: '', confirm_password: '' });
    } catch (err) { toast.error(err.response?.data?.detail || 'Error'); }
    setChangingPw(false);
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-2 border-slate-900 border-t-transparent" /></div>;

  return (
    <div className="space-y-6 max-w-3xl" data-testid="admin-settings-page">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500 mb-1">Sistema</p>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>Configuracion</h1>
      </div>

      {/* Resend (Priority) */}
      <Section icon={Send} title="Resend" desc="API de correos transaccionales (prioridad sobre SMTP)" defaultOpen={true}>
        <form onSubmit={handleSaveResend} className="space-y-4 mt-3">
          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">Si Resend esta configurado, se usara como metodo principal de envio. SMTP sera el respaldo.</p>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs text-slate-600">API Key *</Label><Input type="password" value={resendCfg.resend_api_key} onChange={e => setResendCfg({...resendCfg, resend_api_key: e.target.value})} placeholder="re_..." className="mt-1 h-9" data-testid="resend-api-key-input" /></div>
            <div><Label className="text-xs text-slate-600">Email remitente *</Label><Input value={resendCfg.resend_from_email} onChange={e => setResendCfg({...resendCfg, resend_from_email: e.target.value})} placeholder="noreply@tudominio.com" className="mt-1 h-9" data-testid="resend-from-email-input" /></div>
          </div>
          <Button type="submit" disabled={savingResend} className="h-9 bg-slate-900 hover:bg-slate-800 gap-2 text-xs" data-testid="save-resend-btn">
            <Save className="w-3.5 h-3.5" /> {savingResend ? 'Guardando...' : 'Guardar Resend'}
          </Button>
        </form>
      </Section>

      {/* SMTP */}
      <Section icon={Server} title="Servidor SMTP" desc="Correo para notificaciones del sistema" defaultOpen={true}>
        <form onSubmit={handleSaveSmtp} className="space-y-4 mt-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs text-slate-600">Host SMTP *</Label><Input value={smtp.smtp_host} onChange={e => setSmtp({...smtp, smtp_host: e.target.value})} placeholder="smtp.gmail.com" className="mt-1 h-9" data-testid="smtp-host-input" /></div>
            <div><Label className="text-xs text-slate-600">Puerto</Label><Input type="number" value={smtp.smtp_port} onChange={e => setSmtp({...smtp, smtp_port: parseInt(e.target.value) || 587})} className="mt-1 h-9" data-testid="smtp-port-input" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs text-slate-600">Usuario SMTP *</Label><Input value={smtp.smtp_user} onChange={e => setSmtp({...smtp, smtp_user: e.target.value})} className="mt-1 h-9" data-testid="smtp-user-input" /></div>
            <div><Label className="text-xs text-slate-600">Contrasena SMTP</Label><Input type="password" value={smtp.smtp_password} onChange={e => setSmtp({...smtp, smtp_password: e.target.value})} className="mt-1 h-9" data-testid="smtp-password-input" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs text-slate-600">Email remitente *</Label><Input value={smtp.from_email} onChange={e => setSmtp({...smtp, from_email: e.target.value})} placeholder="noreply@tramilex.es" className="mt-1 h-9" data-testid="smtp-from-email-input" /></div>
            <div><Label className="text-xs text-slate-600">Email notificaciones *</Label><Input value={smtp.notify_email} onChange={e => setSmtp({...smtp, notify_email: e.target.value})} placeholder="malcafuz@tramilex.es" className="mt-1 h-9" data-testid="smtp-notify-email-input" /></div>
          </div>
          <Button type="submit" disabled={savingSmtp} className="h-9 bg-slate-900 hover:bg-slate-800 gap-2 text-xs" data-testid="save-smtp-btn">
            <Save className="w-3.5 h-3.5" /> {savingSmtp ? 'Guardando...' : 'Guardar SMTP'}
          </Button>
        </form>
      </Section>

      {/* Mailgun */}
      <Section icon={Mail} title="Mailgun" desc="API de envio de correos masivos y transaccionales">
        <form onSubmit={handleSaveMailgun} className="space-y-4 mt-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs text-slate-600">Dominio Mailgun</Label><Input value={mailgun.mailgun_domain} onChange={e => setMailgun({...mailgun, mailgun_domain: e.target.value})} placeholder="mg.tramilex.es" className="mt-1 h-9" data-testid="mailgun-domain" /></div>
            <div><Label className="text-xs text-slate-600">API Key</Label><Input type="password" value={mailgun.mailgun_api_key} onChange={e => setMailgun({...mailgun, mailgun_api_key: e.target.value})} placeholder="key-..." className="mt-1 h-9" data-testid="mailgun-api-key" /></div>
          </div>
          <div><Label className="text-xs text-slate-600">Email remitente Mailgun</Label><Input value={mailgun.mailgun_from_email} onChange={e => setMailgun({...mailgun, mailgun_from_email: e.target.value})} placeholder="noreply@mg.tramilex.es" className="mt-1 h-9" data-testid="mailgun-from-email" /></div>
          <Button type="submit" disabled={savingMailgun} className="h-9 bg-slate-900 hover:bg-slate-800 gap-2 text-xs" data-testid="save-mailgun-btn">
            <Save className="w-3.5 h-3.5" /> {savingMailgun ? 'Guardando...' : 'Guardar Mailgun'}
          </Button>
        </form>
      </Section>

      {/* Company Info & Payment */}
      <Section icon={Building2} title="Datos de Empresa y Pagos" desc="Info para presupuestos, facturas y datos bancarios">
        <form onSubmit={handleSaveCompany} className="space-y-4 mt-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs text-slate-600">Nombre empresa</Label><Input value={company.company_name} onChange={e => setCompany({...company, company_name: e.target.value})} className="mt-1 h-9" /></div>
            <div><Label className="text-xs text-slate-600">Email empresa</Label><Input value={company.company_email} onChange={e => setCompany({...company, company_email: e.target.value})} className="mt-1 h-9" /></div>
          </div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400 pt-2">Telefonos por pais</p>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs text-slate-600">Espana</Label><Input value={company.phone_spain} onChange={e => setCompany({...company, phone_spain: e.target.value})} placeholder="+34 ..." className="mt-1 h-9" data-testid="phone-spain" /></div>
            <div><Label className="text-xs text-slate-600">Chile</Label><Input value={company.phone_chile} onChange={e => setCompany({...company, phone_chile: e.target.value})} placeholder="+56 ..." className="mt-1 h-9" data-testid="phone-chile" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs text-slate-600">Mexico</Label><Input value={company.phone_mexico} onChange={e => setCompany({...company, phone_mexico: e.target.value})} placeholder="+52 ..." className="mt-1 h-9" data-testid="phone-mexico" /></div>
            <div><Label className="text-xs text-slate-600">Peru</Label><Input value={company.phone_peru} onChange={e => setCompany({...company, phone_peru: e.target.value})} placeholder="+51 ..." className="mt-1 h-9" data-testid="phone-peru" /></div>
          </div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400 pt-2">Datos bancarios</p>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs text-slate-600">IBAN</Label><Input value={company.iban} onChange={e => setCompany({...company, iban: e.target.value})} placeholder="ES76 0049 ..." className="mt-1 h-9" data-testid="iban-input" /></div>
            <div><Label className="text-xs text-slate-600">Banco (Europa)</Label><Input value={company.bank_name_eu} onChange={e => setCompany({...company, bank_name_eu: e.target.value})} placeholder="Nombre del banco" className="mt-1 h-9" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs text-slate-600">Cuenta Chile</Label><Input value={company.cuenta_chile} onChange={e => setCompany({...company, cuenta_chile: e.target.value})} placeholder="Nro cuenta" className="mt-1 h-9" data-testid="cuenta-chile-input" /></div>
            <div><Label className="text-xs text-slate-600">Banco Chile</Label><Input value={company.bank_name_chile} onChange={e => setCompany({...company, bank_name_chile: e.target.value})} placeholder="Nombre del banco" className="mt-1 h-9" /></div>
          </div>
          <div><Label className="text-xs text-slate-600">Info adicional de pago</Label><Textarea value={company.extra_payment_info} onChange={e => setCompany({...company, extra_payment_info: e.target.value})} placeholder="Otros datos (Paypal, Bizum...)" className="mt-1" rows={2} /></div>
          <Button type="submit" disabled={savingCompany} className="h-9 bg-slate-900 hover:bg-slate-800 gap-2 text-xs" data-testid="save-company-btn">
            <Save className="w-3.5 h-3.5" /> {savingCompany ? 'Guardando...' : 'Guardar datos empresa'}
          </Button>
        </form>
      </Section>

      {/* Change Password */}
      <Section icon={KeyRound} title="Cambiar contrasena" desc="Actualiza tu contrasena de acceso">
        <form onSubmit={handlePasswordChange} className="space-y-4 mt-3">
          <div><Label className="text-xs text-slate-600">Contrasena actual *</Label><Input type="password" value={pwForm.current_password} onChange={e => setPwForm({...pwForm, current_password: e.target.value})} className="mt-1 h-9" data-testid="current-password-input" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs text-slate-600">Nueva contrasena *</Label><Input type="password" value={pwForm.new_password} onChange={e => setPwForm({...pwForm, new_password: e.target.value})} className="mt-1 h-9" data-testid="new-password-input" /></div>
            <div><Label className="text-xs text-slate-600">Confirmar *</Label><Input type="password" value={pwForm.confirm_password} onChange={e => setPwForm({...pwForm, confirm_password: e.target.value})} className="mt-1 h-9" data-testid="confirm-password-input" /></div>
          </div>
          <Button type="submit" disabled={changingPw} className="h-9 bg-slate-900 hover:bg-slate-800 gap-2 text-xs" data-testid="change-password-btn">
            <KeyRound className="w-3.5 h-3.5" /> {changingPw ? 'Cambiando...' : 'Cambiar contrasena'}
          </Button>
        </form>
      </Section>
    </div>
  );
}
