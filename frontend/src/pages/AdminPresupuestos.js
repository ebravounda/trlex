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
  Plus, Search, FileText, Download, Trash2, ChevronDown, Eye,
  Receipt, Hash, Calendar
} from 'lucide-react';

function fmt(n) { return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n || 0); }
function formatDate(iso) {
  if (!iso) return '-';
  try { return new Date(iso.includes('T') ? iso : iso + 'T00:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return iso; }
}

export default function AdminPresupuestos() {
  const [records, setRecords] = useState([]);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [nextNumber, setNextNumber] = useState(1453);
  const [expandedId, setExpandedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [downloading, setDownloading] = useState(null);

  const [form, setForm] = useState({
    recipient_name: '', recipient_company: '', recipient_email: '',
    recipient_address: '', recipient_nif: '',
    items: [{ concept: '', quantity: 1, amount: 0 }],
    iva_rate: 21, notes: '', payment_method: 'Transferencia bancaria',
  });

  const fetchRecords = useCallback(async () => {
    try { const res = await api.get('/presupuestos'); setRecords(res.data); } catch {}
  }, []);

  const fetchNextNumber = useCallback(async () => {
    try { const res = await api.get('/presupuestos/next-number'); setNextNumber(res.data.next_number); } catch {}
  }, []);

  useEffect(() => { fetchRecords(); fetchNextNumber(); }, [fetchRecords, fetchNextNumber]);

  const addItem = () => setForm(f => ({ ...f, items: [...f.items, { concept: '', quantity: 1, amount: 0 }] }));
  const removeItem = (i) => setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }));
  const updateItem = (i, field, value) => {
    setForm(f => {
      const items = [...f.items];
      items[i] = { ...items[i], [field]: value };
      return { ...f, items };
    });
  };

  const subtotal = form.items.reduce((s, it) => s + (it.amount || 0) * (it.quantity || 1), 0);
  const ivaAmount = subtotal * ((form.iva_rate || 0) / 100);
  const total = subtotal + ivaAmount;

  const handleCreate = async () => {
    if (!form.recipient_name) { toast.error('Nombre del destinatario obligatorio'); return; }
    if (form.items.every(it => !it.concept)) { toast.error('Agregue al menos un concepto'); return; }
    try {
      await api.post('/presupuestos', form);
      setForm({ recipient_name: '', recipient_company: '', recipient_email: '', recipient_address: '', recipient_nif: '', items: [{ concept: '', quantity: 1, amount: 0 }], iva_rate: 21, notes: '', payment_method: 'Transferencia bancaria' });
      setShowCreate(false);
      fetchRecords(); fetchNextNumber();
      toast.success('Presupuesto creado');
    } catch (err) { toast.error(err.response?.data?.detail || 'Error'); }
  };

  const handleDownloadPDF = async (id, number) => {
    setDownloading(id);
    try {
      const res = await api.get(`/presupuestos/${id}/pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Presupuesto_${number}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch { toast.error('Error descargando PDF'); }
    setDownloading(null);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Eliminar presupuesto?')) return;
    try { await api.delete(`/presupuestos/${id}`); fetchRecords(); toast.success('Eliminado'); } catch {}
  };

  const toggleExpand = async (id) => {
    if (expandedId === id) { setExpandedId(null); setDetail(null); return; }
    setExpandedId(id);
    try { const res = await api.get(`/presupuestos/${id}`); setDetail(res.data); } catch {}
  };

  const filtered = records.filter(r =>
    !search || r.recipient_name.toLowerCase().includes(search.toLowerCase()) ||
    r.recipient_company.toLowerCase().includes(search.toLowerCase()) ||
    String(r.number).includes(search)
  );

  return (
    <div className="space-y-8" data-testid="admin-presupuestos">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500 mb-1">Documentos</p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>Creador de Presupuestos</h1>
        </div>
        <Button onClick={() => setShowCreate(true)} className="bg-slate-900 hover:bg-slate-800 gap-2 h-11 px-5 rounded-lg" data-testid="create-presupuesto-btn">
          <Plus className="w-4 h-4" /> Nuevo presupuesto (N.{nextNumber})
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 stagger-children">
        {[
          { label: 'Total emitidos', value: records.length, icon: FileText, bg: 'bg-slate-50', ic: 'text-slate-500' },
          { label: 'Valor total', value: fmt(records.reduce((s, r) => s + r.total, 0)), icon: Receipt, bg: 'bg-emerald-50', ic: 'text-emerald-500' },
          { label: 'Ultimo N.', value: records[0]?.number || '-', icon: Hash, bg: 'bg-blue-50', ic: 'text-blue-500' },
        ].map(st => (
          <div key={st.label} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between hover-lift animate-fade-in-up">
            <div>
              <p className="text-2xl font-semibold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>{st.value}</p>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500 mt-0.5">{st.label}</p>
            </div>
            <div className={`w-10 h-10 rounded-xl ${st.bg} flex items-center justify-center`}>
              <st.icon className={`w-5 h-5 ${st.ic}`} strokeWidth={1.5} />
            </div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3">
        <Search className="w-4 h-4 text-slate-400" />
        <Input placeholder="Buscar por nombre, empresa o numero..." value={search} onChange={e => setSearch(e.target.value)} className="border-0 focus-visible:ring-0 p-0 h-9 text-sm" data-testid="presupuesto-search" />
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-16 text-center">
          <FileText className="w-12 h-12 text-slate-200 mx-auto mb-4" strokeWidth={1} />
          <p className="text-sm text-slate-500">No hay presupuestos</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
          {filtered.map(r => {
            const isExp = expandedId === r.id;
            return (
              <div key={r.id} data-testid={`presupuesto-${r.number}`}>
                <div className="flex items-center gap-3 px-5 py-4 cursor-pointer row-glow" onClick={() => toggleExpand(r.id)}>
                  <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                    <Hash className="w-4 h-4 text-slate-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900">N. {r.number} - {r.recipient_name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{r.recipient_company} | {formatDate(r.created_at)} | Valido hasta {formatDate(r.valid_until)}</p>
                  </div>
                  <div className="text-right shrink-0 hidden sm:block">
                    <p className="text-sm font-semibold text-slate-900">{fmt(r.total)}</p>
                    <p className="text-xs text-slate-500">IVA {r.iva_rate}%</p>
                  </div>
                  <Badge className="bg-emerald-100 text-emerald-800 border-0 text-[10px] font-bold shrink-0">{r.status}</Badge>
                  <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => handleDownloadPDF(r.id, r.number)} disabled={downloading === r.id} data-testid={`download-pdf-${r.number}`}>
                      <Download className="w-3 h-3" /> PDF
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleDelete(r.id)}>
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                    </Button>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isExp ? 'rotate-180' : ''}`} />
                </div>

                {isExp && detail && (
                  <div className="px-5 pb-5 pt-2 border-t border-slate-100 bg-slate-50/80">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                      <div className="bg-white border border-slate-200 rounded-lg p-3">
                        <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-0.5">Destinatario</p>
                        <p className="text-sm font-medium text-slate-900">{detail.recipient_name}</p>
                        {detail.recipient_company && <p className="text-xs text-slate-500">{detail.recipient_company}</p>}
                      </div>
                      <div className="bg-white border border-slate-200 rounded-lg p-3">
                        <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-0.5">Subtotal</p>
                        <p className="text-sm font-semibold text-slate-900">{fmt(detail.subtotal)}</p>
                      </div>
                      <div className="bg-white border border-slate-200 rounded-lg p-3">
                        <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-0.5">IVA ({detail.iva_rate}%)</p>
                        <p className="text-sm font-semibold text-slate-900">{fmt(detail.iva_amount)}</p>
                      </div>
                      <div className="bg-white border border-slate-200 rounded-lg p-3">
                        <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-0.5">Total</p>
                        <p className="text-lg font-bold text-slate-900">{fmt(detail.total)}</p>
                      </div>
                    </div>
                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400 mb-2">Conceptos</p>
                    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead><tr className="bg-slate-50 text-xs text-slate-500 uppercase"><th className="p-2 text-left">Concepto</th><th className="p-2 text-center">Cant.</th><th className="p-2 text-right">Precio</th><th className="p-2 text-right">Total</th></tr></thead>
                        <tbody>
                          {detail.items?.map((it, i) => (
                            <tr key={i} className="border-t border-slate-100">
                              <td className="p-2 text-slate-700">{it.concept}</td>
                              <td className="p-2 text-center text-slate-600">{it.quantity}</td>
                              <td className="p-2 text-right text-slate-600">{fmt(it.amount)}</td>
                              <td className="p-2 text-right font-medium text-slate-900">{fmt(it.amount * it.quantity)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {detail.notes && <p className="text-xs text-slate-500 mt-3">Notas: {detail.notes}</p>}
                    {detail.payment_method && <p className="text-xs text-slate-500 mt-1">Metodo de pago: {detail.payment_method}</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg rounded-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500">Nuevo</p>
            <DialogTitle className="text-xl font-semibold tracking-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>Presupuesto N. {nextNumber}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Datos del destinatario</p>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs text-slate-600 mb-1 block">Nombre *</label><Input value={form.recipient_name} onChange={e => setForm({...form, recipient_name: e.target.value})} placeholder="Juan Garcia" data-testid="presup-recipient-name" /></div>
              <div><label className="text-xs text-slate-600 mb-1 block">Empresa</label><Input value={form.recipient_company} onChange={e => setForm({...form, recipient_company: e.target.value})} placeholder="Empresa S.L." /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs text-slate-600 mb-1 block">Email</label><Input value={form.recipient_email} onChange={e => setForm({...form, recipient_email: e.target.value})} placeholder="correo@ejemplo.com" /></div>
              <div><label className="text-xs text-slate-600 mb-1 block">NIF/CIF</label><Input value={form.recipient_nif} onChange={e => setForm({...form, recipient_nif: e.target.value})} placeholder="12345678A" /></div>
            </div>
            <div><label className="text-xs text-slate-600 mb-1 block">Direccion</label><Input value={form.recipient_address} onChange={e => setForm({...form, recipient_address: e.target.value})} placeholder="Calle, numero, ciudad" /></div>

            <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400 pt-2">Conceptos</p>
            {form.items.map((item, i) => (
              <div key={i} className="flex items-end gap-2">
                <div className="flex-1"><label className="text-xs text-slate-600 mb-1 block">Concepto</label><Input value={item.concept} onChange={e => updateItem(i, 'concept', e.target.value)} placeholder="Descripcion del servicio" data-testid={`item-concept-${i}`} /></div>
                <div className="w-16"><label className="text-xs text-slate-600 mb-1 block">Cant.</label><Input type="number" min={1} value={item.quantity} onChange={e => updateItem(i, 'quantity', parseInt(e.target.value) || 1)} /></div>
                <div className="w-24"><label className="text-xs text-slate-600 mb-1 block">Precio</label><Input type="number" step="0.01" value={item.amount || ''} onChange={e => updateItem(i, 'amount', parseFloat(e.target.value) || 0)} data-testid={`item-amount-${i}`} /></div>
                {form.items.length > 1 && <Button variant="ghost" size="sm" className="h-9 w-9 p-0 text-red-400" onClick={() => removeItem(i)}><Trash2 className="w-3.5 h-3.5" /></Button>}
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addItem} className="gap-1 text-xs" data-testid="add-item-btn">
              <Plus className="w-3.5 h-3.5" /> Agregar concepto
            </Button>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-600 mb-1 block">IVA</label>
                <Select value={String(form.iva_rate)} onValueChange={v => setForm({...form, iva_rate: parseFloat(v)})}>
                  <SelectTrigger data-testid="iva-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Sin IVA (0%)</SelectItem>
                    <SelectItem value="19">IVA 19%</SelectItem>
                    <SelectItem value="21">IVA 21%</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-slate-600 mb-1 block">Metodo de pago</label>
                <Select value={form.payment_method} onValueChange={v => setForm({...form, payment_method: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Transferencia bancaria">Transferencia bancaria</SelectItem>
                    <SelectItem value="Bizum">Bizum</SelectItem>
                    <SelectItem value="Efectivo">Efectivo</SelectItem>
                    <SelectItem value="Tarjeta">Tarjeta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Totals preview */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
              <div className="flex justify-between text-sm text-slate-600 mb-1">
                <span>Subtotal</span><span>{fmt(subtotal)}</span>
              </div>
              {form.iva_rate > 0 && (
                <div className="flex justify-between text-sm text-slate-600 mb-1">
                  <span>IVA ({form.iva_rate}%)</span><span>{fmt(ivaAmount)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold text-slate-900 pt-2 border-t border-slate-200">
                <span>TOTAL</span><span>{fmt(total)}</span>
              </div>
            </div>

            <Textarea placeholder="Observaciones (opcional)" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} rows={2} />
            <Button onClick={handleCreate} className="w-full h-11 bg-slate-900 hover:bg-slate-800 rounded-lg" data-testid="submit-presupuesto-btn">
              Crear presupuesto N. {nextNumber}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
