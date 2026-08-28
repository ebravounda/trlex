# Tramilex - PRD

## Stack: React + FastAPI + MongoDB + Emergent Object Storage + Groq (Chatbot) + Stripe (Payments) + ReportLab (PDF)

## Funcionalidades Implementadas
- Auth JWT (clientes, admin, empresas CIF/NIF, staff)
- **Login por PIN de 6 dígitos** (clientes, staff, empresas por email — auto-detección backend)
- **"Mantener sesión abierta"** extiende token JWT a 30 días
- **Acceso Administrador** como link discreto (admins usan email + contraseña)
- Dashboard Cliente con requisitos colapsables en movil
- Dashboard Admin completo con saludo por hora (Buenos dias/tardes/noches + nombre)
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
- Configuracion completa: SMTP, Mailgun, Datos empresa/pagos
- Creador de Presupuestos: PDF profesional con logo, IVA, numeracion desde #1453
- Recordatorio de Citas: Email 24h antes al admin y cliente
- Cambio forzado de clave: Staff debe cambiar clave temporal en primer login
- Email bienvenida staff: Email con credenciales y boton "Portal" a www.tramilex.es
- Tutorial interactivo: Tour paso a paso diferenciado por rol (admin/client/company)
- Team Chat con tareas, búsqueda, read receipts, sonido notificación
- Animaciones globales y recharts para gráficos de facturación

## Colecciones MongoDB
users, documents, companies, company_workers, company_documents, company_tramites, company_emails, sign_requests, tasks, notifications, chat_messages, audit_logs, settings, tramite_overrides, custom_tramites, billing, appointments, appointment_settings, payment_transactions, presupuestos, auth_pins

## 3rd Party Integrations
- Emergent Object Storage (file uploads)
- Microsoft Graph API / direct requests OAuth (Outlook inbox)
- Groq API (Chatbot LLM - qwen/qwen3.6-27b)
- Stripe (Appointment payments - Sandbox)
- ReportLab (PDF generation)

## Key API Endpoints (Auth)
- `POST /api/auth/request-pin` — Auto-detecta usuario vs empresa por email, envía PIN de 6 dígitos
- `POST /api/auth/verify-pin` — Verifica PIN, retorna token JWT (30d si keep_session)
- `POST /api/auth/login` — Login tradicional con contraseña (admins/staff)

## Backlog
- P1: Refactorizar server.py en modulos/routers (>4500 lineas)
- P1: Automatizar recordatorio de citas con scheduler/cron
- P2: Historial de accesos (IP, fecha, usuario)
- P3: Mejoras UI/UX adicionales

## Deployment
- Producción: Plesk en tramilex.goroky.es (SSH deploy)
- NUNCA sobreescribir .env de producción
- Script deploy_script.sh respalda .env automáticamente
