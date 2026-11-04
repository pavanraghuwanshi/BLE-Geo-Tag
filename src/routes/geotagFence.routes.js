import { Router } from 'express';
import { authenticateUser } from '../middleware/auth.middleware.js';
import {
  createGeofence,
  getGeofences,
  getGeofenceById,
  updateGeofence,
  deleteGeofence,
  getGeofenceAlerts,
} from '../controllers/geotagFence.controller.js';

const router = Router();

// Protect all geofence routes with Credence JWT authentication
router.use(authenticateUser);

// 1. Alerts endpoint (must be declared before :id route)
router.get('/geofences/alerts', getGeofenceAlerts);

// 2. Geofence CRUD endpoints
router.post('/geofences', createGeofence);
router.get('/geofences', getGeofences);
router.get('/geofences/:id', getGeofenceById);
router.put('/geofences/:id', updateGeofence);
router.delete('/geofences/:id', deleteGeofence);

export default router;

