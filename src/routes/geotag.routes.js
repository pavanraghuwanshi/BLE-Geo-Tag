import { Router } from 'express';
import { authenticateUser } from '../middleware/auth.middleware.js';
import {
  getDevices,
  getDeviceDetail,
  getDeviceHistory,
} from '../controllers/geotag.controller.js';

const router = Router();

// Apply authentication middleware to all raw cloud endpoints
router.use(authenticateUser);

// GET /api/devices - List devices directly from GeoTag Cloud
router.get('/devices', getDevices);

// GET /api/devices/:uuid - Device details directly from GeoTag Cloud
router.get('/devices/:uuid', getDeviceDetail);

// GET /api/devices/:sn/history - Location history directly from GeoTag Cloud
router.get('/devices/:sn/history', getDeviceHistory);

export default router;
