import { storage } from './firebase';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';

/**
 * Supported MIME types and extensions for offer promotional images.
 */
export const ACCEPTED_OFFER_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_OFFER_IMAGE_SIZE_BYTES = 3 * 1024 * 1024; // 3 MB

/**
 * Validates that a file is an image of accepted type and under maximum size.
 */
export function validateImageFile(
  file: File,
  maxSizeBytes = MAX_OFFER_IMAGE_SIZE_BYTES,
  allowedTypes = ACCEPTED_OFFER_IMAGE_TYPES
): void {
  if (!file) {
    throw new Error('Please select an image file to upload.');
  }

  // Check file type
  const mimeType = file.type?.toLowerCase();
  const extension = file.name ? file.name.split('.').pop()?.toLowerCase() : '';
  const validExtension = ['jpg', 'jpeg', 'png', 'webp'].includes(extension || '');

  const isAllowedType = allowedTypes.includes(mimeType) || validExtension;
  if (!isAllowedType) {
    throw new Error('Invalid file format. Only JPG, PNG, and WebP images are supported.');
  }

  // Check file size (max 3MB)
  if (file.size > maxSizeBytes) {
    const sizeInMB = (file.size / (1024 * 1024)).toFixed(1);
    throw new Error(`File size (${sizeInMB} MB) exceeds the maximum allowed size of 3 MB.`);
  }
}

/**
 * Compresses and resizes an image client-side for wide ~16:9 banner displays.
 * Target maximum dimension: 1600x900px at 85% quality.
 * Zero external dependencies (uses standard HTML5 Canvas).
 */
export async function compressBannerImage(
  file: File,
  maxWidth = 1600,
  maxHeight = 900,
  quality = 0.85
): Promise<Blob> {
  // Return original file if running on server / SSR
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return file;
  }

  return new Promise((resolve, reject) => {
    const img = new window.Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let width = img.width;
      let height = img.height;

      // Scale down proportionally if larger than maximums
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(file);
        return;
      }

      // Smooth resizing
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);

      // Prefer WebP for high compression, fallback to JPEG
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            resolve(file);
          }
        },
        'image/webp',
        quality
      );
    };

    img.onerror = (err) => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image for compression.'));
    };

    img.src = objectUrl;
  });
}

/**
 * Uploads an offer promotional banner image to Firebase Storage at `offers/{offerId}/{filename}`.
 * Validates, compresses (16:9 banner ratio), and returns the public download URL.
 */
export async function uploadOfferImage(offerId: string, file: File): Promise<string> {
  if (!offerId || !offerId.trim()) {
    throw new Error('Offer ID is required to upload an offer image.');
  }

  // 1. Validate file (image format, max 3MB)
  validateImageFile(file, MAX_OFFER_IMAGE_SIZE_BYTES, ACCEPTED_OFFER_IMAGE_TYPES);

  // 2. Compress image client-side (wide ~16:9 aspect ratio max 1600x900)
  const compressedBlob = await compressBannerImage(file, 1600, 900, 0.85);

  // 3. Generate sanitized Storage filename
  const cleanName = (file.name || 'banner.webp').replace(/[^a-z0-9.]/gi, '_');
  const filename = `${Date.now()}-${cleanName}`;
  const storagePath = `offers/${offerId}/${filename}`;
  const storageRef = ref(storage, storagePath);

  const contentType = compressedBlob.type || file.type || 'image/webp';
  const metadata = { contentType };

  console.log(`[Storage] Uploading offer banner to ${storagePath} (${(compressedBlob.size / 1024).toFixed(1)} KB)`);

  // 4. Upload bytes and resolve download URL
  const uploadTask = uploadBytesResumable(storageRef, compressedBlob, metadata);

  return new Promise((resolve, reject) => {
    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        console.log(`[Storage] Offer upload progress: ${progress.toFixed(0)}%`);
      },
      (error) => {
        console.error('[Storage] Offer upload error:', error);
        reject(new Error(`Image upload failed: ${error.message}`));
      },
      async () => {
        const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
        console.log('[Storage] Offer banner upload success:', downloadUrl);
        resolve(downloadUrl);
      }
    );
  });
}

/**
 * Deletes a file from Firebase Storage given its download URL or Storage path.
 * Fails gracefully if the file is not a Storage URL or is already deleted.
 */
export async function deleteStorageFileByUrl(url?: string | null): Promise<void> {
  if (!url || typeof url !== 'string') return;

  // Ignore non-storage URLs (data URLs, local placeholders, external CDN)
  if (!url.includes('firebasestorage.googleapis.com') && !url.includes('storage.googleapis.com')) {
    return;
  }

  try {
    const fileRef = ref(storage, url);
    await deleteObject(fileRef);
    console.log('[Storage] Successfully deleted storage file for URL:', url);
  } catch (err: any) {
    // If already deleted or not found (storage/object-not-found), ignore
    if (err?.code === 'storage/object-not-found') {
      console.warn('[Storage] Object already deleted or not found:', url);
    } else {
      console.warn('[Storage] Warning while deleting file:', err?.message || err);
    }
  }
}

/**
 * Uploads a file to Firebase Storage and returns the download URL.
 * Optimized for both Web and Native (Capacitor) environments.
 */
export async function uploadImage(file: File | Blob, path = 'uploads'): Promise<string | null> {
  if (!file || file.size === 0) {
    console.error('[Storage] Invalid file');
    return null;
  }

  try {
    const filename = `${Date.now()}-${((file as File).name || 'img.jpg').replace(/[^a-z0-9.]/gi, '_')}`;
    const storageRef = ref(storage, `${path}/${filename}`);
    const metadata = { contentType: file.type || 'image/jpeg' };

    console.log('[Storage] Starting upload:', filename);

    return new Promise((resolve) => {
      const reader = new FileReader();

      reader.onloadend = async () => {
        const blobData = new Blob([reader.result as ArrayBuffer], { type: metadata.contentType });
        const uploadTask = uploadBytesResumable(storageRef, blobData, metadata);

        uploadTask.on(
          'state_changed',
          (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            console.log(`[Storage] Progress: ${progress.toFixed(0)}%`);
          },
          (error) => {
            console.error('[Storage] TASK ERROR:', error);
            if (typeof window !== 'undefined') {
              alert(`Upload Error: ${error.message} (Code: ${error.code})`);
            }
            resolve(null);
          },
          async () => {
            const url = await getDownloadURL(uploadTask.snapshot.ref);
            console.log('[Storage] SUCCESS:', url);
            resolve(url);
          }
        );
      };

      reader.onerror = () => {
        console.error('[Storage] Reader error');
        resolve(null);
      };

      reader.readAsArrayBuffer(file);
    });
  } catch (err: any) {
    console.error('[Storage] UNEXPECTED ERROR:', err);
    if (typeof window !== 'undefined') {
      alert(`Unexpected Error: ${err.message}`);
    }
    return null;
  }
}

/**
 * A helper to provide consistent image URLs with safe fallback on production.
 */
export function getImageUrl(url?: string | null): string {
  if (!url || typeof url !== 'string') return '';
  if (url.includes('localhost:') || url.includes('127.0.0.1:')) {
    if (
      typeof window !== 'undefined' &&
      !window.location.hostname.includes('localhost') &&
      !window.location.hostname.includes('127.0.0.1')
    ) {
      return '';
    }
  }
  return url;
}
