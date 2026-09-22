import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Plus, Mail, MailOpen, Inbox, ArrowLeft, Paperclip, Download,
  Trash2, User, Clock, Search, X, AlertCircle, CheckCircle2, ExternalLink
} from 'lucide-react';

const DOMAIN = 'clientes.tramilex.es';

function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

function timeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso);
  if (diff < 60000) return 'Ahora';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  return `${Math.floor(diff / 86400000)}d`;
}

// ─── Create Mailbox Dialog ──────────────────────────────
function CreateMailboxDialog({ open, onClose, clients, onCreated }) {
  const [form, setForm] = useState({ email_prefix: '', display_name: '', client_id: '' });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  const handleCreate = async () => {
    if (!form.email_prefix.trim() || !form.display_name.trim()) {
      toast.error('Prefijo de email y nombre son obligatorios');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post('/client-mailboxes', form);
      setResult(res.data);
      onCreated();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error creando buzon');
    }
    setSubmitting(false);
  };

  const handleClose = () => {
    setResult(null);
    setForm({ email_prefix: '', display_name: '', client_id: '' });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-md rounded-2xl" data-testid="create-mailbox-dialog">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold tracking-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>
            {result ? 'Buzon registrado' : 'Nuevo buzon de cliente'}
          </DialogTitle>
        </DialogHeader>

        {result ? (
          <div className="space-y-4 mt-2">
            {result.ms_status === 'created' ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <p className="text-sm font-semibold text-emerald-800">Buzon creado automaticamente</p>
                </div>
                <p className="text-xs text-emerald-600">{result.email} ya esta listo para recibir correos.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="w-5 h-5 text-amber-600" />
                    <p className="text-sm font-semibold text-amber-800">Crear buzon en Office 365</p>
                  </div>
                  <p className="text-xs text-amber-700 mb-3">
                    El buzon <strong>{result.email}</strong> se registro en Tramilex pero necesitas crearlo en Office 365:
                  </p>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2.5">
                  <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">Pasos:</p>
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <span className="w-5 h-5 rounded-full bg-slate-900 text-white text-[10px] font-bold flex items-center justify-center shrink-0">1</span>
                      <p className="text-xs text-slate-600">Abre el <strong>Admin Center de Microsoft 365</strong></p>
                    </div>
                    <div className="flex gap-2">
                      <span className="w-5 h-5 rounded-full bg-slate-900 text-white text-[10px] font-bold flex items-center justify-center shrink-0">2</span>
                      <p className="text-xs text-slate-600">Ve a <strong>Equipos y Grupos → Buzones compartidos</strong></p>
                    </div>
                    <div className="flex gap-2">
                      <span className="w-5 h-5 rounded-full bg-slate-900 text-white text-[10px] font-bold flex items-center justify-center shrink-0">3</span>
                      <p className="text-xs text-slate-600">Click en <strong>"Agregar un buzon compartido"</strong></p>
                    </div>
                    <div className="flex gap-2">
                      <span className="w-5 h-5 rounded-full bg-slate-900 text-white text-[10px] font-bold flex items-center justify-center shrink-0">4</span>
                      <div className="text-xs text-slate-600">
                        <p>Nombre: <strong>{result.display_name}</strong></p>
                        <p>Email: <strong className="font-mono text-blue-600">{result.email}</strong></p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <span className="w-5 h-5 rounded-full bg-slate-900 text-white text-[10px] font-bold flex items-center justify-center shrink-0">5</span>
                      <p className="text-xs text-slate-600">Guarda. El buzon estara activo en minutos.</p>
                    </div>
                  </div>
                </div>
                <a href="https://admin.microsoft.com/#/SharedMailboxList" target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full h-10 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors">
                  <ExternalLink className="w-4 h-4" /> Abrir Admin Center de Microsoft 365
                </a>
              </div>
            )}
            <Button onClick={handleClose} variant="outline" className="w-full h-10 rounded-xl">
              Cerrar
            </Button>
          </div>
        ) : (
          <div className="space-y-4 mt-2">
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1.5 block">Direccion de correo *</label>
              <div className="flex items-center gap-0">
                <Input
                  placeholder="juan.garcia"
                  value={form.email_prefix}
                  onChange={e => setForm({...form, email_prefix: e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, '')})}
                  className="h-10 rounded-r-none border-r-0"
                  data-testid="mailbox-prefix-input"
                  autoFocus
                />
                <div className="h-10 bg-slate-100 border border-l-0 border-slate-200 rounded-r-lg px-3 flex items-center text-sm text-slate-500 shrink-0">
                  @{DOMAIN}
                </div>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1.5 block">Nombre del buzon *</label>
              <Input
                placeholder="Juan Garcia - Regularizacion"
                value={form.display_name}
                onChange={e => setForm({...form, display_name: e.target.value})}
                className="h-10"
                data-testid="mailbox-name-input"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1.5 block">Asignar a cliente (opcional)</label>
              <Select value={form.client_id} onValueChange={v => setForm({...form, client_id: v})}>
                <SelectTrigger className="h-10" data-testid="mailbox-client-select">
                  <SelectValue placeholder="Sin asignar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin asignar</SelectItem>
                  {clients.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name} ({c.email})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleCreate} disabled={submitting}
              className="w-full h-11 bg-slate-900 hover:bg-slate-800 rounded-xl font-medium"
              data-testid="submit-mailbox-btn">
              {submitting ? 'Registrando...' : 'Crear buzon'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Message Detail ─────────────────────────────────────
function MessageDetail({ mailboxId, message, onBack }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      try {
        const res = await api.get(`/client-mailboxes/${mailboxId}/messages/${message.id}`);
        setDetail(res.data);
      } catch { toast.error('Error cargando mensaje'); }
      setLoading(false);
    };
    fetch();
  }, [mailboxId, message.id]);

  const handleDownload = async (attId, filename) => {
    try {
      const res = await api.get(`/client-mailboxes/${mailboxId}/messages/${message.id}/attachments/${attId}`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error('Error descargando'); }
  };

  if (loading) return (
    <div className="p-12 text-center">
      <div className="w-8 h-8 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin mx-auto" />
    </div>
  );

  if (!detail) return null;

  return (
    <div className="space-y-4" data-testid="message-detail">
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 transition-colors" data-testid="back-to-inbox-btn">
        <ArrowLeft className="w-4 h-4" /> Volver a la bandeja
      </button>
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <h2 className="text-lg font-semibold text-slate-900">{detail.subject}</h2>
          <div className="flex items-center gap-3 mt-2 text-sm text-slate-500">
            <span className="font-medium text-slate-700">{detail.from_name || detail.from_email}</span>
            {detail.from_name && <span className="text-xs text-slate-400">&lt;{detail.from_email}&gt;</span>}
            <span className="text-xs">{formatDate(detail.date)}</span>
          </div>
        </div>
        <div className="px-6 py-5">
          {detail.body_type === 'html' ? (
            <div className="prose prose-sm max-w-none text-slate-700" dangerouslySetInnerHTML={{ __html: detail.body }} />
          ) : (
            <pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans">{detail.body}</pre>
          )}
        </div>
        {detail.attachments?.length > 0 && (
          <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Adjuntos</p>
            <div className="space-y-1.5">
              {detail.attachments.map(att => (
                <div key={att.id} className="flex items-center gap-3 bg-white rounded-lg px-3 py-2 border border-slate-100 hover:border-slate-200 transition-colors cursor-pointer"
                  onClick={() => handleDownload(att.id, att.filename)}>
                  <Paperclip className="w-4 h-4 text-slate-400" />
                  <span className="text-xs font-medium text-slate-700 flex-1 truncate">{att.filename}</span>
                  <Download className="w-3.5 h-3.5 text-slate-400" />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Mailbox Inbox ──────────────────────────────────────
function MailboxInbox({ mailbox, onBack, onOpenDetail }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMsg, setSelectedMsg] = useState(null);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      try {
        const res = await api.get(`/client-mailboxes/${mailbox.id}/messages`);
        setMessages(res.data.messages || []);
      } catch (err) {
        toast.error(err.response?.data?.detail || 'Error cargando mensajes');
      }
      setLoading(false);
    };
    fetch();
  }, [mailbox.id]);

  if (selectedMsg) {
    return <MessageDetail mailboxId={mailbox.id} message={selectedMsg} onBack={() => setSelectedMsg(null)} />;
  }

  return (
    <div className="space-y-4" data-testid="mailbox-inbox">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 transition-colors" data-testid="back-to-mailboxes-btn">
          <ArrowLeft className="w-4 h-4" /> Todos los buzones
        </button>
        <div className="text-right">
          <p className="text-sm font-semibold text-slate-900">{mailbox.display_name}</p>
          <p className="text-xs text-slate-400">{mailbox.email}</p>
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center">
          <div className="w-8 h-8 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin mx-auto" />
        </div>
      ) : messages.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center shadow-sm">
          <Inbox className="w-12 h-12 text-slate-200 mx-auto mb-3" strokeWidth={1} />
          <p className="text-sm text-slate-400">Bandeja vacia</p>
          <p className="text-xs text-slate-300 mt-1">Los correos enviados a {mailbox.email} apareceran aqui</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm divide-y divide-slate-100">
          {messages.map(msg => (
            <div key={msg.id}
              className={`flex items-center gap-4 px-5 py-3.5 cursor-pointer hover:bg-slate-50 transition-colors ${!msg.is_read ? 'bg-blue-50/30' : ''}`}
              onClick={() => setSelectedMsg(msg)}
              data-testid={`message-item-${msg.id}`}
            >
              <div className="shrink-0">
                {msg.is_read ? (
                  <MailOpen className="w-4.5 h-4.5 text-slate-300" />
                ) : (
                  <Mail className="w-4.5 h-4.5 text-blue-500" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className={`text-sm truncate ${!msg.is_read ? 'font-semibold text-slate-900' : 'text-slate-600'}`}>
                    {msg.from_name || msg.from_email}
                  </p>
                  {msg.has_attachments && <Paperclip className="w-3 h-3 text-slate-400 shrink-0" />}
                </div>
                <p className={`text-sm truncate ${!msg.is_read ? 'font-medium text-slate-800' : 'text-slate-500'}`}>
                  {msg.subject}
                </p>
                <p className="text-xs text-slate-400 truncate mt-0.5">{msg.preview}</p>
              </div>
              <span className="text-[11px] text-slate-400 shrink-0">{timeAgo(msg.date)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────
export default function AdminBuzones() {
  const { user } = useAuth();
  const [mailboxes, setMailboxes] = useState([]);
  const [clients, setClients] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedMailbox, setSelectedMailbox] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchMailboxes = useCallback(async () => {
    try {
      const res = await api.get('/client-mailboxes');
      setMailboxes(res.data);
    } catch { toast.error('Error cargando buzones'); }
    setLoading(false);
  }, []);

  const fetchClients = useCallback(async () => {
    try {
      const res = await api.get('/clients');
      setClients(res.data);
    } catch {}
  }, []);

  useEffect(() => { fetchMailboxes(); fetchClients(); }, [fetchMailboxes, fetchClients]);

  const handleDelete = async (id, email) => {
    if (!window.confirm(`¿Desactivar el buzon ${email}? No se eliminara de Office 365.`)) return;
    try {
      await api.delete(`/client-mailboxes/${id}`);
      toast.success('Buzon desactivado');
      fetchMailboxes();
    } catch { toast.error('Error'); }
  };

  const filtered = mailboxes.filter(m =>
    !search.trim() ||
    m.email.toLowerCase().includes(search.toLowerCase()) ||
    m.display_name.toLowerCase().includes(search.toLowerCase()) ||
    (m.client_name || '').toLowerCase().includes(search.toLowerCase())
  );

  if (selectedMailbox) {
    return (
      <div className="space-y-6" data-testid="admin-buzones">
        <MailboxInbox mailbox={selectedMailbox} onBack={() => setSelectedMailbox(null)} />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="admin-buzones">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-slate-400 mb-1">Office 365</p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>
            Buzones de Clientes
          </h1>
        </div>
        <Button onClick={() => setShowCreate(true)}
          className="bg-slate-900 hover:bg-slate-800 gap-2 h-10 px-5 rounded-xl text-sm shadow-sm"
          data-testid="create-mailbox-btn">
          <Plus className="w-4 h-4" /> Nuevo buzon
        </Button>
      </div>

      {/* Info bar */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200/60 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
            <Mail className="w-6 h-6 text-blue-600" />
          </div>
          <div className="flex-1">
            <p className="text-lg font-bold text-blue-900">{mailboxes.length} buzon{mailboxes.length !== 1 ? 'es' : ''}</p>
            <p className="text-xs text-blue-600">Dominio: <strong>@{DOMAIN}</strong></p>
          </div>
        </div>
      </div>

      {/* Search */}
      {mailboxes.length > 0 && (
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-4 py-1 shadow-sm">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <Input placeholder="Buscar buzon o cliente..." value={search} onChange={e => setSearch(e.target.value)}
            className="border-0 focus-visible:ring-0 p-0 h-10 text-sm" data-testid="mailbox-search" />
          {search && (
            <button onClick={() => setSearch('')} className="text-slate-300 hover:text-slate-500"><X className="w-4 h-4" /></button>
          )}
        </div>
      )}

      {/* Mailbox list */}
      {loading ? (
        <div className="p-12 text-center">
          <div className="w-8 h-8 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin mx-auto" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center shadow-sm">
          <Inbox className="w-12 h-12 text-slate-200 mx-auto mb-4" strokeWidth={1} />
          <p className="text-sm text-slate-400">{mailboxes.length === 0 ? 'No hay buzones creados' : 'Sin resultados'}</p>
          {mailboxes.length === 0 && (
            <p className="text-xs text-slate-300 mt-1">Crea un buzon para asignarle correos a tus clientes</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(mb => (
            <div key={mb.id}
              className="bg-white border border-slate-200/80 rounded-2xl p-5 hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer group"
              onClick={() => setSelectedMailbox(mb)}
              data-testid={`mailbox-card-${mb.id}`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-sm">
                  <Mail className="w-5 h-5 text-white" />
                </div>
                <div className="flex items-center gap-1">
                  {mb.ms_status === 'created' ? (
                    <Badge className="text-[9px] bg-emerald-50 text-emerald-600 border-0">Activo</Badge>
                  ) : (
                    <a href="https://admin.microsoft.com/#/SharedMailboxList" target="_blank" rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="text-[9px] bg-amber-50 text-amber-600 border border-amber-200 px-2 py-0.5 rounded-full font-semibold hover:bg-amber-100 transition-colors flex items-center gap-1">
                      <ExternalLink className="w-2.5 h-2.5" /> Crear en O365
                    </a>
                  )}
                  <button
                    onClick={e => { e.stopPropagation(); handleDelete(mb.id, mb.email); }}
                    className="p-1 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                    data-testid={`delete-mailbox-${mb.id}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <p className="text-sm font-semibold text-slate-900 mb-0.5">{mb.display_name}</p>
              <p className="text-xs text-blue-600 font-mono mb-2">{mb.email}</p>
              {mb.client_name && (
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <User className="w-3 h-3" />
                  <span>{mb.client_name}</span>
                </div>
              )}
              <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-2">
                <Clock className="w-3 h-3" />
                <span>{formatDate(mb.created_at)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <CreateMailboxDialog open={showCreate} onClose={() => setShowCreate(false)} clients={clients} onCreated={fetchMailboxes} />
    </div>
  );
}
