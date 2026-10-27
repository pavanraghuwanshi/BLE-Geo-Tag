import { config } from '../config/geotag.config.js';
import { decryptResponseData } from '../utils/geotag.crypto.js';
import { BLEDevice } from '../Models/bleDevice.model.js';

/**
 * Handle incoming real-time Webhook from GeoTag Cloud
 * Triggered automatically by GeoTag whenever any device has a location/battery update.
 *
 * GeoTag pushes:
 * {
 *   "msg": "success",
 *   "code": 200,
 *   "data": "<encryptedData>,<encryptedAesKey>",
 *   "sign": "<sign>",
 *   "timestamp": 1773059201220
 * }
 */
export const handleGeoTagWebhook = async (req, res) => {
  try {
    const { data } = req.body || {};

    if (!data) {
      return res.status(400).json({ code: 400, msg: 'Missing data payload' });
    }

    // 1. Decrypt incoming data using Merchant Private Key
    const payload = decryptResponseData(data, config.merchantPrivateKey);

    if (!payload || !payload.sn) {
      return res.status(400).json({ code: 400, msg: 'Invalid or missing sn in webhook payload' });
    }

    console.log(`📡 [GeoTag Webhook] Received update for ${payload.sn}: lat=${payload.lat}, lng=${payload.lng}, battery=${payload.battery}%`);

    // 2. Prepare dynamic update fields (only updating telemetry, preserving custom category and assignments)
    const updateSet = {
      lastUpdate: new Date(),
    };

    const lastLocation = {
      lat: payload.lat !== undefined ? Number(payload.lat) : null,
      lng: payload.lng !== undefined ? Number(payload.lng) : null,
      address: payload.address || '',
      reportedTime: payload.reportedTime ? new Date(Number(payload.reportedTime)) : new Date(),
      locationTime: payload.locationTime ? new Date(Number(payload.locationTime)) : new Date(),
      accuracy: payload.accuracy !== undefined ? Number(payload.accuracy) : null,
      confidence: payload.confidence !== undefined ? Number(payload.confidence) : null,
    };

    updateSet.lastLocation = lastLocation;

    if (payload.battery !== undefined && payload.battery !== null) {
      updateSet.battery = Number(payload.battery);
    }

    if (payload.batteryStatus !== undefined && payload.batteryStatus !== null) {
      updateSet.batteryStatus = String(payload.batteryStatus);
    }

    // 3. Atomically update MongoDB document
    await BLEDevice.findOneAndUpdate(
      { sn: payload.sn },
      {
        $set: updateSet,
        $setOnInsert: {
          name: payload.sn,
          status: 'active',
          isActive: true,
          category: 'GeoTag', // default category ONLY if brand new device inserted
          model: '',
          schoolId: null,
          branchId: null,
          supervisorId: null,
          childId: null,
        },
      },
      { upsert: true, returnDocument: 'after' }
    );

    // 4. Acknowledge GeoTag Cloud
    return res.status(200).json({
      code: 200,
      msg: 'success',
    });
  } catch (err) {
    console.error('[GeoTag Webhook Error]:', err.message);
    return res.status(500).json({
      code: 500,
      msg: `Webhook processing error: ${err.message}`,
    });
  }
};
