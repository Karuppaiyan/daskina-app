// Client-side: shrink phone photos before upload (saves mobile data and storage)
export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size < 800_000) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, "image/jpeg", 0.8));
    return blob
      ? new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" })
      : file;
  } catch {
    return file;
  }
}

export async function uploadOne(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", await compressImage(file));
  const r = await fetch("/api/upload", { method: "POST", body: fd });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? "Upload failed");
  return j.url as string;
}
