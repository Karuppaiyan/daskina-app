// File storage. Dev/Docker: local "uploads" folder (persists via the project mount).
// Production: swap saveFile/readFile for S3 (client's AWS account) - the API contract stays the same.
import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";

const DIR = process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");
export const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

const TYPES = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  pdf: "application/pdf",
} as const;
type Ext = keyof typeof TYPES;

// Detect by file content (magic bytes), never trust the client's MIME type
export function detectExt(b: Buffer): Ext | null {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) return "png";
  if (b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP") return "webp";
  if (b.subarray(0, 4).toString() === "%PDF") return "pdf";
  return null;
}

export async function saveFile(buf: Buffer) {
  const ext = detectExt(buf);
  if (!ext) throw new Error("Unsupported file type (allowed: JPG, PNG, WEBP, PDF)");
  const name = `${randomUUID()}.${ext}`;
  await fs.mkdir(DIR, { recursive: true });
  await fs.writeFile(path.join(DIR, name), buf);
  return { name, url: `/api/files/${name}` };
}

export async function readStored(name: string) {
  const m = /^[0-9a-f-]{36}\.(jpg|png|webp|pdf)$/.exec(name); // blocks path traversal
  if (!m) return null;
  try {
    const buf = await fs.readFile(path.join(DIR, name));
    return { buf, type: TYPES[m[1] as Ext] };
  } catch {
    return null;
  }
}

export async function fileExists(name: string) {
  if (!/^[0-9a-f-]{36}\.(jpg|png|webp|pdf)$/.test(name)) return false;
  try {
    await fs.access(path.join(DIR, name));
    return true;
  } catch {
    return false;
  }
}
