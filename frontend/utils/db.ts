import * as SQLite from 'expo-sqlite';
import { Paths, File, Directory } from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';

// ── Types ──

export interface ImageData {
  id: string;
  filename: string;
  stored_filename: string;
  width: number;
  height: number;
  image_type: string;
  folder_id: string | null;
  created_at: string;
}

export interface FolderData {
  id: string;
  name: string;
  panel_count: number;
  created_at: string;
  thumbnail_id: string | null;
}

export interface FolderDetail {
  id: string;
  name: string;
  created_at: string;
  panels: ImageData[];
}

export interface ProcessResult {
  folder_id: string;
  folder_name: string;
  panel_count: number;
  panels: ImageData[];
}

// ── Storage directories ──

function getBaseDir(): Directory {
  return new Directory(Paths.document, 'panel_extractor');
}

function getSourcesDir(): Directory {
  return new Directory(Paths.document, 'panel_extractor', 'sources');
}

function getPanelsDir(): Directory {
  return new Directory(Paths.document, 'panel_extractor', 'panels');
}

// ── UUID polyfill ──

function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ── Ensure directories exist ──

async function ensureDirs() {
  const baseDir = getBaseDir();
  if (!baseDir.exists) baseDir.create();

  const sourcesDir = getSourcesDir();
  if (!sourcesDir.exists) sourcesDir.create();

  const panelsDir = getPanelsDir();
  if (!panelsDir.exists) panelsDir.create();
}

// ── Database singleton ──

let _db: SQLite.SQLiteDatabase | null = null;

export async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('panel_extractor');
  await _db.execAsync(`
    CREATE TABLE IF NOT EXISTS folders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS images (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      stored_filename TEXT NOT NULL,
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      image_type TEXT NOT NULL,
      folder_id TEXT,
      created_at TEXT NOT NULL
    );
  `);
  await ensureDirs();
  return _db;
}

// ── Image helpers ──

function getImageFile(doc: ImageData): File {
  if (doc.image_type === 'source') {
    return new File(getSourcesDir(), doc.stored_filename);
  }
  return new File(getPanelsDir(), doc.folder_id || '', doc.stored_filename);
}

export function getImageUri(id: string, storedFilename: string, imageType: string, folderId: string | null): string {
  if (imageType === 'source') {
    return new File(getSourcesDir(), storedFilename).uri;
  }
  return new File(getPanelsDir(), folderId || '', storedFilename).uri;
}

function ensurePanelFolderDir(folderId: string) {
  const dir = new Directory(getPanelsDir(), folderId);
  if (!dir.exists) dir.create();
}

// ── CRUD Operations ──

export const db = {
  // Get the local file:// URI for an image by its ID
  getImageUriById: async (imageId: string): Promise<string> => {
    const database = await getDB();
    const row = await database.getFirstAsync<ImageData>(
      'SELECT * FROM images WHERE id = ?',
      [imageId]
    );
    if (!row) throw new Error('Image not found');
    return getImageFile(row).uri;
  },

  // Upload an image from a local URI (e.g., from image picker)
  uploadImage: async (localUri: string, filename: string, width: number, height: number): Promise<ImageData> => {
    const database = await getDB();
    const imageId = generateId();
    const storedFilename = imageId + '.png';
    
    const srcFile = new File(localUri);
    const destFile = new File(getSourcesDir(), storedFilename);
    srcFile.copy(destFile);
    
    const now = new Date().toISOString();
    const doc: ImageData = {
      id: imageId,
      filename,
      stored_filename: storedFilename,
      width,
      height,
      image_type: 'source',
      folder_id: null,
      created_at: now,
    };

    await database.runAsync(
      'INSERT INTO images (id, filename, stored_filename, width, height, image_type, folder_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [doc.id, doc.filename, doc.stored_filename, doc.width, doc.height, doc.image_type, doc.folder_id, doc.created_at]
    );

    return doc;
  },

  // Get image metadata
  getImage: async (imageId: string): Promise<ImageData> => {
    const database = await getDB();
    const row = await database.getFirstAsync<ImageData>(
      'SELECT * FROM images WHERE id = ?',
      [imageId]
    );
    if (!row) throw new Error('Image not found');
    return row;
  },

  // List images by type
  listImages: async (imageType?: string): Promise<ImageData[]> => {
    const database = await getDB();
    if (imageType) {
      return await database.getAllAsync<ImageData>(
        'SELECT * FROM images WHERE image_type = ? ORDER BY created_at DESC',
        [imageType]
      );
    }
    return await database.getAllAsync<ImageData>(
      'SELECT * FROM images ORDER BY created_at DESC'
    );
  },

  // Delete a single image
  deleteImage: async (imageId: string): Promise<void> => {
    const database = await getDB();
    const row = await database.getFirstAsync<ImageData>(
      'SELECT * FROM images WHERE id = ?',
      [imageId]
    );
    if (!row) return;

    const file = getImageFile(row);
    if (file.exists) file.delete();

    await database.runAsync('DELETE FROM images WHERE id = ?', [imageId]);
  },

  // Rename an image
  renameImage: async (imageId: string, newFilename: string): Promise<void> => {
    const database = await getDB();
    await database.runAsync(
      'UPDATE images SET filename = ? WHERE id = ?',
      [newFilename, imageId]
    );
  },

  // ── Folders ──

  listFolders: async (): Promise<FolderData[]> => {
    const database = await getDB();
    const folders = await database.getAllAsync<{ id: string; name: string; created_at: string }>(
      'SELECT * FROM folders ORDER BY created_at DESC'
    );

    const result: FolderData[] = [];
    for (const f of folders) {
      const countRow = await database.getFirstAsync<{ cnt: number }>(
        "SELECT COUNT(*) as cnt FROM images WHERE folder_id = ? AND image_type = 'panel'",
        [f.id]
      );
      const first = await database.getFirstAsync<ImageData>(
        "SELECT * FROM images WHERE folder_id = ? AND image_type = 'panel' ORDER BY filename ASC LIMIT 1",
        [f.id]
      );
      result.push({
        id: f.id,
        name: f.name,
        panel_count: countRow?.cnt || 0,
        created_at: f.created_at,
        thumbnail_id: first?.id || null,
      });
    }
    return result;
  },

  getFolder: async (folderId: string): Promise<FolderDetail> => {
    const database = await getDB();
    const folder = await database.getFirstAsync<{ id: string; name: string; created_at: string }>(
      'SELECT * FROM folders WHERE id = ?',
      [folderId]
    );
    if (!folder) throw new Error('Folder not found');

    const panels = await database.getAllAsync<ImageData>(
      "SELECT * FROM images WHERE folder_id = ? AND image_type = 'panel' ORDER BY filename ASC",
      [folderId]
    );

    return {
      id: folder.id,
      name: folder.name,
      created_at: folder.created_at,
      panels,
    };
  },

  createFolder: async (name: string): Promise<FolderData> => {
    const database = await getDB();
    const folderId = generateId();
    const now = new Date().toISOString();

    await database.runAsync(
      'INSERT INTO folders (id, name, created_at) VALUES (?, ?, ?)',
      [folderId, name, now]
    );

    return { id: folderId, name, panel_count: 0, created_at: now, thumbnail_id: null };
  },

  deleteFolder: async (folderId: string): Promise<void> => {
    const database = await getDB();

    // Delete panel files on disk
    const folderDir = new Directory(getPanelsDir(), folderId);
    if (folderDir.exists) folderDir.delete();

    await database.runAsync("DELETE FROM images WHERE folder_id = ?", [folderId]);
    await database.runAsync('DELETE FROM folders WHERE id = ?', [folderId]);
  },

  renameFolder: async (folderId: string, newName: string): Promise<void> => {
    const database = await getDB();
    await database.runAsync(
      'UPDATE folders SET name = ? WHERE id = ?',
      [newName, folderId]
    );
  },

  // ── Move / Copy / Bulk Delete ──

  moveItems: async (imageIds: string[], targetFolderId: string | null): Promise<void> => {
    const database = await getDB();

    for (const imgId of imageIds) {
      const doc = await database.getFirstAsync<ImageData>(
        'SELECT * FROM images WHERE id = ?',
        [imgId]
      );
      if (!doc) continue;

      const oldFile = getImageFile(doc);

      let newFile: File;
      if (targetFolderId) {
        ensurePanelFolderDir(targetFolderId);
        newFile = new File(getPanelsDir(), targetFolderId, doc.stored_filename);
      } else {
        newFile = new File(getSourcesDir(), doc.stored_filename);
      }

      if (oldFile.uri !== newFile.uri && oldFile.exists) {
        oldFile.move(newFile);
      }

      const newType = targetFolderId ? 'panel' : 'source';
      await database.runAsync(
        'UPDATE images SET folder_id = ?, image_type = ? WHERE id = ?',
        [targetFolderId, newType, imgId]
      );
    }
  },

  copyItems: async (imageIds: string[], targetFolderId?: string | null): Promise<void> => {
    const database = await getDB();

    for (const imgId of imageIds) {
      const doc = await database.getFirstAsync<ImageData>(
        'SELECT * FROM images WHERE id = ?',
        [imgId]
      );
      if (!doc) continue;

      const srcFile = getImageFile(doc);
      const newId = generateId();
      const newStored = newId + '.png';
      const targetFolder = targetFolderId !== undefined && targetFolderId !== null
        ? targetFolderId
        : doc.folder_id;

      let dstFile: File;
      if (targetFolder) {
        ensurePanelFolderDir(targetFolder);
        dstFile = new File(getPanelsDir(), targetFolder, newStored);
      } else {
        dstFile = new File(getSourcesDir(), newStored);
      }

      if (srcFile.exists) {
        srcFile.copy(dstFile);
      }

      const newImageType = targetFolder ? 'panel' : doc.image_type;
      const now = new Date().toISOString();

      await database.runAsync(
        'INSERT INTO images (id, filename, stored_filename, width, height, image_type, folder_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [newId, 'Copy_' + doc.filename, newStored, doc.width, doc.height, newImageType, targetFolder, now]
      );
    }
  },

  bulkDelete: async (imageIds: string[], folderIds: string[]): Promise<void> => {
    const database = await getDB();

    for (const imgId of imageIds) {
      await db.deleteImage(imgId);
    }

    for (const folderId of folderIds) {
      await db.deleteFolder(folderId);
    }
  },

  // ── Process Markers (Panel Extraction) ──

  processMarkers: async (data: {
    image_id: string;
    markers: number[];
    display_width: number;
    display_height: number;
  }): Promise<ProcessResult> => {
    const database = await getDB();

    if (data.markers.length < 2) throw new Error('At least 2 markers required.');
    if (data.markers.length % 2 !== 0) throw new Error('Markers must be even.');

    const imageDoc = await database.getFirstAsync<ImageData>(
      'SELECT * FROM images WHERE id = ?',
      [data.image_id]
    );
    if (!imageDoc) throw new Error('Image not found');

    const srcFile = new File(getSourcesDir(), imageDoc.stored_filename);
    if (!srcFile.exists) throw new Error('Image file not found');

    const origWidth = imageDoc.width;
    const origHeight = imageDoc.height;
    const scale = origWidth / data.display_width;

    const sorted = [...data.markers].sort((a, b) => a - b);
    const pairs: [number, number][] = [];
    for (let i = 0; i < sorted.length; i += 2) {
      pairs.push([sorted[i], sorted[i + 1]]);
    }

    // Create folder
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const folderName = `Panels_${now.getFullYear()}_${pad(now.getMonth() + 1)}_${pad(now.getDate())}_${pad(now.getHours())}_${pad(now.getMinutes())}`;
    const folderId = generateId();
    ensurePanelFolderDir(folderId);

    await database.runAsync(
      'INSERT INTO folders (id, name, created_at) VALUES (?, ?, ?)',
      [folderId, folderName, now.toISOString()]
    );

    const panels: ImageData[] = [];

    for (let idx = 0; idx < pairs.length; idx++) {
      const [topDisp, bottomDisp] = pairs[idx];
      const origTop = Math.max(0, Math.min(Math.round(topDisp * scale), origHeight));
      const origBottom = Math.max(0, Math.min(Math.round(bottomDisp * scale), origHeight));
      if (origBottom <= origTop) continue;

      const cropHeight = origBottom - origTop;

      // Use ImageManipulator to crop
      const result = await ImageManipulator.manipulateAsync(
        srcFile.uri,
        [{ crop: { originX: 0, originY: origTop, width: origWidth, height: cropHeight } }],
        { format: ImageManipulator.SaveFormat.PNG }
      );

      const panelId = generateId();
      const panelFilename = `panel_${String(idx + 1).padStart(3, '0')}.png`;
      const storedFilename = panelId + '.png';
      const panelFile = new File(getPanelsDir(), folderId, storedFilename);

      // Move the manipulated result to our storage
      const resultFile = new File(result.uri);
      resultFile.move(panelFile);

      const panelDoc: ImageData = {
        id: panelId,
        filename: panelFilename,
        stored_filename: storedFilename,
        width: origWidth,
        height: cropHeight,
        image_type: 'panel',
        folder_id: folderId,
        created_at: now.toISOString(),
      };

      await database.runAsync(
        'INSERT INTO images (id, filename, stored_filename, width, height, image_type, folder_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [panelDoc.id, panelDoc.filename, panelDoc.stored_filename, panelDoc.width, panelDoc.height, panelDoc.image_type, panelDoc.folder_id, panelDoc.created_at]
      );

      panels.push(panelDoc);
    }

    return {
      folder_id: folderId,
      folder_name: folderName,
      panel_count: panels.length,
      panels,
    };
  },
};
