from pathlib import Path
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI, APIRouter, UploadFile, File, HTTPException, Request, Depends, BackgroundTasks
from fastapi.responses import Response as FastAPIResponse
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
from typing import Optional
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

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


class SMTPSettingsInput(BaseModel):
    smtp_host: str
    smtp_port: int = 587
    smtp_user: str
    smtp_password: str
    from_email: str


class DocumentStatusUpdate(BaseModel):
    status: str


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


# --- Documents Routes ---
@api_router.post("/documents/upload")
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    user=Depends(get_current_user)
):
    allowed_types = [
        "application/pdf", "image/jpeg", "image/png",
        "image/gif", "image/webp", "image/jpg"
    ]
    content_type = file.content_type or "application/octet-stream"
    if content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Tipo de archivo no permitido. Solo PDF e imagenes.")

    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="El archivo es demasiado grande. Maximo 10MB.")

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
        "is_deleted": False,
        "uploaded_at": datetime.now(timezone.utc).isoformat()
    }
    insert_result = await db.documents.insert_one(doc)

    background_tasks.add_task(send_upload_notification, user, file.filename)

    return {
        "id": str(insert_result.inserted_id),
        "original_filename": file.filename,
        "content_type": content_type,
        "size": doc["size"],
        "status": "pending_review",
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
            "content_type": doc.get("content_type", ""),
            "size": doc.get("size", 0),
            "status": doc["status"],
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
    return {"message": "Documento eliminado"}


@api_router.put("/documents/{doc_id}/status")
async def update_document_status(doc_id: str, body: DocumentStatusUpdate, user=Depends(require_admin)):
    if body.status not in ["pending_review", "reviewed"]:
        raise HTTPException(status_code=400, detail="Estado invalido")
    try:
        result = await db.documents.update_one(
            {"_id": ObjectId(doc_id), "is_deleted": False},
            {"$set": {"status": body.status}}
        )
    except Exception:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    return {"message": "Estado actualizado", "status": body.status}


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
            "content_type": doc.get("content_type", ""),
            "size": doc.get("size", 0),
            "status": doc["status"],
            "uploaded_at": doc["uploaded_at"]
        })

    client["documents"] = doc_list
    return client


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
    return {"message": "Cliente y documentos eliminados"}


# --- Settings Routes ---
@api_router.get("/settings/smtp")
async def get_smtp_settings(user=Depends(require_admin)):
    settings = await db.settings.find_one({"type": "smtp"}, {"_id": 0})
    if not settings:
        return {"type": "smtp", "smtp_host": "", "smtp_port": 587, "smtp_user": "", "smtp_password": "", "from_email": ""}
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
        msg["To"] = settings["from_email"]
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


# --- Startup ---
@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)

    admin_email = os.environ.get("ADMIN_EMAIL", "admin@tramilex.com")
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
