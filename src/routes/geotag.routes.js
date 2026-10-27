import { Router } from 'express';
import { authenticateUser } from '../middleware/auth.middleware.js';
import {
  getDevices,
  getDeviceDetail,
  getDeviceHistory,
} from '../controllers/geotag.controller.js';
import { handleGeoTagWebhook } from '../controllers/webhook.controller.js';

const router = Router();

// ==============================================================
// 1. PUBLIC WEBHOOK RECEIVER (Called by GeoTag Cloud)
// Authenticated via GeoTag asymmetric RSA key decryption
// ==============================================================
router.post('/geotag/webhook', handleGeoTagWebhook);

// ==============================================================
// 2. PROTECTED INTERNAL ROUTES (Require Credence JWT)
// ==============================================================
router.use(authenticateUser);

// GET /api/devices - List devices directly from GeoTag Cloud
router.get('/devices', getDevices);

// GET /api/devices/:uuid - Device details directly from GeoTag Cloud
router.get('/devices/:uuid', getDeviceDetail);

// GET /api/devices/:sn/history - Location history directly from GeoTag Cloud
router.get('/devices/:sn/history', getDeviceHistory);

export default router;
