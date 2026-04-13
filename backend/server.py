from pathlib import Path
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI, APIRouter, UploadFile, File, Form, HTTPException, Request, Depends, BackgroundTasks
from fastapi.responses import Response as FastAPIResponse, StreamingResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
import os
import logging
import uuid
import bcrypt
import jwt
import requests as http_requests
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel
from typing import Optional, List
import smtplib
import zipfile
import io
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from tramites_data import TRAMITES, get_tramites_by_country, get_tramite_docs

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# MongoDB
mongo_url = os.environ['MONGO_URL']
mongo_client = AsyncIOMotorClient(mongo_url)
db = mongo_client[os.environ['DB_NAME']]

# JWT
JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = "HS256"

# Object Storage
STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = "tramilex"
storage_key = None


def init_storage():
    global storage_key
    if storage_key:
        return storage_key
    resp = http_requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    storage_key = resp.json()["storage_key"]
    return storage_key


def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    resp = http_requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data, timeout=120
    )
    resp.raise_for_status()
    return resp.json()


def get_object(path: str):
    key = init_storage()
    resp = http_requests.get(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key}, timeout=60
    )
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


# --- Password helpers ---
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


# --- JWT helpers ---
def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=24),
        "type": "access"
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


# --- Auth dependency ---
async def get_current_user(request: Request):
    auth_header = request.headers.get("Authorization", "")
    token = None
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
    if not token:
        token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=401, detail="No autenticado")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Token invalido")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="Usuario no encontrado")
        user["_id"] = str(user["_id"])
        user.pop("password_hash", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expirado")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token invalido")


async def require_admin(request: Request):
    user = await get_current_user(request)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Acceso denegado")
    return user


# --- Document Categories ---
DOCUMENT_CATEGORIES = [
    "identificacion", "residencia", "trabajo",
    "resolucion", "contrato", "fiscal", "otros"
]


# --- Audit Log Helper ---
async def log_audit(action: str, user_id: str, user_name: str, details: dict = None):
    await db.audit_logs.insert_one({
        "action": action,
        "user_id": user_id,
        "user_name": user_name,
        "details": details or {},
        "timestamp": datetime.now(timezone.utc).isoformat()
    })


# --- App setup ---
app = FastAPI()
api_router = APIRouter(prefix="/api")


# --- Pydantic Models ---
class LoginInput(BaseModel):
    email: str
    password: str


class RegisterInput(BaseModel):
    email: str
    password: str
    name: str
    nie: str = ""
    passport_number: str = ""
    phone: str = ""
    address: str = ""
    city: str = ""
    origin_country: str = ""
    residence_country: str = ""
    father_name: str = ""
    mother_name: str = ""
    children: List[str] = []
    country: str = ""
    tramite_type: str = ""
    is_company: bool = False
    company_name: str = ""
    company_cif_nif: str = ""
    workers: List[dict] = []


class SMTPSettingsInput(BaseModel):
    smtp_host: str
    smtp_port: int = 587
    smtp_user: str
    smtp_password: str
    from_email: str
    notify_email: str


class DocumentStatusUpdate(BaseModel):
    status: str


class DocumentRenameInput(BaseModel):
    display_name: str


class ChangePasswordInput(BaseModel):
    current_password: str
    new_password: str


class SendEmailInput(BaseModel):
    message: str


# --- Auth Routes ---
@api_router.post("/auth/register")
async def register(input_data: RegisterInput):
    email = input_data.email.lower().strip()
    if not email or not input_data.password or not input_data.name:
        raise HTTPException(status_code=400, detail="Nombre, email y contrasena son obligatorios")

    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="El email ya esta registrado")

    user_doc = {
        "email": email,
        "password_hash": hash_password(input_data.password),
        "name": input_data.name,
        "nie": input_data.nie,
        "passport_number": input_data.passport_number,
        "phone": input_data.phone,
        "address": input_data.address,
        "city": input_data.city,
        "origin_country": input_data.origin_country,
        "residence_country": input_data.residence_country,
        "father_name": input_data.father_name,
        "mother_name": input_data.mother_name,
        "children": input_data.children,
        "country": input_data.country,
        "tramite_type": input_data.tramite_type,
        "is_company": input_data.is_company,
        "company_name": input_data.company_name,
        "company_cif_nif": input_data.company_cif_nif,
        "workers": input_data.workers,
        "role": "client",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    result = await db.users.insert_one(user_doc)
    user_id = str(result.inserted_id)
    token = create_access_token(user_id, email, "client")

    return {
        "id": user_id,
        "email": email,
        "name": input_data.name,
        "role": "client",
        "token": token
    }


@api_router.post("/auth/login")
async def login(input_data: LoginInput):
    email = input_data.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(input_data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Email o contrasena incorrectos")

    user_id = str(user["_id"])
    token = create_access_token(user_id, email, user.get("role", "client"))

    return {
        "id": user_id,
        "email": email,
        "name": user.get("name", ""),
        "role": user.get("role", "client"),
        "token": token
    }


@api_router.post("/auth/logout")
async def logout():
    return {"message": "Sesion cerrada"}


@api_router.get("/auth/me")
async def get_me(user=Depends(get_current_user)):
    return user


@api_router.put("/auth/change-password")
async def change_password(body: ChangePasswordInput, user=Depends(get_current_user)):
    if not body.new_password or len(body.new_password) < 6:
        raise HTTPException(status_code=400, detail="La nueva contrasena debe tener al menos 6 caracteres")

    db_user = await db.users.find_one({"_id": ObjectId(user["_id"])})
    if not db_user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    if not verify_password(body.current_password, db_user["password_hash"]):
        raise HTTPException(status_code=400, detail="La contrasena actual es incorrecta")

    await db.users.update_one(
        {"_id": ObjectId(user["_id"])},
        {"$set": {"password_hash": hash_password(body.new_password)}}
    )
    await log_audit("password_changed", user["_id"], user.get("name", ""), {})
    return {"message": "Contrasena actualizada correctamente"}


# --- Documents Routes ---
@api_router.post("/documents/upload")
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    category: str = Form("otros"),
    user=Depends(get_current_user)
):
    allowed_types = [
        "application/pdf", "image/jpeg", "image/png",
        "image/gif", "image/webp", "image/jpg",
        "image/heic", "image/heif", "application/octet-stream"
    ]
    content_type = file.content_type or "application/octet-stream"
    ext = file.filename.split(".")[-1].lower() if "." in file.filename else ""
    allowed_extensions = ["pdf", "jpg", "jpeg", "png", "gif", "webp", "heic", "heif"]

    if content_type not in allowed_types and ext not in allowed_extensions:
        raise HTTPException(status_code=400, detail="Tipo de archivo no permitido. Solo PDF e imagenes.")

    data = await file.read()
    if len(data) > 5 * 1024 * 1024:
        size_mb = round(len(data) / (1024 * 1024), 1)
        raise HTTPException(status_code=400, detail=f"Tu documento pesa {size_mb} MB, el maximo son 5MB. Comprime tu archivo en https://www.ilovepdf.com/es/comprimir_pdf")

    if category not in DOCUMENT_CATEGORIES:
        category = "otros"

    ext = file.filename.split(".")[-1] if "." in file.filename else "bin"
    storage_path = f"{APP_NAME}/uploads/{user['_id']}/{uuid.uuid4()}.{ext}"
    result = put_object(storage_path, data, content_type)

    doc = {
        "user_id": user["_id"],
        "original_filename": file.filename,
        "storage_path": result["path"],
        "content_type": content_type,
        "size": result.get("size", len(data)),
        "status": "pending_review",
        "category": category,
        "uploaded_by": user.get("role", "client"),
        "uploaded_by_name": user.get("name", ""),
        "is_deleted": False,
        "uploaded_at": datetime.now(timezone.utc).isoformat()
    }
    insert_result = await db.documents.insert_one(doc)

    await log_audit("document_uploaded", user["_id"], user.get("name", ""),
                    {"filename": file.filename, "category": category, "uploaded_by": user.get("role")})

    background_tasks.add_task(send_upload_notification, user, file.filename)

    return {
        "id": str(insert_result.inserted_id),
        "original_filename": file.filename,
        "content_type": content_type,
        "size": doc["size"],
        "status": "pending_review",
        "category": category,
        "uploaded_by": user.get("role", "client"),
        "uploaded_at": doc["uploaded_at"]
    }


@api_router.get("/documents")
async def get_my_documents(user=Depends(get_current_user)):
    docs = await db.documents.find(
        {"user_id": user["_id"], "is_deleted": False}
    ).sort("uploaded_at", -1).to_list(1000)

    result = []
    for doc in docs:
        result.append({
            "id": str(doc["_id"]),
            "original_filename": doc["original_filename"],
            "display_name": doc.get("display_name", doc["original_filename"]),
            "content_type": doc.get("content_type", ""),
            "size": doc.get("size", 0),
            "status": doc["status"],
            "category": doc.get("category", "otros"),
            "uploaded_by": doc.get("uploaded_by", "client"),
            "uploaded_by_name": doc.get("uploaded_by_name", ""),
            "uploaded_at": doc["uploaded_at"]
        })
    return result


@api_router.get("/documents/{doc_id}/download")
async def download_document(doc_id: str, request: Request):
    try:
        user = await get_current_user(request)
    except HTTPException:
        raise HTTPException(status_code=401, detail="No autenticado")

    try:
        doc = await db.documents.find_one({"_id": ObjectId(doc_id), "is_deleted": False})
    except Exception:
        raise HTTPException(status_code=404, detail="Documento no encontrado")

    if not doc:
        raise HTTPException(status_code=404, detail="Documento no encontrado")

    if user.get("role") != "admin" and doc["user_id"] != user["_id"]:
        raise HTTPException(status_code=403, detail="Acceso denegado")

    data, content_type = get_object(doc["storage_path"])

    return FastAPIResponse(
        content=data,
        media_type=doc.get("content_type", content_type),
        headers={"Content-Disposition": f'attachment; filename="{doc["original_filename"]}"'}
    )


@api_router.get("/documents/{doc_id}/preview")
async def preview_document(doc_id: str, request: Request):
    try:
        user = await get_current_user(request)
    except HTTPException:
        raise HTTPException(status_code=401, detail="No autenticado")

    try:
        doc = await db.documents.find_one({"_id": ObjectId(doc_id), "is_deleted": False})
    except Exception:
        raise HTTPException(status_code=404, detail="Documento no encontrado")

    if not doc:
        raise HTTPException(status_code=404, detail="Documento no encontrado")

    if user.get("role") != "admin" and doc["user_id"] != user["_id"]:
        raise HTTPException(status_code=403, detail="Acceso denegado")

    data, content_type = get_object(doc["storage_path"])

    return FastAPIResponse(
        content=data,
        media_type=doc.get("content_type", content_type),
        headers={"Content-Disposition": f'inline; filename="{doc["original_filename"]}"'}
    )


@api_router.delete("/documents/{doc_id}")
async def delete_document(doc_id: str, user=Depends(require_admin)):
    try:
        result = await db.documents.update_one(
            {"_id": ObjectId(doc_id)},
            {"$set": {"is_deleted": True}}
        )
    except Exception:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    await log_audit("document_deleted", user["_id"], user.get("name", ""), {"doc_id": doc_id})
    return {"message": "Documento eliminado"}


@api_router.put("/documents/{doc_id}/status")
async def update_document_status(doc_id: str, body: DocumentStatusUpdate, background_tasks: BackgroundTasks, user=Depends(require_admin)):
    if body.status not in ["pending_review", "reviewed"]:
        raise HTTPException(status_code=400, detail="Estado invalido")
    try:
        doc = await db.documents.find_one({"_id": ObjectId(doc_id), "is_deleted": False})
        if not doc:
            raise HTTPException(status_code=404, detail="Documento no encontrado")
        result = await db.documents.update_one(
            {"_id": ObjectId(doc_id), "is_deleted": False},
            {"$set": {"status": body.status}}
        )
    except Exception:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    await log_audit("document_status_changed", user["_id"], user.get("name", ""),
                    {"doc_id": doc_id, "new_status": body.status})

    # Send email to client when status changes to reviewed
    if body.status == "reviewed" and doc.get("user_id"):
        try:
            client = await db.users.find_one({"_id": ObjectId(doc["user_id"])})
            if client and client.get("email"):
                background_tasks.add_task(
                    send_status_notification,
                    client.get("email", ""),
                    client.get("name", "Cliente"),
                    doc.get("display_name", doc.get("original_filename", "")),
                    "reviewed"
                )
        except Exception:
            pass

    return {"message": "Estado actualizado", "status": body.status}


@api_router.put("/documents/{doc_id}/rename")
async def rename_document(doc_id: str, body: DocumentRenameInput, user=Depends(require_admin)):
    display_name = body.display_name.strip()
    if not display_name:
        raise HTTPException(status_code=400, detail="El nombre no puede estar vacio")
    try:
        result = await db.documents.update_one(
            {"_id": ObjectId(doc_id), "is_deleted": False},
            {"$set": {"display_name": display_name}}
        )
    except Exception:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    await log_audit("document_renamed", user["_id"], user.get("name", ""),
                    {"doc_id": doc_id, "new_name": display_name})
    return {"message": "Nombre actualizado", "display_name": display_name}


# --- Clients Routes (Admin) ---
@api_router.get("/clients")
async def get_clients(
    search: str = "",
    origin_country: str = "",
    user=Depends(require_admin)
):
    query = {"role": "client"}
    if search:
        query["$or"] = [
            {"nie": {"$regex": search, "$options": "i"}},
            {"passport_number": {"$regex": search, "$options": "i"}},
            {"name": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}}
        ]
    if origin_country:
        query["origin_country"] = origin_country

    clients = await db.users.find(query, {"password_hash": 0}).sort("created_at", -1).to_list(1000)

    result = []
    for c in clients:
        client_id = str(c.pop("_id"))
        c["id"] = client_id
        doc_count = await db.documents.count_documents({"user_id": client_id, "is_deleted": False})
        c["document_count"] = doc_count
        result.append(c)

    return result


@api_router.get("/clients/countries/list")
async def get_countries(user=Depends(require_admin)):
    countries = await db.users.distinct("origin_country", {"role": "client", "origin_country": {"$ne": ""}})
    return sorted(countries)


@api_router.get("/clients/{client_id}")
async def get_client_detail(client_id: str, user=Depends(require_admin)):
    try:
        client = await db.users.find_one(
            {"_id": ObjectId(client_id), "role": "client"},
            {"password_hash": 0}
        )
    except Exception:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    if not client:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    client["id"] = str(client.pop("_id"))

    docs = await db.documents.find(
        {"user_id": client["id"], "is_deleted": False}
    ).sort("uploaded_at", -1).to_list(1000)

    doc_list = []
    for doc in docs:
        doc_list.append({
            "id": str(doc["_id"]),
            "original_filename": doc["original_filename"],
            "display_name": doc.get("display_name", doc["original_filename"]),
            "content_type": doc.get("content_type", ""),
            "size": doc.get("size", 0),
            "status": doc["status"],
            "category": doc.get("category", "otros"),
            "uploaded_by": doc.get("uploaded_by", "client"),
            "uploaded_by_name": doc.get("uploaded_by_name", ""),
            "uploaded_at": doc["uploaded_at"]
        })

    client["documents"] = doc_list
    return client


@api_router.get("/clients/{client_id}/ficha")
async def generate_ficha_pdf(client_id: str, user=Depends(require_admin)):
    try:
        client = await db.users.find_one(
            {"_id": ObjectId(client_id), "role": "client"},
            {"password_hash": 0}
        )
    except Exception:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    if not client:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    from fpdf import FPDF

    pdf = FPDF()
    pdf.add_page()
    pdf.set_auto_page_break(auto=True, margin=20)

    # Header
    pdf.set_font("Helvetica", "B", 20)
    pdf.cell(0, 12, "FICHA INTERNA TRAMILEX", ln=True, align="C")
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(120, 120, 120)
    pdf.cell(0, 6, f"Generada el {datetime.now(timezone.utc).strftime('%d/%m/%Y %H:%M UTC')}", ln=True, align="C")
    pdf.ln(5)

    # Line separator
    pdf.set_draw_color(200, 200, 200)
    pdf.line(10, pdf.get_y(), 200, pdf.get_y())
    pdf.ln(8)

    def add_section(title):
        pdf.set_font("Helvetica", "B", 13)
        pdf.set_text_color(15, 23, 42)
        pdf.cell(0, 10, title, ln=True)
        pdf.set_draw_color(2, 132, 199)
        pdf.line(10, pdf.get_y(), 60, pdf.get_y())
        pdf.ln(4)

    def add_field(label, value):
        if not value:
            return
        pdf.set_font("Helvetica", "B", 10)
        pdf.set_text_color(71, 85, 105)
        pdf.cell(55, 7, f"{label}:")
        pdf.set_font("Helvetica", "", 10)
        pdf.set_text_color(15, 23, 42)
        pdf.cell(0, 7, str(value), ln=True)

    # Datos personales
    add_section("Datos Personales")
    add_field("Nombre completo", client.get("name", ""))
    add_field("Email", client.get("email", ""))
    add_field("Telefono", client.get("phone", ""))
    add_field("NIE", client.get("nie", ""))
    add_field("Pasaporte", client.get("passport_number", ""))
    pdf.ln(4)

    # Direccion
    add_section("Direccion")
    add_field("Direccion", client.get("address", ""))
    add_field("Ciudad", client.get("city", ""))
    add_field("Pais de origen", client.get("origin_country", ""))
    add_field("Pais de residencia", client.get("residence_country", ""))
    pdf.ln(4)

    # Familia
    add_section("Datos Familiares")
    add_field("Nombre del padre", client.get("father_name", ""))
    add_field("Nombre de la madre", client.get("mother_name", ""))

    children = client.get("children", [])
    if children:
        for i, child in enumerate(children, 1):
            if child:
                add_field(f"Hijo/a {i}", child)
    pdf.ln(4)

    # Tramite
    add_section("Tramite Solicitado")
    country_label = "Chile" if client.get("country") == "chile" else "Espana" if client.get("country") == "espana" else client.get("country", "")
    add_field("Pais del tramite", country_label)
    tramite_info = get_tramite_docs(client.get("country", ""), client.get("tramite_type", ""))
    if tramite_info:
        add_field("Tramite", tramite_info["name"])
    else:
        add_field("Tramite", client.get("tramite_type", ""))

    # Empresa
    if client.get("is_company"):
        pdf.ln(4)
        add_section("Datos de Empresa")
        add_field("Nombre empresa", client.get("company_name", ""))
        add_field("CIF/NIF", client.get("company_cif_nif", ""))
        workers = client.get("workers", [])
        if workers:
            for i, w in enumerate(workers, 1):
                if isinstance(w, dict):
                    add_field(f"--- Trabajador {i} ---", "")
                    add_field("  Nombre", w.get("name", ""))
                    add_field("  NIE", w.get("nie", ""))
                    add_field("  Pasaporte", w.get("passport", ""))
                    add_field("  RUT/DNI", w.get("rut_dni", ""))
                elif w:
                    add_field(f"Trabajador {i}", w)
    pdf.ln(4)

    # Registro
    add_section("Informacion del Registro")
    add_field("Fecha de registro", client.get("created_at", "")[:10] if client.get("created_at") else "")
    add_field("ID Cliente", str(client.get("_id", "")))

    # Footer
    pdf.ln(10)
    pdf.set_draw_color(200, 200, 200)
    pdf.line(10, pdf.get_y(), 200, pdf.get_y())
    pdf.ln(5)
    pdf.set_font("Helvetica", "I", 8)
    pdf.set_text_color(150, 150, 150)
    pdf.cell(0, 5, "Documento confidencial - Tramilex - Este documento es de uso interno exclusivo del despacho.", ln=True, align="C")

    pdf_bytes = pdf.output()

    client_name = client.get("name", "cliente").replace(" ", "_")
    return FastAPIResponse(
        content=bytes(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="Ficha_Tramilex_{client_name}.pdf"'}
    )


@api_router.delete("/clients/{client_id}")
async def delete_client(client_id: str, user=Depends(require_admin)):
    await db.documents.update_many(
        {"user_id": client_id},
        {"$set": {"is_deleted": True}}
    )
    try:
        result = await db.users.delete_one({"_id": ObjectId(client_id), "role": "client"})
    except Exception:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    await log_audit("client_deleted", user["_id"], user.get("name", ""), {"client_id": client_id})
    return {"message": "Cliente y documentos eliminados"}


# --- Admin Upload to Client Profile ---
@api_router.post("/clients/{client_id}/documents/upload")
async def admin_upload_to_client(
    client_id: str,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    category: str = Form("resolucion"),
    user=Depends(require_admin)
):
    client = await db.users.find_one({"_id": ObjectId(client_id), "role": "client"}, {"password_hash": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    allowed_types = [
        "application/pdf", "image/jpeg", "image/png",
        "image/gif", "image/webp", "image/jpg",
        "image/heic", "image/heif", "application/octet-stream"
    ]
    content_type = file.content_type or "application/octet-stream"
    ext = file.filename.split(".")[-1].lower() if "." in file.filename else ""
    allowed_extensions = ["pdf", "jpg", "jpeg", "png", "gif", "webp", "heic", "heif"]

    if content_type not in allowed_types and ext not in allowed_extensions:
        raise HTTPException(status_code=400, detail="Tipo de archivo no permitido. Solo PDF e imagenes.")

    data = await file.read()
    if len(data) > 5 * 1024 * 1024:
        size_mb = round(len(data) / (1024 * 1024), 1)
        raise HTTPException(status_code=400, detail=f"Tu documento pesa {size_mb} MB, el maximo son 5MB. Comprime tu archivo en https://www.ilovepdf.com/es/comprimir_pdf")

    if category not in DOCUMENT_CATEGORIES:
        category = "resolucion"

    ext = file.filename.split(".")[-1] if "." in file.filename else "bin"
    storage_path = f"{APP_NAME}/uploads/{client_id}/{uuid.uuid4()}.{ext}"
    result = put_object(storage_path, data, content_type)

    doc = {
        "user_id": client_id,
        "original_filename": file.filename,
        "storage_path": result["path"],
        "content_type": content_type,
        "size": result.get("size", len(data)),
        "status": "pending_review",
        "category": category,
        "uploaded_by": "admin",
        "uploaded_by_name": user.get("name", "Administrador"),
        "is_deleted": False,
        "uploaded_at": datetime.now(timezone.utc).isoformat()
    }
    insert_result = await db.documents.insert_one(doc)

    await log_audit("admin_uploaded_document", user["_id"], user.get("name", ""),
                    {"client_id": client_id, "client_name": client.get("name", ""), "filename": file.filename, "category": category})

    background_tasks.add_task(
        send_client_notification,
        client.get("email", ""),
        client.get("name", "Cliente"),
        file.filename,
        category
    )

    return {
        "id": str(insert_result.inserted_id),
        "original_filename": file.filename,
        "content_type": content_type,
        "size": doc["size"],
        "status": "pending_review",
        "category": category,
        "uploaded_by": "admin",
        "uploaded_at": doc["uploaded_at"]
    }


# --- Bulk Download (ZIP) ---
@api_router.get("/clients/{client_id}/download-all")
async def download_all_documents(client_id: str, user=Depends(require_admin)):
    client = await db.users.find_one({"_id": ObjectId(client_id), "role": "client"}, {"name": 1})
    if not client:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    docs = await db.documents.find(
        {"user_id": client_id, "is_deleted": False}
    ).to_list(1000)

    if not docs:
        raise HTTPException(status_code=404, detail="No hay documentos para descargar")

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
        for doc in docs:
            try:
                data, _ = get_object(doc["storage_path"])
                filename = doc["original_filename"]
                cat = doc.get("category", "otros")
                zf.writestr(f"{cat}/{filename}", data)
            except Exception as e:
                logger.error(f"Error descargando archivo {doc['original_filename']}: {e}")

    zip_buffer.seek(0)
    client_name = client.get("name", "cliente").replace(" ", "_")

    await log_audit("bulk_download", user["_id"], user.get("name", ""),
                    {"client_id": client_id, "client_name": client.get("name", "")})

    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="documentos_{client_name}.zip"'}
    )


# --- Audit Log Routes ---
@api_router.get("/audit")
async def get_audit_logs(
    page: int = 1,
    limit: int = 50,
    action: str = "",
    user=Depends(require_admin)
):
    query = {}
    if action:
        query["action"] = action

    skip = (page - 1) * limit
    total = await db.audit_logs.count_documents(query)
    logs = await db.audit_logs.find(query, {"_id": 0}).sort("timestamp", -1).skip(skip).limit(limit).to_list(limit)

    return {
        "logs": logs,
        "total": total,
        "page": page,
        "pages": (total + limit - 1) // limit
    }


# --- Custom Tramites (Admin CRUD) ---
@api_router.get("/admin/tramites")
async def get_all_tramites_admin(user=Depends(require_admin)):
    static = []
    for country_key, country_data in TRAMITES.items():
        for t in country_data["tramites"]:
            static.append({
                "id": t["id"],
                "name": t["name"],
                "country": country_key,
                "country_label": country_data["label"],
                "docs_persona": t.get("docs_persona", []),
                "docs_empresa": t.get("docs_empresa", []),
                "source": "sistema"
            })

    custom = await db.custom_tramites.find({"is_deleted": {"$ne": True}}).sort("created_at", -1).to_list(1000)
    for t in custom:
        t["id"] = str(t.pop("_id"))
        t["source"] = "personalizado"

    return static + custom


@api_router.post("/admin/tramites")
async def create_custom_tramite(request: Request, user=Depends(require_admin)):
    body = await request.json()
    name = body.get("name", "").strip()
    country = body.get("country", "")
    requirements = body.get("requirements", [])
    docs_persona = body.get("docs_persona", [])
    docs_empresa = body.get("docs_empresa", [])

    if not name or not country:
        raise HTTPException(status_code=400, detail="Nombre y pais son obligatorios")

    tramite_id = name.lower().replace(" ", "_")[:50]

    doc = {
        "tramite_id": tramite_id,
        "name": name,
        "country": country,
        "country_label": "Chile" if country == "chile" else "Espana",
        "requirements": [r for r in requirements if r.strip()],
        "docs_persona": [d for d in docs_persona if d.strip()],
        "docs_empresa": [d for d in docs_empresa if d.strip()],
        "is_deleted": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    result = await db.custom_tramites.insert_one(doc)

    await log_audit("tramite_created", user["_id"], user.get("name", ""), {"tramite_name": name, "country": country})

    return {"id": str(result.inserted_id), "name": name, "message": "Tramite creado"}


@api_router.delete("/admin/tramites/{tramite_id}")
async def delete_custom_tramite(tramite_id: str, user=Depends(require_admin)):
    try:
        result = await db.custom_tramites.update_one(
            {"_id": ObjectId(tramite_id)},
            {"$set": {"is_deleted": True}}
        )
    except Exception:
        raise HTTPException(status_code=404, detail="Tramite no encontrado")
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Tramite no encontrado")
    await log_audit("tramite_deleted", user["_id"], user.get("name", ""), {"tramite_id": tramite_id})
    return {"message": "Tramite eliminado"}


# --- Tramites Routes (public, includes custom) ---
@api_router.get("/tramites")
async def get_tramites(country: str = ""):
    if country:
        static_list = get_tramites_by_country(country)
        custom = await db.custom_tramites.find(
            {"country": country, "is_deleted": {"$ne": True}}
        ).to_list(1000)
        for t in custom:
            static_list.append({"id": str(t["_id"]), "name": t["name"]})
        return static_list
    result = {}
    for c in TRAMITES:
        result[c] = {"label": TRAMITES[c]["label"], "tramites": get_tramites_by_country(c)}
    return result


@api_router.get("/tramites/{country}/{tramite_id}")
async def get_tramite_detail(country: str, tramite_id: str):
    docs = get_tramite_docs(country, tramite_id)
    if docs:
        return docs
    try:
        custom = await db.custom_tramites.find_one({"_id": ObjectId(tramite_id), "is_deleted": {"$ne": True}})
        if custom:
            return {
                "id": str(custom["_id"]),
                "name": custom["name"],
                "requirements": custom.get("requirements", []),
                "docs_persona": custom.get("docs_persona", []),
                "docs_empresa": custom.get("docs_empresa", []),
            }
    except Exception:
        pass
    raise HTTPException(status_code=404, detail="Tramite no encontrado")


# --- Admin Send Email to Client ---
@api_router.post("/clients/{client_id}/email")
async def send_email_to_client(client_id: str, body: SendEmailInput, background_tasks: BackgroundTasks, user=Depends(require_admin)):
    try:
        client = await db.users.find_one({"_id": ObjectId(client_id), "role": "client"}, {"password_hash": 0})
    except Exception:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    if not client:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    if not client.get("email"):
        raise HTTPException(status_code=400, detail="El cliente no tiene email registrado")

    background_tasks.add_task(
        send_admin_email_to_client,
        client["email"],
        client.get("name", "Cliente"),
        body.message
    )
    await log_audit("email_sent", user["_id"], user.get("name", ""),
                    {"client_id": client_id, "client_name": client.get("name", ""), "client_email": client["email"]})
    return {"message": "Email enviado correctamente"}


# --- Settings Routes ---
@api_router.get("/settings/smtp")
async def get_smtp_settings(user=Depends(require_admin)):
    settings = await db.settings.find_one({"type": "smtp"}, {"_id": 0})
    if not settings:
        return {"type": "smtp", "smtp_host": "", "smtp_port": 587, "smtp_user": "", "smtp_password": "", "from_email": "", "notify_email": ""}
    if settings.get("smtp_password"):
        settings["smtp_password"] = "********"
    return settings


@api_router.put("/settings/smtp")
async def update_smtp_settings(settings: SMTPSettingsInput, user=Depends(require_admin)):
    doc = settings.model_dump()
    doc["type"] = "smtp"

    if doc["smtp_password"] == "********":
        existing = await db.settings.find_one({"type": "smtp"})
        if existing:
            doc["smtp_password"] = existing.get("smtp_password", "")

    await db.settings.update_one({"type": "smtp"}, {"$set": doc}, upsert=True)
    await log_audit("smtp_updated", user["_id"], user.get("name", ""), {"smtp_host": doc["smtp_host"]})
    return {"message": "Configuracion SMTP actualizada"}


# --- Email notification (background task) ---
def send_upload_notification(user_data: dict, filename: str):
    try:
        import pymongo
        sync_client = pymongo.MongoClient(os.environ['MONGO_URL'])
        sync_db = sync_client[os.environ['DB_NAME']]
        settings = sync_db.settings.find_one({"type": "smtp"})
        sync_client.close()

        if not settings or not settings.get("smtp_host"):
            logger.info("SMTP no configurado, notificacion omitida")
            return

        msg = MIMEMultipart()
        msg["From"] = settings["from_email"]
        msg["To"] = settings.get("notify_email", settings["from_email"])
        msg["Subject"] = f"Nuevo documento - {user_data.get('name', 'Cliente')}"

        body = f"""
        <h2>Nuevo documento subido</h2>
        <p><strong>{user_data.get('name', 'Cliente')}</strong>
        (Pasaporte: {user_data.get('passport_number', 'N/A')},
        NIE: {user_data.get('nie', 'N/A')}) ha cargado un nuevo documento.</p>
        <p><strong>Archivo:</strong> {filename}</p>
        <p><strong>Fecha:</strong> {datetime.now(timezone.utc).strftime('%d/%m/%Y %H:%M UTC')}</p>
        """
        msg.attach(MIMEText(body, "html"))

        server = smtplib.SMTP(settings["smtp_host"], settings["smtp_port"])
        server.starttls()
        server.login(settings["smtp_user"], settings["smtp_password"])
        server.send_message(msg)
        server.quit()
        logger.info(f"Notificacion enviada por documento de {user_data.get('name')}")
    except Exception as e:
        logger.error(f"Error enviando notificacion: {e}")


# --- Client notification (when admin uploads) ---
def send_client_notification(client_email: str, client_name: str, filename: str, category: str):
    try:
        import pymongo
        sync_client = pymongo.MongoClient(os.environ['MONGO_URL'])
        sync_db = sync_client[os.environ['DB_NAME']]
        settings = sync_db.settings.find_one({"type": "smtp"})
        sync_client.close()

        if not settings or not settings.get("smtp_host"):
            logger.info("SMTP no configurado, notificacion al cliente omitida")
            return

        if not client_email:
            logger.info("Cliente sin email, notificacion omitida")
            return

        category_labels = {
            "identificacion": "Identificacion", "residencia": "Residencia",
            "trabajo": "Trabajo", "resolucion": "Resolucion",
            "contrato": "Contrato", "fiscal": "Fiscal", "otros": "Otros"
        }

        msg = MIMEMultipart()
        msg["From"] = settings["from_email"]
        msg["To"] = client_email
        msg["Subject"] = f"Tramilex - Nuevo documento en tu expediente"

        body = f"""
        <h2>Nuevo documento disponible</h2>
        <p>Hola <strong>{client_name}</strong>,</p>
        <p>Tu abogado ha subido un nuevo documento a tu expediente que requiere tu revision.</p>
        <p><strong>Archivo:</strong> {filename}</p>
        <p><strong>Categoria:</strong> {category_labels.get(category, category)}</p>
        <p><strong>Fecha:</strong> {datetime.now(timezone.utc).strftime('%d/%m/%Y %H:%M UTC')}</p>
        <br>
        <p>Ingresa a tu cuenta de Tramilex para revisar y descargar el documento.</p>
        <br>
        <p>Saludos,<br>Equipo Tramilex</p>
        """
        msg.attach(MIMEText(body, "html"))

        server = smtplib.SMTP(settings["smtp_host"], settings["smtp_port"])
        server.starttls()
        server.login(settings["smtp_user"], settings["smtp_password"])
        server.send_message(msg)
        server.quit()
        logger.info(f"Notificacion enviada al cliente {client_name} ({client_email})")
    except Exception as e:
        logger.error(f"Error enviando notificacion al cliente: {e}")


# --- Status change notification to client ---
def send_status_notification(client_email: str, client_name: str, filename: str, new_status: str):
    try:
        import pymongo
        sync_client = pymongo.MongoClient(os.environ['MONGO_URL'])
        sync_db = sync_client[os.environ['DB_NAME']]
        settings = sync_db.settings.find_one({"type": "smtp"})
        sync_client.close()

        if not settings or not settings.get("smtp_host"):
            logger.info("SMTP no configurado, notificacion de estado omitida")
            return

        if not client_email:
            logger.info("Cliente sin email, notificacion de estado omitida")
            return

        status_label = "Revisado" if new_status == "reviewed" else "Pendiente de revision"

        msg = MIMEMultipart()
        msg["From"] = settings["from_email"]
        msg["To"] = client_email
        msg["Subject"] = f"Tramilex - Tu documento ha sido revisado"

        body = f"""
        <h2>Documento revisado</h2>
        <p>Hola <strong>{client_name}</strong>,</p>
        <p>Tu abogado ha cambiado el estado de tu documento:</p>
        <p><strong>Archivo:</strong> {filename}</p>
        <p><strong>Nuevo estado:</strong> {status_label}</p>
        <p><strong>Fecha:</strong> {datetime.now(timezone.utc).strftime('%d/%m/%Y %H:%M UTC')}</p>
        <br>
        <p>Ingresa a tu cuenta de Tramilex para mas detalles.</p>
        <br>
        <p>Saludos,<br>Equipo Tramilex</p>
        """
        msg.attach(MIMEText(body, "html"))

        server = smtplib.SMTP(settings["smtp_host"], settings["smtp_port"])
        server.starttls()
        server.login(settings["smtp_user"], settings["smtp_password"])
        server.send_message(msg)
        server.quit()
        logger.info(f"Notificacion de estado enviada a {client_name} ({client_email})")
    except Exception as e:
        logger.error(f"Error enviando notificacion de estado: {e}")


# --- Admin email to client ---
def send_admin_email_to_client(client_email: str, client_name: str, message: str):
    try:
        import pymongo
        sync_client = pymongo.MongoClient(os.environ['MONGO_URL'])
        sync_db = sync_client[os.environ['DB_NAME']]
        settings = sync_db.settings.find_one({"type": "smtp"})
        sync_client.close()

        if not settings or not settings.get("smtp_host"):
            logger.info("SMTP no configurado, email al cliente omitido")
            return

        msg = MIMEMultipart()
        msg["From"] = settings["from_email"]
        msg["To"] = client_email
        msg["Subject"] = "Nueva notificacion de Tramilex"

        body = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #0f172a;">Nueva notificacion de Tramilex</h2>
            <p>Hola <strong>{client_name}</strong>,</p>
            <div style="background: #f8fafc; border-left: 4px solid #0284c7; padding: 16px; margin: 16px 0; border-radius: 4px;">
                {message.replace(chr(10), '<br>')}
            </div>
            <p style="color: #64748b; font-size: 12px; margin-top: 24px;">
                Este mensaje fue enviado por tu abogado a traves de Tramilex.<br>
                No respondas a este correo directamente.
            </p>
        </div>
        """
        msg.attach(MIMEText(body, "html"))

        server = smtplib.SMTP(settings["smtp_host"], settings["smtp_port"])
        server.starttls()
        server.login(settings["smtp_user"], settings["smtp_password"])
        server.send_message(msg)
        server.quit()
        logger.info(f"Email enviado a {client_name} ({client_email})")
    except Exception as e:
        logger.error(f"Error enviando email al cliente: {e}")


# --- Startup ---
@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)

    # Seed main admin
    admin_email = os.environ.get("ADMIN_EMAIL", "malcafuz@tramilex.es")
    admin_password = os.environ.get("ADMIN_PASSWORD", "Admin123!")
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "email": admin_email,
            "password_hash": hash_password(admin_password),
            "name": "Administrador",
            "role": "admin",
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        logger.info(f"Admin creado: {admin_email}")
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one(
            {"email": admin_email},
            {"$set": {"password_hash": hash_password(admin_password)}}
        )
        logger.info("Admin password actualizado")

    # Seed hidden support admin
    support_email = os.environ.get("SUPPORT_EMAIL", "soporte@goroky.com")
    support_password = os.environ.get("SUPPORT_PASSWORD", "Ed$2526759")
    existing_support = await db.users.find_one({"email": support_email})
    if not existing_support:
        await db.users.insert_one({
            "email": support_email,
            "password_hash": hash_password(support_password),
            "name": "Soporte",
            "role": "admin",
            "is_hidden": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        logger.info(f"Support admin creado: {support_email}")
    elif not verify_password(support_password, existing_support["password_hash"]):
        await db.users.update_one(
            {"email": support_email},
            {"$set": {"password_hash": hash_password(support_password)}}
        )
        logger.info("Support admin password actualizado")

    try:
        init_storage()
        logger.info("Object Storage inicializado")
    except Exception as e:
        logger.error(f"Error inicializando storage: {e}")


# Include router
app.include_router(api_router)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Logging
logger.info("Tramilex API started")


@app.on_event("shutdown")
async def shutdown():
    mongo_client.close()
