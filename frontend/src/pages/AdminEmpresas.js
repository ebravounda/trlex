import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Building2, Plus, Search, Users, FileText, Trash2, Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function AdminEmpresas() {
  const [companies, setCompanies] = useState([]);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createdCreds, setCreatedCreds] = useState(null);
  const [countryFilter, setCountryFilter] = useState('');
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: '', cif_nif: '', email: '', phone: '', address: '', city: '', contact_person: ''
  });

  const fetchCompanies = useCallback(async () => {
    try {
      const res = await api.get('/companies');
      setCompanies(res.data);
    } catch { toast.error('Error cargando empresas'); }
  }, []);

  useEffect(() => { fetchCompanies(); }, [fetchCompanies]);

  const handleCreate = async () => {
    if (!form.name.trim() || !form.cif_nif.trim()) {
      toast.error('Nombre y CIF/NIF son obligatorios');
      return;
    }
    setCreating(true);
    try {
      const res = await api.post('/companies', form);
      setCreatedCreds({ cif_nif: res.data.cif_nif, password: res.data.password, name: res.data.name });
      setForm({ name: '', cif_nif: '', email: '', phone: '', address: '', city: '', contact_person: '' });
      setShowCreate(false);
      fetchCompanies();
      toast.success('Empresa creada exitosamente');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error creando empresa');
    }
    setCreating(false);
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Eliminar empresa "${name}"? Se eliminaran todos sus trabajadores y documentos.`)) return;
    try {
      await api.delete(`/companies/${id}`);
      fetchCompanies();
      toast.success('Empresa eliminada');
    } catch { toast.error('Error eliminando empresa'); }
  };

  const copyCredentials = () => {
    if (!createdCreds) return;
    const text = `Usuario (CIF/NIF): ${createdCreds.cif_nif}\nContrasena: ${createdCreds.password}`;
    navigator.clipboard.writeText(text);
    toast.success('Credenciales copiadas al portapapeles');
  };

  const filtered = companies.filter(c => {
    const matchSearch = c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.cif_nif.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase());
    const matchCountry = !countryFilter || (c.tramite_countries || []).includes(countryFilter);
    return matchSearch && matchCountry;
  });

  return (
    <div className="space-y-6" data-testid="admin-empresas">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>Empresas</h1>
          <p className="text-sm text-slate-500 mt-1">Gestiona las empresas y sus trabajadores</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="bg-slate-900 hover:bg-slate-800 gap-2" data-testid="create-company-btn">
          <Plus className="w-4 h-4" /> Nueva empresa
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-lg px-3 py-2 flex-1">
          <Search className="w-4 h-4 text-slate-400" />
          <Input
            placeholder="Buscar por nombre, CIF/NIF o email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="border-0 focus-visible:ring-0 p-0 h-auto"
            data-testid="search-companies"
          />
        </div>
        <Select value={countryFilter || '_all'} onValueChange={v => setCountryFilter(v === '_all' ? '' : v)}>
          <SelectTrigger className="w-full sm:w-48 bg-white" data-testid="filter-company-country">
            <SelectValue placeholder="Tramite en..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">Todos</SelectItem>
            <SelectItem value="espana">Espana</SelectItem>
            <SelectItem value="chile">Chile</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-sky-50 flex items-center justify-center">
            <Building2 className="w-5 h-5 text-sky-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">{companies.length}</p>
            <p className="text-xs uppercase tracking-wider text-slate-500">Empresas registradas</p>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center">
            <Users className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">{companies.reduce((a, c) => a + c.worker_count, 0)}</p>
            <p className="text-xs uppercase tracking-wider text-slate-500">Trabajadores totales</p>
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-12 text-center">
          <Building2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500">No hay empresas registradas</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/50">
                <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500">Empresa</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500">CIF/NIF</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 hidden sm:table-cell">Contacto</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 text-center">Trabajadores</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 text-center">Tramites</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(c => (
                <TableRow key={c.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => navigate(`/admin/empresas/${c.id}`)}>
                  <TableCell className="py-3 px-4">
                    <p className="text-sm font-semibold text-slate-800">{c.name}</p>
                    <p className="text-xs text-slate-500">{c.email}</p>
                  </TableCell>
                  <TableCell className="py-3 px-4">
                    <Badge className="bg-slate-100 text-slate-700 border-slate-200 text-xs">{c.cif_nif}</Badge>
                  </TableCell>
                  <TableCell className="py-3 px-4 hidden sm:table-cell">
                    <p className="text-sm text-slate-600">{c.contact_person || '-'}</p>
                    <p className="text-xs text-slate-400">{c.phone}</p>
                  </TableCell>
                  <TableCell className="py-3 px-4 text-center">
                    <Badge className="bg-sky-100 text-sky-700 border-sky-200">{c.worker_count}</Badge>
                  </TableCell>
                  <TableCell className="py-3 px-4 text-center">
                    <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">{c.tramite_count}</Badge>
                  </TableCell>
                  <TableCell className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                      <Button variant="ghost" size="sm" onClick={() => navigate(`/admin/empresas/${c.id}`)} data-testid={`view-company-${c.id}`}>
                        <Eye className="w-4 h-4 text-slate-500" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(c.id, c.name)} data-testid={`delete-company-${c.id}`}>
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create Company Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nueva empresa</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <Input placeholder="Nombre de la empresa *" value={form.name} onChange={e => setForm({...form, name: e.target.value})} data-testid="company-name-input" />
            <Input placeholder="CIF/NIF *" value={form.cif_nif} onChange={e => setForm({...form, cif_nif: e.target.value})} data-testid="company-cif-input" />
            <Input placeholder="Email" type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} data-testid="company-email-input" />
            <Input placeholder="Telefono" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} />
            <Input placeholder="Persona de contacto" value={form.contact_person} onChange={e => setForm({...form, contact_person: e.target.value})} />
            <Input placeholder="Direccion" value={form.address} onChange={e => setForm({...form, address: e.target.value})} />
            <Input placeholder="Ciudad" value={form.city} onChange={e => setForm({...form, city: e.target.value})} />
            <Button onClick={handleCreate} disabled={creating} className="w-full bg-slate-900 hover:bg-slate-800" data-testid="submit-company-btn">
              {creating ? 'Creando...' : 'Crear empresa'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Credentials Dialog */}
      <Dialog open={!!createdCreds} onOpenChange={() => setCreatedCreds(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Credenciales de acceso</DialogTitle>
          </DialogHeader>
          {createdCreds && (
            <div className="space-y-4 mt-2">
              <p className="text-sm text-slate-600">Empresa: <strong>{createdCreds.name}</strong></p>
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2">
                <p className="text-sm"><span className="text-slate-500">Usuario (CIF/NIF):</span> <strong className="text-slate-900">{createdCreds.cif_nif}</strong></p>
                <p className="text-sm"><span className="text-slate-500">Contrasena:</span> <strong className="text-slate-900">{createdCreds.password}</strong></p>
              </div>
              <Button onClick={copyCredentials} className="w-full bg-slate-900 hover:bg-slate-800" data-testid="copy-credentials-btn">
                Copiar credenciales
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
