# Tramilex - PRD

## Stack
React + FastAPI + MongoDB + Emergent Object Storage + Groq (Chatbot) + Stripe (Payments) + ReportLab (PDF) + Resend (Email) + PyMuPDF (PDF Compression)

## Funcionalidades Implementadas
- Auth JWT + Login por PIN de 6 digitos (clientes, staff, empresas por email)
- "Mantener sesion abierta" (token 30 dias)
- Acceso Administrador como link discreto
- Resend API como metodo principal de email, SMTP como fallback
- Funcion universal _send_email() para todos los correos
- **Tareas Kanban** — Tablero con columnas por estado, barra progreso, avatares, vista lista/kanban
- **Compresor PDF** — Sube PDF y comprime a 2MB/4MB (PyMuPDF + Pillow)
- **Formularios** — 27 modelos oficiales EX00-EX32 del Ministerio de Migraciones
- **Servidor** — Tutorial Chrome Remote Desktop (Windows/Mac) con credenciales y PIN
- Dashboard Cliente/Admin, Modulo Empresas, Chatbot Groq
- Staff/Equipo, Sistema de Tareas, Notificaciones
- Documentos firmados, Panel empresa, Inbox Outlook (MS Graph)
- Contabilidad, Citas con Stripe, Presupuestos PDF
- Team Chat, Tutorial interactivo, Animaciones

## Deployment
- Produccion: Plesk en tramilex.goroky.es
- Repo: https://github.com/ebravounda/trlex
- NUNCA sobreescribir .env de produccion
- Deploy: Save to Github → git stash && git pull && git stash drop → ./deploy.sh → rm __pycache__ → restart uvicorn
- Backend: venv Python 3.11, puerto 8002
- Nginx: /api/ → 127.0.0.1:8002
- Plesk user: goro8m_kr30w0bmlb:psaserv
- IMPORTANTE: Siempre rm -rf __pycache__ antes de reiniciar uvicorn

## Backlog
- P1: Refactorizar server.py en modulos/routers (>4400 lineas)
- P1: Automatizar recordatorio de citas con scheduler/cron
- P2: Historial de accesos (IP, fecha, usuario)
- P2: Notificaciones push en tiempo real
- P3: Mejoras UI/UX adicionales
