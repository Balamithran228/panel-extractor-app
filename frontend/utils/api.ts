const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export interface ImageData {
  id: string;
  filename: string;
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

async function request(path: string, options?: RequestInit) {
  const url = `${BACKEND_URL}/api${path}`;
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail || 'Request failed');
  }
  return res.json();
}

export const api = {
  getImageUrl: (imageId: string) => `${BACKEND_URL}/api/images/${imageId}/file`,

  uploadImage: (base64Data: string, filename: string): Promise<ImageData> =>
    request('/images/upload', {
      method: 'POST',
      body: JSON.stringify({ base64_data: base64Data, filename }),
    }),

  getImage: (imageId: string): Promise<ImageData> => request(`/images/${imageId}`),

  listImages: (imageType?: string): Promise<ImageData[]> =>
    request(`/images${imageType ? `?image_type=${imageType}` : ''}`),

  deleteImage: (imageId: string): Promise<void> =>
    request(`/images/${imageId}`, { method: 'DELETE' }),

  listFolders: (): Promise<FolderData[]> => request('/folders'),

  getFolder: (folderId: string): Promise<FolderDetail> => request(`/folders/${folderId}`),

  createFolder: (name: string): Promise<FolderData> =>
    request('/folders', { method: 'POST', body: JSON.stringify({ name }) }),

  deleteFolder: (folderId: string): Promise<void> =>
    request(`/folders/${folderId}`, { method: 'DELETE' }),

  processMarkers: (data: {
    image_id: string;
    markers: number[];
    display_width: number;
    display_height: number;
  }): Promise<ProcessResult> =>
    request('/process', { method: 'POST', body: JSON.stringify(data) }),
};
