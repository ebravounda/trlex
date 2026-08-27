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
import random
import string
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
        role = payload.get("role", "")
        if role == "company":
            company = await db.companies.find_one({"_id": ObjectId(payload["sub"])})
            if not company:
                raise HTTPException(status_code=401, detail="Empresa no encontrada")
            company["_id"] = str(company["_id"])
            company.pop("password_hash", None)
            company["role"] = "company"
            return company
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


async def require_company(request: Request):
    user = await get_current_user(request)
    if user.get("role") != "company":
        raise HTTPException(status_code=403, detail="Acceso denegado")
    return user


async def require_staff_or_admin(request: Request):
    user = await get_current_user(request)
    if user.get("role") not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Acceso denegado")
    return user


# --- Document Categories ---
DOCUMENT_CATEGORIES = [
    "identificacion", "residencia", "trabajo",
    "resolucion", "contrato", "fiscal", "firmado", "otros"
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


class CompanyCreateInput(BaseModel):
    name: str
    cif_nif: str
    email: str
    phone: str = ""
    address: str = ""
    city: str = ""
    contact_person: str = ""


class CompanyUpdateInput(BaseModel):
    name: str = ""
    email: str = ""
    phone: str = ""
    address: str = ""
    city: str = ""
    contact_person: str = ""


class CompanyWorkerInput(BaseModel):
    name: str
    last_name: str = ""
    identification: str = ""
    phone: str = ""
    phone2: str = ""
    email: str = ""
    address: str = ""
    nationality: str = ""
    origin_country: str = ""
    residence_country: str = ""
    father_name: str = ""
    mother_name: str = ""
    children: List[str] = []


class CompanyTramiteInput(BaseModel):
    country: str
    tramite_id: str
    status: str = "pendiente"
    notes: str = ""


class CompanyTramiteUpdateInput(BaseModel):
    status: str
    notes: str = ""


class CompanySendCredentialsInput(BaseModel):
    email: str = ""


def generate_company_password(length=10):
    chars = string.digits + string.ascii_letters
    return ''.join(random.choices(chars, k=length))


class StaffCreateInput(BaseModel):
    name: str
    email: str
    password: str
    phone: str = ""
    position: str = ""


class StaffUpdateInput(BaseModel):
    name: str = ""
    phone: str = ""
    position: str = ""


class TaskCreateInput(BaseModel):
    title: str
    description: str = ""
    priority: str = "media"
    assigned_to: str
    due_date: str = ""
    related_client_id: str = ""
    related_company_id: str = ""
    related_tramite: str = ""


class TaskUpdateInput(BaseModel):
    title: str = ""
    description: str = ""
    priority: str = ""
    status: str = ""
    assigned_to: str = ""
    due_date: str = ""


class TaskCommentInput(BaseModel):
    text: str


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


@api_router.post("/clients/{client_id}/impersonate")
async def impersonate_client(client_id: str, user=Depends(require_admin)):
    try:
        client = await db.users.find_one({"_id": ObjectId(client_id), "role": "client"})
    except Exception:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    if not client:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    token = create_access_token(str(client["_id"]), client["email"], "client")
    await log_audit("impersonate_client", user["_id"], user.get("name", ""),
                    {"client_id": client_id, "client_name": client.get("name", "")})
    return {"token": token, "name": client.get("name", ""), "email": client.get("email", "")}


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
    overrides = {}
    override_list = await db.tramite_overrides.find({}).to_list(1000)
    for o in override_list:
        overrides[f"{o['country']}_{o['tramite_id']}"] = o

    static = []
    for country_key, country_data in TRAMITES.items():
        for t in country_data["tramites"]:
            key = f"{country_key}_{t['id']}"
            ov = overrides.get(key)
            static.append({
                "id": t["id"],
                "name": t["name"],
                "country": country_key,
                "country_label": country_data["label"],
                "requirements": ov.get("requirements", []) if ov else [],
                "docs_persona": ov.get("docs_persona", t.get("docs_persona", [])) if ov else t.get("docs_persona", []),
                "docs_empresa": ov.get("docs_empresa", t.get("docs_empresa", [])) if ov else t.get("docs_empresa", []),
                "source": "sistema",
                "has_override": bool(ov)
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


@api_router.put("/admin/tramites/{tramite_id}/edit")
async def edit_tramite(tramite_id: str, request: Request, user=Depends(require_admin)):
    body = await request.json()
    country = body.get("country", "")
    source = body.get("source", "")
    requirements = body.get("requirements", [])
    docs_persona = body.get("docs_persona", [])
    docs_empresa = body.get("docs_empresa", [])

    clean_reqs = [r for r in requirements if r.strip()]
    clean_docs_p = [d for d in docs_persona if d.strip()]
    clean_docs_e = [d for d in docs_empresa if d.strip()]

    if source == "personalizado":
        try:
            await db.custom_tramites.update_one(
                {"_id": ObjectId(tramite_id)},
                {"$set": {"requirements": clean_reqs, "docs_persona": clean_docs_p, "docs_empresa": clean_docs_e}}
            )
        except Exception:
            raise HTTPException(status_code=404, detail="Tramite no encontrado")
    else:
        await db.tramite_overrides.update_one(
            {"tramite_id": tramite_id, "country": country},
            {"$set": {
                "tramite_id": tramite_id,
                "country": country,
                "requirements": clean_reqs,
                "docs_persona": clean_docs_p,
                "docs_empresa": clean_docs_e,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }},
            upsert=True
        )

    await log_audit("tramite_edited", user["_id"], user.get("name", ""), {"tramite_id": tramite_id})
    return {"message": "Tramite actualizado"}


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
    # Check for admin override first
    override = await db.tramite_overrides.find_one(
        {"tramite_id": tramite_id, "country": country}, {"_id": 0}
    )
    if override:
        base = get_tramite_docs(country, tramite_id)
        name = base["name"] if base else override.get("name", tramite_id)
        return {
            "id": tramite_id,
            "name": name,
            "requirements": override.get("requirements", []),
            "docs_persona": override.get("docs_persona", base.get("docs_persona", []) if base else []),
            "docs_empresa": override.get("docs_empresa", base.get("docs_empresa", []) if base else []),
        }

    docs = get_tramite_docs(country, tramite_id)
    if docs:
        docs["requirements"] = docs.get("requirements", [])
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


# --- Company credentials email (background task) ---
def send_company_credentials_email(to_email: str, company_name: str, cif_nif: str, password: str):
    try:
        import pymongo
        sync_client = pymongo.MongoClient(os.environ['MONGO_URL'])
        sync_db = sync_client[os.environ['DB_NAME']]
        settings = sync_db.settings.find_one({"type": "smtp"})
        sync_client.close()

        if not settings or not settings.get("smtp_host"):
            logger.info("SMTP no configurado, credenciales no enviadas")
            return

        msg = MIMEMultipart()
        msg["From"] = settings["from_email"]
        msg["To"] = to_email
        msg["Subject"] = f"Tramilex - Credenciales de acceso para {company_name}"

        body = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #0f172a;">Bienvenido a Tramilex</h2>
            <p>Hola,</p>
            <p>Se ha creado una cuenta para la empresa <strong>{company_name}</strong> en la plataforma Tramilex.</p>
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 20px; margin: 16px 0; border-radius: 8px;">
                <p style="margin: 0 0 8px 0;"><strong>Usuario (CIF/NIF):</strong> {cif_nif}</p>
                <p style="margin: 0;"><strong>Contrasena:</strong> {password}</p>
            </div>
            <p>Accede a la plataforma en: <a href="https://tramilex.goroky.es/login">tramilex.goroky.es/login</a></p>
            <p style="color: #64748b; font-size: 12px; margin-top: 24px;">
                Este mensaje fue enviado automaticamente por Tramilex.<br>
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
        logger.info(f"Credenciales enviadas a {to_email} para {company_name}")
        return True
    except Exception as e:
        logger.error(f"Error enviando credenciales: {e}")
        return False


# ============================
# --- Company Routes (Admin) ---
# ============================

@api_router.post("/companies")
async def create_company(body: CompanyCreateInput, user=Depends(require_admin)):
    cif_nif = body.cif_nif.strip().upper()
    if not cif_nif or not body.name.strip():
        raise HTTPException(status_code=400, detail="Nombre y CIF/NIF son obligatorios")

    existing = await db.companies.find_one({"cif_nif": cif_nif})
    if existing:
        raise HTTPException(status_code=400, detail="Ya existe una empresa con ese CIF/NIF")

    password = generate_company_password()
    company_doc = {
        "name": body.name.strip(),
        "cif_nif": cif_nif,
        "email": body.email.strip().lower(),
        "phone": body.phone.strip(),
        "address": body.address.strip(),
        "city": body.city.strip(),
        "contact_person": body.contact_person.strip(),
        "password_hash": hash_password(password),
        "password_plain": password,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    result = await db.companies.insert_one(company_doc)
    company_id = str(result.inserted_id)

    await log_audit("company_created", user["_id"], user.get("name", ""),
                    {"company_id": company_id, "company_name": body.name, "cif_nif": cif_nif})

    return {
        "id": company_id,
        "name": body.name.strip(),
        "cif_nif": cif_nif,
        "email": body.email.strip().lower(),
        "password": password,
        "message": "Empresa creada exitosamente"
    }


@api_router.get("/companies")
async def list_companies(user=Depends(require_admin)):
    companies = []
    async for c in db.companies.find().sort("created_at", -1):
        worker_count = await db.company_workers.count_documents({"company_id": str(c["_id"])})
        tramite_count = await db.company_tramites.count_documents({"company_id": str(c["_id"])})
        companies.append({
            "id": str(c["_id"]),
            "name": c.get("name", ""),
            "cif_nif": c.get("cif_nif", ""),
            "email": c.get("email", ""),
            "phone": c.get("phone", ""),
            "contact_person": c.get("contact_person", ""),
            "worker_count": worker_count,
            "tramite_count": tramite_count,
            "created_at": c.get("created_at", "")
        })
    return companies


@api_router.get("/companies/{company_id}")
async def get_company(company_id: str, user=Depends(require_admin)):
    try:
        c = await db.companies.find_one({"_id": ObjectId(company_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")
    if not c:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")

    workers = []
    async for w in db.company_workers.find({"company_id": company_id}).sort("created_at", -1):
        doc_count = await db.company_documents.count_documents({"worker_id": str(w["_id"]), "is_deleted": False})
        signed_count = await db.company_documents.count_documents({"worker_id": str(w["_id"]), "is_deleted": False, "category": "firmado"})
        workers.append({
            "id": str(w["_id"]),
            "name": w.get("name", ""),
            "last_name": w.get("last_name", ""),
            "identification": w.get("identification", w.get("nie", w.get("dni", w.get("passport_number", w.get("rut", ""))))),
            "phone": w.get("phone", ""),
            "phone2": w.get("phone2", ""),
            "email": w.get("email", ""),
            "address": w.get("address", ""),
            "nationality": w.get("nationality", ""),
            "origin_country": w.get("origin_country", ""),
            "residence_country": w.get("residence_country", ""),
            "father_name": w.get("father_name", ""),
            "mother_name": w.get("mother_name", ""),
            "children": w.get("children", []),
            "doc_count": doc_count,
            "signed_count": signed_count,
            "created_at": w.get("created_at", "")
        })

    tramites = []
    async for t in db.company_tramites.find({"company_id": company_id}).sort("created_at", -1):
        tramite_name = ""
        base = get_tramite_docs(t.get("country", ""), t.get("tramite_id", ""))
        if base:
            tramite_name = base.get("name", t.get("tramite_id", ""))
        tramites.append({
            "id": str(t["_id"]),
            "country": t.get("country", ""),
            "tramite_id": t.get("tramite_id", ""),
            "tramite_name": tramite_name,
            "status": t.get("status", "pendiente"),
            "notes": t.get("notes", ""),
            "created_at": t.get("created_at", "")
        })

    email_history = []
    async for e in db.company_emails.find({"company_id": company_id}).sort("sent_at", -1):
        email_history.append({
            "id": str(e["_id"]),
            "to_email": e.get("to_email", ""),
            "type": e.get("type", "credentials"),
            "sent_at": e.get("sent_at", ""),
            "status": e.get("status", "sent")
        })

    return {
        "id": str(c["_id"]),
        "name": c.get("name", ""),
        "cif_nif": c.get("cif_nif", ""),
        "email": c.get("email", ""),
        "phone": c.get("phone", ""),
        "address": c.get("address", ""),
        "city": c.get("city", ""),
        "contact_person": c.get("contact_person", ""),
        "password_plain": c.get("password_plain", ""),
        "workers": workers,
        "tramites": tramites,
        "email_history": email_history,
        "created_at": c.get("created_at", "")
    }


@api_router.put("/companies/{company_id}")
async def update_company(company_id: str, body: CompanyUpdateInput, user=Depends(require_admin)):
    update_fields = {}
    if body.name: update_fields["name"] = body.name.strip()
    if body.email: update_fields["email"] = body.email.strip().lower()
    if body.phone: update_fields["phone"] = body.phone.strip()
    if body.address: update_fields["address"] = body.address.strip()
    if body.city: update_fields["city"] = body.city.strip()
    if body.contact_person: update_fields["contact_person"] = body.contact_person.strip()

    if not update_fields:
        raise HTTPException(status_code=400, detail="No hay campos para actualizar")

    try:
        result = await db.companies.update_one({"_id": ObjectId(company_id)}, {"$set": update_fields})
    except Exception:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")

    await log_audit("company_updated", user["_id"], user.get("name", ""),
                    {"company_id": company_id, "fields": list(update_fields.keys())})
    return {"message": "Empresa actualizada"}


@api_router.delete("/companies/{company_id}")
async def delete_company(company_id: str, user=Depends(require_admin)):
    try:
        company = await db.companies.find_one({"_id": ObjectId(company_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")
    if not company:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")

    await db.company_workers.delete_many({"company_id": company_id})
    await db.company_documents.update_many({"company_id": company_id}, {"$set": {"is_deleted": True}})
    await db.company_tramites.delete_many({"company_id": company_id})
    await db.company_emails.delete_many({"company_id": company_id})
    await db.companies.delete_one({"_id": ObjectId(company_id)})

    await log_audit("company_deleted", user["_id"], user.get("name", ""),
                    {"company_id": company_id, "company_name": company.get("name", "")})
    return {"message": "Empresa eliminada"}


# --- Company Workers ---
@api_router.post("/companies/{company_id}/workers")
async def add_worker(company_id: str, body: CompanyWorkerInput, user=Depends(get_current_user)):
    if user.get("role") == "company":
        if user["_id"] != company_id:
            raise HTTPException(status_code=403, detail="Acceso denegado")
    elif user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Acceso denegado")

    company = await db.companies.find_one({"_id": ObjectId(company_id)})
    if not company:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")

    worker_doc = {
        "company_id": company_id,
        "name": body.name.strip(),
        "last_name": body.last_name.strip(),
        "identification": body.identification.strip(),
        "phone": body.phone.strip(),
        "phone2": body.phone2.strip(),
        "email": body.email.strip().lower(),
        "address": body.address.strip(),
        "nationality": body.nationality.strip(),
        "origin_country": body.origin_country.strip(),
        "residence_country": body.residence_country.strip(),
        "father_name": body.father_name.strip(),
        "mother_name": body.mother_name.strip(),
        "children": body.children,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    result = await db.company_workers.insert_one(worker_doc)

    await log_audit("worker_added", user["_id"], user.get("name", ""),
                    {"company_id": company_id, "worker_name": body.name, "worker_id": str(result.inserted_id)})
    return {"id": str(result.inserted_id), "message": "Trabajador agregado"}


@api_router.put("/companies/{company_id}/workers/{worker_id}")
async def update_worker(company_id: str, worker_id: str, body: CompanyWorkerInput, user=Depends(get_current_user)):
    if user.get("role") == "company":
        if user["_id"] != company_id:
            raise HTTPException(status_code=403, detail="Acceso denegado")
    elif user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Acceso denegado")

    update_fields = {
        "name": body.name.strip(),
        "last_name": body.last_name.strip(),
        "identification": body.identification.strip(),
        "phone": body.phone.strip(),
        "phone2": body.phone2.strip(),
        "email": body.email.strip().lower(),
        "address": body.address.strip(),
        "nationality": body.nationality.strip(),
        "origin_country": body.origin_country.strip(),
        "residence_country": body.residence_country.strip(),
        "father_name": body.father_name.strip(),
        "mother_name": body.mother_name.strip(),
        "children": body.children,
    }
    try:
        result = await db.company_workers.update_one(
            {"_id": ObjectId(worker_id), "company_id": company_id}, {"$set": update_fields})
    except Exception:
        raise HTTPException(status_code=404, detail="Trabajador no encontrado")
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Trabajador no encontrado")
    return {"message": "Trabajador actualizado"}


@api_router.delete("/companies/{company_id}/workers/{worker_id}")
async def delete_worker(company_id: str, worker_id: str, user=Depends(get_current_user)):
    if user.get("role") == "company":
        if user["_id"] != company_id:
            raise HTTPException(status_code=403, detail="Acceso denegado")
    elif user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Acceso denegado")
    try:
        result = await db.company_workers.delete_one({"_id": ObjectId(worker_id), "company_id": company_id})
    except Exception:
        raise HTTPException(status_code=404, detail="Trabajador no encontrado")
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Trabajador no encontrado")
    await db.company_documents.update_many({"worker_id": worker_id}, {"$set": {"is_deleted": True}})
    return {"message": "Trabajador eliminado"}


# --- Company Worker Documents ---
@api_router.post("/companies/{company_id}/workers/{worker_id}/documents/upload")
async def upload_worker_document(
    company_id: str, worker_id: str,
    file: UploadFile = File(...),
    category: str = Form("otros"),
    uploaded_by: str = Form("admin"),
    user=Depends(get_current_user)
):
    if user.get("role") not in ["admin", "company"]:
        raise HTTPException(status_code=403, detail="Acceso denegado")

    worker = await db.company_workers.find_one({"_id": ObjectId(worker_id), "company_id": company_id})
    if not worker:
        raise HTTPException(status_code=404, detail="Trabajador no encontrado")

    content = await file.read()
    MAX_SIZE = 5 * 1024 * 1024
    if len(content) > MAX_SIZE:
        raise HTTPException(status_code=400, detail="El archivo supera los 5MB")

    ext = file.filename.split(".")[-1] if "." in file.filename else "bin"
    stored_name = f"company_{company_id}/worker_{worker_id}/{uuid.uuid4().hex}.{ext}"
    content_type = file.content_type or "application/octet-stream"

    put_object(stored_name, content, content_type)

    doc = {
        "company_id": company_id,
        "worker_id": worker_id,
        "filename": stored_name,
        "original_filename": file.filename,
        "display_name": file.filename,
        "content_type": content_type,
        "size": len(content),
        "category": category,
        "status": "pending_review",
        "uploaded_by": uploaded_by,
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
        "is_deleted": False
    }
    result = await db.company_documents.insert_one(doc)

    return {
        "id": str(result.inserted_id),
        "filename": file.filename,
        "message": "Documento subido exitosamente"
    }


@api_router.get("/companies/{company_id}/workers/{worker_id}/documents")
async def list_worker_documents(company_id: str, worker_id: str, user=Depends(get_current_user)):
    if user.get("role") not in ["admin", "company"]:
        raise HTTPException(status_code=403, detail="Acceso denegado")

    docs = []
    async for d in db.company_documents.find(
        {"worker_id": worker_id, "company_id": company_id, "is_deleted": False}
    ).sort("uploaded_at", -1):
        docs.append({
            "id": str(d["_id"]),
            "original_filename": d.get("original_filename", ""),
            "display_name": d.get("display_name", d.get("original_filename", "")),
            "content_type": d.get("content_type", ""),
            "size": d.get("size", 0),
            "category": d.get("category", "otros"),
            "status": d.get("status", "pending_review"),
            "uploaded_by": d.get("uploaded_by", ""),
            "uploaded_at": d.get("uploaded_at", "")
        })
    return docs


@api_router.get("/company-documents/{doc_id}/download")
async def download_company_document(doc_id: str, user=Depends(get_current_user)):
    if user.get("role") not in ["admin", "company"]:
        raise HTTPException(status_code=403, detail="Acceso denegado")

    try:
        doc = await db.company_documents.find_one({"_id": ObjectId(doc_id), "is_deleted": False})
    except Exception:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    if not doc:
        raise HTTPException(status_code=404, detail="Documento no encontrado")

    data, ct = get_object(doc["filename"])
    return FastAPIResponse(content=data, media_type=ct, headers={
        "Content-Disposition": f'attachment; filename="{doc.get("original_filename", "document")}"'
    })


@api_router.put("/company-documents/{doc_id}/status")
async def update_company_doc_status(doc_id: str, body: DocumentStatusUpdate, user=Depends(require_admin)):
    if body.status not in ["pending_review", "reviewed"]:
        raise HTTPException(status_code=400, detail="Estado invalido")
    try:
        result = await db.company_documents.update_one(
            {"_id": ObjectId(doc_id), "is_deleted": False},
            {"$set": {"status": body.status}}
        )
    except Exception:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    return {"message": "Estado actualizado", "status": body.status}


@api_router.delete("/company-documents/{doc_id}")
async def delete_company_document(doc_id: str, user=Depends(require_admin)):
    try:
        result = await db.company_documents.update_one(
            {"_id": ObjectId(doc_id)},
            {"$set": {"is_deleted": True}}
        )
    except Exception:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    return {"message": "Documento eliminado"}


@api_router.get("/companies/{company_id}/workers/{worker_id}/documents/download-all")
async def download_all_worker_documents(company_id: str, worker_id: str, user=Depends(require_admin)):
    worker = await db.company_workers.find_one({"_id": ObjectId(worker_id), "company_id": company_id})
    if not worker:
        raise HTTPException(status_code=404, detail="Trabajador no encontrado")

    docs = []
    async for d in db.company_documents.find({"worker_id": worker_id, "company_id": company_id, "is_deleted": False}):
        docs.append(d)

    if not docs:
        raise HTTPException(status_code=404, detail="No hay documentos para descargar")

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
        for d in docs:
            try:
                data, _ = get_object(d["filename"])
                zf.writestr(d.get("original_filename", "document"), data)
            except Exception:
                continue

    zip_buffer.seek(0)
    worker_name = worker.get("name", "trabajador").replace(" ", "_")
    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="documentos_{worker_name}.zip"'}
    )


# --- Company Tramites ---
@api_router.post("/companies/{company_id}/tramites")
async def assign_company_tramite(company_id: str, body: CompanyTramiteInput, user=Depends(require_admin)):
    company = await db.companies.find_one({"_id": ObjectId(company_id)})
    if not company:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")

    tramite_doc = {
        "company_id": company_id,
        "country": body.country,
        "tramite_id": body.tramite_id,
        "status": body.status,
        "notes": body.notes,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    result = await db.company_tramites.insert_one(tramite_doc)

    await log_audit("company_tramite_assigned", user["_id"], user.get("name", ""),
                    {"company_id": company_id, "tramite_id": body.tramite_id})
    return {"id": str(result.inserted_id), "message": "Tramite asignado"}


@api_router.put("/companies/{company_id}/tramites/{tramite_id}")
async def update_company_tramite(company_id: str, tramite_id: str, body: CompanyTramiteUpdateInput, user=Depends(require_admin)):
    try:
        result = await db.company_tramites.update_one(
            {"_id": ObjectId(tramite_id), "company_id": company_id},
            {"$set": {"status": body.status, "notes": body.notes}}
        )
    except Exception:
        raise HTTPException(status_code=404, detail="Tramite no encontrado")
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Tramite no encontrado")
    return {"message": "Tramite actualizado"}


@api_router.delete("/companies/{company_id}/tramites/{tramite_id}")
async def delete_company_tramite(company_id: str, tramite_id: str, user=Depends(require_admin)):
    try:
        result = await db.company_tramites.delete_one({"_id": ObjectId(tramite_id), "company_id": company_id})
    except Exception:
        raise HTTPException(status_code=404, detail="Tramite no encontrado")
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Tramite no encontrado")
    return {"message": "Tramite eliminado"}


# --- Company Credentials & Email ---
@api_router.post("/companies/{company_id}/send-credentials")
async def send_credentials(company_id: str, body: CompanySendCredentialsInput, background_tasks: BackgroundTasks, user=Depends(require_admin)):
    company = await db.companies.find_one({"_id": ObjectId(company_id)})
    if not company:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")

    to_email = body.email.strip() if body.email.strip() else company.get("email", "")
    if not to_email:
        raise HTTPException(status_code=400, detail="No hay correo de destino")

    password = company.get("password_plain", "")
    if not password:
        raise HTTPException(status_code=400, detail="No se encontro la contrasena de la empresa")

    background_tasks.add_task(
        send_company_credentials_email,
        to_email, company.get("name", ""), company.get("cif_nif", ""), password
    )

    await db.company_emails.insert_one({
        "company_id": company_id,
        "to_email": to_email,
        "type": "credentials",
        "sent_at": datetime.now(timezone.utc).isoformat(),
        "status": "sent"
    })

    await log_audit("company_credentials_sent", user["_id"], user.get("name", ""),
                    {"company_id": company_id, "to_email": to_email})
    return {"message": f"Credenciales enviadas a {to_email}"}


@api_router.post("/companies/{company_id}/resend-email/{email_id}")
async def resend_company_email(company_id: str, email_id: str, background_tasks: BackgroundTasks, user=Depends(require_admin)):
    company = await db.companies.find_one({"_id": ObjectId(company_id)})
    if not company:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")

    try:
        email_record = await db.company_emails.find_one({"_id": ObjectId(email_id), "company_id": company_id})
    except Exception:
        raise HTTPException(status_code=404, detail="Registro de email no encontrado")
    if not email_record:
        raise HTTPException(status_code=404, detail="Registro de email no encontrado")

    to_email = email_record.get("to_email", "")
    password = company.get("password_plain", "")

    background_tasks.add_task(
        send_company_credentials_email,
        to_email, company.get("name", ""), company.get("cif_nif", ""), password
    )

    await db.company_emails.insert_one({
        "company_id": company_id,
        "to_email": to_email,
        "type": "credentials_resend",
        "sent_at": datetime.now(timezone.utc).isoformat(),
        "status": "sent"
    })
    return {"message": f"Credenciales reenviadas a {to_email}"}


# --- Company Auth (Login) ---
@api_router.post("/auth/company-login")
async def company_login(input_data: LoginInput):
    cif_nif = input_data.email.strip().upper()
    company = await db.companies.find_one({"cif_nif": cif_nif})
    if not company or not verify_password(input_data.password, company["password_hash"]):
        raise HTTPException(status_code=401, detail="CIF/NIF o contrasena incorrectos")

    company_id = str(company["_id"])
    token = create_access_token(company_id, company.get("email", ""), "company")

    return {
        "id": company_id,
        "name": company.get("name", ""),
        "cif_nif": company.get("cif_nif", ""),
        "email": company.get("email", ""),
        "role": "company",
        "token": token
    }


# --- Company Panel Endpoints ---
@api_router.get("/company/me")
async def company_me(user=Depends(require_company)):
    company_id = user["_id"]
    c = await db.companies.find_one({"_id": ObjectId(company_id)})
    if not c:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")
    return {
        "id": str(c["_id"]),
        "name": c.get("name", ""),
        "cif_nif": c.get("cif_nif", ""),
        "email": c.get("email", ""),
        "phone": c.get("phone", ""),
        "role": "company"
    }


@api_router.get("/company/workers")
async def company_list_workers(user=Depends(require_company)):
    company_id = user["_id"]
    workers = []
    async for w in db.company_workers.find({"company_id": company_id}).sort("created_at", -1):
        doc_count = await db.company_documents.count_documents({"worker_id": str(w["_id"]), "is_deleted": False})
        reviewed = await db.company_documents.count_documents({"worker_id": str(w["_id"]), "is_deleted": False, "status": "reviewed"})
        signed_count = await db.company_documents.count_documents({"worker_id": str(w["_id"]), "is_deleted": False, "category": "firmado"})
        workers.append({
            "id": str(w["_id"]),
            "name": w.get("name", ""),
            "last_name": w.get("last_name", ""),
            "identification": w.get("identification", w.get("nie", w.get("dni", w.get("passport_number", w.get("rut", ""))))),
            "phone": w.get("phone", ""),
            "phone2": w.get("phone2", ""),
            "email": w.get("email", ""),
            "address": w.get("address", ""),
            "nationality": w.get("nationality", ""),
            "origin_country": w.get("origin_country", ""),
            "residence_country": w.get("residence_country", ""),
            "father_name": w.get("father_name", ""),
            "mother_name": w.get("mother_name", ""),
            "children": w.get("children", []),
            "doc_count": doc_count,
            "reviewed_count": reviewed,
            "signed_count": signed_count,
            "created_at": w.get("created_at", "")
        })
    return workers


@api_router.get("/company/tramites")
async def company_list_tramites(user=Depends(require_company)):
    company_id = user["_id"]
    tramites = []
    async for t in db.company_tramites.find({"company_id": company_id}).sort("created_at", -1):
        tramite_name = ""
        base = get_tramite_docs(t.get("country", ""), t.get("tramite_id", ""))
        if base:
            tramite_name = base.get("name", t.get("tramite_id", ""))
        tramites.append({
            "id": str(t["_id"]),
            "country": t.get("country", ""),
            "tramite_id": t.get("tramite_id", ""),
            "tramite_name": tramite_name,
            "status": t.get("status", "pendiente"),
            "notes": t.get("notes", ""),
            "created_at": t.get("created_at", "")
        })
    return tramites


# --- Company Sign Documents (Admin uploads, Company signs) ---
@api_router.post("/companies/{company_id}/sign-requests/upload")
async def upload_sign_request(
    company_id: str,
    file: UploadFile = File(...),
    user=Depends(require_admin)
):
    company = await db.companies.find_one({"_id": ObjectId(company_id)})
    if not company:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")

    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="El archivo supera los 5MB")

    ext = file.filename.split(".")[-1] if "." in file.filename else "bin"
    stored_name = f"company_{company_id}/sign_requests/{uuid.uuid4().hex}.{ext}"
    content_type = file.content_type or "application/octet-stream"
    put_object(stored_name, content, content_type)

    doc = {
        "company_id": company_id,
        "filename": stored_name,
        "original_filename": file.filename,
        "display_name": file.filename,
        "content_type": content_type,
        "size": len(content),
        "status": "pending_signature",
        "signed_filename": None,
        "signed_original_filename": None,
        "signed_at": None,
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
        "is_deleted": False
    }
    result = await db.sign_requests.insert_one(doc)

    await log_audit("sign_request_uploaded", user["_id"], user.get("name", ""),
                    {"company_id": company_id, "filename": file.filename})
    return {"id": str(result.inserted_id), "message": "Documento para firmar subido"}


@api_router.get("/companies/{company_id}/sign-requests")
async def list_sign_requests(company_id: str, user=Depends(get_current_user)):
    if user.get("role") == "company" and user["_id"] != company_id:
        raise HTTPException(status_code=403, detail="Acceso denegado")
    if user.get("role") not in ["admin", "company"]:
        raise HTTPException(status_code=403, detail="Acceso denegado")

    docs = []
    async for d in db.sign_requests.find({"company_id": company_id, "is_deleted": False}).sort("uploaded_at", -1):
        docs.append({
            "id": str(d["_id"]),
            "original_filename": d.get("original_filename", ""),
            "display_name": d.get("display_name", ""),
            "content_type": d.get("content_type", ""),
            "size": d.get("size", 0),
            "status": d.get("status", "pending_signature"),
            "signed_original_filename": d.get("signed_original_filename", ""),
            "signed_at": d.get("signed_at", ""),
            "uploaded_at": d.get("uploaded_at", "")
        })
    return docs


@api_router.get("/sign-requests/{doc_id}/download")
async def download_sign_request(doc_id: str, user=Depends(get_current_user)):
    if user.get("role") not in ["admin", "company"]:
        raise HTTPException(status_code=403, detail="Acceso denegado")

    doc = await db.sign_requests.find_one({"_id": ObjectId(doc_id), "is_deleted": False})
    if not doc:
        raise HTTPException(status_code=404, detail="Documento no encontrado")

    data, ct = get_object(doc["filename"])
    return FastAPIResponse(content=data, media_type=ct, headers={
        "Content-Disposition": f'attachment; filename="{doc.get("original_filename", "document")}"'
    })


@api_router.get("/sign-requests/{doc_id}/download-signed")
async def download_signed_version(doc_id: str, user=Depends(get_current_user)):
    if user.get("role") not in ["admin", "company"]:
        raise HTTPException(status_code=403, detail="Acceso denegado")

    doc = await db.sign_requests.find_one({"_id": ObjectId(doc_id), "is_deleted": False})
    if not doc or not doc.get("signed_filename"):
        raise HTTPException(status_code=404, detail="Documento firmado no encontrado")

    data, ct = get_object(doc["signed_filename"])
    return FastAPIResponse(content=data, media_type=ct, headers={
        "Content-Disposition": f'attachment; filename="{doc.get("signed_original_filename", "document_firmado")}"'
    })


@api_router.post("/sign-requests/{doc_id}/upload-signed")
async def upload_signed_document(
    doc_id: str,
    file: UploadFile = File(...),
    user=Depends(get_current_user)
):
    if user.get("role") not in ["admin", "company"]:
        raise HTTPException(status_code=403, detail="Acceso denegado")

    doc = await db.sign_requests.find_one({"_id": ObjectId(doc_id), "is_deleted": False})
    if not doc:
        raise HTTPException(status_code=404, detail="Documento no encontrado")

    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="El archivo supera los 5MB")

    ext = file.filename.split(".")[-1] if "." in file.filename else "bin"
    stored_name = f"company_{doc['company_id']}/sign_requests/signed_{uuid.uuid4().hex}.{ext}"
    content_type = file.content_type or "application/octet-stream"
    put_object(stored_name, content, content_type)

    await db.sign_requests.update_one(
        {"_id": ObjectId(doc_id)},
        {"$set": {
            "status": "signed",
            "signed_filename": stored_name,
            "signed_original_filename": file.filename,
            "signed_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    return {"message": "Documento firmado subido exitosamente"}


@api_router.delete("/sign-requests/{doc_id}")
async def delete_sign_request(doc_id: str, user=Depends(require_admin)):
    result = await db.sign_requests.update_one(
        {"_id": ObjectId(doc_id)}, {"$set": {"is_deleted": True}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    return {"message": "Documento eliminado"}


# --- Company panel: sign request summary ---
@api_router.get("/company/sign-requests")
async def company_sign_requests(user=Depends(require_company)):
    company_id = user["_id"]
    docs = []
    async for d in db.sign_requests.find({"company_id": company_id, "is_deleted": False}).sort("uploaded_at", -1):
        docs.append({
            "id": str(d["_id"]),
            "original_filename": d.get("original_filename", ""),
            "display_name": d.get("display_name", ""),
            "content_type": d.get("content_type", ""),
            "status": d.get("status", "pending_signature"),
            "signed_original_filename": d.get("signed_original_filename", ""),
            "signed_at": d.get("signed_at", ""),
            "uploaded_at": d.get("uploaded_at", "")
        })
    return docs


# --- Admin: Signed Documents from all companies ---
@api_router.get("/admin/signed-documents")
async def get_all_signed_documents(user=Depends(require_admin)):
    docs = []
    async for d in db.company_documents.find({"category": "firmado", "is_deleted": False}).sort("uploaded_at", -1):
        worker = await db.company_workers.find_one({"_id": ObjectId(d["worker_id"])})
        company = await db.companies.find_one({"_id": ObjectId(d["company_id"])})
        docs.append({
            "id": str(d["_id"]),
            "original_filename": d.get("original_filename", ""),
            "display_name": d.get("display_name", d.get("original_filename", "")),
            "content_type": d.get("content_type", ""),
            "size": d.get("size", 0),
            "status": d.get("status", "pending_review"),
            "uploaded_at": d.get("uploaded_at", ""),
            "worker_name": f"{worker.get('name', '')} {worker.get('last_name', '')}".strip() if worker else "Desconocido",
            "worker_id": d.get("worker_id", ""),
            "company_name": company.get("name", "Desconocida") if company else "Desconocida",
            "company_id": d.get("company_id", "")
        })
    return docs


# ============================
# --- Staff Management (Admin only) ---
# ============================

@api_router.post("/staff")
async def create_staff(body: StaffCreateInput, user=Depends(require_admin)):
    email = body.email.lower().strip()
    if not email or not body.password or not body.name.strip():
        raise HTTPException(status_code=400, detail="Nombre, email y contrasena son obligatorios")

    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="El email ya esta registrado")

    user_doc = {
        "email": email,
        "password_hash": hash_password(body.password),
        "name": body.name.strip(),
        "phone": body.phone.strip(),
        "position": body.position.strip(),
        "role": "staff",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    result = await db.users.insert_one(user_doc)

    await log_audit("staff_created", user["_id"], user.get("name", ""),
                    {"staff_id": str(result.inserted_id), "staff_name": body.name, "email": email})
    return {"id": str(result.inserted_id), "email": email, "name": body.name.strip(), "message": "Usuario creado"}


@api_router.get("/staff")
async def list_staff(user=Depends(require_staff_or_admin)):
    staff = []
    async for u in db.users.find({"role": "staff"}).sort("created_at", -1):
        staff.append({
            "id": str(u["_id"]),
            "name": u.get("name", ""),
            "email": u.get("email", ""),
            "phone": u.get("phone", ""),
            "position": u.get("position", ""),
            "created_at": u.get("created_at", "")
        })
    # Include admins too
    async for u in db.users.find({"role": "admin", "is_hidden": {"$ne": True}}).sort("created_at", -1):
        staff.append({
            "id": str(u["_id"]),
            "name": u.get("name", ""),
            "email": u.get("email", ""),
            "phone": u.get("phone", ""),
            "position": "Administrador",
            "created_at": u.get("created_at", "")
        })
    return staff


@api_router.delete("/staff/{staff_id}")
async def delete_staff(staff_id: str, user=Depends(require_admin)):
    try:
        result = await db.users.delete_one({"_id": ObjectId(staff_id), "role": "staff"})
    except Exception:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    await log_audit("staff_deleted", user["_id"], user.get("name", ""), {"staff_id": staff_id})
    return {"message": "Usuario eliminado"}


# ============================
# --- Tasks System ---
# ============================

@api_router.post("/tasks")
async def create_task(body: TaskCreateInput, user=Depends(require_staff_or_admin)):
    if not body.title.strip():
        raise HTTPException(status_code=400, detail="El titulo es obligatorio")
    if body.priority not in ["baja", "media", "alta"]:
        raise HTTPException(status_code=400, detail="Prioridad invalida")

    # Verify assigned user exists
    try:
        assigned = await db.users.find_one({"_id": ObjectId(body.assigned_to), "role": {"$in": ["admin", "staff"]}})
    except Exception:
        raise HTTPException(status_code=400, detail="Usuario asignado no encontrado")
    if not assigned:
        raise HTTPException(status_code=400, detail="Usuario asignado no encontrado")

    task_doc = {
        "title": body.title.strip(),
        "description": body.description.strip(),
        "priority": body.priority,
        "status": "pendiente",
        "created_by": user["_id"],
        "created_by_name": user.get("name", ""),
        "assigned_to": body.assigned_to,
        "assigned_to_name": assigned.get("name", ""),
        "due_date": body.due_date,
        "related_client_id": body.related_client_id,
        "related_company_id": body.related_company_id,
        "related_tramite": body.related_tramite,
        "comments": [],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    result = await db.tasks.insert_one(task_doc)
    task_id = str(result.inserted_id)

    # Create notification for assigned user
    await db.notifications.insert_one({
        "user_id": body.assigned_to,
        "type": "task_assigned",
        "title": "Te han asignado una tarea",
        "message": f"{user.get('name', 'Alguien')} te ha asignado: {body.title.strip()}",
        "task_id": task_id,
        "read": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    })

    await log_audit("task_created", user["_id"], user.get("name", ""),
                    {"task_id": task_id, "title": body.title, "assigned_to": assigned.get("name", "")})
    return {"id": task_id, "message": "Tarea creada"}


@api_router.get("/tasks")
async def list_tasks(user=Depends(require_staff_or_admin)):
    tasks = []
    async for t in db.tasks.find().sort("created_at", -1):
        tasks.append({
            "id": str(t["_id"]),
            "title": t.get("title", ""),
            "description": t.get("description", ""),
            "priority": t.get("priority", "media"),
            "status": t.get("status", "pendiente"),
            "created_by": t.get("created_by", ""),
            "created_by_name": t.get("created_by_name", ""),
            "assigned_to": t.get("assigned_to", ""),
            "assigned_to_name": t.get("assigned_to_name", ""),
            "due_date": t.get("due_date", ""),
            "related_tramite": t.get("related_tramite", ""),
            "comments_count": len(t.get("comments", [])),
            "created_at": t.get("created_at", "")
        })
    return tasks


@api_router.get("/tasks/{task_id}")
async def get_task(task_id: str, user=Depends(require_staff_or_admin)):
    try:
        t = await db.tasks.find_one({"_id": ObjectId(task_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")
    if not t:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")

    return {
        "id": str(t["_id"]),
        "title": t.get("title", ""),
        "description": t.get("description", ""),
        "priority": t.get("priority", "media"),
        "status": t.get("status", "pendiente"),
        "created_by": t.get("created_by", ""),
        "created_by_name": t.get("created_by_name", ""),
        "assigned_to": t.get("assigned_to", ""),
        "assigned_to_name": t.get("assigned_to_name", ""),
        "due_date": t.get("due_date", ""),
        "related_client_id": t.get("related_client_id", ""),
        "related_company_id": t.get("related_company_id", ""),
        "related_tramite": t.get("related_tramite", ""),
        "comments": t.get("comments", []),
        "created_at": t.get("created_at", "")
    }


@api_router.put("/tasks/{task_id}")
async def update_task(task_id: str, body: TaskUpdateInput, user=Depends(require_staff_or_admin)):
    update_fields = {}
    if body.title: update_fields["title"] = body.title.strip()
    if body.description is not None: update_fields["description"] = body.description.strip()
    if body.priority and body.priority in ["baja", "media", "alta"]: update_fields["priority"] = body.priority
    if body.status and body.status in ["pendiente", "en_proceso", "completada"]: update_fields["status"] = body.status
    if body.due_date is not None: update_fields["due_date"] = body.due_date
    if body.assigned_to:
        assigned = await db.users.find_one({"_id": ObjectId(body.assigned_to)})
        if assigned:
            update_fields["assigned_to"] = body.assigned_to
            update_fields["assigned_to_name"] = assigned.get("name", "")
            # Notify new assignee
            if body.assigned_to != user["_id"]:
                task = await db.tasks.find_one({"_id": ObjectId(task_id)})
                await db.notifications.insert_one({
                    "user_id": body.assigned_to,
                    "type": "task_reassigned",
                    "title": "Te han reasignado una tarea",
                    "message": f"{user.get('name', 'Alguien')} te ha asignado: {task.get('title', '')}",
                    "task_id": task_id,
                    "read": False,
                    "created_at": datetime.now(timezone.utc).isoformat()
                })

    if not update_fields:
        raise HTTPException(status_code=400, detail="No hay campos para actualizar")

    try:
        result = await db.tasks.update_one({"_id": ObjectId(task_id)}, {"$set": update_fields})
    except Exception:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")
    return {"message": "Tarea actualizada"}


@api_router.post("/tasks/{task_id}/comments")
async def add_task_comment(task_id: str, body: TaskCommentInput, user=Depends(require_staff_or_admin)):
    if not body.text.strip():
        raise HTTPException(status_code=400, detail="El comentario no puede estar vacio")

    comment = {
        "id": uuid.uuid4().hex[:8],
        "user_id": user["_id"],
        "user_name": user.get("name", ""),
        "text": body.text.strip(),
        "created_at": datetime.now(timezone.utc).isoformat()
    }

    try:
        task = await db.tasks.find_one({"_id": ObjectId(task_id)})
        if not task:
            raise HTTPException(status_code=404, detail="Tarea no encontrada")
        result = await db.tasks.update_one(
            {"_id": ObjectId(task_id)},
            {"$push": {"comments": comment}}
        )
    except Exception:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")

    # Notify task assignee and creator
    notify_ids = set([task.get("assigned_to", ""), task.get("created_by", "")]) - {user["_id"]}
    for uid in notify_ids:
        if uid:
            await db.notifications.insert_one({
                "user_id": uid,
                "type": "task_comment",
                "title": "Nuevo comentario en tarea",
                "message": f"{user.get('name', 'Alguien')} comento en: {task.get('title', '')}",
                "task_id": task_id,
                "read": False,
                "created_at": datetime.now(timezone.utc).isoformat()
            })

    return {"message": "Comentario agregado", "comment": comment}


@api_router.delete("/tasks/{task_id}")
async def delete_task(task_id: str, user=Depends(require_staff_or_admin)):
    try:
        result = await db.tasks.delete_one({"_id": ObjectId(task_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")
    return {"message": "Tarea eliminada"}


# ============================
# --- Notifications ---
# ============================

@api_router.get("/notifications")
async def get_notifications(user=Depends(require_staff_or_admin)):
    notifs = []
    async for n in db.notifications.find({"user_id": user["_id"]}).sort("created_at", -1).limit(50):
        notifs.append({
            "id": str(n["_id"]),
            "type": n.get("type", ""),
            "title": n.get("title", ""),
            "message": n.get("message", ""),
            "task_id": n.get("task_id", ""),
            "read": n.get("read", False),
            "created_at": n.get("created_at", "")
        })
    return notifs


@api_router.get("/notifications/unread-count")
async def unread_notification_count(user=Depends(require_staff_or_admin)):
    count = await db.notifications.count_documents({"user_id": user["_id"], "read": False})
    return {"count": count}


@api_router.put("/notifications/{notif_id}/read")
async def mark_notification_read(notif_id: str, user=Depends(require_staff_or_admin)):
    await db.notifications.update_one(
        {"_id": ObjectId(notif_id), "user_id": user["_id"]},
        {"$set": {"read": True}}
    )
    return {"message": "Notificacion marcada como leida"}


@api_router.put("/notifications/read-all")
async def mark_all_notifications_read(user=Depends(require_staff_or_admin)):
    await db.notifications.update_many(
        {"user_id": user["_id"], "read": False},
        {"$set": {"read": True}}
    )
    return {"message": "Todas las notificaciones marcadas como leidas"}


# --- Chatbot (Gemini) ---
ADMIN_SYSTEM_PROMPT = """Eres el asistente virtual de Tramilex, una plataforma de gestion documental para inmigracion. Respondes SOLO preguntas sobre la plataforma.

FUNCIONES DEL PANEL ADMIN:
- Clientes: Ver lista de clientes, buscar por nombre/NIE/email, ver detalle con documentos, descargar/renombrar/eliminar documentos, marcar como revisado, generar Ficha PDF, enviar email al cliente, iniciar sesion como cliente.
- Empresas: Crear empresa (nombre, CIF/NIF, email, telefono), se genera contrasena automatica. Agregar trabajadores, asignar tramites (Chile/Espana), subir documentos para firmar, ver documentos firmados, enviar credenciales por email, historial de correos.
- Tramites: Gestionar tramites del sistema y crear tramites personalizados con requisitos.
- Enviar correo: Enviar notificaciones a clientes.
- Auditoria: Ver historial de acciones realizadas.
- Configuracion: Configurar SMTP para envio de emails.

Si te preguntan algo que no sea sobre la plataforma, responde: "Solo puedo ayudarte con dudas sobre la plataforma Tramilex."
Responde siempre en espanol, de forma breve y clara."""

CLIENT_SYSTEM_PROMPT = """Eres el asistente virtual de Tramilex, una plataforma de gestion documental para inmigracion. Respondes SOLO preguntas sobre como usar la plataforma como cliente.

FUNCIONES DEL PANEL CLIENTE:
- Ver requisitos de tu tramite (en movil, pulsa el boton "Requisitos" para desplegarlos).
- Subir documentos: Selecciona la categoria (Identificacion, Residencia, Trabajo, Contrato, Fiscal, Otros) y arrastra o haz clic para subir archivos (PDF, JPG, PNG, max 5MB).
- Si tu archivo supera 5MB, comprimelo en ilovepdf.com.
- Ver el estado de tus documentos: "Pendiente de revision" o "Revisado".
- Descargar tus documentos subidos.

Si te preguntan algo que no sea sobre la plataforma, responde: "Solo puedo ayudarte con dudas sobre la plataforma Tramilex."
Responde siempre en espanol, de forma breve y clara."""

COMPANY_SYSTEM_PROMPT = """Eres el asistente virtual de Tramilex, una plataforma de gestion documental para inmigracion. Respondes SOLO preguntas sobre como usar la plataforma como empresa.

FUNCIONES DEL PANEL EMPRESA:
- Ver tramites contratados y su estado (pendiente, en proceso, completado, rechazado).
- Documentos por firmar: Si el abogado te sube documentos, aparecen con alerta amarilla. Descarga el documento, firmalo con tu certificado electronico en tu ordenador, y sube el documento firmado con el boton verde "Subir documento firmado".
- Trabajadores: Agregar trabajadores con sus datos (nombre, apellidos, DNI/NIE/Pasaporte/RUT, telefono, email, direccion, pais de origen, pais de residencia, nombre padre, nombre madre, hijos).
- Subir documentos por trabajador: Selecciona categoria y sube archivos. Usa "Subir documento firmado" para documentos con firma electronica.
- Ver estado de revision de los documentos de cada trabajador.

Si te preguntan algo que no sea sobre la plataforma, responde: "Solo puedo ayudarte con dudas sobre la plataforma Tramilex."
Responde siempre en espanol, de forma breve y clara."""


class ChatMessageInput(BaseModel):
    message: str
    session_id: str = ""
    context: str = "client"


@api_router.post("/chatbot/message")
async def chatbot_message(body: ChatMessageInput, user=Depends(get_current_user)):
    if not body.message.strip():
        raise HTTPException(status_code=400, detail="El mensaje no puede estar vacio")

    role = user.get("role", "client")
    if body.context == "admin" and role == "admin":
        system_msg = ADMIN_SYSTEM_PROMPT
    elif body.context == "company" and role == "company":
        system_msg = COMPANY_SYSTEM_PROMPT
    else:
        system_msg = CLIENT_SYSTEM_PROMPT

    session_id = body.session_id or f"{role}_{user['_id']}_{datetime.now(timezone.utc).strftime('%Y%m%d')}"

    try:
        from groq import Groq

        groq_key = os.environ.get("GROQ_API_KEY", "")
        groq_client = Groq(api_key=groq_key)

        # Build conversation history from DB
        messages = [{"role": "system", "content": system_msg}]
        chat_history = await db.chat_messages.find(
            {"session_id": session_id}
        ).sort("timestamp", 1).to_list(20)

        for msg in chat_history:
            messages.append({"role": msg["role"], "content": msg["text"]})

        messages.append({"role": "user", "content": body.message.strip()})

        response = groq_client.chat.completions.create(
            messages=messages,
            model="llama-3.3-70b-versatile"
        )

        bot_response = response.choices[0].message.content

        # Save messages to DB
        now = datetime.now(timezone.utc).isoformat()
        await db.chat_messages.insert_many([
            {"session_id": session_id, "role": "user", "text": body.message.strip(), "timestamp": now},
            {"session_id": session_id, "role": "assistant", "text": bot_response, "timestamp": now}
        ])

        return {"response": bot_response, "session_id": session_id}
    except Exception as e:
        error_str = str(e).lower()
        if "rate" in error_str or "limit" in error_str or "quota" in error_str or "429" in error_str:
            return {"response": "Exceso de Limite. Por favor intenta de nuevo mas tarde.", "session_id": session_id}
        logger.error(f"Chatbot error: {e}")
        return {"response": "Error procesando tu consulta. Intenta de nuevo.", "session_id": session_id}


# --- Startup ---
@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.companies.create_index("cif_nif", unique=True)

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
