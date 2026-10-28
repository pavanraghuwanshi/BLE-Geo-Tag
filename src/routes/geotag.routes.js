import { Router } from 'express';
import { authenticateUser } from '../middleware/auth.middleware.js';
import { getDevices, getDeviceDetail, getDeviceHistory } from '../controllers/geotag.controller.js';
import { handleGeoTagWebhook } from '../controllers/webhook.controller.js';

const router = Router();

// 1. Public webhook receiver (called by GeoTag Cloud)
router.post('/geotag/webhook', handleGeoTagWebhook);

// 2. Protected routes (require Credence JWT)
router.use(authenticateUser);

// GET /api/devices - List devices from GeoTag Cloud
router.get('/devices', getDevices);

// GET /api/devices/:uuid - Device detail from GeoTag Cloud
router.get('/devices/:uuid', getDeviceDetail);

// GET /api/devices/:deviceId/history - Pure proxy to customer.geotag.top trajectoryPageList
router.get('/devices/:deviceId/history', getDeviceHistory);

export default router;
