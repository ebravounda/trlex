import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Paperclip, RefreshCw, Mail, ChevronDown, ChevronUp, Download, AlertTriangle, Eye, FileText, Forward, Search, Calendar } from 'lucide-react';

function formatDate(dateStr) {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr.substring(0, 30);
    return d.toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return dateStr.substring(0, 30); }
}

function getDateGroup(dateStr) {
  if (!dateStr) return 'Sin fecha';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 'Sin fecha';
    const today = new Date();
    const isToday = d.toDateString() === today.toDateString();
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();
    if (isToday) return 'Hoy';
    if (isYesterday) return 'Ayer';
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
  } catch { return 'Sin fecha'; }
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return 'Ahora';
  if (diff < 3600000) return `Hace ${Math.floor(diff / 60000)} min`;
  if (diff < 86400000) return `Hace ${Math.floor(diff / 3600000)}h`;
  return formatDate(dateStr);
}

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function extractName(from) {
  if (!from) return { name: 'Desconocido', email: '' };
  const match = from.match(/^(.+?)\s*<(.+?)>$/);
  if (match) return { name: match[1].trim(), email: match[2].trim() };
  return { name: from, email: from };
}

function getInitials(name) {
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
}

const AVATAR_COLORS = ['bg-sky-500', 'bg-emerald-500', 'bg-amber-500', 'bg-purple-500', 'bg-pink-500', 'bg-teal-500', 'bg-indigo-500'];
function getAvatarColor(email) {
  let hash = 0;
  for (let i = 0; i < email.length; i++) hash = email.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export default function AdminInbox() {
  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedEmail, setExpandedEmail] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [search, setSearch] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [showForward, setShowForward] = useState(null);
  const [recipients, setRecipients] = useState([]);
  const [forwardTo, setForwardTo] = useState('');
  const [forwardNote, setForwardNote] = useState('');
  const [forwarding, setForwarding] = useState(false);

  const [readIds, setReadIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem('tramilex_read_emails') || '[]'); } catch { return []; }
  });

  const fetchEmails = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/inbox');
      setEmails(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Error conectando al servidor de correo');
    }
    setLoading(false);
  }, []);

  const fetchRecipients = useCallback(async () => {
    try {
      const res = await api.get('/inbox/forward-recipients');
      setRecipients(res.data);
    } catch {}
  }, []);

  useEffect(() => { fetchEmails(); fetchRecipients(); }, [fetchEmails, fetchRecipients]);

  useEffect(() => {
    const interval = setInterval(() => {
      api.get('/inbox').then(res => setEmails(res.data)).catch(() => {});
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const markAsRead = (emailId) => {
    if (!readIds.includes(emailId)) {
      const updated = [...readIds, emailId];
      setReadIds(updated);
      localStorage.setItem('tramilex_read_emails', JSON.stringify(updated));
    }
  };

  const handleExpand = (emailId) => {
    if (expandedEmail === emailId) {
      setExpandedEmail(null);
    } else {
      setExpandedEmail(emailId);
      markAsRead(emailId);
    }
    setPreviewUrl(null);
  };

  const handleDownloadAttachment = async (msgId, attId, filename) => {
    try {
      const res = await api.get(`/inbox/attachment/${encodeURIComponent(msgId)}/${encodeURIComponent(attId)}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch { toast.error('Error descargando adjunto'); }
  };

  const handlePreviewAttachment = async (msgId, attId, contentType) => {
    if (!contentType?.includes('pdf') && !contentType?.startsWith('image/')) {
      toast.info('Previsualizacion no disponible para este tipo de archivo');
      return;
    }
    try {
      const res = await api.get(`/inbox/attachment/${encodeURIComponent(msgId)}/${encodeURIComponent(attId)}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(res.data);
      setPreviewUrl({ url, type: contentType });
    } catch { toast.error('Error cargando previsualizacion'); }
  };

  const handleForward = async () => {
    if (!forwardTo || !showForward) return;
    setForwarding(true);
    const recipient = recipients.find(r => r.id === forwardTo);
    try {
      await api.post('/inbox/forward', {
        msg_id: showForward,
        to_user_id: forwardTo,
        to_user_type: recipient?.type || 'client',
        note: forwardNote
      });
      toast.success(`Email reenviado a ${recipient?.name || ''}`);
      setShowForward(null);
      setForwardTo('');
      setForwardNote('');
    } catch (err) { toast.error(err.response?.data?.detail || 'Error reenviando'); }
    setForwarding(false);
  };

  const toggleGroup = (group) => {
    setCollapsedGroups(prev => ({ ...prev, [group]: !prev[group] }));
  };

  // Filter emails
  const filtered = emails.filter(e => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const sender = extractName(e.from);
    const bodyText = e.body_type === 'html'
      ? new DOMParser().parseFromString(e.body || '', 'text/html').body.textContent || ''
      : e.body || '';
    return (e.subject || '').toLowerCase().includes(q) ||
           sender.name.toLowerCase().includes(q) ||
           sender.email.toLowerCase().includes(q) ||
           bodyText.toLowerCase().includes(q);
  });

  // Group by date
  const grouped = {};
  filtered.forEach(e => {
    const group = getDateGroup(e.date);
    if (!grouped[group]) grouped[group] = [];
    grouped[group].push(e);
  });

  const unreadCount = emails.filter(e => !readIds.includes(e.id)).length;

  return (
    <div className="space-y-6" data-testid="admin-inbox">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>
            Notificaciones
            {unreadCount > 0 && <Badge className="ml-3 bg-red-500 text-white text-xs align-middle">{unreadCount} nuevo{unreadCount > 1 ? 's' : ''}</Badge>}
          </h1>
          <p className="text-sm text-slate-500 mt-1"><strong className="text-slate-800">Resoluciones o correos recibidos en tiempo real!</strong></p>
        </div>
        <Button variant="outline" className="gap-2" onClick={fetchEmails} disabled={loading} data-testid="refresh-inbox-btn">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Actualizar
        </Button>
      </div>

      {/* Search bar */}
      <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-lg px-3 py-2">
        <Search className="w-4 h-4 text-slate-400" />
        <Input
          placeholder="Buscar por nombre, DNI, NIE, RUT, pasaporte, nacionalidad, asunto..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border-0 focus-visible:ring-0 p-0 h-auto"
          data-testid="inbox-search"
        />
      </div>

      {error && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Error de conexion</p>
            <p className="text-xs text-amber-700 mt-1">{error}</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-slate-900 border-t-transparent" />
        </div>
      ) : Object.keys(grouped).length === 0 && !error ? (
        <div className="bg-white border border-slate-200 rounded-lg p-12 text-center">
          <Mail className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500">{search ? 'No se encontraron resultados' : 'No hay correos en la bandeja'}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([group, groupEmails]) => (
            <div key={group}>
              {/* Date group header */}
              <button onClick={() => toggleGroup(group)} className="flex items-center gap-2 mb-2 w-full text-left group">
                <Calendar className="w-4 h-4 text-slate-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">{group}</span>
                <span className="text-xs text-slate-400">({groupEmails.length})</span>
                <div className="flex-1 h-px bg-slate-200 ml-2" />
                {collapsedGroups[group] ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronUp className="w-4 h-4 text-slate-400" />}
              </button>

              {!collapsedGroups[group] && (
                <div className="space-y-2">
                  {groupEmails.map(e => {
                    const sender = extractName(e.from);
                    const isUnread = !readIds.includes(e.id);
                    return (
                      <div key={e.id} className={`bg-white border rounded-lg overflow-hidden transition-all ${isUnread ? 'border-sky-300 shadow-sm' : 'border-slate-200'}`}>
                        <div className="p-4 flex items-start gap-3 cursor-pointer hover:bg-slate-50" onClick={() => handleExpand(e.id)}>
                          <div className="relative shrink-0">
                            <div className={`w-10 h-10 rounded-full ${getAvatarColor(sender.email)} flex items-center justify-center`}>
                              <span className="text-xs font-bold text-white">{getInitials(sender.name)}</span>
                            </div>
                            {isUnread && <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-red-500 rounded-full border-2 border-white" />}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className={`text-sm truncate ${isUnread ? 'font-bold text-slate-900' : 'font-medium text-slate-700'}`}>{e.subject || '(Sin asunto)'}</p>
                                <p className={`text-xs truncate mt-0.5 ${isUnread ? 'font-semibold text-slate-700' : 'text-slate-500'}`}>
                                  {sender.name} <span className="text-slate-400">&lt;{sender.email}&gt;</span>
                                </p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-xs text-slate-400 whitespace-nowrap">{timeAgo(e.date)}</span>
                                {expandedEmail === e.id ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                              </div>
                            </div>
                            {expandedEmail !== e.id && (
                              <p className="text-xs text-slate-400 mt-1 line-clamp-1">
                                {e.body_type === 'html' ? new DOMParser().parseFromString(e.body || '', 'text/html').body.textContent?.substring(0, 120) : (e.body || '').substring(0, 120)}
                              </p>
                            )}
                            {e.has_attachments && (
                              <Badge className="bg-sky-100 text-sky-700 text-[10px] gap-1 mt-1"><Paperclip className="w-2.5 h-2.5" /> {e.attachments?.length} adjunto(s)</Badge>
                            )}
                          </div>
                        </div>

                        {expandedEmail === e.id && (
                          <div className="border-t border-slate-200 bg-slate-50/50">
                            <div className="px-4 py-3 border-b border-slate-100 bg-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                              <div className="text-xs text-slate-600 space-y-0.5">
                                <div><strong>De:</strong> {sender.name} &lt;{sender.email}&gt;</div>
                                <div><strong>Fecha:</strong> {formatDate(e.date)}</div>
                                <div><strong>Asunto:</strong> {e.subject}</div>
                              </div>
                              <Button variant="outline" size="sm" className="gap-1 text-xs shrink-0" onClick={(ev) => { ev.stopPropagation(); setShowForward(e.id); }} data-testid="forward-email-btn">
                                <Forward className="w-3.5 h-3.5" /> Reenviar
                              </Button>
                            </div>

                            <div className="p-4">
                              <div className="bg-white border border-slate-200 rounded-lg p-5">
                                {e.body_type === 'html' ? (
                                  <div className="prose prose-sm max-w-none text-slate-700" dangerouslySetInnerHTML={{ __html: e.body }} />
                                ) : (
                                  <pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">{e.body}</pre>
                                )}
                              </div>
                            </div>

                            {e.attachments?.length > 0 && (
                              <div className="px-4 pb-4">
                                <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Adjuntos ({e.attachments.length})</p>
                                <div className="space-y-1.5">
                                  {e.attachments.map((att, idx) => {
                                    const isPdf = att.content_type?.includes('pdf');
                                    const isImage = att.content_type?.startsWith('image/');
                                    return (
                                      <div key={idx} className={`flex items-center justify-between bg-white border rounded-lg p-3 ${isPdf ? 'border-red-200' : 'border-slate-200'}`}>
                                        <div className="flex items-center gap-2.5 min-w-0">
                                          {isPdf ? <FileText className="w-5 h-5 text-red-500 shrink-0" /> : <Paperclip className="w-4 h-4 text-slate-400 shrink-0" />}
                                          <div className="min-w-0">
                                            <p className="text-sm font-medium text-slate-800 truncate">{att.filename}</p>
                                            <p className="text-xs text-slate-400">{att.content_type} {att.size ? `- ${formatSize(att.size)}` : ''}</p>
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                          {(isPdf || isImage) && (
                                            <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => handlePreviewAttachment(e.id, att.id, att.content_type)}>
                                              <Eye className="w-3.5 h-3.5" /> Ver
                                            </Button>
                                          )}
                                          <Button variant="ghost" size="sm" onClick={() => handleDownloadAttachment(e.id, att.id, att.filename)}>
                                            <Download className="w-4 h-4 text-slate-500" />
                                          </Button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Forward Dialog */}
      <Dialog open={!!showForward} onOpenChange={() => { setShowForward(null); setForwardTo(''); setForwardNote(''); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Reenviar correo</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Destinatario</label>
              <Select value={forwardTo} onValueChange={setForwardTo}>
                <SelectTrigger data-testid="forward-recipient-select"><SelectValue placeholder="Seleccionar destinatario..." /></SelectTrigger>
                <SelectContent>
                  {recipients.filter(r => r.type === 'staff').length > 0 && (
                    <>
                      <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Equipo</div>
                      {recipients.filter(r => r.type === 'staff').map(r => (
                        <SelectItem key={r.id} value={r.id}>{r.name} - {r.email}</SelectItem>
                      ))}
                    </>
                  )}
                  {recipients.filter(r => r.type === 'client').length > 0 && (
                    <>
                      <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-1">Clientes</div>
                      {recipients.filter(r => r.type === 'client').map(r => (
                        <SelectItem key={r.id} value={r.id}>{r.name} - {r.email}</SelectItem>
                      ))}
                    </>
                  )}
                  {recipients.filter(r => r.type === 'company').length > 0 && (
                    <>
                      <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-1">Empresas</div>
                      {recipients.filter(r => r.type === 'company').map(r => (
                        <SelectItem key={r.id} value={r.id}>{r.name} ({r.cif_nif}) - {r.email}</SelectItem>
                      ))}
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Nota (opcional)</label>
              <Textarea placeholder="Agregar una nota al reenvio..." value={forwardNote} onChange={e => setForwardNote(e.target.value)} />
            </div>
            <Button onClick={handleForward} disabled={!forwardTo || forwarding} className="w-full bg-slate-900 hover:bg-slate-800" data-testid="confirm-forward-btn">
              {forwarding ? 'Enviando...' : 'Reenviar correo'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* PDF/Image Preview Modal */}
      {previewUrl && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => { window.URL.revokeObjectURL(previewUrl.url); setPreviewUrl(null); }}>
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
              <p className="text-sm font-semibold text-slate-800">Previsualizacion</p>
              <button onClick={() => { window.URL.revokeObjectURL(previewUrl.url); setPreviewUrl(null); }} className="text-sm text-slate-500 hover:text-slate-700">Cerrar</button>
            </div>
            <div className="p-4 h-[80vh]">
              {previewUrl.type?.includes('pdf') ? (
                <iframe src={previewUrl.url} className="w-full h-full rounded-lg border border-slate-200" title="PDF Preview" />
              ) : (
                <img src={previewUrl.url} alt="Preview" className="max-w-full max-h-full mx-auto object-contain" />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
