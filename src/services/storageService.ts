/**
 * Storage Service
 * Handles image compression, Firebase Storage upload with progress tracking,
 * download URL retrieval, and orphaned image deletion.
 * Includes Prototype Mode toggle to run seamlessly without Firebase Storage.
 */

import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import { doc, setDoc } from 'firebase/firestore';
import { storage, db, auth } from '../firebase/config';

/**
 * Converts a base64 Data URL to a Blob for Firebase Storage upload.
 */
export function dataUrlToBlob(dataUrl: string): { blob: Blob; mimeType: string } {
  const parts = dataUrl.split(',');
  const mimeMatch = parts[0]?.match(/:(.*?);/);
  const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const base64Data = parts[1] || '';
  const binaryStr = atob(base64Data);
  const len = binaryStr.length;
  const u8arr = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    u8arr[i] = binaryStr.charCodeAt(i);
  }
  return { blob: new Blob([u8arr], { type: mimeType }), mimeType };
}

/**
 * Compresses an image file for temporary Firestore storage, guaranteeing payload size is
 * safely below Firestore's 1 MiB per-document limit (< 750 KB base64 string).
 */
export async function compressAndEncodeFileForFirestore(
  file: File,
  maxDimension = 800,
  maxSizeBytes = 750 * 1024
): Promise<string> {
  const fileType = (file.type || '').toLowerCase();
  const isImage = fileType.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif)$/i.test(file.name);

  if (!isImage) {
    // Non-image file (e.g., PDF)
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = (e.target?.result as string) || '';
        if (dataUrl.length > maxSizeBytes) {
          reject(
            new Error(
              `[TemporaryFirestoreStorageAdapter] Non-image file "${file.name}" size (${Math.round(
                dataUrl.length / 1024
              )} KB) exceeds maximum safe limit of 750 KB for temporary Firestore document storage.`
            )
          );
        } else {
          resolve(dataUrl);
        }
      };
      reader.onerror = () =>
        reject(
          new Error(`[TemporaryFirestoreStorageAdapter] Failed to read file "${file.name}".`)
        );
      reader.readAsDataURL(file);
    });
  }

  // Image compression pipeline using HTML5 Canvas
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxDimension) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          }
        } else {
          if (height > maxDimension) {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('[TemporaryFirestoreStorageAdapter] Canvas context unavailable.'));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        // First pass at 0.70 JPEG quality
        let dataUrl = canvas.toDataURL('image/jpeg', 0.7);

        // If still larger than maxSizeBytes, perform tighter second-pass compression
        if (dataUrl.length > maxSizeBytes) {
          const tighterDimension = Math.min(width, 500);
          canvas.width = tighterDimension;
          canvas.height = Math.round((height * tighterDimension) / width);
          const ctx2 = canvas.getContext('2d');
          if (ctx2) {
            ctx2.drawImage(img, 0, 0, canvas.width, canvas.height);
            dataUrl = canvas.toDataURL('image/jpeg', 0.5);
          }
        }

        if (dataUrl.length > maxSizeBytes) {
          reject(
            new Error(
              `[TemporaryFirestoreStorageAdapter] Compressed image "${file.name}" (${Math.round(
                dataUrl.length / 1024
              )} KB) exceeds maximum allowed limit of 750 KB for temporary Firestore storage. Please select a smaller photo.`
            )
          );
        } else {
          resolve(dataUrl);
        }
      };
      img.onerror = () =>
        reject(new Error(`[TemporaryFirestoreStorageAdapter] Failed to load image "${file.name}".`));
    };
    reader.onerror = () =>
      reject(new Error(`[TemporaryFirestoreStorageAdapter] Failed to read file "${file.name}".`));
  });
}

/**
 * PROTOTYPE MODE TOGGLE
 * Set to true by default to bypass direct Firebase Storage network calls during prototype execution.
 * When set to false, Firebase Storage will be used for live uploads.
 */
export const PROTOTYPE_MODE_DISABLE_STORAGE = true;

export interface UploadProgressCallback {
  (progress: number, fileName: string): void;
}

/**
 * Validates document format and file size for registration uploads.
 * Supported formats: .jpg, .jpeg, .jfif, .png, .webp, .pdf
 */
export function validateRegistrationDocumentFile(file: File): void {
  const allowedExtensions = /\.(jpe?g|jfif|pjpeg|png|webp|pdf)$/i;
  const allowedMimeTypes = [
    'image/jpeg',
    'image/pjpeg',
    'image/jfif',
    'image/jpg',
    'image/png',
    'image/x-png',
    'image/webp',
    'application/pdf',
  ];

  const fileTypeLower = (file.type || '').toLowerCase();
  const fileNameLower = (file.name || '').toLowerCase();

  const hasValidExt = allowedExtensions.test(fileNameLower);
  const hasValidMime =
    allowedMimeTypes.includes(fileTypeLower) ||
    fileTypeLower.startsWith('image/') ||
    fileTypeLower === 'application/pdf';

  if (!hasValidExt && !hasValidMime) {
    throw new Error(
      `Unsupported file format for "${file.name}". Supported formats: JPG, JPEG, JFIF, PNG, WEBP, and PDF.`
    );
  }

  const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB limit matching storage.rules
  if (file.size > MAX_SIZE_BYTES) {
    throw new Error(
      `File size (${(file.size / (1024 * 1024)).toFixed(1)} MB) exceeds the 10 MB maximum limit for document uploads.`
    );
  }
}

/**
 * Validates profile photo format and file size.
 */
export function validateProfileImage(file: File): void {
  const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  const fileTypeLower = (file.type || '').toLowerCase();
  const isImageMime = allowedMimeTypes.includes(fileTypeLower) || fileTypeLower.startsWith('image/');
  const isImageExt = /\.(jpg|jpeg|png|webp)$/i.test(file.name);

  if (!isImageMime && !isImageExt) {
    throw new Error('Unsupported image format. Please select a JPG, JPEG, PNG, or WEBP file.');
  }

  const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
  if (file.size > MAX_SIZE_BYTES) {
    throw new Error('Image file size exceeds the 5 MB maximum limit. Please select a smaller photo.');
  }
}

/**
 * Crops image to a 1:1 square centered canvas and compresses to JPEG blob.
 */
export async function cropAndCompressSquareImage(
  file: File,
  targetSize = 500,
  quality = 0.85
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const minDim = Math.min(img.width, img.height);
        const sx = (img.width - minDim) / 2;
        const sy = (img.height - minDim) / 2;

        const canvas = document.createElement('canvas');
        canvas.width = targetSize;
        canvas.height = targetSize;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(file);
          return;
        }

        ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, targetSize, targetSize);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              resolve(file);
            }
          },
          'image/jpeg',
          quality
        );
      };
      img.onerror = () => reject(new Error('Failed to load image for cropping.'));
    };
    reader.onerror = () => reject(new Error('Failed to read image file.'));
  });
}

/**
 * Client-side image compression utility using HTML5 Canvas.
 * Resizes large photos to max width/height while maintaining aspect ratio
 * and compresses output to JPEG blob.
 */
export async function compressImage(
  file: File,
  maxWidth = 1200,
  maxHeight = 1200,
  quality = 0.8
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    // If it's already a tiny file (< 200KB), return as is or convert to blob
    if (file.size < 200 * 1024 && file.type === 'image/jpeg') {
      resolve(file);
      return;
    }

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Calculate aspect ratio preserving dimensions
        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(file);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              resolve(file);
            }
          },
          'image/jpeg',
          quality
        );
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
}

export class StorageService {
  private memoryPreviewCache = new Map<string, string>();

  /**
   * Helper to format human-readable file sizes
   */
  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  private async readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve((e.target?.result as string) || '');
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
  }

  /**
   * Handles prototype uploads by storing base64 payload in application memory
   * and returning a lightweight SVG metadata Data URL (approx 450 bytes) for Firestore storage.
   */
  private async handlePrototypeUpload(file: File, folderLabel = 'Document'): Promise<string> {
    const base64DataUrl = await this.readFileAsDataUrl(file);
    const fileName = file.name || 'document.jpg';
    const fileType = file.type || 'image/jpeg';
    const fileSize = file.size || 0;
    const formattedSize = this.formatFileSize(fileSize);
    const folderTitle = folderLabel.replace(/_/g, ' ').toUpperCase();

    // Lightweight SVG image badge containing document metadata (< 500 bytes)
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="260" viewBox="0 0 480 260">
  <rect width="100%" height="100%" fill="#0f172a" rx="12"/>
  <rect x="12" y="12" width="456" height="236" fill="none" stroke="#3b82f6" stroke-width="2" rx="8" stroke-dasharray="6,6"/>
  <text x="240" y="55" fill="#60a5fa" font-family="system-ui, sans-serif" font-size="15" font-weight="bold" text-anchor="middle">PROTOTYPE MODE DOCUMENT</text>
  <text x="240" y="80" fill="#94a3b8" font-family="system-ui, sans-serif" font-size="12" text-anchor="middle">${folderTitle}</text>
  <line x1="40" y1="95" x2="440" y2="95" stroke="#334155" stroke-width="1" />
  <text x="40" y="125" fill="#38bdf8" font-family="monospace" font-size="12">fileName: "${fileName.replace(/"/g, '')}"</text>
  <text x="40" y="150" fill="#cbd5e1" font-family="monospace" font-size="12">fileType: "${fileType}"</text>
  <text x="40" y="175" fill="#cbd5e1" font-family="monospace" font-size="12">fileSize: "${formattedSize}" (${fileSize} bytes)</text>
  <text x="40" y="200" fill="#cbd5e1" font-family="monospace" font-size="12">uploadMethod: "prototype"</text>
  <text x="40" y="225" fill="#34d399" font-family="monospace" font-size="12" font-weight="bold">hasIdentityDocument: true</text>
</svg>`;

    const metadataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

    if (base64DataUrl) {
      this.memoryPreviewCache.set(metadataUrl, base64DataUrl);
    }

    return metadataUrl;
  }

  /**
   * Retrieves high-res base64 image from application memory cache if present,
   * or returns the metadata Data URL.
   */
  getPreviewUrl(urlOrMetadata?: string): string {
    if (!urlOrMetadata) return '';
    return this.memoryPreviewCache.get(urlOrMetadata) || urlOrMetadata;
  }

  /**
   * @deprecated Temporary Firestore-backed registration document storage adapter.
   * Kept solely for backward compatibility. Direct storage writes should use Firebase Storage via uploadRegistrationDocument().
   */
  private async storeRegistrationDocumentInFirestoreAdapter(
    file: File,
    folder: string,
    onProgress?: UploadProgressCallback
  ): Promise<string> {
    const parts = folder.split('/').filter(Boolean);
    let uid = auth.currentUser?.uid || 'pending_registration';
    let docType = 'document';

    if (parts.length >= 3) {
      uid = parts[1];
      docType = parts[2];
    } else if (parts.length === 2) {
      docType = parts[1];
    }

    const documentId = docType;
    const firestorePath = `registrations/${uid}/documents/${documentId}`;

    console.info(
      `[TemporaryFirestoreStorageAdapter (DEPRECATED)] Storing registration document "${file.name}" in Firestore at path "${firestorePath}"...`
    );

    try {
      if (onProgress) onProgress(25, file.name);

      const dataUrl = await compressAndEncodeFileForFirestore(file);
      if (onProgress) onProgress(75, file.name);

      const docRef = doc(db, 'registrations', uid, 'documents', documentId);
      const documentPayload = {
        documentId,
        uid,
        docType,
        fileName: file.name,
        fileType: file.type || 'image/jpeg',
        fileSize: file.size,
        compressedSizeKB: Math.round(dataUrl.length / 1024),
        dataUrl,
        firestorePath,
        storageType: 'firestore_temporary_adapter',
        createdAt: new Date().toISOString(),
      };

      await setDoc(docRef, documentPayload);

      console.info(
        `[TemporaryFirestoreStorageAdapter] SUCCESS: Stored document "${file.name}" at path "${firestorePath}" (${documentPayload.compressedSizeKB} KB).`
      );

      if (onProgress) onProgress(100, file.name);
      return dataUrl;
    } catch (err: any) {
      console.error(
        `[TemporaryFirestoreStorageAdapter] FAILED: Storage error for file "${file.name}" at path "${firestorePath}":`,
        err
      );
      throw new Error(
        `[TemporaryFirestoreStorageAdapter] Failed to store document "${file.name}": ${err?.message || err}`
      );
    }
  }

  /**
   * Uploads registration identity and proof documents to Firebase Storage for an authenticated user.
   * Path: registrations/{userId}/{docType}/{timestamp}_{sanitizedFilename}
   * Authorized by storage.rules via isOwner(userId) rule.
   */
  async uploadRegistrationDocument(
    userId: string,
    file: File,
    docType: string,
    onProgress?: UploadProgressCallback
  ): Promise<string> {
    validateRegistrationDocumentFile(file);

    if (!auth.currentUser) {
      throw new Error(
        'Authentication required: Please verify your email and sign in to upload registration documents.'
      );
    }

    if (auth.currentUser.uid !== userId) {
      throw new Error(
        'Permission denied: Authenticated user ID does not match registration document owner path.'
      );
    }

    const isPdf = (file.type || '').toLowerCase() === 'application/pdf' || /\.pdf$/i.test(file.name);
    let uploadBlob: Blob;
    let contentType: string;

    if (isPdf) {
      uploadBlob = file;
      contentType = 'application/pdf';
    } else {
      // Normalizes JPEG, JFIF, PNG, WEBP through HTML5 Canvas compression pipeline to image/jpeg
      uploadBlob = await compressImage(file);
      contentType = 'image/jpeg';
    }

    const sanitizedName = (file.name || 'document')
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .replace(/\.(jfif|pjpeg)$/i, '.jpg');
    const filename = `${Date.now()}_${sanitizedName}`;
    const storagePath = `registrations/${userId}/${docType}/${filename}`;
    const storageRef = ref(storage, storagePath);

    return new Promise<string>((resolve, reject) => {
      const uploadTask = uploadBytesResumable(storageRef, uploadBlob, {
        contentType,
        customMetadata: {
          originalName: file.name,
          docType,
          userId,
          uploadedAt: new Date().toISOString(),
        },
      });

      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          if (onProgress) {
            onProgress(Math.round(progress), file.name);
          }
        },
        (error) => {
          console.error(`[StorageService] Firebase Storage upload failed for ${storagePath}:`, error);
          reject(new Error(`Failed to upload document to Firebase Storage: ${error.message || error}`));
        },
        async () => {
          try {
            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
            if (onProgress) onProgress(100, file.name);
            resolve(downloadURL);
          } catch (err: any) {
            console.error(`[StorageService] Failed to get download URL for ${storagePath}:`, err);
            reject(new Error(`Failed to retrieve document download URL: ${err?.message || err}`));
          }
        }
      );
    });
  }

  /**
   * General purpose image upload for inventory, residents, profile, etc.
   */
  async uploadImage(
    file: File,
    folder = 'inventory',
    onProgress?: UploadProgressCallback
  ): Promise<string> {
    const isRegistrationDoc = folder.startsWith('registrations/');
    if (isRegistrationDoc) {
      if (!auth.currentUser) {
        throw new Error(
          'Registration document uploads require an authenticated session. Please verify your email and sign in.'
        );
      }
      const parts = folder.split('/').filter(Boolean);
      const targetUid = parts[1] || auth.currentUser.uid;
      const targetDocType = parts[2] || 'document';
      return this.uploadRegistrationDocument(targetUid, file, targetDocType, onProgress);
    }

    if (PROTOTYPE_MODE_DISABLE_STORAGE) {
      console.info(`[StorageService] Prototype mode enabled - skipping Firebase Storage upload for path: ${folder}`);
      if (onProgress) onProgress(100, file.name);
      return this.handlePrototypeUpload(file, folder);
    }

    try {
      const compressedBlob = await compressImage(file);
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const filename = `${Date.now()}_${sanitizedName}`;
      const storagePath = `${folder}/${filename}`;
      const storageRef = ref(storage, storagePath);

      // Wrap uploadBytesResumable with 6000ms max timeout to prevent hanging when Storage is blocked/unreachable
      const storagePromise = new Promise<string>((resolve, reject) => {
        const uploadTask = uploadBytesResumable(storageRef, compressedBlob, {
          contentType: 'image/jpeg',
          customMetadata: {
            originalName: file.name,
            uploadedAt: new Date().toISOString(),
          },
        });

        const timer = setTimeout(() => {
          try { uploadTask.cancel(); } catch (_) {}
          reject(new Error(`Firebase Storage upload attempt timed out after 6000ms for path ${storagePath}`));
        }, 6000);

        uploadTask.on(
          'state_changed',
          (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            if (onProgress) {
              onProgress(Math.round(progress), file.name);
            }
          },
          (error) => {
            clearTimeout(timer);
            reject(error);
          },
          async () => {
            clearTimeout(timer);
            try {
              const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
              resolve(downloadURL);
            } catch (err) {
              reject(err);
            }
          }
        );
      });

      return await storagePromise;
    } catch (error: any) {
      console.warn('[StorageService] Firebase Storage upload unavailable or timed out:', error?.message || error);
      return this.handlePrototypeUpload(file, folder);
    }
  }

  /**
   * Returns the permanent public download URL.
   */
  async uploadReportImage(
    file: File,
    reportId: string,
    onProgress?: UploadProgressCallback
  ): Promise<string> {
    if (PROTOTYPE_MODE_DISABLE_STORAGE) {
      console.info(`[StorageService] Prototype mode enabled - skipping Firebase Storage upload for report`);
      if (onProgress) onProgress(100, file.name);
      return this.handlePrototypeUpload(file, `reports/${reportId}`);
    }

    try {
      // 1. Compress image client-side
      const compressedBlob = await compressImage(file);

      // 2. Build unique storage path
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const filename = `${Date.now()}_${sanitizedName}`;
      const storagePath = `reports/${reportId}/${filename}`;
      const storageRef = ref(storage, storagePath);

      // 3. Upload with resumable task for progress monitoring
      return new Promise<string>((resolve, reject) => {
        const uploadTask = uploadBytesResumable(storageRef, compressedBlob, {
          contentType: 'image/jpeg',
          customMetadata: {
            originalName: file.name,
            uploadedAt: new Date().toISOString(),
          },
        });

        uploadTask.on(
          'state_changed',
          (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            if (onProgress) {
              onProgress(Math.round(progress), file.name);
            }
          },
          (error) => {
            console.error('[StorageService] Upload failed:', error);
            reject(new Error(`Failed to upload ${file.name}: ${error.message}`));
          },
          async () => {
            try {
              const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
              resolve(downloadURL);
            } catch (err: any) {
              reject(new Error(`Failed to retrieve download URL: ${err.message}`));
            }
          }
        );
      });
    } catch (error: any) {
      console.error('[StorageService] Compression/Upload error:', error);
      throw error;
    }
  }

  /**
   * Uploads multiple image files sequentially or in parallel with progress updates.
   */
  async uploadMultipleReportImages(
    files: File[],
    reportId: string,
    onOverallProgress?: (progress: number, currentFile: string) => void
  ): Promise<string[]> {
    if (!files || files.length === 0) return [];

    const urls: string[] = [];
    const totalFiles = files.length;

    for (let i = 0; i < totalFiles; i++) {
      const file = files[i];
      const url = await this.uploadReportImage(file, reportId, (fileProgress) => {
        const overall = Math.round(((i + fileProgress / 100) / totalFiles) * 100);
        if (onOverallProgress) {
          onOverallProgress(overall, file.name);
        }
      });
      urls.push(url);
    }

    if (onOverallProgress) {
      onOverallProgress(100, 'All uploads completed');
    }

    return urls;
  }

  /**
   * Uploads an offline-created report base64 Data URL to Firebase Storage.
   * Uses deterministic storage paths (`reports/${reportId}/photo_${photoIndex + 1}.${ext}`)
   * to guarantee idempotency and prevent duplicate storage objects during sync retries.
   */
  async uploadReportDataUrl(
    dataUrl: string,
    reportId: string,
    photoIndex = 0
  ): Promise<string> {
    // If not an encoded data URL (e.g., already an http/https URL or prototype SVG), return as is
    if (!dataUrl || !dataUrl.startsWith('data:image/')) {
      return dataUrl;
    }

    if (PROTOTYPE_MODE_DISABLE_STORAGE) {
      console.info(`[StorageService] Prototype mode active - preserving encoded image for report ${reportId}`);
      return dataUrl;
    }

    try {
      const { blob, mimeType } = dataUrlToBlob(dataUrl);
      const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
      const storagePath = `reports/${reportId}/photo_${photoIndex + 1}.${ext}`;
      const storageRef = ref(storage, storagePath);

      return await new Promise<string>((resolve, reject) => {
        const uploadTask = uploadBytesResumable(storageRef, blob, {
          contentType: mimeType,
          customMetadata: {
            reportId,
            photoIndex: String(photoIndex),
            uploadedAt: new Date().toISOString(),
          },
        });

        const timer = setTimeout(() => {
          try { uploadTask.cancel(); } catch (_) {}
          reject(new Error(`Firebase Storage upload timed out after 8000ms for path ${storagePath}`));
        }, 8000);

        uploadTask.on(
          'state_changed',
          null,
          (error) => {
            clearTimeout(timer);
            console.warn(`[StorageService] Offline photo upload failed for ${storagePath}:`, error);
            reject(error);
          },
          async () => {
            clearTimeout(timer);
            try {
              const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
              resolve(downloadURL);
            } catch (err) {
              reject(err);
            }
          }
        );
      });
    } catch (error: any) {
      console.warn(`[StorageService] uploadReportDataUrl error:`, error);
      throw error;
    }
  }

  /**
   * Reconciles all Data URLs in a list of imageUrls for a report,
   * uploading any offline Data URLs to Firebase Storage and returning the final URL list.
   * If any upload fails, throws error so mutation is retained in the queue.
   */
  async reconcileReportImages(
    imageUrls: string[],
    reportId: string
  ): Promise<string[]> {
    if (!imageUrls || imageUrls.length === 0) return [];

    const reconciled: string[] = [];
    for (let i = 0; i < imageUrls.length; i++) {
      const url = imageUrls[i];
      if (url && typeof url === 'string' && url.startsWith('data:image/')) {
        const uploadedUrl = await this.uploadReportDataUrl(url, reportId, i);
        reconciled.push(uploadedUrl);
      } else {
        reconciled.push(url);
      }
    }
    return reconciled;
  }

  /**
   * Compresses and uploads an announcement cover image to Firebase Storage.
   */
  async uploadAnnouncementImage(
    file: File,
    announcementId: string,
    onProgress?: UploadProgressCallback
  ): Promise<string> {
    if (PROTOTYPE_MODE_DISABLE_STORAGE) {
      console.info(`[StorageService] Prototype mode enabled - skipping Firebase Storage upload for announcement`);
      if (onProgress) onProgress(100, file.name);
      return this.handlePrototypeUpload(file, `announcements/${announcementId}`);
    }

    try {
      const compressedBlob = await compressImage(file);
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const filename = `${Date.now()}_${sanitizedName}`;
      const storagePath = `announcements/${announcementId}/${filename}`;
      const storageRef = ref(storage, storagePath);

      return new Promise<string>((resolve, reject) => {
        const uploadTask = uploadBytesResumable(storageRef, compressedBlob, {
          contentType: 'image/jpeg',
          customMetadata: {
            originalName: file.name,
            uploadedAt: new Date().toISOString(),
          },
        });

        uploadTask.on(
          'state_changed',
          (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            if (onProgress) {
              onProgress(Math.round(progress), file.name);
            }
          },
          (error) => {
            console.error('[StorageService] Announcement image upload failed:', error);
            reject(new Error(`Failed to upload ${file.name}: ${error.message}`));
          },
          async () => {
            try {
              const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
              resolve(downloadURL);
            } catch (err: any) {
              reject(new Error(`Failed to retrieve download URL: ${err.message}`));
            }
          }
        );
      });
    } catch (error: any) {
      console.error('[StorageService] Announcement image compression/upload error:', error);
      throw error;
    }
  }

  /**
   * Uploads user profile photo to Firebase Storage under `profile-photos/{userId}/avatar.jpg`
   */
  async uploadProfilePhoto(
    userId: string,
    file: File,
    onProgress?: UploadProgressCallback
  ): Promise<string> {
    validateProfileImage(file);

    const croppedBlob = await cropAndCompressSquareImage(file, 500, 0.85);

    if (PROTOTYPE_MODE_DISABLE_STORAGE) {
      console.info(`[StorageService] Prototype mode enabled - skipping Firebase Storage upload for profile photo`);
      if (onProgress) onProgress(100, file.name);
      return this.handlePrototypeUpload(file, `profile-photos/${userId}`);
    }

    try {
      const storagePath = `profile-photos/${userId}/avatar.jpg`;
      const storageRef = ref(storage, storagePath);

      return new Promise<string>((resolve, reject) => {
        const uploadTask = uploadBytesResumable(storageRef, croppedBlob, {
          contentType: 'image/jpeg',
          customMetadata: {
            userId,
            uploadedAt: new Date().toISOString(),
          },
        });

        uploadTask.on(
          'state_changed',
          (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            if (onProgress) {
              onProgress(Math.round(progress), file.name);
            }
          },
          (error) => {
            console.warn('[StorageService] Firebase Storage upload failed, falling back to prototype upload:', error);
            this.handlePrototypeUpload(file, `profile-photos/${userId}`).then(resolve).catch(reject);
          },
          async () => {
            try {
              const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
              resolve(downloadURL);
            } catch (err) {
              this.handlePrototypeUpload(file, `profile-photos/${userId}`).then(resolve).catch(reject);
            }
          }
        );
      });
    } catch (error) {
      console.warn('[StorageService] Storage upload fallback:', error);
      return this.handlePrototypeUpload(file, `profile-photos/${userId}`);
    }
  }

  /**
   * Uploads evidence file for household number change conflict request.
   */
  async uploadHouseholdNumberEvidence(
    requestId: string,
    file: File,
    onProgress?: (progress: number, fileName: string) => void
  ): Promise<{ url: string; path: string; fileName: string }> {
    const fileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const storagePath = `household-number-change-evidence/${requestId}/${fileName}`;

    if (PROTOTYPE_MODE_DISABLE_STORAGE) {
      console.info(`[StorageService] Prototype mode enabled - skipping Firebase Storage upload for path: ${storagePath}`);
      if (onProgress) onProgress(100, file.name);
      const url = await this.handlePrototypeUpload(file, `household-number-change-evidence/${requestId}`);
      return { url, path: storagePath, fileName: file.name };
    }

    try {
      const storageRef = ref(storage, storagePath);
      const storagePromise = new Promise<{ url: string; path: string; fileName: string }>((resolve, reject) => {
        const uploadTask = uploadBytesResumable(storageRef, file, {
          customMetadata: {
            uploaderUid: auth.currentUser?.uid || 'anonymous',
            requestId,
          },
        });

        const timer = setTimeout(() => {
          try { uploadTask.cancel(); } catch (_) {}
          reject(new Error(`Firebase Storage upload attempt timed out after 6000ms for path ${storagePath}`));
        }, 6000);

        uploadTask.on(
          'state_changed',
          (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            if (onProgress) {
              onProgress(Math.round(progress), file.name);
            }
          },
          (error) => {
            clearTimeout(timer);
            console.warn('[StorageService] Evidence upload failed, falling back to prototype storage:', error);
            this.handlePrototypeUpload(file, `household-number-change-evidence/${requestId}`)
              .then((url) => resolve({ url, path: storagePath, fileName: file.name }))
              .catch(reject);
          },
          async () => {
            clearTimeout(timer);
            try {
              const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
              resolve({ url: downloadURL, path: storagePath, fileName: file.name });
            } catch (err) {
              this.handlePrototypeUpload(file, `household-number-change-evidence/${requestId}`)
                .then((url) => resolve({ url, path: storagePath, fileName: file.name }))
                .catch(reject);
            }
          }
        );
      });

      return await storagePromise;
    } catch (error) {
      console.warn('[StorageService] Evidence storage upload unavailable or timed out:', error);
      const url = await this.handlePrototypeUpload(file, `household-number-change-evidence/${requestId}`);
      return { url, path: storagePath, fileName: file.name };
    }
  }

  /**
   * Deletes user profile photo from Firebase Storage.
   */
  async deleteProfilePhoto(userId: string, photoUrl?: string): Promise<void> {
    try {
      const storagePath = `profile-photos/${userId}/avatar.jpg`;
      const storageRef = ref(storage, storagePath);
      await deleteObject(storageRef);
    } catch (error) {
      if (photoUrl) {
        await this.deleteImageByUrl(photoUrl);
      }
    }
  }

  /**
   * Deletes an image from Firebase Storage using its download URL.
   * Silently catches errors if file doesn't exist or is an external URL.
   */
  async deleteImageByUrl(downloadUrl: string): Promise<void> {
    if (!downloadUrl || !downloadUrl.includes('firebasestorage.googleapis.com')) {
      // Not a Firebase Storage URL (e.g. seed Unsplash image), skip
      return;
    }

    try {
      const imageRef = ref(storage, downloadUrl);
      await deleteObject(imageRef);
    } catch (error) {
      console.warn('[StorageService] Failed to delete image from storage:', downloadUrl, error);
    }
  }

  /**
   * Deletes multiple orphaned report images from Firebase Storage.
   */
  async deleteReportImages(imageUrls: string[]): Promise<void> {
    if (!imageUrls || imageUrls.length === 0) return;
    await Promise.all(imageUrls.map((url) => this.deleteImageByUrl(url)));
  }
}

export const storageService = new StorageService();
