# Tramilex - PRD

## Stack
React + FastAPI + MongoDB + Emergent Object Storage + Groq (Chatbot) + Stripe (Payments) + ReportLab (PDF) + Resend (Email) + PyMuPDF (PDF Compression) + OpenAI Whisper (Audio Transcription) + APScheduler (Task Reminders)

## Funcionalidades Implementadas
- Auth JWT + Login por PIN de 6 digitos (clientes, staff, empresas por email)
- "Mantener sesion abierta" (token 30 dias)
- Acceso Administrador como link discreto
- Resend API como metodo principal de email, SMTP como fallback
- Funcion universal _send_email() para todos los correos
- **Tareas Kanban** — Tablero con columnas por estado, barra progreso, avatares, vista lista/kanban, filtro por prioridad
- **Tareas: Edicion completa** — Editar titulo, descripcion, prioridad, estado, fecha limite, asignado, numero de expediente
- **Tareas: Documentos adjuntos** — Subir multiples documentos (drag-and-drop), descargar, eliminar, con almacenamiento en Object Storage
- **Tareas: Envio por email** — Enviar todos los documentos adjuntos al miembro del equipo asignado via Resend con attachments
- **Tareas: Numero de Expediente** — Campo opcional en creacion y edicion de tareas, visible en tarjetas y lista
- **Tareas: Notas de Voz** — Grabar audio desde movil, transcripcion automatica con OpenAI Whisper (es), reproduccion para todos los usuarios
- **Tareas: Recordatorios automaticos** — Scheduler cada 6h que envia email + notificacion campanita 5, 3, 2, 1 dias antes del vencimiento a: asignado, admins, kortiz@tramilex.es. Con deduplicacion via collection task_reminders
- **Tareas: Notificacion -> Tarea** — Click en notificacion de tarea navega directamente a /admin/tareas?task={id} y abre el detalle
- **Compresor PDF** — Sube PDF y comprime a 2MB/4MB (PyMuPDF + Pillow)
- **Formularios** — 27 modelos oficiales EX00-EX32 del Ministerio de Migraciones
- **Servidor** — Tutorial Chrome Remote Desktop (Windows/Mac) con credenciales y PIN
- Dashboard Cliente/Admin, Modulo Empresas, Chatbot Groq
- Staff/Equipo, Sistema de Tareas, Notificaciones
- Documentos firmados, Panel empresa, Inbox Outlook (MS Graph)
- Contabilidad, Citas con Stripe, Presupuestos PDF
- Team Chat, Tutorial interactivo, Animaciones
- **Personal Global** — Vista global de trabajadores con categorizacion por profesion
- **DocumentFolders** — Carpetas con colores, drag-and-drop, renombrar, preview inline, limite 50MB

## Deployment
- Produccion: Plesk en tramilex.goroky.es
- Repo: https://github.com/ebravounda/trlex
- NUNCA sobreescribir .env de produccion
- Deploy: Save to Github > cd /var/www/vhosts/goroky.com/tramilex.goroky.es && git stash && git pull origin main && git stash drop && ./deploy.sh
- Backend: venv Python 3.11, puerto 8002
- Nginx: /api/ > 127.0.0.1:8002
- IMPORTANTE: Siempre rm -rf __pycache__ antes de reiniciar uvicorn
- IMPORTANTE: Agregar OPENAI_API_KEY al .env de produccion

## DB Collections
- `tasks`: title, description, priority, status, assigned_to, due_date, numero_expediente, comments[], created_at
- `task_documents`: task_id, original_filename, content_type, size, storage_path, uploaded_by, is_deleted
- `task_audios`: task_id, storage_path, original_filename, content_type, size, transcription, recorded_by, created_at
- `task_reminders`: reminder_key (dedup), task_id, days_before, sent_at
- `company_documents`: company_id, worker_id, folder_id, storage_path, original_filename, ...
- `company_workers`: company_id, name, profession, ...

## Backlog
- P0: Bug subida multiple documentos de Trabajador (multi-upload workers)
- P1: Refactorizar server.py en modulos/routers (>5200 lineas)
- P1: Automatizar recordatorio de citas con scheduler/cron
- P2: Historial de accesos (IP, fecha, usuario)
- P2: Notificaciones push en tiempo real
- P3: Mejoras UI/UX adicionales
