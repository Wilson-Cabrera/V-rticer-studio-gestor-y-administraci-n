import { supabase } from '../lib/supabase';

const BUCKET_NAME = 'vorticer-imagenes';
const MAX_DIMENSION = 1200;

/**
 * Optimiza y redimensiona una imagen en el navegador antes de subirla a Supabase Storage
 * para cuidar el límite de 1 GB del Plan Free sin perder nitidez en el PDF A4.
 * Mantiene fondo transparente (formato WebP/PNG).
 */
async function optimizeImageFile(file) {
  // Si es SVG, lo devolvemos tal cual
  if (file.type === 'image/svg+xml') {
    return { blob: file, ext: 'svg', contentType: 'image/svg+xml' };
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer el archivo de imagen'));
    reader.onload = (event) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Formato de imagen inválido'));
      img.onload = () => {
        let { width, height } = img;
        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
          if (width >= height) {
            height = Math.round((height * MAX_DIMENSION) / width);
            width = MAX_DIMENSION;
          } else {
            width = Math.round((width * MAX_DIMENSION) / height);
            height = MAX_DIMENSION;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        // Usamos PNG si el original era PNG para máxima fidelidad en recortes sin fondo,
        // o WebP de alta calidad para fotos JPG/WebP
        const outputType = file.type === 'image/png' ? 'image/png' : 'image/webp';
        const ext = file.type === 'image/png' ? 'png' : 'webp';

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve({ blob: file, ext: 'png', contentType: file.type || 'image/png' });
              return;
            }
            resolve({ blob, ext, contentType: outputType });
          },
          outputType,
          0.88
        );
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Sube una imagen al bucket público `vorticer-imagenes` de Supabase Storage
 * y retorna la URL pública lista para guardar en `public.productos.foto`.
 */
export async function uploadProductImageToSupabase(file, category = 'general') {
  const { blob, ext, contentType } = await optimizeImageFile(file);

  const cleanName = (file.name || 'imagen')
    .replace(/\.[^/.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40);

  const safeCategory = (category || 'general').replace(/[^a-z0-9-_]/g, '');
  const uniquePath = `${safeCategory}/${Date.now()}-${cleanName}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(uniquePath, blob, {
      contentType,
      cacheControl: '31536000',
      upsert: true
    });

  if (uploadError) {
    throw uploadError;
  }

  const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(uniquePath);
  return data.publicUrl;
}
