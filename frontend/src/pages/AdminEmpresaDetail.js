import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
  ArrowLeft, Building2, Users, Copy, Send, Plus, Trash2, Download,
  FileText, Image as ImageIcon, Clock, ChevronDown, ChevronUp,
  ClipboardList, Mail, RotateCcw, Upload, Eye, Check, AlertCircle, ShieldCheck, PenLine
} from 'lucide-react';

const CATEGORIES = [
  { value: "identificacion", label: "Identificacion" },
  { value: "residencia", label: "Residencia" },
  { value: "trabajo", label: "Trabajo" },
  { value: "contrato", label: "Contrato" },
  { value: "fiscal", label: "Fiscal" },
  { value: "firmado", label: "Documento firmado" },
  { value: "otros", label: "Otros" },
];

const TRAMITE_STATUSES = [
  { value: "pendiente", label: "Pendiente", color: "bg-amber-100 text-amber-700 border-amber-200" },
  { value: "en_proceso", label: "En proceso", color: "bg-sky-100 text-sky-700 border-sky-200" },
  { value: "completado", label: "Completado", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  { value: "rechazado", label: "Rechazado", color: "bg-red-100 text-red-700 border-red-200" },
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

export default function AdminEmpresaDetail() {
  const { companyId } = useParams();
  const navigate = useNavigate();
  const [company, setCompany] = useState(null);
  const [tramites, setTramites] = useState([]);
  const [allTramites, setAllTramites] = useState({});
  const [expandedWorker, setExpandedWorker] = useState(null);
  const [workerDocs, setWorkerDocs] = useState({});
  const [showAddWorker, setShowAddWorker] = useState(false);
  const [showAddTramite, setShowAddTramite] = useState(false);
  const [showSendCreds, setShowSendCreds] = useState(false);
  const [customEmail, setCustomEmail] = useState('');
  const [sendMode, setSendMode] = useState('registro');
  const fileInputRef = useRef(null);
  const signReqInputRef = useRef(null);
  const companyDocInputRef = useRef(null);
  const [uploadingFor, setUploadingFor] = useState(null);
  const [uploadCategory, setUploadCategory] = useState('otros');
  const [signRequests, setSignRequests] = useState([]);
  const [uploadingSignReq, setUploadingSignReq] = useState(false);
  const [companyDocs, setCompanyDocs] = useState([]);
  const [uploadingCompanyDoc, setUploadingCompanyDoc] = useState(false);
  const [companyDocCategory, setCompanyDocCategory] = useState('otros');
  const [professions, setProfessions] = useState([]);
  const [newProfession, setNewProfession] = useState('');
  const [expandedProfession, setExpandedProfession] = useState(null);
  const [activeTab, setActiveTab] = useState('general');

  const [workerForm, setWorkerForm] = useState({ name: '', last_name: '', identification: '', phone: '', email: '', nationality: '', profession: '' });
  const [tramiteForm, setTramiteForm] = useState({ country: '', tramite_id: '', notes: '' });

  const fetchCompany = useCallback(async () => {
    try {
      const res = await api.get(`/companies/${companyId}`);
      setCompany(res.data);
    } catch { toast.error('Error cargando empresa'); }
  }, [companyId]);

  const fetchTramites = useCallback(async () => {
    try {
      const res = await api.get('/tramites');
      setAllTramites(res.data);
    } catch {}
  }, []);

  useEffect(() => { fetchCompany(); fetchTramites(); }, [fetchCompany, fetchTramites]);

  const fetchSignRequests = useCallback(async () => {
    try {
      const res = await api.get(`/companies/${companyId}/sign-requests`);
      setSignRequests(res.data);
    } catch {}
  }, [companyId]);

  useEffect(() => { fetchSignRequests(); }, [fetchSignRequests]);

  const fetchCompanyDocs = useCallback(async () => {
    try { const res = await api.get(`/companies/${companyId}/documents`); setCompanyDocs(res.data); } catch {}
  }, [companyId]);

  useEffect(() => { fetchCompanyDocs(); }, [fetchCompanyDocs]);

  const fetchProfessions = useCallback(async () => {
    try { const res = await api.get(`/companies/${companyId}/professions`); setProfessions(res.data); } catch {}
  }, [companyId]);

  useEffect(() => { fetchProfessions(); }, [fetchProfessions]);

  const handleAddProfession = async () => {
    if (!newProfession.trim()) return;
    try {
      await api.post(`/companies/${companyId}/professions`, { name: newProfession.trim() });
      setNewProfession('');
      fetchProfessions();
      toast.success('Profesion agregada');
    } catch { toast.error('Error'); }
  };

  const handleUploadCompanyDoc = async (files) => {
    if (!files?.length) return;
    setUploadingCompanyDoc(true);
    let count = 0;
    for (const file of files) {
      if (file.size > 10 * 1024 * 1024) { toast.error(`${file.name} supera 10MB`); continue; }
      const fd = new FormData();
      fd.append('file', file);
      fd.append('category', companyDocCategory);
      try { await api.post(`/companies/${companyId}/documents/upload`, fd); count++; } catch { toast.error(`Error subiendo ${file.name}`); }
    }
    if (count > 0) { toast.success(`${count} documento(s) subido(s)`); fetchCompanyDocs(); }
    setUploadingCompanyDoc(false);
  };

  const handleDownloadCompanyDoc = async (doc) => {
    try {
      const res = await api.get(`/company-documents/${doc.id}/download`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url; a.download = doc.original_filename; a.click();
      window.URL.revokeObjectURL(url);
    } catch { toast.error('Error descargando'); }
  };

  const handleDeleteCompanyDoc = async (docId) => {
    if (!window.confirm('Eliminar documento?')) return;
    try { await api.delete(`/companies/${companyId}/documents/${docId}`); fetchCompanyDocs(); toast.success('Eliminado'); } catch { toast.error('Error'); }
  };

  const handleUploadSignRequest = async (files) => {
    if (!files?.length) return;
    setUploadingSignReq(true);
    let count = 0;
    for (const file of files) {
      if (file.size > 5 * 1024 * 1024) { toast.error(`${file.name} supera 5MB`); continue; }
      const fd = new FormData();
      fd.append('file', file);
      try {
        await api.post(`/companies/${companyId}/sign-requests/upload`, fd);
        count++;
      } catch { toast.error(`Error subiendo ${file.name}`); }
    }
    if (count > 0) { toast.success(`${count} documento(s) para firmar subido(s)`); fetchSignRequests(); }
    setUploadingSignReq(false);
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

  const handleDownloadSignedVersion = async (doc) => {
    try {
      const res = await api.get(`/sign-requests/${doc.id}/download-signed`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.signed_original_filename || 'documento_firmado';
      a.click();
      window.URL.revokeObjectURL(url);
    } catch { toast.error('Error descargando'); }
  };

  const handleDeleteSignReq = async (docId) => {
    if (!window.confirm('Eliminar documento para firmar?')) return;
    try {
      await api.delete(`/sign-requests/${docId}`);
      fetchSignRequests();
      toast.success('Documento eliminado');
    } catch { toast.error('Error'); }
  };

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
    try {
      await api.post(`/companies/${companyId}/workers`, workerForm);
      setWorkerForm({ name: '', last_name: '', identification: '', phone: '', email: '', nationality: '', profession: '' });
      setShowAddWorker(false);
      fetchCompany();
      toast.success('Trabajador agregado');
    } catch (err) { toast.error(err.response?.data?.detail || 'Error'); }
  };

  const handleDeleteWorker = async (workerId, name) => {
    if (!window.confirm(`Eliminar trabajador "${name}"?`)) return;
    try {
      await api.delete(`/companies/${companyId}/workers/${workerId}`);
      fetchCompany();
      toast.success('Trabajador eliminado');
    } catch { toast.error('Error'); }
  };

  const handleAddTramite = async () => {
    if (!tramiteForm.country || !tramiteForm.tramite_id) { toast.error('Selecciona pais y tramite'); return; }
    try {
      await api.post(`/companies/${companyId}/tramites`, tramiteForm);
      setTramiteForm({ country: '', tramite_id: '', notes: '' });
      setShowAddTramite(false);
      fetchCompany();
      toast.success('Tramite asignado');
    } catch (err) { toast.error(err.response?.data?.detail || 'Error'); }
  };

  const handleUpdateTramiteStatus = async (tramiteId, newStatus) => {
    try {
      await api.put(`/companies/${companyId}/tramites/${tramiteId}`, { status: newStatus, notes: '' });
      fetchCompany();
      toast.success('Estado actualizado');
    } catch { toast.error('Error'); }
  };

  const handleDeleteTramite = async (tramiteId) => {
    if (!window.confirm('Eliminar este tramite?')) return;
    try {
      await api.delete(`/companies/${companyId}/tramites/${tramiteId}`);
      fetchCompany();
      toast.success('Tramite eliminado');
    } catch { toast.error('Error'); }
  };

  const handleUploadDocs = async (workerId, files) => {
    if (!files?.length) return;
    setUploadingFor(workerId);
    let count = 0;
    for (const file of files) {
      if (file.size > 5 * 1024 * 1024) { toast.error(`${file.name} supera 5MB`); continue; }
      const fd = new FormData();
      fd.append('file', file);
      fd.append('category', uploadCategory);
      fd.append('uploaded_by', 'admin');
      try {
        await api.post(`/companies/${companyId}/workers/${workerId}/documents/upload`, fd);
        count++;
      } catch { toast.error(`Error subiendo ${file.name}`); }
    }
    if (count > 0) { toast.success(`${count} documento(s) subido(s)`); fetchWorkerDocs(workerId); }
    setUploadingFor(null);
  };

  const handleDownloadAll = async (workerId, workerName) => {
    try {
      const res = await api.get(`/companies/${companyId}/workers/${workerId}/documents/download-all`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `documentos_${workerName.replace(/\s/g, '_')}.zip`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch { toast.error('No hay documentos para descargar'); }
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

  const handleDocStatus = async (docId, workerId, newStatus) => {
    try {
      await api.put(`/company-documents/${docId}/status`, { status: newStatus });
      fetchWorkerDocs(workerId);
      toast.success('Estado actualizado');
    } catch { toast.error('Error'); }
  };

  const handleDeleteDoc = async (docId, workerId) => {
    try {
      await api.delete(`/company-documents/${docId}`);
      fetchWorkerDocs(workerId);
      toast.success('Documento eliminado');
    } catch { toast.error('Error'); }
  };

  const copyCredentials = () => {
    if (!company) return;
    const text = `Usuario (CIF/NIF): ${company.cif_nif}\nContrasena: ${company.password_plain}`;
    navigator.clipboard.writeText(text);
    toast.success('Credenciales copiadas');
  };

  const handleSendCredentials = async () => {
    const email = sendMode === 'registro' ? '' : customEmail;
    try {
      await api.post(`/companies/${companyId}/send-credentials`, { email });
      setShowSendCreds(false);
      setCustomEmail('');
      fetchCompany();
      toast.success('Credenciales enviadas');
    } catch (err) { toast.error(err.response?.data?.detail || 'Error enviando'); }
  };

  const handleResendEmail = async (emailId) => {
    try {
      await api.post(`/companies/${companyId}/resend-email/${emailId}`);
      fetchCompany();
      toast.success('Correo reenviado');
    } catch { toast.error('Error reenviando'); }
  };

  if (!company) return (
    <div className="flex items-center justify-center py-20">
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-slate-900 border-t-transparent" />
    </div>
  );

  const statusColor = (s) => TRAMITE_STATUSES.find(t => t.value === s)?.color || 'bg-slate-100 text-slate-700';
  const statusLabel = (s) => TRAMITE_STATUSES.find(t => t.value === s)?.label || s;

  const countryTramites = tramiteForm.country && allTramites[tramiteForm.country]
    ? allTramites[tramiteForm.country].tramites || []
    : [];

  return (
    <div className="space-y-6" data-testid="admin-empresa-detail">
      <button onClick={() => navigate('/admin/empresas')} className="flex items-center gap-2 text-sm text-sky-600 hover:text-sky-800" data-testid="back-to-empresas">
        <ArrowLeft className="w-4 h-4" /> Volver a empresas
      </button>

      {/* Company Header */}
      <div className="bg-white border border-slate-200 rounded-lg p-6">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-full bg-sky-100 flex items-center justify-center shrink-0">
              <Building2 className="w-6 h-6 text-sky-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>{company.name}</h1>
              <p className="text-sm text-slate-500 mt-0.5">Registrada el {formatDate(company.created_at)}</p>
              <div className="flex flex-wrap gap-4 mt-3 text-sm text-slate-600">
                <span><strong>CIF/NIF:</strong> {company.cif_nif}</span>
                <span><strong>Email:</strong> {company.email || '-'}</span>
                <span><strong>Tel:</strong> {company.phone || '-'}</span>
                {company.contact_person && <span><strong>Contacto:</strong> {company.contact_person}</span>}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="gap-2" onClick={copyCredentials} data-testid="copy-creds-btn">
              <Copy className="w-3.5 h-3.5" /> Copiar credenciales
            </Button>
            <Button variant="outline" size="sm" className="gap-2" onClick={() => setShowSendCreds(true)} data-testid="send-creds-btn">
              <Send className="w-3.5 h-3.5" /> Enviar credenciales
            </Button>
          </div>
        </div>

        {/* Credentials display */}
        <div className="mt-4 bg-slate-50 border border-slate-200 rounded-lg p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Datos de acceso</p>
          <p className="text-sm text-slate-700"><strong>Usuario (CIF/NIF):</strong> {company.cif_nif}</p>
          <p className="text-sm text-slate-700"><strong>Contrasena:</strong> {company.password_plain || '****'}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-white border border-slate-200 rounded-xl p-1 gap-1">
        {[
          { key: 'general', label: 'General', icon: Building2 },
          { key: 'personal', label: 'Personal', icon: Users },
        ].map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all flex-1 justify-center ${
              activeTab === tab.key ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
            }`} data-testid={`tab-${tab.key}`}>
            <tab.icon className="w-4 h-4" /> {tab.label}
            {tab.key === 'personal' && company.workers?.length > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-md ${activeTab === tab.key ? 'bg-white/20' : 'bg-slate-100'}`}>{company.workers.length}</span>
            )}
          </button>
        ))}
      </div>

      {activeTab === 'general' && (<>

      {/* Company Documents Section */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden" data-testid="company-docs-section">
        <div className="px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-sky-100 flex items-center justify-center">
                <FileText className="w-5 h-5 text-sky-600" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900">Documentos Empresa</h2>
                <p className="text-xs text-slate-500">{companyDocs.length} documento(s) cargados</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Select value={companyDocCategory} onValueChange={setCompanyDocCategory}>
                <SelectTrigger className="w-36 h-9 text-xs bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <input ref={companyDocInputRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.doc,.docx,.xls,.xlsx,application/pdf,image/*" className="hidden"
                onChange={e => { handleUploadCompanyDoc(Array.from(e.target.files)); e.target.value = ''; }} />
              <Button className="gap-2 h-9 bg-slate-900 hover:bg-slate-800 text-sm" onClick={() => companyDocInputRef.current?.click()} disabled={uploadingCompanyDoc} data-testid="upload-company-doc-btn">
                <Upload className="w-4 h-4" /> {uploadingCompanyDoc ? 'Subiendo...' : 'Subir documento'}
              </Button>
            </div>
          </div>
        </div>

        <div className="p-6">
          {companyDocs.length === 0 ? (
            <div className="border-2 border-dashed border-slate-200 rounded-xl p-10 text-center cursor-pointer hover:border-slate-300 hover:bg-slate-50/50 transition-colors"
              onClick={() => companyDocInputRef.current?.click()}>
              <Upload className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-medium text-slate-600">Sube los documentos de la empresa</p>
              <p className="text-xs text-slate-400 mt-1">PDF, imagenes, Word, Excel — max 10MB por archivo</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {companyDocs.map(doc => (
                <div key={doc.id} className="flex items-center gap-3 border border-slate-200 rounded-xl p-4 hover:shadow-sm transition-shadow group" data-testid={`company-doc-${doc.id}`}>
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                    doc.content_type?.startsWith('image/') ? 'bg-sky-50' : 'bg-red-50'
                  }`}>
                    {doc.content_type?.startsWith('image/')
                      ? <ImageIcon className="w-5 h-5 text-sky-500" />
                      : <FileText className="w-5 h-5 text-red-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{doc.display_name || doc.original_filename}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge className="text-[10px] bg-slate-100 text-slate-600 border-0">{CATEGORIES.find(c => c.value === doc.category)?.label || doc.category}</Badge>
                      <span className="text-[11px] text-slate-400">{formatDate(doc.uploaded_at)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => handleDownloadCompanyDoc(doc)}>
                      <Download className="w-4 h-4 text-slate-500" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => handleDeleteCompanyDoc(doc.id)}>
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Sign Requests Section */}
      <div className="bg-white border border-slate-200 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <PenLine className="w-5 h-5 text-slate-400" />
            <h2 className="text-base font-semibold text-slate-900">Documentos por firmar</h2>
            {signRequests.length > 0 && (
              signRequests.every(d => d.status === 'signed')
                ? <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs gap-1"><Check className="w-3 h-3" /> Todos firmados</Badge>
                : <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs gap-1"><AlertCircle className="w-3 h-3" /> Pendientes de firma</Badge>
            )}
          </div>
          <div>
            <input ref={signReqInputRef} type="file" multiple accept=".pdf,.doc,.docx,application/pdf" className="hidden"
              onChange={e => { handleUploadSignRequest(Array.from(e.target.files)); e.target.value = ''; }} />
            <Button variant="outline" size="sm" className="gap-2" onClick={() => signReqInputRef.current?.click()} disabled={uploadingSignReq} data-testid="upload-sign-request-btn">
              <Upload className="w-3.5 h-3.5" /> {uploadingSignReq ? 'Subiendo...' : 'Subir documento para firmar'}
            </Button>
          </div>
        </div>

        {signRequests.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-6">No hay documentos pendientes de firma</p>
        ) : (
          <div className="space-y-2">
            {signRequests.map(doc => (
              <div key={doc.id} className={`flex items-center justify-between border rounded-lg p-3 ${doc.status === 'signed' ? 'border-emerald-200 bg-emerald-50/30' : 'border-amber-200 bg-amber-50/30'}`}>
                <div className="flex items-center gap-2.5 min-w-0">
                  {doc.status === 'signed' ? <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" /> : <PenLine className="w-4 h-4 text-amber-600 shrink-0" />}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{doc.display_name || doc.original_filename}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-xs text-slate-500">{formatDate(doc.uploaded_at)}</span>
                      {doc.status === 'signed'
                        ? <Badge className="bg-emerald-100 text-emerald-700 text-[10px] gap-1"><Check className="w-2.5 h-2.5" /> Firmado {doc.signed_at ? formatDate(doc.signed_at) : ''}</Badge>
                        : <Badge className="bg-amber-100 text-amber-700 text-[10px]">Pendiente de firma</Badge>
                      }
                    </div>
                    {doc.signed_original_filename && (
                      <p className="text-xs text-emerald-600 mt-0.5">Archivo firmado: {doc.signed_original_filename}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {doc.status === 'signed' ? (
                    <>
                      <Button variant="outline" size="sm" className="gap-1 text-xs text-emerald-700 border-emerald-300 hover:bg-emerald-50" onClick={() => handleDownloadSignedVersion(doc)} title="Descargar documento firmado">
                        <ShieldCheck className="w-3.5 h-3.5" /> Descargar firmado
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDownloadSignReq(doc)} title="Descargar original" className="text-slate-400 text-xs">
                        <Download className="w-3.5 h-3.5" />
                      </Button>
                    </>
                  ) : (
                    <Button variant="ghost" size="sm" onClick={() => handleDownloadSignReq(doc)} title="Descargar original">
                      <Download className="w-3.5 h-3.5 text-slate-500" />
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => handleDeleteSignReq(doc.id)}>
                    <Trash2 className="w-3.5 h-3.5 text-red-500" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tramites Section */}
      <div className="bg-white border border-slate-200 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <ClipboardList className="w-5 h-5 text-slate-400" />
            <h2 className="text-base font-semibold text-slate-900">Historial de tramites</h2>
          </div>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => setShowAddTramite(true)} data-testid="add-tramite-btn">
            <Plus className="w-3.5 h-3.5" /> Asignar tramite
          </Button>
        </div>

        {company.tramites?.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-6">No hay tramites asignados</p>
        ) : (
          <div className="space-y-3">
            {company.tramites?.map(t => (
              <div key={t.id} className="border border-slate-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{t.tramite_name || t.tramite_id}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{t.country === 'espana' ? 'Espana' : 'Chile'} - {formatDate(t.created_at)}</p>
                  {t.notes && <p className="text-xs text-slate-500 mt-1">{t.notes}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <Select value={t.status} onValueChange={(v) => handleUpdateTramiteStatus(t.id, v)}>
                    <SelectTrigger className="h-8 w-36 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TRAMITE_STATUSES.map(s => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Badge className={`text-xs ${statusColor(t.status)}`}>{statusLabel(t.status)}</Badge>
                  <Button variant="ghost" size="sm" onClick={() => handleDeleteTramite(t.id)}>
                    <Trash2 className="w-3.5 h-3.5 text-red-500" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Workers Section */}
      <div className="bg-white border border-slate-200 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Users className="w-5 h-5 text-slate-400" />
            <h2 className="text-base font-semibold text-slate-900">Trabajadores ({company.workers?.length || 0})</h2>
          </div>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => setShowAddWorker(true)} data-testid="add-worker-btn">
            <Plus className="w-3.5 h-3.5" /> Agregar trabajador
          </Button>
        </div>

        {company.workers?.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-6">No hay trabajadores registrados</p>
        ) : (
          <div className="space-y-3">
            {company.workers?.map(w => (
              <div key={w.id} className="border border-slate-200 rounded-lg overflow-hidden">
                <div
                  className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50"
                  onClick={() => toggleWorker(w.id)}
                  data-testid={`worker-row-${w.id}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center">
                      <span className="text-xs font-bold text-slate-600">{w.name.charAt(0).toUpperCase()}</span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{w.name} {w.last_name || ''}</p>
                      <p className="text-xs text-slate-500">
                        {w.identification && `ID: ${w.identification} `}
                        {w.doc_count} doc(s)
                        {w.signed_count > 0 && <span className="text-emerald-600 ml-1">({w.signed_count} firmado(s))</span>}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                    <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => handleDownloadAll(w.id, w.name)} data-testid={`download-all-${w.id}`}>
                      <Download className="w-3.5 h-3.5" /> Descargar Documentos
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDeleteWorker(w.id, w.name)}>
                      <Trash2 className="w-3.5 h-3.5 text-red-500" />
                    </Button>
                    {expandedWorker === w.id ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                  </div>
                </div>

                {expandedWorker === w.id && (
                  <div className="border-t border-slate-200 p-4 bg-slate-50/50">
                    {/* Worker details */}
                    {(w.identification || w.origin_country || w.residence_country || w.father_name || w.mother_name || w.children?.length > 0) && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs text-slate-600 mb-3 p-3 bg-white border border-slate-200 rounded-lg">
                        {w.identification && <span><strong>DNI/NIE/Pasaporte/RUT:</strong> {w.identification}</span>}
                        {w.phone && <span><strong>Tel:</strong> {w.phone}</span>}
                        {w.email && <span><strong>Email:</strong> {w.email}</span>}
                        {w.address && <span><strong>Dir:</strong> {w.address}</span>}
                        {w.origin_country && <span><strong>Origen:</strong> {w.origin_country}</span>}
                        {w.residence_country && <span><strong>Residencia:</strong> {w.residence_country}</span>}
                        {w.father_name && <span><strong>Padre:</strong> {w.father_name}</span>}
                        {w.mother_name && <span><strong>Madre:</strong> {w.mother_name}</span>}
                        {w.children?.length > 0 && <span><strong>Hijos:</strong> {w.children.join(', ')}</span>}
                      </div>
                    )}
                    {/* Upload area */}
                    <div className="flex items-center gap-3 mb-3">
                      <Select value={uploadCategory} onValueChange={setUploadCategory}>
                        <SelectTrigger className="w-40 h-8 text-xs bg-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.heic,.heif,image/*,application/pdf"
                        className="hidden"
                        onChange={e => handleUploadDocs(w.id, Array.from(e.target.files))}
                      />
                      <Button
                        variant="outline" size="sm" className="gap-1 text-xs"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingFor === w.id}
                      >
                        <Upload className="w-3.5 h-3.5" />
                        {uploadingFor === w.id ? 'Subiendo...' : 'Subir documento'}
                      </Button>
                    </div>

                    {/* Documents list */}
                    {(workerDocs[w.id] || []).length === 0 ? (
                      <p className="text-xs text-slate-500 text-center py-4">Sin documentos</p>
                    ) : (
                      <div className="space-y-2">
                        {(workerDocs[w.id] || []).map(doc => (
                          <div key={doc.id} className={`flex items-center justify-between bg-white border rounded-lg p-3 ${doc.category === 'firmado' ? 'border-emerald-200 bg-emerald-50/30' : 'border-slate-200'}`}>
                            <div className="flex items-center gap-2.5 min-w-0">
                              {getFileIcon(doc.content_type)}
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-slate-800 truncate">{doc.display_name || doc.original_filename}</p>
                                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                  <span className="text-xs text-slate-500">{formatDate(doc.uploaded_at)}</span>
                                  {doc.category === 'firmado' && <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">Firmado</Badge>}
                                  <Badge className={`text-[10px] ${doc.status === 'reviewed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                    {doc.status === 'reviewed' ? 'Revisado' : 'Pendiente'}
                                  </Badge>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {doc.status !== 'reviewed' ? (
                                <Button variant="ghost" size="sm" onClick={() => handleDocStatus(doc.id, w.id, 'reviewed')} title="Marcar revisado">
                                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                                </Button>
                              ) : (
                                <Button variant="ghost" size="sm" onClick={() => handleDocStatus(doc.id, w.id, 'pending_review')} title="Marcar pendiente">
                                  <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                                </Button>
                              )}
                              <Button variant="ghost" size="sm" onClick={() => handleDownloadDoc(doc)}>
                                <Download className="w-3.5 h-3.5 text-slate-500" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => handleDeleteDoc(doc.id, w.id)}>
                                <Trash2 className="w-3.5 h-3.5 text-red-500" />
                              </Button>
                            </div>
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

      {/* Email History */}
      {company.email_history?.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-lg p-6">
          <div className="flex items-center gap-3 mb-4">
            <Mail className="w-5 h-5 text-slate-400" />
            <h2 className="text-base font-semibold text-slate-900">Historial de correos enviados</h2>
          </div>
          <div className="space-y-2">
            {company.email_history.map(e => (
              <div key={e.id} className="flex items-center justify-between border border-slate-200 rounded-lg p-3">
                <div>
                  <p className="text-sm text-slate-700">{e.to_email}</p>
                  <p className="text-xs text-slate-500">{e.type === 'credentials_resend' ? 'Reenvio' : 'Credenciales'} - {formatDate(e.sent_at)}</p>
                </div>
                <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => handleResendEmail(e.id)} data-testid={`resend-${e.id}`}>
                  <RotateCcw className="w-3.5 h-3.5" /> Reenviar
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      </>)}

      {/* Personal Tab */}
      {activeTab === 'personal' && (
        <div className="space-y-6">
          {/* Add profession + worker */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Input value={newProfession} onChange={e => setNewProfession(e.target.value)}
                placeholder="Nueva categoria (ej: Pintores)" className="w-64 h-9 text-sm" data-testid="new-profession-input"
                onKeyDown={e => { if (e.key === 'Enter') handleAddProfession(); }} />
              <Button variant="outline" size="sm" className="gap-1 h-9" onClick={handleAddProfession} data-testid="add-profession-btn">
                <Plus className="w-3.5 h-3.5" /> Categoria
              </Button>
            </div>
            <Button onClick={() => setShowAddWorker(true)} className="bg-slate-900 hover:bg-slate-800 gap-2 h-9 text-sm" data-testid="add-worker-btn-personal">
              <Plus className="w-4 h-4" /> Agregar trabajador
            </Button>
          </div>

          {/* Workers without profession */}
          {(() => {
            const uncategorized = (company.workers || []).filter(w => !w.profession);
            const groupedByProfession = {};
            (company.workers || []).forEach(w => {
              if (w.profession) {
                if (!groupedByProfession[w.profession]) groupedByProfession[w.profession] = [];
                groupedByProfession[w.profession].push(w);
              }
            });

            const allProfessionKeys = [...new Set([...professions, ...Object.keys(groupedByProfession)])].sort();

            return (
              <div className="space-y-4">
                {/* Profession accordions */}
                {allProfessionKeys.map(prof => {
                  const workers = groupedByProfession[prof] || [];
                  const isOpen = expandedProfession === prof;
                  return (
                    <div key={prof} className="bg-white border border-slate-200 rounded-xl overflow-hidden" data-testid={`profession-${prof}`}>
                      <button onClick={() => setExpandedProfession(isOpen ? null : prof)}
                        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-sky-100 flex items-center justify-center">
                            <Users className="w-4 h-4 text-sky-600" />
                          </div>
                          <div className="text-left">
                            <p className="text-sm font-semibold text-slate-900">{prof}</p>
                            <p className="text-xs text-slate-500">{workers.length} trabajador(es)</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className="bg-slate-100 text-slate-600 border-0 text-xs">{workers.length}</Badge>
                          {isOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                        </div>
                      </button>
                      {isOpen && (
                        <div className="border-t border-slate-100 divide-y divide-slate-100">
                          {workers.length === 0 ? (
                            <p className="text-sm text-slate-500 text-center py-6">Sin trabajadores en esta categoria</p>
                          ) : workers.map(w => (
                            <div key={w.id} className="px-5 py-3 flex items-center justify-between hover:bg-slate-50">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center">
                                  <span className="text-xs font-bold text-slate-600">{w.name.charAt(0).toUpperCase()}</span>
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-slate-800">{w.name} {w.last_name || ''}</p>
                                  <p className="text-xs text-slate-500">{w.identification && `ID: ${w.identification}`} {w.doc_count || 0} doc(s)</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                <Button variant="outline" size="sm" className="gap-1 text-xs h-7" onClick={() => { setExpandedWorker(w.id === expandedWorker ? null : w.id); toggleWorker(w.id); navigate(`/admin/empresas/${companyId}`); }}>
                                  <Eye className="w-3 h-3" /> Ver
                                </Button>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleDeleteWorker(w.id, w.name)}>
                                  <Trash2 className="w-3.5 h-3.5 text-red-500" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Uncategorized workers */}
                {uncategorized.length > 0 && (
                  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-100 bg-slate-50">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-slate-200 flex items-center justify-center">
                          <Users className="w-4 h-4 text-slate-500" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-700">Sin categoria</p>
                          <p className="text-xs text-slate-500">{uncategorized.length} trabajador(es)</p>
                        </div>
                      </div>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {uncategorized.map(w => (
                        <div key={w.id} className="px-5 py-3 flex items-center justify-between hover:bg-slate-50">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center">
                              <span className="text-xs font-bold text-slate-600">{w.name.charAt(0).toUpperCase()}</span>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-slate-800">{w.name} {w.last_name || ''}</p>
                              <p className="text-xs text-slate-500">{w.identification && `ID: ${w.identification}`} {w.doc_count || 0} doc(s)</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button variant="outline" size="sm" className="gap-1 text-xs h-7" onClick={() => { toggleWorker(w.id); setActiveTab('general'); }}>
                              <Eye className="w-3 h-3" /> Ver
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleDeleteWorker(w.id, w.name)}>
                              <Trash2 className="w-3.5 h-3.5 text-red-500" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {allProfessionKeys.length === 0 && uncategorized.length === 0 && (
                  <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
                    <Users className="w-12 h-12 text-slate-200 mx-auto mb-3" strokeWidth={1} />
                    <p className="text-sm text-slate-600 font-medium">No hay trabajadores registrados</p>
                    <p className="text-xs text-slate-400 mt-1">Agrega una categoria y luego trabajadores</p>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* Add Worker Dialog */}
      <Dialog open={showAddWorker} onOpenChange={setShowAddWorker}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Agregar trabajador</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder="Nombres *" value={workerForm.name} onChange={e => setWorkerForm({...workerForm, name: e.target.value})} data-testid="worker-name-input" />
              <Input placeholder="Apellidos" value={workerForm.last_name || ''} onChange={e => setWorkerForm({...workerForm, last_name: e.target.value})} />
            </div>
            <Input placeholder="DNI / NIE / Pasaporte / RUT" value={workerForm.identification || ''} onChange={e => setWorkerForm({...workerForm, identification: e.target.value})} style={{ fontFamily: 'IBM Plex Sans, sans-serif' }} data-testid="worker-identification-input" />
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder="Telefono" value={workerForm.phone} onChange={e => setWorkerForm({...workerForm, phone: e.target.value})} />
              <Input placeholder="Email" value={workerForm.email} onChange={e => setWorkerForm({...workerForm, email: e.target.value})} />
            </div>
            <Input placeholder="Nacionalidad" value={workerForm.nationality} onChange={e => setWorkerForm({...workerForm, nationality: e.target.value})} />
            <div>
              <label className="text-xs text-slate-600 mb-1 block">Profesion / Categoria</label>
              <Select value={workerForm.profession} onValueChange={v => setWorkerForm({...workerForm, profession: v})}>
                <SelectTrigger className="h-10" data-testid="worker-profession-select"><SelectValue placeholder="Seleccionar categoria..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value=" ">Sin categoria</SelectItem>
                  {professions.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleAddWorker} className="w-full bg-slate-900 hover:bg-slate-800" data-testid="submit-worker-btn">
              Agregar trabajador
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Tramite Dialog */}
      <Dialog open={showAddTramite} onOpenChange={setShowAddTramite}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Asignar tramite</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <Select value={tramiteForm.country} onValueChange={v => setTramiteForm({...tramiteForm, country: v, tramite_id: ''})}>
              <SelectTrigger data-testid="tramite-country-select"><SelectValue placeholder="Seleccionar pais" /></SelectTrigger>
              <SelectContent>
                {Object.entries(allTramites).map(([key, val]) => (
                  <SelectItem key={key} value={key}>{val.name || key}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {tramiteForm.country && (
              <Select value={tramiteForm.tramite_id} onValueChange={v => setTramiteForm({...tramiteForm, tramite_id: v})}>
                <SelectTrigger data-testid="tramite-type-select"><SelectValue placeholder="Seleccionar tramite" /></SelectTrigger>
                <SelectContent>
                  {countryTramites.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Textarea placeholder="Notas (opcional)" value={tramiteForm.notes} onChange={e => setTramiteForm({...tramiteForm, notes: e.target.value})} />
            <Button onClick={handleAddTramite} className="w-full bg-slate-900 hover:bg-slate-800" data-testid="submit-tramite-btn">
              Asignar tramite
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Send Credentials Dialog */}
      <Dialog open={showSendCreds} onOpenChange={setShowSendCreds}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Enviar credenciales</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="sendMode" checked={sendMode === 'registro'} onChange={() => setSendMode('registro')} className="accent-slate-900" />
                <span className="text-sm text-slate-700">Enviar al correo de registro ({company.email || 'sin email'})</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="sendMode" checked={sendMode === 'custom'} onChange={() => setSendMode('custom')} className="accent-slate-900" />
                <span className="text-sm text-slate-700">Ingresar correo de envio</span>
              </label>
            </div>
            {sendMode === 'custom' && (
              <Input placeholder="correo@ejemplo.com" value={customEmail} onChange={e => setCustomEmail(e.target.value)} data-testid="custom-email-input" />
            )}
            <Button
              onClick={handleSendCredentials}
              className="w-full bg-slate-900 hover:bg-slate-800"
              disabled={sendMode === 'custom' && !customEmail.trim()}
              data-testid="confirm-send-creds-btn"
            >
              Enviar credenciales
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
