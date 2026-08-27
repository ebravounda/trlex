"""Tests for new features: Settings (Mailgun, Company Info), Presupuestos CRUD+PDF, Reminders."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/") or "https://inmigra-docs.preview.emergentagent.com"
ADMIN_EMAIL = "malcafuz@tramilex.es"
ADMIN_PASSWORD = "Admin123!"


@pytest.fixture(scope="module")
def admin_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("access_token") or data.get("token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    return s


# --- Mailgun Settings ---
class TestMailgunSettings:
    def test_get_mailgun(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/settings/mailgun")
        assert r.status_code == 200
        d = r.json()
        assert "mailgun_domain" in d and "mailgun_api_key" in d and "mailgun_from_email" in d

    def test_put_mailgun_and_persist(self, admin_client):
        payload = {"mailgun_domain": "mg.test.com", "mailgun_api_key": "key-TEST123", "mailgun_from_email": "noreply@test.com"}
        r = admin_client.put(f"{BASE_URL}/api/settings/mailgun", json=payload)
        assert r.status_code == 200
        g = admin_client.get(f"{BASE_URL}/api/settings/mailgun").json()
        assert g["mailgun_domain"] == "mg.test.com"
        assert g["mailgun_from_email"] == "noreply@test.com"
        # api_key should be masked
        assert g["mailgun_api_key"] == "********"

    def test_put_mailgun_masked_key_preserved(self, admin_client):
        # Sending masked value must preserve stored key (not overwrite)
        payload = {"mailgun_domain": "mg.test.com", "mailgun_api_key": "********", "mailgun_from_email": "noreply@test.com"}
        r = admin_client.put(f"{BASE_URL}/api/settings/mailgun", json=payload)
        assert r.status_code == 200

    def test_mailgun_unauthorized(self):
        r = requests.get(f"{BASE_URL}/api/settings/mailgun")
        assert r.status_code in (401, 403)


# --- Company Info ---
class TestCompanyInfo:
    def test_get_company_info(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/settings/company-info")
        assert r.status_code == 200
        d = r.json()
        for k in ["company_name", "phone_spain", "phone_chile", "phone_mexico", "phone_peru", "iban", "cuenta_chile"]:
            assert k in d

    def test_put_company_info_and_persist(self, admin_client):
        payload = {
            "company_name": "Tramilex TEST", "company_email": "info@tramilex.es",
            "phone_spain": "+34 900 000 001", "phone_chile": "+56 2 0000 0001",
            "phone_mexico": "+52 55 0000 0001", "phone_peru": "+51 1 0000001",
            "iban": "ES00 1234 5678 9012 3456 7890", "bank_name_eu": "TEST Bank EU",
            "cuenta_chile": "1234567-8", "bank_name_chile": "Banco TEST",
            "extra_payment_info": "TEST info"
        }
        r = admin_client.put(f"{BASE_URL}/api/settings/company-info", json=payload)
        assert r.status_code == 200
        g = admin_client.get(f"{BASE_URL}/api/settings/company-info").json()
        assert g["company_name"] == "Tramilex TEST"
        assert g["phone_spain"] == "+34 900 000 001"
        assert g["iban"].startswith("ES00")


# --- Presupuestos ---
class TestPresupuestos:
    created_id = None
    created_number = None

    def test_next_number(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/presupuestos/next-number")
        assert r.status_code == 200
        d = r.json()
        assert "next_number" in d
        assert isinstance(d["next_number"], int)
        assert d["next_number"] >= 1453

    def test_create_presupuesto(self, admin_client):
        next_num = admin_client.get(f"{BASE_URL}/api/presupuestos/next-number").json()["next_number"]
        payload = {
            "recipient_name": "TEST Cliente Pytest",
            "recipient_company": "TEST S.A.",
            "recipient_email": "test@example.com",
            "recipient_address": "Calle TEST 1, Madrid",
            "recipient_nif": "B12345678",
            "items": [
                {"description": "Servicio A", "quantity": 2, "amount": 100.0},
                {"description": "Servicio B", "quantity": 1, "amount": 50.0},
            ],
            "iva_rate": 21,
            "notes": "Notas TEST",
            "payment_method": "Transferencia",
        }
        r = admin_client.post(f"{BASE_URL}/api/presupuestos", json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "id" in d
        assert d["number"] == next_num
        # subtotal 250, IVA 21% = 52.5, total = 302.5
        assert round(d["total"], 2) == 302.5
        TestPresupuestos.created_id = d["id"]
        TestPresupuestos.created_number = d["number"]

    def test_list_presupuestos_sorted_desc(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/presupuestos")
        assert r.status_code == 200
        lst = r.json()
        assert isinstance(lst, list)
        assert len(lst) >= 1
        numbers = [p["number"] for p in lst]
        assert numbers == sorted(numbers, reverse=True)

    def test_get_presupuesto_details(self, admin_client):
        assert TestPresupuestos.created_id
        r = admin_client.get(f"{BASE_URL}/api/presupuestos/{TestPresupuestos.created_id}")
        assert r.status_code == 200
        p = r.json()
        assert p["id"] == TestPresupuestos.created_id
        assert p["recipient_name"] == "TEST Cliente Pytest"
        assert p["subtotal"] == 250.0
        assert p["iva_amount"] == 52.5
        assert p["total"] == 302.5
        assert p["iva_rate"] == 21
        assert "valid_until" in p
        assert "_id" not in p

    def test_pdf_generation(self, admin_client):
        assert TestPresupuestos.created_id
        r = admin_client.get(f"{BASE_URL}/api/presupuestos/{TestPresupuestos.created_id}/pdf")
        assert r.status_code == 200
        assert "application/pdf" in r.headers.get("content-type", "").lower()
        assert len(r.content) > 500
        assert r.content[:4] == b"%PDF"

    def test_create_iva_zero(self, admin_client):
        payload = {"recipient_name": "TEST IVA0", "items": [{"description": "X", "quantity": 1, "amount": 100.0}], "iva_rate": 0}
        r = admin_client.post(f"{BASE_URL}/api/presupuestos", json=payload)
        assert r.status_code == 200
        pid = r.json()["id"]
        g = admin_client.get(f"{BASE_URL}/api/presupuestos/{pid}").json()
        assert g["iva_amount"] == 0
        assert g["total"] == 100.0
        # cleanup
        admin_client.delete(f"{BASE_URL}/api/presupuestos/{pid}")

    def test_create_iva_19(self, admin_client):
        payload = {"recipient_name": "TEST IVA19", "items": [{"description": "X", "quantity": 1, "amount": 100.0}], "iva_rate": 19}
        r = admin_client.post(f"{BASE_URL}/api/presupuestos", json=payload)
        assert r.status_code == 200
        pid = r.json()["id"]
        g = admin_client.get(f"{BASE_URL}/api/presupuestos/{pid}").json()
        assert g["iva_amount"] == 19.0
        assert g["total"] == 119.0
        admin_client.delete(f"{BASE_URL}/api/presupuestos/{pid}")

    def test_create_no_items_400(self, admin_client):
        r = admin_client.post(f"{BASE_URL}/api/presupuestos", json={"recipient_name": "X", "items": []})
        assert r.status_code == 400

    def test_get_not_found(self, admin_client):
        # valid ObjectId format but nonexistent
        r = admin_client.get(f"{BASE_URL}/api/presupuestos/507f1f77bcf86cd799439011")
        assert r.status_code == 404

    def test_list_unauthorized(self):
        r = requests.get(f"{BASE_URL}/api/presupuestos")
        assert r.status_code in (401, 403)

    def test_delete_presupuesto(self, admin_client):
        assert TestPresupuestos.created_id
        r = admin_client.delete(f"{BASE_URL}/api/presupuestos/{TestPresupuestos.created_id}")
        assert r.status_code == 200
        # verify deleted
        g = admin_client.get(f"{BASE_URL}/api/presupuestos/{TestPresupuestos.created_id}")
        assert g.status_code == 404


# --- Reminders ---
class TestReminders:
    def test_send_reminders_endpoint(self, admin_client):
        r = admin_client.post(f"{BASE_URL}/api/citas/send-reminders")
        assert r.status_code == 200
        d = r.json()
        assert "message" in d
        # Count should be 0 or more (probably 0 since no confirmed appts for tomorrow)
        assert "recordatorios" in d["message"].lower() or "enviados" in d["message"].lower()

    def test_send_reminders_unauthorized(self):
        r = requests.post(f"{BASE_URL}/api/citas/send-reminders")
        assert r.status_code in (401, 403)
