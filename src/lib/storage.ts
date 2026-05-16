import { storage } from './firebase';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';

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

        uploadTask.on('state_changed', 
          (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            console.log(`[Storage] Progress: ${progress.toFixed(0)}%`);
          }, 
          (error) => {
            console.error('[Storage] TASK ERROR:', error);
            // Visual alert for mobile debugging
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
 * A helper to provide consistent image URLs.
 */
export function getImageUrl(url: string): string {
  if (!url) return '';
  return url;
}
