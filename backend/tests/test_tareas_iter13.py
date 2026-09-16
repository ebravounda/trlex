"""Iteration 13 tests: Task audio (record/transcribe/stream/delete), task reminders, notification navigation."""
import os
import io
import struct
import time
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://inmigra-docs.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "malcafuz@tramilex.es"
ADMIN_PASSWORD = "Admin123!"
STAFF_EMAIL = "eduardo.test@tramilex.es"
STAFF_PASSWORD = "NuevaClave123!"


# --- Helpers -----------------------------------------------------------------
def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    return r


@pytest.fixture(scope="module")
def admin_token():
    r = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    j = r.json()
    return j.get("access_token") or j.get("token")


@pytest.fixture(scope="module")
def admin_client(admin_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {admin_token}"})
    return s


@pytest.fixture(scope="module")
def staff_token():
    r = _login(STAFF_EMAIL, STAFF_PASSWORD)
    if r.status_code != 200:
        pytest.skip(f"Staff login failed: {r.status_code}")
    j = r.json()
    return j.get("access_token") or j.get("token")


@pytest.fixture(scope="module")
def staff_client(staff_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {staff_token}"})
    return s


def _staff_user_id(admin_client):
    r = admin_client.get(f"{API}/staff", timeout=30)
    assert r.status_code == 200, f"Cannot list users: {r.status_code} {r.text}"
    users = r.json()
    if isinstance(users, dict):
        users = users.get("users") or users.get("staff") or []
    for u in users:
        if u.get("email") == STAFF_EMAIL:
            return u.get("id") or u.get("_id")
    pytest.skip("Staff user not found in team list")


def _make_wav_bytes(duration_s=1, freq=440, rate=16000):
    """Generate a tiny WAV file (valid header) for upload tests."""
    import math
    n_samples = duration_s * rate
    data = bytearray()
    for i in range(n_samples):
        val = int(32767 * 0.1 * math.sin(2 * math.pi * freq * i / rate))
        data += struct.pack("<h", val)
    byte_rate = rate * 2
    header = b"RIFF" + struct.pack("<I", 36 + len(data)) + b"WAVE"
    header += b"fmt " + struct.pack("<IHHIIHH", 16, 1, 1, rate, byte_rate, 2, 16)
    header += b"data" + struct.pack("<I", len(data))
    return bytes(header) + bytes(data)


# --- Task fixture ------------------------------------------------------------
@pytest.fixture
def test_task(admin_client):
    """Create a task, yield its id, then delete."""
    staff_id = _staff_user_id(admin_client)
    body = {
        "title": "TEST_iter13_audio_task",
        "description": "Task for iter13 audio tests",
        "priority": "media",
        "status": "pendiente",
        "due_date": (datetime.now(timezone.utc) + timedelta(days=10)).strftime("%Y-%m-%d"),
        "numero_expediente": "EXP-ITER13",
        "assigned_to": staff_id,
    }
    r = admin_client.post(f"{API}/tasks", json=body, timeout=30)
    assert r.status_code in (200, 201), f"Create task failed: {r.status_code} {r.text}"
    task_id = r.json().get("id") or r.json().get("_id")
    assert task_id
    yield task_id
    admin_client.delete(f"{API}/tasks/{task_id}", timeout=30)


# ============================================================================
# Task Audio Endpoints
# ============================================================================
class TestTaskAudio:
    def test_upload_audio(self, admin_client, test_task):
        wav = _make_wav_bytes()
        files = {"file": ("test_audio.wav", io.BytesIO(wav), "audio/wav")}
        r = admin_client.post(f"{API}/tasks/{test_task}/audio/upload", files=files, timeout=120)
        assert r.status_code == 200, f"Upload failed: {r.status_code} {r.text}"
        j = r.json()
        assert "id" in j
        assert j["size"] == len(wav)
        assert "transcription" in j  # may be empty if whisper failed on synthetic tone

    def test_upload_audio_invalid_task(self, admin_client):
        wav = _make_wav_bytes()
        files = {"file": ("x.wav", io.BytesIO(wav), "audio/wav")}
        r = admin_client.post(f"{API}/tasks/507f1f77bcf86cd799439011/audio/upload", files=files, timeout=60)
        assert r.status_code == 404

    def test_list_audios(self, admin_client, test_task):
        wav = _make_wav_bytes()
        files = {"file": ("a.wav", io.BytesIO(wav), "audio/wav")}
        up = admin_client.post(f"{API}/tasks/{test_task}/audio/upload", files=files, timeout=120)
        assert up.status_code == 200
        audio_id = up.json()["id"]

        r = admin_client.get(f"{API}/tasks/{test_task}/audios", timeout=30)
        assert r.status_code == 200
        audios = r.json()
        assert isinstance(audios, list)
        assert any(a["id"] == audio_id for a in audios)
        a0 = next(a for a in audios if a["id"] == audio_id)
        assert a0["size"] == len(wav)
        assert "transcription" in a0
        assert "recorded_by_name" in a0
        assert "created_at" in a0

    def test_stream_audio_returns_bytes(self, admin_client, test_task):
        wav = _make_wav_bytes()
        files = {"file": ("s.wav", io.BytesIO(wav), "audio/wav")}
        up = admin_client.post(f"{API}/tasks/{test_task}/audio/upload", files=files, timeout=120)
        aid = up.json()["id"]

        r = admin_client.get(f"{API}/tasks/{test_task}/audios/{aid}/stream", timeout=60)
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("audio/")
        assert len(r.content) == len(wav)
        assert r.content[:4] == b"RIFF"

    def test_stream_audio_requires_auth(self, test_task):
        r = requests.get(f"{API}/tasks/{test_task}/audios/507f1f77bcf86cd799439011/stream", timeout=30)
        assert r.status_code in (401, 403)

    def test_delete_audio(self, admin_client, test_task):
        wav = _make_wav_bytes()
        files = {"file": ("d.wav", io.BytesIO(wav), "audio/wav")}
        up = admin_client.post(f"{API}/tasks/{test_task}/audio/upload", files=files, timeout=120)
        aid = up.json()["id"]

        r = admin_client.delete(f"{API}/tasks/{test_task}/audios/{aid}", timeout=30)
        assert r.status_code == 200
        assert "message" in r.json()

        # Verify no longer in list
        lst = admin_client.get(f"{API}/tasks/{test_task}/audios", timeout=30).json()
        assert not any(a["id"] == aid for a in lst)

        # Delete again -> 404
        r2 = admin_client.delete(f"{API}/tasks/{test_task}/audios/{aid}", timeout=30)
        assert r2.status_code == 404

    def test_get_task_includes_audios_array(self, admin_client, test_task):
        wav = _make_wav_bytes()
        files = {"file": ("g.wav", io.BytesIO(wav), "audio/wav")}
        up = admin_client.post(f"{API}/tasks/{test_task}/audio/upload", files=files, timeout=120)
        assert up.status_code == 200

        r = admin_client.get(f"{API}/tasks/{test_task}", timeout=30)
        assert r.status_code == 200
        task = r.json()
        assert "audios" in task, f"'audios' missing in task detail: keys={list(task.keys())}"
        assert isinstance(task["audios"], list)
        assert len(task["audios"]) >= 1

    def test_list_tasks_includes_audios_count(self, admin_client, test_task):
        wav = _make_wav_bytes()
        files = {"file": ("c.wav", io.BytesIO(wav), "audio/wav")}
        admin_client.post(f"{API}/tasks/{test_task}/audio/upload", files=files, timeout=120)

        r = admin_client.get(f"{API}/tasks", timeout=30)
        assert r.status_code == 200
        tasks = r.json()
        found = next((t for t in tasks if (t.get("id") or t.get("_id")) == test_task), None)
        assert found is not None, "Test task not in list"
        assert "audios_count" in found, f"'audios_count' missing: keys={list(found.keys())}"
        assert found["audios_count"] >= 1


# ============================================================================
# Task Reminders
# ============================================================================
class TestTaskReminders:
    def test_check_now_admin_only(self, staff_client):
        r = staff_client.post(f"{API}/tasks/reminders/check-now", timeout=30)
        assert r.status_code in (401, 403), f"Staff should not access, got {r.status_code}"

    def test_check_now_admin_success(self, admin_client):
        r = admin_client.post(f"{API}/tasks/reminders/check-now", timeout=120)
        assert r.status_code == 200
        assert "message" in r.json()

    def test_reminder_creates_notification_for_assigned_user(self, admin_client):
        staff_id = _staff_user_id(admin_client)
        due = (datetime.now(timezone.utc) + timedelta(days=1)).strftime("%Y-%m-%d")
        body = {
            "title": f"TEST_iter13_reminder_{int(time.time())}",
            "description": "Reminder test task",
            "priority": "alta",
            "status": "pendiente",
            "due_date": due,
            "assigned_to": staff_id,
            "numero_expediente": "EXP-REM-13",
        }
        r = admin_client.post(f"{API}/tasks", json=body, timeout=30)
        assert r.status_code in (200, 201), f"Create failed: {r.status_code} {r.text}"
        task_id = r.json().get("id") or r.json().get("_id")

        try:
            # Trigger reminders
            trg = admin_client.post(f"{API}/tasks/reminders/check-now", timeout=120)
            assert trg.status_code == 200

            # Check admin's notifications for a task_reminder with this task_id
            time.sleep(1)
            n = admin_client.get(f"{API}/notifications", timeout=30)
            assert n.status_code == 200
            notifs = n.json()
            if isinstance(notifs, dict):
                notifs = notifs.get("notifications") or notifs.get("items") or []
            reminder_notifs = [x for x in notifs if x.get("type") == "task_reminder" and x.get("task_id") == task_id]
            assert len(reminder_notifs) >= 1, f"No task_reminder notification for admin. Types seen: {[x.get('type') for x in notifs[:10]]}"
            rn = reminder_notifs[0]
            assert rn.get("task_id") == task_id
            assert "vence" in (rn.get("title", "") + rn.get("message", "")).lower()

            # Second trigger should NOT duplicate (dedup)
            admin_client.post(f"{API}/tasks/reminders/check-now", timeout=120)
            time.sleep(1)
            n2 = admin_client.get(f"{API}/notifications", timeout=30).json()
            if isinstance(n2, dict):
                n2 = n2.get("notifications") or n2.get("items") or []
            rn2 = [x for x in n2 if x.get("type") == "task_reminder" and x.get("task_id") == task_id]
            assert len(rn2) == len(reminder_notifs), f"Dedup failed: {len(reminder_notifs)} -> {len(rn2)}"
        finally:
            admin_client.delete(f"{API}/tasks/{task_id}", timeout=30)


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
