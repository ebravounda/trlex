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
import stripe
import pymongo
import resend

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

# Stripe
stripe.api_key = os.environ.get("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")

# Sync MongoDB for background tasks / webhooks
sync_mongo_client = pymongo.MongoClient(os.environ['MONGO_URL'])
sync_db = sync_mongo_client[os.environ['DB_NAME']]

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
def create_access_token(user_id: str, email: str, role: str, keep_session: bool = False) -> str:
    exp = timedelta(days=30) if keep_session else timedelta(hours=24)
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "exp": datetime.now(timezone.utc) + exp,
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
    keep_session: bool = False


class PinRequestInput(BaseModel):
    email: str
    login_type: str = "client"


class PinVerifyInput(BaseModel):
    email: str
    pin: str
    login_type: str = "client"
    keep_session: bool = False


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


class MailgunSettingsInput(BaseModel):
    mailgun_domain: str = ""
    mailgun_api_key: str = ""
    mailgun_from_email: str = ""


class ResendSettingsInput(BaseModel):
    resend_api_key: str = ""
    resend_from_email: str = ""


class CompanyInfoSettingsInput(BaseModel):
    company_name: str = "Tramilex"
    company_email: str = "info@tramilex.es"
    phone_spain: str = ""
    phone_chile: str = ""
    phone_mexico: str = ""
    phone_peru: str = ""
    iban: str = ""
    bank_name_eu: str = ""
    cuenta_chile: str = ""
    bank_name_chile: str = ""
    extra_payment_info: str = ""


class PresupuestoCreateInput(BaseModel):
    recipient_name: str
    recipient_company: str = ""
    recipient_email: str = ""
    recipient_address: str = ""
    recipient_nif: str = ""
    items: List[dict]
    iva_rate: float = 21
    notes: str = ""
    payment_method: str = ""


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


class BillingCreateInput(BaseModel):
    client_type: str
    client_id: str
    tramite_name: str = ""
    description: str = ""
    amount: float = 0
    extra_per_worker: float = 0
    worker_count: int = 0
    notes: str = ""
    due_date: str = ""


class BillingUpdateInput(BaseModel):
    tramite_name: str = ""
    description: str = ""
    amount: float = 0
    extra_per_worker: float = 0
    worker_count: int = 0
    status: str = ""
    notes: str = ""
    due_date: str = ""


class PaymentInput(BaseModel):
    amount: float
    method: str = ""
    reference: str = ""
    notes: str = ""


class AppointmentBookInput(BaseModel):
    first_name: str
    last_name: str
    email: str
    origin_country: str
    residence_country: str
    address: str
    document_id: str
    document_type: str = "pasaporte"
    phone: str
    accept_terms: bool = False
    location: str
    office: str = ""
    date: str
    time: str
    origin_url: str = ""


class AppointmentSettingsInput(BaseModel):
    blocked_dates: List[str] = []
    start_hour: int = 9
    end_hour: int = 18
    slot_duration: int = 45
    price_amount: int = 5000
    price_currency: str = "eur"


# --- Auth Routes ---
@api_router.post("/auth/register")
async def register(input_data: RegisterInput, background_tasks: BackgroundTasks):
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

    # Send welcome email
    background_tasks.add_task(send_welcome_email, email, input_data.name)

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
    if user.get("role") not in ("admin",):
        raise HTTPException(status_code=401, detail="Use PIN para acceder")

    user_id = str(user["_id"])
    token = create_access_token(user_id, email, user.get("role", "client"), input_data.keep_session)

    return {
        "id": user_id,
        "email": email,
        "name": user.get("name", ""),
        "role": user.get("role", "client"),
        "must_change_password": user.get("must_change_password", False),
        "tutorial_seen": user.get("tutorial_seen", False),
        "token": token
    }


def _send_email(to_email, subject, html_body):
    """Universal email sender: tries Resend first, then SMTP."""
    # Try Resend first
    resend_settings = sync_db.settings.find_one({"type": "resend"})
    if resend_settings and resend_settings.get("resend_api_key"):
        try:
            resend.api_key = resend_settings["resend_api_key"]
            from_email = resend_settings.get("resend_from_email", "onboarding@resend.dev")
            params = {"from": from_email, "to": [to_email], "subject": subject, "html": html_body}
            resend.Emails.send(params)
            logger.info(f"Email enviado via Resend a {to_email}")
            return True
        except Exception as e:
            logger.error(f"Error Resend: {e}")
            # Fall through to SMTP

    # Fallback: SMTP
    smtp_settings = sync_db.settings.find_one({"type": "smtp"})
    if smtp_settings and smtp_settings.get("smtp_host"):
        try:
            msg = MIMEMultipart()
            msg["From"] = smtp_settings["from_email"]
            msg["To"] = to_email
            msg["Subject"] = subject
            msg.attach(MIMEText(html_body, "html"))
            server = smtplib.SMTP(smtp_settings["smtp_host"], smtp_settings["smtp_port"])
            server.starttls()
            server.login(smtp_settings["smtp_user"], smtp_settings["smtp_password"])
            server.send_message(msg)
            server.quit()
            logger.info(f"Email enviado via SMTP a {to_email}")
            return True
        except Exception as e:
            logger.error(f"Error SMTP: {e}")

    logger.warning("No hay email configurado (ni Resend ni SMTP)")
    return False


def _get_notify_email():
    """Get admin notification email from settings."""
    smtp = sync_db.settings.find_one({"type": "smtp"})
    if smtp:
        return smtp.get("notify_email") or smtp.get("from_email", "")
    return ""


def _generate_pin():
    import random
    return str(random.randint(100000, 999999))


def _send_pin_email(to_email, name, pin):
    subject = f"Tu codigo de acceso Tramilex: {pin}"
    html_body = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <img src="https://tramilex.es/logo.png" alt="Tramilex" style="height: 50px; margin-bottom: 20px;" />
        <h2 style="color: #0f172a; margin-bottom: 8px;">Tu codigo de acceso</h2>
        <p>Hola <strong>{name}</strong>,</p>
        <p>Tu codigo de acceso para ingresar a Tramilex es:</p>
        <div style="background: #f8fafc; border: 2px solid #e2e8f0; border-radius: 12px; padding: 24px; margin: 20px 0; text-align: center;">
            <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #0f172a; font-family: monospace;">{pin}</span>
        </div>
        <p style="color: #64748b; font-size: 13px;">Este codigo expira en <strong>5 minutos</strong>. No lo compartas con nadie.</p>
        <p style="margin-top: 24px;">Un cordial saludo,<br><strong>El equipo de Tramilex</strong></p>
    </div>
    """
    return _send_email(to_email, subject, html_body)


@api_router.post("/auth/request-pin")
async def request_pin(body: PinRequestInput):
    email = body.email.lower().strip()

    # Auto-detect: first check users, then companies
    name = ""
    login_type = "client"
    user = await db.users.find_one({"email": email})
    if user:
        if user.get("role") == "admin":
            raise HTTPException(status_code=400, detail="Administradores deben usar contrasena")
        name = user.get("name", "")
        email_to = email
        login_type = "user"
    else:
        entity = await db.companies.find_one({"email": email})
        if entity:
            name = entity.get("name", "")
            email_to = entity.get("email", email)
            login_type = "company"
        else:
            raise HTTPException(status_code=404, detail="No se encontro una cuenta con ese email")

    pin = _generate_pin()
    await db.auth_pins.delete_many({"email": email_to})
    await db.auth_pins.insert_one({
        "email": email_to,
        "identifier": email_to,
        "pin": pin,
        "login_type": login_type,
        "created_at": datetime.now(timezone.utc),
        "expires_at": datetime.now(timezone.utc) + timedelta(minutes=5),
    })

    sent = _send_pin_email(email_to, name, pin)
    if not sent:
        raise HTTPException(status_code=500, detail="Error enviando el codigo. Verifica la configuracion SMTP.")

    masked = email_to[:3] + "***" + email_to[email_to.index("@"):] if "@" in email_to else "***"
    return {"message": f"Codigo enviado a {masked}", "email_sent": True}


@api_router.post("/auth/verify-pin")
async def verify_pin(body: PinVerifyInput):
    email = body.email.lower().strip()

    record = await db.auth_pins.find_one({
        "identifier": email,
        "pin": body.pin,
        "expires_at": {"$gt": datetime.now(timezone.utc)}
    })
    if not record:
        raise HTTPException(status_code=401, detail="Codigo incorrecto o expirado")

    await db.auth_pins.delete_many({"identifier": email})
    detected_type = record.get("login_type", "user")

    if detected_type == "company":
        entity = await db.companies.find_one({"email": email})
        if not entity:
            raise HTTPException(status_code=404, detail="Empresa no encontrada")
        eid = str(entity["_id"])
        token = create_access_token(eid, entity.get("email", ""), "company", body.keep_session)
        return {
            "id": eid, "name": entity.get("name", ""), "email": entity.get("email", ""),
            "cif_nif": entity.get("cif_nif", ""), "role": "company",
            "tutorial_seen": entity.get("tutorial_seen", False), "token": token
        }
    else:
        user = await db.users.find_one({"email": email})
        if not user:
            raise HTTPException(status_code=404, detail="Usuario no encontrado")
        uid = str(user["_id"])
        token = create_access_token(uid, email, user.get("role", "client"), body.keep_session)
        return {
            "id": uid, "email": email, "name": user.get("name", ""),
            "role": user.get("role", "client"),
            "must_change_password": user.get("must_change_password", False),
            "tutorial_seen": user.get("tutorial_seen", False), "token": token
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
        {"$set": {"password_hash": hash_password(body.new_password), "must_change_password": False}}
    )
    await log_audit("password_changed", user["_id"], user.get("name", ""), {})
    return {"message": "Contrasena actualizada correctamente"}


@api_router.put("/auth/tutorial-seen")
async def mark_tutorial_seen(user=Depends(get_current_user)):
    user_id = user["_id"]
    role = user.get("role", "")
    if role == "company":
        await db.companies.update_one({"_id": ObjectId(user_id)}, {"$set": {"tutorial_seen": True}})
    else:
        await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": {"tutorial_seen": True}})
    return {"message": "Tutorial marcado como visto"}


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
async def delete_document(doc_id: str, user=Depends(require_staff_or_admin)):
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
async def update_document_status(doc_id: str, body: DocumentStatusUpdate, background_tasks: BackgroundTasks, user=Depends(require_staff_or_admin)):
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
async def rename_document(doc_id: str, body: DocumentRenameInput, user=Depends(require_staff_or_admin)):
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
    user=Depends(require_staff_or_admin)
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
async def get_countries(user=Depends(require_staff_or_admin)):
    countries = await db.users.distinct("origin_country", {"role": "client", "origin_country": {"$ne": ""}})
    return sorted(countries)


@api_router.get("/clients/{client_id}")
async def get_client_detail(client_id: str, user=Depends(require_staff_or_admin)):
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
async def generate_ficha_pdf(client_id: str, user=Depends(require_staff_or_admin)):
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
async def impersonate_client(client_id: str, user=Depends(require_staff_or_admin)):
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
async def delete_client(client_id: str, user=Depends(require_staff_or_admin)):
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
    user=Depends(require_staff_or_admin)
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
async def download_all_documents(client_id: str, user=Depends(require_staff_or_admin)):
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
    user=Depends(require_staff_or_admin)
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
async def get_all_tramites_admin(user=Depends(require_staff_or_admin)):
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
async def create_custom_tramite(request: Request, user=Depends(require_staff_or_admin)):
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
async def delete_custom_tramite(tramite_id: str, user=Depends(require_staff_or_admin)):
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
async def edit_tramite(tramite_id: str, request: Request, user=Depends(require_staff_or_admin)):
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
async def send_email_to_client(client_id: str, body: SendEmailInput, background_tasks: BackgroundTasks, user=Depends(require_staff_or_admin)):
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



# --- PDF Compressor ---
@api_router.post("/compress-pdf")
async def compress_pdf(
    file: UploadFile = File(...),
    target_mb: float = Form(2.0),
    user=Depends(require_staff_or_admin)
):
    import pymupdf
    from PIL import Image

    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Solo se aceptan archivos PDF")

    content = await file.read()
    original_size = len(content)
    target_bytes = int(target_mb * 1024 * 1024)

    if original_size <= target_bytes:
        return StreamingResponse(
            io.BytesIO(content),
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="comprimido_{file.filename}"',
                      "X-Original-Size": str(original_size),
                      "X-Compressed-Size": str(original_size),
                      "X-Already-Small": "true"}
        )

    try:
        best_result = None

        for dpi in [150, 120, 100, 80, 60, 45]:
            for quality in [75, 50, 35, 20]:
                doc = pymupdf.open(stream=content, filetype="pdf")
                new_doc = pymupdf.open()

                for page in doc:
                    pix = page.get_pixmap(dpi=dpi)
                    img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)

                    img_buffer = io.BytesIO()
                    img.save(img_buffer, format="JPEG", quality=quality, optimize=True)
                    img_buffer.seek(0)

                    img_rect = pymupdf.Rect(0, 0, page.rect.width, page.rect.height)
                    new_page = new_doc.new_page(width=page.rect.width, height=page.rect.height)
                    new_page.insert_image(img_rect, stream=img_buffer.read())

                output = io.BytesIO()
                new_doc.save(output, garbage=4, deflate=True)
                new_doc.close()
                doc.close()

                compressed_size = output.tell()
                output.seek(0)

                if compressed_size <= target_bytes:
                    logger.info(f"PDF comprimido: {original_size} -> {compressed_size} bytes (dpi={dpi}, q={quality})")
                    return StreamingResponse(
                        output,
                        media_type="application/pdf",
                        headers={"Content-Disposition": f'attachment; filename="comprimido_{file.filename}"',
                                  "X-Original-Size": str(original_size),
                                  "X-Compressed-Size": str(compressed_size)}
                    )

                if best_result is None or compressed_size < best_result[0]:
                    best_result = (compressed_size, output)

        # Return best attempt even if over target
        if best_result:
            best_result[1].seek(0)
            logger.warning(f"PDF no alcanzo meta: {original_size} -> {best_result[0]} bytes (meta: {target_bytes})")
            return StreamingResponse(
                best_result[1],
                media_type="application/pdf",
                headers={"Content-Disposition": f'attachment; filename="comprimido_{file.filename}"',
                          "X-Original-Size": str(original_size),
                          "X-Compressed-Size": str(best_result[0]),
                          "X-Over-Target": "true"}
            )

        raise HTTPException(status_code=500, detail="No se pudo comprimir el PDF")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error comprimiendo PDF: {e}")
        raise HTTPException(status_code=500, detail=f"Error al comprimir: {str(e)}")


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


# --- Mailgun Settings ---
@api_router.get("/settings/mailgun")
async def get_mailgun_settings(user=Depends(require_admin)):
    s = await db.settings.find_one({"type": "mailgun"}, {"_id": 0})
    if not s:
        return {"type": "mailgun", "mailgun_domain": "", "mailgun_api_key": "", "mailgun_from_email": ""}
    if s.get("mailgun_api_key"):
        s["mailgun_api_key"] = "********"
    return s

@api_router.put("/settings/mailgun")
async def update_mailgun_settings(body: MailgunSettingsInput, user=Depends(require_admin)):
    doc = body.model_dump()
    doc["type"] = "mailgun"
    if doc["mailgun_api_key"] == "********":
        existing = await db.settings.find_one({"type": "mailgun"})
        if existing:
            doc["mailgun_api_key"] = existing.get("mailgun_api_key", "")
    await db.settings.update_one({"type": "mailgun"}, {"$set": doc}, upsert=True)
    return {"message": "Configuracion Mailgun actualizada"}


# --- Resend Settings ---
@api_router.get("/settings/resend")
async def get_resend_settings(user=Depends(require_admin)):
    s = await db.settings.find_one({"type": "resend"}, {"_id": 0})
    if not s:
        return {"type": "resend", "resend_api_key": "", "resend_from_email": ""}
    if s.get("resend_api_key"):
        s["resend_api_key"] = "********"
    return s

@api_router.put("/settings/resend")
async def update_resend_settings(body: ResendSettingsInput, user=Depends(require_admin)):
    doc = body.model_dump()
    doc["type"] = "resend"
    if doc["resend_api_key"] == "********":
        existing = await db.settings.find_one({"type": "resend"})
        if existing:
            doc["resend_api_key"] = existing.get("resend_api_key", "")
    await db.settings.update_one({"type": "resend"}, {"$set": doc}, upsert=True)
    await log_audit("resend_updated", user["_id"], user.get("name", ""), {"from": doc["resend_from_email"]})
    return {"message": "Configuracion Resend actualizada"}


# --- Company Info Settings ---
@api_router.get("/settings/company-info")
async def get_company_info(user=Depends(require_admin)):
    s = await db.settings.find_one({"type": "company_info"}, {"_id": 0})
    if not s:
        return {"type": "company_info", "company_name": "Tramilex", "company_email": "info@tramilex.es",
                "phone_spain": "", "phone_chile": "", "phone_mexico": "", "phone_peru": "",
                "iban": "", "bank_name_eu": "", "cuenta_chile": "", "bank_name_chile": "", "extra_payment_info": ""}
    return s

@api_router.put("/settings/company-info")
async def update_company_info(body: CompanyInfoSettingsInput, user=Depends(require_admin)):
    doc = body.model_dump()
    doc["type"] = "company_info"
    await db.settings.update_one({"type": "company_info"}, {"$set": doc}, upsert=True)
    return {"message": "Datos de empresa actualizados"}


# --- Presupuestos (Quotes/Budgets) ---
@api_router.get("/presupuestos/next-number")
async def get_next_presupuesto_number(user=Depends(require_staff_or_admin)):
    last = await db.presupuestos.find_one(sort=[("number", -1)])
    next_num = (last["number"] + 1) if last else 1453
    return {"next_number": next_num}


@api_router.post("/presupuestos")
async def create_presupuesto(body: PresupuestoCreateInput, user=Depends(require_staff_or_admin)):
    if not body.recipient_name or not body.items:
        raise HTTPException(status_code=400, detail="Nombre destinatario e items son obligatorios")

    last = await db.presupuestos.find_one(sort=[("number", -1)])
    number = (last["number"] + 1) if last else 1453

    subtotal = sum(item.get("amount", 0) * item.get("quantity", 1) for item in body.items)
    iva_amount = subtotal * (body.iva_rate / 100) if body.iva_rate > 0 else 0
    total = subtotal + iva_amount

    doc = {
        "number": number,
        "recipient_name": body.recipient_name,
        "recipient_company": body.recipient_company,
        "recipient_email": body.recipient_email,
        "recipient_address": body.recipient_address,
        "recipient_nif": body.recipient_nif,
        "items": body.items,
        "subtotal": round(subtotal, 2),
        "iva_rate": body.iva_rate,
        "iva_amount": round(iva_amount, 2),
        "total": round(total, 2),
        "notes": body.notes,
        "payment_method": body.payment_method,
        "status": "emitido",
        "created_by": user["_id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "valid_until": (datetime.now(timezone.utc) + timedelta(days=15)).strftime("%Y-%m-%d"),
    }
    result = await db.presupuestos.insert_one(doc)
    return {"id": str(result.inserted_id), "number": number, "total": total}


@api_router.get("/presupuestos")
async def list_presupuestos(user=Depends(require_staff_or_admin)):
    records = []
    async for p in db.presupuestos.find().sort("number", -1):
        records.append({
            "id": str(p["_id"]),
            "number": p["number"],
            "recipient_name": p.get("recipient_name", ""),
            "recipient_company": p.get("recipient_company", ""),
            "recipient_email": p.get("recipient_email", ""),
            "subtotal": p.get("subtotal", 0),
            "iva_rate": p.get("iva_rate", 0),
            "iva_amount": p.get("iva_amount", 0),
            "total": p.get("total", 0),
            "status": p.get("status", "emitido"),
            "created_at": p.get("created_at", ""),
            "valid_until": p.get("valid_until", ""),
        })
    return records


@api_router.get("/presupuestos/{pid}")
async def get_presupuesto(pid: str, user=Depends(require_staff_or_admin)):
    p = await db.presupuestos.find_one({"_id": ObjectId(pid)})
    if not p:
        raise HTTPException(status_code=404, detail="Presupuesto no encontrado")
    p["id"] = str(p.pop("_id"))
    return p


@api_router.delete("/presupuestos/{pid}")
async def delete_presupuesto(pid: str, user=Depends(require_staff_or_admin)):
    result = await db.presupuestos.delete_one({"_id": ObjectId(pid)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Presupuesto no encontrado")
    return {"message": "Presupuesto eliminado"}


@api_router.get("/presupuestos/{pid}/pdf")
async def generate_presupuesto_pdf(pid: str, user=Depends(require_staff_or_admin)):
    p = await db.presupuestos.find_one({"_id": ObjectId(pid)})
    if not p:
        raise HTTPException(status_code=404, detail="Presupuesto no encontrado")

    company = await db.settings.find_one({"type": "company_info"})
    if not company:
        company = {}

    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.lib.units import mm
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image as RLImage
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=15*mm, bottomMargin=20*mm, leftMargin=20*mm, rightMargin=20*mm)
    styles = getSampleStyleSheet()

    title_style = ParagraphStyle('Title2', parent=styles['Normal'], fontSize=20, fontName='Helvetica-Bold', textColor=colors.HexColor('#0f172a'), spaceAfter=8*mm, leading=24)
    subtitle_style = ParagraphStyle('Sub', parent=styles['Normal'], fontSize=9, textColor=colors.HexColor('#64748b'), spaceAfter=1*mm, leading=12)
    normal_style = ParagraphStyle('Norm', parent=styles['Normal'], fontSize=9, textColor=colors.HexColor('#334155'), leading=13)
    bold_style = ParagraphStyle('Bold', parent=styles['Normal'], fontSize=9, fontName='Helvetica-Bold', textColor=colors.HexColor('#0f172a'), leading=13)
    small_style = ParagraphStyle('Small', parent=styles['Normal'], fontSize=8, textColor=colors.HexColor('#94a3b8'), leading=11)
    right_style = ParagraphStyle('Right', parent=styles['Normal'], fontSize=9, textColor=colors.HexColor('#334155'), alignment=TA_RIGHT)

    elements = []

    # Header with logo
    try:
        import urllib.request
        logo_path = "/tmp/tramilex_logo.png"
        urllib.request.urlretrieve("https://tramilex.es/logo.png", logo_path)
        logo = RLImage(logo_path, width=50*mm, height=28*mm)
        logo.hAlign = 'LEFT'
        elements.append(logo)
    except Exception:
        elements.append(Paragraph("TRAMILEX", title_style))

    elements.append(Spacer(1, 3*mm))

    # Company info
    co_name = company.get("company_name", "Tramilex")
    co_email = company.get("company_email", "info@tramilex.es")
    phones = []
    if company.get("phone_spain"): phones.append(f"Espana: {company['phone_spain']}")
    if company.get("phone_chile"): phones.append(f"Chile: {company['phone_chile']}")
    if company.get("phone_mexico"): phones.append(f"Mexico: {company['phone_mexico']}")
    if company.get("phone_peru"): phones.append(f"Peru: {company['phone_peru']}")
    phones_str = " | ".join(phones) if phones else ""

    elements.append(Paragraph(f"<b>{co_name}</b> | {co_email}", normal_style))
    if phones_str:
        elements.append(Paragraph(phones_str, small_style))
    elements.append(Spacer(1, 6*mm))

    # Presupuesto header
    created_date = datetime.fromisoformat(p['created_at']).strftime('%d/%m/%Y')
    valid_date = p.get('valid_until', '')
    try:
        valid_date_fmt = datetime.strptime(valid_date, '%Y-%m-%d').strftime('%d/%m/%Y')
    except Exception:
        valid_date_fmt = valid_date

    elements.append(Paragraph(f"PRESUPUESTO N. {p['number']}", title_style))
    elements.append(Paragraph(f"Fecha: {created_date}  |  Validez: 15 dias (hasta {valid_date_fmt})", subtitle_style))
    elements.append(Spacer(1, 5*mm))

    # Recipient
    elements.append(Paragraph("<b>DATOS DEL DESTINATARIO</b>", bold_style))
    elements.append(Spacer(1, 2*mm))
    recipient_lines = [p.get("recipient_name", "")]
    if p.get("recipient_company"): recipient_lines.append(p["recipient_company"])
    if p.get("recipient_nif"): recipient_lines.append(f"NIF/CIF: {p['recipient_nif']}")
    if p.get("recipient_address"): recipient_lines.append(p["recipient_address"])
    if p.get("recipient_email"): recipient_lines.append(p["recipient_email"])
    elements.append(Paragraph("<br/>".join(recipient_lines), normal_style))
    elements.append(Spacer(1, 6*mm))

    # Items table
    header_data = [
        Paragraph("<b>Concepto</b>", ParagraphStyle('th', fontSize=9, fontName='Helvetica-Bold', textColor=colors.white)),
        Paragraph("<b>Cant.</b>", ParagraphStyle('th', fontSize=9, fontName='Helvetica-Bold', textColor=colors.white, alignment=TA_CENTER)),
        Paragraph("<b>Precio</b>", ParagraphStyle('th', fontSize=9, fontName='Helvetica-Bold', textColor=colors.white, alignment=TA_RIGHT)),
        Paragraph("<b>Total</b>", ParagraphStyle('th', fontSize=9, fontName='Helvetica-Bold', textColor=colors.white, alignment=TA_RIGHT)),
    ]
    table_data = [header_data]
    for item in p.get("items", []):
        qty = item.get("quantity", 1)
        amt = item.get("amount", 0)
        table_data.append([
            Paragraph(item.get("concept", ""), normal_style),
            Paragraph(str(qty), ParagraphStyle('c', fontSize=9, alignment=TA_CENTER, textColor=colors.HexColor('#334155'))),
            Paragraph(f"{amt:,.2f} EUR", right_style),
            Paragraph(f"{qty * amt:,.2f} EUR", right_style),
        ])

    col_widths = [90*mm, 18*mm, 30*mm, 30*mm]
    t = Table(table_data, colWidths=col_widths, repeatRows=1)
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#0f172a')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 9),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
        ('TOPPADDING', (0, 0), (-1, 0), 8),
        ('BACKGROUND', (0, 1), (-1, -1), colors.white),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8fafc')]),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e2e8f0')),
        ('TOPPADDING', (0, 1), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 1), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    elements.append(t)
    elements.append(Spacer(1, 4*mm))

    # Totals
    totals_data = [
        ["Subtotal", f"{p.get('subtotal', 0):,.2f} EUR"],
    ]
    if p.get("iva_rate", 0) > 0:
        totals_data.append([f"IVA ({p['iva_rate']:.0f}%)", f"{p.get('iva_amount', 0):,.2f} EUR"])
    totals_data.append(["TOTAL", f"{p.get('total', 0):,.2f} EUR"])

    tt = Table(totals_data, colWidths=[130*mm, 38*mm])
    tt.setStyle(TableStyle([
        ('ALIGN', (0, 0), (0, -1), 'RIGHT'),
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('TEXTCOLOR', (0, 0), (-1, -2), colors.HexColor('#334155')),
        ('TEXTCOLOR', (0, -1), (-1, -1), colors.HexColor('#0f172a')),
        ('FONTSIZE', (0, -1), (-1, -1), 12),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LINEABOVE', (0, -1), (-1, -1), 1, colors.HexColor('#0f172a')),
    ]))
    elements.append(tt)
    elements.append(Spacer(1, 8*mm))

    # Payment info
    elements.append(Paragraph("<b>DATOS DE PAGO</b>", bold_style))
    elements.append(Spacer(1, 2*mm))
    pay_lines = []
    if p.get("payment_method"): pay_lines.append(f"Metodo: {p['payment_method']}")
    if company.get("iban"): pay_lines.append(f"IBAN: {company['iban']}")
    if company.get("bank_name_eu"): pay_lines.append(f"Banco: {company['bank_name_eu']}")
    if company.get("cuenta_chile"): pay_lines.append(f"Cuenta Chile: {company['cuenta_chile']}")
    if company.get("bank_name_chile"): pay_lines.append(f"Banco Chile: {company['bank_name_chile']}")
    if company.get("extra_payment_info"): pay_lines.append(company['extra_payment_info'])
    if pay_lines:
        elements.append(Paragraph("<br/>".join(pay_lines), normal_style))
    else:
        elements.append(Paragraph("Consultar datos de pago con Tramilex", normal_style))
    elements.append(Spacer(1, 6*mm))

    # Notes
    if p.get("notes"):
        elements.append(Paragraph("<b>OBSERVACIONES</b>", bold_style))
        elements.append(Spacer(1, 2*mm))
        elements.append(Paragraph(p["notes"], normal_style))
        elements.append(Spacer(1, 6*mm))

    # Validity notice
    elements.append(Spacer(1, 4*mm))
    valid_until_str = p.get('valid_until', '')
    try:
        valid_until_fmt = datetime.strptime(valid_until_str, '%Y-%m-%d').strftime('%d/%m/%Y')
    except Exception:
        valid_until_fmt = valid_until_str
    elements.append(Paragraph(f"Este presupuesto tiene una validez de 15 dias a partir de su fecha de emision ({valid_until_fmt}).", small_style))
    elements.append(Paragraph(f"{co_name} - {co_email}", small_style))

    doc.build(elements)
    buffer.seek(0)
    filename = f"Presupuesto_{p['number']}.pdf"
    return StreamingResponse(buffer, media_type="application/pdf",
                             headers={"Content-Disposition": f'attachment; filename="{filename}"'})


# --- Appointment Reminder (called periodically) ---
@api_router.post("/citas/send-reminders")
async def send_appointment_reminders(user=Depends(require_staff_or_admin)):
    now = datetime.now(timezone.utc)
    tomorrow = now + timedelta(hours=24)
    tomorrow_date = tomorrow.strftime("%Y-%m-%d")

    appointments_tomorrow = await db.appointments.find({
        "date": tomorrow_date,
        "status": "confirmed",
        "reminder_sent": {"$ne": True}
    }).to_list(100)

    sent = 0
    for appt in appointments_tomorrow:
        _send_appointment_reminder(appt)
        await db.appointments.update_one({"_id": appt["_id"]}, {"$set": {"reminder_sent": True}})
        sent += 1

    return {"message": f"{sent} recordatorios enviados"}


def _send_appointment_reminder(appt):
    try:
        date_str = appt.get("date", "")
        time_str = appt.get("time", "")
        name = f"{appt.get('first_name', '')} {appt.get('last_name', '')}"
        office = f"{appt.get('office', '')}, {appt.get('office_detail', '')}"

        reminder_body = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #0f172a;">Recordatorio de Cita</h2>
            <p>Hola <strong>{name}</strong>,</p>
            <p>Le recordamos que tiene una cita programada para manana:</p>
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 16px 0;">
                <p style="margin: 4px 0;"><strong>Fecha:</strong> {date_str}</p>
                <p style="margin: 4px 0;"><strong>Hora:</strong> {time_str}</p>
                <p style="margin: 4px 0;"><strong>Duracion:</strong> 45 minutos</p>
                <p style="margin: 4px 0;"><strong>Lugar:</strong> {office}</p>
            </div>
            <p>Por favor, recuerde llegar puntualmente y traer toda la documentacion necesaria.</p>
            <p style="margin-top: 24px;">Un cordial saludo,<br><strong>El equipo de Tramilex</strong></p>
        </div>
        """
        _send_email(appt["email"], "Recordatorio de Cita - Tramilex", reminder_body)

        # Also send to admin
        notify = _get_notify_email()
        if notify:
            admin_body = f"""
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #0f172a;">Recordatorio - Cita Manana</h2>
                <p>Tiene una cita programada para manana con:</p>
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 16px 0;">
                    <p style="margin: 4px 0;"><strong>Cliente:</strong> {name}</p>
                    <p style="margin: 4px 0;"><strong>Email:</strong> {appt.get('email', '')}</p>
                    <p style="margin: 4px 0;"><strong>Telefono:</strong> {appt.get('phone', '')}</p>
                    <p style="margin: 4px 0;"><strong>Fecha:</strong> {date_str}</p>
                    <p style="margin: 4px 0;"><strong>Hora:</strong> {time_str}</p>
                    <p style="margin: 4px 0;"><strong>Lugar:</strong> {office}</p>
                </div>
            </div>
            """
            _send_email(notify, f"Recordatorio - Cita manana con {name}", admin_body)

        logger.info(f"Reminder sent for appointment {appt.get('date')} {appt.get('time')} - {name}")
    except Exception as e:
        logger.error(f"Error sending reminder: {e}")


# --- Email notification (background task) ---
def send_upload_notification(user_data: dict, filename: str):
    try:
        notify = _get_notify_email()
        if not notify:
            return
        body = f"""
        <h2>Nuevo documento subido</h2>
        <p><strong>{user_data.get('name', 'Cliente')}</strong>
        (Pasaporte: {user_data.get('passport_number', 'N/A')},
        NIE: {user_data.get('nie', 'N/A')}) ha cargado un nuevo documento.</p>
        <p><strong>Archivo:</strong> {filename}</p>
        <p><strong>Fecha:</strong> {datetime.now(timezone.utc).strftime('%d/%m/%Y %H:%M UTC')}</p>
        """
        _send_email(notify, f"Nuevo documento - {user_data.get('name', 'Cliente')}", body)
    except Exception as e:
        logger.error(f"Error enviando notificacion: {e}")


# --- Client notification (when admin uploads) ---
def send_client_notification(client_email: str, client_name: str, filename: str, category: str):
    try:
        if not client_email:
            return
        category_labels = {
            "identificacion": "Identificacion", "residencia": "Residencia",
            "trabajo": "Trabajo", "resolucion": "Resolucion",
            "contrato": "Contrato", "fiscal": "Fiscal", "otros": "Otros"
        }
        body = f"""
        <h2>Nuevo documento disponible</h2>
        <p>Hola <strong>{client_name}</strong>,</p>
        <p>Tu abogado ha subido un nuevo documento a tu expediente que requiere tu revision.</p>
        <p><strong>Archivo:</strong> {filename}</p>
        <p><strong>Categoria:</strong> {category_labels.get(category, category)}</p>
        <p><strong>Fecha:</strong> {datetime.now(timezone.utc).strftime('%d/%m/%Y %H:%M UTC')}</p>
        <br><p>Ingresa a tu cuenta de Tramilex para revisar y descargar el documento.</p>
        <br><p>Saludos,<br>Equipo Tramilex</p>
        """
        _send_email(client_email, "Tramilex - Nuevo documento en tu expediente", body)
    except Exception as e:
        logger.error(f"Error enviando notificacion al cliente: {e}")


# --- Status change notification to client ---
def send_status_notification(client_email: str, client_name: str, filename: str, new_status: str):
    try:
        if not client_email:
            return
        status_label = "Revisado" if new_status == "reviewed" else "Pendiente de revision"
        body = f"""
        <h2>Documento revisado</h2>
        <p>Hola <strong>{client_name}</strong>,</p>
        <p>Tu abogado ha cambiado el estado de tu documento:</p>
        <p><strong>Archivo:</strong> {filename}</p>
        <p><strong>Nuevo estado:</strong> {status_label}</p>
        <p><strong>Fecha:</strong> {datetime.now(timezone.utc).strftime('%d/%m/%Y %H:%M UTC')}</p>
        <br><p>Ingresa a tu cuenta de Tramilex para mas detalles.</p>
        <br><p>Saludos,<br>Equipo Tramilex</p>
        """
        _send_email(client_email, "Tramilex - Tu documento ha sido revisado", body)
    except Exception as e:
        logger.error(f"Error enviando notificacion de estado: {e}")


# --- Admin email to client ---
def send_admin_email_to_client(client_email: str, client_name: str, message: str):
    try:
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
        _send_email(client_email, "Nueva notificacion de Tramilex", body)
    except Exception as e:
        logger.error(f"Error enviando email al cliente: {e}")


# --- Company credentials email (background task) ---
def send_company_credentials_email(to_email: str, company_name: str, cif_nif: str, password: str):
    try:
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
        return _send_email(to_email, f"Tramilex - Credenciales de acceso para {company_name}", body)
    except Exception as e:
        logger.error(f"Error enviando credenciales: {e}")
        return False


# ============================
# --- Company Routes (Admin) ---
# ============================

@api_router.post("/companies")
async def create_company(body: CompanyCreateInput, user=Depends(require_staff_or_admin)):
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
async def list_companies(user=Depends(require_staff_or_admin)):
    companies = []
    async for c in db.companies.find().sort("created_at", -1):
        worker_count = await db.company_workers.count_documents({"company_id": str(c["_id"])})
        tramite_count = await db.company_tramites.count_documents({"company_id": str(c["_id"])})
        # Get tramite countries
        tramite_countries = set()
        async for t in db.company_tramites.find({"company_id": str(c["_id"])}):
            if t.get("country"):
                tramite_countries.add(t["country"])
        companies.append({
            "id": str(c["_id"]),
            "name": c.get("name", ""),
            "cif_nif": c.get("cif_nif", ""),
            "email": c.get("email", ""),
            "phone": c.get("phone", ""),
            "contact_person": c.get("contact_person", ""),
            "worker_count": worker_count,
            "tramite_count": tramite_count,
            "tramite_countries": list(tramite_countries),
            "created_at": c.get("created_at", "")
        })
    return companies


@api_router.get("/companies/{company_id}")
async def get_company(company_id: str, user=Depends(require_staff_or_admin)):
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
async def update_company(company_id: str, body: CompanyUpdateInput, user=Depends(require_staff_or_admin)):
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
async def delete_company(company_id: str, user=Depends(require_staff_or_admin)):
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
async def update_company_doc_status(doc_id: str, body: DocumentStatusUpdate, user=Depends(require_staff_or_admin)):
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
async def delete_company_document(doc_id: str, user=Depends(require_staff_or_admin)):
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
async def download_all_worker_documents(company_id: str, worker_id: str, user=Depends(require_staff_or_admin)):
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
async def assign_company_tramite(company_id: str, body: CompanyTramiteInput, user=Depends(require_staff_or_admin)):
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
async def update_company_tramite(company_id: str, tramite_id: str, body: CompanyTramiteUpdateInput, user=Depends(require_staff_or_admin)):
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
async def delete_company_tramite(company_id: str, tramite_id: str, user=Depends(require_staff_or_admin)):
    try:
        result = await db.company_tramites.delete_one({"_id": ObjectId(tramite_id), "company_id": company_id})
    except Exception:
        raise HTTPException(status_code=404, detail="Tramite no encontrado")
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Tramite no encontrado")
    return {"message": "Tramite eliminado"}


# --- Company Credentials & Email ---
@api_router.post("/companies/{company_id}/send-credentials")
async def send_credentials(company_id: str, body: CompanySendCredentialsInput, background_tasks: BackgroundTasks, user=Depends(require_staff_or_admin)):
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
async def resend_company_email(company_id: str, email_id: str, background_tasks: BackgroundTasks, user=Depends(require_staff_or_admin)):
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
    user=Depends(require_staff_or_admin)
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
async def delete_sign_request(doc_id: str, user=Depends(require_staff_or_admin)):
    result = await db.sign_requests.update_one(
        {"_id": ObjectId(doc_id)}, {"$set": {"is_deleted": True}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    return {"message": "Documento eliminado"}


# --- Company panel: tramite requirements ---
@api_router.get("/company/tramite-requirements")
async def company_tramite_requirements(user=Depends(require_company)):
    company_id = user["_id"]
    result = []
    async for t in db.company_tramites.find({"company_id": company_id}).sort("created_at", -1):
        tramite_info = get_tramite_docs(t.get("country", ""), t.get("tramite_id", ""))
        if tramite_info:
            result.append({
                "tramite_id": t.get("tramite_id", ""),
                "tramite_name": tramite_info.get("name", t.get("tramite_id", "")),
                "country": t.get("country", ""),
                "status": t.get("status", "pendiente"),
                "requirements": tramite_info.get("requirements", []),
                "docs_persona": tramite_info.get("docs_persona", []),
                "docs_empresa": tramite_info.get("docs_empresa", []),
                "required_docs": tramite_info.get("required_docs", [])
            })
    return result


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
async def get_all_signed_documents(user=Depends(require_staff_or_admin)):
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


# --- Task email notification ---
def send_task_email(to_email, to_name, task_title, from_name, priority, description):
    try:
        priority_colors = {"alta": "#ef4444", "media": "#f59e0b", "baja": "#94a3b8"}
        color = priority_colors.get(priority, "#94a3b8")
        body = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #0f172a;">Te han asignado una tarea</h2>
            <p>Hola {to_name},</p>
            <p><strong>{from_name}</strong> te ha asignado una nueva tarea:</p>
            <div style="background: #f8fafc; border-left: 4px solid {color}; padding: 16px; margin: 16px 0; border-radius: 4px;">
                <p style="margin: 0 0 8px 0; font-size: 18px; font-weight: bold;">{task_title}</p>
                <p style="margin: 0 0 4px 0;">Prioridad: <span style="color: {color}; font-weight: bold;">{priority.upper()}</span></p>
                {f'<p style="margin: 8px 0 0 0; color: #64748b;">{description}</p>' if description else ''}
            </div>
            <p>Accede a la plataforma para ver los detalles: <a href="https://tramilex.goroky.es/admin/tareas">Ver tareas</a></p>
        </div>
        """
        _send_email(to_email, f"Tramilex - Nueva tarea asignada: {task_title}", body)
    except Exception as e:
        logger.error(f"Error enviando email de tarea: {e}")


def send_welcome_email(to_email, name):
    try:
        body = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #0f172a;">Bienvenido a Tramilex!</h2>
            <p>Hola <strong>{name}</strong>,</p>
            <p>Gracias por registrarte en Tramilex, tu plataforma de gestion documental para tramites de inmigracion.</p>
            <p>Desde tu panel podras:</p>
            <ul>
                <li>Subir los documentos requeridos para tu tramite</li>
                <li>Ver el estado de revision de tus documentos</li>
                <li>Comunicarte con tu abogado</li>
            </ul>
            <p>Accede a tu cuenta en: <a href="https://tramilex.goroky.es/login" style="color: #0369a1;">tramilex.goroky.es</a></p>
            <p style="margin-top: 24px;">Un cordial saludo,<br><strong>El equipo de Tramilex</strong></p>
        </div>
        """
        _send_email(to_email, "Bienvenido a Tramilex", body)
    except Exception as e:
        logger.error(f"Error enviando welcome email: {e}")


def _send_staff_welcome_email(to_email, name, temp_password):
    try:
        body = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #0f172a;">Bienvenido al equipo Tramilex!</h2>
            <p>Hola <strong>{name}</strong>,</p>
            <p>Ya estas habilitado para operar en el portal Tramilex. Tu cuenta ha sido creada exitosamente.</p>
            <p>Tus credenciales de acceso son:</p>
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 16px 0;">
                <p style="margin: 4px 0;"><strong>Email:</strong> {to_email}</p>
                <p style="margin: 4px 0;"><strong>Contrasena temporal:</strong> {temp_password}</p>
            </div>
            <p><strong>Importante:</strong> Al iniciar sesion por primera vez, el sistema te pedira cambiar tu contrasena por seguridad.</p>
            <div style="text-align: center; margin: 24px 0;">
                <a href="https://www.tramilex.es" style="display: inline-block; background: #0f172a; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px;">Portal</a>
            </div>
            <p style="margin-top: 24px;">Un cordial saludo,<br><strong>El equipo de Tramilex</strong></p>
        </div>
        """
        _send_email(to_email, "Bienvenido al equipo Tramilex", body)
    except Exception as e:
        logger.error(f"Error enviando staff welcome email: {e}")


# ============================
# --- Staff Management (Admin only) ---
# ============================

@api_router.post("/staff")
async def create_staff(body: StaffCreateInput, background_tasks: BackgroundTasks, user=Depends(require_admin)):
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
        "must_change_password": True,
        "tutorial_seen": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    result = await db.users.insert_one(user_doc)

    # Send welcome email in background
    background_tasks.add_task(_send_staff_welcome_email, email, body.name.strip(), body.password)

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
async def create_task(body: TaskCreateInput, background_tasks: BackgroundTasks, user=Depends(require_staff_or_admin)):
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

    # Send email notification
    assigned_email = assigned.get("email", "")
    if assigned_email:
        background_tasks.add_task(
            send_task_email, assigned_email, assigned.get("name", ""),
            body.title.strip(), user.get("name", ""), body.priority, body.description
        )

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


# ============================
# --- Email Inbox (Microsoft Graph) ---
# ============================

def get_ms_graph_token():
    import requests as req
    try:
        client_id = os.environ.get("MS_CLIENT_ID", "")
        tenant_id = os.environ.get("MS_TENANT_ID", "")
        client_secret = os.environ.get("MS_CLIENT_SECRET", "")
        if not client_id or not tenant_id or not client_secret:
            return None
        url = f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"
        data = {
            "client_id": client_id,
            "client_secret": client_secret,
            "scope": "https://graph.microsoft.com/.default",
            "grant_type": "client_credentials",
        }
        r = req.post(url, data=data, timeout=10)
        if r.status_code == 200:
            return r.json().get("access_token")
        logger.error(f"MS Graph token error: {r.status_code} {r.text[:200]}")
        return None
    except Exception as e:
        logger.error(f"MS Graph token error: {e}")
        return None


def fetch_outlook_emails(limit=30):
    import requests as req
    token = get_ms_graph_token()
    if not token:
        return []
    ms_email = os.environ.get("MS_EMAIL", "")
    headers = {"Authorization": f"Bearer {token}"}
    try:
        url = f"https://graph.microsoft.com/v1.0/users/{ms_email}/messages?$top={limit}&$select=id,subject,from,receivedDateTime,hasAttachments,bodyPreview,body&$orderby=receivedDateTime desc"
        r = req.get(url, headers=headers)
        if r.status_code != 200:
            logger.error(f"Graph API error: {r.status_code} {r.text[:200]}")
            return []
        data = r.json()
        emails = []
        for m in data.get("value", []):
            from_info = m.get("from", {}).get("emailAddress", {})
            from_str = f"{from_info.get('name', '')} <{from_info.get('address', '')}>"
            body_content = m.get("body", {}).get("content", "")
            if len(body_content) > 3000:
                body_content = body_content[:3000] + "..."

            attachments = []
            if m.get("hasAttachments"):
                att_url = f"https://graph.microsoft.com/v1.0/users/{ms_email}/messages/{m['id']}/attachments?$select=id,name,contentType,size"
                att_r = req.get(att_url, headers=headers)
                if att_r.status_code == 200:
                    for a in att_r.json().get("value", []):
                        attachments.append({
                            "id": a.get("id", ""),
                            "filename": a.get("name", ""),
                            "content_type": a.get("contentType", ""),
                            "size": a.get("size", 0)
                        })

            emails.append({
                "id": m.get("id", ""),
                "subject": m.get("subject", "(Sin asunto)"),
                "from": from_str,
                "date": m.get("receivedDateTime", ""),
                "body": body_content,
                "body_type": m.get("body", {}).get("contentType", "text"),
                "attachments": attachments,
                "has_attachments": m.get("hasAttachments", False)
            })
        return emails
    except Exception as e:
        logger.error(f"Graph API fetch error: {e}")
        return []


@api_router.get("/inbox")
async def get_inbox(user=Depends(require_staff_or_admin)):
    import asyncio
    loop = asyncio.get_event_loop()
    emails = await loop.run_in_executor(None, fetch_outlook_emails)
    return emails


@api_router.get("/inbox/attachment/{msg_id}/{attachment_id}")
async def download_inbox_attachment(msg_id: str, attachment_id: str, user=Depends(require_staff_or_admin)):
    import requests as req
    token = get_ms_graph_token()
    if not token:
        raise HTTPException(status_code=500, detail="No se pudo conectar a Outlook")
    ms_email = os.environ.get("MS_EMAIL", "")
    headers = {"Authorization": f"Bearer {token}"}
    url = f"https://graph.microsoft.com/v1.0/users/{ms_email}/messages/{msg_id}/attachments/{attachment_id}"
    r = req.get(url, headers=headers)
    if r.status_code != 200:
        raise HTTPException(status_code=404, detail="Adjunto no encontrado")
    att = r.json()
    import base64
    content = base64.b64decode(att.get("contentBytes", ""))
    filename = att.get("name", "attachment")
    ct = att.get("contentType", "application/octet-stream")
    return FastAPIResponse(content=content, media_type=ct, headers={
        "Content-Disposition": f'attachment; filename="{filename}"'
    })


# --- Forward inbox email to platform user ---
class ForwardEmailInput(BaseModel):
    msg_id: str
    to_user_id: str
    to_user_type: str = "client"
    note: str = ""


@api_router.post("/inbox/forward")
async def forward_inbox_email(body: ForwardEmailInput, background_tasks: BackgroundTasks, user=Depends(require_staff_or_admin)):
    import requests as req

    token = get_ms_graph_token()
    if not token:
        raise HTTPException(status_code=500, detail="No se pudo conectar a Outlook")

    ms_email = os.environ.get("MS_EMAIL", "")
    headers = {"Authorization": f"Bearer {token}"}

    # Get original email
    url = f"https://graph.microsoft.com/v1.0/users/{ms_email}/messages/{body.msg_id}?$select=subject,from,body,receivedDateTime"
    r = req.get(url, headers=headers)
    if r.status_code != 200:
        raise HTTPException(status_code=404, detail="Email no encontrado")
    email_data = r.json()

    # Find recipient
    to_email = ""
    to_name = ""
    if body.to_user_type == "client":
        u = await db.users.find_one({"_id": ObjectId(body.to_user_id)})
        if u:
            to_email = u.get("email", "")
            to_name = u.get("name", "")
    elif body.to_user_type == "staff":
        u = await db.users.find_one({"_id": ObjectId(body.to_user_id), "role": {"$in": ["admin", "staff"]}})
        if u:
            to_email = u.get("email", "")
            to_name = u.get("name", "")
    elif body.to_user_type == "company":
        c = await db.companies.find_one({"_id": ObjectId(body.to_user_id)})
        if c:
            to_email = c.get("email", "")
            to_name = c.get("name", "")

    if not to_email:
        raise HTTPException(status_code=400, detail="Destinatario no encontrado o sin email")

    subject = email_data.get("subject", "Sin asunto")
    original_body = email_data.get("body", {}).get("content", "")
    from_info = email_data.get("from", {}).get("emailAddress", {})

    def do_forward():
        try:
            import pymongo
            sync_client = pymongo.MongoClient(os.environ['MONGO_URL'])
            sync_db = sync_client[os.environ['DB_NAME']]
            settings = sync_db.settings.find_one({"type": "smtp"})
            sync_client.close()
            if not settings or not settings.get("smtp_host"):
                return
            msg = MIMEMultipart()
            msg["From"] = settings["from_email"]
            msg["To"] = to_email
            msg["Subject"] = f"FW: {subject}"
            note_html = f"<p style='background:#f0f9ff;padding:12px;border-radius:8px;color:#0369a1;'><strong>Nota de {user.get('name','')}:</strong> {body.note}</p><hr>" if body.note else ""
            html = f"""
            <div style="font-family: Arial, sans-serif;">
                {note_html}
                <p style="color:#64748b;font-size:12px;">--- Mensaje reenviado ---<br>
                De: {from_info.get('name','')} &lt;{from_info.get('address','')}&gt;<br>
                Asunto: {subject}</p>
                {original_body}
            </div>"""
            msg.attach(MIMEText(html, "html"))
            server = smtplib.SMTP(settings["smtp_host"], settings["smtp_port"])
            server.starttls()
            server.login(settings["smtp_user"], settings["smtp_password"])
            server.send_message(msg)
            server.quit()
        except Exception as e:
            logger.error(f"Error reenviando email: {e}")

    background_tasks.add_task(do_forward)

    await log_audit("email_forwarded", user["_id"], user.get("name", ""),
                    {"subject": subject, "to": to_email, "to_name": to_name})
    return {"message": f"Email reenviado a {to_name} ({to_email})"}


@api_router.get("/inbox/forward-recipients")
async def get_forward_recipients(user=Depends(require_staff_or_admin)):
    recipients = []
    async for u in db.users.find({"role": {"$in": ["client"]}, "email": {"$ne": ""}}).sort("name", 1):
        recipients.append({"id": str(u["_id"]), "name": u.get("name", ""), "email": u.get("email", ""), "type": "client"})
    async for u in db.users.find({"role": {"$in": ["admin", "staff"]}, "email": {"$ne": ""}}).sort("name", 1):
        recipients.append({"id": str(u["_id"]), "name": u.get("name", ""), "email": u.get("email", ""), "type": "staff", "position": u.get("position", "")})
    async for c in db.companies.find({"email": {"$ne": ""}}).sort("name", 1):
        recipients.append({"id": str(c["_id"]), "name": c.get("name", ""), "email": c.get("email", ""), "type": "company", "cif_nif": c.get("cif_nif", "")})
    return recipients


# ============================
# --- Billing / Contabilidad ---
# ============================

@api_router.post("/billing")
async def create_billing(body: BillingCreateInput, user=Depends(require_staff_or_admin)):
    if body.client_type not in ["client", "company"]:
        raise HTTPException(status_code=400, detail="Tipo de cliente invalido")

    client_name = ""
    client_email = ""
    if body.client_type == "client":
        c = await db.users.find_one({"_id": ObjectId(body.client_id)})
        if not c: raise HTTPException(status_code=404, detail="Cliente no encontrado")
        client_name = c.get("name", "")
        client_email = c.get("email", "")
    else:
        c = await db.companies.find_one({"_id": ObjectId(body.client_id)})
        if not c: raise HTTPException(status_code=404, detail="Empresa no encontrada")
        client_name = c.get("name", "")
        client_email = c.get("email", "")

    total = body.amount + (body.extra_per_worker * body.worker_count)

    billing_doc = {
        "client_type": body.client_type,
        "client_id": body.client_id,
        "client_name": client_name,
        "client_email": client_email,
        "tramite_name": body.tramite_name,
        "description": body.description,
        "amount": body.amount,
        "extra_per_worker": body.extra_per_worker,
        "worker_count": body.worker_count,
        "total": total,
        "paid": 0,
        "balance": total,
        "status": "pendiente",
        "payments": [],
        "notes": body.notes,
        "due_date": body.due_date,
        "created_by": user["_id"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    result = await db.billing.insert_one(billing_doc)
    return {"id": str(result.inserted_id), "total": total, "message": "Registro de cobro creado"}


@api_router.get("/billing")
async def list_billing(user=Depends(require_staff_or_admin)):
    records = []
    async for b in db.billing.find().sort("created_at", -1):
        records.append({
            "id": str(b["_id"]),
            "client_type": b.get("client_type", ""),
            "client_id": b.get("client_id", ""),
            "client_name": b.get("client_name", ""),
            "client_email": b.get("client_email", ""),
            "tramite_name": b.get("tramite_name", ""),
            "description": b.get("description", ""),
            "amount": b.get("amount", 0),
            "extra_per_worker": b.get("extra_per_worker", 0),
            "worker_count": b.get("worker_count", 0),
            "total": b.get("total", 0),
            "paid": b.get("paid", 0),
            "balance": b.get("balance", 0),
            "status": b.get("status", "pendiente"),
            "payments_count": len(b.get("payments", [])),
            "notes": b.get("notes", ""),
            "due_date": b.get("due_date", ""),
            "created_at": b.get("created_at", "")
        })
    return records


@api_router.get("/billing/summary")
async def billing_summary(user=Depends(require_staff_or_admin)):
    total_facturado = 0
    total_cobrado = 0
    total_pendiente = 0
    count_pending = 0
    count_partial = 0
    count_paid = 0
    count_overdue = 0
    async for b in db.billing.find():
        total_facturado += b.get("total", 0)
        total_cobrado += b.get("paid", 0)
        total_pendiente += b.get("balance", 0)
        st = b.get("status", "pendiente")
        if st == "pendiente": count_pending += 1
        elif st == "parcial": count_partial += 1
        elif st == "pagado": count_paid += 1
        elif st == "vencido": count_overdue += 1
    return {
        "total_facturado": total_facturado,
        "total_cobrado": total_cobrado,
        "total_pendiente": total_pendiente,
        "count_pending": count_pending,
        "count_partial": count_partial,
        "count_paid": count_paid,
        "count_overdue": count_overdue
    }


@api_router.get("/billing/{billing_id}")
async def get_billing(billing_id: str, user=Depends(require_staff_or_admin)):
    try:
        b = await db.billing.find_one({"_id": ObjectId(billing_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    if not b:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    return {
        "id": str(b["_id"]),
        "client_type": b.get("client_type", ""),
        "client_id": b.get("client_id", ""),
        "client_name": b.get("client_name", ""),
        "client_email": b.get("client_email", ""),
        "tramite_name": b.get("tramite_name", ""),
        "description": b.get("description", ""),
        "amount": b.get("amount", 0),
        "extra_per_worker": b.get("extra_per_worker", 0),
        "worker_count": b.get("worker_count", 0),
        "total": b.get("total", 0),
        "paid": b.get("paid", 0),
        "balance": b.get("balance", 0),
        "status": b.get("status", "pendiente"),
        "payments": b.get("payments", []),
        "notes": b.get("notes", ""),
        "due_date": b.get("due_date", ""),
        "created_at": b.get("created_at", "")
    }


@api_router.put("/billing/{billing_id}")
async def update_billing(billing_id: str, body: BillingUpdateInput, user=Depends(require_staff_or_admin)):
    update = {}
    if body.tramite_name: update["tramite_name"] = body.tramite_name
    if body.description is not None: update["description"] = body.description
    if body.notes is not None: update["notes"] = body.notes
    if body.due_date is not None: update["due_date"] = body.due_date
    if body.status and body.status in ["pendiente", "parcial", "pagado", "vencido"]:
        update["status"] = body.status
    if body.amount > 0 or body.extra_per_worker > 0 or body.worker_count > 0:
        b = await db.billing.find_one({"_id": ObjectId(billing_id)})
        if b:
            amt = body.amount if body.amount > 0 else b.get("amount", 0)
            extra = body.extra_per_worker if body.extra_per_worker > 0 else b.get("extra_per_worker", 0)
            wc = body.worker_count if body.worker_count > 0 else b.get("worker_count", 0)
            total = amt + (extra * wc)
            paid = b.get("paid", 0)
            update["amount"] = amt
            update["extra_per_worker"] = extra
            update["worker_count"] = wc
            update["total"] = total
            update["balance"] = total - paid
    if not update:
        raise HTTPException(status_code=400, detail="No hay campos para actualizar")
    await db.billing.update_one({"_id": ObjectId(billing_id)}, {"$set": update})
    return {"message": "Registro actualizado"}


@api_router.post("/billing/{billing_id}/payments")
async def add_payment(billing_id: str, body: PaymentInput, user=Depends(require_staff_or_admin)):
    if body.amount <= 0:
        raise HTTPException(status_code=400, detail="El monto debe ser positivo")
    b = await db.billing.find_one({"_id": ObjectId(billing_id)})
    if not b:
        raise HTTPException(status_code=404, detail="Registro no encontrado")

    payment = {
        "id": uuid.uuid4().hex[:8],
        "amount": body.amount,
        "method": body.method,
        "reference": body.reference,
        "notes": body.notes,
        "recorded_by": user.get("name", ""),
        "date": datetime.now(timezone.utc).isoformat()
    }
    new_paid = b.get("paid", 0) + body.amount
    new_balance = b.get("total", 0) - new_paid
    new_status = "pagado" if new_balance <= 0 else "parcial"

    await db.billing.update_one(
        {"_id": ObjectId(billing_id)},
        {"$push": {"payments": payment}, "$set": {"paid": new_paid, "balance": max(0, new_balance), "status": new_status}}
    )
    return {"message": "Pago registrado", "paid": new_paid, "balance": max(0, new_balance), "status": new_status}


@api_router.delete("/billing/{billing_id}")
async def delete_billing(billing_id: str, user=Depends(require_staff_or_admin)):
    result = await db.billing.delete_one({"_id": ObjectId(billing_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    return {"message": "Registro eliminado"}


# ============================
# --- Team Chat ---
# ============================

@api_router.get("/team-chat/conversations")
async def get_conversations(user=Depends(require_staff_or_admin)):
    user_id = user["_id"]
    convos = []
    async for c in db.team_conversations.find({"members": user_id}).sort("updated_at", -1):
        last_msg = await db.team_messages.find_one({"conversation_id": str(c["_id"])}, sort=[("created_at", -1)])
        unread = await db.team_messages.count_documents({
            "conversation_id": str(c["_id"]),
            "sender_id": {"$ne": user_id},
            "read_by": {"$nin": [user_id]}
        })
        convos.append({
            "id": str(c["_id"]),
            "type": c.get("type", "group"),
            "name": c.get("name", ""),
            "members": c.get("members", []),
            "member_names": c.get("member_names", {}),
            "last_message": last_msg.get("content", "")[:60] if last_msg else "",
            "last_message_type": last_msg.get("msg_type", "text") if last_msg else "text",
            "last_sender": last_msg.get("sender_name", "") if last_msg else "",
            "last_time": last_msg.get("created_at", "") if last_msg else c.get("created_at", ""),
            "unread": unread,
        })
    return convos


@api_router.post("/team-chat/conversations")
async def create_conversation(request: Request, user=Depends(require_staff_or_admin)):
    body = await request.json()
    conv_type = body.get("type", "private")
    member_ids = body.get("members", [])
    name = body.get("name", "")

    user_id = user["_id"]
    if user_id not in member_ids:
        member_ids.append(user_id)

    if conv_type == "private" and len(member_ids) == 2:
        existing = await db.team_conversations.find_one({
            "type": "private",
            "members": {"$all": member_ids, "$size": 2}
        })
        if existing:
            return {"id": str(existing["_id"]), "existing": True}

    member_names = {}
    for mid in member_ids:
        u = await db.users.find_one({"_id": ObjectId(mid)}, {"name": 1})
        if u:
            member_names[mid] = u.get("name", "")

    doc = {
        "type": conv_type,
        "name": name if conv_type == "group" else "",
        "members": member_ids,
        "member_names": member_names,
        "created_by": user_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    result = await db.team_conversations.insert_one(doc)
    return {"id": str(result.inserted_id), "existing": False}


@api_router.get("/team-chat/conversations/{conv_id}/messages")
async def get_messages(conv_id: str, limit: int = 50, before: str = "", user=Depends(require_staff_or_admin)):
    conv = await db.team_conversations.find_one({"_id": ObjectId(conv_id)})
    if not conv or user["_id"] not in conv.get("members", []):
        raise HTTPException(status_code=403, detail="No tienes acceso a esta conversacion")

    query = {"conversation_id": conv_id}
    if before:
        query["created_at"] = {"$lt": before}

    msgs = await db.team_messages.find(query).sort("created_at", -1).limit(limit).to_list(limit)
    msgs.reverse()

    await db.team_messages.update_many(
        {"conversation_id": conv_id, "sender_id": {"$ne": user["_id"]}, "read_by": {"$nin": [user["_id"]]}},
        {"$addToSet": {"read_by": user["_id"]}}
    )

    result = []
    for m in msgs:
        result.append({
            "id": str(m["_id"]),
            "sender_id": m["sender_id"],
            "sender_name": m.get("sender_name", ""),
            "content": m.get("content", ""),
            "msg_type": m.get("msg_type", "text"),
            "file_url": m.get("file_url", ""),
            "file_name": m.get("file_name", ""),
            "read_by": m.get("read_by", []),
            "created_at": m["created_at"],
        })
    return result


@api_router.get("/team-chat/conversations/{conv_id}/search")
async def search_messages(conv_id: str, q: str = "", user=Depends(require_staff_or_admin)):
    conv = await db.team_conversations.find_one({"_id": ObjectId(conv_id)})
    if not conv or user["_id"] not in conv.get("members", []):
        raise HTTPException(status_code=403, detail="No tienes acceso")
    if not q.strip():
        return []
    msgs = await db.team_messages.find({
        "conversation_id": conv_id,
        "content": {"$regex": q, "$options": "i"}
    }).sort("created_at", -1).limit(30).to_list(30)
    return [{
        "id": str(m["_id"]),
        "sender_name": m.get("sender_name", ""),
        "content": m.get("content", ""),
        "msg_type": m.get("msg_type", "text"),
        "file_name": m.get("file_name", ""),
        "created_at": m["created_at"],
    } for m in msgs]


@api_router.post("/team-chat/conversations/{conv_id}/messages")
async def send_message(conv_id: str, request: Request, user=Depends(require_staff_or_admin)):
    body = await request.json()
    content = body.get("content", "").strip()
    msg_type = body.get("msg_type", "text")
    file_url = body.get("file_url", "")
    file_name = body.get("file_name", "")

    if not content and not file_url:
        raise HTTPException(status_code=400, detail="Mensaje vacio")

    conv = await db.team_conversations.find_one({"_id": ObjectId(conv_id)})
    if not conv or user["_id"] not in conv.get("members", []):
        raise HTTPException(status_code=403, detail="No tienes acceso")

    msg = {
        "conversation_id": conv_id,
        "sender_id": user["_id"],
        "sender_name": user.get("name", ""),
        "content": content,
        "msg_type": msg_type,
        "file_url": file_url,
        "file_name": file_name,
        "read_by": [user["_id"]],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    result = await db.team_messages.insert_one(msg)
    await db.team_conversations.update_one(
        {"_id": ObjectId(conv_id)},
        {"$set": {"updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"id": str(result.inserted_id), "created_at": msg["created_at"]}


@api_router.post("/team-chat/upload")
async def upload_chat_file(file: UploadFile = File(...), user=Depends(require_staff_or_admin)):
    allowed_ext = ["pdf", "jpg", "jpeg", "png", "gif", "webp"]
    ext = file.filename.split(".")[-1].lower() if "." in file.filename else ""
    if ext not in allowed_ext:
        raise HTTPException(status_code=400, detail="Solo PDF e imagenes permitidos")
    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Maximo 10MB")
    content_type = file.content_type or "application/octet-stream"
    storage_path = f"{APP_NAME}/chat/{user['_id']}/{uuid.uuid4()}.{ext}"
    result = put_object(storage_path, data, content_type)
    return {"file_url": result["path"], "file_name": file.filename, "content_type": content_type}


@api_router.get("/team-chat/file")
async def get_chat_file(path: str, user=Depends(require_staff_or_admin)):
    data, content_type = get_object(path)
    filename = path.split("/")[-1] if "/" in path else "file"
    return FastAPIResponse(content=data, media_type=content_type,
                           headers={"Content-Disposition": f'inline; filename="{filename}"'})


@api_router.get("/team-chat/unread-total")
async def get_total_unread(user=Depends(require_staff_or_admin)):
    user_id = user["_id"]
    convos = await db.team_conversations.find({"members": user_id}, {"_id": 1}).to_list(100)
    conv_ids = [str(c["_id"]) for c in convos]
    if not conv_ids:
        return {"count": 0}
    count = await db.team_messages.count_documents({
        "conversation_id": {"$in": conv_ids},
        "sender_id": {"$ne": user_id},
        "read_by": {"$nin": [user_id]}
    })
    return {"count": count}


@api_router.get("/team-chat/staff-list")
async def get_staff_list(user=Depends(require_staff_or_admin)):
    staff = []
    async for u in db.users.find({"role": {"$in": ["admin", "staff"]}, "is_hidden": {"$ne": True}}, {"password_hash": 0}):
        staff.append({"id": str(u["_id"]), "name": u.get("name", ""), "role": u.get("role", ""), "email": u.get("email", "")})
    return staff


# ============================
# --- Citas / Appointments ---
# ============================

APPOINTMENT_OFFICES = {
    "chile": {"name": "Oficina Santiago", "detail": "Reg. Metropolitana"},
    "spain": {"name": "Oficina Madrid", "detail": "Madrid"},
}

@api_router.get("/citas/config")
async def get_citas_config():
    config = await db.appointment_settings.find_one({"type": "config"})
    blocked = []
    if config:
        blocked = config.get("blocked_dates", [])
    return {
        "offices": APPOINTMENT_OFFICES,
        "blocked_dates": blocked,
        "start_hour": config.get("start_hour", 9) if config else 9,
        "end_hour": config.get("end_hour", 18) if config else 18,
        "slot_duration": config.get("slot_duration", 45) if config else 45,
        "price_amount": config.get("price_amount", 5000) if config else 5000,
        "price_currency": config.get("price_currency", "eur") if config else "eur",
    }


@api_router.put("/citas/config")
async def update_citas_config(body: AppointmentSettingsInput, user=Depends(require_admin)):
    await db.appointment_settings.update_one(
        {"type": "config"},
        {"$set": {
            "type": "config",
            "blocked_dates": body.blocked_dates,
            "start_hour": body.start_hour,
            "end_hour": body.end_hour,
            "slot_duration": body.slot_duration,
            "price_amount": body.price_amount,
            "price_currency": body.price_currency,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True
    )
    return {"message": "Configuracion actualizada"}


@api_router.get("/citas/available-slots")
async def get_available_slots(date: str, location: str):
    # Validate date is not in the past
    try:
        slot_date = datetime.strptime(date, "%Y-%m-%d").date()
        if slot_date <= datetime.now(timezone.utc).date():
            return {"slots": [], "blocked": True}
    except ValueError:
        return {"slots": [], "blocked": True}

    config = await db.appointment_settings.find_one({"type": "config"})
    blocked_dates = config.get("blocked_dates", []) if config else []
    if date in blocked_dates:
        return {"slots": [], "blocked": True}

    start_h = config.get("start_hour", 9) if config else 9
    end_h = config.get("end_hour", 18) if config else 18
    duration = config.get("slot_duration", 45) if config else 45

    # Generate all possible slots
    slots = []
    current_min = start_h * 60
    end_min = end_h * 60
    while current_min + duration <= end_min:
        h = current_min // 60
        m = current_min % 60
        slots.append(f"{h:02d}:{m:02d}")
        current_min += duration

    # Remove already booked slots
    booked = await db.appointments.find(
        {"date": date, "location": location, "status": {"$in": ["pending_payment", "confirmed"]}}
    ).to_list(100)
    booked_times = {a["time"] for a in booked}
    available = [s for s in slots if s not in booked_times]

    return {"slots": available, "blocked": False}


@api_router.post("/citas/book")
async def book_appointment(body: AppointmentBookInput):
    if not body.accept_terms:
        raise HTTPException(status_code=400, detail="Debe aceptar los terminos y condiciones")
    if not body.first_name or not body.last_name or not body.email or not body.phone:
        raise HTTPException(status_code=400, detail="Todos los campos obligatorios son requeridos")
    if body.location not in ["chile", "spain"]:
        raise HTTPException(status_code=400, detail="Ubicacion invalida")

    # Validate date
    try:
        slot_date = datetime.strptime(body.date, "%Y-%m-%d").date()
        if slot_date <= datetime.now(timezone.utc).date():
            raise HTTPException(status_code=400, detail="La fecha debe ser futura")
    except ValueError:
        raise HTTPException(status_code=400, detail="Formato de fecha invalido")

    # Check slot still available
    existing = await db.appointments.find_one({
        "date": body.date, "time": body.time, "location": body.location,
        "status": {"$in": ["pending_payment", "confirmed"]}
    })
    if existing:
        raise HTTPException(status_code=409, detail="Este horario ya no esta disponible")

    config = await db.appointment_settings.find_one({"type": "config"})
    price_amount = config.get("price_amount", 5000) if config else 5000
    price_currency = config.get("price_currency", "eur") if config else "eur"

    office_info = APPOINTMENT_OFFICES.get(body.location, {})
    origin_url = body.origin_url or "https://tramilex.goroky.es"

    # Create Stripe checkout session FIRST (before DB insert to avoid orphans)
    try:
        session = stripe.checkout.Session.create(
            line_items=[{
                "price_data": {
                    "currency": price_currency,
                    "unit_amount": price_amount,
                    "product_data": {"name": "Consulta de Inmigracion - 45 minutos"},
                },
                "quantity": 1,
            }],
            mode="payment",
            success_url=f"{origin_url}/citas/confirmada?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{origin_url}/citas/cancelada",
            metadata={"location": body.location, "date": body.date, "time": body.time},
            customer_email=body.email.lower().strip(),
        )
    except Exception as e:
        logger.error(f"Stripe session error: {e}")
        raise HTTPException(status_code=500, detail="Error creando sesion de pago")

    # Now create appointment doc
    appt_doc = {
        "first_name": body.first_name,
        "last_name": body.last_name,
        "email": body.email.lower().strip(),
        "origin_country": body.origin_country,
        "residence_country": body.residence_country,
        "address": body.address,
        "document_id": body.document_id,
        "document_type": body.document_type,
        "phone": body.phone,
        "location": body.location,
        "office": office_info.get("name", ""),
        "office_detail": office_info.get("detail", ""),
        "date": body.date,
        "time": body.time,
        "status": "pending_payment",
        "payment_session_id": session.id,
        "payment_status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    result = await db.appointments.insert_one(appt_doc)
    appt_id = str(result.inserted_id)

    # Update Stripe session metadata with appointment_id
    stripe.checkout.Session.modify(session.id, metadata={
        "appointment_id": appt_id,
        "location": body.location,
        "date": body.date,
        "time": body.time,
    })

    # Save payment transaction
    sync_db.payment_transactions.insert_one({
        "session_id": session.id,
        "appointment_id": appt_id,
        "amount": price_amount,
        "currency": price_currency,
        "status": "initiated",
        "payment_status": "pending",
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    })

    return {"checkout_url": session.url, "session_id": session.id, "appointment_id": appt_id}


@api_router.get("/citas/payment-status/{session_id}")
async def get_appointment_payment_status(session_id: str):
    record = sync_db.payment_transactions.find_one({"session_id": session_id})
    if not record:
        raise HTTPException(status_code=404, detail="Transaccion no encontrada")

    if record.get("payment_status") != "paid":
        try:
            s = stripe.checkout.Session.retrieve(session_id)
            if s.payment_status == "paid" or s.status == "complete":
                sync_db.payment_transactions.update_one(
                    {"session_id": session_id, "payment_status": {"$ne": "paid"}},
                    {"$set": {"status": "completed", "payment_status": "paid",
                              "updated_at": datetime.now(timezone.utc)}}
                )
                # Confirm the appointment
                appt_id = record.get("appointment_id", "")
                if appt_id:
                    sync_db.appointments.update_one(
                        {"_id": ObjectId(appt_id)},
                        {"$set": {"status": "confirmed", "payment_status": "paid",
                                  "confirmed_at": datetime.now(timezone.utc).isoformat()}}
                    )
                record = sync_db.payment_transactions.find_one({"session_id": session_id})
        except Exception:
            pass

    return {
        "session_id": record["session_id"],
        "status": record["status"],
        "payment_status": record["payment_status"],
        "appointment_id": record.get("appointment_id", ""),
    }


@api_router.post("/stripe/webhook")
async def stripe_webhook(request: Request):
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    try:
        event = stripe.Webhook.construct_event(payload, sig, STRIPE_WEBHOOK_SECRET)
    except stripe.error.SignatureVerificationError:
        raise HTTPException(400, "Firma invalida")
    except Exception:
        raise HTTPException(400, "Error procesando webhook")

    obj = event["data"]["object"]
    event_type = event["type"]

    if event_type == "checkout.session.completed":
        session_id = obj["id"]
        appt_id = obj.get("metadata", {}).get("appointment_id", "")

        sync_db.payment_transactions.update_one(
            {"session_id": session_id, "payment_status": {"$ne": "paid"}},
            {"$set": {"status": "completed", "payment_status": obj.get("payment_status", "paid"),
                      "updated_at": datetime.now(timezone.utc)}}
        )

        if appt_id:
            sync_db.appointments.update_one(
                {"_id": ObjectId(appt_id)},
                {"$set": {"status": "confirmed", "payment_status": "paid",
                          "confirmed_at": datetime.now(timezone.utc).isoformat()}}
            )
            # Send confirmation email in background
            appt = sync_db.appointments.find_one({"_id": ObjectId(appt_id)})
            if appt:
                _send_appointment_confirmation_email(appt)

    elif event_type == "checkout.session.expired":
        sync_db.payment_transactions.update_one(
            {"session_id": obj["id"]},
            {"$set": {"status": "expired", "payment_status": "expired",
                      "updated_at": datetime.now(timezone.utc)}}
        )
        appt_id = obj.get("metadata", {}).get("appointment_id", "")
        if appt_id:
            sync_db.appointments.update_one(
                {"_id": ObjectId(appt_id)},
                {"$set": {"status": "expired"}}
            )

    return {"status": "ok"}


def _send_appointment_confirmation_email(appt):
    try:
        office_name = appt.get("office", "")
        office_detail = appt.get("office_detail", "")
        date_str = appt.get("date", "")
        time_str = appt.get("time", "")
        body = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #0f172a;">Cita Confirmada</h2>
            <p>Hola <strong>{appt.get('first_name', '')} {appt.get('last_name', '')}</strong>,</p>
            <p>Tu cita ha sido confirmada exitosamente.</p>
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 16px 0;">
                <p style="margin: 4px 0;"><strong>Fecha:</strong> {date_str}</p>
                <p style="margin: 4px 0;"><strong>Hora:</strong> {time_str}</p>
                <p style="margin: 4px 0;"><strong>Duracion:</strong> 45 minutos</p>
                <p style="margin: 4px 0;"><strong>Lugar:</strong> {office_name}, {office_detail}</p>
            </div>
            <p>Por favor, llega puntualmente y trae toda la documentacion necesaria.</p>
            <p style="margin-top: 24px;">Un cordial saludo,<br><strong>El equipo de Tramilex</strong></p>
        </div>
        """
        _send_email(appt["email"], "Cita Confirmada - Tramilex", body)
    except Exception as e:
        logger.error(f"Error enviando email de confirmacion de cita: {e}")


@api_router.get("/citas")
async def list_appointments(user=Depends(require_staff_or_admin)):
    records = []
    async for a in db.appointments.find().sort("created_at", -1):
        records.append({
            "id": str(a["_id"]),
            "first_name": a.get("first_name", ""),
            "last_name": a.get("last_name", ""),
            "email": a.get("email", ""),
            "phone": a.get("phone", ""),
            "origin_country": a.get("origin_country", ""),
            "residence_country": a.get("residence_country", ""),
            "address": a.get("address", ""),
            "document_id": a.get("document_id", ""),
            "document_type": a.get("document_type", ""),
            "location": a.get("location", ""),
            "office": a.get("office", ""),
            "office_detail": a.get("office_detail", ""),
            "date": a.get("date", ""),
            "time": a.get("time", ""),
            "status": a.get("status", "pending_payment"),
            "payment_status": a.get("payment_status", "pending"),
            "created_at": a.get("created_at", ""),
            "confirmed_at": a.get("confirmed_at", ""),
        })
    return records


@api_router.get("/citas/unconfirmed-count")
async def get_unconfirmed_count(user=Depends(require_staff_or_admin)):
    count = await db.appointments.count_documents({"status": "confirmed", "admin_reviewed": {"$ne": True}})
    return {"count": count}


@api_router.put("/citas/{appt_id}/review")
async def mark_appointment_reviewed(appt_id: str, user=Depends(require_staff_or_admin)):
    await db.appointments.update_one(
        {"_id": ObjectId(appt_id)},
        {"$set": {"admin_reviewed": True}}
    )
    return {"message": "Cita marcada como revisada"}


@api_router.delete("/citas/{appt_id}")
async def delete_appointment(appt_id: str, user=Depends(require_admin)):
    result = await db.appointments.delete_one({"_id": ObjectId(appt_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Cita no encontrada")
    return {"message": "Cita eliminada"}
# --- Chatbot (Gemini) ---
ADMIN_SYSTEM_PROMPT = """Eres el asistente virtual de Tramilex, una plataforma de gestion documental para tramites de inmigracion. Ayudas a los usuarios del panel de administracion a entender y usar todas las funciones disponibles.

FUNCIONES DEL PANEL ADMIN:
- Clientes: Ver lista de clientes, buscar por nombre/NIE/email, ver detalle con documentos, descargar/renombrar/eliminar documentos, marcar como revisado, generar Ficha PDF, enviar email al cliente, iniciar sesion como cliente.
- Empresas: Crear empresa (nombre, CIF/NIF, email, telefono), se genera contrasena automatica. Agregar trabajadores, asignar tramites (Chile/Espana), subir documentos para firmar, ver documentos firmados, enviar credenciales por email.
- Citas: Sistema de reserva de citas de 45 minutos. Se comparte un enlace publico con los clientes, ellos seleccionan Chile (Oficina Santiago) o Espana (Oficina Madrid), eligen fecha y hora, llenan sus datos, pagan con tarjeta via Stripe y la cita se confirma automaticamente. El admin puede bloquear dias desde Configuracion de citas.
- Tareas: Crear y asignar tareas al equipo con prioridad (baja/media/alta), agregar comentarios, cambiar estados. Notificaciones automaticas.
- Contabilidad: Registrar cobros por cliente o empresa, registrar pagos parciales o totales, ver historial de pagos, estados (pendiente/parcial/pagado/vencido).
- Presupuestos: Crear presupuestos profesionales en PDF. Se ingresa destinatario, conceptos con cantidad y precio, se selecciona IVA (0%, 19% o 21%), y se genera un PDF con logo de Tramilex, datos de la empresa, tabla de conceptos, totales, datos de pago (IBAN/cuenta chilena) y validez de 15 dias. Los presupuestos se numeran automaticamente desde el N.1453. Para crear uno: ir a Presupuestos > Nuevo presupuesto > llenar datos > Crear.
- Tramites: Gestionar tramites del sistema y crear tramites personalizados con requisitos.
- Equipo: Crear usuarios del despacho (staff) con acceso al panel. Al crearse reciben email con credenciales y deben cambiar la clave en su primer acceso.
- Inbox: Leer correos de Outlook directamente desde la plataforma, reenviar a clientes.
- Enviar correo: Enviar notificaciones por email a clientes con autocompletado de destinatarios.
- Auditoria: Ver historial de acciones realizadas en el sistema.
- Configuracion: Configurar SMTP, Mailgun, datos de empresa (telefonos, cuentas bancarias), cambiar contrasena.

Responde siempre en espanol, de forma breve, clara y util. Si un saludo como "hola" o "buenas", responde amablemente y pregunta en que puedes ayudar. No uses etiquetas <think> ni razonamiento interno."""

CLIENT_SYSTEM_PROMPT = """Eres el asistente virtual de Tramilex, una plataforma de gestion documental para inmigracion. Respondes SOLO preguntas sobre como usar la plataforma como cliente.

FUNCIONES DEL PANEL CLIENTE:
- Ver requisitos de tu tramite (en movil, pulsa el boton "Requisitos" para desplegarlos).
- Subir documentos: Selecciona la categoria (Identificacion, Residencia, Trabajo, Contrato, Fiscal, Otros) y arrastra o haz clic para subir archivos (PDF, JPG, PNG, max 5MB).
- Si tu archivo supera 5MB, comprimelo en ilovepdf.com.
- Ver el estado de tus documentos: "Pendiente de revision" o "Revisado".
- Descargar tus documentos subidos.

Si te preguntan algo que no sea sobre la plataforma, responde: "Solo puedo ayudarte con dudas sobre la plataforma Tramilex."
Responde siempre en espanol, de forma breve y clara. No uses etiquetas <think> ni razonamiento interno."""

COMPANY_SYSTEM_PROMPT = """Eres el asistente virtual de Tramilex, una plataforma de gestion documental para inmigracion. Respondes SOLO preguntas sobre como usar la plataforma como empresa.

FUNCIONES DEL PANEL EMPRESA:
- Ver tramites contratados y su estado (pendiente, en proceso, completado, rechazado).
- Documentos por firmar: Si el abogado te sube documentos, aparecen con alerta amarilla. Descarga el documento, firmalo con tu certificado electronico en tu ordenador, y sube el documento firmado con el boton verde "Subir documento firmado".
- Trabajadores: Agregar trabajadores con sus datos (nombre, apellidos, DNI/NIE/Pasaporte/RUT, telefono, email, direccion, pais de origen, pais de residencia, nombre padre, nombre madre, hijos).
- Subir documentos por trabajador: Selecciona categoria y sube archivos. Usa "Subir documento firmado" para documentos con firma electronica.
- Ver estado de revision de los documentos de cada trabajador.

Si te preguntan algo que no sea sobre la plataforma, responde: "Solo puedo ayudarte con dudas sobre la plataforma Tramilex."
Responde siempre en espanol, de forma breve y clara. No uses etiquetas <think> ni razonamiento interno."""


class ChatMessageInput(BaseModel):
    message: str
    session_id: str = ""
    context: str = "client"


@api_router.post("/chatbot/message")
async def chatbot_message(body: ChatMessageInput, user=Depends(get_current_user)):
    if not body.message.strip():
        raise HTTPException(status_code=400, detail="El mensaje no puede estar vacio")

    role = user.get("role", "client")
    if body.context == "admin" and role in ("admin", "staff"):
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
            model="qwen/qwen3.6-27b"
        )

        bot_response = response.choices[0].message.content or ""

        # Strip <think>...</think> tags from reasoning models
        import re
        bot_response = re.sub(r'<think>[\s\S]*?</think>', '', bot_response).strip()
        # If still has unclosed <think> tag, remove everything from it
        if '<think>' in bot_response:
            bot_response = bot_response[:bot_response.find('<think>')].strip()
        if not bot_response:
            bot_response = "Hola. Solo puedo ayudarte con dudas sobre la plataforma Tramilex. Que deseas consultar?"

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
    try:
        await db.auth_pins.create_index("expires_at", expireAfterSeconds=0)
    except Exception:
        pass
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
