import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Upload, Download, LogOut, FileText, Image as ImageIcon, Clock, Tag, ClipboardList, ChevronDown } from 'lucide-react';

const LOGO_URL = "https://tramilex.es/wp-content/uploads/2024/07/logo-tramilex-v3-1.jpg";

const CLIENT_CATEGORIES = [
  { value: "identificacion", label: "Identificacion" },
  { value: "residencia", label: "Residencia" },
  { value: "trabajo", label: "Trabajo" },
  { value: "contrato", label: "Contrato" },
  { value: "fiscal", label: "Fiscal" },
  { value: "otros", label: "Otros" },
];

const CATEGORY_LABELS = {
  identificacion: 'Identificacion', residencia: 'Residencia', trabajo: 'Trabajo',
  resolucion: 'Resolucion', contrato: 'Contrato', fiscal: 'Fiscal', otros: 'Otros'
};

function formatDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatSize(bytes) {
  if (!bytes) return '-';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function getFileIcon(contentType) {
  if (contentType?.startsWith('image/')) return <ImageIcon className="w-4 h-4 text-sky-600" />;
  return <FileText className="w-4 h-4 text-red-500" />;
}

export default function ClientDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [documents, setDocuments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('otros');
  const [tramiteInfo, setTramiteInfo] = useState(null);
  const [requisitosOpen, setRequisitosOpen] = useState(false);
  const fileInputRef = useRef(null);

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await api.get('/documents');
      setDocuments(res.data);
    } catch (err) {
      toast.error('Error cargando documentos');
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  useEffect(() => {
    if (user?.country && user?.tramite_type) {
      api.get(`/tramites/${user.country}/${user.tramite_type}`).then(res => {
        setTramiteInfo(res.data);
      }).catch(() => {});
    }
  }, [user?.country, user?.tramite_type]);

  const handleUpload = async (files) => {
    if (!files || files.length === 0) return;

    const MAX_SIZE = 5 * 1024 * 1024;
    for (const file of files) {
      if (file.size > MAX_SIZE) {
        const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
        toast.error(
          <div>
            <p className="font-medium">Tu documento "{file.name}" pesa {sizeMb} MB, el maximo son 5MB.</p>
            <p className="mt-1">Comprime tu archivo aqui: <a href="https://www.ilovepdf.com/es/comprimir_pdf" target="_blank" rel="noopener noreferrer" className="underline font-semibold">ilovepdf.com</a></p>
          </div>,
          { duration: 8000 }
        );
        return;
      }
    }

    setUploading(true);
    let successCount = 0;

    for (const file of files) {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('category', selectedCategory);
      try {
        await api.post('/documents/upload', formData);
        successCount++;
      } catch (err) {
        const msg = err.response?.data?.detail || 'Error subiendo archivo';
        toast.error(`${file.name}: ${msg}`, { duration: 8000 });
      }
    }

    if (successCount > 0) {
      toast.success(`${successCount} documento(s) subido(s) correctamente`);
      fetchDocuments();
    }
    setUploading(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleUpload(Array.from(e.dataTransfer.files));
  };

  const handleDownload = async (doc) => {
    try {
      const res = await api.get(`/documents/${doc.id}/download`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.original_filename;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      toast.error('Error descargando documento');
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-slate-50" data-testid="client-dashboard">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white/80 backdrop-blur-xl border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <img src={LOGO_URL} alt="Tramilex" className="h-9 object-contain" data-testid="client-logo" />
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-600 hidden sm:inline">
              Hola, <span className="font-semibold text-slate-900">{user?.name}</span>
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="text-slate-500 hover:text-red-600 hover:bg-red-50 gap-2"
              onClick={handleLogout}
              data-testid="client-logout-btn"
            >
              <LogOut className="w-4 h-4" strokeWidth={1.5} />
              <span className="hidden sm:inline">Salir</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 md:py-12 space-y-8">
        {/* Required Documents Info */}
        {tramiteInfo && (
          <>
            {/* Mobile: Collapsible button */}
            <div className="md:hidden bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden" data-testid="requisitos-mobile">
              <button
                onClick={() => setRequisitosOpen(!requisitosOpen)}
                className="w-full flex items-center justify-between p-4 text-left"
                data-testid="requisitos-toggle-btn"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-sky-100 flex items-center justify-center shrink-0">
                    <ClipboardList className="w-4 h-4 text-sky-600" strokeWidth={1.5} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800" style={{ fontFamily: 'Manrope, sans-serif' }}>
                      Requisitos
                    </p>
                    <p className="text-xs text-slate-500">{tramiteInfo.name}</p>
                  </div>
                </div>
                <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform duration-200 ${requisitosOpen ? 'rotate-180' : ''}`} />
              </button>
              <div
                className={`transition-all duration-300 ease-in-out overflow-hidden ${requisitosOpen ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'}`}
                data-testid="requisitos-mobile-content"
              >
                <div className="px-4 pb-4 space-y-3 border-t border-slate-100 pt-3">
                  {tramiteInfo?.requirements?.length > 0 && (
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Requisitos</p>
                      <ul className="space-y-1.5">
                        {tramiteInfo.requirements.map((r, i) => (
                          <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
                            <span className="text-emerald-500 mt-0.5 font-bold">-</span> {r}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {tramiteInfo.docs_persona?.length > 0 && (
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Documentos personales</p>
                      <ul className="space-y-1.5">
                        {tramiteInfo.docs_persona.map((d, i) => (
                          <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
                            <span className="text-sky-500 mt-0.5 font-bold">-</span> {d}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {tramiteInfo.docs_empresa?.length > 0 && (
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Documentos empresa</p>
                      <ul className="space-y-1.5">
                        {tramiteInfo.docs_empresa.map((d, i) => (
                          <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
                            <span className="text-sky-500 mt-0.5 font-bold">-</span> {d}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Desktop: Full display */}
            <div className="hidden md:block bg-white border border-slate-200 rounded-lg shadow-sm p-5" data-testid="requisitos-desktop">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-full bg-sky-100 flex items-center justify-center">
                  <ClipboardList className="w-4 h-4 text-sky-600" strokeWidth={1.5} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800" style={{ fontFamily: 'Manrope, sans-serif' }}>
                    {tramiteInfo.name}
                  </p>
                  <p className="text-xs text-slate-500">Documentos que necesitas subir para tu tramite</p>
                </div>
              </div>
              {tramiteInfo?.requirements?.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Requisitos</p>
                  <ul className="space-y-1.5">
                    {tramiteInfo.requirements.map((r, i) => (
                      <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
                        <span className="text-emerald-500 mt-0.5 font-bold">-</span> {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {tramiteInfo.docs_persona?.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Documentos personales</p>
                  <ul className="space-y-1.5">
                    {tramiteInfo.docs_persona.map((d, i) => (
                      <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
                        <span className="text-sky-500 mt-0.5 font-bold">-</span> {d}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {tramiteInfo.docs_empresa?.length > 0 && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Documentos empresa</p>
                  <ul className="space-y-1.5">
                    {tramiteInfo.docs_empresa.map((d, i) => (
                      <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
                        <span className="text-sky-500 mt-0.5 font-bold">-</span> {d}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </>
        )}

        {/* Category Select + Upload Zone */}
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Tag className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-medium text-slate-700">Categoria del documento:</span>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-48 h-9 bg-white border-slate-300" data-testid="upload-category-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CLIENT_CATEGORIES.map(c => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`relative border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-all duration-200 ${
              dragOver
                ? 'border-sky-500 bg-sky-50/50'
                : 'border-slate-300 bg-white hover:border-slate-400 hover:bg-slate-50'
            }`}
            data-testid="upload-zone"
          >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.heic,.heif,image/*,application/pdf"
            className="hidden"
            onChange={(e) => handleUpload(Array.from(e.target.files))}
            data-testid="file-input"
          />
          <div className="flex flex-col items-center gap-3">
            <div className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${
              dragOver ? 'bg-sky-100' : 'bg-slate-100'
            }`}>
              <Upload className={`w-6 h-6 ${dragOver ? 'text-sky-600' : 'text-slate-500'}`} strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-base font-semibold text-slate-800" style={{ fontFamily: 'Manrope, sans-serif' }}>
                {uploading ? 'Subiendo archivos...' : 'Arrastra tus documentos aqui'}
              </p>
              <p className="text-sm text-slate-500 mt-1">
                o haz clic para seleccionar archivos (PDF, JPG, PNG - Max 5MB)
              </p>
            </div>
          </div>
          {uploading && (
            <div className="absolute inset-0 bg-white/70 flex items-center justify-center rounded-lg">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-slate-900 border-t-transparent" />
            </div>
          )}
          </div>
        </div>

        {/* Documents Table */}
        <div>
          <h2 className="text-base md:text-lg font-semibold text-slate-900 mb-4" style={{ fontFamily: 'Manrope, sans-serif' }}>
            Mis documentos ({documents.length})
          </h2>

          {documents.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-lg p-12 text-center">
              <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-500">Aun no has subido ningun documento</p>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/50">
                    <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 py-3 px-4">Archivo</TableHead>
                    <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 py-3 px-4">Categoria</TableHead>
                    <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 py-3 px-4">Subido por</TableHead>
                    <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 py-3 px-4">Fecha</TableHead>
                    <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 py-3 px-4">Estado</TableHead>
                    <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 py-3 px-4 text-right">Accion</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documents.map((doc) => (
                    <TableRow key={doc.id} className="hover:bg-slate-50 transition-colors">
                      <TableCell className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          {getFileIcon(doc.content_type)}
                          <span className="text-sm font-medium text-slate-800 truncate max-w-[180px]" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>
                            {doc.display_name || doc.original_filename}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="py-3 px-4">
                        <span className="text-sm text-slate-600">{CATEGORY_LABELS[doc.category] || 'Otros'}</span>
                      </TableCell>
                      <TableCell className="py-3 px-4">
                        <Badge
                          className={`text-xs font-medium ${
                            doc.uploaded_by === 'admin'
                              ? 'bg-indigo-100 text-indigo-700 border-indigo-200'
                              : 'bg-slate-100 text-slate-700 border-slate-200'
                          }`}
                        >
                          {doc.uploaded_by === 'admin' ? 'Abogado' : 'Yo'}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-3 px-4">
                        <div className="flex items-center gap-1.5 text-sm text-slate-500">
                          <Clock className="w-3.5 h-3.5" />
                          <span style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>{formatDate(doc.uploaded_at)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="py-3 px-4">
                        <Badge
                          className={`text-xs font-medium ${
                            doc.status === 'reviewed'
                              ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                              : 'bg-amber-100 text-amber-700 border-amber-200'
                          }`}
                          data-testid={`status-badge-${doc.status}`}
                        >
                          {doc.status === 'reviewed' ? 'Revisado' : 'Pendiente de revision'}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-3 px-4 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-slate-500 hover:text-sky-600 hover:bg-sky-50"
                          onClick={() => handleDownload(doc)}
                          data-testid={`download-doc-${doc.id}`}
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
