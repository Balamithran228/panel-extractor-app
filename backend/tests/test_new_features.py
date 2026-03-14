"""
Backend tests for new features added in iteration 2:
- PATCH /api/folders/{id} - rename folder
- POST /api/move-items - move images
- POST /api/copy-items - copy images  
- POST /api/bulk-delete - bulk delete images and folders
"""
import pytest
import base64
from io import BytesIO
from PIL import Image as PILImage


class TestFolderRename:
    """Test folder rename endpoint"""

    @pytest.fixture
    def test_folder(self, base_url, api_client):
        """Create a test folder"""
        response = api_client.post(
            f"{base_url}/api/folders",
            json={"name": "TEST_Original_Name"}
        )
        return response.json()

    def test_rename_folder_success(self, base_url, api_client, test_folder):
        """Test PATCH /api/folders/{id} renames folder"""
        folder_id = test_folder["id"]
        response = api_client.patch(
            f"{base_url}/api/folders/{folder_id}",
            json={"name": "TEST_Renamed_Folder"}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data["name"] == "TEST_Renamed_Folder"
        assert "message" in data
        
        # Verify folder was actually renamed in database
        get_response = api_client.get(f"{base_url}/api/folders/{folder_id}")
        assert get_response.status_code == 200
        folder = get_response.json()
        assert folder["name"] == "TEST_Renamed_Folder"

    def test_rename_nonexistent_folder(self, base_url, api_client):
        """Test PATCH /api/folders/{id} returns 404 for missing folder"""
        response = api_client.patch(
            f"{base_url}/api/folders/nonexistent-folder-id",
            json={"name": "New Name"}
        )
        assert response.status_code == 404


class TestMoveItems:
    """Test move items endpoint"""

    @pytest.fixture
    def test_image_and_folder(self, base_url, api_client):
        """Create test image and folder"""
        # Create image
        img = PILImage.new('RGB', (200, 400), color='purple')
        buffer = BytesIO()
        img.save(buffer, format='PNG')
        b64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
        
        img_response = api_client.post(
            f"{base_url}/api/images/upload",
            json={"base64_data": b64, "filename": "TEST_move_image.png"}
        )
        
        # Create folder
        folder_response = api_client.post(
            f"{base_url}/api/folders",
            json={"name": "TEST_Move_Folder"}
        )
        
        return {
            "image_id": img_response.json()["id"],
            "folder_id": folder_response.json()["id"]
        }

    def test_move_image_to_folder(self, base_url, api_client, test_image_and_folder):
        """Test POST /api/move-items moves image to folder"""
        image_id = test_image_and_folder["image_id"]
        folder_id = test_image_and_folder["folder_id"]
        
        response = api_client.post(
            f"{base_url}/api/move-items",
            json={"image_ids": [image_id], "target_folder_id": folder_id}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data["moved"] == 1
        
        # Verify image was moved
        img_response = api_client.get(f"{base_url}/api/images/{image_id}")
        assert img_response.status_code == 200
        image = img_response.json()
        assert image["folder_id"] == folder_id

    def test_move_image_to_root(self, base_url, api_client):
        """Test POST /api/move-items moves image to root (null folder_id)"""
        # Create image in a folder first
        img = PILImage.new('RGB', (200, 400), color='orange')
        buffer = BytesIO()
        img.save(buffer, format='PNG')
        b64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
        
        img_response = api_client.post(
            f"{base_url}/api/images/upload",
            json={"base64_data": b64, "filename": "TEST_move_to_root.png"}
        )
        image_id = img_response.json()["id"]
        
        # Move to root (target_folder_id = null)
        response = api_client.post(
            f"{base_url}/api/move-items",
            json={"image_ids": [image_id], "target_folder_id": None}
        )
        assert response.status_code == 200
        assert response.json()["moved"] == 1

    def test_move_nonexistent_folder(self, base_url, api_client):
        """Test POST /api/move-items returns 404 for nonexistent destination folder"""
        response = api_client.post(
            f"{base_url}/api/move-items",
            json={"image_ids": ["some-image-id"], "target_folder_id": "nonexistent-folder"}
        )
        assert response.status_code == 404


class TestCopyItems:
    """Test copy items endpoint"""

    @pytest.fixture
    def test_image(self, base_url, api_client):
        """Create test image"""
        img = PILImage.new('RGB', (200, 400), color='cyan')
        buffer = BytesIO()
        img.save(buffer, format='PNG')
        b64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
        
        response = api_client.post(
            f"{base_url}/api/images/upload",
            json={"base64_data": b64, "filename": "TEST_copy_image.png"}
        )
        return response.json()

    def test_copy_image_success(self, base_url, api_client, test_image):
        """Test POST /api/copy-items creates copy of image"""
        image_id = test_image["id"]
        
        response = api_client.post(
            f"{base_url}/api/copy-items",
            json={"image_ids": [image_id]}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data["copied"] == 1
        assert len(data["items"]) == 1
        
        copied_image = data["items"][0]
        assert copied_image["id"] != image_id
        assert "Copy_" in copied_image["filename"]
        assert copied_image["width"] == test_image["width"]
        assert copied_image["height"] == test_image["height"]
        
        # Verify both original and copy exist
        orig_response = api_client.get(f"{base_url}/api/images/{image_id}")
        assert orig_response.status_code == 200
        
        copy_response = api_client.get(f"{base_url}/api/images/{copied_image['id']}")
        assert copy_response.status_code == 200

    def test_copy_multiple_images(self, base_url, api_client):
        """Test POST /api/copy-items copies multiple images"""
        # Create 2 test images
        ids = []
        for i in range(2):
            img = PILImage.new('RGB', (200, 400), color='yellow')
            buffer = BytesIO()
            img.save(buffer, format='PNG')
            b64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
            
            response = api_client.post(
                f"{base_url}/api/images/upload",
                json={"base64_data": b64, "filename": f"TEST_copy_multi_{i}.png"}
            )
            ids.append(response.json()["id"])
        
        # Copy both
        response = api_client.post(
            f"{base_url}/api/copy-items",
            json={"image_ids": ids}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data["copied"] == 2
        assert len(data["items"]) == 2


class TestBulkDelete:
    """Test bulk delete endpoint"""

    def test_bulk_delete_images(self, base_url, api_client):
        """Test POST /api/bulk-delete deletes multiple images"""
        # Create 2 test images
        ids = []
        for i in range(2):
            img = PILImage.new('RGB', (200, 400), color='magenta')
            buffer = BytesIO()
            img.save(buffer, format='PNG')
            b64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
            
            response = api_client.post(
                f"{base_url}/api/images/upload",
                json={"base64_data": b64, "filename": f"TEST_bulk_delete_{i}.png"}
            )
            ids.append(response.json()["id"])
        
        # Bulk delete
        response = api_client.post(
            f"{base_url}/api/bulk-delete",
            json={"image_ids": ids, "folder_ids": []}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data["deleted_images"] == 2
        assert data["deleted_folders"] == 0
        
        # Verify images are deleted
        for img_id in ids:
            get_response = api_client.get(f"{base_url}/api/images/{img_id}")
            assert get_response.status_code == 404

    def test_bulk_delete_folders(self, base_url, api_client):
        """Test POST /api/bulk-delete deletes multiple folders"""
        # Create 2 test folders
        ids = []
        for i in range(2):
            response = api_client.post(
                f"{base_url}/api/folders",
                json={"name": f"TEST_Bulk_Delete_Folder_{i}"}
            )
            ids.append(response.json()["id"])
        
        # Bulk delete
        response = api_client.post(
            f"{base_url}/api/bulk-delete",
            json={"image_ids": [], "folder_ids": ids}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data["deleted_images"] == 0
        assert data["deleted_folders"] == 2
        
        # Verify folders are deleted
        for folder_id in ids:
            get_response = api_client.get(f"{base_url}/api/folders/{folder_id}")
            assert get_response.status_code == 404

    def test_bulk_delete_mixed(self, base_url, api_client):
        """Test POST /api/bulk-delete deletes both images and folders"""
        # Create 1 image
        img = PILImage.new('RGB', (200, 400), color='brown')
        buffer = BytesIO()
        img.save(buffer, format='PNG')
        b64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
        
        img_response = api_client.post(
            f"{base_url}/api/images/upload",
            json={"base64_data": b64, "filename": "TEST_mixed_delete.png"}
        )
        image_id = img_response.json()["id"]
        
        # Create 1 folder
        folder_response = api_client.post(
            f"{base_url}/api/folders",
            json={"name": "TEST_Mixed_Delete_Folder"}
        )
        folder_id = folder_response.json()["id"]
        
        # Bulk delete both
        response = api_client.post(
            f"{base_url}/api/bulk-delete",
            json={"image_ids": [image_id], "folder_ids": [folder_id]}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data["deleted_images"] == 1
        assert data["deleted_folders"] == 1
