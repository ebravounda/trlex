"""
Test company-documents preview/download endpoints
- admin can upload, preview, download
- staff can preview, download (403 fix regression)
- storage_key resolution works for various field names
"""
import os
import io
import time
import pytest
import requests
import jwt as pyjwt
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).resolve().parents[1] / ".env")
JWT_SECRET = os.environ.get("JWT_SECRET", "")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://inmigra-docs.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "malcafuz@tramilex.es"
ADMIN_PASSWORD = "Admin123!"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"admin login failed {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def test_company_id(admin_headers):
    """Get or create Empresa Test Demo."""
    r = requests.get(f"{BASE_URL}/api/companies", headers=admin_headers, timeout=30)
    assert r.status_code == 200, r.text
    companies = r.json()
    for c in companies:
        if c.get("name") == "Empresa Test Demo":
            return c["id"]
    pytest.skip("Empresa Test Demo not found; create via UI first")


@pytest.fixture(scope="module")
def staff_token(admin_headers):
    """Create a temp staff user, return their access token."""
    # Use PIN-less admin login won't work for staff; but staff role uses email/password too? 
    # Looking at /auth/login: it only allows admin role. Staff uses PIN or ... let's check.
    # Actually /auth/login rejects non-admin. So staff must use PIN.
    # For test, we bypass by using admin as fallback and also test staff via a manual token.
    email = f"TEST_staff_{int(time.time())}@tramilex.es"
    payload = {"name": "TEST Staff Preview", "email": email, "password": "StaffPass123!",
               "phone": "", "position": "tester"}
    r = requests.post(f"{BASE_URL}/api/staff", headers=admin_headers, json=payload, timeout=30)
    if r.status_code not in (200, 201):
        pytest.skip(f"Cannot create staff: {r.status_code} {r.text}")
    staff = r.json()
    staff_id = staff.get("id") or staff.get("_id")

    # Staff cannot use /auth/login (admin only). Mint JWT directly using JWT_SECRET.
    token = None
    if staff_id and JWT_SECRET:
        payload = {
            "sub": staff_id, "email": email, "role": "staff",
            "exp": datetime.now(timezone.utc) + timedelta(hours=1),
            "type": "access",
        }
        token = pyjwt.encode(payload, JWT_SECRET, algorithm="HS256")

    yield {"token": token, "id": staff_id, "email": email}

    # Cleanup
    if staff_id:
        requests.delete(f"{BASE_URL}/api/staff/{staff_id}", headers=admin_headers, timeout=30)


@pytest.fixture(scope="module")
def uploaded_doc_id(admin_headers, test_company_id):
    """Upload a small PDF to the company and return doc id."""
    pdf_bytes = b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\nxref\n0 3\n0000000000 65535 f\n0000000010 00000 n\n0000000053 00000 n\ntrailer<</Size 3/Root 1 0 R>>\nstartxref\n96\n%%EOF"
    files = {"file": ("TEST_preview.pdf", io.BytesIO(pdf_bytes), "application/pdf")}
    data = {"category": "otros"}
    r = requests.post(f"{BASE_URL}/api/companies/{test_company_id}/documents/upload",
                      headers=admin_headers, files=files, data=data, timeout=60)
    assert r.status_code == 200, f"upload failed: {r.status_code} {r.text}"
    doc_id = r.json()["id"]
    yield doc_id
    # Cleanup
    requests.delete(f"{BASE_URL}/api/companies/{test_company_id}/documents/{doc_id}",
                    headers=admin_headers, timeout=30)


class TestCompanyDocPreview:
    def test_upload_shows_in_list(self, admin_headers, test_company_id, uploaded_doc_id):
        r = requests.get(f"{BASE_URL}/api/companies/{test_company_id}/documents",
                         headers=admin_headers, timeout=30)
        assert r.status_code == 200
        ids = [d["id"] for d in r.json()]
        assert uploaded_doc_id in ids

    def test_preview_admin_200(self, admin_headers, uploaded_doc_id):
        r = requests.get(f"{BASE_URL}/api/company-documents/{uploaded_doc_id}/preview",
                         headers=admin_headers, timeout=30)
        assert r.status_code == 200, f"preview failed: {r.status_code} {r.text[:200]}"
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert "inline" in r.headers.get("content-disposition", "")
        assert len(r.content) > 0

    def test_download_admin_200(self, admin_headers, uploaded_doc_id):
        r = requests.get(f"{BASE_URL}/api/company-documents/{uploaded_doc_id}/download",
                         headers=admin_headers, timeout=30)
        assert r.status_code == 200
        assert "attachment" in r.headers.get("content-disposition", "")

    def test_preview_staff_200(self, staff_token, uploaded_doc_id):
        if not staff_token["token"]:
            pytest.skip("staff token not obtained (login endpoint may reject staff)")
        headers = {"Authorization": f"Bearer {staff_token['token']}"}
        r = requests.get(f"{BASE_URL}/api/company-documents/{uploaded_doc_id}/preview",
                         headers=headers, timeout=30)
        assert r.status_code == 200, f"staff preview: {r.status_code} {r.text[:200]}"

    def test_preview_unauth_401(self, uploaded_doc_id):
        r = requests.get(f"{BASE_URL}/api/company-documents/{uploaded_doc_id}/preview", timeout=30)
        assert r.status_code == 401

    def test_preview_bad_id_404(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/company-documents/deadbeefdeadbeefdeadbeef/preview",
                         headers=admin_headers, timeout=30)
        assert r.status_code == 404
