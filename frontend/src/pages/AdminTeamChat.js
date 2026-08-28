import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import EmojiPicker from 'emoji-picker-react';
import {
  Send, Smile, Paperclip, Users, Plus, MessageCircle, Image as ImageIcon,
  FileText, X, ArrowLeft, Hash, User, Download, ListTodo, Calendar, Flag,
  Check, CheckCheck, Search
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

function timeAgo(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return 'ahora';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
}

function isImage(name) {
  return /\.(jpg|jpeg|png|gif|webp)$/i.test(name || '');
}

export default function AdminTeamChat() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [activeConv, setActiveConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [staffList, setStaffList] = useState([]);
  const [groupName, setGroupName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [showTaskDialog, setShowTaskDialog] = useState(false);
  const [taskForm, setTaskForm] = useState({ title: '', description: '', priority: 'media', due_date: '', assigned_to: '' });
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const pollRef = useRef(null);
  const lastMsgCountRef = useRef(0);

  const userId = user?.id || user?._id || '';

  const playNotificationSound = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    } catch {}
  }, []);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await api.get('/team-chat/conversations');
      setConversations(res.data);
    } catch {}
  }, []);

  const fetchMessages = useCallback(async (convId) => {
    if (!convId) return;
    try {
      const res = await api.get(`/team-chat/conversations/${convId}/messages?limit=100`);
      setMessages(res.data);
    } catch {}
  }, []);

  const fetchStaff = useCallback(async () => {
    try {
      const res = await api.get('/team-chat/staff-list');
      setStaffList(res.data.filter(s => s.id !== userId));
    } catch {}
  }, [userId]);

  useEffect(() => { fetchConversations(); fetchStaff(); }, [fetchConversations, fetchStaff]);

  useEffect(() => {
    if (activeConv) {
      fetchMessages(activeConv);
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(() => { fetchMessages(activeConv); fetchConversations(); }, 4000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [activeConv, fetchMessages, fetchConversations]);

  useEffect(() => {
    if (messages.length > 0 && lastMsgCountRef.current > 0 && messages.length > lastMsgCountRef.current) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.sender_id !== userId) {
        playNotificationSound();
      }
    }
    lastMsgCountRef.current = messages.length;
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, userId, playNotificationSound]);

  const handleSend = async () => {
    if (!input.trim() || !activeConv) return;
    const text = input;
    setInput('');
    setShowEmoji(false);
    try {
      await api.post(`/team-chat/conversations/${activeConv}/messages`, { content: text, msg_type: 'text' });
      fetchMessages(activeConv);
      fetchConversations();
    } catch { toast.error('Error enviando mensaje'); }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !activeConv) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const uploadRes = await api.post('/team-chat/upload', formData);
      const msgType = isImage(file.name) ? 'image' : 'file';
      await api.post(`/team-chat/conversations/${activeConv}/messages`, {
        content: file.name, msg_type: msgType,
        file_url: uploadRes.data.file_url, file_name: uploadRes.data.file_name,
      });
      fetchMessages(activeConv);
      fetchConversations();
    } catch { toast.error('Error subiendo archivo'); }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCreateConversation = async (type) => {
    if (type === 'group' && !groupName.trim()) { toast.error('Nombre del grupo requerido'); return; }
    if (selectedMembers.length === 0) { toast.error('Selecciona al menos un miembro'); return; }
    try {
      const res = await api.post('/team-chat/conversations', {
        type, members: [...selectedMembers, userId], name: groupName,
      });
      setShowNewChat(false);
      setGroupName('');
      setSelectedMembers([]);
      fetchConversations();
      setActiveConv(res.data.id);
    } catch { toast.error('Error creando conversacion'); }
  };

  const handleStartPrivate = async (staffId) => {
    try {
      const res = await api.post('/team-chat/conversations', {
        type: 'private', members: [staffId, userId],
      });
      setShowNewChat(false);
      fetchConversations();
      setActiveConv(res.data.id);
    } catch {}
  };

  const openTaskDialog = () => {
    const otherMember = activeConvData?.type === 'private'
      ? Object.keys(activeConvData?.member_names || {}).find(id => id !== userId) || ''
      : '';
    setTaskForm({ title: '', description: '', priority: 'media', due_date: '', assigned_to: otherMember });
    setShowTaskDialog(true);
  };

  const handleCreateTask = async () => {
    if (!taskForm.title.trim()) { toast.error('Titulo requerido'); return; }
    if (!taskForm.assigned_to) { toast.error('Selecciona a quien asignar'); return; }
    try {
      await api.post('/tasks', {
        title: taskForm.title,
        description: taskForm.description,
        priority: taskForm.priority,
        due_date: taskForm.due_date,
        assigned_to: taskForm.assigned_to,
      });
      const assignedName = staffList.find(s => s.id === taskForm.assigned_to)?.name || 
        activeConvData?.member_names?.[taskForm.assigned_to] || 'usuario';
      if (activeConv) {
        await api.post(`/team-chat/conversations/${activeConv}/messages`, {
          content: `📋 Tarea asignada a ${assignedName}: "${taskForm.title}" [${taskForm.priority.toUpperCase()}]${taskForm.due_date ? ` - Vence: ${taskForm.due_date}` : ''}`,
          msg_type: 'text',
        });
        fetchMessages(activeConv);
        fetchConversations();
      }
      setShowTaskDialog(false);
      toast.success(`Tarea asignada a ${assignedName}`);
    } catch { toast.error('Error creando tarea'); }
  };

  const getConvName = (conv) => {
    if (conv.type === 'group') return conv.name || 'Grupo';
    const otherNames = Object.entries(conv.member_names || {}).filter(([id]) => id !== userId).map(([, n]) => n);
    return otherNames.join(', ') || 'Chat';
  };

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim() || !activeConv) return;
    setSearching(true);
    try {
      const res = await api.get(`/team-chat/conversations/${activeConv}/search?q=${encodeURIComponent(searchQuery)}`);
      setSearchResults(res.data);
    } catch {}
    setSearching(false);
  }, [searchQuery, activeConv]);

  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    const t = setTimeout(handleSearch, 400);
    return () => clearTimeout(t);
  }, [searchQuery, handleSearch]);

  const getConvInitial = (conv) => {
    const name = getConvName(conv);
    return name.charAt(0).toUpperCase();
  };

  const activeConvData = conversations.find(c => c.id === activeConv);

  return (
    <div className="flex h-[calc(100vh-120px)] bg-white border border-slate-200 rounded-xl overflow-hidden" data-testid="team-chat">
      {/* Sidebar */}
      <div className={`w-full sm:w-80 border-r border-slate-200 flex flex-col shrink-0 ${activeConv ? 'hidden sm:flex' : 'flex'}`}>
        <div className="p-4 border-b border-slate-100">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>Chat Equipo</h2>
            <Button size="sm" variant="outline" onClick={() => setShowNewChat(true)} className="h-8 w-8 p-0" data-testid="new-chat-btn">
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="p-8 text-center">
              <MessageCircle className="w-10 h-10 text-slate-200 mx-auto mb-3" strokeWidth={1} />
              <p className="text-sm text-slate-400">Sin conversaciones</p>
              <Button size="sm" variant="outline" onClick={() => setShowNewChat(true)} className="mt-3 text-xs">Iniciar chat</Button>
            </div>
          ) : conversations.map(c => (
            <div key={c.id} onClick={() => setActiveConv(c.id)}
              className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${activeConv === c.id ? 'bg-slate-100' : 'hover:bg-slate-50'}`}
              data-testid={`conv-${c.id}`}>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-white font-bold text-sm ${c.type === 'group' ? 'bg-violet-500' : 'bg-slate-700'}`}>
                {c.type === 'group' ? <Users className="w-4 h-4" /> : getConvInitial(c)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-900 truncate">{getConvName(c)}</p>
                  <span className="text-[10px] text-slate-400 shrink-0">{timeAgo(c.last_time)}</span>
                </div>
                <p className="text-xs text-slate-500 truncate mt-0.5">
                  {c.last_message_type === 'image' ? '📷 Imagen' : c.last_message_type === 'file' ? '📎 Archivo' : c.last_message || 'Sin mensajes'}
                </p>
              </div>
              {c.unread > 0 && (
                <span className="w-5 h-5 bg-violet-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center shrink-0 animate-pulse-badge">
                  {c.unread > 9 ? '9+' : c.unread}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Chat area */}
      <div className={`flex-1 flex flex-col ${!activeConv ? 'hidden sm:flex' : 'flex'}`}>
        {!activeConv ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MessageCircle className="w-16 h-16 text-slate-200 mx-auto mb-4" strokeWidth={1} />
              <p className="text-sm text-slate-400">Selecciona una conversacion</p>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3 bg-white">
              <button onClick={() => setActiveConv(null)} className="sm:hidden p-1">
                <ArrowLeft className="w-5 h-5 text-slate-500" />
              </button>
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm ${activeConvData?.type === 'group' ? 'bg-violet-500' : 'bg-slate-700'}`}>
                {activeConvData?.type === 'group' ? <Hash className="w-4 h-4" /> : getConvInitial(activeConvData || {})}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900">{activeConvData ? getConvName(activeConvData) : ''}</p>
                <p className="text-[10px] text-slate-400">
                  {activeConvData?.type === 'group'
                    ? `${Object.keys(activeConvData?.member_names || {}).length} miembros`
                    : 'Privado'}
                </p>
              </div>
              <button onClick={() => { setSearchOpen(!searchOpen); setSearchQuery(''); setSearchResults([]); }}
                className={`p-2 rounded-full transition-colors ${searchOpen ? 'bg-violet-100 text-violet-600' : 'text-slate-400 hover:bg-slate-100'}`} data-testid="search-chat-btn">
                <Search className="w-4 h-4" />
              </button>
            </div>

            {/* Search bar */}
            {searchOpen && (
              <div className="px-4 py-2 border-b border-slate-100 bg-white">
                <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-3">
                  <Search className="w-4 h-4 text-slate-400 shrink-0" />
                  <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Buscar mensajes y archivos..."
                    className="border-0 bg-transparent focus-visible:ring-0 p-0 h-9 text-sm" autoFocus data-testid="search-chat-input" />
                  {searchQuery && <button onClick={() => { setSearchQuery(''); setSearchResults([]); }} className="text-slate-400 hover:text-slate-600"><X className="w-3.5 h-3.5" /></button>}
                </div>
                {searchResults.length > 0 && (
                  <div className="mt-2 max-h-48 overflow-y-auto space-y-1">
                    {searchResults.map(r => (
                      <div key={r.id} className="flex items-start gap-2 px-2 py-2 rounded-lg hover:bg-slate-50 cursor-pointer text-left">
                        <div className="shrink-0 mt-0.5">
                          {r.msg_type === 'image' ? <ImageIcon className="w-3.5 h-3.5 text-violet-400" /> : r.msg_type === 'file' ? <FileText className="w-3.5 h-3.5 text-blue-400" /> : <MessageCircle className="w-3.5 h-3.5 text-slate-400" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-slate-900 truncate">{r.content || r.file_name}</p>
                          <p className="text-[10px] text-slate-400">{r.sender_name} · {new Date(r.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {searchQuery && searchResults.length === 0 && !searching && (
                  <p className="text-xs text-slate-400 text-center py-3">Sin resultados</p>
                )}
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1 bg-slate-50/50">
              {messages.map((msg, i) => {
                const isMine = msg.sender_id === userId;
                const showAvatar = !isMine && (i === 0 || messages[i - 1]?.sender_id !== msg.sender_id);
                const readByOthers = (msg.read_by || []).filter(id => id !== msg.sender_id).length;
                const totalOthers = activeConvData ? Object.keys(activeConvData.member_names || {}).length - 1 : 1;
                const isRead = readByOthers >= totalOthers && totalOthers > 0;
                return (
                  <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'} ${showAvatar ? 'mt-3' : 'mt-0.5'}`}>
                    <div className={`max-w-[75%] ${isMine ? 'items-end' : 'items-start'}`}>
                      {showAvatar && !isMine && (
                        <p className="text-[10px] font-medium text-slate-500 mb-1 ml-1">{msg.sender_name}</p>
                      )}
                      <div className={`rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                        isMine
                          ? 'bg-violet-500 text-white rounded-br-md'
                          : 'bg-white border border-slate-200 text-slate-800 rounded-bl-md'
                      }`}>
                        {msg.msg_type === 'image' && msg.file_url && (
                          <img src={`${process.env.REACT_APP_BACKEND_URL}/api/team-chat/file?path=${encodeURIComponent(msg.file_url)}`}
                            alt={msg.file_name} className="max-w-full rounded-lg mb-1 max-h-60 object-cover cursor-pointer"
                            onClick={() => window.open(`${process.env.REACT_APP_BACKEND_URL}/api/team-chat/file?path=${encodeURIComponent(msg.file_url)}`, '_blank')} />
                        )}
                        {msg.msg_type === 'file' && msg.file_url && (
                          <a href={`${process.env.REACT_APP_BACKEND_URL}/api/team-chat/file?path=${encodeURIComponent(msg.file_url)}`}
                            target="_blank" rel="noreferrer"
                            className={`flex items-center gap-2 py-1 ${isMine ? 'text-white/90 hover:text-white' : 'text-violet-600 hover:text-violet-700'}`}>
                            <FileText className="w-4 h-4 shrink-0" />
                            <span className="text-xs underline truncate">{msg.file_name || 'Documento'}</span>
                            <Download className="w-3 h-3 shrink-0" />
                          </a>
                        )}
                        {msg.msg_type === 'text' && <span>{msg.content}</span>}
                      </div>
                      <div className={`flex items-center gap-1 mt-0.5 ${isMine ? 'justify-end mr-1' : 'ml-1'}`}>
                        <p className="text-[9px] text-slate-400">
                          {new Date(msg.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                        {isMine && (
                          isRead
                            ? <CheckCheck className="w-3.5 h-3.5 text-blue-400" />
                            : <Check className="w-3 h-3 text-slate-300" />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-3 border-t border-slate-100 bg-white relative">
              {showEmoji && (
                <div className="absolute bottom-16 left-3 z-50">
                  <EmojiPicker onEmojiClick={(e) => setInput(prev => prev + e.emoji)} height={350} width={300}
                    searchPlaceholder="Buscar emoji..." previewConfig={{ showPreview: false }} skinTonesDisabled />
                </div>
              )}
              <div className="flex items-center gap-2">
                <button onClick={() => setShowEmoji(!showEmoji)}
                  className={`p-2 rounded-full transition-colors ${showEmoji ? 'bg-violet-100 text-violet-600' : 'text-slate-400 hover:bg-slate-100'}`} data-testid="emoji-btn">
                  <Smile className="w-5 h-5" />
                </button>
                <button onClick={() => fileInputRef.current?.click()}
                  className="p-2 rounded-full text-slate-400 hover:bg-slate-100 transition-colors" disabled={uploading} data-testid="attach-btn">
                  <Paperclip className="w-5 h-5" />
                </button>
                <button onClick={openTaskDialog}
                  className="p-2 rounded-full text-slate-400 hover:bg-amber-100 hover:text-amber-600 transition-colors" data-testid="task-btn" title="Asignar tarea">
                  <ListTodo className="w-5 h-5" />
                </button>
                <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.gif,.webp" onChange={handleFileUpload} />
                <Input value={input} onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  placeholder="Escribe un mensaje..." className="flex-1 rounded-full border-slate-200 h-10 text-sm focus-visible:ring-violet-300"
                  data-testid="chat-input" />
                <button onClick={handleSend} disabled={!input.trim()}
                  className={`p-2.5 rounded-full transition-colors ${input.trim() ? 'bg-violet-500 text-white hover:bg-violet-600' : 'bg-slate-100 text-slate-300'}`}
                  data-testid="send-btn">
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* New Chat Dialog */}
      <Dialog open={showNewChat} onOpenChange={setShowNewChat}>
        <DialogContent className="max-w-sm rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold" style={{ fontFamily: 'Manrope, sans-serif' }}>Nueva conversacion</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Chat privado</p>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {staffList.map(s => (
                <button key={s.id} onClick={() => handleStartPrivate(s.id)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-50 text-left transition-colors">
                  <div className="w-8 h-8 rounded-full bg-slate-700 text-white flex items-center justify-center text-xs font-bold">
                    {s.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">{s.name}</p>
                    <p className="text-[10px] text-slate-400">{s.role === 'admin' ? 'Admin' : 'Staff'}</p>
                  </div>
                </button>
              ))}
            </div>
            <div className="border-t border-slate-100 pt-4">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400 mb-2">Grupo nuevo</p>
              <Input placeholder="Nombre del grupo" value={groupName} onChange={e => setGroupName(e.target.value)} className="mb-2 h-9" data-testid="group-name-input" />
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {staffList.map(s => (
                  <label key={s.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-50 cursor-pointer">
                    <input type="checkbox" checked={selectedMembers.includes(s.id)}
                      onChange={e => setSelectedMembers(e.target.checked ? [...selectedMembers, s.id] : selectedMembers.filter(id => id !== s.id))}
                      className="rounded border-slate-300" />
                    <span className="text-sm text-slate-700">{s.name}</span>
                  </label>
                ))}
              </div>
              <Button onClick={() => handleCreateConversation('group')} className="w-full mt-3 bg-violet-500 hover:bg-violet-600 rounded-lg h-9" data-testid="create-group-btn">
                Crear grupo
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Task Dialog */}
      <Dialog open={showTaskDialog} onOpenChange={setShowTaskDialog}>
        <DialogContent className="max-w-sm rounded-xl">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
                <ListTodo className="w-4 h-4 text-amber-600" />
              </div>
              <DialogTitle className="text-lg font-semibold" style={{ fontFamily: 'Manrope, sans-serif' }}>Asignar tarea</DialogTitle>
            </div>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Titulo *</label>
              <Input value={taskForm.title} onChange={e => setTaskForm({...taskForm, title: e.target.value})} placeholder="Ej: Revisar documentos de Juan" data-testid="task-title-input" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Descripcion</label>
              <Textarea value={taskForm.description} onChange={e => setTaskForm({...taskForm, description: e.target.value})} placeholder="Detalles de la tarea..." rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Prioridad</label>
                <Select value={taskForm.priority} onValueChange={v => setTaskForm({...taskForm, priority: v})}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="baja"><span className="flex items-center gap-1.5"><Flag className="w-3 h-3 text-blue-500" />Baja</span></SelectItem>
                    <SelectItem value="media"><span className="flex items-center gap-1.5"><Flag className="w-3 h-3 text-amber-500" />Media</span></SelectItem>
                    <SelectItem value="alta"><span className="flex items-center gap-1.5"><Flag className="w-3 h-3 text-red-500" />Alta</span></SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Fecha limite</label>
                <Input type="date" value={taskForm.due_date} onChange={e => setTaskForm({...taskForm, due_date: e.target.value})} className="h-9" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Asignar a *</label>
              <Select value={taskForm.assigned_to} onValueChange={v => setTaskForm({...taskForm, assigned_to: v})}>
                <SelectTrigger className="h-9" data-testid="task-assign-select"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>
                  {[...staffList, ...(userId ? [{ id: userId, name: user?.name || 'Yo', role: 'admin' }] : [])].map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleCreateTask} className="w-full h-10 bg-amber-500 hover:bg-amber-600 rounded-lg font-medium" data-testid="create-task-btn">
              <ListTodo className="w-4 h-4 mr-2" /> Asignar tarea
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
