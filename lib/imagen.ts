// Compresión de fotos de evidencia en el cliente: la cámara del teléfono saca
// JPEGs de varios MB; acá se reescala (máx 1280px) y recomprime a ~100-300 KB
// antes de encolar/subir, para que la cola offline y el bucket no engorden.

const BYTES_OBJETIVO = 300 * 1024;

interface OpcionesCompresion {
  maxDim?: number;
  calidad?: number;
}

/** Reescala y recomprime una imagen a JPEG. Respeta la orientación EXIF. */
export async function comprimirFoto(
  origen: File | Blob,
  { maxDim = 1280, calidad = 0.7 }: OpcionesCompresion = {},
): Promise<Blob> {
  const bitmap = await decodificar(origen);
  try {
    const escala = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const ancho = Math.max(1, Math.round(bitmap.width * escala));
    const alto = Math.max(1, Math.round(bitmap.height * escala));

    const canvas = document.createElement("canvas");
    canvas.width = ancho;
    canvas.height = alto;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No se pudo procesar la imagen.");
    ctx.drawImage(bitmap, 0, 0, ancho, alto);

    let blob = await aJpeg(canvas, calidad);
    if (blob.size > BYTES_OBJETIVO) blob = await aJpeg(canvas, 0.55);
    return blob;
  } finally {
    if ("close" in bitmap) bitmap.close();
  }
}

async function decodificar(origen: File | Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    // "from-image" aplica la rotación EXIF (fotos de cámara en portrait).
    return createImageBitmap(origen, { imageOrientation: "from-image" });
  }
  const url = URL.createObjectURL(origen);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("No se pudo leer la imagen."));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function aJpeg(canvas: HTMLCanvasElement, calidad: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("No se pudo comprimir la imagen."))),
      "image/jpeg",
      calidad,
    );
  });
}
