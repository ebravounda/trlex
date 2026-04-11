import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Search, ChevronRight, Users, FileText, Trash2 } from 'lucide-react';

export default function AdminClients() {
  const [clients, setClients] = useState([]);
  const [countries, setCountries] = useState([]);
  const [search, setSearch] = useState('');
  const [countryFilter, setCountryFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const fetchClients = useCallback(async () => {
    try {
      const params = {};
      if (search) params.search = search;
      if (countryFilter) params.origin_country = countryFilter;
      const res = await api.get('/clients', { params });
      setClients(res.data);
    } catch (err) {
      toast.error('Error cargando clientes');
    } finally {
      setLoading(false);
    }
  }, [search, countryFilter]);

  const fetchCountries = useCallback(async () => {
    try {
      const res = await api.get('/clients/countries/list');
      setCountries(res.data);
    } catch (err) {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchCountries();
  }, [fetchCountries]);

  useEffect(() => {
    const timer = setTimeout(() => fetchClients(), 300);
    return () => clearTimeout(timer);
  }, [fetchClients]);

  const handleDeleteClient = async (clientId, clientName) => {
    if (!window.confirm(`Eliminar a ${clientName} y todos sus documentos?`)) return;
    try {
      await api.delete(`/clients/${clientId}`);
      toast.success('Cliente eliminado');
      fetchClients();
    } catch (err) {
      toast.error('Error eliminando cliente');
    }
  };

  return (
    <div data-testid="admin-clients-page">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>
          Clientes
        </h1>
        <p className="text-sm text-slate-500 mt-1">Gestiona los clientes registrados y sus documentos</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre, NIE, pasaporte o email..."
            className="pl-9 h-10 bg-white border-slate-300"
            data-testid="search-clients-input"
          />
        </div>
        <Select value={countryFilter} onValueChange={v => setCountryFilter(v === '_all' ? '' : v)}>
          <SelectTrigger className="w-full sm:w-56 h-10 bg-white border-slate-300" data-testid="filter-country-select">
            <SelectValue placeholder="Pais de origen" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">Todos los paises</SelectItem>
            {countries.map(c => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="bg-white border border-slate-200 rounded-lg p-5 flex items-center gap-4 shadow-sm">
          <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
            <Users className="w-5 h-5 text-slate-600" strokeWidth={1.5} />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>{clients.length}</p>
            <p className="text-xs text-slate-500 uppercase tracking-wider font-medium">Clientes registrados</p>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-5 flex items-center gap-4 shadow-sm">
          <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
            <FileText className="w-5 h-5 text-slate-600" strokeWidth={1.5} />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>
              {clients.reduce((sum, c) => sum + (c.document_count || 0), 0)}
            </p>
            <p className="text-xs text-slate-500 uppercase tracking-wider font-medium">Documentos totales</p>
          </div>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-slate-900 border-t-transparent" />
        </div>
      ) : clients.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-16 text-center">
          <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500">
            {search || countryFilter ? 'No se encontraron clientes con los filtros aplicados' : 'Aun no hay clientes registrados'}
          </p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/50">
                <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 py-3 px-4">Nombre</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 py-3 px-4">NIE / Pasaporte</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 py-3 px-4 hidden md:table-cell">Email</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 py-3 px-4 hidden lg:table-cell">Pais origen</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 py-3 px-4 text-center">Docs</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 py-3 px-4 text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.map((client) => (
                <TableRow
                  key={client.id}
                  className="hover:bg-slate-50 transition-colors cursor-pointer group"
                  onClick={() => navigate(`/admin/clients/${client.id}`)}
                  data-testid={`client-row-${client.id}`}
                >
                  <TableCell className="py-3 px-4">
                    <span className="text-sm font-medium text-slate-800">{client.name}</span>
                  </TableCell>
                  <TableCell className="py-3 px-4" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>
                    <div className="text-sm text-slate-600">
                      {client.nie && <span className="block">NIE: {client.nie}</span>}
                      {client.passport_number && <span className="block">Pass: {client.passport_number}</span>}
                      {!client.nie && !client.passport_number && <span className="text-slate-400">-</span>}
                    </div>
                  </TableCell>
                  <TableCell className="py-3 px-4 hidden md:table-cell text-sm text-slate-500">{client.email}</TableCell>
                  <TableCell className="py-3 px-4 hidden lg:table-cell text-sm text-slate-500">{client.origin_country || '-'}</TableCell>
                  <TableCell className="py-3 px-4 text-center">
                    <Badge variant="secondary" className="text-xs">
                      {client.document_count || 0}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-400 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => handleDeleteClient(client.id, client.name)}
                        data-testid={`delete-client-${client.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                      <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors" />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
