import { GeotagFence } from '../Models/geotagFence.model.js';
import { GeotagAlert } from '../Models/geotagAlert.model.js';
import { sendPushNotification } from './notification.service.js';
import Parent from '../Models/parents.js';

/**
 * Calculate Great-Circle distance between two coordinates in meters (Haversine formula)
 */
export function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Check if a point (lat, lng) is inside a polygon using ray casting algorithm
 */
export function isPointInPolygon(point, polygon) {
  if (!polygon || polygon.length < 3) return false;
  const { lat, lng } = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng, yi = polygon[i].lat;
    const xj = polygon[j].lng, yj = polygon[j].lat;
    const intersect =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Check if current time falls within fence's active schedule window (HH:mm:ss)
 */
function isWithinSchedule(fence, now = new Date()) {
  if (fence.scheduleType !== 'custom') return true;
  if (!fence.scheduleStartTime || !fence.scheduleEndTime) return true;

  const pad = (n) => String(n).padStart(2, '0');
  const currentTimeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  return currentTimeStr >= fence.scheduleStartTime && currentTimeStr <= fence.scheduleEndTime;
}

/**
 * Evaluate all relevant geofences for an incoming device telemetry coordinate
 * Called automatically by webhook whenever a new location is reported.
 *
 * @param {Object} device - Mongoose BLEDevice document (with populated childId)
 * @param {Object} location - { lat, lng, address, locationTime }
 */
export async function evaluateGeofencesForDevice(device, location) {
  if (!device || !location || location.lat === null || location.lng === null) {
    return;
  }

  const { lat, lng, address } = location;

  // 1. Find all active fences that apply to this device
  const fenceFilter = {
    status: 'active',
    isActive: true,
    $or: [
      { devices: device._id },
    ],
  };

  if (device.childId) {
    const childId = device.childId._id || device.childId;
    fenceFilter.$or.push({ childId });
  }

  if (device.schoolId) {
    const schoolId = device.schoolId._id || device.schoolId;
    const branchId = device.branchId?._id || device.branchId;

    const schoolBranchQuery = { schoolId };
    if (branchId) {
      schoolBranchQuery.$or = [{ branchId }, { branchId: null }];
    }
    // Also include school-wide fences that aren't device-specific
    fenceFilter.$or.push({
      ...schoolBranchQuery,
      devices: { $size: 0 },
    });
  }

  const fences = await GeotagFence.find(fenceFilter);
  if (!fences || fences.length === 0) {
    return;
  }

  const now = new Date();
  device.fenceStates = device.fenceStates || [];

  for (const fence of fences) {
    if (!isWithinSchedule(fence, now)) {
      continue;
    }

    // Determine if device is inside the fence
    let isInside = false;
    let distance = null;

    if (fence.fenceType === 'circle') {
      if (fence.center?.lat != null && fence.center?.lng != null) {
        distance = calculateDistanceMeters(lat, lng, fence.center.lat, fence.center.lng);
        // Include buffer tolerance
        const effectiveRadius = (fence.radius || 200) + (fence.boundaryToleranceMeter || 0);
        isInside = distance <= effectiveRadius;
      }
    } else if (fence.fenceType === 'polygon') {
      isInside = isPointInPolygon({ lat, lng }, fence.coordinates);
    }

    const currentStatus = isInside ? 'inside' : 'outside';

    // Look up previous state for this fence
    let stateEntry = device.fenceStates.find(
      (s) => s.fenceId && s.fenceId.toString() === fence._id.toString()
    );

    if (!stateEntry) {
      stateEntry = {
        fenceId: fence._id,
        status: 'unknown',
        lastEvaluatedAt: now,
        lastNotifiedAt: null,
        lastEventType: null,
      };
      device.fenceStates.push(stateEntry);
    }

    const previousStatus = stateEntry.status;
    stateEntry.lastEvaluatedAt = now;
    stateEntry.status = currentStatus;

    // Detect state transition (ignore first initialization if unknown unless specifically configured)
    let eventType = null;
    if (previousStatus === 'outside' && currentStatus === 'inside') {
      eventType = 'ENTER';
    } else if (previousStatus === 'inside' && currentStatus === 'outside') {
      eventType = 'EXIT';
    }

    if (!eventType) {
      continue;
    }

    // Check if fence triggers on this event rule
    const rule = fence.alarmRules || 'both';
    const ruleMatches =
      rule === 'both' ||
      (rule === 'enter' && eventType === 'ENTER') ||
      (rule === 'exit' && eventType === 'EXIT');

    if (!ruleMatches) {
      continue;
    }

    // Check cooldown period (to prevent fluttering on border)
    const cooldownMs = (fence.cooldownMinutes || 2) * 60 * 1000;
    if (stateEntry.lastNotifiedAt && now - new Date(stateEntry.lastNotifiedAt).getTime() < cooldownMs) {
      // console.log(`⏳ [Geofence] Suppressed ${eventType} for ${fence.name} (within cooldown)`);
      continue;
    }

    // Event Confirmed! Record and Notify
    stateEntry.lastNotifiedAt = now;
    stateEntry.lastEventType = eventType;

    const childName = device.childId?.childName || 'Child';
    const actionText = eventType === 'ENTER' ? 'entered' : 'left';
    const timeFormatted = now.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Kolkata',
    });

    const title = eventType === 'ENTER' ? `🟢 Arrived: ${childName}` : `🔴 Departed: ${childName}`;
    const body = `${childName} has ${actionText} geofence "${fence.name}" at ${timeFormatted}.`;

    console.log(`🚨 [Geofence Event] ${title} - ${body} (Device: ${device.sn})`);

    // 2. Find Parents to Notify
    const notifiedParentsList = [];
    if (device.childId) {
      const childObj = device.childId;
      const parentId = childObj.parentId || (childObj.toObject && childObj.toObject().parentId);

      let parentsToNotify = [];
      if (parentId) {
        parentsToNotify = await Parent.find({ _id: parentId, Active: true, Notification: true });
      }

      for (const parent of parentsToNotify) {
        if (parent.fcmToken && parent.fcmToken.length > 0) {
          const pushResult = await sendPushNotification({
            tokens: parent.fcmToken,
            title,
            body,
            type: 'GEOFENCE_ALERT',
            data: {
              eventType,
              fenceId: String(fence._id),
              fenceName: fence.name,
              sn: device.sn,
              childId: String(childObj._id),
              childName,
              lat: String(lat),
              lng: String(lng),
              time: now.toISOString(),
            },
          });

          notifiedParentsList.push({
            parentId: parent._id,
            parentName: parent.parentName,
            tokensSentCount: pushResult.successCount || 0,
          });
        }
      }
    }

    // 3. Log alert into GeotagAlert collection
    try {
      await GeotagAlert.create({
        fenceId: fence._id,
        fenceName: fence.name,
        deviceId: device._id,
        sn: device.sn,
        childId: device.childId?._id || device.childId || null,
        childName,
        schoolId: device.schoolId?._id || device.schoolId || null,
        branchId: device.branchId?._id || device.branchId || null,
        eventType,
        location: { lat, lng, address: address || '' },
        distanceFromCenter: distance ? Math.round(distance) : null,
        notifiedParents: notifiedParentsList,
      });
    } catch (logErr) {
      console.error('⚠️ [Geofence Alert Log Error]:', logErr.message);
    }
  }

  // Persist updated fenceStates on the device document
  await device.save();
}

