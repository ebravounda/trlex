import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import {
  ArrowLeft, Download, Trash2, MoreHorizontal, CheckCircle, Clock,
  Mail, Phone, MapPin, Globe, FileText, Image as ImageIcon, User
} from 'lucide-react';

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
      </div>

      {/* Documents */}
      <div>
        <h2 className="text-base md:text-lg font-semibold text-slate-900 mb-4" style={{ fontFamily: 'Manrope, sans-serif' }}>
          Documentos ({client.documents?.length || 0})
        </h2>

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
                  <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 py-3 px-4">Tamano</TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 py-3 px-4">Fecha de carga</TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 py-3 px-4">Estado</TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 py-3 px-4 text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {client.documents.map((doc) => (
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
    </div>
  );
}
