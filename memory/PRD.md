# Tramilex - Immigration Document Management System

## Original Problem Statement
Sistema para abogado de inmigracion donde clientes con pasaporte y NIE pueden registrarse y subir documentos en PDF o imagenes. El abogado descarga documentos en panel admin con fecha/hora de carga, datos del usuario (NIE, Pasaporte, correo, telefono, direccion, ciudad, pais de origen, pais de residencia). Gestion de estados de documentos, filtros por pais/NIE/pasaporte, configuracion SMTP para notificaciones email.

## Architecture
- Backend: FastAPI + MongoDB (motor async)
- Frontend: React + Tailwind CSS + Shadcn UI
- File Storage: Emergent Object Storage
- Auth: JWT Bearer tokens + bcrypt password hashing
- Email: SMTP configurable by admin

## User Personas
1. **Cliente** - Persona que necesita subir documentos de inmigracion
2. **Abogado/Admin** - Profesional que gestiona documentos y casos

## Core Requirements
- [x] Client registration with NIE/Passport/personal data
- [x] Document upload (PDF/images) with original filenames
- [x] Admin panel to view/manage clients and documents
- [x] Document status management (Pendiente de revision / Revisado)
- [x] Document download and deletion
- [x] SMTP configuration for email notifications
- [x] Client filtering (country, NIE, passport, name, email)
- [x] Auto-delete documents when deleting client

## What's Been Implemented (Feb 2026)
- Full auth system (JWT + bcrypt + admin seeding)
- Client registration with all personal data fields
- Document upload to Emergent Object Storage
- Client dashboard with drag-and-drop upload zone
- Admin panel with sidebar navigation
- Client list with search and country filter
- Client detail view with document management
- Document status management via dropdown
- Document download and deletion
- SMTP settings configuration
- Background email notifications on document upload

### Phase 2 (Feb 2026)
- Document categories (identificacion, residencia, trabajo, resolucion, contrato, fiscal, otros)
- Bulk download of all client documents as ZIP
- Audit log tracking all system actions (uploads, deletes, status changes, SMTP updates)
- Admin can upload documents to client profiles (resoluciones, etc.)
- Client receives email notification when admin uploads a document
- uploaded_by tracking (client vs admin) shown in document tables

## P0 (Remaining)
- None - MVP + Phase 2 complete

## P1 (Nice to have)
- Document expiry/reminder system
- Dashboard analytics for admin
- Multiple admin users support

## P2 (Future)
- Multi-language support
- Client portal notifications
- Automatic document expiry reminders
- Multiple admin users
