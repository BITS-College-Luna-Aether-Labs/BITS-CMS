// Upload media
// Accepts files from authenticated users
// Restricts file types to safe, allowed formats
// Stores the file in the database as binary data
// Returns a media ID and a URL for later access


// Serve media
// Fetches a file by its ID
// Sends the raw file bytes back with the correct Content-Type
// Lets the browser display or download the file directly

import { Router } from "express";
import multer from "multer";
import { authenticate } from "../Middleware/auth.js";
import { insertMedia, getMediaById } from "../DB/media.js";
import { asyncHandler } from "../Utils/asyncHandler.js";
import { badRequest, notFound } from "../Utils/errors.js";
import { detectMimeType } from "../Utils/fileSignature.js";

const router = Router();

const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "video/mp4",
  "application/pdf",
]);

// SVGs can carry <script> — reject them until an SVG sanitizer is added
const BANNED_MIME_TYPES = new Set(["image/svg+xml"]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: (_req, file, callback) => {
    if (BANNED_MIME_TYPES.has(file.mimetype)) {
      callback(badRequest("SVG uploads are not allowed"));
      return;
    }

    if (allowedMimeTypes.has(file.mimetype)) {
      callback(null, true);
      return;
    }

    callback(badRequest("Unsupported file type"));
  },
});

router.post(
  "/upload",
  authenticate,
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw badRequest("No file provided");
    }

    // Trust the declared mimetype only to pass multer's filter; verify the
    // actual bytes before anything is stored.
    const detectedMimeType = detectMimeType(req.file.buffer);

    if (!detectedMimeType) {
      throw badRequest("File contents do not match a supported file type");
    }

    if (detectedMimeType !== req.file.mimetype) {
      throw badRequest("File contents do not match the declared file type");
    }

    const uploaded = await insertMedia({
      mimeType: detectedMimeType,
      fileData: req.file.buffer,
      uploadedBy: req.user?.sub ?? null,
    });

    res.status(201).json({
      data: {
        mediaId: uploaded.mediaId,
        url: `/api/media/${uploaded.mediaId}`,
        mimeType: uploaded.mimeType,
      },
      message: "OK",
    });
  }),
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const mediaId = Number(req.params.id);

    if (!Number.isInteger(mediaId) || mediaId <= 0) {
      throw badRequest("Media id must be a positive integer");
    }

    const media = await getMediaById(mediaId);

    if (!media) {
      throw notFound("Media not found");
    }

    const total = media.fileData.length;
    const etag = `W/"media-${mediaId}-${total}"`;

    res.set("Content-Type", media.mimeType);
    res.set("X-Content-Type-Options", "nosniff");
    res.set("Cache-Control", "public, max-age=86400");
    res.set("Accept-Ranges", "bytes");
    res.set("ETag", etag);

    if (req.headers["if-none-match"] === etag) {
      res.status(304).end();
      return;
    }

    const rangeHeader = req.headers.range;
    if (!rangeHeader) {
      res.set("Content-Length", String(total));
      res.send(media.fileData);
      return;
    }

    // Parse "bytes=START-END" (either START or END optional)
    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
    if (!match) {
      res.status(416).set("Content-Range", `bytes */${total}`).end();
      return;
    }

    const startStr = match[1];
    const endStr = match[2];
    let start: number;
    let end: number;

    if (startStr === "" && endStr !== "") {
      // Suffix range: bytes=-500 (last 500 bytes)
      const suffixLength = Number(endStr);
      start = Math.max(0, total - suffixLength);
      end = total - 1;
    } else {
      start = startStr === "" ? 0 : Number(startStr);
      end = endStr === "" ? total - 1 : Number(endStr);
    }

    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start > end ||
      start < 0 ||
      start >= total
    ) {
      res.status(416).set("Content-Range", `bytes */${total}`).end();
      return;
    }

    end = Math.min(end, total - 1);
    const chunk = media.fileData.subarray(start, end + 1);
    res.status(206);
    res.set("Content-Range", `bytes ${start}-${end}/${total}`);
    res.set("Content-Length", String(chunk.length));
    res.send(chunk);
  }),
);

export default router;
