import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Settings, Save, Mail, Server, Lock, User, KeyRound } from 'lucide-react';

export default function AdminSettings() {
  const [form, setForm] = useState({
    smtp_host: '',
    smtp_port: 587,
    smtp_user: '',
    smtp_password: '',
    from_email: '',
    notify_email: ''
  });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Password change state
  const [pwForm, setPwForm] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [changingPw, setChangingPw] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await api.get('/settings/smtp');
      setForm({
        smtp_host: res.data.smtp_host || '',
        smtp_port: res.data.smtp_port || 587,
        smtp_user: res.data.smtp_user || '',
        smtp_password: res.data.smtp_password || '',
        from_email: res.data.from_email || '',
        notify_email: res.data.notify_email || ''
      });
    } catch (err) {
      toast.error('Error cargando configuracion');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.smtp_host || !form.smtp_user || !form.from_email || !form.notify_email) {
      toast.error('Host, usuario, email remitente y email de notificaciones son obligatorios');
      return;
    }
    setSaving(true);
    try {
      await api.put('/settings/smtp', form);
      toast.success('Configuracion SMTP guardada');
    } catch (err) {
      toast.error('Error guardando configuracion');
    } finally {
      setSaving(false);
    }
  };

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (!pwForm.current_password || !pwForm.new_password) {
      toast.error('Todos los campos son obligatorios');
      return;
    }
    if (pwForm.new_password.length < 6) {
      toast.error('La nueva contrasena debe tener al menos 6 caracteres');
      return;
    }
    if (pwForm.new_password !== pwForm.confirm_password) {
      toast.error('Las contrasenas no coinciden');
      return;
    }
    setChangingPw(true);
    try {
      await api.put('/auth/change-password', {
        current_password: pwForm.current_password,
        new_password: pwForm.new_password
      });
      toast.success('Contrasena actualizada correctamente');
      setPwForm({ current_password: '', new_password: '', confirm_password: '' });
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error cambiando contrasena');
    } finally {
      setChangingPw(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-slate-900 border-t-transparent" />
      </div>
    );
  }

  return (
    <div data-testid="admin-settings-page">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>
          Configuracion
        </h1>
        <p className="text-sm text-slate-500 mt-1">Configura el servidor SMTP para recibir notificaciones de documentos</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg shadow-sm max-w-2xl">
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
              <Settings className="w-5 h-5 text-slate-600" strokeWidth={1.5} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>
                Servidor SMTP
              </h2>
              <p className="text-xs text-slate-500">
                Recibiras un email cada vez que un cliente suba un documento
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <Label className="text-slate-700 text-sm font-medium flex items-center gap-2">
                <Server className="w-3.5 h-3.5 text-slate-400" />
                Host SMTP *
              </Label>
              <Input
                value={form.smtp_host}
                onChange={e => update('smtp_host', e.target.value)}
                placeholder="smtp.gmail.com"
                className="mt-1.5 h-10 bg-white border-slate-300"
                data-testid="smtp-host-input"
                required
              />
            </div>
            <div>
              <Label className="text-slate-700 text-sm font-medium">Puerto *</Label>
              <Input
                type="number"
                value={form.smtp_port}
                onChange={e => update('smtp_port', parseInt(e.target.value) || 587)}
                placeholder="587"
                className="mt-1.5 h-10 bg-white border-slate-300"
                data-testid="smtp-port-input"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <Label className="text-slate-700 text-sm font-medium flex items-center gap-2">
                <User className="w-3.5 h-3.5 text-slate-400" />
                Usuario SMTP *
              </Label>
              <Input
                value={form.smtp_user}
                onChange={e => update('smtp_user', e.target.value)}
                placeholder="tu@gmail.com"
                className="mt-1.5 h-10 bg-white border-slate-300"
                data-testid="smtp-user-input"
                required
              />
            </div>
            <div>
              <Label className="text-slate-700 text-sm font-medium flex items-center gap-2">
                <Lock className="w-3.5 h-3.5 text-slate-400" />
                Contrasena SMTP *
              </Label>
              <Input
                type="password"
                value={form.smtp_password}
                onChange={e => update('smtp_password', e.target.value)}
                placeholder="Tu contrasena o app password"
                className="mt-1.5 h-10 bg-white border-slate-300"
                data-testid="smtp-password-input"
                required
              />
            </div>
          </div>

          <div>
            <Label className="text-slate-700 text-sm font-medium flex items-center gap-2">
              <Mail className="w-3.5 h-3.5 text-slate-400" />
              Email remitente (quien envia) *
            </Label>
            <Input
              type="email"
              value={form.from_email}
              onChange={e => update('from_email', e.target.value)}
              placeholder="notificaciones@tudominio.com"
              className="mt-1.5 h-10 bg-white border-slate-300"
              data-testid="smtp-from-email-input"
              required
            />
            <p className="text-xs text-slate-400 mt-1.5">
              Email del servidor SMTP que envia los correos
            </p>
          </div>

          <div>
            <Label className="text-slate-700 text-sm font-medium flex items-center gap-2">
              <Mail className="w-3.5 h-3.5 text-slate-400" />
              Email del abogado (quien recibe) *
            </Label>
            <Input
              type="email"
              value={form.notify_email}
              onChange={e => update('notify_email', e.target.value)}
              placeholder="malcafuz@tramilex.es"
              className="mt-1.5 h-10 bg-white border-slate-300"
              data-testid="smtp-notify-email-input"
              required
            />
            <p className="text-xs text-slate-400 mt-1.5">
              Aqui recibiras las notificaciones cuando un cliente suba documentos
            </p>
          </div>

          <div className="pt-2">
            <Button
              type="submit"
              className="h-10 bg-slate-900 hover:bg-slate-800 text-white rounded-md font-medium gap-2"
              disabled={saving}
              data-testid="save-smtp-btn"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Guardando...' : 'Guardar configuracion'}
            </Button>
          </div>
        </form>
      </div>

      {/* Password Change */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-sm max-w-2xl mt-8">
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
              <KeyRound className="w-5 h-5 text-slate-600" strokeWidth={1.5} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>
                Cambiar contrasena
              </h2>
              <p className="text-xs text-slate-500">
                Actualiza tu contrasena de acceso al sistema
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handlePasswordChange} className="p-6 space-y-5">
          <div>
            <Label className="text-slate-700 text-sm font-medium">Contrasena actual *</Label>
            <Input
              type="password"
              value={pwForm.current_password}
              onChange={e => setPwForm(prev => ({ ...prev, current_password: e.target.value }))}
              placeholder="Tu contrasena actual"
              className="mt-1.5 h-10 bg-white border-slate-300"
              data-testid="current-password-input"
              required
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <Label className="text-slate-700 text-sm font-medium">Nueva contrasena *</Label>
              <Input
                type="password"
                value={pwForm.new_password}
                onChange={e => setPwForm(prev => ({ ...prev, new_password: e.target.value }))}
                placeholder="Min. 6 caracteres"
                className="mt-1.5 h-10 bg-white border-slate-300"
                data-testid="new-password-input"
                required
              />
            </div>
            <div>
              <Label className="text-slate-700 text-sm font-medium">Confirmar contrasena *</Label>
              <Input
                type="password"
                value={pwForm.confirm_password}
                onChange={e => setPwForm(prev => ({ ...prev, confirm_password: e.target.value }))}
                placeholder="Repetir nueva contrasena"
                className="mt-1.5 h-10 bg-white border-slate-300"
                data-testid="confirm-password-input"
                required
              />
            </div>
          </div>
          <div className="pt-2">
            <Button
              type="submit"
              className="h-10 bg-slate-900 hover:bg-slate-800 text-white rounded-md font-medium gap-2"
              disabled={changingPw}
              data-testid="change-password-btn"
            >
              <KeyRound className="w-4 h-4" />
              {changingPw ? 'Cambiando...' : 'Cambiar contrasena'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
