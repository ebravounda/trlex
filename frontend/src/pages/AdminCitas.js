import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Calendar, Clock, MapPin, Search, User, Phone, Mail, FileText, Globe,
  CheckCircle2, XCircle, Trash2, ChevronDown, Eye, Link2, Copy, Ban,
  Loader2, Settings2
} from 'lucide-react';

const STATUS_MAP = {
  pending_payment: { label: 'Pago pendiente', color: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500' },
  confirmed: { label: 'Confirmada', color: 'bg-emerald-100 text-emerald-800', dot: 'bg-emerald-500' },
  expired: { label: 'Expirada', color: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
  cancelled: { label: 'Cancelada', color: 'bg-red-100 text-red-800', dot: 'bg-red-500' },
};

function formatDate(iso) {
  if (!iso) return '-';
  try {
    const d = new Date(iso + (iso.includes('T') ? '' : 'T00:00:00'));
    return d.toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return iso; }
}

export default function AdminCitas() {
  const [appointments, setAppointments] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [config, setConfig] = useState(null);
  const [blockedInput, setBlockedInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const fetchAppointments = useCallback(async () => {
    try {
      const res = await api.get('/citas');
      setAppointments(res.data);
    } catch {}
    setLoading(false);
  }, []);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await api.get('/citas/config');
      setConfig(res.data);
    } catch {}
  }, []);

  useEffect(() => { fetchAppointments(); fetchConfig(); }, [fetchAppointments, fetchConfig]);

  const handleReview = async (id) => {
    try { await api.put(`/citas/${id}/review`); fetchAppointments(); } catch {}
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Eliminar esta cita?')) return;
    try { await api.delete(`/citas/${id}`); fetchAppointments(); toast.success('Cita eliminada'); } catch {}
  };

  const handleSaveSettings = async () => {
    if (!config) return;
    try {
      await api.put('/citas/config', {
        blocked_dates: config.blocked_dates || [],
        start_hour: config.start_hour || 9,
        end_hour: config.end_hour || 18,
        slot_duration: config.slot_duration || 45,
        price_amount: config.price_amount || 5000,
        price_currency: config.price_currency || 'eur',
      });
      toast.success('Configuracion guardada');
      setShowSettings(false);
    } catch { toast.error('Error guardando configuracion'); }
  };

  const addBlockedDate = () => {
    if (!blockedInput || !config) return;
    if (config.blocked_dates.includes(blockedInput)) { toast.error('Fecha ya bloqueada'); return; }
    setConfig({ ...config, blocked_dates: [...config.blocked_dates, blockedInput].sort() });
    setBlockedInput('');
  };

  const removeBlockedDate = (date) => {
    if (!config) return;
    setConfig({ ...config, blocked_dates: config.blocked_dates.filter(d => d !== date) });
  };

  const bookingUrl = `${window.location.origin}/citas/reservar`;

  const copyLink = () => {
    navigator.clipboard.writeText(bookingUrl);
    setCopied(true);
    toast.success('Enlace copiado!');
    setTimeout(() => setCopied(false), 2000);
  };

  const filtered = appointments.filter(a => {
    const matchSearch = !search ||
      `${a.first_name} ${a.last_name}`.toLowerCase().includes(search.toLowerCase()) ||
      a.email.toLowerCase().includes(search.toLowerCase()) ||
      a.phone.includes(search);
    const matchStatus = !statusFilter || a.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const confirmedCount = appointments.filter(a => a.status === 'confirmed').length;
  const pendingCount = appointments.filter(a => a.status === 'pending_payment').length;

  return (
    <div className="space-y-8" data-testid="admin-citas">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500 mb-1">Agenda</p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>Citas</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={copyLink} className="gap-2 text-sm h-10" data-testid="copy-booking-link">
            {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Link2 className="w-4 h-4" />}
            {copied ? 'Copiado!' : 'Copiar enlace'}
          </Button>
          <Button variant="outline" onClick={() => setShowSettings(true)} className="gap-2 h-10" data-testid="citas-settings-btn">
            <Settings2 className="w-4 h-4" /> Configuracion
          </Button>
        </div>
      </div>

      {/* Booking link display */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center gap-3">
        <Link2 className="w-5 h-5 text-blue-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-blue-700 mb-0.5">Enlace para compartir con clientes</p>
          <p className="text-sm text-blue-600 font-mono truncate">{bookingUrl}</p>
        </div>
        <Button size="sm" variant="outline" onClick={copyLink} className="shrink-0 text-xs border-blue-300 text-blue-700 hover:bg-blue-100">
          <Copy className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total citas', value: appointments.length, icon: Calendar, bgIcon: 'bg-slate-50', iconColor: 'text-slate-500' },
          { label: 'Confirmadas', value: confirmedCount, icon: CheckCircle2, bgIcon: 'bg-emerald-50', iconColor: 'text-emerald-500' },
          { label: 'Pago pendiente', value: pendingCount, icon: Clock, bgIcon: 'bg-amber-50', iconColor: 'text-amber-500' },
          { label: 'Hoy', value: appointments.filter(a => a.date === new Date().toISOString().split('T')[0] && a.status === 'confirmed').length, icon: Calendar, bgIcon: 'bg-blue-50', iconColor: 'text-blue-500' },
        ].map(st => (
          <div key={st.label} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between">
            <div>
              <p className="text-2xl font-semibold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>{st.value}</p>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500 mt-0.5">{st.label}</p>
            </div>
            <div className={`w-10 h-10 rounded-xl ${st.bgIcon} flex items-center justify-center`}>
              <st.icon className={`w-5 h-5 ${st.iconColor}`} strokeWidth={1.5} />
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 flex-1">
          <Search className="w-4 h-4 text-slate-400" />
          <Input placeholder="Buscar por nombre, email o telefono..." value={search} onChange={e => setSearch(e.target.value)} className="border-0 focus-visible:ring-0 p-0 h-9 text-sm" data-testid="citas-search" />
        </div>
        <div className="flex gap-1 bg-white border border-slate-200 rounded-lg p-1">
          {[{ v: '', l: 'Todas' }, { v: 'confirmed', l: 'Confirmadas' }, { v: 'pending_payment', l: 'Pendientes' }, { v: 'expired', l: 'Expiradas' }].map(f => (
            <button key={f.v} onClick={() => setStatusFilter(f.v)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                statusFilter === f.v ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}>{f.l}</button>
          ))}
        </div>
      </div>

      {/* Appointments List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-16 text-center">
          <Calendar className="w-12 h-12 text-slate-200 mx-auto mb-4" strokeWidth={1} />
          <p className="text-sm text-slate-500">No hay citas registradas</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
          {filtered.map(a => {
            const st = STATUS_MAP[a.status] || STATUS_MAP.pending_payment;
            const isExpanded = expandedId === a.id;
            return (
              <div key={a.id} data-testid={`appointment-${a.id}`}>
                <div className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-slate-50/80" onClick={() => setExpandedId(isExpanded ? null : a.id)}>
                  <div className={`w-2.5 h-2.5 rounded-full ${st.dot} shrink-0`} />
                  <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                    <User className="w-4 h-4 text-slate-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900">{a.first_name} {a.last_name}</p>
                    <p className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {formatDate(a.date)}</span>
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {a.time}</span>
                      <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {a.office}</span>
                    </p>
                  </div>
                  <Badge className={`text-[10px] font-bold ${st.color} border-0 shrink-0`}>{st.label}</Badge>
                  <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                    {a.status === 'confirmed' && (
                      <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => handleReview(a.id)} title="Marcar como revisada">
                        <Eye className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleDelete(a.id)}>
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                    </Button>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                </div>

                {isExpanded && (
                  <div className="px-5 pb-5 pt-2 border-t border-slate-100 bg-slate-50/80">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {[
                        { icon: Mail, label: 'Email', value: a.email },
                        { icon: Phone, label: 'Telefono', value: a.phone },
                        { icon: Globe, label: 'Pais origen', value: a.origin_country },
                        { icon: Globe, label: 'Pais residencia', value: a.residence_country },
                        { icon: MapPin, label: 'Direccion', value: a.address },
                        { icon: FileText, label: `${(a.document_type || 'doc').toUpperCase()}`, value: a.document_id },
                      ].map((item, i) => (
                        <div key={i} className="bg-white border border-slate-200 rounded-lg p-3">
                          <div className="flex items-center gap-1.5 mb-1">
                            <item.icon className="w-3 h-3 text-slate-400" />
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{item.label}</p>
                          </div>
                          <p className="text-sm text-slate-900 font-medium truncate">{item.value || '-'}</p>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center gap-3 mt-3 text-xs text-slate-400">
                      <span>Creada: {a.created_at ? new Date(a.created_at).toLocaleString('es-ES') : '-'}</span>
                      {a.confirmed_at && <span>Confirmada: {new Date(a.confirmed_at).toLocaleString('es-ES')}</span>}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Settings Dialog */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="max-w-md rounded-xl">
          <DialogHeader>
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500">Configuracion</p>
            <DialogTitle className="text-xl font-semibold tracking-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>Ajustes de citas</DialogTitle>
          </DialogHeader>
          {config && (
            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Hora inicio</label>
                  <Input type="number" min={0} max={23} value={config.start_hour} onChange={e => setConfig({...config, start_hour: parseInt(e.target.value) || 9})} />
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Hora fin</label>
                  <Input type="number" min={0} max={23} value={config.end_hour} onChange={e => setConfig({...config, end_hour: parseInt(e.target.value) || 18})} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Duracion (min)</label>
                  <Input type="number" value={config.slot_duration} onChange={e => setConfig({...config, slot_duration: parseInt(e.target.value) || 45})} />
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Precio (centimos)</label>
                  <Input type="number" value={config.price_amount} onChange={e => setConfig({...config, price_amount: parseInt(e.target.value) || 5000})} />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500 mb-2 block">Dias bloqueados</label>
                <div className="flex gap-2 mb-2">
                  <Input type="date" value={blockedInput} onChange={e => setBlockedInput(e.target.value)} className="flex-1" data-testid="block-date-input" />
                  <Button onClick={addBlockedDate} size="sm" className="bg-slate-900 hover:bg-slate-800" data-testid="add-blocked-date">
                    <Ban className="w-4 h-4" />
                  </Button>
                </div>
                {config.blocked_dates?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {config.blocked_dates.map(d => (
                      <Badge key={d} variant="outline" className="gap-1 text-xs cursor-pointer hover:bg-red-50 hover:border-red-200" onClick={() => removeBlockedDate(d)}>
                        {d} <XCircle className="w-3 h-3 text-red-400" />
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <Button onClick={handleSaveSettings} className="w-full h-11 bg-slate-900 hover:bg-slate-800 rounded-lg" data-testid="save-citas-config">
                Guardar configuracion
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
