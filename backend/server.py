from fastapi import FastAPI, APIRouter, HTTPException
from fastapi.responses import FileResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import base64
import io
import shutil
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime, timezone
from PIL import Image as PILImage

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Logging setup (must be before any logger usage)
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# Storage directories
UPLOADS_DIR = ROOT_DIR / 'uploads'
SOURCES_DIR = UPLOADS_DIR / 'sources'
PANELS_DIR = UPLOADS_DIR / 'panels'
SOURCES_DIR.mkdir(parents=True, exist_ok=True)
PANELS_DIR.mkdir(parents=True, exist_ok=True)

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

# --- Pydantic Models ---

class ImageUploadRequest(BaseModel):
    base64_data: str
    filename: str = "screenshot.png"

class ImageResponse(BaseModel):
    id: str
    filename: str
    width: int
    height: int
    image_type: str
    folder_id: Optional[str] = None
    created_at: str

class FolderCreate(BaseModel):
    name: str

class FolderResponse(BaseModel):
    id: str
    name: str
    panel_count: int = 0
    created_at: str
    thumbnail_id: Optional[str] = None

class FolderDetailResponse(BaseModel):
    id: str
    name: str
    created_at: str
    panels: List[ImageResponse]

class ProcessRequest(BaseModel):
    image_id: str
    markers: List[float]
    display_width: float
    display_height: float

class ProcessResponse(BaseModel):
    folder_id: str
    folder_name: str
    panel_count: int
    panels: List[ImageResponse]

# --- Helper ---

def doc_to_image_response(doc: dict) -> ImageResponse:
    return ImageResponse(
        id=doc["id"],
        filename=doc["filename"],
        width=doc["width"],
        height=doc["height"],
        image_type=doc["image_type"],
        folder_id=doc.get("folder_id"),
        created_at=doc["created_at"],
    )

# --- Image Endpoints ---

@api_router.post("/images/upload", response_model=ImageResponse)
async def upload_image(req: ImageUploadRequest):
    try:
        # Handle data URI prefix
        b64 = req.base64_data
        if "," in b64:
            b64 = b64.split(",", 1)[1]

        image_data = base64.b64decode(b64)
        img = PILImage.open(io.BytesIO(image_data))
        width, height = img.size

        image_id = str(uuid.uuid4())
        stored_filename = f"{image_id}.png"
        filepath = SOURCES_DIR / stored_filename
        img.save(str(filepath), format='PNG')

        now = datetime.now(timezone.utc).isoformat()
        doc = {
            "id": image_id,
            "filename": req.filename,
            "stored_filename": stored_filename,
            "width": width,
            "height": height,
            "image_type": "source",
            "folder_id": None,
            "created_at": now,
        }
        await db.images.insert_one(doc)
        return doc_to_image_response(doc)
    except Exception as e:
        logger.error(f"Upload error: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@api_router.get("/images/{image_id}/file")
async def get_image_file(image_id: str):
    doc = await db.images.find_one({"id": image_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Image not found")

    if doc["image_type"] == "source":
        filepath = SOURCES_DIR / doc["stored_filename"]
    else:
        filepath = PANELS_DIR / doc["folder_id"] / doc["stored_filename"]

    if not filepath.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")

    return FileResponse(str(filepath), media_type="image/png")


@api_router.get("/images/{image_id}", response_model=ImageResponse)
async def get_image_meta(image_id: str):
    doc = await db.images.find_one({"id": image_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Image not found")
    return doc_to_image_response(doc)


@api_router.get("/images", response_model=List[ImageResponse])
async def list_images(image_type: Optional[str] = None, folder_id: Optional[str] = None):
    query: dict = {}
    if image_type:
        query["image_type"] = image_type
    if folder_id:
        query["folder_id"] = folder_id
    docs = await db.images.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)
    return [doc_to_image_response(d) for d in docs]


@api_router.delete("/images/{image_id}")
async def delete_image(image_id: str):
    doc = await db.images.find_one({"id": image_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Image not found")

    if doc["image_type"] == "source":
        filepath = SOURCES_DIR / doc["stored_filename"]
    else:
        filepath = PANELS_DIR / doc.get("folder_id", "") / doc["stored_filename"]

    if filepath.exists():
        filepath.unlink()

    await db.images.delete_one({"id": image_id})
    return {"message": "Image deleted"}


# --- Folder Endpoints ---

@api_router.post("/folders", response_model=FolderResponse)
async def create_folder(req: FolderCreate):
    folder_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    doc = {"id": folder_id, "name": req.name, "created_at": now}
    await db.folders.insert_one(doc)
    return FolderResponse(id=folder_id, name=req.name, panel_count=0, created_at=now)


@api_router.get("/folders", response_model=List[FolderResponse])
async def list_folders():
    folders = await db.folders.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    result = []
    for f in folders:
        count = await db.images.count_documents({"folder_id": f["id"], "image_type": "panel"})
        first = await db.images.find_one(
            {"folder_id": f["id"], "image_type": "panel"}, {"_id": 0}, sort=[("filename", 1)]
        )
        result.append(
            FolderResponse(
                id=f["id"],
                name=f["name"],
                panel_count=count,
                created_at=f["created_at"],
                thumbnail_id=first["id"] if first else None,
            )
        )
    return result


@api_router.get("/folders/{folder_id}", response_model=FolderDetailResponse)
async def get_folder(folder_id: str):
    folder = await db.folders.find_one({"id": folder_id}, {"_id": 0})
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    panels = await db.images.find(
        {"folder_id": folder_id, "image_type": "panel"}, {"_id": 0}
    ).sort("filename", 1).to_list(200)

    return FolderDetailResponse(
        id=folder["id"],
        name=folder["name"],
        created_at=folder["created_at"],
        panels=[doc_to_image_response(p) for p in panels],
    )


@api_router.delete("/folders/{folder_id}")
async def delete_folder(folder_id: str):
    folder = await db.folders.find_one({"id": folder_id}, {"_id": 0})
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    folder_path = PANELS_DIR / folder_id
    if folder_path.exists():
        shutil.rmtree(str(folder_path))

    await db.images.delete_many({"folder_id": folder_id})
    await db.folders.delete_one({"id": folder_id})
    return {"message": "Folder deleted"}


# --- Process Endpoint ---

@api_router.post("/process", response_model=ProcessResponse)
async def process_panels(req: ProcessRequest):
    if len(req.markers) < 2:
        raise HTTPException(status_code=400, detail="At least 2 markers required.")
    if len(req.markers) % 2 != 0:
        raise HTTPException(status_code=400, detail="Markers must be even to extract panels.")

    image_doc = await db.images.find_one({"id": req.image_id}, {"_id": 0})
    if not image_doc:
        raise HTTPException(status_code=404, detail="Image not found")

    filepath = SOURCES_DIR / image_doc["stored_filename"]
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="Image file not found on disk")

    img = PILImage.open(str(filepath))
    orig_width, orig_height = img.size
    scale = orig_width / req.display_width

    sorted_markers = sorted(req.markers)
    pairs = [(sorted_markers[i], sorted_markers[i + 1]) for i in range(0, len(sorted_markers), 2)]

    now = datetime.now(timezone.utc)
    folder_name = f"Panels_{now.strftime('%Y_%m_%d_%H_%M')}"
    folder_id = str(uuid.uuid4())
    folder_dir = PANELS_DIR / folder_id
    folder_dir.mkdir(parents=True, exist_ok=True)

    await db.folders.insert_one({"id": folder_id, "name": folder_name, "created_at": now.isoformat()})

    panels: List[ImageResponse] = []
    for idx, (top_disp, bottom_disp) in enumerate(pairs):
        orig_top = max(0, min(int(top_disp * scale), orig_height))
        orig_bottom = max(0, min(int(bottom_disp * scale), orig_height))
        if orig_bottom <= orig_top:
            continue

        cropped = img.crop((0, orig_top, orig_width, orig_bottom))
        panel_id = str(uuid.uuid4())
        panel_filename = f"panel_{idx + 1:03d}.png"
        stored_filename = f"{panel_id}.png"
        panel_path = folder_dir / stored_filename
        cropped.save(str(panel_path), format="PNG")

        panel_w, panel_h = cropped.size
        panel_doc = {
            "id": panel_id,
            "filename": panel_filename,
            "stored_filename": stored_filename,
            "width": panel_w,
            "height": panel_h,
            "image_type": "panel",
            "folder_id": folder_id,
            "created_at": now.isoformat(),
        }
        await db.images.insert_one(panel_doc)
        panels.append(doc_to_image_response(panel_doc))

    return ProcessResponse(
        folder_id=folder_id,
        folder_name=folder_name,
        panel_count=len(panels),
        panels=panels,
    )


@api_router.get("/health")
async def health():
    return {"status": "healthy"}


# --- App Config ---

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
