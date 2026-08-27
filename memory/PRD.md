# Tramilex - PRD

## Stack: React + FastAPI + MongoDB + Emergent Object Storage + Groq (Chatbot) + Stripe (Payments) + ReportLab (PDF)

## Funcionalidades Implementadas
- Auth JWT (clientes, admin, empresas CIF/NIF, staff)
- Dashboard Cliente con requisitos colapsables en movil
- Dashboard Admin completo
- Modulo Empresas (CRUD, trabajadores, documentos, tramites, credenciales, firma)
- Chatbot asistente con Groq (Llama 3.3 70B)
- Staff/Equipo: Admin crea usuarios del despacho con rol "staff"
- Sistema de Tareas: Crear/asignar tareas con prioridad, estados, comentarios
- Notificaciones: Campanita con contador
- Documentos firmados (flujo descargar-firmar-subir)
- Panel empresa (tramites, trabajadores, documentos, firma)
- Inbox Outlook: Lectura de correos via Microsoft Graph API (msal)
- Contabilidad: Modulo de facturacion y control de cobros/pagos
- Sistema de Citas: Reserva de consultas 45 min con pago Stripe
  - Pagina publica /citas/reservar, seleccion Chile/Espana
  - Pago obligatorio via Stripe, email confirmacion, badge rojo admin
- Configuracion completa: SMTP, Mailgun, Datos empresa/pagos (telefonos, IBAN, cuenta Chile)
- Creador de Presupuestos: PDF profesional con logo, datos empresa, IVA 19%/21%, numeracion desde #1453
- Recordatorio de Citas: Email 24h antes al admin y al cliente

## Colecciones MongoDB
users, documents, companies, company_workers, company_documents, company_tramites, company_emails, sign_requests, tasks, notifications, chat_messages, audit_logs, settings, tramite_overrides, custom_tramites, billing, appointments, appointment_settings, payment_transactions, presupuestos

## 3rd Party Integrations
- Emergent Object Storage (file uploads)
- Microsoft Graph API / msal (Outlook inbox)
- Groq API (Chatbot LLM)
- Stripe (Appointment payments - Sandbox)
- ReportLab (PDF generation)

## Backlog
- P1: Automatizar recordatorio de citas con scheduler/cron
- P2: Refactorizar server.py en modulos/routers (>4000 lineas)
- P2: Validacion schema items presupuesto con Pydantic model
- P3: Mejoras UI/UX adicionales
