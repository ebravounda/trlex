import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import {
  LogOut, Users, Upload, Download, FileText, Image as ImageIcon, Clock,
  ChevronDown, ChevronUp, ClipboardList, Building2, Check, Tag
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

function formatDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function getFileIcon(ct) {
  if (ct?.startsWith('image/')) return <ImageIcon className="w-4 h-4 text-sky-600" />;
  return <FileText className="w-4 h-4 text-red-500" />;
}

export default function CompanyDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [workers, setWorkers] = useState([]);
  const [tramites, setTramites] = useState([]);
  const [expandedWorker, setExpandedWorker] = useState(null);
  const [workerDocs, setWorkerDocs] = useState({});
  const [uploadingFor, setUploadingFor] = useState(null);
  const [uploadCategory, setUploadCategory] = useState('otros');
  const fileInputRef = useRef(null);
  const activeWorkerRef = useRef(null);

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

  useEffect(() => { fetchWorkers(); fetchTramites(); }, [fetchWorkers, fetchTramites]);

  const fetchWorkerDocs = async (workerId) => {
    try {
      const companyId = user?._id || user?.id;
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

  const handleUpload = async (workerId, files) => {
    if (!files?.length) return;
    setUploadingFor(workerId);
    const companyId = user?._id || user?.id;
    let count = 0;
    for (const file of files) {
      if (file.size > 5 * 1024 * 1024) { toast.error(`${file.name} supera 5MB`); continue; }
      const fd = new FormData();
      fd.append('file', file);
      fd.append('category', uploadCategory);
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

  const handleLogout = () => { logout(); navigate('/login'); };

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
            <Button variant="ghost" size="sm" className="text-slate-500 hover:text-red-600 gap-2" onClick={handleLogout}>
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

        {/* Workers */}
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex items-center gap-3 mb-4">
            <Users className="w-5 h-5 text-slate-400" />
            <h2 className="text-base font-semibold text-slate-900">Trabajadores ({workers.length})</h2>
          </div>

          {workers.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-6">No hay trabajadores registrados. El administrador los agregara.</p>
          ) : (
            <div className="space-y-3">
              {workers.map(w => (
                <div key={w.id} className="border border-slate-200 rounded-lg overflow-hidden">
                  <div
                    className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50"
                    onClick={() => toggleWorker(w.id)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center">
                        <span className="text-xs font-bold text-slate-600">{w.name.charAt(0).toUpperCase()}</span>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{w.name}</p>
                        <p className="text-xs text-slate-500">
                          {w.nie && `NIE: ${w.nie} `}{w.doc_count} doc(s) - {w.reviewed_count} revisado(s)
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {w.doc_count > 0 && w.reviewed_count === w.doc_count && (
                        <Badge className="bg-emerald-100 text-emerald-700 text-xs gap-1"><Check className="w-3 h-3" /> Todos revisados</Badge>
                      )}
                      {expandedWorker === w.id ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                    </div>
                  </div>

                  {expandedWorker === w.id && (
                    <div className="border-t border-slate-200 p-4 bg-slate-50/50">
                      <div className="flex items-center gap-3 mb-3">
                        <Tag className="w-4 h-4 text-slate-400" />
                        <Select value={uploadCategory} onValueChange={setUploadCategory}>
                          <SelectTrigger className="w-40 h-8 text-xs bg-white"><SelectValue /></SelectTrigger>
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
                          onChange={e => {
                            handleUpload(activeWorkerRef.current, Array.from(e.target.files));
                            e.target.value = '';
                          }}
                        />
                        <Button
                          variant="outline" size="sm" className="gap-1 text-xs"
                          onClick={() => { activeWorkerRef.current = w.id; fileInputRef.current?.click(); }}
                          disabled={uploadingFor === w.id}
                        >
                          <Upload className="w-3.5 h-3.5" />
                          {uploadingFor === w.id ? 'Subiendo...' : 'Subir documento'}
                        </Button>
                      </div>

                      {(workerDocs[w.id] || []).length === 0 ? (
                        <p className="text-xs text-slate-500 text-center py-4">Sin documentos cargados</p>
                      ) : (
                        <div className="space-y-2">
                          {(workerDocs[w.id] || []).map(doc => (
                            <div key={doc.id} className="flex items-center justify-between bg-white border border-slate-200 rounded-lg p-3">
                              <div className="flex items-center gap-2.5 min-w-0">
                                {getFileIcon(doc.content_type)}
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-slate-800 truncate">{doc.display_name || doc.original_filename}</p>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <Clock className="w-3 h-3 text-slate-400" />
                                    <span className="text-xs text-slate-500">{formatDate(doc.uploaded_at)}</span>
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

      <footer className="text-center py-4">
        <p className="text-xs text-slate-400">
          Creado por <a href="https://goroky.com" target="_blank" rel="noopener noreferrer" className="text-slate-500 hover:text-slate-700 font-medium">GoRoky.com</a>
        </p>
      </footer>
    </div>
  );
}
