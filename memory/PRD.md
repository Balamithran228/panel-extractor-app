# Panel Extractor - Product Requirements Document

## Overview
Panel Extractor is a mobile utility app for webtoon/comic enthusiasts. It allows users to import long screenshot strips, manually place red horizontal line markers, validate marker positions, and automatically extract panels between marker pairs into separate images saved in timestamped folders.

## Tech Stack
- **Frontend**: React Native with Expo SDK 54, Expo Router, expo-image, expo-image-picker, expo-sharing
- **Backend**: FastAPI (Python) with Pillow for image processing
- **Database**: MongoDB (metadata storage)
- **Storage**: Local disk (backend /uploads/ directory)

## Pages
1. **File Manager (Home)** - `/` - Lists extracted panel folders and source screenshots with import FAB
2. **Panel Editor** - `/editor?imageId=` - Scrollable image viewer with red line marker placement
3. **Folder View** - `/folder/[id]` - Grid view of extracted panels with share functionality

## Core Features (v1 - Implemented)
- [x] Import screenshot from device gallery
- [x] Vertical scrolling of long images (up to 20000px)
- [x] Red line marker placement at viewport center
- [x] Marker count validation (must be even)
- [x] Panel extraction between marker pairs (Pillow-based cropping)
- [x] Timestamped folder creation (Panels_YYYY_MM_DD_HH_MM)
- [x] Panel preview in 2-column grid
- [x] Share panels via device share sheet
- [x] Delete folders and images
- [x] Undo last marker / Clear all markers
- [x] Dark theme UI optimized for comic viewing

## Planned Features (v2)
- [ ] Google Drive integration for cloud backup
- [ ] Pinch-to-zoom on editor image
- [ ] Drag markers to adjust position
- [ ] Batch processing of multiple screenshots
- [ ] Export as PDF or ZIP

## API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/images/upload | Upload base64 image |
| GET | /api/images | List images |
| GET | /api/images/{id} | Get image metadata |
| GET | /api/images/{id}/file | Serve image binary |
| DELETE | /api/images/{id} | Delete image |
| POST | /api/folders | Create folder |
| GET | /api/folders | List folders |
| GET | /api/folders/{id} | Get folder with panels |
| DELETE | /api/folders/{id} | Delete folder + panels |
| POST | /api/process | Extract panels from markers |

## Design System
- **Theme**: Dark (Zinc-950 background #09090b)
- **Primary**: Red-500 (#ef4444)
- **Surface**: #18181b
- **Text**: #f4f4f5 (main), #a1a1aa (secondary)
