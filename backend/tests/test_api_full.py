"""
Comprehensive API tests for Panel Extractor backend
Tests: health, image upload, image CRUD, folder CRUD, process with even/odd markers
"""
import pytest
import requests
import base64
from io import BytesIO
from PIL import Image as PILImage


class TestHealthEndpoint:
    """Test health check endpoint"""

    def test_health_returns_200(self, base_url, api_client):
        response = api_client.get(f"{base_url}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"


class TestImageUpload:
    """Test image upload endpoint"""

    @pytest.fixture
    def test_image_base64(self):
        """Generate a test image (400x2000 red rectangle) as base64"""
        img = PILImage.new('RGB', (400, 2000), color='red')
        buffer = BytesIO()
        img.save(buffer, format='PNG')
        img_bytes = buffer.getvalue()
        return base64.b64encode(img_bytes).decode('utf-8')

    def test_upload_image_success(self, base_url, api_client, test_image_base64):
        response = api_client.post(
            f"{base_url}/api/images/upload",
            json={"base64_data": test_image_base64, "filename": "TEST_upload.png"}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "id" in data
        assert data["filename"] == "TEST_upload.png"
        assert data["width"] == 400
        assert data["height"] == 2000
        assert data["image_type"] == "source"
        assert "created_at" in data

    def test_upload_with_data_uri_prefix(self, base_url, api_client, test_image_base64):
        """Test upload handles data:image/png;base64, prefix"""
        data_uri = f"data:image/png;base64,{test_image_base64}"
        response = api_client.post(
            f"{base_url}/api/images/upload",
            json={"base64_data": data_uri, "filename": "TEST_data_uri.png"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["filename"] == "TEST_data_uri.png"

    def test_upload_invalid_base64(self, base_url, api_client):
        """Test upload rejects invalid base64"""
        response = api_client.post(
            f"{base_url}/api/images/upload",
            json={"base64_data": "invalid_base64_data", "filename": "test.png"}
        )
        assert response.status_code == 400


class TestImageCRUD:
    """Test image CRUD operations"""

    @pytest.fixture
    def uploaded_image_id(self, base_url, api_client):
        """Upload a test image and return its ID"""
        img = PILImage.new('RGB', (200, 800), color='blue')
        buffer = BytesIO()
        img.save(buffer, format='PNG')
        b64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
        
        response = api_client.post(
            f"{base_url}/api/images/upload",
            json={"base64_data": b64, "filename": "TEST_crud_image.png"}
        )
        return response.json()["id"]

    def test_get_image_metadata(self, base_url, api_client, uploaded_image_id):
        """Test GET /api/images/{id} returns metadata"""
        response = api_client.get(f"{base_url}/api/images/{uploaded_image_id}")
        assert response.status_code == 200
        
        data = response.json()
        assert data["id"] == uploaded_image_id
        assert data["filename"] == "TEST_crud_image.png"
        assert data["width"] == 200
        assert data["height"] == 800

    def test_get_image_file(self, base_url, api_client, uploaded_image_id):
        """Test GET /api/images/{id}/file serves the image"""
        response = api_client.get(f"{base_url}/api/images/{uploaded_image_id}/file")
        assert response.status_code == 200
        assert response.headers["content-type"] == "image/png"
        assert len(response.content) > 0

    def test_list_images(self, base_url, api_client, uploaded_image_id):
        """Test GET /api/images lists all images"""
        response = api_client.get(f"{base_url}/api/images")
        assert response.status_code == 200
        
        images = response.json()
        assert isinstance(images, list)
        # Should contain at least our test image
        ids = [img["id"] for img in images]
        assert uploaded_image_id in ids

    def test_list_images_filter_by_type(self, base_url, api_client, uploaded_image_id):
        """Test GET /api/images?image_type=source filters correctly"""
        response = api_client.get(f"{base_url}/api/images?image_type=source")
        assert response.status_code == 200
        
        images = response.json()
        for img in images:
            assert img["image_type"] == "source"

    def test_delete_image(self, base_url, api_client, uploaded_image_id):
        """Test DELETE /api/images/{id} removes image"""
        response = api_client.delete(f"{base_url}/api/images/{uploaded_image_id}")
        assert response.status_code == 200
        
        # Verify image is deleted
        get_response = api_client.get(f"{base_url}/api/images/{uploaded_image_id}")
        assert get_response.status_code == 404

    def test_get_nonexistent_image(self, base_url, api_client):
        """Test GET /api/images/{id} returns 404 for missing image"""
        response = api_client.get(f"{base_url}/api/images/nonexistent-id-12345")
        assert response.status_code == 404


class TestFolderCRUD:
    """Test folder CRUD operations"""

    def test_create_folder(self, base_url, api_client):
        """Test POST /api/folders creates a folder"""
        response = api_client.post(
            f"{base_url}/api/folders",
            json={"name": "TEST_Folder_01"}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "id" in data
        assert data["name"] == "TEST_Folder_01"
        assert data["panel_count"] == 0
        assert "created_at" in data

    def test_list_folders(self, base_url, api_client):
        """Test GET /api/folders lists folders"""
        response = api_client.get(f"{base_url}/api/folders")
        assert response.status_code == 200
        
        folders = response.json()
        assert isinstance(folders, list)

    def test_get_folder_detail(self, base_url, api_client):
        """Test GET /api/folders/{id} returns folder with panels"""
        # Create folder first
        create_resp = api_client.post(
            f"{base_url}/api/folders",
            json={"name": "TEST_Folder_Detail"}
        )
        folder_id = create_resp.json()["id"]
        
        # Get folder detail
        response = api_client.get(f"{base_url}/api/folders/{folder_id}")
        assert response.status_code == 200
        
        data = response.json()
        assert data["id"] == folder_id
        assert data["name"] == "TEST_Folder_Detail"
        assert "panels" in data
        assert isinstance(data["panels"], list)

    def test_delete_folder(self, base_url, api_client):
        """Test DELETE /api/folders/{id} removes folder"""
        # Create folder
        create_resp = api_client.post(
            f"{base_url}/api/folders",
            json={"name": "TEST_Folder_Delete"}
        )
        folder_id = create_resp.json()["id"]
        
        # Delete folder
        delete_resp = api_client.delete(f"{base_url}/api/folders/{folder_id}")
        assert delete_resp.status_code == 200
        
        # Verify folder is deleted
        get_resp = api_client.get(f"{base_url}/api/folders/{folder_id}")
        assert get_resp.status_code == 404

    def test_get_nonexistent_folder(self, base_url, api_client):
        """Test GET /api/folders/{id} returns 404 for missing folder"""
        response = api_client.get(f"{base_url}/api/folders/nonexistent-folder-123")
        assert response.status_code == 404


class TestProcessEndpoint:
    """Test marker processing and panel extraction"""

    @pytest.fixture
    def test_source_image(self, base_url, api_client):
        """Upload a tall test image for processing"""
        img = PILImage.new('RGB', (400, 2000), color='green')
        buffer = BytesIO()
        img.save(buffer, format='PNG')
        b64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
        
        response = api_client.post(
            f"{base_url}/api/images/upload",
            json={"base64_data": b64, "filename": "TEST_process_source.png"}
        )
        return response.json()

    def test_process_even_markers_success(self, base_url, api_client, test_source_image):
        """Test POST /api/process extracts panels with even marker count"""
        payload = {
            "image_id": test_source_image["id"],
            "markers": [100, 300, 500, 700],  # 4 markers = 2 panels
            "display_width": 400,
            "display_height": 2000
        }
        
        response = api_client.post(f"{base_url}/api/process", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert "folder_id" in data
        assert "folder_name" in data
        assert data["panel_count"] == 2
        assert len(data["panels"]) == 2
        
        # Verify folder was created
        folder_resp = api_client.get(f"{base_url}/api/folders/{data['folder_id']}")
        assert folder_resp.status_code == 200
        
        folder = folder_resp.json()
        assert len(folder["panels"]) == 2

    def test_process_odd_markers_rejection(self, base_url, api_client, test_source_image):
        """Test POST /api/process rejects odd marker count"""
        payload = {
            "image_id": test_source_image["id"],
            "markers": [100, 300, 500],  # 3 markers = odd
            "display_width": 400,
            "display_height": 2000
        }
        
        response = api_client.post(f"{base_url}/api/process", json=payload)
        assert response.status_code == 400
        
        error = response.json()
        assert "even" in error["detail"].lower() or "odd" in error["detail"].lower()

    def test_process_too_few_markers(self, base_url, api_client, test_source_image):
        """Test POST /api/process rejects less than 2 markers"""
        payload = {
            "image_id": test_source_image["id"],
            "markers": [100],  # Only 1 marker
            "display_width": 400,
            "display_height": 2000
        }
        
        response = api_client.post(f"{base_url}/api/process", json=payload)
        assert response.status_code == 400

    def test_process_nonexistent_image(self, base_url, api_client):
        """Test POST /api/process returns 404 for missing image"""
        payload = {
            "image_id": "nonexistent-image-id",
            "markers": [100, 300],
            "display_width": 400,
            "display_height": 2000
        }
        
        response = api_client.post(f"{base_url}/api/process", json=payload)
        assert response.status_code == 404

    def test_process_with_six_markers(self, base_url, api_client, test_source_image):
        """Test POST /api/process extracts 3 panels from 6 markers"""
        payload = {
            "image_id": test_source_image["id"],
            "markers": [100, 300, 500, 700, 900, 1100],  # 6 markers = 3 panels
            "display_width": 400,
            "display_height": 2000
        }
        
        response = api_client.post(f"{base_url}/api/process", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert data["panel_count"] == 3
        assert len(data["panels"]) == 3
