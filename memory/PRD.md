# Tramilex - PRD

## Stack: React + FastAPI + MongoDB + Emergent Object Storage + Groq (Chatbot) + Stripe (Payments) + ReportLab (PDF) + Resend (Email)

## Funcionalidades Implementadas
- Auth JWT (clientes, admin, empresas, staff)
- **Login por PIN de 6 digitos** (clientes, staff, empresas por email — auto-deteccion backend)
- **"Mantener sesion abierta"** extiende token JWT a 30 dias
- **Acceso Administrador** como link discreto (admins usan email + contrasena)
- **Resend API** como metodo principal de email, SMTP como fallback
- **Funcion universal _send_email()** — todas las funciones de correo usan Resend primero, SMTP despues
- Dashboard Cliente con requisitos colapsables en movil
- Dashboard Admin completo con saludo por hora
- Modulo Empresas (CRUD, trabajadores, documentos, tramites, credenciales, firma)
- Chatbot asistente con Groq (qwen/qwen3.6-27b)
- Staff/Equipo: Admin crea usuarios con cambio forzado de clave + email bienvenida
- Sistema de Tareas: Crear/asignar tareas con prioridad, estados, comentarios
- Notificaciones: Campanita con contador
- Documentos firmados (flujo descargar-firmar-subir)
- Panel empresa (tramites, trabajadores, documentos, firma)
- Inbox Outlook: Lectura de correos via Microsoft Graph API (direct requests OAuth)
- Contabilidad: Modulo de facturacion y control de cobros/pagos
- Sistema de Citas: Reserva consultas 45 min con pago Stripe
- Configuracion completa: Resend, SMTP, Mailgun, Datos empresa/pagos
- Creador de Presupuestos: PDF profesional con logo, IVA, numeracion desde #1453
- Team Chat con tareas, busqueda, read receipts, sonido notificacion
- Animaciones globales y recharts para graficos de facturacion
- Tutorial interactivo por rol

## Colecciones MongoDB
users, documents, companies, company_workers, company_documents, company_tramites, company_emails, sign_requests, tasks, notifications, chat_messages, audit_logs, settings, tramite_overrides, custom_tramites, billing, appointments, appointment_settings, payment_transactions, presupuestos, auth_pins

## 3rd Party Integrations
- Resend API (email transaccional - configurable desde admin)
- Emergent Object Storage (file uploads)
- Microsoft Graph API / direct requests OAuth (Outlook inbox)
- Groq API (Chatbot LLM - qwen/qwen3.6-27b)
- Stripe (Appointment payments - Sandbox)
- ReportLab (PDF generation)

## Key API Endpoints (Auth)
- POST /api/auth/request-pin — Auto-detecta usuario vs empresa por email, envia PIN de 6 digitos
- POST /api/auth/verify-pin — Verifica PIN, retorna token JWT (30d si keep_session)
- POST /api/auth/login — Login tradicional con contrasena (admins/staff)
- GET/PUT /api/settings/resend — Configuracion Resend API

## Deployment
- Produccion: Plesk en tramilex.goroky.es (SSH deploy via git pull)
- Repo Github: https://github.com/ebravounda/trlex
- NUNCA sobreescribir .env de produccion
- Script deploy.sh: git pull + restaura .env + build + permisos + restart
- Copiar frontend/build/* a raiz del proyecto (Apache sirve desde ahi)
- Backend usa venv con Python 3.11 en puerto 8002
- Nginx proxy: /api/ -> 127.0.0.1:8002
- Plesk user: goro8m_kr30w0bmlb:psaserv

## Backlog
- P1: Refactorizar server.py en modulos/routers (>4400 lineas)
- P1: Automatizar recordatorio de citas con scheduler/cron
- P2: Historial de accesos (IP, fecha, usuario)
- P3: Mejoras UI/UX adicionales
