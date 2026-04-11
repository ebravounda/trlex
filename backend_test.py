#!/usr/bin/env python3

import requests
import sys
import json
import time
from datetime import datetime
from io import BytesIO

class TramiLexAPITester:
    def __init__(self, base_url="https://inmigra-docs.preview.emergentagent.com"):
        self.base_url = base_url
        self.admin_token = None
        self.client_token = None
        self.client_id = None
        self.test_doc_id = None
        self.admin_doc_id = None
        self.tests_run = 0
        self.tests_passed = 0
        self.failed_tests = []

    def log(self, message):
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {message}")

    def run_test(self, name, method, endpoint, expected_status, data=None, files=None, token=None, response_type='json'):
        """Run a single API test"""
        url = f"{self.base_url}/api/{endpoint}"
        headers = {'Content-Type': 'application/json'} if not files else {}
        
        if token:
            headers['Authorization'] = f'Bearer {token}'

        self.tests_run += 1
        self.log(f"🔍 Testing {name}...")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=30)
            elif method == 'POST':
                if files:
                    headers.pop('Content-Type', None)  # Let requests set it for multipart
                    response = requests.post(url, files=files, data=data, headers=headers, timeout=30)
                else:
                    response = requests.post(url, json=data, headers=headers, timeout=30)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers, timeout=30)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers, timeout=30)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                self.log(f"✅ {name} - Status: {response.status_code}")
                if response_type == 'json':
                    try:
                        return True, response.json()
                    except:
                        return True, {}
                else:
                    return True, response.content
            else:
                self.log(f"❌ {name} - Expected {expected_status}, got {response.status_code}")
                try:
                    error_detail = response.json().get('detail', 'Unknown error')
                except:
                    error_detail = response.text[:200]
                self.log(f"   Error: {error_detail}")
                self.failed_tests.append({
                    'test': name,
                    'expected': expected_status,
                    'actual': response.status_code,
                    'error': error_detail
                })
                return False, {}

        except Exception as e:
            self.log(f"❌ {name} - Exception: {str(e)}")
            self.failed_tests.append({
                'test': name,
                'expected': expected_status,
                'actual': 'Exception',
                'error': str(e)
            })
            return False, {}

    def test_admin_login(self):
        """Test admin login"""
        success, response = self.run_test(
            "Admin Login",
            "POST",
            "auth/login",
            200,
            data={"email": "admin@tramilex.com", "password": "Admin123!"}
        )
        if success and 'token' in response:
            self.admin_token = response['token']
            self.log(f"   Admin token obtained: {self.admin_token[:20]}...")
            return True
        return False

    def test_client_registration(self):
        """Test client registration"""
        timestamp = int(time.time())
        test_client_data = {
            "name": f"Test Client {timestamp}",
            "email": f"testclient{timestamp}@example.com",
            "password": "TestPass123!",
            "nie": f"X{timestamp % 10000000}A",
            "passport_number": f"AB{timestamp % 1000000}",
            "phone": "+34612345678",
            "address": "Calle Test 123",
            "city": "Madrid",
            "origin_country": "Colombia",
            "residence_country": "Espana"
        }
        
        success, response = self.run_test(
            "Client Registration",
            "POST",
            "auth/register",
            200,
            data=test_client_data
        )
        if success and 'token' in response:
            self.client_token = response['token']
            self.client_id = response['id']
            self.log(f"   Client registered with ID: {self.client_id}")
            return True
        return False

    def test_client_login(self):
        """Test client login with registered credentials"""
        if not hasattr(self, 'test_client_email'):
            self.log("❌ Client Login - No test client email available")
            return False
            
        success, response = self.run_test(
            "Client Login",
            "POST", 
            "auth/login",
            200,
            data={"email": self.test_client_email, "password": "TestPass123!"}
        )
        return success

    def test_auth_me(self):
        """Test getting current user info"""
        if not self.admin_token:
            return False
            
        success, response = self.run_test(
            "Get Current User (Admin)",
            "GET",
            "auth/me",
            200,
            token=self.admin_token
        )
        return success

    def test_document_upload(self):
        """Test document upload with category"""
        if not self.client_token:
            return False
            
        # Create a test PDF file
        test_content = b"%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n/Pages 2 0 R\n>>\nendobj\n2 0 obj\n<<\n/Type /Pages\n/Kids [3 0 R]\n/Count 1\n>>\nendobj\n3 0 obj\n<<\n/Type /Page\n/Parent 2 0 R\n/MediaBox [0 0 612 792]\n>>\nendobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000074 00000 n \n0000000120 00000 n \ntrailer\n<<\n/Size 4\n/Root 1 0 R\n>>\nstartxref\n179\n%%EOF"
        
        files = {'file': ('test_document.pdf', BytesIO(test_content), 'application/pdf')}
        data = {'category': 'identificacion'}
        
        success, response = self.run_test(
            "Document Upload with Category",
            "POST",
            "documents/upload",
            200,
            files=files,
            data=data,
            token=self.client_token
        )
        if success and 'id' in response:
            self.test_doc_id = response['id']
            self.log(f"   Document uploaded with ID: {self.test_doc_id}, Category: {response.get('category', 'N/A')}")
            return True
        return False

    def test_get_documents(self):
        """Test getting user documents"""
        if not self.client_token:
            return False
            
        success, response = self.run_test(
            "Get User Documents",
            "GET",
            "documents",
            200,
            token=self.client_token
        )
        return success

    def test_document_download(self):
        """Test document download"""
        if not self.test_doc_id or not self.client_token:
            return False
            
        success, content = self.run_test(
            "Document Download",
            "GET",
            f"documents/{self.test_doc_id}/download",
            200,
            token=self.client_token,
            response_type='binary'
        )
        return success

    def test_admin_get_clients(self):
        """Test admin getting client list"""
        if not self.admin_token:
            return False
            
        success, response = self.run_test(
            "Admin Get Clients",
            "GET",
            "clients",
            200,
            token=self.admin_token
        )
        return success

    def test_admin_get_client_detail(self):
        """Test admin getting specific client details"""
        if not self.admin_token or not self.client_id:
            return False
            
        success, response = self.run_test(
            "Admin Get Client Detail",
            "GET",
            f"clients/{self.client_id}",
            200,
            token=self.admin_token
        )
        return success

    def test_admin_update_document_status(self):
        """Test admin updating document status"""
        if not self.admin_token or not self.test_doc_id:
            return False
            
        success, response = self.run_test(
            "Admin Update Document Status",
            "PUT",
            f"documents/{self.test_doc_id}/status",
            200,
            data={"status": "reviewed"},
            token=self.admin_token
        )
        return success

    def test_admin_delete_document(self):
        """Test admin deleting document"""
        if not self.admin_token or not self.test_doc_id:
            return False
            
        success, response = self.run_test(
            "Admin Delete Document",
            "DELETE",
            f"documents/{self.test_doc_id}",
            200,
            token=self.admin_token
        )
        return success

    def test_smtp_settings(self):
        """Test SMTP settings endpoints"""
        if not self.admin_token:
            return False
            
        # Get SMTP settings
        success1, response = self.run_test(
            "Get SMTP Settings",
            "GET",
            "settings/smtp",
            200,
            token=self.admin_token
        )
        
        # Update SMTP settings
        smtp_data = {
            "smtp_host": "smtp.gmail.com",
            "smtp_port": 587,
            "smtp_user": "test@example.com",
            "smtp_password": "testpass123",
            "from_email": "notifications@tramilex.com"
        }
        
        success2, response = self.run_test(
            "Update SMTP Settings",
            "PUT",
            "settings/smtp",
            200,
            data=smtp_data,
            token=self.admin_token
        )
        
        return success1 and success2

    def test_countries_list(self):
        """Test getting countries list"""
        if not self.admin_token:
            return False
            
        success, response = self.run_test(
            "Get Countries List",
            "GET",
            "clients/countries/list",
            200,
            token=self.admin_token
        )
        return success

    def test_logout(self):
        """Test logout endpoint"""
        success, response = self.run_test(
            "Logout",
            "POST",
            "auth/logout",
            200
        )
        return success

    def test_admin_upload_to_client(self):
        """Test admin uploading document to client profile"""
        if not self.admin_token or not self.client_id:
            return False
            
        # Create a test PDF file for admin upload
        test_content = b"%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n/Pages 2 0 R\n>>\nendobj\n2 0 obj\n<<\n/Type /Pages\n/Kids [3 0 R]\n/Count 1\n>>\nendobj\n3 0 obj\n<<\n/Type /Page\n/Parent 2 0 R\n/MediaBox [0 0 612 792]\n>>\nendobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000074 00000 n \n0000000120 00000 n \ntrailer\n<<\n/Size 4\n/Root 1 0 R\n>>\nstartxref\n179\n%%EOF"
        
        files = {'file': ('admin_resolution.pdf', BytesIO(test_content), 'application/pdf')}
        data = {'category': 'resolucion'}
        
        success, response = self.run_test(
            "Admin Upload to Client Profile",
            "POST",
            f"clients/{self.client_id}/documents/upload",
            200,
            files=files,
            data=data,
            token=self.admin_token
        )
        if success and 'id' in response:
            self.admin_doc_id = response['id']
            self.log(f"   Admin document uploaded with ID: {self.admin_doc_id}, uploaded_by: {response.get('uploaded_by', 'N/A')}")
            return True
        return False

    def test_bulk_download(self):
        """Test bulk download all client documents as ZIP"""
        if not self.admin_token or not self.client_id:
            return False
            
        success, content = self.run_test(
            "Bulk Download Client Documents (ZIP)",
            "GET",
            f"clients/{self.client_id}/download-all",
            200,
            token=self.admin_token,
            response_type='binary'
        )
        if success:
            self.log(f"   ZIP file downloaded, size: {len(content)} bytes")
            return True
        return False

    def test_audit_logs(self):
        """Test audit log API"""
        if not self.admin_token:
            return False
            
        # Test getting audit logs
        success, response = self.run_test(
            "Get Audit Logs",
            "GET",
            "audit",
            200,
            token=self.admin_token
        )
        
        if success:
            logs = response.get('logs', [])
            total = response.get('total', 0)
            self.log(f"   Found {total} audit logs, returned {len(logs)} logs")
            
            # Test pagination
            success2, response2 = self.run_test(
                "Get Audit Logs with Pagination",
                "GET",
                "audit?page=1&limit=10",
                200,
                token=self.admin_token
            )
            
            # Test filtering by action
            success3, response3 = self.run_test(
                "Get Audit Logs Filtered",
                "GET",
                "audit?action=document_uploaded",
                200,
                token=self.admin_token
            )
            
            return success and success2 and success3
        return False

    def test_document_categories(self):
        """Test document upload with different categories"""
        if not self.client_token:
            return False
            
        categories = ['identificacion', 'residencia', 'trabajo', 'contrato', 'fiscal', 'otros']
        success_count = 0
        
        for category in categories:
            test_content = b"%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n/Pages 2 0 R\n>>\nendobj\n2 0 obj\n<<\n/Type /Pages\n/Kids [3 0 R]\n/Count 1\n>>\nendobj\n3 0 obj\n<<\n/Type /Page\n/Parent 2 0 R\n/MediaBox [0 0 612 792]\n>>\nendobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000074 00000 n \n0000000120 00000 n \ntrailer\n<<\n/Size 4\n/Root 1 0 R\n>>\nstartxref\n179\n%%EOF"
            
            files = {'file': (f'test_{category}.pdf', BytesIO(test_content), 'application/pdf')}
            data = {'category': category}
            
            success, response = self.run_test(
                f"Document Upload - Category: {category}",
                "POST",
                "documents/upload",
                200,
                files=files,
                data=data,
                token=self.client_token
            )
            if success and response.get('category') == category:
                success_count += 1
                
        self.log(f"   Successfully tested {success_count}/{len(categories)} categories")
        return success_count == len(categories)

    def run_all_tests(self):
        """Run all tests in sequence"""
        self.log("🚀 Starting TramiLex API Tests - Iteration 2")
        self.log(f"   Base URL: {self.base_url}")
        self.log("   Testing new features: Document categories, Admin upload, Bulk download, Audit logs")
        
        # Authentication tests
        self.log("\n📋 Authentication Tests")
        self.test_admin_login()
        self.test_client_registration()
        self.test_auth_me()
        
        # Document tests with categories
        self.log("\n📄 Document Tests (with Categories)")
        self.test_document_upload()
        self.test_document_categories()
        self.test_get_documents()
        self.test_document_download()
        
        # Admin tests
        self.log("\n👨‍💼 Admin Tests")
        self.test_admin_get_clients()
        self.test_admin_get_client_detail()
        self.test_admin_update_document_status()
        self.test_countries_list()
        self.test_smtp_settings()
        
        # New features tests
        self.log("\n🆕 New Features Tests")
        self.test_admin_upload_to_client()
        self.test_bulk_download()
        self.test_audit_logs()
        
        # Cleanup
        self.log("\n🧹 Cleanup Tests")
        self.test_admin_delete_document()
        self.test_logout()
        
        # Print results
        self.log(f"\n📊 Test Results: {self.tests_passed}/{self.tests_run} passed")
        
        if self.failed_tests:
            self.log("\n❌ Failed Tests:")
            for test in self.failed_tests:
                self.log(f"   - {test['test']}: Expected {test['expected']}, got {test['actual']}")
                self.log(f"     Error: {test['error']}")
        
        return self.tests_passed == self.tests_run

def main():
    tester = TramiLexAPITester()
    success = tester.run_all_tests()
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())