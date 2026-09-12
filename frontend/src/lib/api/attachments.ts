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
  /**
   * The content type the backend baked into the signature (issue #47). The
   * server derives it from the file extension, so it is not necessarily
   * `file.type` — the PUT must send exactly this or R2 rejects the upload.
   */
  contentType: string;
  /** Byte count bound into the signature; the browser sets Content-Length. */
  contentLength: number;
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
        // Deliberately not sending contentType: the backend derives it from the
        // (allowlisted) extension and signs that. Browsers disagree on types
        // for common formats — Windows reports .csv as application/vnd.ms-excel
        // — and a declared type that contradicts the extension is rejected.
        sizeBytes: file.size,
      });
    } catch (err) {
      rethrow(err);
    }

    // Direct-to-R2 transfer (not through the API, not through the http client).
    // Content-Type must be the server's value, not the browser's: it is part of
    // X-Amz-SignedHeaders. Content-Length is set by the browser from the File
    // and is signed too, so a file that changed size since the ticket was
    // issued is refused by storage rather than silently stored.
    const putRes = await fetch(ticket.uploadUrl, {
      method: ticket.method,
      headers: { "Content-Type": ticket.contentType },
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
      mimeType: ticket.contentType,
      sizeBytes: ticket.contentLength,
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
