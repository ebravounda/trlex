import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  LogOut, Users, Upload, Download, FileText, Image as ImageIcon, Clock,
  ChevronDown, ChevronUp, ClipboardList, Building2, Check, Tag, Plus,
  Trash2, PenLine, ShieldCheck
} from 'lucide-react';

const LOGO_URL = "https://tramilex.es/wp-content/uploads/2024/07/logo-tramilex-v3-1.jpg";

const CATEGORIES = [
  { value: "identificacion", label: "Identificacion" },
  { value: "residencia", label: "Residencia" },
  { value: "trabajo", label: "Trabajo" },
  { value: "contrato", label: "Contrato" },
  { value: "fiscal", label: "Fiscal" },
  { value: "otros", label: "Otros" },
];

const STATUS_MAP = {
  pendiente: { label: 'Pendiente', color: 'bg-amber-100 text-amber-700' },
  en_proceso: { label: 'En proceso', color: 'bg-sky-100 text-sky-700' },
  completado: { label: 'Completado', color: 'bg-emerald-100 text-emerald-700' },
  rechazado: { label: 'Rechazado', color: 'bg-red-100 text-red-700' },
};

const COUNTRIES = [
  "Alemania", "Argentina", "Bolivia", "Brasil", "Chile", "China", "Colombia",
  "Costa Rica", "Cuba", "Ecuador", "El Salvador", "Espana", "Estados Unidos",
  "Filipinas", "Francia", "Guatemala", "Honduras", "India", "Italia", "Marruecos",
  "Mexico", "Nicaragua", "Nigeria", "Pakistan", "Panama", "Paraguay", "Peru",
  "Portugal", "Reino Unido", "Republica Dominicana", "Rumania", "Rusia",
  "Senegal", "Ucrania", "Uruguay", "Venezuela"
];

function formatDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function getFileIcon(ct) {
  if (ct?.startsWith('image/')) return <ImageIcon className="w-4 h-4 text-sky-600" />;
  return <FileText className="w-4 h-4 text-red-500" />;
}

const emptyWorker = {
  name: '', last_name: '', nie: '', dni: '', passport_number: '', rut: '',
  phone: '', phone2: '', email: '', address: '', nationality: '',
  origin_country: '', residence_country: '', father_name: '', mother_name: '', children: []
};

export default function CompanyDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [workers, setWorkers] = useState([]);
  const [tramites, setTramites] = useState([]);
  const [expandedWorker, setExpandedWorker] = useState(null);
  const [workerDocs, setWorkerDocs] = useState({});
  const [uploadingFor, setUploadingFor] = useState(null);
  const [uploadCategory, setUploadCategory] = useState('otros');
  const [showAddWorker, setShowAddWorker] = useState(false);
  const [workerForm, setWorkerForm] = useState({ ...emptyWorker });
  const [saving, setSaving] = useState(false);
  const [signRequests, setSignRequests] = useState([]);
  const [uploadingSignedFor, setUploadingSignedFor] = useState(null);
  const fileInputRef = useRef(null);
  const signedInputRef = useRef(null);
  const signedUploadRef = useRef(null);
  const activeWorkerRef = useRef(null);
  const activeSignReqRef = useRef(null);

  const companyId = user?._id || user?.id;

  const fetchWorkers = useCallback(async () => {
    try {
      const res = await api.get('/company/workers');
      setWorkers(res.data);
    } catch { toast.error('Error cargando trabajadores'); }
  }, []);

  const fetchTramites = useCallback(async () => {
    try {
      const res = await api.get('/company/tramites');
      setTramites(res.data);
    } catch {}
  }, []);

  const fetchSignRequests = useCallback(async () => {
    try {
      const res = await api.get('/company/sign-requests');
      setSignRequests(res.data);
    } catch {}
  }, []);

  useEffect(() => { fetchWorkers(); fetchTramites(); fetchSignRequests(); }, [fetchWorkers, fetchTramites, fetchSignRequests]);

  const fetchWorkerDocs = async (workerId) => {
    try {
      const res = await api.get(`/companies/${companyId}/workers/${workerId}/documents`);
      setWorkerDocs(prev => ({ ...prev, [workerId]: res.data }));
    } catch {}
  };

  const toggleWorker = (workerId) => {
    if (expandedWorker === workerId) {
      setExpandedWorker(null);
    } else {
      setExpandedWorker(workerId);
      if (!workerDocs[workerId]) fetchWorkerDocs(workerId);
    }
  };

  const handleAddWorker = async () => {
    if (!workerForm.name.trim()) { toast.error('El nombre es obligatorio'); return; }
    setSaving(true);
    try {
      await api.post(`/companies/${companyId}/workers`, workerForm);
      setWorkerForm({ ...emptyWorker });
      setShowAddWorker(false);
      fetchWorkers();
      toast.success('Trabajador agregado');
    } catch (err) { toast.error(err.response?.data?.detail || 'Error agregando trabajador'); }
    setSaving(false);
  };

  const handleDeleteWorker = async (workerId, name) => {
    if (!window.confirm(`Eliminar trabajador "${name}"?`)) return;
    try {
      await api.delete(`/companies/${companyId}/workers/${workerId}`);
      fetchWorkers();
      toast.success('Trabajador eliminado');
    } catch { toast.error('Error eliminando'); }
  };

  const handleUpload = async (workerId, files, category) => {
    if (!files?.length) return;
    setUploadingFor(workerId);
    let count = 0;
    for (const file of files) {
      if (file.size > 5 * 1024 * 1024) { toast.error(`${file.name} supera 5MB`); continue; }
      const fd = new FormData();
      fd.append('file', file);
      fd.append('category', category);
      fd.append('uploaded_by', 'company');
      try {
        await api.post(`/companies/${companyId}/workers/${workerId}/documents/upload`, fd);
        count++;
      } catch { toast.error(`Error subiendo ${file.name}`); }
    }
    if (count > 0) { toast.success(`${count} documento(s) subido(s)`); fetchWorkerDocs(workerId); fetchWorkers(); }
    setUploadingFor(null);
  };

  const handleDownloadDoc = async (doc) => {
    try {
      const res = await api.get(`/company-documents/${doc.id}/download`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.original_filename;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch { toast.error('Error descargando'); }
  };

  const handleDownloadSignReq = async (doc) => {
    try {
      const res = await api.get(`/sign-requests/${doc.id}/download`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.original_filename;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch { toast.error('Error descargando'); }
  };

  const handleUploadSigned = async (docId, files) => {
    if (!files?.length) return;
    setUploadingSignedFor(docId);
    const file = files[0];
    if (file.size > 5 * 1024 * 1024) { toast.error('El archivo supera 5MB'); setUploadingSignedFor(null); return; }
    const fd = new FormData();
    fd.append('file', file);
    try {
      await api.post(`/sign-requests/${docId}/upload-signed`, fd);
      toast.success('Documento firmado subido exitosamente');
      fetchSignRequests();
    } catch { toast.error('Error subiendo documento firmado'); }
    setUploadingSignedFor(null);
  };

  const handleLogout = () => { logout(); navigate('/login'); };

  const updateWorkerField = (field, value) => setWorkerForm(prev => ({ ...prev, [field]: value }));

  return (
    <div className="min-h-screen bg-slate-50" data-testid="company-dashboard">
      <header className="sticky top-0 z-20 bg-white/80 backdrop-blur-xl border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <img src={LOGO_URL} alt="Tramilex" className="h-9 object-contain" />
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-600 hidden sm:inline">
              <Building2 className="w-4 h-4 inline mr-1" />
              <span className="font-semibold text-slate-900">{user?.name}</span>
            </span>
            <Button variant="ghost" size="sm" className="text-slate-500 hover:text-red-600 gap-2" onClick={handleLogout} data-testid="company-logout-btn">
              <LogOut className="w-4 h-4" /> <span className="hidden sm:inline">Salir</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* Tramites */}
        {tramites.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-lg p-5">
            <div className="flex items-center gap-3 mb-4">
              <ClipboardList className="w-5 h-5 text-slate-400" />
              <h2 className="text-base font-semibold text-slate-900">Tramites contratados</h2>
            </div>
            <div className="space-y-3">
              {tramites.map(t => (
                <div key={t.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between border border-slate-200 rounded-lg p-3 gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{t.tramite_name || t.tramite_id}</p>
                    <p className="text-xs text-slate-500">{t.country === 'espana' ? 'Espana' : 'Chile'} - {formatDate(t.created_at)}</p>
                  </div>
                  <Badge className={`text-xs ${STATUS_MAP[t.status]?.color || 'bg-slate-100 text-slate-700'}`}>
                    {STATUS_MAP[t.status]?.label || t.status}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sign Requests - Documents to sign */}
        {signRequests.length > 0 && (
          <div className={`border rounded-lg p-5 ${signRequests.some(d => d.status === 'pending_signature') ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`} data-testid="sign-requests-section">
            <div className="flex items-center gap-3 mb-4">
              <PenLine className={`w-5 h-5 ${signRequests.some(d => d.status === 'pending_signature') ? 'text-amber-600' : 'text-emerald-600'}`} />
              <h2 className="text-base font-semibold text-slate-900">Documentos por firmar</h2>
              {signRequests.every(d => d.status === 'signed')
                ? <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs gap-1"><Check className="w-3 h-3" /> Todos firmados</Badge>
                : <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs gap-1 animate-pulse">{signRequests.filter(d => d.status === 'pending_signature').length} pendiente(s)</Badge>
              }
            </div>
            <p className="text-xs text-slate-600 mb-3">Descarga el documento, firmalo con tu certificado electronico, y sube el documento firmado.</p>
            <div className="space-y-2">
              {signRequests.map(doc => (
                <div key={doc.id} className={`flex flex-col sm:flex-row sm:items-center justify-between bg-white border rounded-lg p-4 gap-3 ${doc.status === 'signed' ? 'border-emerald-200' : 'border-amber-300'}`}>
                  <div className="flex items-center gap-2.5 min-w-0">
                    {doc.status === 'signed'
                      ? <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
                      : <PenLine className="w-5 h-5 text-amber-600 shrink-0" />
                    }
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{doc.display_name || doc.original_filename}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span className="text-xs text-slate-500">{formatDate(doc.uploaded_at)}</span>
                        {doc.status === 'signed'
                          ? <Badge className="bg-emerald-100 text-emerald-700 text-[10px] gap-1"><Check className="w-2.5 h-2.5" /> Firmado</Badge>
                          : <Badge className="bg-amber-100 text-amber-700 text-[10px]">Pendiente de firma</Badge>
                        }
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => handleDownloadSignReq(doc)} data-testid={`download-sign-req-${doc.id}`}>
                      <Download className="w-3.5 h-3.5" /> Descargar
                    </Button>
                    {doc.status === 'pending_signature' && (
                      <>
                        <input
                          ref={el => { if (activeSignReqRef.current === doc.id) signedUploadRef.current = el; }}
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png,application/pdf"
                          className="hidden"
                          onChange={e => { handleUploadSigned(doc.id, Array.from(e.target.files)); e.target.value = ''; }}
                        />
                        <Button
                          size="sm"
                          className="gap-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                          onClick={() => {
                            activeSignReqRef.current = doc.id;
                            setTimeout(() => {
                              const input = document.createElement('input');
                              input.type = 'file';
                              input.accept = '.pdf,.jpg,.jpeg,.png,application/pdf';
                              input.onchange = (e) => handleUploadSigned(doc.id, Array.from(e.target.files));
                              input.click();
                            }, 0);
                          }}
                          disabled={uploadingSignedFor === doc.id}
                          data-testid={`upload-signed-${doc.id}`}
                        >
                          <ShieldCheck className="w-3.5 h-3.5" /> {uploadingSignedFor === doc.id ? 'Subiendo...' : 'Subir documento firmado'}
                        </Button>
                      </>
                    )}
                    {doc.status === 'signed' && (
                      <Badge className="bg-emerald-100 text-emerald-700 text-xs gap-1"><Check className="w-3 h-3" /> {doc.signed_original_filename}</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Workers */}
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Users className="w-5 h-5 text-slate-400" />
              <h2 className="text-base font-semibold text-slate-900">Trabajadores ({workers.length})</h2>
            </div>
            <Button variant="outline" size="sm" className="gap-2" onClick={() => setShowAddWorker(true)} data-testid="company-add-worker-btn">
              <Plus className="w-3.5 h-3.5" /> Agregar trabajador
            </Button>
          </div>

          {workers.length === 0 ? (
            <div className="text-center py-8">
              <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-500">No hay trabajadores. Haz clic en "Agregar trabajador" para comenzar.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {workers.map(w => (
                <div key={w.id} className="border border-slate-200 rounded-lg overflow-hidden">
                  <div className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50" onClick={() => toggleWorker(w.id)}>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center">
                        <span className="text-xs font-bold text-slate-600">{w.name.charAt(0).toUpperCase()}</span>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{w.name} {w.last_name}</p>
                        <p className="text-xs text-slate-500">
                          {w.nie && `NIE: ${w.nie} `}{w.passport_number && `Pass: ${w.passport_number} `}
                          {w.doc_count} doc(s) - {w.reviewed_count} revisado(s)
                          {w.signed_count > 0 && <span className="text-emerald-600 ml-1">({w.signed_count} firmado(s))</span>}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                      {w.doc_count > 0 && w.reviewed_count === w.doc_count && (
                        <Badge className="bg-emerald-100 text-emerald-700 text-xs gap-1"><Check className="w-3 h-3" /> Todos revisados</Badge>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => handleDeleteWorker(w.id, w.name)}>
                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                      </Button>
                      {expandedWorker === w.id ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                    </div>
                  </div>

                  {expandedWorker === w.id && (
                    <div className="border-t border-slate-200 p-4 bg-slate-50/50 space-y-4">
                      {/* Worker details */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs text-slate-600">
                        {w.dni && <span><strong>DNI:</strong> {w.dni}</span>}
                        {w.rut && <span><strong>RUT:</strong> {w.rut}</span>}
                        {w.phone && <span><strong>Tel:</strong> {w.phone}</span>}
                        {w.email && <span><strong>Email:</strong> {w.email}</span>}
                        {w.origin_country && <span><strong>Origen:</strong> {w.origin_country}</span>}
                        {w.residence_country && <span><strong>Residencia:</strong> {w.residence_country}</span>}
                        {w.father_name && <span><strong>Padre:</strong> {w.father_name}</span>}
                        {w.mother_name && <span><strong>Madre:</strong> {w.mother_name}</span>}
                        {w.children?.length > 0 && <span><strong>Hijos:</strong> {w.children.join(', ')}</span>}
                      </div>

                      {/* Upload area */}
                      <div className="flex flex-wrap items-center gap-3">
                        <Tag className="w-4 h-4 text-slate-400" />
                        <Select value={uploadCategory} onValueChange={setUploadCategory}>
                          <SelectTrigger className="w-40 h-8 text-xs bg-white"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <input ref={fileInputRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.heic,.heif,image/*,application/pdf" className="hidden"
                          onChange={e => { handleUpload(activeWorkerRef.current, Array.from(e.target.files), uploadCategory); e.target.value = ''; }} />
                        <Button variant="outline" size="sm" className="gap-1 text-xs"
                          onClick={() => { activeWorkerRef.current = w.id; fileInputRef.current?.click(); }}
                          disabled={uploadingFor === w.id} data-testid={`upload-doc-${w.id}`}>
                          <Upload className="w-3.5 h-3.5" /> {uploadingFor === w.id ? 'Subiendo...' : 'Subir documento'}
                        </Button>
                        <input ref={signedInputRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,application/pdf" className="hidden"
                          onChange={e => { handleUpload(activeWorkerRef.current, Array.from(e.target.files), 'firmado'); e.target.value = ''; }} />
                        <Button variant="outline" size="sm" className="gap-1 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                          onClick={() => { activeWorkerRef.current = w.id; signedInputRef.current?.click(); }}
                          disabled={uploadingFor === w.id} data-testid={`upload-signed-${w.id}`}>
                          <ShieldCheck className="w-3.5 h-3.5" /> Subir documento firmado
                        </Button>
                      </div>

                      {/* Documents list */}
                      {(workerDocs[w.id] || []).length === 0 ? (
                        <p className="text-xs text-slate-500 text-center py-4">Sin documentos cargados</p>
                      ) : (
                        <div className="space-y-2">
                          {(workerDocs[w.id] || []).map(doc => (
                            <div key={doc.id} className={`flex items-center justify-between bg-white border rounded-lg p-3 ${doc.category === 'firmado' ? 'border-emerald-200' : 'border-slate-200'}`}>
                              <div className="flex items-center gap-2.5 min-w-0">
                                {doc.category === 'firmado' ? <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" /> : getFileIcon(doc.content_type)}
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-slate-800 truncate">{doc.display_name || doc.original_filename}</p>
                                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                    <Clock className="w-3 h-3 text-slate-400" />
                                    <span className="text-xs text-slate-500">{formatDate(doc.uploaded_at)}</span>
                                    {doc.category === 'firmado' && <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">Firmado</Badge>}
                                    <Badge className={`text-[10px] ${doc.status === 'reviewed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                      {doc.status === 'reviewed' ? 'Revisado' : 'Pendiente de revision'}
                                    </Badge>
                                  </div>
                                </div>
                              </div>
                              <Button variant="ghost" size="sm" onClick={() => handleDownloadDoc(doc)}>
                                <Download className="w-4 h-4 text-slate-500" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Add Worker Dialog */}
      <Dialog open={showAddWorker} onOpenChange={setShowAddWorker}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Agregar trabajador</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-slate-600">Nombres *</Label>
                <Input placeholder="Nombres" value={workerForm.name} onChange={e => updateWorkerField('name', e.target.value)} className="h-9 text-sm" data-testid="worker-name-input" />
              </div>
              <div>
                <Label className="text-xs text-slate-600">Apellidos</Label>
                <Input placeholder="Apellidos" value={workerForm.last_name} onChange={e => updateWorkerField('last_name', e.target.value)} className="h-9 text-sm" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-slate-600">NIE</Label>
                <Input placeholder="X1234567A" value={workerForm.nie} onChange={e => updateWorkerField('nie', e.target.value)} className="h-9 text-sm" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }} />
              </div>
              <div>
                <Label className="text-xs text-slate-600">DNI</Label>
                <Input placeholder="12345678Z" value={workerForm.dni} onChange={e => updateWorkerField('dni', e.target.value)} className="h-9 text-sm" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-slate-600">Pasaporte</Label>
                <Input placeholder="AB1234567" value={workerForm.passport_number} onChange={e => updateWorkerField('passport_number', e.target.value)} className="h-9 text-sm" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }} />
              </div>
              <div>
                <Label className="text-xs text-slate-600">RUT</Label>
                <Input placeholder="12.345.678-9" value={workerForm.rut} onChange={e => updateWorkerField('rut', e.target.value)} className="h-9 text-sm" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-slate-600">Telefono 1</Label>
                <Input placeholder="+34 612 345 678" value={workerForm.phone} onChange={e => updateWorkerField('phone', e.target.value)} className="h-9 text-sm" />
              </div>
              <div>
                <Label className="text-xs text-slate-600">Telefono 2</Label>
                <Input placeholder="Telefono alternativo" value={workerForm.phone2} onChange={e => updateWorkerField('phone2', e.target.value)} className="h-9 text-sm" />
              </div>
            </div>
            <div>
              <Label className="text-xs text-slate-600">Email</Label>
              <Input placeholder="correo@ejemplo.com" value={workerForm.email} onChange={e => updateWorkerField('email', e.target.value)} className="h-9 text-sm" />
            </div>
            <div>
              <Label className="text-xs text-slate-600">Direccion</Label>
              <Input placeholder="Calle, numero, piso" value={workerForm.address} onChange={e => updateWorkerField('address', e.target.value)} className="h-9 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-slate-600">Pais de origen</Label>
                <Select value={workerForm.origin_country} onValueChange={v => updateWorkerField('origin_country', v)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>{COUNTRIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-slate-600">Pais de residencia</Label>
                <Select value={workerForm.residence_country} onValueChange={v => updateWorkerField('residence_country', v)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>{COUNTRIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-slate-600">Nombre del padre</Label>
                <Input placeholder="Nombre completo" value={workerForm.father_name} onChange={e => updateWorkerField('father_name', e.target.value)} className="h-9 text-sm" />
              </div>
              <div>
                <Label className="text-xs text-slate-600">Nombre de la madre</Label>
                <Input placeholder="Nombre completo" value={workerForm.mother_name} onChange={e => updateWorkerField('mother_name', e.target.value)} className="h-9 text-sm" />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label className="text-xs text-slate-600">Hijos</Label>
                <button type="button" onClick={() => updateWorkerField('children', [...workerForm.children, ''])} className="text-xs text-sky-600 hover:text-sky-700 flex items-center gap-1">
                  <Plus className="w-3 h-3" /> Agregar hijo
                </button>
              </div>
              {workerForm.children.map((child, idx) => (
                <div key={idx} className="flex items-center gap-2 mb-1.5">
                  <Input placeholder={`Nombre hijo/a ${idx + 1}`} value={child} className="h-9 text-sm flex-1"
                    onChange={e => { const u = [...workerForm.children]; u[idx] = e.target.value; updateWorkerField('children', u); }} />
                  <button onClick={() => updateWorkerField('children', workerForm.children.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <Button onClick={handleAddWorker} disabled={saving} className="w-full bg-slate-900 hover:bg-slate-800" data-testid="submit-worker-btn">
              {saving ? 'Guardando...' : 'Agregar trabajador'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <footer className="text-center py-4">
        <p className="text-xs text-slate-400">
          Creado por <a href="https://goroky.com" target="_blank" rel="noopener noreferrer" className="text-slate-500 hover:text-slate-700 font-medium">GoRoky.com</a>
        </p>
      </footer>
    </div>
  );
}
