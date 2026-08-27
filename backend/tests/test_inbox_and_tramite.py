"""Tests for Outlook Graph Inbox and Company tramite-requirements endpoints."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://inmigra-docs.preview.emergentagent.com").rstrip("/")

ADMIN_EMAIL = "malcafuz@tramilex.es"
ADMIN_PASSWORD = "Admin123!"
COMPANY_CIF = "B99887766"
COMPANY_PWD = "1ecGfiRCef"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def company_token():
    r = requests.post(f"{BASE_URL}/api/auth/company-login",
                      json={"email": COMPANY_CIF, "password": COMPANY_PWD}, timeout=30)
    assert r.status_code == 200, f"Company login failed: {r.status_code} {r.text}"
    return r.json()["token"]


# --- Inbox tests (Microsoft Graph) ---
class TestInbox:
    def test_inbox_unauthorized(self):
        r = requests.get(f"{BASE_URL}/api/inbox", timeout=30)
        assert r.status_code in (401, 403), f"Should require auth, got {r.status_code}"

    def test_inbox_returns_emails(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/inbox",
                         headers={"Authorization": f"Bearer {admin_token}"}, timeout=60)
        assert r.status_code == 200, f"/api/inbox failed: {r.status_code} {r.text[:500]}"
        data = r.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"Inbox returned {len(data)} emails")
        # Task states: inbox has at least 1 test email
        assert len(data) >= 1, f"Expected at least 1 email, got {len(data)}. Body: {r.text[:500]}"
        e = data[0]
        for key in ("id", "subject", "from", "date", "body", "attachments", "has_attachments"):
            assert key in e, f"Missing key {key} in email response"
        print(f"First email: subj='{e['subject']}' from='{e['from']}' has_att={e['has_attachments']}")

    def test_inbox_attachment_download(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/inbox",
                         headers={"Authorization": f"Bearer {admin_token}"}, timeout=60)
        assert r.status_code == 200
        emails = r.json()
        target = None
        for e in emails:
            if e.get("has_attachments") and e.get("attachments"):
                target = e
                break
        if not target:
            pytest.skip("No email with attachments to test download")
        msg_id = target["id"]
        att_id = target["attachments"][0]["id"]
        r2 = requests.get(f"{BASE_URL}/api/inbox/attachment/{msg_id}/{att_id}",
                          headers={"Authorization": f"Bearer {admin_token}"}, timeout=60)
        assert r2.status_code == 200, f"Attachment download failed: {r2.status_code} {r2.text[:200]}"
        assert len(r2.content) > 0, "Empty attachment content"
        assert "attachment" in r2.headers.get("Content-Disposition", "").lower()
        print(f"Attachment downloaded: {len(r2.content)} bytes, filename={target['attachments'][0]['filename']}")


# --- Company tramite-requirements ---
class TestCompanyTramiteRequirements:
    def test_unauthorized(self):
        r = requests.get(f"{BASE_URL}/api/company/tramite-requirements", timeout=30)
        assert r.status_code in (401, 403)

    def test_admin_cannot_call(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/company/tramite-requirements",
                         headers={"Authorization": f"Bearer {admin_token}"}, timeout=30)
        # require_company should reject admin
        assert r.status_code in (401, 403), f"Admin should not access, got {r.status_code}"

    def test_company_gets_requirements(self, company_token):
        r = requests.get(f"{BASE_URL}/api/company/tramite-requirements",
                         headers={"Authorization": f"Bearer {company_token}"}, timeout=30)
        assert r.status_code == 200, f"Failed: {r.status_code} {r.text[:400]}"
        data = r.json()
        assert isinstance(data, list)
        print(f"Company has {len(data)} tramite requirements")
        # Company should have regularizacion_extraordinaria assigned
        assert len(data) >= 1, "Expected at least 1 tramite for company"
        found = False
        for t in data:
            for key in ("tramite_id", "tramite_name", "country", "status", "requirements"):
                assert key in t, f"Missing {key} in tramite entry"
            if t["tramite_id"] == "regularizacion_extraordinaria":
                found = True
                print(f"Found tramite: {t['tramite_name']} ({t['country']}) status={t['status']}")
                print(f"  requirements: {len(t.get('requirements', []))}")
                print(f"  docs_persona: {len(t.get('docs_persona', []))}")
        assert found, f"regularizacion_extraordinaria not found in {[t['tramite_id'] for t in data]}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
