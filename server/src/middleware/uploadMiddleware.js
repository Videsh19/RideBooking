import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const UPLOADS_DIR = path.resolve(__dirname, '../../uploads/driver_documents');

// Ensure upload directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Multer memory storage so we can validate magic bytes before writing to disk
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB max per document
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      const err = new Error('Invalid file type. Only JPEG, PNG, and PDF files are accepted.');
      err.statusCode = 400;
      err.code = 'INVALID_FILE_TYPE';
      cb(err);
    }
  },
});

/**
 * Verify binary magic bytes to guarantee file matches claimed type
 */
export function verifyMagicBytes(buffer, mimetype) {
  if (!buffer || buffer.length < 4) return false;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpg';
  }

  // PNG: 89 50 4E 47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return 'png';
  }

  // PDF: 25 50 44 46 (%PDF)
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return 'pdf';
  }

  return false;
}

/**
 * Process and securely store uploaded driver documents (REQ-013, REQ-014)
 */
export const driverDocumentUpload = [
  upload.fields([
    { name: 'licenseDoc', maxCount: 1 },
    { name: 'license_doc', maxCount: 1 },
    { name: 'vehicleDoc', maxCount: 1 },
    { name: 'vehicle_doc', maxCount: 1 },
  ]),
  (req, res, next) => {
    try {
      if (!req.files || Object.keys(req.files).length === 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'NO_FILES_UPLOADED',
            message: 'Please select at least one document to upload (licenseDoc or vehicleDoc).',
          },
        });
      }

      req.savedDocuments = {};

      for (const [fieldName, fileArray] of Object.entries(req.files)) {
        if (!fileArray || fileArray.length === 0) continue;
        const file = fileArray[0];
        const verifiedExt = verifyMagicBytes(file.buffer, file.mimetype);

        if (!verifiedExt) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'INVALID_FILE_SIGNATURE',
              message: `The file uploaded for '${fieldName}' does not match a valid JPEG, PNG, or PDF format.`,
            },
          });
        }

        const normalizedField = (fieldName === 'license_doc' || fieldName === 'licenseDoc')
          ? 'licenseDoc'
          : (fieldName === 'vehicle_doc' || fieldName === 'vehicleDoc')
            ? 'vehicleDoc'
            : fieldName;

        // Safe filename with UUID to prevent collisions and path traversal
        const safeFilename = `${normalizedField}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}.${verifiedExt}`;
        const filePath = path.join(UPLOADS_DIR, safeFilename);

        // Prevent path traversal
        if (!filePath.startsWith(UPLOADS_DIR)) {
          return res.status(400).json({
            success: false,
            error: { code: 'SECURITY_ERROR', message: 'Path traversal detected.' },
          });
        }

        fs.writeFileSync(filePath, file.buffer);

        req.savedDocuments[normalizedField] = {
          filename: safeFilename,
          originalName: file.originalname,
          sizeBytes: file.size,
          extension: verifiedExt,
          mimeType: file.mimetype,
        };
      }

      next();
    } catch (err) {
      next(err);
    }
  },
];
