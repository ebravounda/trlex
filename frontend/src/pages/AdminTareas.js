import { useState, useEffect, useCallback, useRef } from 'react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import {
  Plus, MessageSquare, Trash2, Send, CalendarDays,
  CircleDot, CheckCircle2, Timer, Search, LayoutGrid, List, Clock,
  Paperclip, FileText, Download, Mail, Pencil, X, Upload, Hash,
  ChevronDown, FolderOpen, MoreHorizontal, GripVertical,
  Mic, MicOff, Play, Square, Volume2
} from 'lucide-react';
import * as VisuallyHidden from '@radix-ui/react-visually-hidden';

const PRIORITIES = [
  { value: 'baja', label: 'Baja', color: 'text-slate-500', bg: 'bg-slate-100', dot: 'bg-slate-400', ring: 'ring-slate-200' },
  { value: 'media', label: 'Media', color: 'text-amber-600', bg: 'bg-amber-50', dot: 'bg-amber-500', ring: 'ring-amber-200' },
  { value: 'alta', label: 'Alta', color: 'text-red-600', bg: 'bg-red-50', dot: 'bg-red-500', ring: 'ring-red-200' },
];

const COLUMNS = [
  { key: 'pendiente', label: 'Pendientes', icon: CircleDot, dot: 'bg-amber-500', headerBg: 'bg-gradient-to-r from-amber-50 to-orange-50', headerBorder: 'border-amber-200/60', headerText: 'text-amber-700', count_bg: 'bg-amber-100 text-amber-700' },
  { key: 'en_proceso', label: 'En proceso', icon: Timer, dot: 'bg-blue-500', headerBg: 'bg-gradient-to-r from-blue-50 to-indigo-50', headerBorder: 'border-blue-200/60', headerText: 'text-blue-700', count_bg: 'bg-blue-100 text-blue-700' },
  { key: 'completada', label: 'Completadas', icon: CheckCircle2, dot: 'bg-emerald-500', headerBg: 'bg-gradient-to-r from-emerald-50 to-teal-50', headerBorder: 'border-emerald-200/60', headerText: 'text-emerald-700', count_bg: 'bg-emerald-100 text-emerald-700' },
];

const STATUSES = [
  { value: 'pendiente', label: 'Pendiente', dot: 'bg-amber-500' },
  { value: 'en_proceso', label: 'En proceso', dot: 'bg-blue-500' },
  { value: 'completada', label: 'Completada', dot: 'bg-emerald-500' },
];

function formatDate(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }); } catch { return ''; }
}

function timeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso);
  if (diff < 60000) return 'Ahora';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  return `${Math.floor(diff / 86400000)}d`;
}

function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

const AVATAR_COLORS = ['bg-violet-600', 'bg-sky-600', 'bg-rose-600', 'bg-teal-600', 'bg-orange-600', 'bg-indigo-600', 'bg-pink-600', 'bg-cyan-600'];
function avatarColor(name) {
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function formatSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

// ─── Audio Player ───────────────────────────────────────────
function AudioPlayer({ audio, taskId, onDelete }) {
  const [playing, setPlaying] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const audioRef = useRef(null);
  const blobUrlRef = useRef(null);

  const togglePlay = (e) => {
    e.stopPropagation();
    if (!audioRef.current) {
      const token = localStorage.getItem('tramilex_token');
      const backendUrl = process.env.REACT_APP_BACKEND_URL;
      const audioEl = new Audio();
      fetch(`${backendUrl}/api/tasks/${taskId}/audios/${audio.id}/stream`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
        .then(r => {
          if (!r.ok) throw new Error('Error ' + r.status);
          return r.blob();
        })
        .then(blob => {
          if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
          const url = URL.createObjectURL(blob);
          blobUrlRef.current = url;
          audioEl.src = url;
          audioEl.onended = () => setPlaying(false);
          audioEl.onerror = () => { setPlaying(false); toast.error('Formato no soportado'); };
          audioRef.current = audioEl;
          audioEl.play().catch(() => toast.error('No se pudo reproducir'));
          setPlaying(true);
        })
        .catch(() => toast.error('Error reproduciendo'));
      return;
    }
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current.play();
      setPlaying(true);
    }
  };

  return (
    <div className="bg-gradient-to-r from-slate-50 to-slate-100 rounded-xl border border-slate-200 p-3 space-y-2" data-testid={`task-audio-${audio.id}`}>
      <div className="flex items-center gap-3">
        <button
          onClick={togglePlay}
          className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-all ${
            playing ? 'bg-slate-900 text-white shadow-md' : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300 hover:shadow-sm'
          }`}
          data-testid={`play-audio-${audio.id}`}
        >
          {playing ? <Square className="w-3 h-3 fill-white" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-700">{audio.recorded_by_name}</span>
            <span className="text-[10px] text-slate-400">{timeAgo(audio.created_at)}</span>
          </div>
          {audio.transcription && (
            <button onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
              className="text-[11px] text-blue-500 hover:text-blue-600 mt-0.5 cursor-pointer">
              {expanded ? 'Ocultar transcripcion' : 'Ver transcripcion'}
            </button>
          )}
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(audio.id); }}
          className="p-1 text-slate-300 hover:text-red-500 transition-colors"
          data-testid={`delete-audio-${audio.id}`}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      {audio.transcription && expanded && (
        <div className="bg-white rounded-lg border border-slate-100 px-3 py-2 mt-1">
          <p className="text-xs text-slate-600 leading-relaxed italic">"{audio.transcription}"</p>
        </div>
      )}
    </div>
  );
}


// ─── Task Card ──────────────────────────────────────────────
function TaskCard({ task, onOpenDetail, onStatusChange }) {
  const pri = PRIORITIES.find(x => x.value === task.priority) || PRIORITIES[1];
  const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'completada';
  const isDone = task.status === 'completada';

  return (
    <div
      className={`group bg-white rounded-xl border transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 cursor-pointer ${isDone ? 'opacity-70' : 'border-slate-200/80'}`}
      onClick={() => onOpenDetail(task)}
      data-testid={`task-card-${task.id}`}
    >
      <div className="p-4">
        {/* Top row: priority + meta */}
        <div className="flex items-center justify-between mb-3">
          <Badge className={`text-[10px] font-bold uppercase tracking-wider ${pri.bg} ${pri.color} border-0 px-2 py-0.5 shadow-sm`}>
            {pri.label}
          </Badge>
          <div className="flex items-center gap-2">
            {task.documents_count > 0 && (
              <span className="flex items-center gap-0.5 text-[11px] text-slate-400" data-testid={`task-docs-count-${task.id}`}>
                <Paperclip className="w-3 h-3" /> {task.documents_count}
              </span>
            )}
            {task.audios_count > 0 && (
              <span className="flex items-center gap-0.5 text-[11px] text-slate-400">
                <Mic className="w-3 h-3" /> {task.audios_count}
              </span>
            )}
            {task.comments_count > 0 && (
              <span className="flex items-center gap-0.5 text-[11px] text-slate-400">
                <MessageSquare className="w-3 h-3" /> {task.comments_count}
              </span>
            )}
          </div>
        </div>

        {/* Title */}
        <p className={`text-sm font-semibold leading-snug mb-1 ${isDone ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
          {task.title}
        </p>

        {/* Expediente */}
        {task.numero_expediente && (
          <div className="flex items-center gap-1 mb-2">
            <Hash className="w-3 h-3 text-slate-400" />
            <span className="text-[11px] text-slate-500 font-mono">{task.numero_expediente}</span>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
          <div className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded-full ${avatarColor(task.assigned_to_name)} flex items-center justify-center ring-2 ring-white shadow-sm`}>
              <span className="text-[9px] font-bold text-white">{getInitials(task.assigned_to_name)}</span>
            </div>
            <span className="text-xs text-slate-500 truncate max-w-[100px]">{task.assigned_to_name}</span>
          </div>
          {task.due_date && (
            <span className={`flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md ${
              isOverdue ? 'bg-red-50 text-red-600 ring-1 ring-red-200/50' : 'bg-slate-50 text-slate-500'
            }`}>
              <CalendarDays className="w-3 h-3" /> {formatDate(task.due_date)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Task Detail Dialog ──────────────────────────────────────
function TaskDetailDialog({ task, open, onClose, staff, user, onRefresh }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  // Audio recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioUploading, setAudioUploading] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);

  const fetchDetail = useCallback(async () => {
    if (!task?.id) return;
    setLoading(true);
    try {
      const res = await api.get(`/tasks/${task.id}`);
      setDetail(res.data);
    } catch { toast.error('Error cargando tarea'); }
    setLoading(false);
  }, [task?.id]);

  useEffect(() => {
    if (open && task?.id) {
      fetchDetail();
      setEditMode(false);
    }
  }, [open, task?.id, fetchDetail]);

  const startEdit = () => {
    if (!detail) return;
    setEditForm({
      title: detail.title || '',
      description: detail.description || '',
      priority: detail.priority || 'media',
      assigned_to: detail.assigned_to || '',
      due_date: detail.due_date || '',
      numero_expediente: detail.numero_expediente || '',
      status: detail.status || 'pendiente',
      related_tramite: detail.related_tramite || '',
    });
    setEditMode(true);
  };

  const saveEdit = async () => {
    try {
      await api.put(`/tasks/${task.id}`, editForm);
      toast.success('Tarea actualizada');
      setEditMode(false);
      fetchDetail();
      onRefresh();
    } catch (err) { toast.error(err.response?.data?.detail || 'Error actualizando'); }
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    try {
      await api.post(`/tasks/${task.id}/comments`, { text: newComment });
      setNewComment('');
      fetchDetail();
      onRefresh();
    } catch { toast.error('Error'); }
  };

  const handleStatusChange = async (newStatus) => {
    try {
      await api.put(`/tasks/${task.id}`, { status: newStatus });
      fetchDetail();
      onRefresh();
    } catch { toast.error('Error'); }
  };

  const handleDelete = async () => {
    if (!window.confirm('¿Eliminar esta tarea y todos sus documentos?')) return;
    try {
      await api.delete(`/tasks/${task.id}`);
      toast.success('Tarea eliminada');
      onClose();
      onRefresh();
    } catch { toast.error('Error'); }
  };

  // ── Document upload ──
  const uploadFiles = async (files) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    let success = 0;
    for (const file of files) {
      try {
        const formData = new FormData();
        formData.append('file', file);
        await api.post(`/tasks/${task.id}/documents/upload`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        success++;
      } catch (err) {
        toast.error(`Error subiendo ${file.name}: ${err.response?.data?.detail || 'Error'}`);
      }
    }
    if (success > 0) {
      toast.success(`${success} documento(s) subido(s)`);
      fetchDetail();
      onRefresh();
    }
    setUploading(false);
  };

  const handleFileDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    uploadFiles(e.dataTransfer.files);
  };

  const handleFileSelect = (e) => {
    uploadFiles(e.target.files);
    e.target.value = '';
  };

  const handleDeleteDoc = async (docId) => {
    try {
      await api.delete(`/tasks/${task.id}/documents/${docId}`);
      toast.success('Documento eliminado');
      fetchDetail();
      onRefresh();
    } catch { toast.error('Error'); }
  };

  const handleDownloadDoc = async (docId, filename) => {
    try {
      const res = await api.get(`/tasks/${task.id}/documents/${docId}/download`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error('Error descargando'); }
  };

  const handleSendDocs = async () => {
    setSending(true);
    try {
      const res = await api.post(`/tasks/${task.id}/send-documents`);
      toast.success(res.data.message || 'Documentos enviados');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error enviando');
    }
    setSending(false);
  };

  // ── Audio Recording ──
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Detect best supported format (Safari uses mp4, Chrome uses webm)
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : MediaRecorder.isTypeSupported('audio/mp4')
            ? 'audio/mp4'
            : '';
      const options = mimeType ? { mimeType } : {};
      const mediaRecorder = new MediaRecorder(stream, options);
      const actualMime = mediaRecorder.mimeType || mimeType || 'audio/webm';
      const ext = actualMime.includes('mp4') ? 'mp4' : actualMime.includes('m4a') ? 'm4a' : 'webm';
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        clearInterval(recordingTimerRef.current);
        setRecordingTime(0);
        const blob = new Blob(audioChunksRef.current, { type: actualMime });
        if (blob.size > 0) {
          setAudioUploading(true);
          try {
            const formData = new FormData();
            formData.append('file', blob, `audio_${Date.now()}.${ext}`);
            const res = await api.post(`/tasks/${task.id}/audio/upload`, formData, {
              headers: { 'Content-Type': 'multipart/form-data' },
            });
            toast.success(res.data.transcription ? 'Audio grabado y transcrito' : 'Audio grabado');
            fetchDetail();
            onRefresh();
          } catch (err) {
            toast.error(err.response?.data?.detail || 'Error subiendo audio');
          }
          setAudioUploading(false);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
    } catch (err) {
      toast.error('No se pudo acceder al microfono');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleDeleteAudio = async (audioId) => {
    try {
      await api.delete(`/tasks/${task.id}/audios/${audioId}`);
      toast.success('Audio eliminado');
      fetchDetail();
      onRefresh();
    } catch { toast.error('Error'); }
  };

  const formatRecordingTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const pri = PRIORITIES.find(x => x.value === (detail?.priority || task?.priority)) || PRIORITIES[1];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl rounded-2xl p-0 overflow-hidden max-h-[90vh]" data-testid="task-detail-dialog">
        <VisuallyHidden.Root><DialogTitle>Detalle de tarea</DialogTitle></VisuallyHidden.Root>
        {loading || !detail ? (
          <div className="p-12 text-center">
            <div className="w-8 h-8 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin mx-auto" />
          </div>
        ) : (
          <div className="flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="px-6 pt-5 pb-4 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  {editMode ? (
                    <Input value={editForm.title} onChange={e => setEditForm({...editForm, title: e.target.value})}
                      className="text-lg font-semibold h-10 mb-1" data-testid="edit-task-title" autoFocus />
                  ) : (
                    <h2 className="text-lg font-semibold text-slate-900 leading-snug" style={{ fontFamily: 'Manrope, sans-serif' }}>
                      {detail.title}
                    </h2>
                  )}
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <Badge className={`text-[10px] font-bold uppercase tracking-wider ${pri.bg} ${pri.color} border-0`}>
                      {pri.label}
                    </Badge>
                    {detail.numero_expediente && !editMode && (
                      <span className="flex items-center gap-1 text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md font-mono">
                        <Hash className="w-3 h-3" /> {detail.numero_expediente}
                      </span>
                    )}
                    <span className="text-[11px] text-slate-400">
                      por {detail.created_by_name} · {timeAgo(detail.created_at)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {!editMode ? (
                    <>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-400 hover:text-blue-600" onClick={startEdit} data-testid="edit-task-btn">
                              <Pencil className="w-4 h-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Editar</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-400 hover:text-red-500" onClick={handleDelete} data-testid="delete-task-btn">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Eliminar</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </>
                  ) : (
                    <>
                      <Button size="sm" className="h-8 bg-slate-900 hover:bg-slate-800 text-xs px-3" onClick={saveEdit} data-testid="save-task-btn">
                        Guardar
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setEditMode(false)}>
                        <X className="w-4 h-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Body - scrollable */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
              {/* Edit Mode Fields */}
              {editMode ? (
                <div className="space-y-4 bg-white rounded-xl border border-slate-200 p-4">
                  <div>
                    <label className="text-xs font-medium text-slate-600 mb-1.5 block">Descripcion</label>
                    <Textarea value={editForm.description} onChange={e => setEditForm({...editForm, description: e.target.value})}
                      rows={3} className="bg-slate-50" data-testid="edit-task-description" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-slate-600 mb-1.5 block">Prioridad</label>
                      <Select value={editForm.priority} onValueChange={v => setEditForm({...editForm, priority: v})}>
                        <SelectTrigger className="h-9" data-testid="edit-task-priority"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {PRIORITIES.map(p => (
                            <SelectItem key={p.value} value={p.value}>
                              <div className="flex items-center gap-2"><div className={`w-2 h-2 rounded-full ${p.dot}`} /> {p.label}</div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-600 mb-1.5 block">Estado</label>
                      <Select value={editForm.status} onValueChange={v => setEditForm({...editForm, status: v})}>
                        <SelectTrigger className="h-9" data-testid="edit-task-status"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {STATUSES.map(s => (
                            <SelectItem key={s.value} value={s.value}>
                              <div className="flex items-center gap-2"><div className={`w-2 h-2 rounded-full ${s.dot}`} /> {s.label}</div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-slate-600 mb-1.5 block">Fecha limite</label>
                      <Input type="date" value={editForm.due_date} onChange={e => setEditForm({...editForm, due_date: e.target.value})} className="h-9" data-testid="edit-task-due-date" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-600 mb-1.5 block">N. Expediente</label>
                      <Input value={editForm.numero_expediente} onChange={e => setEditForm({...editForm, numero_expediente: e.target.value})}
                        placeholder="Ej: EXP-2024-001" className="h-9 font-mono text-sm" data-testid="edit-task-expediente" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600 mb-1.5 block">Asignar a</label>
                    <Select value={editForm.assigned_to} onValueChange={v => setEditForm({...editForm, assigned_to: v})}>
                      <SelectTrigger className="h-9" data-testid="edit-task-assign"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                      <SelectContent>
                        {staff.map(st => (
                          <SelectItem key={st.id} value={st.id}>
                            <div className="flex items-center gap-2">
                              <div className={`w-5 h-5 rounded-full ${avatarColor(st.name)} flex items-center justify-center`}>
                                <span className="text-[8px] font-bold text-white">{getInitials(st.name)}</span>
                              </div>
                              {st.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ) : (
                <>
                  {/* Description */}
                  {detail.description && (
                    <div>
                      <p className="text-sm text-slate-600 leading-relaxed">{detail.description}</p>
                    </div>
                  )}

                  {/* Info grid */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                      <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1">Asignado</p>
                      <div className="flex items-center gap-2">
                        <div className={`w-6 h-6 rounded-full ${avatarColor(detail.assigned_to_name)} flex items-center justify-center`}>
                          <span className="text-[8px] font-bold text-white">{getInitials(detail.assigned_to_name)}</span>
                        </div>
                        <span className="text-sm font-medium text-slate-700">{detail.assigned_to_name}</span>
                      </div>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                      <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1">Estado</p>
                      <Select value={detail.status} onValueChange={handleStatusChange}>
                        <SelectTrigger className="h-8 text-xs border-0 bg-white shadow-sm" data-testid="task-status-select">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUSES.map(s => (
                            <SelectItem key={s.value} value={s.value}>
                              <div className="flex items-center gap-2"><div className={`w-2 h-2 rounded-full ${s.dot}`} /> {s.label}</div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {detail.due_date && (
                      <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                        <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1">Fecha limite</p>
                        <div className="flex items-center gap-1.5">
                          <CalendarDays className="w-3.5 h-3.5 text-slate-400" />
                          <span className="text-sm font-medium text-slate-700">{detail.due_date}</span>
                        </div>
                      </div>
                    )}
                    {detail.numero_expediente && (
                      <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                        <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1">Expediente</p>
                        <div className="flex items-center gap-1.5">
                          <Hash className="w-3.5 h-3.5 text-slate-400" />
                          <span className="text-sm font-medium font-mono text-slate-700">{detail.numero_expediente}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* ── Documents Section ── */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <Paperclip className="w-4 h-4 text-slate-400" />
                    Documentos
                    {detail.documents?.length > 0 && (
                      <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full font-bold">{detail.documents.length}</span>
                    )}
                  </h3>
                  {detail.documents?.length > 0 && (
                    <Button
                      variant="outline" size="sm"
                      className="h-7 text-xs gap-1.5 border-blue-200 text-blue-600 hover:bg-blue-50"
                      onClick={handleSendDocs}
                      disabled={sending}
                      data-testid="send-docs-email-btn"
                    >
                      <Mail className="w-3 h-3" />
                      {sending ? 'Enviando...' : 'Enviar por email'}
                    </Button>
                  )}
                </div>

                {/* Drop zone */}
                <div
                  className={`border-2 border-dashed rounded-xl p-4 text-center transition-all cursor-pointer mb-3 ${
                    dragOver ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleFileDrop}
                  onClick={() => fileInputRef.current?.click()}
                  data-testid="task-doc-dropzone"
                >
                  <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} data-testid="task-doc-file-input" />
                  {uploading ? (
                    <div className="flex items-center justify-center gap-2 py-2">
                      <div className="w-4 h-4 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />
                      <span className="text-sm text-blue-600">Subiendo...</span>
                    </div>
                  ) : (
                    <div className="py-2">
                      <Upload className="w-5 h-5 text-slate-300 mx-auto mb-1" />
                      <p className="text-xs text-slate-400">Arrastra archivos o haz clic para adjuntar</p>
                    </div>
                  )}
                </div>

                {/* Document list */}
                {detail.documents?.length > 0 && (
                  <div className="space-y-1.5">
                    {detail.documents.map(doc => (
                      <div key={doc.id} className="flex items-center gap-3 bg-slate-50 rounded-lg px-3 py-2 group/doc border border-slate-100 hover:border-slate-200 transition-colors" data-testid={`task-doc-${doc.id}`}>
                        <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-slate-700 truncate">{doc.original_filename}</p>
                          <p className="text-[10px] text-slate-400">{formatSize(doc.size)}</p>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover/doc:opacity-100 transition-opacity">
                          <button className="p-1 hover:bg-white rounded text-slate-400 hover:text-blue-600 transition-colors"
                            onClick={() => handleDownloadDoc(doc.id, doc.original_filename)} data-testid={`download-doc-${doc.id}`}>
                            <Download className="w-3.5 h-3.5" />
                          </button>
                          <button className="p-1 hover:bg-white rounded text-slate-400 hover:text-red-500 transition-colors"
                            onClick={() => handleDeleteDoc(doc.id)} data-testid={`delete-doc-${doc.id}`}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Audio Section ── */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <Volume2 className="w-4 h-4 text-slate-400" />
                    Notas de voz
                    {detail.audios?.length > 0 && (
                      <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full font-bold">{detail.audios.length}</span>
                    )}
                  </h3>
                </div>

                {/* Recorder */}
                <div className="flex items-center gap-3 mb-3">
                  {!isRecording ? (
                    <Button
                      variant="outline" size="sm"
                      className="h-9 gap-2 border-slate-200 hover:border-red-300 hover:bg-red-50 hover:text-red-600 transition-all"
                      onClick={startRecording}
                      disabled={audioUploading}
                      data-testid="start-recording-btn"
                    >
                      <Mic className="w-4 h-4" />
                      {audioUploading ? 'Subiendo...' : 'Grabar audio'}
                    </Button>
                  ) : (
                    <div className="flex items-center gap-3">
                      <Button
                        size="sm"
                        className="h-9 gap-2 bg-red-500 hover:bg-red-600 text-white animate-pulse"
                        onClick={stopRecording}
                        data-testid="stop-recording-btn"
                      >
                        <Square className="w-3 h-3 fill-white" />
                        Detener
                      </Button>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                        <span className="text-sm font-mono text-red-600 font-medium">{formatRecordingTime(recordingTime)}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Audio list */}
                {detail.audios?.length > 0 && (
                  <div className="space-y-2">
                    {detail.audios.map(audio => (
                      <AudioPlayer key={audio.id} audio={audio} taskId={task.id} onDelete={handleDeleteAudio} />
                    ))}
                  </div>
                )}
              </div>

              {/* ── Comments Section ── */}
              <div>
                <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-3">
                  <MessageSquare className="w-4 h-4 text-slate-400" />
                  Comentarios
                  {detail.comments?.length > 0 && (
                    <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full font-bold">{detail.comments.length}</span>
                  )}
                </h3>

                {detail.comments?.length > 0 && (
                  <div className="space-y-2.5 mb-3">
                    {detail.comments.map(c => (
                      <div key={c.id} className="flex gap-2.5">
                        <div className={`w-7 h-7 rounded-full ${avatarColor(c.user_name)} flex items-center justify-center shrink-0 mt-0.5 ring-2 ring-white`}>
                          <span className="text-[8px] font-bold text-white">{getInitials(c.user_name)}</span>
                        </div>
                        <div className="flex-1 bg-white rounded-xl border border-slate-100 p-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-semibold text-slate-700">{c.user_name}</span>
                            <span className="text-[10px] text-slate-400">{timeAgo(c.created_at)}</span>
                          </div>
                          <p className="text-xs text-slate-600 leading-relaxed">{c.text}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add comment */}
                <div className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-full ${avatarColor(user?.name)} flex items-center justify-center shrink-0`}>
                    <span className="text-[8px] font-bold text-white">{getInitials(user?.name)}</span>
                  </div>
                  <div className="flex-1 flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-1 focus-within:ring-2 focus-within:ring-slate-200 transition-all">
                    <Input value={newComment} onChange={e => setNewComment(e.target.value)}
                      placeholder="Escribe un comentario..."
                      className="border-0 focus-visible:ring-0 p-0 h-8 text-xs flex-1"
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddComment(); } }}
                      data-testid="task-comment-input" />
                    <Button size="sm" className="h-7 w-7 p-0 bg-slate-900 hover:bg-slate-800 rounded-lg shrink-0" onClick={handleAddComment} data-testid="task-comment-send-btn">
                      <Send className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Create/Form Dialog ─────────────────────────────────────
function TaskFormDialog({ open, onClose, staff, onCreated }) {
  const [form, setForm] = useState({ title: '', description: '', priority: 'media', assigned_to: '', due_date: '', numero_expediente: '' });
  const [submitting, setSubmitting] = useState(false);

  const handleCreate = async () => {
    if (!form.title.trim() || !form.assigned_to) { toast.error('Titulo y asignado son obligatorios'); return; }
    setSubmitting(true);
    try {
      await api.post('/tasks', form);
      setForm({ title: '', description: '', priority: 'media', assigned_to: '', due_date: '', numero_expediente: '' });
      onClose();
      onCreated();
      toast.success('Tarea creada');
    } catch (err) { toast.error(err.response?.data?.detail || 'Error'); }
    setSubmitting(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md rounded-2xl" data-testid="create-task-dialog">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold tracking-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>
            Nueva tarea
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1.5 block">Titulo *</label>
            <Input placeholder="¿Que se necesita hacer?" value={form.title} onChange={e => setForm({...form, title: e.target.value})}
              className="h-10 bg-white" data-testid="task-title-input" autoFocus />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1.5 block">Descripcion</label>
            <Textarea placeholder="Detalles adicionales..." value={form.description} onChange={e => setForm({...form, description: e.target.value})}
              className="bg-white" rows={3} data-testid="task-description-input" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1.5 block">Prioridad</label>
              <Select value={form.priority} onValueChange={v => setForm({...form, priority: v})}>
                <SelectTrigger className="h-10" data-testid="task-priority-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map(pr => (
                    <SelectItem key={pr.value} value={pr.value}>
                      <div className="flex items-center gap-2"><div className={`w-2 h-2 rounded-full ${pr.dot}`} /> {pr.label}</div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1.5 block">Fecha limite</label>
              <Input type="date" value={form.due_date} onChange={e => setForm({...form, due_date: e.target.value})} className="h-10" data-testid="task-due-date-input" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1.5 block">N. Expediente</label>
            <Input value={form.numero_expediente} onChange={e => setForm({...form, numero_expediente: e.target.value})}
              placeholder="Ej: EXP-2024-001 (opcional)" className="h-10 font-mono" data-testid="task-expediente-input" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1.5 block">Asignar a *</label>
            <Select value={form.assigned_to} onValueChange={v => setForm({...form, assigned_to: v})}>
              <SelectTrigger className="h-10" data-testid="task-assign-select"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
              <SelectContent>
                {staff.map(st => (
                  <SelectItem key={st.id} value={st.id}>
                    <div className="flex items-center gap-2">
                      <div className={`w-5 h-5 rounded-full ${avatarColor(st.name)} flex items-center justify-center`}>
                        <span className="text-[8px] font-bold text-white">{getInitials(st.name)}</span>
                      </div>
                      {st.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleCreate} disabled={submitting}
            className="w-full h-11 bg-slate-900 hover:bg-slate-800 rounded-xl font-medium" data-testid="submit-task-btn">
            {submitting ? 'Creando...' : 'Crear tarea'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}


// ─── Main Page ──────────────────────────────────────────────
export default function AdminTareas() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [staff, setStaff] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState('kanban');
  const [filterPriority, setFilterPriority] = useState('all');

  const fetchTasks = useCallback(async () => {
    try { const res = await api.get('/tasks'); setTasks(res.data); return res.data; } catch { toast.error('Error cargando tareas'); return []; }
  }, []);
  const fetchStaff = useCallback(async () => {
    try { const res = await api.get('/staff'); setStaff(res.data); } catch {}
  }, []);
  useEffect(() => {
    const init = async () => {
      const allTasks = await fetchTasks();
      await fetchStaff();
      // Check if URL has ?task=id parameter (from notification click)
      const params = new URLSearchParams(window.location.search);
      const taskId = params.get('task');
      if (taskId && allTasks.length > 0) {
        const found = allTasks.find(t => t.id === taskId);
        if (found) setSelectedTask(found);
        // Clean up URL
        window.history.replaceState({}, '', window.location.pathname);
      }
    };
    init();
  }, [fetchTasks, fetchStaff]);

  const filtered = tasks.filter(t => {
    if (search.trim() && !(
      t.title.toLowerCase().includes(search.toLowerCase()) ||
      t.assigned_to_name.toLowerCase().includes(search.toLowerCase()) ||
      (t.numero_expediente || '').toLowerCase().includes(search.toLowerCase())
    )) return false;
    if (filterPriority !== 'all' && t.priority !== filterPriority) return false;
    return true;
  });

  const total = tasks.length;
  const doneCount = tasks.filter(t => t.status === 'completada').length;
  const progress = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  return (
    <div className="space-y-6" data-testid="admin-tareas">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-slate-400 mb-1">Gestion</p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>Tareas</h1>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex bg-slate-100 rounded-lg p-0.5">
            <button onClick={() => setViewMode('kanban')}
              className={`p-2 rounded-md transition-all ${viewMode === 'kanban' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}
              data-testid="view-kanban-btn">
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button onClick={() => setViewMode('list')}
              className={`p-2 rounded-md transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}
              data-testid="view-list-btn">
              <List className="w-4 h-4" />
            </button>
          </div>
          <Button onClick={() => setShowCreate(true)}
            className="bg-slate-900 hover:bg-slate-800 gap-2 h-10 px-5 rounded-xl text-sm shadow-sm"
            data-testid="create-task-btn">
            <Plus className="w-4 h-4" /> Nueva tarea
          </Button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-6">
            <div>
              <p className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>{total}</p>
              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Total</p>
            </div>
            {COLUMNS.map(col => {
              const count = tasks.filter(t => t.status === col.key).length;
              return (
                <div key={col.key} className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${col.dot}`} />
                  <div>
                    <p className="text-lg font-bold text-slate-900">{count}</p>
                    <p className="text-[10px] uppercase tracking-wider text-slate-400">{col.label}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-emerald-600">{progress}%</p>
            <p className="text-[10px] uppercase tracking-wider text-slate-400">Progreso</p>
          </div>
        </div>
        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-700 ease-out" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Search + Filters */}
      <div className="flex items-center gap-3">
        <div className="flex-1 flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-4 py-1 shadow-sm">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <Input placeholder="Buscar por tarea, persona o expediente..." value={search} onChange={e => setSearch(e.target.value)}
            className="border-0 focus-visible:ring-0 p-0 h-10 text-sm" data-testid="task-search" />
          {search && (
            <button onClick={() => setSearch('')} className="text-slate-300 hover:text-slate-500">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <Select value={filterPriority} onValueChange={setFilterPriority}>
          <SelectTrigger className="w-[140px] h-10 bg-white shadow-sm rounded-xl" data-testid="filter-priority">
            <SelectValue placeholder="Prioridad" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {PRIORITIES.map(p => (
              <SelectItem key={p.value} value={p.value}>
                <div className="flex items-center gap-2"><div className={`w-2 h-2 rounded-full ${p.dot}`} /> {p.label}</div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Kanban View */}
      {viewMode === 'kanban' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {COLUMNS.map(col => {
            const colTasks = filtered.filter(t => t.status === col.key);
            const ColIcon = col.icon;
            return (
              <div key={col.key} className="space-y-3" data-testid={`column-${col.key}`}>
                {/* Column header */}
                <div className={`flex items-center justify-between px-4 py-3 rounded-xl border ${col.headerBg} ${col.headerBorder} shadow-sm`}>
                  <div className="flex items-center gap-2">
                    <ColIcon className={`w-4 h-4 ${col.headerText}`} strokeWidth={2.5} />
                    <span className={`text-sm font-semibold ${col.headerText}`}>{col.label}</span>
                  </div>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-lg ${col.count_bg}`}>{colTasks.length}</span>
                </div>

                {/* Cards */}
                <div className="space-y-3 min-h-[80px]">
                  {colTasks.length === 0 && (
                    <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center">
                      <p className="text-xs text-slate-300">Sin tareas</p>
                    </div>
                  )}
                  {colTasks.map(task => (
                    <TaskCard key={task.id} task={task} onOpenDetail={setSelectedTask} onStatusChange={() => {}} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* List View */}
      {viewMode === 'list' && (
        <div className="space-y-2">
          {filtered.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center shadow-sm">
              <FolderOpen className="w-12 h-12 text-slate-200 mx-auto mb-4" strokeWidth={1} />
              <p className="text-sm text-slate-400">No hay tareas</p>
            </div>
          ) : filtered.map(task => {
            const pri = PRIORITIES.find(x => x.value === task.priority) || PRIORITIES[1];
            const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'completada';
            const status = STATUSES.find(s => s.value === task.status);
            return (
              <div key={task.id}
                className="flex items-center gap-4 bg-white border border-slate-200/80 rounded-xl px-5 py-3.5 hover:shadow-md hover:border-slate-300 transition-all cursor-pointer group"
                onClick={() => setSelectedTask(task)}
                data-testid={`task-list-item-${task.id}`}
              >
                <div className={`w-2.5 h-2.5 rounded-full ${status?.dot || 'bg-slate-300'} shrink-0`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${task.status === 'completada' ? 'text-slate-400 line-through' : 'text-slate-900'} truncate`}>
                    {task.title}
                  </p>
                  <div className="flex items-center gap-3 mt-0.5">
                    {task.numero_expediente && (
                      <span className="text-[10px] text-slate-400 font-mono flex items-center gap-0.5">
                        <Hash className="w-2.5 h-2.5" /> {task.numero_expediente}
                      </span>
                    )}
                    <span className="text-[10px] text-slate-400">{task.assigned_to_name}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {task.documents_count > 0 && (
                    <span className="flex items-center gap-0.5 text-[11px] text-slate-400">
                      <Paperclip className="w-3 h-3" /> {task.documents_count}
                    </span>
                  )}
                  {task.audios_count > 0 && (
                    <span className="flex items-center gap-0.5 text-[11px] text-slate-400">
                      <Mic className="w-3 h-3" /> {task.audios_count}
                    </span>
                  )}
                  {task.comments_count > 0 && (
                    <span className="flex items-center gap-0.5 text-[11px] text-slate-400">
                      <MessageSquare className="w-3 h-3" /> {task.comments_count}
                    </span>
                  )}
                  <Badge className={`text-[9px] font-bold uppercase ${pri.bg} ${pri.color} border-0`}>{pri.label}</Badge>
                  {task.due_date && (
                    <span className={`text-[11px] ${isOverdue ? 'text-red-500 font-semibold' : 'text-slate-400'}`}>
                      {formatDate(task.due_date)}
                    </span>
                  )}
                  <div className={`w-6 h-6 rounded-full ${avatarColor(task.assigned_to_name)} flex items-center justify-center`}>
                    <span className="text-[8px] font-bold text-white">{getInitials(task.assigned_to_name)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Dialogs */}
      <TaskFormDialog open={showCreate} onClose={() => setShowCreate(false)} staff={staff} onCreated={fetchTasks} />
      <TaskDetailDialog
        task={selectedTask} open={!!selectedTask} onClose={() => setSelectedTask(null)}
        staff={staff} user={user} onRefresh={fetchTasks}
      />
    </div>
  );
}
