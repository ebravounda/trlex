"""
Tests for iteration 8: Force password change on first login, Tutorial-seen tracking,
Staff creation defaults, Existing admin flags.
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "malcafuz@tramilex.es"
ADMIN_PASSWORD = "Admin123!"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    data = r.json()
    return data["token"], data


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    token, _ = admin_token
    return {"Authorization": f"Bearer {token}"}


# --- Existing admin flags ---
def test_existing_admin_no_force_pw_no_tutorial(admin_token):
    _, data = admin_token
    assert data.get("must_change_password") is False, "Existing admin should not require pw change"
    assert data.get("tutorial_seen") is True, "Existing admin tutorial_seen should be True"


# --- Create new staff and verify defaults + login flags ---
@pytest.fixture(scope="module")
def new_staff(admin_headers):
    unique = uuid.uuid4().hex[:8]
    email = f"TEST_staff_{unique}@tramilex.es"
    pwd = "Temp1234!"
    payload = {
        "email": email,
        "password": pwd,
        "name": f"TEST Staff {unique}",
        "phone": "+34600000000",
        "position": "Tester"
    }
    r = requests.post(f"{API}/staff", json=payload, headers=admin_headers)
    assert r.status_code == 200, r.text
    body = r.json()
    yield {"id": body["id"], "email": email, "password": pwd}
    # cleanup
    requests.delete(f"{API}/staff/{body['id']}", headers=admin_headers)


def test_new_staff_login_returns_force_pw_and_no_tutorial(new_staff):
    r = requests.post(f"{API}/auth/login", json={"email": new_staff["email"], "password": new_staff["password"]})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["must_change_password"] is True
    assert data["tutorial_seen"] is False
    assert data["role"] == "staff"
    assert "token" in data


def test_change_password_clears_flag(new_staff):
    # login to get token
    r = requests.post(f"{API}/auth/login", json={"email": new_staff["email"], "password": new_staff["password"]})
    token = r.json()["token"]
    headers = {"Authorization": f"Bearer {token}"}

    new_pwd = "NuevaClave123!"
    r2 = requests.put(f"{API}/auth/change-password", json={
        "current_password": new_staff["password"],
        "new_password": new_pwd
    }, headers=headers)
    assert r2.status_code == 200, r2.text

    # Re-login with new pw and verify flag cleared
    r3 = requests.post(f"{API}/auth/login", json={"email": new_staff["email"], "password": new_pwd})
    assert r3.status_code == 200
    data = r3.json()
    assert data["must_change_password"] is False, "must_change_password should be cleared after change"
    assert data["tutorial_seen"] is False, "tutorial_seen should still be False"

    # Old password should no longer work
    r_old = requests.post(f"{API}/auth/login", json={"email": new_staff["email"], "password": new_staff["password"]})
    assert r_old.status_code == 401

    # Update the fixture-tracked password for cleanup
    new_staff["password"] = new_pwd


def test_change_password_wrong_current_fails(new_staff):
    r = requests.post(f"{API}/auth/login", json={"email": new_staff["email"], "password": new_staff["password"]})
    token = r.json()["token"]
    headers = {"Authorization": f"Bearer {token}"}
    r2 = requests.put(f"{API}/auth/change-password", json={
        "current_password": "WrongPassword!",
        "new_password": "Whatever123!"
    }, headers=headers)
    assert r2.status_code == 400


def test_change_password_short_new_fails(new_staff):
    r = requests.post(f"{API}/auth/login", json={"email": new_staff["email"], "password": new_staff["password"]})
    token = r.json()["token"]
    headers = {"Authorization": f"Bearer {token}"}
    r2 = requests.put(f"{API}/auth/change-password", json={
        "current_password": new_staff["password"],
        "new_password": "abc"
    }, headers=headers)
    assert r2.status_code == 400


def test_tutorial_seen_marks_flag(new_staff):
    r = requests.post(f"{API}/auth/login", json={"email": new_staff["email"], "password": new_staff["password"]})
    token = r.json()["token"]
    headers = {"Authorization": f"Bearer {token}"}

    r2 = requests.put(f"{API}/auth/tutorial-seen", headers=headers)
    assert r2.status_code == 200, r2.text

    # Re-login verifies persistence
    r3 = requests.post(f"{API}/auth/login", json={"email": new_staff["email"], "password": new_staff["password"]})
    assert r3.status_code == 200
    data = r3.json()
    assert data["tutorial_seen"] is True


def test_tutorial_seen_requires_auth():
    r = requests.put(f"{API}/auth/tutorial-seen")
    assert r.status_code in (401, 403)


def test_change_password_requires_auth():
    r = requests.put(f"{API}/auth/change-password", json={
        "current_password": "x", "new_password": "xxxxxxx"
    })
    assert r.status_code in (401, 403)


def test_create_staff_requires_admin():
    r = requests.post(f"{API}/staff", json={
        "email": "TEST_noauth@example.com", "password": "Temp1234!",
        "name": "no", "phone": "", "position": ""
    })
    assert r.status_code in (401, 403)


def test_create_staff_duplicate_email_returns_400(admin_headers, new_staff):
    r = requests.post(f"{API}/staff", json={
        "email": new_staff["email"], "password": "Temp1234!",
        "name": "Duplicate", "phone": "", "position": ""
    }, headers=admin_headers)
    assert r.status_code == 400
