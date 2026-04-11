import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { ClipboardList, ChevronLeft, ChevronRight, Upload, Trash2, RefreshCw, Settings, Download, UserX } from 'lucide-react';

const ACTION_LABELS = {
  document_uploaded: { label: 'Documento subido', icon: Upload, color: 'bg-sky-100 text-sky-700 border-sky-200' },
  document_deleted: { label: 'Documento eliminado', icon: Trash2, color: 'bg-red-100 text-red-700 border-red-200' },
  document_status_changed: { label: 'Estado cambiado', icon: RefreshCw, color: 'bg-amber-100 text-amber-700 border-amber-200' },
  client_deleted: { label: 'Cliente eliminado', icon: UserX, color: 'bg-red-100 text-red-700 border-red-200' },
  admin_uploaded_document: { label: 'Admin subio documento', icon: Upload, color: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  smtp_updated: { label: 'SMTP actualizado', icon: Settings, color: 'bg-slate-100 text-slate-700 border-slate-200' },
  bulk_download: { label: 'Descarga masiva', icon: Download, color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  document_renamed: { label: 'Doc renombrado', icon: RefreshCw, color: 'bg-violet-100 text-violet-700 border-violet-200' },
  password_changed: { label: 'Contrasena cambiada', icon: Settings, color: 'bg-slate-100 text-slate-700 border-slate-200' },
};

function formatDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function getDetailText(log) {
  const d = log.details || {};
  const parts = [];
  if (d.filename) parts.push(`Archivo: ${d.filename}`);
  if (d.category) parts.push(`Cat: ${d.category}`);
  if (d.client_name) parts.push(`Cliente: ${d.client_name}`);
  if (d.new_status) parts.push(`Estado: ${d.new_status === 'reviewed' ? 'Revisado' : 'Pendiente'}`);
  if (d.new_name) parts.push(`Nuevo nombre: ${d.new_name}`);
  if (d.smtp_host) parts.push(`Host: ${d.smtp_host}`);
  return parts.join(' | ') || '-';
}

export default function AdminAudit() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [actionFilter, setActionFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 30 };
      if (actionFilter) params.action = actionFilter;
      const res = await api.get('/audit', { params });
      setLogs(res.data.logs);
      setTotal(res.data.total);
      setPages(res.data.pages);
    } catch (err) {
      toast.error('Error cargando auditoria');
    } finally {
      setLoading(false);
    }
  }, [page, actionFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  return (
    <div data-testid="admin-audit-page">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>
          Auditoria
        </h1>
        <p className="text-sm text-slate-500 mt-1">Registro de todas las acciones realizadas en el sistema</p>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3 mb-6">
        <Select value={actionFilter} onValueChange={v => { setActionFilter(v === '_all' ? '' : v); setPage(1); }}>
          <SelectTrigger className="w-64 h-10 bg-white border-slate-300" data-testid="filter-action-select">
            <SelectValue placeholder="Filtrar por accion" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">Todas las acciones</SelectItem>
            {Object.entries(ACTION_LABELS).map(([key, { label }]) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-slate-500">{total} registros</span>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-slate-900 border-t-transparent" />
        </div>
      ) : logs.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-16 text-center">
          <ClipboardList className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500">No hay registros de auditoria</p>
        </div>
      ) : (
        <>
          <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/50">
                  <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 py-3 px-4">Fecha</TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 py-3 px-4">Accion</TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 py-3 px-4">Usuario</TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 py-3 px-4">Detalles</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log, i) => {
                  const actionInfo = ACTION_LABELS[log.action] || { label: log.action, color: 'bg-slate-100 text-slate-700 border-slate-200' };
                  return (
                    <TableRow key={i} className="hover:bg-slate-50 transition-colors">
                      <TableCell className="py-3 px-4 text-sm text-slate-500 whitespace-nowrap" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>
                        {formatDate(log.timestamp)}
                      </TableCell>
                      <TableCell className="py-3 px-4">
                        <Badge className={`text-xs font-medium ${actionInfo.color}`}>
                          {actionInfo.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-3 px-4 text-sm text-slate-700 font-medium">
                        {log.user_name || '-'}
                      </TableCell>
                      <TableCell className="py-3 px-4 text-sm text-slate-500 max-w-xs truncate" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>
                        {getDetailText(log)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {pages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <span className="text-sm text-slate-500">
                Pagina {page} de {pages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                  data-testid="prev-page-btn"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pages}
                  onClick={() => setPage(p => p + 1)}
                  data-testid="next-page-btn"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
