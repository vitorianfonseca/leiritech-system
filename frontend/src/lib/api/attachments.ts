/**
 * Attachments client — signed-URL upload/download (integration issue #46).
 *
 * Files never flow through the API: the client asks the backend for a short-lived
 * presigned URL and transfers bytes directly to/from Cloudflare R2.
 *
 * FLAG — R2 credentials are NOT configured in this environment. The backend
 * returns `503 STORAGE_NOT_CONFIGURED` for `upload-url`/`download-url` until
 * `R2_ACCOUNT_ID`/`R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` and
 * `R2_BUCKET` are set (and `boto3` is installed backend-side). This interface is
 * complete; only the credentials are missing. `StorageNotConfiguredError` is
 * surfaced so the UI can show a precise "storage not configured" message rather
 * than a generic failure — nothing here fakes a successful upload.
 */

import { http, HttpError } from "./http";

export interface AttachmentMeta {
  id: string;
  entityType: string;
  entityId: string;
  filename: string;
  mimeType: string | null;
  sizeBytes: number | null;
  uploadedBy: string | null;
  createdAt: string;
}

interface UploadTicket {
  attachmentId: string;
  key: string;
  uploadUrl: string;
  method: string;
  expiresIn: number;
}

interface DownloadTicket {
  downloadUrl: string;
  expiresIn: number;
}

export class StorageNotConfiguredError extends Error {
  constructor() {
    super("storage_not_configured");
    this.name = "StorageNotConfiguredError";
  }
}

function rethrow(err: unknown): never {
  if (err instanceof HttpError && err.code === "STORAGE_NOT_CONFIGURED") {
    throw new StorageNotConfiguredError();
  }
  throw err;
}

export interface AttachmentsApi {
  list(entityType: string, entityId: string): Promise<AttachmentMeta[]>;
  /** Full upload flow: request a presigned PUT URL, then transfer bytes to R2. */
  upload(entityType: string, entityId: string, file: File): Promise<AttachmentMeta>;
  /** Resolve a short-lived presigned GET URL for an existing attachment. */
  getDownloadUrl(attachmentId: string): Promise<string>;
}

export const attachmentsApi: AttachmentsApi = {
  async list(entityType, entityId) {
    return http.get<AttachmentMeta[]>("/attachments", {
      query: { entityType, entityId },
    });
  },

  async upload(entityType, entityId, file) {
    let ticket: UploadTicket;
    try {
      ticket = await http.post<UploadTicket>("/attachments/upload-url", {
        entityType,
        entityId,
        filename: file.name,
        contentType: file.type || null,
        sizeBytes: file.size,
      });
    } catch (err) {
      rethrow(err);
    }

    // Direct-to-R2 transfer (not through the API, not through the http client).
    const putRes = await fetch(ticket.uploadUrl, {
      method: ticket.method,
      headers: file.type ? { "Content-Type": file.type } : undefined,
      body: file,
    });
    if (!putRes.ok) {
      throw new Error(`Upload to storage failed (${putRes.status}).`);
    }

    return {
      id: ticket.attachmentId,
      entityType,
      entityId,
      filename: file.name,
      mimeType: file.type || null,
      sizeBytes: file.size,
      uploadedBy: null,
      createdAt: new Date().toISOString(),
    };
  },

  async getDownloadUrl(attachmentId) {
    try {
      const ticket = await http.get<DownloadTicket>(
        `/attachments/${attachmentId}/download-url`,
      );
      return ticket.downloadUrl;
    } catch (err) {
      rethrow(err);
    }
  },
};
