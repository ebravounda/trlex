import { useState, useEffect, useCallback, useRef } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Send, Mail, Users, Search, X } from 'lucide-react';

export default function AdminEmail() {
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef(null);

  const fetchClients = useCallback(async () => {
    try {
      const res = await api.get('/clients');
      setClients(res.data);
    } catch { toast.error('Error cargando clientes'); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchClients(); }, [fetchClients]);

  useEffect(() => {
    const handleClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setShowDropdown(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleSend = async () => {
    if (!selectedClient) { toast.error('Selecciona un cliente'); return; }
    if (!message.trim()) { toast.error('Escribe un mensaje'); return; }
    setSending(true);
    try {
      await api.post(`/clients/${selectedClient.id}/email`, { message: message.trim() });
      toast.success('Email enviado correctamente');
      setMessage('');
      setSelectedClient(null);
      setSearchTerm('');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error enviando email');
    }
    setSending(false);
  };

  const filteredClients = clients.filter(c => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return (c.name || '').toLowerCase().includes(q) ||
           (c.email || '').toLowerCase().includes(q) ||
           (c.nie || '').toLowerCase().includes(q) ||
           (c.passport || '').toLowerCase().includes(q) ||
           (c.phone || '').toLowerCase().includes(q);
  });

  const handleSelectClient = (client) => {
    setSelectedClient(client);
    setSearchTerm(client.name);
    setShowDropdown(false);
  };

  const handleClearClient = () => {
    setSelectedClient(null);
    setSearchTerm('');
  };

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
              <h2 className="text-base font-semibold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>Nuevo correo</h2>
              <p className="text-xs text-slate-500">Asunto: "Nueva notificacion de Tramilex"</p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Client autocomplete */}
          <div ref={dropdownRef} className="relative">
            <Label className="text-slate-700 text-sm font-medium flex items-center gap-2">
              <Users className="w-3.5 h-3.5 text-slate-400" /> Destinatario *
            </Label>
            {loading ? (
              <div className="mt-1.5 h-10 bg-slate-50 rounded-md animate-pulse" />
            ) : (
              <div className="relative mt-1.5">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  value={searchTerm}
                  onChange={e => {
                    setSearchTerm(e.target.value);
                    setShowDropdown(true);
                    if (!e.target.value.trim()) setSelectedClient(null);
                  }}
                  onFocus={() => setShowDropdown(true)}
                  placeholder="Escribe el nombre del cliente..."
                  className="pl-9 pr-8 h-10 bg-white border-slate-300"
                  data-testid="email-client-search"
                />
                {searchTerm && (
                  <button onClick={handleClearClient} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <X className="w-4 h-4" />
                  </button>
                )}

                {/* Dropdown */}
                {showDropdown && !selectedClient && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-20 max-h-60 overflow-y-auto">
                    {filteredClients.length === 0 ? (
                      <p className="px-4 py-3 text-sm text-slate-400">No se encontraron clientes</p>
                    ) : (
                      filteredClients.slice(0, 15).map(c => (
                        <button
                          key={c.id}
                          onClick={() => handleSelectClient(c)}
                          className="w-full px-4 py-2.5 text-left hover:bg-slate-50 flex items-center gap-3 border-b border-slate-50 last:border-0"
                          data-testid={`client-option-${c.id}`}
                        >
                          <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                            <span className="text-xs font-bold text-slate-600">{(c.name || '?').charAt(0).toUpperCase()}</span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-800 truncate">{c.name}</p>
                            <p className="text-xs text-slate-500 truncate">{c.email} {c.nie && `| NIE: ${c.nie}`}</p>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}

            {selectedClient && (
              <div className="mt-2 p-2.5 bg-slate-50 rounded-md border border-slate-200">
                <div className="flex items-center gap-4 text-xs text-slate-500">
                  <span>Email: <span className="font-medium text-slate-700">{selectedClient.email}</span></span>
                  {selectedClient.phone && <span>Tel: <span className="font-medium text-slate-700">{selectedClient.phone}</span></span>}
                  {selectedClient.tramite_type && <span>Tramite: <span className="font-medium text-slate-700">{selectedClient.tramite_type}</span></span>}
                </div>
              </div>
            )}
          </div>

          {/* Subject */}
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
            <Button className="h-10 bg-slate-900 hover:bg-slate-800 text-white rounded-md font-medium gap-2" onClick={handleSend} disabled={sending} data-testid="send-email-btn">
              <Send className="w-4 h-4" /> {sending ? 'Enviando...' : 'Enviar correo'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
