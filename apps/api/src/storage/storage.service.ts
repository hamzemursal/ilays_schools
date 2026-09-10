import { Injectable } from "@nestjs/common";
import { v2 as cloudinary } from "cloudinary";

// Cloudinary doesn't distinguish "bucket + key" like S3 — a single account
// holds every asset, addressed by public_id (we reuse the same storageKey
// strings DocumentsService already generates, e.g. "students/<id>/<uuid>.jpg").
// resource_type has to match at upload and at every later read/delete, and
// mimeType is the only signal we have for it — Cloudinary's "image" pipeline
// only actually handles image formats; anything else (PDF, DOC, DOCX, ...)
// must go through as "raw" or the upload fails/corrupts.
const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
function resourceTypeFor(mimeType?: string): "image" | "raw" {
  return mimeType && IMAGE_MIME_TYPES.has(mimeType) ? "image" : "raw";
}

// For an "image" resource, Cloudinary silently strips a trailing file
// extension off whatever public_id it's given and tracks the format
// separately — so passing the extension back as part of the public_id on a
// later read/delete/list never matches what was actually stored. Splitting
// it out up front and passing it via the dedicated `format` option instead
// keeps upload and every later reference to the same key in agreement.
function splitKey(key: string): { publicId: string; format?: string } {
  const lastDot = key.lastIndexOf(".");
  const lastSlash = key.lastIndexOf("/");
  if (lastDot > lastSlash) {
    return { publicId: key.slice(0, lastDot), format: key.slice(lastDot + 1) };
  }
  return { publicId: key };
}

@Injectable()
export class StorageService {
  constructor() {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true,
    });
  }

  async upload(key: string, body: Buffer, mimeType: string): Promise<void> {
    const { publicId, format } = splitKey(key);
    await new Promise<void>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { public_id: publicId, format, resource_type: resourceTypeFor(mimeType), overwrite: true },
        (error) => (error ? reject(error) : resolve()),
      );
      stream.end(body);
    });
  }

  async delete(key: string, mimeType?: string): Promise<void> {
    const { publicId } = splitKey(key);
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceTypeFor(mimeType) });
  }

  // Cloudinary doesn't offer short-lived expiring GET URLs the way S3 does —
  // the storageKey is already an unguessable random UUID path, so this
  // returns a stable public delivery URL instead of a time-limited one.
  async getSignedDownloadUrl(key: string, mimeType?: string): Promise<string> {
    const { publicId, format } = splitKey(key);
    return cloudinary.url(publicId, { secure: true, resource_type: resourceTypeFor(mimeType), format });
  }

  // Genuinely private counterpart to upload()/getSignedDownloadUrl() above —
  // for content where a link leaking and staying valid forever is a real
  // problem (an exam paper before results day), not the default for every
  // document type. `type: "private"` at upload is what makes
  // private_download_url's signature (and its expiry) actually enforced by
  // Cloudinary, rather than the plain "upload" delivery type used elsewhere,
  // which serves by public_id alone with no expiry to check.
  async uploadPrivate(key: string, body: Buffer, mimeType: string): Promise<void> {
    const { publicId, format } = splitKey(key);
    await new Promise<void>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { public_id: publicId, format, resource_type: resourceTypeFor(mimeType), type: "private", overwrite: true },
        (error) => (error ? reject(error) : resolve()),
      );
      stream.end(body);
    });
  }

  // A real time-limited signed URL, unlike getSignedDownloadUrl's misleading
  // name — only valid for a `type: "private"` upload (see uploadPrivate).
  // 10 minutes is comfortable for one view/download without leaving a link
  // that still works if it ends up in a log or a shared screenshot days
  // later.
  async getPrivateDownloadUrl(key: string, mimeType: string | undefined, expiresInSeconds = 600): Promise<string> {
    const { publicId, format } = splitKey(key);
    return cloudinary.utils.private_download_url(publicId, format ?? "", {
      resource_type: resourceTypeFor(mimeType),
      type: "private",
      expires_at: Math.floor(Date.now() / 1000) + expiresInSeconds,
    });
  }
}
