import { storage } from './firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

/**
 * Uploads a file to Firebase Storage and returns the download URL.
 */
export async function uploadImage(file: File, path = 'uploads'): Promise<string | null> {
  if (!file) return null;

  try {
    const filename = `${Date.now()}-${file.name}`;
    const storageRef = ref(storage, `${path}/${filename}`);
    
    const snapshot = await uploadBytes(storageRef, file);
    const downloadURL = await getDownloadURL(snapshot.ref);
    
    return downloadURL;
  } catch (err) {
    console.error('Firebase Storage upload error:', err);
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
