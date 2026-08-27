import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Plus, Search, DollarSign, TrendingUp, Clock, AlertTriangle, CheckCircle2,
  ChevronDown, ChevronUp, CreditCard, Trash2, Building2, User, Receipt
} from 'lucide-react';

const STATUS_MAP = {
  pendiente: { label: 'Pendiente', color: 'bg-amber-100 text-amber-800 border-amber-200', dot: 'bg-amber-500' },
  parcial: { label: 'Pago parcial', color: 'bg-blue-100 text-blue-800 border-blue-200', dot: 'bg-blue-500' },
  pagado: { label: 'Pagado', color: 'bg-emerald-100 text-emerald-800 border-emerald-200', dot: 'bg-emerald-500' },
  vencido: { label: 'Vencido', color: 'bg-red-100 text-red-800 border-red-200', dot: 'bg-red-500' },
};

function fmt(n) { return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n || 0); }
function formatDate(iso) {
  if (!iso) return '-';
  try { return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return '-'; }
}

export default function AdminContabilidad() {
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState({});
  const [clients, setClients] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showPayment, setShowPayment] = useState(null);
  const [expandedRecord, setExpandedRecord] = useState(null);
  const [recordDetail, setRecordDetail] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [form, setForm] = useState({ client_type: '', client_id: '', tramite_name: '', description: '', amount: 0, extra_per_worker: 0, worker_count: 0, notes: '', due_date: '' });
  const [payForm, setPayForm] = useState({ amount: 0, method: '', reference: '', notes: '' });

  const fetchRecords = useCallback(async () => {
    try { const res = await api.get('/billing'); setRecords(res.data); } catch {}
  }, []);
  const fetchSummary = useCallback(async () => {
    try { const res = await api.get('/billing/summary'); setSummary(res.data); } catch {}
  }, []);
  const fetchClients = useCallback(async () => {
    try { const res = await api.get('/clients'); setClients(res.data); } catch {}
  }, []);
  const fetchCompanies = useCallback(async () => {
    try { const res = await api.get('/companies'); setCompanies(res.data); } catch {}
  }, []);

  useEffect(() => { fetchRecords(); fetchSummary(); fetchClients(); fetchCompanies(); }, [fetchRecords, fetchSummary, fetchClients, fetchCompanies]);

  const handleCreate = async () => {
    if (!form.client_type || !form.client_id || !form.tramite_name) { toast.error('Tipo, cliente y tramite son obligatorios'); return; }
    try {
      await api.post('/billing', form);
      setForm({ client_type: '', client_id: '', tramite_name: '', description: '', amount: 0, extra_per_worker: 0, worker_count: 0, notes: '', due_date: '' });
      setShowCreate(false);
      fetchRecords(); fetchSummary();
      toast.success('Registro de cobro creado');
    } catch (err) { toast.error(err.response?.data?.detail || 'Error'); }
  };

  const handlePayment = async () => {
    if (!showPayment || payForm.amount <= 0) { toast.error('Monto invalido'); return; }
    try {
      await api.post(`/billing/${showPayment}/payments`, payForm);
      setShowPayment(null);
      setPayForm({ amount: 0, method: '', reference: '', notes: '' });
      fetchRecords(); fetchSummary();
      if (expandedRecord) { const res = await api.get(`/billing/${expandedRecord}`); setRecordDetail(res.data); }
      toast.success('Pago registrado');
    } catch (err) { toast.error(err.response?.data?.detail || 'Error'); }
  };

  const handleStatusChange = async (id, status) => {
    try { await api.put(`/billing/${id}`, { status }); fetchRecords(); fetchSummary(); } catch {}
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Eliminar registro?')) return;
    try { await api.delete(`/billing/${id}`); fetchRecords(); fetchSummary(); setExpandedRecord(null); toast.success('Eliminado'); } catch {}
  };

  const toggleExpand = async (id) => {
    if (expandedRecord === id) { setExpandedRecord(null); setRecordDetail(null); return; }
    setExpandedRecord(id);
    try { const res = await api.get(`/billing/${id}`); setRecordDetail(res.data); } catch {}
  };

  const filtered = records.filter(r => {
    const matchSearch = !search || r.client_name.toLowerCase().includes(search.toLowerCase()) || r.tramite_name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = !statusFilter || r.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const clientOptions = form.client_type === 'client' ? clients : form.client_type === 'company' ? companies : [];

  return (
    <div className="space-y-8" data-testid="admin-contabilidad">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500 mb-1">Finanzas</p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>Contabilidad</h1>
        </div>
        <Button onClick={() => setShowCreate(true)} className="bg-slate-900 hover:bg-slate-800 gap-2 h-11 px-5 rounded-lg" data-testid="create-billing-btn">
          <Plus className="w-4 h-4" /> Nuevo cobro
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        {[
          { label: 'Total facturado', value: fmt(summary.total_facturado), icon: Receipt, iconColor: 'text-slate-500', bgIcon: 'bg-slate-50' },
          { label: 'Total cobrado', value: fmt(summary.total_cobrado), icon: TrendingUp, iconColor: 'text-emerald-500', bgIcon: 'bg-emerald-50' },
          { label: 'Pendiente de cobro', value: fmt(summary.total_pendiente), icon: Clock, iconColor: 'text-amber-500', bgIcon: 'bg-amber-50' },
          { label: 'Vencidos', value: summary.count_overdue || 0, icon: AlertTriangle, iconColor: 'text-red-500', bgIcon: 'bg-red-50' },
        ].map(st => (
          <div key={st.label} className="bg-white border border-slate-200 rounded-xl p-5 flex items-center justify-between">
            <div>
              <p className="text-2xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>{st.value}</p>
              <p className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500 mt-1">{st.label}</p>
            </div>
            <div className={`w-11 h-11 rounded-xl ${st.bgIcon} flex items-center justify-center`}>
              <st.icon className={`w-5 h-5 ${st.iconColor}`} strokeWidth={1.5} />
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 flex-1">
          <Search className="w-4 h-4 text-slate-400" />
          <Input placeholder="Buscar por cliente o tramite..." value={search} onChange={e => setSearch(e.target.value)} className="border-0 focus-visible:ring-0 p-0 h-9 text-sm" />
        </div>
        <div className="flex gap-1 bg-white border border-slate-200 rounded-lg p-1">
          {[{ v: '', l: 'Todos' }, { v: 'pendiente', l: 'Pendientes' }, { v: 'parcial', l: 'Parciales' }, { v: 'pagado', l: 'Pagados' }, { v: 'vencido', l: 'Vencidos' }].map(f => (
            <button key={f.v} onClick={() => setStatusFilter(f.v)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${statusFilter === f.v ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
              {f.l}
            </button>
          ))}
        </div>
      </div>

      {/* Records List */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-16 text-center">
          <DollarSign className="w-12 h-12 text-slate-200 mx-auto mb-4" strokeWidth={1} />
          <p className="text-sm text-slate-500">No hay registros de cobro</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
          {filtered.map(r => {
            const st = STATUS_MAP[r.status] || STATUS_MAP.pendiente;
            const isExpanded = expandedRecord === r.id;
            return (
              <div key={r.id}>
                <div className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-slate-50/80" onClick={() => toggleExpand(r.id)}>
                  <div className={`w-2.5 h-2.5 rounded-full ${st.dot} shrink-0`} />
                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                    {r.client_type === 'company' ? <Building2 className="w-4 h-4 text-slate-500" /> : <User className="w-4 h-4 text-slate-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{r.client_name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{r.tramite_name} {r.client_type === 'company' ? '(Empresa)' : '(Cliente)'}</p>
                  </div>
                  <div className="hidden sm:block text-right shrink-0">
                    <p className="text-sm font-semibold text-slate-900">{fmt(r.total)}</p>
                    <p className="text-xs text-slate-500">Cobrado: {fmt(r.paid)}</p>
                  </div>
                  <Badge className={`text-[10px] font-bold ${st.color} border-0 shrink-0`}>{st.label}</Badge>
                  <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => { setShowPayment(r.id); setPayForm({ amount: r.balance, method: '', reference: '', notes: '' }); }}>
                      <CreditCard className="w-3 h-3" /> Pago
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleDelete(r.id)}><Trash2 className="w-3.5 h-3.5 text-red-400" /></Button>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                </div>

                {isExpanded && recordDetail && (
                  <div className="px-5 pb-5 pt-2 border-t border-slate-100 bg-slate-50/80">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                      <div className="bg-white border border-slate-200 rounded-lg p-3">
                        <p className="text-xs text-slate-500 uppercase tracking-wider mb-0.5">Precio base</p>
                        <p className="text-sm font-semibold text-slate-900">{fmt(recordDetail.amount)}</p>
                      </div>
                      <div className="bg-white border border-slate-200 rounded-lg p-3">
                        <p className="text-xs text-slate-500 uppercase tracking-wider mb-0.5">Extra/trabajador</p>
                        <p className="text-sm font-semibold text-slate-900">{fmt(recordDetail.extra_per_worker)} x {recordDetail.worker_count}</p>
                      </div>
                      <div className="bg-white border border-slate-200 rounded-lg p-3">
                        <p className="text-xs text-slate-500 uppercase tracking-wider mb-0.5">Total</p>
                        <p className="text-lg font-bold text-slate-900">{fmt(recordDetail.total)}</p>
                      </div>
                      <div className="bg-white border border-slate-200 rounded-lg p-3">
                        <p className="text-xs text-slate-500 uppercase tracking-wider mb-0.5">Pendiente</p>
                        <p className={`text-lg font-bold ${recordDetail.balance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{fmt(recordDetail.balance)}</p>
                      </div>
                    </div>
                    {recordDetail.description && <p className="text-sm text-slate-600 mb-3">{recordDetail.description}</p>}
                    {recordDetail.notes && <p className="text-xs text-slate-500 mb-3">Notas: {recordDetail.notes}</p>}
                    {recordDetail.due_date && <p className="text-xs text-slate-500 mb-3">Vencimiento: {recordDetail.due_date}</p>}

                    {/* Payments history */}
                    <p className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500 mb-2">Historial de pagos ({recordDetail.payments?.length || 0})</p>
                    {recordDetail.payments?.length > 0 ? (
                      <div className="space-y-2">
                        {recordDetail.payments.map(p => (
                          <div key={p.id} className="flex items-center justify-between bg-white border border-slate-200 rounded-lg p-3">
                            <div>
                              <p className="text-sm font-semibold text-emerald-700">{fmt(p.amount)}</p>
                              <p className="text-xs text-slate-500">{p.method && `${p.method} | `}{p.reference && `Ref: ${p.reference} | `}{formatDate(p.date)}</p>
                              {p.notes && <p className="text-xs text-slate-400 mt-0.5">{p.notes}</p>}
                            </div>
                            <p className="text-xs text-slate-400">{p.recorded_by}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400">Sin pagos registrados</p>
                    )}

                    <div className="flex items-center gap-2 mt-3">
                      <Select value={recordDetail.status} onValueChange={v => handleStatusChange(recordDetail.id, v)}>
                        <SelectTrigger className="w-40 h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(STATUS_MAP).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create Billing Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md rounded-xl">
          <DialogHeader>
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500">Nuevo</p>
            <DialogTitle className="text-xl font-semibold tracking-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>Registro de cobro</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <Select value={form.client_type} onValueChange={v => setForm({...form, client_type: v, client_id: ''})}>
              <SelectTrigger><SelectValue placeholder="Tipo de cliente" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="client">Cliente individual</SelectItem>
                <SelectItem value="company">Empresa</SelectItem>
              </SelectContent>
            </Select>
            {form.client_type && (
              <Select value={form.client_id} onValueChange={v => setForm({...form, client_id: v})}>
                <SelectTrigger data-testid="billing-client-select"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>
                  {clientOptions.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name} {c.cif_nif ? `(${c.cif_nif})` : ''} {c.email ? `- ${c.email}` : ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Input placeholder="Nombre del tramite/servicio *" value={form.tramite_name} onChange={e => setForm({...form, tramite_name: e.target.value})} data-testid="billing-tramite-input" />
            <Input placeholder="Descripcion" value={form.description} onChange={e => setForm({...form, description: e.target.value})} />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Precio base</label>
                <Input type="number" step="0.01" value={form.amount || ''} onChange={e => setForm({...form, amount: parseFloat(e.target.value) || 0})} placeholder="0.00" data-testid="billing-amount" />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Extra/trabajador</label>
                <Input type="number" step="0.01" value={form.extra_per_worker || ''} onChange={e => setForm({...form, extra_per_worker: parseFloat(e.target.value) || 0})} placeholder="0.00" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Num. trabajadores</label>
                <Input type="number" value={form.worker_count || ''} onChange={e => setForm({...form, worker_count: parseInt(e.target.value) || 0})} placeholder="0" />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Fecha vencimiento</label>
                <Input type="date" value={form.due_date} onChange={e => setForm({...form, due_date: e.target.value})} />
              </div>
            </div>
            {(form.amount > 0 || form.extra_per_worker > 0) && (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-center">
                <p className="text-xs text-slate-500">Total a cobrar</p>
                <p className="text-xl font-bold text-slate-900">{fmt(form.amount + (form.extra_per_worker * form.worker_count))}</p>
              </div>
            )}
            <Textarea placeholder="Notas" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} />
            <Button onClick={handleCreate} className="w-full h-11 bg-slate-900 hover:bg-slate-800 rounded-lg" data-testid="submit-billing-btn">Crear registro</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={!!showPayment} onOpenChange={() => setShowPayment(null)}>
        <DialogContent className="max-w-sm rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">Registrar pago</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Monto del pago *</label>
              <Input type="number" step="0.01" value={payForm.amount || ''} onChange={e => setPayForm({...payForm, amount: parseFloat(e.target.value) || 0})} data-testid="payment-amount" />
            </div>
            <Select value={payForm.method} onValueChange={v => setPayForm({...payForm, method: v})}>
              <SelectTrigger><SelectValue placeholder="Metodo de pago" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="transferencia">Transferencia</SelectItem>
                <SelectItem value="efectivo">Efectivo</SelectItem>
                <SelectItem value="tarjeta">Tarjeta</SelectItem>
                <SelectItem value="bizum">Bizum</SelectItem>
                <SelectItem value="otro">Otro</SelectItem>
              </SelectContent>
            </Select>
            <Input placeholder="Referencia (opcional)" value={payForm.reference} onChange={e => setPayForm({...payForm, reference: e.target.value})} />
            <Input placeholder="Nota (opcional)" value={payForm.notes} onChange={e => setPayForm({...payForm, notes: e.target.value})} />
            <Button onClick={handlePayment} className="w-full bg-emerald-600 hover:bg-emerald-700" data-testid="submit-payment-btn">Registrar pago</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
