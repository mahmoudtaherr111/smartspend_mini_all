/** Client-side resize/compress before upload — saves bandwidth and vision tokens. */
export async function compressImageFile(
  file: File,
  opts?: { maxEdge?: number; quality?: number; maxBytes?: number }
): Promise<{ base64: string; mimeType: string; previewUrl: string }> {
  const maxEdge = opts?.maxEdge ?? 1280;
  const quality = opts?.quality ?? 0.82;
  const maxBytes = opts?.maxBytes ?? 900_000;

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("تعذر معالجة الصورة");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  let q = quality;
  let dataUrl = canvas.toDataURL("image/jpeg", q);
  while (dataUrl.length > maxBytes * 1.37 && q > 0.45) {
    q -= 0.08;
    dataUrl = canvas.toDataURL("image/jpeg", q);
  }

  const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1]! : dataUrl;
  return { base64, mimeType: "image/jpeg", previewUrl: dataUrl };
}
