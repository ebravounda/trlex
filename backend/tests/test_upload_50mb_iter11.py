"""Iter11 tests: verify 50MB upload limit + multiple upload for company docs."""
import os, io, pytest, requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = "http://localhost:8001"

ADMIN_EMAIL = "malcafuz@tramilex.es"
ADMIN_PASS = "Admin123!"


def _mk_pdf(size_bytes: int) -> bytes:
    # minimal PDF header + padding so backend classifies it as pdf via content_type upload
    header = b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"
    pad = b"0" * max(0, size_bytes - len(header) - 20)
    tail = b"\n%%EOF\n"
    return header + pad + tail


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def company_id(admin_token):
    hdr = {"Authorization": f"Bearer {admin_token}"}
    r = requests.get(f"{BASE_URL}/api/companies", headers=hdr, timeout=15)
    assert r.status_code == 200
    companies = r.json()
    demo = next((c for c in companies if "Test Demo" in (c.get("company_name") or c.get("name") or "")), None)
    assert demo, "Empresa Test Demo not found"
    return demo["id"]


# --- 1) health ---
def test_login(admin_token):
    assert admin_token


# --- 2) upload single file to company docs ---
def test_upload_small_pdf(admin_token, company_id):
    hdr = {"Authorization": f"Bearer {admin_token}"}
    pdf = _mk_pdf(2000)
    files = {"file": ("TEST_iter11_small.pdf", pdf, "application/pdf")}
    data = {"category": "otros"}
    r = requests.post(f"{BASE_URL}/api/companies/{company_id}/documents/upload",
                      headers=hdr, files=files, data=data, timeout=30)
    assert r.status_code == 200, r.text
    doc = r.json()
    assert doc.get("id")
    # cleanup
    requests.delete(f"{BASE_URL}/api/companies/{company_id}/documents/{doc['id']}", headers=hdr, timeout=15)


# --- 3) upload multiple files sequentially (frontend does per-file) ---
def test_upload_multiple_files(admin_token, company_id):
    hdr = {"Authorization": f"Bearer {admin_token}"}
    ids = []
    for i in range(3):
        pdf = _mk_pdf(1500 + i * 100)
        files = {"file": (f"TEST_iter11_multi_{i}.pdf", pdf, "application/pdf")}
        data = {"category": "otros"}
        r = requests.post(f"{BASE_URL}/api/companies/{company_id}/documents/upload",
                          headers=hdr, files=files, data=data, timeout=30)
        assert r.status_code == 200, r.text
        ids.append(r.json()["id"])
    assert len(ids) == 3
    for did in ids:
        requests.delete(f"{BASE_URL}/api/companies/{company_id}/documents/{did}", headers=hdr, timeout=15)


# --- 4) 50MB limit rejection returns 400 with '50MB' message ---
def test_upload_over_50mb_rejected(admin_token, company_id):
    hdr = {"Authorization": f"Bearer {admin_token}"}
    big = _mk_pdf(51 * 1024 * 1024)  # 51 MB
    files = {"file": ("TEST_iter11_big.pdf", big, "application/pdf")}
    data = {"category": "otros"}
    r = requests.post(f"{BASE_URL}/api/companies/{company_id}/documents/upload",
                      headers=hdr, files=files, data=data, timeout=120)
    assert r.status_code == 400, r.text
    assert "50MB" in r.text or "50 MB" in r.text


# --- 5) PDF > 10MB uploaded (auto-compress path). ~11MB should succeed and get stored (possibly compressed). ---
def test_upload_pdf_over_10mb_autocompressed(admin_token, company_id):
    hdr = {"Authorization": f"Bearer {admin_token}"}
    # 11 MB non-image PDF: pymupdf may fail to rasterise pure text/pad -> fallback keeps original
    pdf = _mk_pdf(11 * 1024 * 1024)
    files = {"file": ("TEST_iter11_11mb.pdf", pdf, "application/pdf")}
    data = {"category": "otros"}
    r = requests.post(f"{BASE_URL}/api/companies/{company_id}/documents/upload",
                      headers=hdr, files=files, data=data, timeout=180)
    assert r.status_code == 200, r.text
    did = r.json()["id"]
    requests.delete(f"{BASE_URL}/api/companies/{company_id}/documents/{did}", headers=hdr, timeout=15)


# --- 6) folder create + upload into folder ---
def test_create_folder_and_upload(admin_token, company_id):
    hdr = {"Authorization": f"Bearer {admin_token}"}
    r = requests.post(f"{BASE_URL}/api/companies/{company_id}/folders",
                      headers=hdr, json={"name": "TEST_iter11_folder", "color": "#3b82f6"}, timeout=15)
    assert r.status_code in (200, 201), r.text
    fid = r.json()["id"]
    try:
        files = {"file": ("TEST_iter11_infolder.pdf", _mk_pdf(2000), "application/pdf")}
        data = {"category": "otros", "folder_id": fid}
        r = requests.post(f"{BASE_URL}/api/companies/{company_id}/documents/upload",
                          headers=hdr, files=files, data=data, timeout=30)
        assert r.status_code == 200, r.text
        did = r.json()["id"]
        # GET documents by folder
        r = requests.get(f"{BASE_URL}/api/companies/{company_id}/documents?folder_id={fid}",
                         headers=hdr, timeout=15)
        assert r.status_code == 200
        assert any(d["id"] == did for d in r.json())
        requests.delete(f"{BASE_URL}/api/companies/{company_id}/documents/{did}", headers=hdr, timeout=15)
    finally:
        requests.delete(f"{BASE_URL}/api/companies/{company_id}/folders/{fid}", headers=hdr, timeout=15)
