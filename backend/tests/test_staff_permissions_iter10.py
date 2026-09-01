"""Iter10 regression: verify staff role has access to company & worker document endpoints."""
import os
import time
import io
import uuid
import pytest
import requests
import jwt as pyjwt
from datetime import datetime, timezone, timedelta
from pymongo import MongoClient
from bson import ObjectId

BASE_URL = os.environ['REACT_APP_BACKEND_URL'].rstrip('/')
# Load backend env for JWT secret & mongo
from pathlib import Path
from dotenv import load_dotenv
load_dotenv(Path('/app/backend/.env'))
JWT_SECRET = os.environ['JWT_SECRET']
MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']

ADMIN_EMAIL = "malcafuz@tramilex.es"
ADMIN_PASSWORD = "Admin123!"

client = MongoClient(MONGO_URL)
db = client[DB_NAME]


def _mint_token(user_id, email, role):
    payload = {
        "sub": user_id, "email": email, "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=2),
        "type": "access",
    }
    return pyjwt.encode(payload, JWT_SECRET, algorithm="HS256")


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def staff_token():
    # Create ephemeral staff user directly in DB (login-flow rejects staff via password)
    email = f"TEST_staff_iter10_{int(time.time())}@tramilex.es"
    doc = {
        "email": email,
        "password_hash": "$2b$12$abcdefghijklmnopqrstuv",
        "name": "TEST Staff Iter10",
        "role": "staff",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    ins = db.users.insert_one(doc)
    uid = str(ins.inserted_id)
    token = _mint_token(uid, email, "staff")
    yield token
    db.users.delete_one({"_id": ObjectId(uid)})


@pytest.fixture(scope="module")
def company_id():
    c = db.companies.find_one({"name": "Empresa Test Demo"})
    assert c, "Empresa Test Demo not found - seed missing"
    return str(c["_id"])


@pytest.fixture(scope="module")
def worker_id(company_id):
    w = db.company_workers.find_one({"company_id": company_id, "name": {"$regex": "Carlos", "$options": "i"}})
    if not w:
        # any worker
        w = db.company_workers.find_one({"company_id": company_id})
    assert w, "No worker found for Empresa Test Demo"
    return str(w["_id"])


# ---------- Logo asset ----------
def test_logo_local_asset_reachable():
    r = requests.get(f"{BASE_URL}/logo.png", timeout=15)
    assert r.status_code == 200, f"logo.png returned {r.status_code}"
    assert r.headers.get("content-type", "").startswith("image/"), r.headers.get("content-type")
    assert len(r.content) > 1000  # not empty


# ---------- Admin login ----------
def test_admin_login(admin_token):
    assert isinstance(admin_token, str) and len(admin_token) > 20


# ---------- Company docs: staff access ----------
def test_staff_list_company_documents(staff_token, company_id):
    r = requests.get(f"{BASE_URL}/api/companies/{company_id}/documents",
                     headers={"Authorization": f"Bearer {staff_token}"})
    assert r.status_code == 200, f"{r.status_code}: {r.text}"
    assert isinstance(r.json(), list)


def test_staff_list_folders(staff_token, company_id):
    r = requests.get(f"{BASE_URL}/api/companies/{company_id}/folders",
                     headers={"Authorization": f"Bearer {staff_token}"})
    assert r.status_code == 200


def test_staff_upload_company_document(staff_token, company_id):
    files = {"file": ("TEST_iter10_staff.pdf", b"%PDF-1.4\n%TEST\n", "application/pdf")}
    data = {"category": "otros"}
    r = requests.post(f"{BASE_URL}/api/companies/{company_id}/documents/upload",
                      headers={"Authorization": f"Bearer {staff_token}"},
                      files=files, data=data)
    assert r.status_code == 200, f"staff upload failed: {r.status_code} {r.text}"
    doc_id = r.json()["id"]

    # staff preview
    p = requests.get(f"{BASE_URL}/api/company-documents/{doc_id}/preview",
                     headers={"Authorization": f"Bearer {staff_token}"})
    assert p.status_code == 200, f"staff preview {p.status_code}: {p.text[:200]}"
    assert p.headers.get("content-type", "").startswith("application/pdf")

    # staff download
    d = requests.get(f"{BASE_URL}/api/company-documents/{doc_id}/download",
                     headers={"Authorization": f"Bearer {staff_token}"})
    assert d.status_code == 200
    assert "attachment" in d.headers.get("content-disposition", "").lower()

    # cleanup
    requests.delete(f"{BASE_URL}/api/companies/{company_id}/documents/{doc_id}",
                    headers={"Authorization": f"Bearer {staff_token}"})


# ---------- Worker docs: staff access ----------
def test_staff_list_worker_documents(staff_token, company_id, worker_id):
    r = requests.get(f"{BASE_URL}/api/companies/{company_id}/workers/{worker_id}/documents",
                     headers={"Authorization": f"Bearer {staff_token}"})
    assert r.status_code == 200, f"{r.status_code}: {r.text}"


def test_staff_upload_worker_document(staff_token, company_id, worker_id):
    files = {"file": ("TEST_iter10_worker.pdf", b"%PDF-1.4\n%WK\n", "application/pdf")}
    data = {"category": "otros"}
    r = requests.post(
        f"{BASE_URL}/api/companies/{company_id}/workers/{worker_id}/documents/upload",
        headers={"Authorization": f"Bearer {staff_token}"},
        files=files, data=data,
    )
    assert r.status_code == 200, f"staff worker upload: {r.status_code} {r.text}"
    doc_id = r.json().get("id")
    assert doc_id
    # cleanup (soft delete)
    db.company_documents.update_one({"_id": ObjectId(doc_id)}, {"$set": {"is_deleted": True}})


# ---------- Admin can upload (positive control) ----------
def test_admin_upload_company_document(admin_token, company_id):
    files = {"file": ("TEST_iter10_admin.pdf", b"%PDF-1.4\n%AD\n", "application/pdf")}
    data = {"category": "otros"}
    r = requests.post(f"{BASE_URL}/api/companies/{company_id}/documents/upload",
                      headers={"Authorization": f"Bearer {admin_token}"},
                      files=files, data=data)
    assert r.status_code == 200
    doc_id = r.json()["id"]
    # preview
    p = requests.get(f"{BASE_URL}/api/company-documents/{doc_id}/preview",
                     headers={"Authorization": f"Bearer {admin_token}"})
    assert p.status_code == 200
    # cleanup
    requests.delete(f"{BASE_URL}/api/companies/{company_id}/documents/{doc_id}",
                    headers={"Authorization": f"Bearer {admin_token}"})


# ---------- Settings still forbidden for staff ----------
def test_staff_forbidden_on_settings(staff_token):
    r = requests.get(f"{BASE_URL}/api/settings/smtp",
                     headers={"Authorization": f"Bearer {staff_token}"})
    assert r.status_code == 403, f"expected staff to be blocked from settings, got {r.status_code}"
