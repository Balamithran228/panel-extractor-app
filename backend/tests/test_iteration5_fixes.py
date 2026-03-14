"""
Iteration 5 backend tests - verifying specific fixes from iteration 4:
1. copy_items now sets image_type='panel' when copying to a folder (was keeping source type)
2. Custom Modal delete confirmation flow works (verified via backend API)
3. Copy to specific folder - file serving works correctly after fix
"""
import pytest
import base64
from io import BytesIO
from PIL import Image as PILImage


def make_image_b64(w=200, h=400, color='red'):
    img = PILImage.new('RGB', (w, h), color=color)
    buf = BytesIO()
    img.save(buf, format='PNG')
    return base64.b64encode(buf.getvalue()).decode('utf-8')


def upload_image(api_client, base_url, filename="TEST_iter5.png", w=200, h=400, color='blue'):
    resp = api_client.post(
        f"{base_url}/api/images/upload",
        json={"base64_data": make_image_b64(w, h, color), "filename": filename}
    )
    assert resp.status_code == 200, f"Upload failed: {resp.text}"
    return resp.json()


def create_folder(api_client, base_url, name="TEST_iter5_folder"):
    resp = api_client.post(f"{base_url}/api/folders", json={"name": name})
    assert resp.status_code == 200, f"Folder create failed: {resp.text}"
    return resp.json()


# ─── Critical Fix 1: copy_items sets image_type='panel' when target folder is set ─────────────────
class TestCopyItemsImageTypeFix:
    """
    CRITICAL: Verifies that copying a source image to a folder correctly sets image_type='panel'
    Previously this was broken - copied image kept image_type='source' causing:
    - File stored in PANELS_DIR but served from SOURCES_DIR → HTTP 404
    - Copy not shown in target folder (query filters image_type='panel')
    - Copy shown in Source Screenshots instead of target folder
    """

    def test_copy_source_to_folder_sets_panel_type(self, base_url, api_client):
        """CRITICAL FIX: copied source image to folder must have image_type='panel'"""
        img = upload_image(api_client, base_url, filename="TEST_fix_copy_type.png")
        assert img["image_type"] == "source"
        image_id = img["id"]

        folder = create_folder(api_client, base_url, "TEST_fix_copy_target")
        folder_id = folder["id"]

        # Copy source to folder
        copy_resp = api_client.post(
            f"{base_url}/api/copy-items",
            json={"image_ids": [image_id], "target_folder_id": folder_id}
        )
        assert copy_resp.status_code == 200
        copied = copy_resp.json()["items"][0]
        copied_id = copied["id"]

        # CRITICAL ASSERTION: image_type must be 'panel' (was 'source' before fix)
        assert copied["image_type"] == "panel", (
            f"BUG: copy_items preserved 'source' type instead of setting 'panel'. "
            f"Got image_type='{copied['image_type']}'"
        )
        assert copied["folder_id"] == folder_id

        # Verify via GET /api/images/{id}
        get_resp = api_client.get(f"{base_url}/api/images/{copied_id}")
        assert get_resp.status_code == 200
        assert get_resp.json()["image_type"] == "panel"
        assert get_resp.json()["folder_id"] == folder_id

        # Cleanup
        api_client.delete(f"{base_url}/api/images/{image_id}")
        api_client.delete(f"{base_url}/api/folders/{folder_id}")

    def test_copy_source_to_folder_file_serves_correctly(self, base_url, api_client):
        """CRITICAL FIX: file must be servable after copy to folder (was 404 before)"""
        img = upload_image(api_client, base_url, filename="TEST_fix_file_serve.png", color='green')
        image_id = img["id"]

        folder = create_folder(api_client, base_url, "TEST_fix_serve_folder")
        folder_id = folder["id"]

        copy_resp = api_client.post(
            f"{base_url}/api/copy-items",
            json={"image_ids": [image_id], "target_folder_id": folder_id}
        )
        assert copy_resp.status_code == 200
        copied_id = copy_resp.json()["items"][0]["id"]

        # CRITICAL: File must be servable (was HTTP 404 before fix)
        file_resp = api_client.get(f"{base_url}/api/images/{copied_id}/file")
        assert file_resp.status_code == 200, (
            f"BUG: Copied file cannot be served. HTTP {file_resp.status_code}. "
            f"File stored in PANELS_DIR but served from wrong path."
        )
        assert file_resp.headers.get("content-type", "").startswith("image/")

        # Cleanup
        api_client.delete(f"{base_url}/api/images/{image_id}")
        api_client.delete(f"{base_url}/api/folders/{folder_id}")

    def test_copy_to_folder_appears_in_folder_detail(self, base_url, api_client):
        """CRITICAL FIX: copied image must appear in folder's panels list"""
        img = upload_image(api_client, base_url, filename="TEST_fix_folder_detail.png", color='yellow')
        image_id = img["id"]

        folder = create_folder(api_client, base_url, "TEST_fix_detail_folder")
        folder_id = folder["id"]

        copy_resp = api_client.post(
            f"{base_url}/api/copy-items",
            json={"image_ids": [image_id], "target_folder_id": folder_id}
        )
        assert copy_resp.status_code == 200
        copied_id = copy_resp.json()["items"][0]["id"]

        # CRITICAL: copy must appear in folder detail (was missing before - query filtered 'panel' only)
        folder_resp = api_client.get(f"{base_url}/api/folders/{folder_id}")
        assert folder_resp.status_code == 200
        panel_ids_in_folder = [p["id"] for p in folder_resp.json()["panels"]]
        assert copied_id in panel_ids_in_folder, (
            f"BUG: Copied image not found in folder panels. "
            f"panel_ids_in_folder={panel_ids_in_folder}"
        )

        # CRITICAL: copy must NOT appear in source screenshots list
        sources_resp = api_client.get(f"{base_url}/api/images?image_type=source")
        source_ids = [i["id"] for i in sources_resp.json()]
        assert copied_id not in source_ids, (
            f"BUG: Copied image incorrectly appears in Source Screenshots. "
            f"Should be in folder panels only."
        )

        # Cleanup
        api_client.delete(f"{base_url}/api/images/{image_id}")
        api_client.delete(f"{base_url}/api/folders/{folder_id}")

    def test_copy_without_target_folder_stays_at_root(self, base_url, api_client):
        """If no target folder, copy stays at root with original image_type"""
        img = upload_image(api_client, base_url, filename="TEST_no_target_copy.png")
        image_id = img["id"]

        copy_resp = api_client.post(
            f"{base_url}/api/copy-items",
            json={"image_ids": [image_id], "target_folder_id": None}
        )
        assert copy_resp.status_code == 200
        copied = copy_resp.json()["items"][0]
        # No target folder → stays as 'source' type at root
        assert copied["folder_id"] is None
        assert copied["image_type"] == "source"

        # Cleanup
        api_client.delete(f"{base_url}/api/images/{image_id}")
        api_client.delete(f"{base_url}/api/images/{copied["id"]}")


# ─── Fix 2: Delete via bulk-delete endpoint (used by Modal confirm flow) ─────────────────────────
class TestDeleteConfirmationFlow:
    """
    Tests the full delete flow: select → show modal → confirm → DELETE API
    The modal now replaces Alert.alert() in index.tsx and folder/[id].tsx
    """

    def test_folder_delete_flow(self, base_url, api_client):
        """Full folder creation then deletion (as triggered by confirm-delete-btn in modal)"""
        # Create a folder
        folder = create_folder(api_client, base_url, "TEST_modal_delete_folder")
        folder_id = folder["id"]
        assert api_client.get(f"{base_url}/api/folders/{folder_id}").status_code == 200

        # Delete it (modal triggers DELETE /api/folders/{id})
        del_resp = api_client.delete(f"{base_url}/api/folders/{folder_id}")
        assert del_resp.status_code == 200

        # verify gone (simulates delete-success-ok-btn → router.replace('/'))
        assert api_client.get(f"{base_url}/api/folders/{folder_id}").status_code == 404

    def test_image_delete_flow_via_bulk_endpoint(self, base_url, api_client):
        """Full image creation then deletion (as triggered by confirm-delete-btn in modal)"""
        img = upload_image(api_client, base_url, filename="TEST_modal_delete_img.png")
        image_id = img["id"]
        assert api_client.get(f"{base_url}/api/images/{image_id}").status_code == 200

        # Bulk delete (modal triggers POST /api/bulk-delete)
        del_resp = api_client.post(
            f"{base_url}/api/bulk-delete",
            json={"image_ids": [image_id], "folder_ids": []}
        )
        assert del_resp.status_code == 200
        assert del_resp.json()["deleted_images"] == 1

        # verify gone (simulates delete-success-ok-btn)
        assert api_client.get(f"{base_url}/api/images/{image_id}").status_code == 404

    def test_panel_delete_from_folder_view(self, base_url, api_client):
        """Panel select → confirm delete → folder re-loads without deleted panel"""
        # Create source + process into panels
        img = upload_image(api_client, base_url, filename="TEST_panel_del_src.png", w=400, h=2000)
        proc_resp = api_client.post(
            f"{base_url}/api/process",
            json={
                "image_id": img["id"],
                "markers": [200.0, 600.0, 800.0, 1200.0],
                "display_width": 400.0,
                "display_height": 2000.0
            }
        )
        assert proc_resp.status_code == 200
        proc_data = proc_resp.json()
        folder_id = proc_data["folder_id"]
        panel_ids = [p["id"] for p in proc_data["panels"]]
        assert len(panel_ids) == 2

        # Delete first panel (modal flow)
        del_resp = api_client.post(
            f"{base_url}/api/bulk-delete",
            json={"image_ids": [panel_ids[0]], "folder_ids": []}
        )
        assert del_resp.status_code == 200

        # Folder reload should show only 1 panel
        folder_resp = api_client.get(f"{base_url}/api/folders/{folder_id}")
        assert len(folder_resp.json()["panels"]) == 1
        remaining_id = folder_resp.json()["panels"][0]["id"]
        assert remaining_id == panel_ids[1]

        # Cleanup
        api_client.delete(f"{base_url}/api/folders/{folder_id}")
        api_client.delete(f"{base_url}/api/images/{img['id']}")


# ─── Fix 3: Folder rename from panel view ───────────────────────────────────────────────────────
class TestFolderRenameFromPanelView:
    """Test rename-folder-btn in folder/[id].tsx header"""

    def test_rename_folder_from_panel_view(self, base_url, api_client):
        """PATCH /api/folders/{id} renames a folder (triggered by rename-folder-btn)"""
        folder = create_folder(api_client, base_url, "TEST_iter5_rename_src")
        folder_id = folder["id"]

        resp = api_client.patch(
            f"{base_url}/api/folders/{folder_id}",
            json={"name": "TEST_iter5_rename_dst"}
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "TEST_iter5_rename_dst"

        # Verify persisted - simulates folder reload after rename
        get_resp = api_client.get(f"{base_url}/api/folders/{folder_id}")
        assert get_resp.json()["name"] == "TEST_iter5_rename_dst"

        # Cleanup
        api_client.delete(f"{base_url}/api/folders/{folder_id}")
