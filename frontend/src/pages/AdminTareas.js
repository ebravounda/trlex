import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Plus, ListTodo, MessageSquare, Trash2, Clock, User, ChevronDown, ChevronUp,
  Send, CalendarDays, Flag, CircleDot, CheckCircle2, Timer, Search, SlidersHorizontal
} from 'lucide-react';

const PRIORITIES = [
  { value: 'baja', label: 'Baja', color: 'text-slate-600', bg: 'bg-slate-50', border: 'border-slate-300', dot: 'bg-slate-400' },
  { value: 'media', label: 'Media', color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-400', dot: 'bg-amber-500' },
  { value: 'alta', label: 'Alta', color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-500', dot: 'bg-red-500' },
];

const STATUSES = [
  { value: 'pendiente', label: 'Pendiente', color: 'text-amber-800', bg: 'bg-amber-100', border: 'border-amber-200', dot: 'bg-amber-500', icon: CircleDot },
  { value: 'en_proceso', label: 'En proceso', color: 'text-blue-800', bg: 'bg-blue-100', border: 'border-blue-200', dot: 'bg-blue-500', icon: Timer },
  { value: 'completada', label: 'Completada', color: 'text-emerald-800', bg: 'bg-emerald-100', border: 'border-emerald-200', dot: 'bg-emerald-500', icon: CheckCircle2 },
];

function formatDate(iso) {
  if (!iso) return '-';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return '-'; }
}

function timeAgo(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const diff = Date.now() - d;
  if (diff < 60000) return 'Ahora';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  return `${Math.floor(diff / 86400000)}d`;
}

export default function AdminTareas() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [staff, setStaff] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [expandedTask, setExpandedTask] = useState(null);
  const [taskDetail, setTaskDetail] = useState(null);
  const [newComment, setNewComment] = useState('');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ title: '', description: '', priority: 'media', assigned_to: '', due_date: '' });

  const fetchTasks = useCallback(async () => {
    try { const res = await api.get('/tasks'); setTasks(res.data); } catch { toast.error('Error cargando tareas'); }
  }, []);
  const fetchStaff = useCallback(async () => {
    try { const res = await api.get('/staff'); setStaff(res.data); } catch {}
  }, []);
  useEffect(() => { fetchTasks(); fetchStaff(); }, [fetchTasks, fetchStaff]);

  const handleCreate = async () => {
    if (!form.title.trim() || !form.assigned_to) { toast.error('Titulo y asignado son obligatorios'); return; }
    try {
      await api.post('/tasks', form);
      setForm({ title: '', description: '', priority: 'media', assigned_to: '', due_date: '' });
      setShowCreate(false);
      fetchTasks();
      toast.success('Tarea creada exitosamente');
    } catch (err) { toast.error(err.response?.data?.detail || 'Error'); }
  };

  const handleStatusChange = async (taskId, newStatus) => {
    try { await api.put(`/tasks/${taskId}`, { status: newStatus }); fetchTasks(); toast.success('Estado actualizado'); } catch { toast.error('Error'); }
  };

  const toggleTask = async (taskId) => {
    if (expandedTask === taskId) { setExpandedTask(null); setTaskDetail(null); return; }
    setExpandedTask(taskId);
    try { const res = await api.get(`/tasks/${taskId}`); setTaskDetail(res.data); } catch {}
  };

  const handleAddComment = async (taskId) => {
    if (!newComment.trim()) return;
    try {
      await api.post(`/tasks/${taskId}/comments`, { text: newComment });
      setNewComment('');
      const res = await api.get(`/tasks/${taskId}`);
      setTaskDetail(res.data);
      fetchTasks();
      toast.success('Comentario agregado');
    } catch { toast.error('Error'); }
  };

  const handleDelete = async (taskId) => {
    if (!window.confirm('Eliminar esta tarea?')) return;
    try { await api.delete(`/tasks/${taskId}`); fetchTasks(); setExpandedTask(null); toast.success('Tarea eliminada'); } catch { toast.error('Error'); }
  };

  const userId = user?._id || user?.id;
  const filtered = tasks.filter(t => {
    const matchFilter = filter === 'all' || (filter === 'mine' && t.assigned_to === userId) ||
      (filter === 'created' && t.created_by === userId) || t.status === filter;
    const matchSearch = !search.trim() || t.title.toLowerCase().includes(search.toLowerCase()) ||
      t.assigned_to_name.toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  const p = (v) => PRIORITIES.find(x => x.value === v) || PRIORITIES[1];
  const s = (v) => STATUSES.find(x => x.value === v) || STATUSES[0];

  const pendingCount = tasks.filter(t => t.status === 'pendiente').length;
  const processCount = tasks.filter(t => t.status === 'en_proceso').length;
  const doneCount = tasks.filter(t => t.status === 'completada').length;

  return (
    <div className="space-y-8" data-testid="admin-tareas">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500 mb-1">Gestion</p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>Tareas</h1>
        </div>
        <Button onClick={() => setShowCreate(true)} className="bg-slate-900 hover:bg-slate-800 gap-2 h-11 px-5 rounded-lg" data-testid="create-task-btn">
          <Plus className="w-4 h-4" /> Nueva tarea
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { label: 'Pendientes', count: pendingCount, icon: CircleDot, iconColor: 'text-amber-500', bgIcon: 'bg-amber-50' },
          { label: 'En proceso', count: processCount, icon: Timer, iconColor: 'text-blue-500', bgIcon: 'bg-blue-50' },
          { label: 'Completadas', count: doneCount, icon: CheckCircle2, iconColor: 'text-emerald-500', bgIcon: 'bg-emerald-50' },
        ].map(st => (
          <div key={st.label} className="bg-white border border-slate-200 rounded-xl p-6 flex items-center justify-between">
            <div>
              <p className="text-4xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>{st.count}</p>
              <p className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500 mt-1">{st.label}</p>
            </div>
            <div className={`w-12 h-12 rounded-xl ${st.bgIcon} flex items-center justify-center`}>
              <st.icon className={`w-6 h-6 ${st.iconColor}`} strokeWidth={1.5} />
            </div>
          </div>
        ))}
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1 overflow-x-auto">
          {[
            { v: 'all', l: 'Todas' }, { v: 'mine', l: 'Mis tareas' }, { v: 'created', l: 'Creadas' },
            { v: 'pendiente', l: 'Pendientes' }, { v: 'en_proceso', l: 'En proceso' }, { v: 'completada', l: 'Completadas' }
          ].map(f => (
            <button key={f.v} onClick={() => setFilter(f.v)} data-testid={`filter-tab-${f.v}`}
              className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${filter === f.v ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}>
              {f.l}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 flex-1">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <Input placeholder="Buscar tarea..." value={search} onChange={e => setSearch(e.target.value)}
            className="border-0 focus-visible:ring-0 p-0 h-9 text-sm" data-testid="task-search" />
        </div>
      </div>

      {/* Task List */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-16 text-center">
          <ListTodo className="w-12 h-12 text-slate-200 mx-auto mb-4" strokeWidth={1} />
          <p className="text-sm text-slate-500 mb-1">No hay tareas{search ? ' con esa busqueda' : ''}</p>
          <p className="text-xs text-slate-400">Crea una nueva tarea para empezar</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
          {filtered.map(t => {
            const pri = p(t.priority);
            const sts = s(t.status);
            const StsIcon = sts.icon;
            const isExpanded = expandedTask === t.id;

            return (
              <div key={t.id} className={`transition-colors ${isExpanded ? 'bg-slate-50/50' : ''}`}>
                {/* Task Row */}
                <div className={`flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-slate-50/80 transition-colors border-l-4 ${pri.border}`}
                  onClick={() => toggleTask(t.id)} data-testid={`task-row-${t.id}`}>

                  {/* Status dot */}
                  <div className={`w-2.5 h-2.5 rounded-full ${sts.dot} shrink-0`} />

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`text-sm font-medium truncate ${t.status === 'completada' ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                        {t.title}
                      </p>
                      {t.comments_count > 0 && (
                        <span className="flex items-center gap-0.5 text-xs text-slate-400 shrink-0">
                          <MessageSquare className="w-3 h-3" /> {t.comments_count}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="flex items-center gap-1 text-xs text-slate-500">
                        <User className="w-3 h-3" /> {t.assigned_to_name}
                      </span>
                      {t.due_date && (
                        <span className="flex items-center gap-1 text-xs text-slate-400">
                          <CalendarDays className="w-3 h-3" /> {t.due_date}
                        </span>
                      )}
                      <span className="text-xs text-slate-400">{timeAgo(t.created_at)}</span>
                    </div>
                  </div>

                  {/* Right side */}
                  <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                    <Badge className={`text-[10px] font-bold uppercase tracking-wider ${pri.bg} ${pri.color} border-0 px-2`}>
                      {t.priority}
                    </Badge>
                    <Select value={t.status} onValueChange={v => handleStatusChange(t.id, v)}>
                      <SelectTrigger className={`h-7 w-32 text-xs rounded-md ${sts.bg} ${sts.color} border-0 font-medium`}>
                        <div className="flex items-center gap-1.5">
                          <StsIcon className="w-3 h-3" />
                          <SelectValue />
                        </div>
                      </SelectTrigger>
                      <SelectContent>
                        {STATUSES.map(st => (
                          <SelectItem key={st.value} value={st.value}>
                            <div className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full ${st.dot}`} />
                              {st.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-slate-400 hover:text-red-500" onClick={() => handleDelete(t.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                    <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                  </div>
                </div>

                {/* Expanded Detail */}
                {isExpanded && taskDetail && (
                  <div className="px-5 pb-5 pt-2 border-t border-slate-100 bg-slate-50/80">
                    {/* Meta */}
                    {taskDetail.description && (
                      <p className="text-sm text-slate-600 mb-4 leading-relaxed">{taskDetail.description}</p>
                    )}
                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500 mb-5">
                      <span>Creada por <strong className="text-slate-700">{taskDetail.created_by_name}</strong></span>
                      <span>Asignada a <strong className="text-slate-700">{taskDetail.assigned_to_name}</strong></span>
                      {taskDetail.due_date && <span>Vence <strong className="text-slate-700">{taskDetail.due_date}</strong></span>}
                      <span>{formatDate(taskDetail.created_at)}</span>
                    </div>

                    {/* Comments timeline */}
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500 mb-3">
                        Comentarios ({taskDetail.comments?.length || 0})
                      </p>

                      {taskDetail.comments?.length > 0 && (
                        <div className="relative ml-3 mb-4">
                          {/* Timeline line */}
                          <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-slate-200" />
                          <div className="space-y-3 pl-6">
                            {taskDetail.comments.map(c => (
                              <div key={c.id} className="relative">
                                {/* Timeline dot */}
                                <div className="absolute -left-[25px] top-2 w-2.5 h-2.5 rounded-full bg-slate-300 border-2 border-white" />
                                <div className="bg-white border border-slate-200 rounded-lg p-3">
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs font-semibold text-slate-700">{c.user_name}</span>
                                    <span className="text-[10px] text-slate-400">{formatDate(c.created_at)}</span>
                                  </div>
                                  <p className="text-sm text-slate-600 leading-relaxed">{c.text}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Add comment */}
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-slate-900 flex items-center justify-center shrink-0">
                          <span className="text-[10px] font-bold text-white">{(user?.name || 'U').charAt(0).toUpperCase()}</span>
                        </div>
                        <Input value={newComment} onChange={e => setNewComment(e.target.value)}
                          placeholder="Escribe un comentario..." className="flex-1 h-9 text-sm bg-white"
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddComment(t.id); } }}
                          data-testid="task-comment-input" />
                        <Button size="sm" className="h-9 w-9 p-0 bg-slate-900 hover:bg-slate-800 rounded-lg" onClick={() => handleAddComment(t.id)} data-testid="task-comment-send">
                          <Send className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create Task Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md rounded-xl">
          <DialogHeader>
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500">Nueva</p>
            <DialogTitle className="text-xl font-semibold tracking-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>Crear tarea</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <label className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500 mb-1.5 block">Titulo</label>
              <Input placeholder="Que se necesita hacer?" value={form.title} onChange={e => setForm({...form, title: e.target.value})}
                className="h-10 bg-white" data-testid="task-title-input" />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500 mb-1.5 block">Descripcion</label>
              <Textarea placeholder="Detalles adicionales..." value={form.description} onChange={e => setForm({...form, description: e.target.value})} className="bg-white" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500 mb-1.5 block">Prioridad</label>
                <Select value={form.priority} onValueChange={v => setForm({...form, priority: v})}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map(pr => (
                      <SelectItem key={pr.value} value={pr.value}>
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${pr.dot}`} /> {pr.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500 mb-1.5 block">Fecha limite</label>
                <Input type="date" value={form.due_date} onChange={e => setForm({...form, due_date: e.target.value})} className="h-10" />
              </div>
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500 mb-1.5 block">Asignar a</label>
              <Select value={form.assigned_to} onValueChange={v => setForm({...form, assigned_to: v})}>
                <SelectTrigger className="h-10" data-testid="task-assign-select"><SelectValue placeholder="Seleccionar miembro..." /></SelectTrigger>
                <SelectContent>
                  {staff.map(st => (
                    <SelectItem key={st.id} value={st.id}>
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center">
                          <span className="text-[9px] font-bold text-slate-600">{st.name.charAt(0)}</span>
                        </div>
                        {st.name}
                        <span className="text-slate-400 text-xs">({st.position || st.email})</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleCreate} className="w-full h-11 bg-slate-900 hover:bg-slate-800 rounded-lg font-medium" data-testid="submit-task-btn">
              Crear tarea
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
