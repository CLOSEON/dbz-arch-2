import { storage } from './firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

/**
 * Uploads a file to Firebase Storage and returns the download URL.
 * Optimized for both Web and Native (Capacitor) environments.
 */
export async function uploadImage(file: File | Blob, path = 'uploads'): Promise<string | null> {
  if (!file) return null;

  try {
    console.log('[Storage] Starting upload for:', (file as File).name || 'blob', 'Size:', file.size);
    
    const filename = `${Date.now()}-${(file as File).name || 'upload.jpg'}`;
    const storageRef = ref(storage, `${path}/${filename}`);
    
    // Set metadata
    const metadata = {
      contentType: file.type || 'image/jpeg',
    };
    
    // CRITICAL FOR MOBILE: Convert to ArrayBuffer
    // Some mobile webviews have trouble streaming a File object directly to Firebase
    const arrayBuffer = await file.arrayBuffer();
    
    console.log('[Storage] ArrayBuffer created, starting uploadBytes...');
    const snapshot = await uploadBytes(storageRef, arrayBuffer, metadata);
    
    console.log('[Storage] uploadBytes complete, fetching URL...');
    const downloadURL = await getDownloadURL(snapshot.ref);
    
    console.log('[Storage] Upload success:', downloadURL);
    return downloadURL;
  } catch (err: any) {
    console.error('[Storage] Firebase Storage upload error:', err);
    // Explicitly check for CORS or Permission issues
    if (err.code === 'storage/unauthorized') {
      console.error('[Storage] ERROR: Unauthorized. Check Firebase Storage rules.');
    } else if (err.code === 'storage/retry-limit-exceeded') {
      console.error('[Storage] ERROR: Network timeout or CORS issue.');
    }
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
