#!/bin/bash

BASE_URL="https://marker-crop-tool.preview.emergentagent.com/api"

echo "=== Manual API Testing ==="
echo ""

echo "Test 1: Rename folder"
# Get first folder
FOLDER_ID=$(curl -s "$BASE_URL/folders" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "Folder ID: $FOLDER_ID"

if [ -n "$FOLDER_ID" ]; then
    curl -X PATCH "$BASE_URL/folders/$FOLDER_ID" \
        -H "Content-Type: application/json" \
        -d '{"name":"TEST_Manual_Renamed"}' \
        -w "\nStatus: %{http_code}\n"
    echo ""
fi

echo ""
echo "Test 2: Create test image for move/copy"
# Create small test image base64
TEST_IMAGE_B64="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="

IMAGE_RESP=$(curl -s -X POST "$BASE_URL/images/upload" \
    -H "Content-Type: application/json" \
    -d "{\"base64_data\":\"$TEST_IMAGE_B64\",\"filename\":\"TEST_manual_image.png\"}")

echo "Upload response: $IMAGE_RESP"
IMAGE_ID=$(echo "$IMAGE_RESP" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
echo "Image ID: $IMAGE_ID"
echo ""

echo "Test 3: Move image"
if [ -n "$IMAGE_ID" ] && [ -n "$FOLDER_ID" ]; then
    curl -X POST "$BASE_URL/move-items" \
        -H "Content-Type: application/json" \
        -d "{\"image_ids\":[\"$IMAGE_ID\"],\"target_folder_id\":\"$FOLDER_ID\"}" \
        -w "\nStatus: %{http_code}\n"
    echo ""
fi

echo "Test 4: Copy image"
if [ -n "$IMAGE_ID" ]; then
    curl -X POST "$BASE_URL/copy-items" \
        -H "Content-Type: application/json" \
        -d "{\"image_ids\":[\"$IMAGE_ID\"]}" \
        -w "\nStatus: %{http_code}\n"
    echo ""
fi

echo "Test 5: Bulk delete"
# Create test items to delete
FOLDER_RESP=$(curl -s -X POST "$BASE_URL/folders" \
    -H "Content-Type: application/json" \
    -d '{"name":"TEST_Delete_Me"}')
DEL_FOLDER_ID=$(echo "$FOLDER_RESP" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)

curl -X POST "$BASE_URL/bulk-delete" \
    -H "Content-Type: application/json" \
    -d "{\"image_ids\":[],\"folder_ids\":[\"$DEL_FOLDER_ID\"]}" \
    -w "\nStatus: %{http_code}\n"

echo ""
echo "=== All manual tests complete ==="
