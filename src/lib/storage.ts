import { storage } from './firebase';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';

/**
 * Uploads a file to Firebase Storage and returns the download URL.
 * Optimized for both Web and Native (Capacitor) environments.
 */
export async function uploadImage(file: File | Blob, path = 'uploads'): Promise<string | null> {
  if (!file || file.size === 0) {
    console.error('[Storage] Invalid file or empty blob');
    return null;
  }

  try {
    console.log('[Storage] Starting upload for:', (file as File).name || 'image', 'Size:', file.size);
    
    // Sanitize filename
    const cleanName = ((file as File).name || 'upload.jpg').replace(/[^a-z0-9.]/gi, '_').toLowerCase();
    const filename = `${Date.now()}-${cleanName}`;
    const storageRef = ref(storage, `${path}/${filename}`);
    
    const metadata = {
      contentType: file.type || 'image/jpeg',
    };
    
    // Convert to ArrayBuffer for maximum compatibility
    const arrayBuffer = await file.arrayBuffer();
    
    return new Promise((resolve) => {
      const uploadTask = uploadBytesResumable(storageRef, arrayBuffer, metadata);

      uploadTask.on('state_changed', 
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          console.log(`[Storage] Upload is ${progress.toFixed(0)}% done`);
        }, 
        (error) => {
          console.error('[Storage] Upload task failed:', error);
          resolve(null);
        }, 
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          console.log('[Storage] Upload success:', downloadURL);
          resolve(downloadURL);
        }
      );
    });
  } catch (err: any) {
    console.error('[Storage] Firebase Storage unexpected error:', err);
    return null;
  }
}

/**
 * A helper to provide consistent image URLs.
 */
export function getImageUrl(url: string): string {
  if (!url) return '';
  return url;
}
