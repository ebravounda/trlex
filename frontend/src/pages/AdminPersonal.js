import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Users, Search, ChevronDown, ChevronUp, Building2, Eye, Plus, Briefcase } from 'lucide-react';

const AVATAR_COLORS = ['bg-violet-600', 'bg-sky-600', 'bg-rose-600', 'bg-teal-600', 'bg-orange-600', 'bg-indigo-600', 'bg-pink-600', 'bg-cyan-600'];
function avatarColor(name) {
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}
function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

export default function AdminPersonal() {
  const navigate = useNavigate();
  const [workers, setWorkers] = useState([]);
  const [professions, setProfessions] = useState([]);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [newProfession, setNewProfession] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [wRes, pRes] = await Promise.all([
        api.get('/personal/all'),
        api.get('/personal/professions'),
      ]);
      setWorkers(wRes.data);
      setProfessions(pRes.data);
    } catch { toast.error('Error cargando personal'); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleAddProfession = async () => {
    if (!newProfession.trim()) return;
    try {
      // Use first company or a generic one
      const companies = workers.map(w => w.company_id).filter(Boolean);
      const cid = companies[0] || 'global';
      await api.post(`/companies/${cid}/professions`, { name: newProfession.trim() });
      setNewProfession('');
      fetchData();
      toast.success('Categoria creada');
    } catch { toast.error('Error'); }
  };

  const filtered = workers.filter(w => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (w.name + ' ' + w.last_name).toLowerCase().includes(q)
      || (w.identification || '').toLowerCase().includes(q)
      || (w.company_name || '').toLowerCase().includes(q)
      || (w.profession || '').toLowerCase().includes(q);
  });

  // Group by profession
  const grouped = {};
  const uncategorized = [];
  filtered.forEach(w => {
    if (w.profession) {
      if (!grouped[w.profession]) grouped[w.profession] = [];
      grouped[w.profession].push(w);
    } else {
      uncategorized.push(w);
    }
  });

  const allKeys = [...new Set([...professions, ...Object.keys(grouped)])].sort();
  const totalWorkers = workers.length;
  const totalProfessions = allKeys.length;

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-slate-900 border-t-transparent" />
    </div>
  );

  return (
    <div className="space-y-6" data-testid="admin-personal-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500 mb-1">Recursos humanos</p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>Personal</h1>
        </div>
        <div className="flex items-center gap-2">
          <Input value={newProfession} onChange={e => setNewProfession(e.target.value)}
            placeholder="Nueva categoria..." className="w-52 h-9 text-sm" data-testid="new-profession-global"
            onKeyDown={e => { if (e.key === 'Enter') handleAddProfession(); }} />
          <Button variant="outline" size="sm" className="gap-1 h-9" onClick={handleAddProfession} data-testid="add-profession-global-btn">
            <Plus className="w-3.5 h-3.5" /> Categoria
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-center justify-between">
          <div>
            <p className="text-3xl font-bold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>{totalWorkers}</p>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mt-0.5">Trabajadores</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-sky-50 flex items-center justify-center">
            <Users className="w-5 h-5 text-sky-600" />
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-center justify-between">
          <div>
            <p className="text-3xl font-bold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>{totalProfessions}</p>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mt-0.5">Categorias</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-amber-50 flex items-center justify-center">
            <Briefcase className="w-5 h-5 text-amber-600" />
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-center justify-between">
          <div>
            <p className="text-3xl font-bold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>{uncategorized.length}</p>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mt-0.5">Sin categoria</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center">
            <Users className="w-5 h-5 text-slate-400" />
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-4 py-1">
        <Search className="w-4 h-4 text-slate-400 shrink-0" />
        <Input placeholder="Buscar por nombre, ID, empresa o categoria..." value={search} onChange={e => setSearch(e.target.value)}
          className="border-0 focus-visible:ring-0 p-0 h-10 text-sm" data-testid="personal-search" />
      </div>

      {/* Profession Accordions */}
      <div className="space-y-4">
        {allKeys.map(prof => {
          const pWorkers = grouped[prof] || [];
          const isOpen = expanded === prof;
          return (
            <div key={prof} className="bg-white border border-slate-200 rounded-xl overflow-hidden" data-testid={`profession-group-${prof}`}>
              <button onClick={() => setExpanded(isOpen ? null : prof)}
                className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className={`w-11 h-11 rounded-xl ${avatarColor(prof)} flex items-center justify-center`}>
                    <Briefcase className="w-5 h-5 text-white" />
                  </div>
                  <div className="text-left">
                    <p className="text-base font-semibold text-slate-900">{prof}</p>
                    <p className="text-xs text-slate-500">{pWorkers.length} trabajador(es)</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge className="bg-slate-100 text-slate-700 border-0 text-sm font-bold px-3">{pWorkers.length}</Badge>
                  {isOpen ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
                </div>
              </button>
              {isOpen && (
                <div className="border-t border-slate-100">
                  {pWorkers.length === 0 ? (
                    <p className="text-sm text-slate-500 text-center py-8">Sin trabajadores en esta categoria</p>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {pWorkers.map(w => (
                        <div key={w.id} className="flex items-center justify-between px-6 py-3.5 hover:bg-slate-50 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className={`w-9 h-9 rounded-full ${avatarColor(w.name)} flex items-center justify-center`}>
                              <span className="text-xs font-bold text-white">{getInitials(w.name + ' ' + (w.last_name || ''))}</span>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-slate-900">{w.name} {w.last_name || ''}</p>
                              <div className="flex items-center gap-3 mt-0.5">
                                {w.identification && <span className="text-xs text-slate-500 font-mono">{w.identification}</span>}
                                <span className="flex items-center gap-1 text-xs text-slate-400">
                                  <Building2 className="w-3 h-3" /> {w.company_name}
                                </span>
                                <span className="text-xs text-slate-400">{w.doc_count} doc(s)</span>
                              </div>
                            </div>
                          </div>
                          <Button variant="outline" size="sm" className="gap-1 text-xs h-8"
                            onClick={() => navigate(`/admin/empresas/${w.company_id}`)} data-testid={`view-worker-${w.id}`}>
                            <Eye className="w-3 h-3" /> Ver empresa
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Uncategorized */}
        {uncategorized.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <button onClick={() => setExpanded(expanded === '_none' ? null : '_none')}
              className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors">
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 rounded-xl bg-slate-200 flex items-center justify-center">
                  <Users className="w-5 h-5 text-slate-500" />
                </div>
                <div className="text-left">
                  <p className="text-base font-semibold text-slate-700">Sin categoria</p>
                  <p className="text-xs text-slate-500">{uncategorized.length} trabajador(es)</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge className="bg-slate-100 text-slate-700 border-0 text-sm font-bold px-3">{uncategorized.length}</Badge>
                {expanded === '_none' ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
              </div>
            </button>
            {expanded === '_none' && (
              <div className="border-t border-slate-100 divide-y divide-slate-100">
                {uncategorized.map(w => (
                  <div key={w.id} className="flex items-center justify-between px-6 py-3.5 hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-full ${avatarColor(w.name)} flex items-center justify-center`}>
                        <span className="text-xs font-bold text-white">{getInitials(w.name + ' ' + (w.last_name || ''))}</span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-900">{w.name} {w.last_name || ''}</p>
                        <div className="flex items-center gap-3 mt-0.5">
                          {w.identification && <span className="text-xs text-slate-500 font-mono">{w.identification}</span>}
                          <span className="flex items-center gap-1 text-xs text-slate-400">
                            <Building2 className="w-3 h-3" /> {w.company_name}
                          </span>
                        </div>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" className="gap-1 text-xs h-8"
                      onClick={() => navigate(`/admin/empresas/${w.company_id}`)}>
                      <Eye className="w-3 h-3" /> Ver empresa
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {allKeys.length === 0 && uncategorized.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-xl p-16 text-center">
            <Users className="w-14 h-14 text-slate-200 mx-auto mb-4" strokeWidth={1} />
            <p className="text-sm text-slate-600 font-medium">No hay trabajadores registrados</p>
            <p className="text-xs text-slate-400 mt-1">Agrega trabajadores desde las empresas</p>
          </div>
        )}
      </div>
    </div>
  );
}
