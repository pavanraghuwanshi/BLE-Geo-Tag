import { geotagService } from './geotag.service.js';
import { BLEDevice } from '../Models/bleDevice.model.js';

let syncIntervalTimer = null;
let isSyncRunning = false;

/**
 * Sync telemetry values (battery, batteryStatus, status, model, lastLocation)
 * from GeoTag Cloud without overwriting any custom category, custom name, or hierarchy assignments.
 */
export async function syncTelemetryFromCloud() {
  if (isSyncRunning) {
    return; // Avoid concurrent overlapping runs
  }
  isSyncRunning = true;

  try {
    // 1. Fetch registered devices from GeoTag cloud
    const cloudResponse = await geotagService.getDeviceList({ page: 1, pageSize: 100, status: 1 });
    const cloudDevices = cloudResponse?.list || [];

    if (cloudDevices.length === 0) {
      isSyncRunning = false;
      return;
    }

    // 2. Process devices in parallel
    await Promise.allSettled(
      cloudDevices.map(async (d) => {
        try {
          let lastLoc = null;
          let battery = null;
          let batteryStatus = "";

          // Fetch latest history point for location and battery
          try {
            const hist = await geotagService.getDeviceHistory(d.sn);
            if (hist?.list && hist.list.length > 0) {
              const latest = hist.list[0];
              lastLoc = {
                lat: latest.lat,
                lng: latest.lng,
                address: latest.address,
                reportedTime: latest.reportedTime ? new Date(latest.reportedTime) : null,
                locationTime: latest.locationTime ? new Date(latest.locationTime) : null,
                accuracy: latest.accuracy,
                confidence: latest.confidence,
              };
              if (latest.battery !== undefined) battery = latest.battery;
              if (latest.batteryStatus !== undefined) batteryStatus = latest.batteryStatus;
            }
          } catch (err) {
            // Silently continue if single device history fetch fails
          }

          const cloudStatus = d.status !== undefined
            ? (d.status === 1 || d.status === '1' || d.status === 'active' ? 'active' : String(d.status))
            : '';

          // Only update telemetry fields
          const updateSet = {
            mac: d.mac || "",
            uuid: d.uuid || "",
            lastUpdate: new Date(),
          };

          if (lastLoc) updateSet.lastLocation = lastLoc;
          if (battery !== null) updateSet.battery = battery;
          if (batteryStatus) updateSet.batteryStatus = batteryStatus;
          if (cloudStatus) updateSet.status = cloudStatus;
          if (d.model) updateSet.model = d.model;

          await BLEDevice.findOneAndUpdate(
            { sn: d.sn },
            {
              $set: updateSet,
              $setOnInsert: {
                name: d.sn,
                status: cloudStatus || "active",
                isActive: true,
                category: "GeoTag", // default category only on brand new insert
                model: d.model || "",
                battery,
                batteryStatus,
                schoolId: null,
                branchId: null,
                supervisorId: null,
                childId: null,
              },
            },
            { upsert: true, returnDocument: 'after' }
          );
        } catch (err) {
          // Ignore individual device error so the rest proceed
        }
      })
    );
  } catch (err) {
    console.warn(`[TelemetrySync] Cloud sync notice: ${err.message}`);
  } finally {
    isSyncRunning = false;
  }
}

/**
 * Start background telemetry sync worker
 * @param {number} intervalSeconds Default 60 seconds
 */
export function startTelemetrySyncWorker(intervalSeconds = 60) {
  if (syncIntervalTimer) {
    clearInterval(syncIntervalTimer);
  }

  const intervalMs = Math.max(15, intervalSeconds) * 1000;
  console.log(`⏱️  Telemetry Sync Worker started (Every ${intervalSeconds}s)`);

  // Initial immediate run in background
  syncTelemetryFromCloud().catch(() => {});

  // Periodic recurring timer
  syncIntervalTimer = setInterval(() => {
    syncTelemetryFromCloud().catch(() => {});
  }, intervalMs);

  return syncIntervalTimer;
}

/**
 * Stop background telemetry sync worker
 */
export function stopTelemetrySyncWorker() {
  if (syncIntervalTimer) {
    clearInterval(syncIntervalTimer);
    syncIntervalTimer = null;
  }
}
