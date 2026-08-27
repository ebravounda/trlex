import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Inbox, Paperclip, RefreshCw, Mail, ChevronDown, ChevronUp, Download, AlertTriangle } from 'lucide-react';

function formatDate(dateStr) {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr.substring(0, 30);
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return dateStr.substring(0, 30); }
}

function stripHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body.textContent || '';
}

export default function AdminInbox() {
  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedEmail, setExpandedEmail] = useState(null);

  const fetchEmails = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/inbox');
      setEmails(res.data);
    } catch (err) {
      const msg = err.response?.data?.detail || 'Error conectando al servidor de correo';
      setError(msg);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchEmails(); }, [fetchEmails]);

  const handleDownloadAttachment = async (msgId, idx, filename) => {
    try {
      const res = await api.get(`/inbox/attachment/${msgId}/${idx}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch { toast.error('Error descargando adjunto'); }
  };

  return (
    <div className="space-y-6" data-testid="admin-inbox">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>Notificaciones</h1>
          <p className="text-sm text-slate-500 mt-1">Correos recibidos en notificaciones@tramilex.es</p>
        </div>
        <Button variant="outline" className="gap-2" onClick={fetchEmails} disabled={loading} data-testid="refresh-inbox-btn">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Actualizar
        </Button>
      </div>

      {error && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Error de conexion</p>
            <p className="text-xs text-amber-700 mt-1">{error}</p>
            <p className="text-xs text-amber-600 mt-2">Verifica la configuracion IMAP en el archivo .env del servidor.</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-slate-900 border-t-transparent" />
        </div>
      ) : emails.length === 0 && !error ? (
        <div className="bg-white border border-slate-200 rounded-lg p-12 text-center">
          <Inbox className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500">No hay correos en la bandeja</p>
        </div>
      ) : (
        <div className="space-y-2">
          {emails.map((e, i) => (
            <div key={e.id || i} className={`bg-white border rounded-lg overflow-hidden ${e.has_attachments ? 'border-sky-200' : 'border-slate-200'}`}>
              <div className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50" onClick={() => setExpandedEmail(expandedEmail === i ? null : i)}>
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center shrink-0 mt-0.5">
                    <Mail className="w-4 h-4 text-slate-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{e.subject || '(Sin asunto)'}</p>
                    <p className="text-xs text-slate-500 truncate mt-0.5">{e.from}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-slate-400">{formatDate(e.date)}</span>
                      {e.has_attachments && (
                        <Badge className="bg-sky-100 text-sky-700 text-[10px] gap-1"><Paperclip className="w-2.5 h-2.5" /> {e.attachments.length} adjunto(s)</Badge>
                      )}
                    </div>
                  </div>
                </div>
                {expandedEmail === i ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
              </div>

              {expandedEmail === i && (
                <div className="border-t border-slate-200 p-4 bg-slate-50/50 space-y-3">
                  <div className="bg-white border border-slate-200 rounded-lg p-4">
                    <pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">{
                      e.body?.startsWith('<') ? stripHtml(e.body) : e.body
                    }</pre>
                  </div>

                  {e.attachments?.length > 0 && (
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Adjuntos</p>
                      <div className="space-y-1">
                        {e.attachments.map((att, idx) => (
                          <div key={idx} className="flex items-center justify-between bg-white border border-slate-200 rounded-lg p-3">
                            <div className="flex items-center gap-2 min-w-0">
                              <Paperclip className="w-4 h-4 text-slate-400 shrink-0" />
                              <span className="text-sm text-slate-700 truncate">{att.filename}</span>
                              <span className="text-xs text-slate-400">{att.content_type}</span>
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => handleDownloadAttachment(e.id, idx, att.filename)}>
                              <Download className="w-4 h-4 text-slate-500" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
