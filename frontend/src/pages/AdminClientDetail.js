import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  ArrowLeft, Download, Trash2, MoreHorizontal, CheckCircle, Clock,
  Mail, Phone, MapPin, Globe, FileText, Image as ImageIcon, User,
  Upload, Package, Tag, Eye, X, Pencil, FileDown, Users
} from 'lucide-react';

const CATEGORY_LABELS = {
  identificacion: 'Identificacion',
  residencia: 'Residencia',
  trabajo: 'Trabajo',
  resolucion: 'Resolucion',
  contrato: 'Contrato',
  fiscal: 'Fiscal',
  otros: 'Otros'
};

const ADMIN_CATEGORIES = [
  { value: "resolucion", label: "Resolucion" },
  { value: "contrato", label: "Contrato" },
  { value: "identificacion", label: "Identificacion" },
  { value: "residencia", label: "Residencia" },
  { value: "trabajo", label: "Trabajo" },
  { value: "fiscal", label: "Fiscal" },
  { value: "otros", label: "Otros" },
];

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

function InfoItem({ icon: Icon, label, value }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Icon className="w-4 h-4 text-slate-500" strokeWidth={1.5} />
      </div>
      <div>
        <p className="text-xs text-slate-400 uppercase tracking-wider font-medium">{label}</p>
        <p className="text-sm text-slate-800 font-medium mt-0.5" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>{value}</p>
      </div>
    </div>
  );
}

export default function AdminClientDetail() {
  const { clientId } = useParams();
  const navigate = useNavigate();
  const [client, setClient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadCategory, setUploadCategory] = useState('resolucion');
  const [downloading, setDownloading] = useState(false);
  const [previewDoc, setPreviewDoc] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [renamingDoc, setRenamingDoc] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const fileInputRef = useRef(null);

  const fetchClient = useCallback(async () => {
    try {
      const res = await api.get(`/clients/${clientId}`);
      setClient(res.data);
    } catch (err) {
      toast.error('Error cargando datos del cliente');
      navigate('/admin/clients');
    } finally {
      setLoading(false);
    }
  }, [clientId, navigate]);

  useEffect(() => {
    fetchClient();
  }, [fetchClient]);

  const handleAdminUpload = async (files) => {
    if (!files || files.length === 0) return;

    const MAX_SIZE = 5 * 1024 * 1024;
    for (const file of files) {
      if (file.size > MAX_SIZE) {
        const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
        toast.error(`El archivo "${file.name}" pesa ${sizeMb} MB, el maximo son 5MB. Comprime en https://www.ilovepdf.com/es/comprimir_pdf`, { duration: 8000 });
        return;
      }
    }

    setUploading(true);
    let successCount = 0;
    for (const file of files) {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('category', uploadCategory);
      try {
        await api.post(`/clients/${clientId}/documents/upload`, formData);
        successCount++;
      } catch (err) {
        toast.error(`${file.name}: ${err.response?.data?.detail || 'Error'}`);
      }
    }
    if (successCount > 0) {
      toast.success(`${successCount} documento(s) subido(s) al perfil del cliente`);
      fetchClient();
    }
    setUploading(false);
  };

  const handleBulkDownload = async () => {
    setDownloading(true);
    try {
      const res = await api.get(`/clients/${clientId}/download-all`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `documentos_${(client?.name || 'cliente').replace(/\s/g, '_')}.zip`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success('Descarga iniciada');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error descargando documentos');
    } finally {
      setDownloading(false);
    }
  };

  const handleDownloadFicha = async () => {
    try {
      const res = await api.get(`/clients/${clientId}/ficha`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Ficha_Tramilex_${(client?.name || 'cliente').replace(/\s/g, '_')}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      toast.error('Error generando ficha');
    }
  };

  const handlePreview = async (doc) => {
    try {
      const res = await api.get(`/documents/${doc.id}/preview`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(res.data);
      setPreviewUrl(url);
      setPreviewDoc(doc);
    } catch (err) {
      toast.error('Error cargando vista previa');
    }
  };

  const closePreview = () => {
    if (previewUrl) window.URL.revokeObjectURL(previewUrl);
    setPreviewDoc(null);
    setPreviewUrl(null);
  };

  const startRename = (doc) => {
    setRenamingDoc(doc.id);
    setRenameValue(doc.display_name || doc.original_filename);
  };

  const handleRename = async (docId) => {
    if (!renameValue.trim()) return;
    try {
      await api.put(`/documents/${docId}/rename`, { display_name: renameValue.trim() });
      toast.success('Nombre actualizado');
      setRenamingDoc(null);
      fetchClient();
    } catch (err) {
      toast.error('Error renombrando documento');
    }
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

  const handleDeleteDoc = async (docId) => {
    if (!window.confirm('Eliminar este documento?')) return;
    try {
      await api.delete(`/documents/${docId}`);
      toast.success('Documento eliminado');
      fetchClient();
    } catch (err) {
      toast.error('Error eliminando documento');
    }
  };

  const handleStatusChange = async (docId, newStatus) => {
    try {
      await api.put(`/documents/${docId}/status`, { status: newStatus });
      toast.success('Estado actualizado');
      fetchClient();
    } catch (err) {
      toast.error('Error actualizando estado');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-slate-900 border-t-transparent" />
      </div>
    );
  }

  if (!client) return null;

  return (
    <div data-testid="admin-client-detail-page">
      {/* Back button */}
      <Button
        variant="ghost"
        size="sm"
        className="mb-6 text-slate-500 hover:text-slate-900 gap-2 -ml-2"
        onClick={() => navigate('/admin/clients')}
        data-testid="back-to-clients-btn"
      >
        <ArrowLeft className="w-4 h-4" />
        Volver a clientes
      </Button>

      {/* Client Info Card */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-6 md:p-8 mb-8">
        <div className="flex items-start gap-4 mb-6">
          <div className="w-14 h-14 rounded-full bg-slate-900 flex items-center justify-center flex-shrink-0">
            <span className="text-xl text-white font-bold" style={{ fontFamily: 'Manrope, sans-serif' }}>
              {(client.name || '?').charAt(0).toUpperCase()}
            </span>
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>
              {client.name}
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Registrado el {formatDate(client.created_at)}
            </p>
          </div>
          <div className="ml-auto">
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-slate-600"
              onClick={handleDownloadFicha}
              data-testid="download-ficha-btn"
            >
              <FileDown className="w-4 h-4" />
              Descargar Ficha PDF
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <InfoItem icon={Mail} label="Email" value={client.email} />
          <InfoItem icon={Phone} label="Telefono" value={client.phone} />
          <InfoItem icon={User} label="NIE" value={client.nie} />
          <InfoItem icon={Globe} label="Pasaporte" value={client.passport_number} />
          <InfoItem icon={MapPin} label="Direccion" value={client.address} />
          <InfoItem icon={MapPin} label="Ciudad" value={client.city} />
          <InfoItem icon={Globe} label="Pais de origen" value={client.origin_country} />
          <InfoItem icon={Globe} label="Pais de residencia" value={client.residence_country} />
        </div>

        {/* Family Info */}
        {(client.father_name || client.mother_name || (client.children && client.children.length > 0)) && (
          <div className="mt-6 pt-6 border-t border-slate-200">
            <div className="flex items-center gap-2 mb-4">
              <Users className="w-4 h-4 text-slate-500" strokeWidth={1.5} />
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Datos Familiares</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <InfoItem icon={User} label="Nombre del padre" value={client.father_name} />
              <InfoItem icon={User} label="Nombre de la madre" value={client.mother_name} />
              {client.children && client.children.map((child, idx) => (
                child && <InfoItem key={idx} icon={User} label={`Hijo/a ${idx + 1}`} value={child} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Admin Upload + Documents */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base md:text-lg font-semibold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>
            Documentos ({client.documents?.length || 0})
          </h2>
          <div className="flex items-center gap-2">
            {client.documents?.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2 text-slate-600"
                onClick={handleBulkDownload}
                disabled={downloading}
                data-testid="bulk-download-btn"
              >
                <Package className="w-4 h-4" />
                {downloading ? 'Descargando...' : 'Descargar todos (ZIP)'}
              </Button>
            )}
          </div>
        </div>

        {/* Admin Upload Section */}
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-5 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
              <Upload className="w-4 h-4 text-indigo-600" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800" style={{ fontFamily: 'Manrope, sans-serif' }}>
                Subir documento al cliente
              </p>
              <p className="text-xs text-slate-500">El cliente recibira una notificacion por email</p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <Select value={uploadCategory} onValueChange={setUploadCategory}>
              <SelectTrigger className="w-full sm:w-48 h-10 bg-white border-slate-300" data-testid="admin-upload-category-select">
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent>
                {ADMIN_CATEGORIES.map(c => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.heic,.heif,image/*,application/pdf"
              className="hidden"
              onChange={(e) => handleAdminUpload(Array.from(e.target.files))}
              data-testid="admin-file-input"
            />
            <Button
              className="h-10 bg-slate-900 hover:bg-slate-800 text-white rounded-md font-medium gap-2"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              data-testid="admin-upload-btn"
            >
              <Upload className="w-4 h-4" />
              {uploading ? 'Subiendo...' : 'Seleccionar archivos'}
            </Button>
          </div>
        </div>

        {!client.documents || client.documents.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-lg p-12 text-center">
            <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500">Este cliente no tiene documentos</p>
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
                  <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 py-3 px-4 text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {client.documents.map((doc) => (
                  <TableRow key={doc.id} className="hover:bg-slate-50 transition-colors">
                    <TableCell className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        {getFileIcon(doc.content_type)}
                        {renamingDoc === doc.id ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={renameValue}
                              onChange={e => setRenameValue(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') handleRename(doc.id); if (e.key === 'Escape') setRenamingDoc(null); }}
                              className="text-sm border border-slate-300 rounded px-2 py-1 w-44 focus:ring-1 focus:ring-slate-900 focus:border-slate-900 outline-none"
                              autoFocus
                              data-testid={`rename-input-${doc.id}`}
                            />
                            <button onClick={() => handleRename(doc.id)} className="text-emerald-600 hover:text-emerald-700" data-testid={`rename-save-${doc.id}`}>
                              <CheckCircle className="w-4 h-4" />
                            </button>
                            <button onClick={() => setRenamingDoc(null)} className="text-slate-400 hover:text-slate-600" data-testid={`rename-cancel-${doc.id}`}>
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 group/name">
                            <span className="text-sm font-medium text-slate-800 truncate max-w-[180px]" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>
                              {doc.display_name || doc.original_filename}
                            </span>
                            <button
                              onClick={() => startRename(doc)}
                              className="text-slate-300 hover:text-slate-600 opacity-0 group-hover/name:opacity-100 transition-opacity"
                              data-testid={`rename-btn-${doc.id}`}
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-3 px-4">
                      <div className="flex items-center gap-1.5">
                        <Tag className="w-3 h-3 text-slate-400" />
                        <span className="text-sm text-slate-600">{CATEGORY_LABELS[doc.category] || doc.category || 'Otros'}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-3 px-4">
                      <Badge
                        className={`text-xs font-medium ${
                          doc.uploaded_by === 'admin'
                            ? 'bg-indigo-100 text-indigo-700 border-indigo-200'
                            : 'bg-slate-100 text-slate-700 border-slate-200'
                        }`}
                      >
                        {doc.uploaded_by === 'admin' ? 'Abogado' : 'Cliente'}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-3 px-4">
                      <div className="flex items-center gap-1.5 text-sm text-slate-500">
                        <Clock className="w-3.5 h-3.5" />
                        <span style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>{formatDate(doc.uploaded_at)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-3 px-4">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            className="cursor-pointer"
                            data-testid={`status-dropdown-${doc.id}`}
                          >
                            <Badge
                              className={`text-xs font-medium cursor-pointer hover:opacity-80 transition-opacity ${
                                doc.status === 'reviewed'
                                  ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                                  : 'bg-amber-100 text-amber-700 border-amber-200'
                              }`}
                            >
                              {doc.status === 'reviewed' ? 'Revisado' : 'Pendiente'}
                            </Badge>
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          <DropdownMenuItem
                            onClick={() => handleStatusChange(doc.id, 'pending_review')}
                            className="gap-2 text-sm"
                            data-testid={`set-pending-${doc.id}`}
                          >
                            <Clock className="w-3.5 h-3.5 text-amber-600" />
                            Pendiente de revision
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleStatusChange(doc.id, 'reviewed')}
                            className="gap-2 text-sm"
                            data-testid={`set-reviewed-${doc.id}`}
                          >
                            <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                            Revisado
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                    <TableCell className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-slate-500 hover:text-indigo-600 hover:bg-indigo-50"
                          onClick={() => handlePreview(doc)}
                          data-testid={`preview-doc-${doc.id}`}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-slate-500 hover:text-sky-600 hover:bg-sky-50"
                          onClick={() => handleDownload(doc)}
                          data-testid={`download-doc-${doc.id}`}
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-slate-400 hover:text-slate-600"
                              data-testid={`doc-actions-${doc.id}`}
                            >
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => handleDeleteDoc(doc.id)}
                              className="gap-2 text-red-600 focus:text-red-600 text-sm"
                              data-testid={`delete-doc-${doc.id}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Eliminar documento
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Preview Dialog */}
      <Dialog open={!!previewDoc} onOpenChange={(open) => { if (!open) closePreview(); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] p-0 overflow-hidden">
          <DialogHeader className="px-6 py-4 border-b border-slate-200 flex flex-row items-center justify-between">
            <DialogTitle className="text-sm font-semibold text-slate-800 truncate pr-4" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>
              {previewDoc?.original_filename}
            </DialogTitle>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button
                variant="outline"
                size="sm"
                className="gap-2 text-xs"
                onClick={() => previewDoc && handleDownload(previewDoc)}
                data-testid="preview-download-btn"
              >
                <Download className="w-3.5 h-3.5" />
                Descargar
              </Button>
            </div>
          </DialogHeader>
          <div className="flex items-center justify-center bg-slate-100 overflow-auto" style={{ minHeight: '400px', maxHeight: 'calc(90vh - 80px)' }}>
            {previewUrl && previewDoc?.content_type?.startsWith('image/') && (
              <img
                src={previewUrl}
                alt={previewDoc.original_filename}
                className="max-w-full max-h-[calc(90vh-80px)] object-contain"
                data-testid="preview-image"
              />
            )}
            {previewUrl && previewDoc?.content_type === 'application/pdf' && (
              <iframe
                src={previewUrl}
                title={previewDoc.original_filename}
                className="w-full h-full border-0"
                style={{ minHeight: '70vh' }}
                data-testid="preview-pdf"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
