"""
Test suite for Company Module (Empresas) - Tramilex
Tests: Company CRUD, Workers, Documents, Tramites, Company Login
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Admin credentials
ADMIN_EMAIL = "malcafuz@tramilex.es"
ADMIN_PASSWORD = "Admin123!"

# Test data
TEST_COMPANY_NAME = "TEST_Empresa_Prueba"
TEST_COMPANY_CIF = f"TEST{int(time.time())}"  # Unique CIF for each test run
TEST_WORKER_NAME = "TEST_Trabajador_Prueba"


class TestAdminAuth:
    """Test admin authentication"""
    
    def test_admin_login_success(self):
        """Admin can login with valid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        assert "token" in data, "No token in response"
        assert data["role"] == "admin", f"Expected admin role, got {data['role']}"
        print(f"✓ Admin login successful: {data['email']}")
        return data["token"]


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


class TestCompanyCRUD:
    """Test Company CRUD operations"""
    
    def test_create_company(self, admin_headers):
        """Admin can create a new company"""
        payload = {
            "name": TEST_COMPANY_NAME,
            "cif_nif": TEST_COMPANY_CIF,
            "email": "test@empresa.com",
            "phone": "123456789",
            "address": "Calle Test 123",
            "city": "Madrid",
            "contact_person": "Juan Test"
        }
        response = requests.post(f"{BASE_URL}/api/companies", json=payload, headers=admin_headers)
        assert response.status_code == 200, f"Create company failed: {response.text}"
        
        data = response.json()
        assert "id" in data, "No company ID returned"
        assert "password" in data, "No auto-generated password returned"
        assert data["cif_nif"] == TEST_COMPANY_CIF.upper(), "CIF/NIF not normalized to uppercase"
        assert len(data["password"]) >= 8, "Password too short"
        
        print(f"✓ Company created: {data['name']} (CIF: {data['cif_nif']})")
        print(f"  Auto-generated password: {data['password']}")
        return data
    
    def test_list_companies(self, admin_headers):
        """Admin can list all companies"""
        response = requests.get(f"{BASE_URL}/api/companies", headers=admin_headers)
        assert response.status_code == 200, f"List companies failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        # Find our test company
        test_company = next((c for c in data if c["cif_nif"] == TEST_COMPANY_CIF.upper()), None)
        assert test_company is not None, "Test company not found in list"
        assert "worker_count" in test_company, "Missing worker_count field"
        assert "tramite_count" in test_company, "Missing tramite_count field"
        
        print(f"✓ Listed {len(data)} companies")
        return test_company
    
    def test_get_company_detail(self, admin_headers):
        """Admin can get company details"""
        # First get company ID
        list_response = requests.get(f"{BASE_URL}/api/companies", headers=admin_headers)
        companies = list_response.json()
        test_company = next((c for c in companies if c["cif_nif"] == TEST_COMPANY_CIF.upper()), None)
        assert test_company is not None, "Test company not found"
        
        company_id = test_company["id"]
        response = requests.get(f"{BASE_URL}/api/companies/{company_id}", headers=admin_headers)
        assert response.status_code == 200, f"Get company detail failed: {response.text}"
        
        data = response.json()
        assert data["name"] == TEST_COMPANY_NAME, "Company name mismatch"
        assert "password_plain" in data, "Missing password_plain for admin view"
        assert "workers" in data, "Missing workers array"
        assert "tramites" in data, "Missing tramites array"
        assert "email_history" in data, "Missing email_history array"
        
        print(f"✓ Company detail retrieved: {data['name']}")
        return data
    
    def test_update_company(self, admin_headers):
        """Admin can update company details"""
        # Get company ID
        list_response = requests.get(f"{BASE_URL}/api/companies", headers=admin_headers)
        companies = list_response.json()
        test_company = next((c for c in companies if c["cif_nif"] == TEST_COMPANY_CIF.upper()), None)
        company_id = test_company["id"]
        
        update_payload = {
            "name": TEST_COMPANY_NAME + "_Updated",
            "phone": "987654321"
        }
        response = requests.put(f"{BASE_URL}/api/companies/{company_id}", json=update_payload, headers=admin_headers)
        assert response.status_code == 200, f"Update company failed: {response.text}"
        
        # Verify update
        verify_response = requests.get(f"{BASE_URL}/api/companies/{company_id}", headers=admin_headers)
        updated_data = verify_response.json()
        assert updated_data["phone"] == "987654321", "Phone not updated"
        
        print(f"✓ Company updated successfully")
    
    def test_duplicate_cif_rejected(self, admin_headers):
        """Creating company with duplicate CIF/NIF should fail"""
        payload = {
            "name": "Another Company",
            "cif_nif": TEST_COMPANY_CIF,  # Same CIF as existing
            "email": "another@test.com"
        }
        response = requests.post(f"{BASE_URL}/api/companies", json=payload, headers=admin_headers)
        assert response.status_code == 400, "Should reject duplicate CIF/NIF"
        print(f"✓ Duplicate CIF/NIF correctly rejected")


class TestCompanyWorkers:
    """Test Company Worker operations"""
    
    @pytest.fixture(autouse=True)
    def get_company_id(self, admin_headers):
        """Get test company ID"""
        list_response = requests.get(f"{BASE_URL}/api/companies", headers=admin_headers)
        companies = list_response.json()
        test_company = next((c for c in companies if TEST_COMPANY_CIF.upper() in c["cif_nif"]), None)
        if not test_company:
            pytest.skip("Test company not found")
        self.company_id = test_company["id"]
        self.admin_headers = admin_headers
    
    def test_add_worker(self):
        """Admin can add worker to company"""
        payload = {
            "name": TEST_WORKER_NAME,
            "nie": "X1234567A",
            "passport_number": "AB123456",
            "phone": "600123456",
            "email": "worker@test.com",
            "nationality": "Colombia"
        }
        response = requests.post(
            f"{BASE_URL}/api/companies/{self.company_id}/workers",
            json=payload,
            headers=self.admin_headers
        )
        assert response.status_code == 200, f"Add worker failed: {response.text}"
        
        data = response.json()
        assert "id" in data, "No worker ID returned"
        print(f"✓ Worker added: {TEST_WORKER_NAME}")
        return data["id"]
    
    def test_list_workers_in_company(self):
        """Workers appear in company detail"""
        response = requests.get(f"{BASE_URL}/api/companies/{self.company_id}", headers=self.admin_headers)
        assert response.status_code == 200
        
        data = response.json()
        workers = data.get("workers", [])
        test_worker = next((w for w in workers if w["name"] == TEST_WORKER_NAME), None)
        assert test_worker is not None, "Test worker not found in company"
        assert "doc_count" in test_worker, "Missing doc_count field"
        
        print(f"✓ Worker found in company detail")
        return test_worker["id"]
    
    def test_delete_worker(self):
        """Admin can delete worker"""
        # Get worker ID
        response = requests.get(f"{BASE_URL}/api/companies/{self.company_id}", headers=self.admin_headers)
        workers = response.json().get("workers", [])
        test_worker = next((w for w in workers if w["name"] == TEST_WORKER_NAME), None)
        
        if test_worker:
            delete_response = requests.delete(
                f"{BASE_URL}/api/companies/{self.company_id}/workers/{test_worker['id']}",
                headers=self.admin_headers
            )
            assert delete_response.status_code == 200, f"Delete worker failed: {delete_response.text}"
            print(f"✓ Worker deleted successfully")


class TestCompanyTramites:
    """Test Company Tramite operations"""
    
    @pytest.fixture(autouse=True)
    def get_company_id(self, admin_headers):
        """Get test company ID"""
        list_response = requests.get(f"{BASE_URL}/api/companies", headers=admin_headers)
        companies = list_response.json()
        test_company = next((c for c in companies if TEST_COMPANY_CIF.upper() in c["cif_nif"]), None)
        if not test_company:
            pytest.skip("Test company not found")
        self.company_id = test_company["id"]
        self.admin_headers = admin_headers
    
    def test_assign_tramite(self):
        """Admin can assign tramite to company"""
        payload = {
            "country": "espana",
            "tramite_id": "regularizacion_extraordinaria",
            "status": "pendiente",
            "notes": "Test tramite assignment"
        }
        response = requests.post(
            f"{BASE_URL}/api/companies/{self.company_id}/tramites",
            json=payload,
            headers=self.admin_headers
        )
        assert response.status_code == 200, f"Assign tramite failed: {response.text}"
        
        data = response.json()
        assert "id" in data, "No tramite ID returned"
        print(f"✓ Tramite assigned to company")
        return data["id"]
    
    def test_update_tramite_status(self):
        """Admin can update tramite status"""
        # Get tramite ID
        response = requests.get(f"{BASE_URL}/api/companies/{self.company_id}", headers=self.admin_headers)
        tramites = response.json().get("tramites", [])
        
        if not tramites:
            pytest.skip("No tramites to update")
        
        tramite_id = tramites[0]["id"]
        update_payload = {
            "status": "en_proceso",
            "notes": "Updated status"
        }
        update_response = requests.put(
            f"{BASE_URL}/api/companies/{self.company_id}/tramites/{tramite_id}",
            json=update_payload,
            headers=self.admin_headers
        )
        assert update_response.status_code == 200, f"Update tramite failed: {update_response.text}"
        print(f"✓ Tramite status updated")
    
    def test_delete_tramite(self):
        """Admin can delete tramite"""
        # Get tramite ID
        response = requests.get(f"{BASE_URL}/api/companies/{self.company_id}", headers=self.admin_headers)
        tramites = response.json().get("tramites", [])
        
        if not tramites:
            pytest.skip("No tramites to delete")
        
        tramite_id = tramites[0]["id"]
        delete_response = requests.delete(
            f"{BASE_URL}/api/companies/{self.company_id}/tramites/{tramite_id}",
            headers=self.admin_headers
        )
        assert delete_response.status_code == 200, f"Delete tramite failed: {delete_response.text}"
        print(f"✓ Tramite deleted")


class TestCompanyCredentials:
    """Test Company Credentials operations"""
    
    @pytest.fixture(autouse=True)
    def get_company_id(self, admin_headers):
        """Get test company ID"""
        list_response = requests.get(f"{BASE_URL}/api/companies", headers=admin_headers)
        companies = list_response.json()
        test_company = next((c for c in companies if TEST_COMPANY_CIF.upper() in c["cif_nif"]), None)
        if not test_company:
            pytest.skip("Test company not found")
        self.company_id = test_company["id"]
        self.admin_headers = admin_headers
    
    def test_send_credentials(self):
        """Admin can send credentials email"""
        payload = {"email": "test@example.com"}
        response = requests.post(
            f"{BASE_URL}/api/companies/{self.company_id}/send-credentials",
            json=payload,
            headers=self.admin_headers
        )
        # May fail if SMTP not configured, but endpoint should work
        assert response.status_code in [200, 400], f"Send credentials failed unexpectedly: {response.text}"
        print(f"✓ Send credentials endpoint working (status: {response.status_code})")


class TestCompanyLogin:
    """Test Company Login functionality"""
    
    @pytest.fixture(autouse=True)
    def get_company_credentials(self, admin_headers):
        """Get test company credentials"""
        list_response = requests.get(f"{BASE_URL}/api/companies", headers=admin_headers)
        companies = list_response.json()
        test_company = next((c for c in companies if TEST_COMPANY_CIF.upper() in c["cif_nif"]), None)
        if not test_company:
            pytest.skip("Test company not found")
        
        # Get full details with password
        detail_response = requests.get(f"{BASE_URL}/api/companies/{test_company['id']}", headers=admin_headers)
        company_detail = detail_response.json()
        
        self.cif_nif = company_detail["cif_nif"]
        self.password = company_detail.get("password_plain", "")
        self.company_id = test_company["id"]
        
        if not self.password:
            pytest.skip("No password available for company")
    
    def test_company_login_success(self):
        """Company can login with CIF/NIF and password"""
        response = requests.post(f"{BASE_URL}/api/auth/company-login", json={
            "email": self.cif_nif,  # CIF/NIF is passed as email
            "password": self.password
        })
        assert response.status_code == 200, f"Company login failed: {response.text}"
        
        data = response.json()
        assert "token" in data, "No token in response"
        assert data["role"] == "company", f"Expected company role, got {data['role']}"
        assert data["cif_nif"] == self.cif_nif, "CIF/NIF mismatch"
        
        print(f"✓ Company login successful: {data['name']}")
        return data["token"]
    
    def test_company_login_wrong_password(self):
        """Company login fails with wrong password"""
        response = requests.post(f"{BASE_URL}/api/auth/company-login", json={
            "email": self.cif_nif,
            "password": "wrongpassword"
        })
        assert response.status_code == 401, "Should reject wrong password"
        print(f"✓ Wrong password correctly rejected")
    
    def test_company_login_wrong_cif(self):
        """Company login fails with wrong CIF/NIF"""
        response = requests.post(f"{BASE_URL}/api/auth/company-login", json={
            "email": "INVALID123",
            "password": self.password
        })
        assert response.status_code == 401, "Should reject invalid CIF/NIF"
        print(f"✓ Invalid CIF/NIF correctly rejected")


class TestCompanyPanel:
    """Test Company Panel endpoints (authenticated as company)"""
    
    @pytest.fixture(autouse=True)
    def setup_company_auth(self, admin_headers):
        """Login as company and get token"""
        # Get company credentials
        list_response = requests.get(f"{BASE_URL}/api/companies", headers=admin_headers)
        companies = list_response.json()
        test_company = next((c for c in companies if TEST_COMPANY_CIF.upper() in c["cif_nif"]), None)
        if not test_company:
            pytest.skip("Test company not found")
        
        detail_response = requests.get(f"{BASE_URL}/api/companies/{test_company['id']}", headers=admin_headers)
        company_detail = detail_response.json()
        
        cif_nif = company_detail["cif_nif"]
        password = company_detail.get("password_plain", "")
        
        if not password:
            pytest.skip("No password available for company")
        
        # Login as company
        login_response = requests.post(f"{BASE_URL}/api/auth/company-login", json={
            "email": cif_nif,
            "password": password
        })
        if login_response.status_code != 200:
            pytest.skip(f"Company login failed: {login_response.text}")
        
        self.company_token = login_response.json()["token"]
        self.company_headers = {"Authorization": f"Bearer {self.company_token}"}
        self.company_id = test_company["id"]
        self.admin_headers = admin_headers
    
    def test_company_get_workers(self):
        """Company can get its workers list"""
        response = requests.get(f"{BASE_URL}/api/company/workers", headers=self.company_headers)
        assert response.status_code == 200, f"Get workers failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ Company can list workers ({len(data)} workers)")
    
    def test_company_get_tramites(self):
        """Company can get its tramites list"""
        response = requests.get(f"{BASE_URL}/api/company/tramites", headers=self.company_headers)
        assert response.status_code == 200, f"Get tramites failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ Company can list tramites ({len(data)} tramites)")


class TestCleanup:
    """Cleanup test data"""
    
    def test_delete_test_company(self, admin_headers):
        """Delete test company"""
        list_response = requests.get(f"{BASE_URL}/api/companies", headers=admin_headers)
        companies = list_response.json()
        
        # Find and delete all test companies
        for company in companies:
            if "TEST" in company["cif_nif"] or "TEST" in company["name"]:
                delete_response = requests.delete(
                    f"{BASE_URL}/api/companies/{company['id']}",
                    headers=admin_headers
                )
                if delete_response.status_code == 200:
                    print(f"✓ Deleted test company: {company['name']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
