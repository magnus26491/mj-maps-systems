/**
 * POST /api/v1/stops/:stopId/pod
 * ---
 * Allows a driver to upload a proof-of-delivery (POD) photo for a stop.
 *
 * Auth: Bearer JWT (authenticateDriver middleware)
 * Body: multipart/form-data with a single file field "photo" (JPEG or PNG, max 5 MB)
 * Returns: 201 { podUrl }
 *
 * Hard rules:
 * - multer must use memoryStorage() — never write files to disk
 * - File size limit: 5 MB enforced at the multer level
 * - Only image/jpeg and image/png accepted — return 400 for any other MIME type
 * - uploadPod() must be called after driver/stop ownership is validated
 */
import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { authenticateDriver } from '../middleware/authenticate';
import { pool } from '../../services/db';
import { uploadPod, s3Configured } from '../../services/storage';

export const podRouter = Router({ mergeParams: true });

// Multer with memoryStorage — 5 MB limit, image/jpeg or image/png only
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/png') {
      cb(null, true);
    } else {
      cb(new Error('Only image/jpeg and image/png files are accepted.'));
    }
  },
});

// POST /api/v1/stops/:stopId/pod
podRouter.post(
  '/',
  authenticateDriver,
  upload.single('photo'),
  async (req: Request, res: Response) => {
    // Check if file was provided
    if (!req.file) {
      res.status(400).json({ success: false, error: 'No file provided. Field name must be "photo".' });
      return;
    }

    // Check S3/R2 is configured
    if (!s3Configured) {
      res.status(500).json({ success: false, error: 'Storage not configured. Contact support.' });
      return;
    }

    const stopId = req.params.stopId;
    const driverId = req.driver?.id;
    if (!driverId) {
      res.status(401).json({ success: false, error: 'Not authenticated.' });
      return;
    }

    try {
      // Validate stop belongs to the authenticated driver's active route
      const stopResult = await pool.query<{ driver_id: string }>(
        `SELECT driver_id FROM stops WHERE id = $1 LIMIT 1`,
        [stopId],
      );
      if (!stopResult.rows.length) {
        res.status(404).json({ success: false, error: 'Stop not found.' });
        return;
      }
      if (stopResult.rows[0].driver_id !== driverId) {
        res.status(403).json({ success: false, error: 'Not authorized to upload POD for this stop.' });
        return;
      }

      // Upload to R2/S3
      const podUrl = await uploadPod(
        driverId,
        stopId,
        req.file.buffer,
        req.file.mimetype,
      );

      // Update stop record with POD metadata
      await pool.query(
        `UPDATE stops
           SET pod_url = $1, pod_type = 'photo', pod_captured_at = NOW()
           WHERE id = $2`,
        [podUrl, stopId],
      );

      res.status(201).json({ success: true, podUrl });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[pod] Upload failed:', msg);
      res.status(500).json({ success: false, error: 'Failed to upload POD photo.' });
    }
  },
);

// Global multer error handler — catches file too large and invalid mime types
podRouter.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (err.message?.includes('file too large') || err.message?.includes('Only image')) {
    res.status(400).json({ success: false, error: err.message });
    return;
  }
  _next(err);
});