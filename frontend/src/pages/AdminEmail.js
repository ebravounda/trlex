import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Send, Mail, Users } from 'lucide-react';

export default function AdminEmail() {
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchClients = useCallback(async () => {
    try {
      const res = await api.get('/clients');
      setClients(res.data);
    } catch (err) {
      toast.error('Error cargando clientes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchClients(); }, [fetchClients]);

  const handleSend = async () => {
    if (!selectedClient) { toast.error('Selecciona un cliente'); return; }
    if (!message.trim()) { toast.error('Escribe un mensaje'); return; }
    setSending(true);
    try {
      await api.post(`/clients/${selectedClient}/email`, { message: message.trim() });
      toast.success('Email enviado correctamente');
      setMessage('');
      setSelectedClient('');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error enviando email');
    } finally {
      setSending(false);
    }
  };

  const selectedClientData = clients.find(c => c.id === selectedClient);

  return (
    <div data-testid="admin-email-page">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>
          Enviar correo
        </h1>
        <p className="text-sm text-slate-500 mt-1">Envia un correo electronico a tus clientes</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg shadow-sm max-w-2xl">
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-sky-100 flex items-center justify-center">
              <Mail className="w-5 h-5 text-sky-600" strokeWidth={1.5} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>
                Nuevo correo
              </h2>
              <p className="text-xs text-slate-500">
                Asunto: "Nueva notificacion de Tramilex"
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Client selector */}
          <div>
            <Label className="text-slate-700 text-sm font-medium flex items-center gap-2">
              <Users className="w-3.5 h-3.5 text-slate-400" />
              Destinatario *
            </Label>
            {loading ? (
              <div className="mt-1.5 h-10 bg-slate-50 rounded-md animate-pulse" />
            ) : (
              <Select value={selectedClient} onValueChange={setSelectedClient}>
                <SelectTrigger className="mt-1.5 h-10 bg-white border-slate-300" data-testid="email-client-select">
                  <SelectValue placeholder="Seleccionar cliente" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} - {c.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {selectedClientData && (
              <div className="mt-2 p-2.5 bg-slate-50 rounded-md border border-slate-200">
                <div className="flex items-center gap-4 text-xs text-slate-500">
                  <span>Email: <span className="font-medium text-slate-700">{selectedClientData.email}</span></span>
                  {selectedClientData.phone && <span>Tel: <span className="font-medium text-slate-700">{selectedClientData.phone}</span></span>}
                  {selectedClientData.tramite_type && <span>Tramite: <span className="font-medium text-slate-700">{selectedClientData.tramite_type}</span></span>}
                </div>
              </div>
            )}
          </div>

          {/* Subject (fixed) */}
          <div>
            <Label className="text-slate-700 text-sm font-medium">Asunto</Label>
            <div className="mt-1.5 h-10 px-3 flex items-center bg-slate-50 border border-slate-200 rounded-md text-sm text-slate-600">
              Nueva notificacion de Tramilex
            </div>
          </div>

          {/* Message */}
          <div>
            <Label className="text-slate-700 text-sm font-medium">Mensaje *</Label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Escribe el mensaje para el cliente..."
              className="mt-1.5 w-full h-40 px-3 py-2 text-sm border border-slate-300 rounded-md bg-white resize-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900 outline-none"
              data-testid="email-message-textarea"
            />
          </div>

          <div className="pt-2">
            <Button
              className="h-10 bg-slate-900 hover:bg-slate-800 text-white rounded-md font-medium gap-2"
              onClick={handleSend}
              disabled={sending}
              data-testid="send-email-btn"
            >
              <Send className="w-4 h-4" />
              {sending ? 'Enviando...' : 'Enviar correo'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
