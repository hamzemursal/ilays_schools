import { Injectable } from "@nestjs/common";
import { v2 as cloudinary } from "cloudinary";

// Cloudinary doesn't distinguish "bucket + key" like S3 — a single account
// holds every asset, addressed by public_id (we reuse the same storageKey
// strings DocumentsService already generates, e.g. "students/<id>/<uuid>").
// resource_type has to match at upload and at every later read/delete, and
// mimeType is the only signal we have for it (PDFs must be "raw"; images
// are "image"), so callers that know the mimeType pass it through.
function resourceTypeFor(mimeType?: string): "image" | "raw" {
  return mimeType === "application/pdf" ? "raw" : "image";
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
    await new Promise<void>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { public_id: key, resource_type: resourceTypeFor(mimeType), overwrite: true },
        (error) => (error ? reject(error) : resolve()),
      );
      stream.end(body);
    });
  }

  async delete(key: string, mimeType?: string): Promise<void> {
    await cloudinary.uploader.destroy(key, { resource_type: resourceTypeFor(mimeType) });
  }

  // Cloudinary doesn't offer short-lived expiring GET URLs the way S3 does —
  // the storageKey is already an unguessable random UUID path, so this
  // returns a stable public delivery URL instead of a time-limited one.
  async getSignedDownloadUrl(key: string, mimeType?: string): Promise<string> {
    return cloudinary.url(key, { secure: true, resource_type: resourceTypeFor(mimeType) });
  }
}
