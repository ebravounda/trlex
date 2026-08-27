"""Backend tests for Citas (Appointments) + Billing/Contabilidad modules."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://inmigra-docs.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "malcafuz@tramilex.es"
ADMIN_PASSWORD = "Admin123!"


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("token") or data.get("access_token")
    assert tok, f"No token in login response: {data}"
    return tok


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# --- Citas config (public) ---
class TestCitasConfig:
    def test_citas_config_public(self):
        r = requests.get(f"{API}/citas/config", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "offices" in d
        assert "chile" in d["offices"]
        assert "spain" in d["offices"]
        assert d["offices"]["chile"]["name"] == "Oficina Santiago"
        assert d["offices"]["spain"]["name"] == "Oficina Madrid"
        for k in ["blocked_dates", "start_hour", "end_hour", "slot_duration", "price_amount", "price_currency"]:
            assert k in d

    def test_available_slots_public(self):
        r = requests.get(f"{API}/citas/available-slots", params={"date": "2026-09-15", "location": "spain"}, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "slots" in d and isinstance(d["slots"], list)
        assert "blocked" in d

    def test_available_slots_chile(self):
        r = requests.get(f"{API}/citas/available-slots", params={"date": "2026-10-20", "location": "chile"}, timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json().get("slots"), list)


# --- Citas admin endpoints ---
class TestCitasAdmin:
    def test_list_appointments_unauthorized(self):
        r = requests.get(f"{API}/citas", timeout=15)
        assert r.status_code in (401, 403)

    def test_list_appointments_admin(self, admin_headers):
        r = requests.get(f"{API}/citas", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_unconfirmed_count(self, admin_headers):
        r = requests.get(f"{API}/citas/unconfirmed-count", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        assert "count" in r.json()
        assert isinstance(r.json()["count"], int)

    def test_update_config_admin(self, admin_headers):
        # Update config, verify with GET
        payload = {
            "blocked_dates": ["2026-12-25"],
            "start_hour": 9,
            "end_hour": 18,
            "slot_duration": 45,
            "price_amount": 5000,
            "price_currency": "eur",
        }
        r = requests.put(f"{API}/citas/config", json=payload, headers=admin_headers, timeout=15)
        assert r.status_code == 200
        r2 = requests.get(f"{API}/citas/config", timeout=15)
        d = r2.json()
        assert d["start_hour"] == 9
        assert d["end_hour"] == 18
        assert d["slot_duration"] == 45
        assert d["price_amount"] == 5000
        assert d["price_currency"] == "eur"
        assert "2026-12-25" in d["blocked_dates"]

    def test_update_config_unauthorized(self):
        r = requests.put(f"{API}/citas/config", json={
            "blocked_dates": [], "start_hour": 9, "end_hour": 18,
            "slot_duration": 45, "price_amount": 5000, "price_currency": "eur"
        }, timeout=15)
        assert r.status_code in (401, 403)


# --- Citas book (public) ---
class TestCitasBook:
    def test_book_requires_terms(self):
        payload = {
            "first_name": "TEST_Ana", "last_name": "Prueba",
            "email": "test_ana_reject@test.com", "phone": "+34600000000",
            "origin_country": "Chile", "residence_country": "Chile",
            "address": "Calle Test 1", "document_id": "12345678-9", "document_type": "RUT",
            "location": "chile", "date": "2026-11-05", "time": "09:00",
            "accept_terms": False,
        }
        r = requests.post(f"{API}/citas/book", json=payload, timeout=15)
        assert r.status_code == 400

    def test_book_invalid_location(self):
        payload = {
            "first_name": "TEST_x", "last_name": "y",
            "email": "test_x_loc@test.com", "phone": "+34600000000",
            "origin_country": "X", "residence_country": "X",
            "address": "A", "document_id": "1", "document_type": "DNI",
            "location": "france", "date": "2026-11-05", "time": "09:00",
            "accept_terms": True,
        }
        r = requests.post(f"{API}/citas/book", json=payload, timeout=15)
        assert r.status_code == 400

    def test_book_creates_stripe_session(self):
        payload = {
            "first_name": "TEST_Juan", "last_name": "Pytest",
            "email": "test_juan_pytest@test.com", "phone": "+34600123456",
            "origin_country": "Espana", "residence_country": "Espana",
            "address": "Calle Test 1, Madrid", "document_id": "X1234567Z", "document_type": "NIE",
            "location": "spain", "date": "2026-11-05", "time": "09:00",
            "accept_terms": True, "origin_url": BASE_URL,
        }
        r = requests.post(f"{API}/citas/book", json=payload, timeout=25)
        assert r.status_code == 200, f"book failed: {r.status_code} {r.text}"
        d = r.json()
        assert "checkout_url" in d
        assert d["checkout_url"].startswith("https://")
        assert "stripe.com" in d["checkout_url"] or "checkout.stripe.com" in d["checkout_url"]
        assert "session_id" in d
        assert "appointment_id" in d
        # Second booking for same slot should conflict
        r2 = requests.post(f"{API}/citas/book", json=payload, timeout=25)
        assert r2.status_code == 409

        # Cleanup: delete via admin
        # (deferred - test data prefixed with TEST_)


# --- Billing ---
class TestBilling:
    def test_billing_list_unauthorized(self):
        r = requests.get(f"{API}/billing", timeout=15)
        assert r.status_code in (401, 403)

    def test_billing_list_admin(self, admin_headers):
        r = requests.get(f"{API}/billing", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_billing_summary(self, admin_headers):
        r = requests.get(f"{API}/billing/summary", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        d = r.json()
        for k in ["total_facturado", "total_cobrado", "total_pendiente",
                  "count_pending", "count_partial", "count_paid", "count_overdue"]:
            assert k in d, f"Missing {k} in summary"

    def test_billing_crud_flow(self, admin_headers):
        # Need a client to reference. Grab first client.
        rc = requests.get(f"{API}/clients", headers=admin_headers, timeout=15)
        if rc.status_code != 200 or not rc.json():
            pytest.skip("No clients exist for billing test")
        client = rc.json()[0]
        client_id = client.get("id") or client.get("_id")

        # Create
        payload = {
            "client_type": "client",
            "client_id": client_id,
            "tramite_name": "TEST_Consulta",
            "description": "TEST billing entry",
            "amount": 100,
            "extra_per_worker": 10,
            "worker_count": 2,
            "notes": "TEST",
            "due_date": "2026-12-31",
        }
        r = requests.post(f"{API}/billing", json=payload, headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["total"] == 120  # 100 + 10*2
        bid = d["id"]

        # GET
        g = requests.get(f"{API}/billing/{bid}", headers=admin_headers, timeout=15)
        assert g.status_code == 200
        gd = g.json()
        assert gd["total"] == 120
        assert gd["balance"] == 120
        assert gd["status"] == "pendiente"

        # Add payment
        p = requests.post(f"{API}/billing/{bid}/payments",
                          json={"amount": 50, "method": "transferencia", "reference": "TEST", "notes": ""},
                          headers=admin_headers, timeout=15)
        assert p.status_code == 200
        pd = p.json()
        assert pd["paid"] == 50
        assert pd["balance"] == 70
        assert pd["status"] == "parcial"

        # Full payment
        p2 = requests.post(f"{API}/billing/{bid}/payments",
                           json={"amount": 70, "method": "efectivo", "reference": "", "notes": ""},
                           headers=admin_headers, timeout=15)
        assert p2.status_code == 200
        assert p2.json()["status"] == "pagado"

        # Delete
        de = requests.delete(f"{API}/billing/{bid}", headers=admin_headers, timeout=15)
        assert de.status_code == 200
        g2 = requests.get(f"{API}/billing/{bid}", headers=admin_headers, timeout=15)
        assert g2.status_code == 404
