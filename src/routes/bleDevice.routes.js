import { Router } from 'express';
import { authenticateUser } from '../middleware/auth.middleware.js';
import {
  getBLEDevices,
  getLiveTrack,
  getLiveTrackAll,
  getDeviceHistoryHierarchy,
  getParentBLEDevice,
  assignBLEDevice,
  deleteBLEDevice,
  syncFromGeoTagCloud,
} from '../controllers/bleDevice.controller.js';

const router = Router();

// ==============================================================
// 1. PUBLIC / DIRECT GET ROUTE (Browser & direct frontend testing)
// Directly returns all devices ingested via Webhook & synced from Cloud
// ==============================================================
router.get('/ble-devices/sync', syncFromGeoTagCloud);

// ==============================================================
// 2. PROTECTED ROUTES (Require Credence JWT Token)
// ==============================================================
router.use(authenticateUser);

// Sync via POST (for authenticated admin action)
router.post('/ble-devices/sync', syncFromGeoTagCloud);

// 2. Hierarchy-filtered listing (superAdmin / school / branchGroup / branch / supervisor / parent)
router.get('/ble-devices', getBLEDevices);

// 3. Live Track ALL devices (Multi-marker live map for superAdmin, school, branch, etc.)
router.get('/ble-devices/live-all', getLiveTrackAll);

// 4. Parent endpoint: Get tracking for child's assigned BLE device
router.get('/ble-devices/parent/my-device', getParentBLEDevice);

// 5. Live Track a specific device (by device _id or serial number sn)
router.get('/ble-devices/live/:identifier', getLiveTrack);

// 6. Device Location History (Hierarchy-wise)
router.get('/ble-devices/:identifier/history', getDeviceHistoryHierarchy);

// 7. Assign or update device hierarchy (schoolId, branchId, supervisorId, childId)
router.put('/ble-devices/:id/assign', assignBLEDevice);
router.put('/ble-devices/:id', assignBLEDevice);

// 8. Delete device
router.delete('/ble-devices/:id', deleteBLEDevice);

export default router;
