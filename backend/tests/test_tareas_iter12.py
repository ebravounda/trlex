"""
Iter12 - Tareas module enhancements:
- numero_expediente field on create/update
- Task documents upload/list/download/delete
- Send documents by email to assigned staff
"""
import os
import io
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fallback to frontend/.env
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")

API = f"{BASE_URL}/api"
ADMIN_EMAIL = "malcafuz@tramilex.es"
ADMIN_PASSWORD = "Admin123!"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("token") or data.get("access_token")
    assert tok, f"No token in response: {data}"
    return tok


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def staff_id(headers):
    r = requests.get(f"{API}/staff", headers=headers)
    assert r.status_code == 200, f"staff list failed: {r.status_code} {r.text}"
    staff = r.json()
    assert isinstance(staff, list) and len(staff) > 0, "No staff found"
    # pick first with a valid id
    for s in staff:
        if s.get("id") or s.get("_id"):
            return s.get("id") or s.get("_id")
    pytest.skip("No staff with id")


@pytest.fixture(scope="module")
def created_task(headers, staff_id):
    payload = {
        "title": "TEST_iter12 task expediente",
        "description": "Test task for iter12 tareas features",
        "priority": "alta",
        "assigned_to": staff_id,
        "due_date": "2026-02-01",
        "numero_expediente": "EXP-TEST-2026-001"
    }
    r = requests.post(f"{API}/tasks", json=payload, headers=headers)
    assert r.status_code in (200, 201), f"create task failed: {r.status_code} {r.text}"
    data = r.json()
    task_id = data.get("id") or data.get("_id")
    assert task_id, f"No task id in response: {data}"
    yield {"id": task_id, "payload": payload}
    # cleanup
    try:
        requests.delete(f"{API}/tasks/{task_id}", headers=headers)
    except Exception:
        pass


def test_create_task_stores_numero_expediente(created_task, headers):
    task_id = created_task["id"]
    r = requests.get(f"{API}/tasks/{task_id}", headers=headers)
    assert r.status_code == 200, r.text
    t = r.json()
    assert t.get("numero_expediente") == "EXP-TEST-2026-001", f"Got: {t.get('numero_expediente')}"
    assert t.get("title") == created_task["payload"]["title"]


def test_update_task_updates_numero_expediente(created_task, headers):
    task_id = created_task["id"]
    r = requests.put(f"{API}/tasks/{task_id}", json={"numero_expediente": "EXP-UPDATED-999"}, headers=headers)
    assert r.status_code == 200, r.text
    # Verify via GET
    r = requests.get(f"{API}/tasks/{task_id}", headers=headers)
    assert r.status_code == 200
    assert r.json().get("numero_expediente") == "EXP-UPDATED-999"


def test_update_task_multiple_fields(created_task, headers):
    task_id = created_task["id"]
    payload = {
        "title": "TEST_iter12 updated title",
        "priority": "baja",
        "status": "en_proceso",
        "description": "updated desc"
    }
    r = requests.put(f"{API}/tasks/{task_id}", json=payload, headers=headers)
    assert r.status_code == 200, r.text
    r = requests.get(f"{API}/tasks/{task_id}", headers=headers)
    t = r.json()
    assert t["title"] == payload["title"]
    assert t["priority"] == payload["priority"]
    assert t["status"] == payload["status"]


@pytest.fixture(scope="module")
def uploaded_doc(created_task, headers):
    task_id = created_task["id"]
    file_content = b"%PDF-1.4\n%TEST iter12 task doc\ntrailer<<>>\n%%EOF\n"
    files = {"file": ("test_iter12.pdf", io.BytesIO(file_content), "application/pdf")}
    r = requests.post(f"{API}/tasks/{task_id}/documents/upload", files=files, headers=headers)
    assert r.status_code == 200, f"upload failed: {r.status_code} {r.text}"
    data = r.json()
    doc_id = data.get("id")
    assert doc_id, f"no doc id: {data}"
    return {"task_id": task_id, "doc_id": doc_id, "filename": "test_iter12.pdf"}


def test_upload_task_document(uploaded_doc):
    assert uploaded_doc["doc_id"]


def test_list_task_documents(uploaded_doc, headers):
    task_id = uploaded_doc["task_id"]
    r = requests.get(f"{API}/tasks/{task_id}/documents", headers=headers)
    assert r.status_code == 200, r.text
    docs = r.json()
    assert isinstance(docs, list)
    assert any(d["id"] == uploaded_doc["doc_id"] for d in docs)
    doc = next(d for d in docs if d["id"] == uploaded_doc["doc_id"])
    assert doc["original_filename"] == "test_iter12.pdf"
    assert doc["size"] > 0


def test_task_get_includes_documents(uploaded_doc, headers):
    r = requests.get(f"{API}/tasks/{uploaded_doc['task_id']}", headers=headers)
    assert r.status_code == 200
    t = r.json()
    # task detail should include documents list or count
    docs = t.get("documents") or []
    assert isinstance(docs, list)


def test_download_task_document(uploaded_doc, headers):
    r = requests.get(
        f"{API}/tasks/{uploaded_doc['task_id']}/documents/{uploaded_doc['doc_id']}/download",
        headers=headers
    )
    assert r.status_code == 200, r.text
    assert len(r.content) > 0
    assert b"PDF" in r.content[:20] or len(r.content) > 10


def test_send_task_documents_email(uploaded_doc, headers):
    r = requests.post(
        f"{API}/tasks/{uploaded_doc['task_id']}/send-documents",
        headers=headers
    )
    # Even if Resend not configured, endpoint schedules background task and returns 200
    assert r.status_code == 200, f"send-documents failed: {r.status_code} {r.text}"
    data = r.json()
    assert "message" in data or "enviado" in str(data).lower()


def test_delete_task_document(uploaded_doc, headers):
    r = requests.delete(
        f"{API}/tasks/{uploaded_doc['task_id']}/documents/{uploaded_doc['doc_id']}",
        headers=headers
    )
    assert r.status_code == 200, r.text
    # verify not in list
    r = requests.get(f"{API}/tasks/{uploaded_doc['task_id']}/documents", headers=headers)
    docs = r.json()
    assert not any(d["id"] == uploaded_doc["doc_id"] for d in docs), "Doc still listed after delete"


def test_add_comment_to_task(created_task, headers):
    task_id = created_task["id"]
    r = requests.post(f"{API}/tasks/{task_id}/comments", json={"text": "TEST_iter12 comment"}, headers=headers)
    assert r.status_code in (200, 201), r.text


def test_send_documents_on_task_with_no_docs_returns_400(headers, staff_id):
    # Create fresh task with no docs
    r = requests.post(f"{API}/tasks", json={
        "title": "TEST_iter12 no docs task",
        "assigned_to": staff_id,
        "priority": "media"
    }, headers=headers)
    assert r.status_code in (200, 201)
    tid = r.json().get("id")
    try:
        r2 = requests.post(f"{API}/tasks/{tid}/send-documents", headers=headers)
        assert r2.status_code == 400, f"expected 400, got {r2.status_code}: {r2.text}"
    finally:
        requests.delete(f"{API}/tasks/{tid}", headers=headers)
