const CLOUD_NAME = 'dqrd5odqi';
const UPLOAD_PRESET = 'dabzooo';

export async function uploadImage(file: File): Promise<string | null> {
  if (!file) return null;

  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', UPLOAD_PRESET);

  try {
    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
      { method: 'POST', body: formData }
    );
    const data = await res.json();
    if (!res.ok || !data.secure_url) {
      console.error('Cloudinary upload failed:', data);
      return null;
    }
    return data.secure_url as string;
  } catch (err) {
    console.error('Cloudinary error:', err);
    return null;
  }
}

export function cloudinaryUrl(url: string, width = 400, height = 300): string {
  if (!url || !url.includes('cloudinary.com')) return url;
  // Insert transformation into the URL
  return url.replace('/upload/', `/upload/w_${width},h_${height},c_fill,q_auto,f_auto/`);
}
