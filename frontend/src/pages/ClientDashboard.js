import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Upload, Download, LogOut, FileText, Image as ImageIcon, Clock } from 'lucide-react';

const LOGO_URL = "https://tramilex.es/wp-content/uploads/2024/07/logo-tramilex-v3-1.jpg";

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

  const handleUpload = async (files) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    let successCount = 0;

    for (const file of files) {
      const formData = new FormData();
      formData.append('file', file);
      try {
        await api.post('/documents/upload', formData);
        successCount++;
      } catch (err) {
        const msg = err.response?.data?.detail || 'Error subiendo archivo';
        toast.error(`${file.name}: ${msg}`);
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
        {/* Upload Zone */}
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
            accept=".pdf,.jpg,.jpeg,.png,.gif,.webp"
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
                o haz clic para seleccionar archivos (PDF, JPG, PNG - Max 10MB)
              </p>
            </div>
          </div>
          {uploading && (
            <div className="absolute inset-0 bg-white/70 flex items-center justify-center rounded-lg">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-slate-900 border-t-transparent" />
            </div>
          )}
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
                    <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 py-3 px-4">Tamano</TableHead>
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
                          <span className="text-sm font-medium text-slate-800 truncate max-w-[200px]" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>
                            {doc.original_filename}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="py-3 px-4 text-sm text-slate-500" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>
                        {formatSize(doc.size)}
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
    </div>
  );
}
