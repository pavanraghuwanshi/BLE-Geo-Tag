import mongoose from 'mongoose';
import { GeotagFence } from '../Models/geotagFence.model.js';
import { GeotagAlert } from '../Models/geotagAlert.model.js';
import { sendPushNotification } from './notification.service.js';
import Parent from '../Models/parents.js';

/**
 * Safely extract an exact single 24-character ObjectId string from any input
 * Handles populated Documents, plain Objects with _id, ObjectId instances, or hex strings.
 */
function getExactId(val) {
  if (!val) return null;
  if (val._id) {
    const idVal = val._id;
    return idVal && idVal.toString ? idVal.toString() : String(idVal);
  }
  if (val instanceof mongoose.Types.ObjectId) {
    return val.toString();
  }
  if (typeof val === 'string' && mongoose.Types.ObjectId.isValid(val)) {
    return val.trim();
  }
  if (val.toString && typeof val.toString === 'function') {
    const str = val.toString();
    return mongoose.Types.ObjectId.isValid(str) ? str : null;
  }
  return null;
}

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
 * Called automatically by webhook whenever a new location is reported, or by test API.
 *
 * @param {Object} device - Mongoose BLEDevice document (with populated childId)
 * @param {Object} location - { lat, lng, address, locationTime }
 * @param {Object} options - Optional overrides for testing: { forceEvent, bypassCooldown, bypassSchedule, previousStatusOverride }
 */
export async function evaluateGeofencesForDevice(device, location, options = {}) {
  if (!device || !location || location.lat === null || location.lng === null) {
    return {
      success: false,
      message: 'Invalid device or coordinates provided',
      evaluatedCount: 0,
    };
  }

  const {
    forceEvent = null, // 'ENTER' | 'EXIT'
    bypassCooldown = false,
    bypassSchedule = false,
    previousStatusOverride = null,
  } = options;

  const { lat, lng, address } = location;

  // 1. Find all active fences that apply to this device
  const fenceFilter = {
    status: 'active',
    isActive: true,
    $or: [{ devices: device._id }],
  };

  const devChildId = getExactId(device.childId);
  if (devChildId) {
    fenceFilter.$or.push({ childId: new mongoose.Types.ObjectId(devChildId) });
  }

  const devSchoolId = getExactId(device.schoolId) || getExactId(device.childId?.schoolId);
  const devBranchId = getExactId(device.branchId) || getExactId(device.childId?.branchId);

  if (devSchoolId) {
    const schoolBranchQuery = { schoolId: new mongoose.Types.ObjectId(devSchoolId) };
    if (devBranchId) {
      schoolBranchQuery.$or = [
        { branchId: new mongoose.Types.ObjectId(devBranchId) },
        { branchId: null },
      ];
    }
    // Also include school-wide fences that aren't device-specific
    fenceFilter.$or.push({
      ...schoolBranchQuery,
      devices: { $size: 0 },
    });
  }

  const fences = await GeotagFence.find(fenceFilter);
  if (!fences || fences.length === 0) {
    return {
      success: true,
      evaluatedCount: 0,
      message: 'No active geofences found matching this device, child, or school.',
      fencesEvaluated: [],
      alertsCreated: [],
      notificationsSent: [],
    };
  }

  const now = new Date();
  device.fenceStates = device.fenceStates || [];

  const evaluationResults = [];
  const alertsCreated = [];
  const notificationsSent = [];

  for (const fence of fences) {
    const isScheduleActive = bypassSchedule || isWithinSchedule(fence, now);

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

    const previousStatus = previousStatusOverride || stateEntry.status;
    stateEntry.lastEvaluatedAt = now;
    stateEntry.status = currentStatus;

    // Detect state transition (ignore first initialization if unknown unless forced)
    let eventType = forceEvent ? String(forceEvent).toUpperCase() : null;
    if (!eventType) {
      if (previousStatus === 'outside' && currentStatus === 'inside') {
        eventType = 'ENTER';
      } else if (previousStatus === 'inside' && currentStatus === 'outside') {
        eventType = 'EXIT';
      }
    }

    // Check if fence triggers on this event rule
    const rule = fence.alarmRules || 'both';
    const ruleMatches =
      rule === 'both' ||
      (rule === 'enter' && eventType === 'ENTER') ||
      (rule === 'exit' && eventType === 'EXIT');

    // Check cooldown period (to prevent fluttering on border)
    const cooldownMs = (fence.cooldownMinutes || 2) * 60 * 1000;
    const isWithinCooldown =
      !bypassCooldown &&
      stateEntry.lastNotifiedAt &&
      now - new Date(stateEntry.lastNotifiedAt).getTime() < cooldownMs;

    const fenceReport = {
      fenceId: fence._id,
      fenceName: fence.name,
      fenceType: fence.fenceType,
      isInside,
      distanceMeters: distance ? Math.round(distance) : null,
      radiusMeters: fence.radius || 200,
      boundaryToleranceMeters: fence.boundaryToleranceMeter || 0,
      previousStatus,
      currentStatus,
      transition: eventType,
      alarmRule: rule,
      ruleMatches,
      cooldownMinutes: fence.cooldownMinutes || 2,
      isWithinCooldown,
      isScheduleActive,
      alertTriggered: false,
      reason: '',
    };

    if (!isScheduleActive) {
      fenceReport.reason = 'Outside active schedule window';
      evaluationResults.push(fenceReport);
      continue;
    }

    if (!eventType) {
      fenceReport.reason =
        previousStatus === 'unknown'
          ? `Initial state recorded as "${currentStatus}" (baseline created, no transition yet)`
          : `No transition detected (remains "${currentStatus}")`;
      evaluationResults.push(fenceReport);
      continue;
    }

    if (!ruleMatches) {
      fenceReport.reason = `Alarm rule "${rule}" does not trigger on ${eventType} events`;
      evaluationResults.push(fenceReport);
      continue;
    }

    if (isWithinCooldown) {
      fenceReport.reason = `Suppressed by cooldown period (${fence.cooldownMinutes || 2} min)`;
      evaluationResults.push(fenceReport);
      continue;
    }

    // Event Confirmed! Record and Notify
    stateEntry.lastNotifiedAt = now;
    stateEntry.lastEventType = eventType;
    fenceReport.alertTriggered = true;
    fenceReport.reason = `Event confirmed: ${eventType} detected and alert recorded`;
    evaluationResults.push(fenceReport);

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

          const notificationRecord = {
            parentId: parent._id,
            parentName: parent.parentName,
            tokensSentCount: pushResult.successCount || 0,
            successCount: pushResult.successCount || 0,
            failureCount: pushResult.failureCount || 0,
          };
          notifiedParentsList.push(notificationRecord);
          notificationsSent.push(notificationRecord);
        }
      }
    }

    // 3. Log alert into GeotagAlert collection
    try {
      const exactChildId = getExactId(device.childId) || getExactId(fence.childId);
      const exactSchoolId =
        getExactId(fence.schoolId) ||
        getExactId(device.schoolId) ||
        getExactId(device.childId?.schoolId);
      const exactBranchId =
        getExactId(fence.branchId) ||
        getExactId(device.branchId) ||
        getExactId(device.childId?.branchId);

      const alertDoc = await GeotagAlert.create({
        fenceId: fence._id,
        fenceName: fence.name,
        deviceId: device._id,
        sn: device.sn,
        childId: exactChildId ? new mongoose.Types.ObjectId(exactChildId) : null,
        childName,
        schoolId: exactSchoolId ? new mongoose.Types.ObjectId(exactSchoolId) : null,
        branchId: exactBranchId ? new mongoose.Types.ObjectId(exactBranchId) : null,
        eventType,
        location: { lat, lng, address: address || '' },
        distanceFromCenter: distance ? Math.round(distance) : null,
        notifiedParents: notifiedParentsList,
      });

      alertsCreated.push(alertDoc);
    } catch (logErr) {
      console.error('⚠️ [Geofence Alert Log Error]:', logErr.message);
    }
  }

  // Persist updated fenceStates on the device document
  await device.save();

  return {
    success: true,
    evaluatedCount: fences.length,
    fencesEvaluated: evaluationResults,
    alertsCreated,
    notificationsSent,
  };
}

