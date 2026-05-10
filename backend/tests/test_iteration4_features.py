"""
Test suite for Iteration 4 Features - Tramilex
Tests:
1. Company creates workers with extended fields (as company role)
2. Company uploads regular documents for workers
3. Company uploads signed documents (category=firmado)
4. Company sees document review status
5. Admin signed-documents endpoint
6. Admin sees signed documents count on worker rows
7. Company can delete workers
"""
import pytest
import requests
import os
import time
import io

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Admin credentials
ADMIN_EMAIL = "malcafuz@tramilex.es"
ADMIN_PASSWORD = "Admin123!"

# Company credentials from test_credentials.md
COMPANY_CIF = "B99887766"
COMPANY_PASSWORD = "1ecGfiRCef"
COMPANY_ID = "6a00780ee55b71e220d78939"

# Test worker ID from context
TEST_WORKER_ID = "6a007844e55b71e220d7893b"


@pytest.fixture(scope="module")
def admin_token():
    """Get admin token for authenticated requests"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    if response.status_code != 200:
        pytest.skip(f"Admin login failed: {response.text}")
    return response.json()["token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    """Headers with admin auth token"""
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def company_token():
    """Get company token for authenticated requests"""
    response = requests.post(f"{BASE_URL}/api/auth/company-login", json={
        "email": COMPANY_CIF,
        "password": COMPANY_PASSWORD
    })
    if response.status_code != 200:
        pytest.skip(f"Company login failed: {response.text}")
    return response.json()["token"]


@pytest.fixture(scope="module")
def company_headers(company_token):
    """Headers with company auth token"""
    return {"Authorization": f"Bearer {company_token}"}


class TestCompanyLogin:
    """Test company login with CIF/NIF"""
    
    def test_company_login_success(self):
        """Company can login with CIF/NIF and password"""
        response = requests.post(f"{BASE_URL}/api/auth/company-login", json={
            "email": COMPANY_CIF,
            "password": COMPANY_PASSWORD
        })
        assert response.status_code == 200, f"Company login failed: {response.text}"
        
        data = response.json()
        assert "token" in data, "No token in response"
        assert data["role"] == "company", f"Expected company role, got {data['role']}"
        assert data["cif_nif"] == COMPANY_CIF, "CIF/NIF mismatch"
        print(f"✓ Company login successful: {data['name']} (CIF: {data['cif_nif']})")
    
    def test_company_login_wrong_password(self):
        """Company login fails with wrong password"""
        response = requests.post(f"{BASE_URL}/api/auth/company-login", json={
            "email": COMPANY_CIF,
            "password": "wrongpassword"
        })
        assert response.status_code == 401, "Should reject wrong password"
        print(f"✓ Wrong password correctly rejected")


class TestCompanyCreatesWorkers:
    """Test company creating workers with extended fields"""
    
    def test_company_can_create_worker_with_extended_fields(self, company_headers):
        """Company can create worker with all extended fields"""
        worker_data = {
            "name": "TEST_Juan",
            "last_name": "Garcia Lopez",
            "nie": "X9876543B",
            "dni": "12345678Z",
            "passport_number": "CD987654",
            "rut": "12.345.678-9",
            "phone": "+34 612 345 678",
            "phone2": "+34 698 765 432",
            "email": "test.worker@example.com",
            "address": "Calle Test 123, Piso 4",
            "nationality": "Colombia",
            "origin_country": "Colombia",
            "residence_country": "Espana",
            "father_name": "Pedro Garcia Martinez",
            "mother_name": "Maria Lopez Fernandez",
            "children": ["Ana Garcia", "Luis Garcia"]
        }
        
        response = requests.post(
            f"{BASE_URL}/api/companies/{COMPANY_ID}/workers",
            json=worker_data,
            headers=company_headers
        )
        assert response.status_code == 200, f"Create worker failed: {response.text}"
        
        data = response.json()
        assert "id" in data, "No worker ID returned"
        print(f"✓ Company created worker with extended fields: {worker_data['name']} {worker_data['last_name']}")
        
        # Store worker ID for later tests
        TestCompanyCreatesWorkers.created_worker_id = data["id"]
        return data["id"]
    
    def test_company_can_list_workers(self, company_headers):
        """Company can list its workers via /company/workers"""
        response = requests.get(f"{BASE_URL}/api/company/workers", headers=company_headers)
        assert response.status_code == 200, f"List workers failed: {response.text}"
        
        workers = response.json()
        assert isinstance(workers, list), "Response should be a list"
        
        # Find our test worker
        test_worker = next((w for w in workers if w["name"] == "TEST_Juan"), None)
        assert test_worker is not None, "Test worker not found in list"
        
        # Verify extended fields are returned
        assert "last_name" in test_worker, "Missing last_name field"
        assert "dni" in test_worker, "Missing dni field"
        assert "rut" in test_worker, "Missing rut field"
        assert "phone2" in test_worker, "Missing phone2 field"
        assert "origin_country" in test_worker, "Missing origin_country field"
        assert "residence_country" in test_worker, "Missing residence_country field"
        assert "father_name" in test_worker, "Missing father_name field"
        assert "mother_name" in test_worker, "Missing mother_name field"
        assert "children" in test_worker, "Missing children field"
        assert "doc_count" in test_worker, "Missing doc_count field"
        assert "reviewed_count" in test_worker, "Missing reviewed_count field"
        assert "signed_count" in test_worker, "Missing signed_count field"
        
        print(f"✓ Company can list workers with all extended fields ({len(workers)} workers)")
    
    def test_worker_extended_fields_persisted(self, company_headers):
        """Verify extended fields are correctly persisted"""
        response = requests.get(f"{BASE_URL}/api/company/workers", headers=company_headers)
        workers = response.json()
        test_worker = next((w for w in workers if w["name"] == "TEST_Juan"), None)
        
        assert test_worker is not None, "Test worker not found"
        assert test_worker["last_name"] == "Garcia Lopez", f"last_name mismatch: {test_worker.get('last_name')}"
        assert test_worker["dni"] == "12345678Z", f"dni mismatch: {test_worker.get('dni')}"
        assert test_worker["rut"] == "12.345.678-9", f"rut mismatch: {test_worker.get('rut')}"
        assert test_worker["origin_country"] == "Colombia", f"origin_country mismatch: {test_worker.get('origin_country')}"
        assert test_worker["residence_country"] == "Espana", f"residence_country mismatch: {test_worker.get('residence_country')}"
        assert test_worker["father_name"] == "Pedro Garcia Martinez", f"father_name mismatch: {test_worker.get('father_name')}"
        assert test_worker["mother_name"] == "Maria Lopez Fernandez", f"mother_name mismatch: {test_worker.get('mother_name')}"
        assert "Ana Garcia" in test_worker.get("children", []), "children not persisted correctly"
        
        print(f"✓ All extended fields correctly persisted")


class TestCompanyDocumentUpload:
    """Test company uploading documents for workers"""
    
    @pytest.fixture(autouse=True)
    def get_worker_id(self, company_headers):
        """Get test worker ID"""
        response = requests.get(f"{BASE_URL}/api/company/workers", headers=company_headers)
        workers = response.json()
        test_worker = next((w for w in workers if w["name"] == "TEST_Juan"), None)
        if not test_worker:
            pytest.skip("Test worker not found")
        self.worker_id = test_worker["id"]
        self.company_headers = company_headers
    
    def test_company_upload_regular_document(self):
        """Company can upload regular document for worker"""
        # Create a simple PDF-like file
        file_content = b"%PDF-1.4 test document content"
        files = {
            'file': ('test_regular_doc.pdf', io.BytesIO(file_content), 'application/pdf')
        }
        data = {
            'category': 'identificacion',
            'uploaded_by': 'company'
        }
        
        response = requests.post(
            f"{BASE_URL}/api/companies/{COMPANY_ID}/workers/{self.worker_id}/documents/upload",
            files=files,
            data=data,
            headers=self.company_headers
        )
        assert response.status_code == 200, f"Upload document failed: {response.text}"
        
        doc_data = response.json()
        assert "id" in doc_data, "No document ID returned"
        
        # Verify document was created with correct category by fetching documents list
        docs_response = requests.get(
            f"{BASE_URL}/api/companies/{COMPANY_ID}/workers/{self.worker_id}/documents",
            headers=self.company_headers
        )
        docs = docs_response.json()
        uploaded_doc = next((d for d in docs if d["id"] == doc_data["id"]), None)
        assert uploaded_doc is not None, "Uploaded document not found in list"
        assert uploaded_doc["category"] == "identificacion", f"Category mismatch: {uploaded_doc.get('category')}"
        assert uploaded_doc["status"] == "pending_review", f"Status should be pending_review: {uploaded_doc.get('status')}"
        
        print(f"✓ Company uploaded regular document: {uploaded_doc['original_filename']} (category: {uploaded_doc['category']})")
        TestCompanyDocumentUpload.regular_doc_id = doc_data["id"]
    
    def test_company_upload_signed_document(self):
        """Company can upload signed document (category=firmado)"""
        file_content = b"%PDF-1.4 signed document content"
        files = {
            'file': ('signed_contract.pdf', io.BytesIO(file_content), 'application/pdf')
        }
        data = {
            'category': 'firmado',
            'uploaded_by': 'company'
        }
        
        response = requests.post(
            f"{BASE_URL}/api/companies/{COMPANY_ID}/workers/{self.worker_id}/documents/upload",
            files=files,
            data=data,
            headers=self.company_headers
        )
        assert response.status_code == 200, f"Upload signed document failed: {response.text}"
        
        doc_data = response.json()
        assert "id" in doc_data, "No document ID returned"
        
        # Verify document was created with 'firmado' category
        docs_response = requests.get(
            f"{BASE_URL}/api/companies/{COMPANY_ID}/workers/{self.worker_id}/documents",
            headers=self.company_headers
        )
        docs = docs_response.json()
        uploaded_doc = next((d for d in docs if d["id"] == doc_data["id"]), None)
        assert uploaded_doc is not None, "Uploaded signed document not found in list"
        assert uploaded_doc["category"] == "firmado", f"Category should be 'firmado': {uploaded_doc.get('category')}"
        
        print(f"✓ Company uploaded signed document: {uploaded_doc['original_filename']} (category: {uploaded_doc['category']})")
        TestCompanyDocumentUpload.signed_doc_id = doc_data["id"]
    
    def test_company_can_list_worker_documents(self):
        """Company can list documents for a worker"""
        response = requests.get(
            f"{BASE_URL}/api/companies/{COMPANY_ID}/workers/{self.worker_id}/documents",
            headers=self.company_headers
        )
        assert response.status_code == 200, f"List documents failed: {response.text}"
        
        docs = response.json()
        assert isinstance(docs, list), "Response should be a list"
        
        # Check for signed document
        signed_docs = [d for d in docs if d.get("category") == "firmado"]
        assert len(signed_docs) > 0, "No signed documents found"
        
        # Check document has status field
        for doc in docs:
            assert "status" in doc, "Document missing status field"
            assert doc["status"] in ["pending_review", "reviewed"], f"Invalid status: {doc['status']}"
        
        print(f"✓ Company can list worker documents ({len(docs)} docs, {len(signed_docs)} signed)")


class TestDocumentReviewStatus:
    """Test document review status visibility"""
    
    @pytest.fixture(autouse=True)
    def setup(self, company_headers, admin_headers):
        """Get worker and document IDs"""
        response = requests.get(f"{BASE_URL}/api/company/workers", headers=company_headers)
        workers = response.json()
        test_worker = next((w for w in workers if w["name"] == "TEST_Juan"), None)
        if not test_worker:
            pytest.skip("Test worker not found")
        self.worker_id = test_worker["id"]
        self.company_headers = company_headers
        self.admin_headers = admin_headers
    
    def test_document_status_pending_by_default(self):
        """New documents have pending_review status"""
        response = requests.get(
            f"{BASE_URL}/api/companies/{COMPANY_ID}/workers/{self.worker_id}/documents",
            headers=self.company_headers
        )
        docs = response.json()
        
        # At least one document should be pending
        pending_docs = [d for d in docs if d["status"] == "pending_review"]
        assert len(pending_docs) > 0, "No pending documents found"
        print(f"✓ Documents have pending_review status by default")
    
    def test_admin_can_mark_document_reviewed(self):
        """Admin can mark document as reviewed"""
        # Get a document ID
        response = requests.get(
            f"{BASE_URL}/api/companies/{COMPANY_ID}/workers/{self.worker_id}/documents",
            headers=self.company_headers
        )
        docs = response.json()
        if not docs:
            pytest.skip("No documents to review")
        
        doc_id = docs[0]["id"]
        
        # Admin marks as reviewed
        review_response = requests.put(
            f"{BASE_URL}/api/company-documents/{doc_id}/status",
            json={"status": "reviewed"},
            headers=self.admin_headers
        )
        assert review_response.status_code == 200, f"Mark reviewed failed: {review_response.text}"
        print(f"✓ Admin can mark document as reviewed")
    
    def test_company_sees_reviewed_status(self):
        """Company can see reviewed status on documents"""
        response = requests.get(
            f"{BASE_URL}/api/companies/{COMPANY_ID}/workers/{self.worker_id}/documents",
            headers=self.company_headers
        )
        docs = response.json()
        
        reviewed_docs = [d for d in docs if d["status"] == "reviewed"]
        assert len(reviewed_docs) > 0, "No reviewed documents visible to company"
        print(f"✓ Company can see reviewed status ({len(reviewed_docs)} reviewed)")


class TestAdminSignedDocuments:
    """Test admin signed-documents endpoint"""
    
    def test_admin_signed_documents_endpoint(self, admin_headers):
        """Admin can get all signed documents across companies"""
        response = requests.get(f"{BASE_URL}/api/admin/signed-documents", headers=admin_headers)
        assert response.status_code == 200, f"Get signed documents failed: {response.text}"
        
        docs = response.json()
        assert isinstance(docs, list), "Response should be a list"
        
        # Verify document structure
        if docs:
            doc = docs[0]
            assert "id" in doc, "Missing id field"
            assert "original_filename" in doc, "Missing original_filename field"
            assert "worker_name" in doc, "Missing worker_name field"
            assert "company_name" in doc, "Missing company_name field"
            assert "status" in doc, "Missing status field"
            assert "uploaded_at" in doc, "Missing uploaded_at field"
        
        print(f"✓ Admin signed-documents endpoint returns {len(docs)} signed documents")
    
    def test_signed_documents_have_company_info(self, admin_headers):
        """Signed documents include company and worker info"""
        response = requests.get(f"{BASE_URL}/api/admin/signed-documents", headers=admin_headers)
        docs = response.json()
        
        if not docs:
            pytest.skip("No signed documents to verify")
        
        for doc in docs:
            assert doc.get("company_name"), f"Missing company_name: {doc}"
            assert doc.get("worker_name"), f"Missing worker_name: {doc}"
            assert doc.get("company_id"), f"Missing company_id: {doc}"
            assert doc.get("worker_id"), f"Missing worker_id: {doc}"
        
        print(f"✓ Signed documents include company and worker info")


class TestAdminWorkerSignedCount:
    """Test admin sees signed documents count on worker rows"""
    
    def test_admin_company_detail_shows_signed_count(self, admin_headers):
        """Admin company detail shows signed_count for workers"""
        response = requests.get(f"{BASE_URL}/api/companies/{COMPANY_ID}", headers=admin_headers)
        assert response.status_code == 200, f"Get company detail failed: {response.text}"
        
        data = response.json()
        workers = data.get("workers", [])
        
        # Find test worker
        test_worker = next((w for w in workers if w["name"] == "TEST_Juan"), None)
        if test_worker:
            assert "signed_count" in test_worker, "Missing signed_count field"
            assert test_worker["signed_count"] >= 0, "signed_count should be >= 0"
            print(f"✓ Admin sees signed_count on worker: {test_worker['name']} ({test_worker['signed_count']} signed)")
        else:
            # Check any worker has signed_count
            for w in workers:
                assert "signed_count" in w, f"Worker {w['name']} missing signed_count"
            print(f"✓ Admin sees signed_count on all workers")


class TestCompanyDeleteWorker:
    """Test company can delete workers"""
    
    def test_company_can_delete_worker(self, company_headers):
        """Company can delete its own worker"""
        # Get test worker ID
        response = requests.get(f"{BASE_URL}/api/company/workers", headers=company_headers)
        workers = response.json()
        test_worker = next((w for w in workers if w["name"] == "TEST_Juan"), None)
        
        if not test_worker:
            pytest.skip("Test worker not found")
        
        worker_id = test_worker["id"]
        
        # Delete worker
        delete_response = requests.delete(
            f"{BASE_URL}/api/companies/{COMPANY_ID}/workers/{worker_id}",
            headers=company_headers
        )
        assert delete_response.status_code == 200, f"Delete worker failed: {delete_response.text}"
        
        # Verify worker is deleted
        verify_response = requests.get(f"{BASE_URL}/api/company/workers", headers=company_headers)
        workers_after = verify_response.json()
        deleted_worker = next((w for w in workers_after if w["id"] == worker_id), None)
        assert deleted_worker is None, "Worker should be deleted"
        
        print(f"✓ Company deleted worker: {test_worker['name']}")


class TestExistingWorkerExtendedFields:
    """Test existing worker (Carlos Garcia Lopez) has extended fields visible"""
    
    def test_existing_worker_visible_to_company(self, company_headers):
        """Existing test worker is visible to company"""
        response = requests.get(f"{BASE_URL}/api/company/workers", headers=company_headers)
        assert response.status_code == 200
        
        workers = response.json()
        carlos = next((w for w in workers if "Carlos" in w.get("name", "")), None)
        
        if carlos:
            print(f"✓ Existing worker found: {carlos['name']} {carlos.get('last_name', '')}")
            # Check extended fields
            print(f"  - NIE: {carlos.get('nie', 'N/A')}")
            print(f"  - DNI: {carlos.get('dni', 'N/A')}")
            print(f"  - Origin: {carlos.get('origin_country', 'N/A')}")
            print(f"  - Residence: {carlos.get('residence_country', 'N/A')}")
            print(f"  - Father: {carlos.get('father_name', 'N/A')}")
            print(f"  - Mother: {carlos.get('mother_name', 'N/A')}")
            print(f"  - Children: {carlos.get('children', [])}")
        else:
            print(f"ℹ Existing worker Carlos not found (may have been deleted)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
