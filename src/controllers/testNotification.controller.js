import mongoose from 'mongoose';
import Parent from '../Models/parents.js';
import Child from '../Models/child.js';
import { BLEDevice } from '../Models/bleDevice.model.js';
import { sendPushNotification } from '../services/notification.service.js';

const ObjectId = mongoose.Types.ObjectId;

/**
 * 1. Test / Send Firebase Push Notification
 * POST /api/test/notification
 * POST /api/notifications/test
 *
 * Can target:
 *  - Direct tokens: { "fcmToken": "..." } or { "tokens": ["..."] }
 *  - Parent ID: { "parentId": "..." }
 *  - Mobile Number: { "mobileNo": "..." }
 *  - Child ID: { "childId": "..." }
 *  - Device SN: { "sn": "..." }
 *  - Empty: auto-picks the first available parent with an FCM token from DB
 *
 * Uses the EXACT same payload structure as the live geofence engine.
 */
export async function testSendPushNotification(req, res) {
  try {
    const body = req.body || {};
    let targetTokens = [];
    let targetSource = 'Unknown';

    // 1. Direct tokens provided
    if (body.fcmToken && typeof body.fcmToken === 'string' && body.fcmToken.trim().length > 0) {
      targetTokens.push(body.fcmToken.trim());
      targetSource = 'Direct fcmToken in request body';
    } else if (Array.isArray(body.tokens) && body.tokens.length > 0) {
      targetTokens.push(...body.tokens.map((t) => String(t).trim()).filter(Boolean));
      targetSource = `Direct tokens array (${targetTokens.length} tokens)`;
    }

    // 2. Resolve tokens by Parent ID
    if (targetTokens.length === 0 && body.parentId && ObjectId.isValid(body.parentId)) {
      const parent = await Parent.findById(body.parentId).lean();
      if (parent) {
        const tokens = (parent.fcmToken || []).filter(Boolean);
        targetTokens.push(...tokens);
        targetSource = `Parent Document: "${parent.parentName}" (ID: ${parent._id}, Mobile: ${parent.mobileNo || 'N/A'})`;
      }
    }

    // 3. Resolve tokens by Mobile Number
    if (targetTokens.length === 0 && body.mobileNo) {
      const parent = await Parent.findOne({ mobileNo: String(body.mobileNo).trim() }).lean();
      if (parent) {
        const tokens = (parent.fcmToken || []).filter(Boolean);
        targetTokens.push(...tokens);
        targetSource = `Parent Document by Mobile: "${parent.parentName}" (Mobile: ${parent.mobileNo})`;
      }
    }

    // 4. Resolve tokens by Child ID
    if (targetTokens.length === 0 && body.childId && ObjectId.isValid(body.childId)) {
      const child = await Child.findById(body.childId).lean();
      if (child && child.parentId) {
        const parent = await Parent.findById(child.parentId).lean();
        if (parent) {
          const tokens = (parent.fcmToken || []).filter(Boolean);
          targetTokens.push(...tokens);
          targetSource = `Child "${child.childName}" -> Parent: "${parent.parentName}"`;
        }
      }
    }

    // 5. Resolve tokens by Device SN
    if (targetTokens.length === 0 && body.sn) {
      const device = await BLEDevice.findOne({ sn: String(body.sn).trim() }).populate('childId');
      if (device && device.childId && device.childId.parentId) {
        const parent = await Parent.findById(device.childId.parentId).lean();
        if (parent) {
          const tokens = (parent.fcmToken || []).filter(Boolean);
          targetTokens.push(...tokens);
          targetSource = `Device "${device.sn}" -> Child: "${device.childId.childName}" -> Parent: "${parent.parentName}"`;
        }
      }
    }

    // 6. Fallback: Auto-pick first active parent with an FCM token in database
    if (targetTokens.length === 0) {
      const parentWithToken = await Parent.findOne({
        Active: true,
        fcmToken: { $exists: true, $ne: [] },
      }).lean();

      if (parentWithToken && parentWithToken.fcmToken?.length > 0) {
        const tokens = parentWithToken.fcmToken.filter(Boolean);
        targetTokens.push(...tokens);
        targetSource = `Auto-selected Parent with active token: "${parentWithToken.parentName}" (Mobile: ${parentWithToken.mobileNo || 'N/A'})`;
      }
    }

    // If still no tokens found, guide the user with sample payload
    if (targetTokens.length === 0) {
      const parentsSample = await Parent.find({ Active: true })
        .select('parentName mobileNo fcmToken')
        .limit(5)
        .lean();

      return res.status(400).json({
        success: false,
        message: 'No FCM tokens found to deliver notification. Please provide "fcmToken", "parentId", or "mobileNo".',
        instructions: 'Pass your device FCM token directly in the request body as "fcmToken": "<your_fcm_token>"',
        samplePayload: {
          fcmToken: 'YOUR_DEVICE_FCM_REGISTRATION_TOKEN',
          eventType: 'ENTER',
          fenceName: 'Home Perimeter',
          childName: 'test student',
          channelId: 'geofence_alerts',
        },
        databaseParentsPreview: parentsSample.map((p) => ({
          _id: p._id,
          parentName: p.parentName,
          mobileNo: p.mobileNo,
          hasToken: !!(p.fcmToken && p.fcmToken.length > 0),
          tokenCount: p.fcmToken?.length || 0,
        })),
      });
    }

    // Ensure tokens are unique non-empty strings
    targetTokens = Array.from(new Set(targetTokens.filter((t) => typeof t === 'string' && t.trim().length > 0)));

    // Prepare exact same payload that live geofence engine sends to Firebase
    const now = new Date();
    const eventType = (body.eventType || 'ENTER').toUpperCase();
    const childName = body.childName || 'test student';
    const fenceName = body.fenceName || 'Home Perimeter';
    const sn = body.sn || 'GeoTag-57559208';
    const lat = body.lat !== undefined ? String(body.lat) : '21.1458';
    const lng = body.lng !== undefined ? String(body.lng) : '79.0882';
    const fenceId = body.fenceId || '6aeb224ee055c0de9a9b8ae0';
    const childId = body.childId || '6aa3a03347dac31b2398f8f4';
    const channelId = body.channelId || 'geofence_alerts';
    const sound = body.sound || 'default';

    const actionText = eventType === 'ENTER' ? 'entered' : 'left';
    const timeFormatted = now.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Kolkata',
    });

    const defaultTitle = eventType === 'ENTER' ? `🟢 Arrived: ${childName}` : `🔴 Departed: ${childName}`;
    const defaultBody = `${childName} has ${actionText} geofence "${fenceName}" at ${timeFormatted}.`;

    const title = body.title || defaultTitle;
    const notificationBody = body.body || defaultBody;

    // Exact data payload sent in live geofence alerts
    const alertData = {
      eventType,
      fenceId: String(fenceId),
      fenceName,
      sn,
      childId: String(childId),
      childName,
      lat: String(lat),
      lng: String(lng),
      time: now.toISOString(),
      ...(body.data || {}),
    };

    console.log(`🧪 [Test Notification] Dispatching to ${targetTokens.length} token(s) via ${targetSource}`);

    // Dispatch to Firebase Cloud Messaging
    const pushResult = await sendPushNotification({
      tokens: targetTokens,
      title,
      body: notificationBody,
      type: body.type || 'GEOFENCE_ALERT',
      data: alertData,
      channelId,
      sound,
    });

    return res.json({
      success: pushResult.success,
      message: pushResult.success ? 'Notification dispatched successfully to Firebase' : 'Failed to dispatch notification',
      target: {
        resolvedFrom: targetSource,
        tokensCount: targetTokens.length,
        tokens: targetTokens.map((t) => (t.length > 24 ? `${t.slice(0, 10)}...${t.slice(-10)}` : t)),
      },
      firebaseResult: {
        successCount: pushResult.successCount || 0,
        failureCount: pushResult.failureCount || 0,
        details: pushResult.responses || [],
        error: pushResult.error || pushResult.reason || null,
      },
      exactPayloadSentToFirebase: {
        tokens: targetTokens.map((t) => (t.length > 24 ? `${t.slice(0, 10)}...${t.slice(-10)}` : t)),
        notification: {
          title,
          body: notificationBody,
        },
        data: {
          ...alertData,
          type: body.type || 'GEOFENCE_ALERT',
        },
        android: {
          priority: 'high',
          notification: {
            sound,
            channelId,
            color: '#3B82F6',
            priority: 'high',
          },
        },
        apns: {
          headers: {
            'apns-priority': '10',
          },
          payload: {
            aps: {
              sound,
              contentAvailable: true,
              category: body.type || 'GEOFENCE_ALERT',
            },
          },
        },
      },
    });
  } catch (err) {
    console.error('❌ [Test Notification Error]:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * 2. Helper Endpoint: View Parents with FCM Tokens in Database
 * GET /api/test/notification/parents-tokens
 */
export async function getRegisteredParentTokens(req, res) {
  try {
    const parents = await Parent.find({ Active: true })
      .select('_id parentName mobileNo email fcmToken Notification')
      .lean();

    const withTokens = parents.filter((p) => p.fcmToken && p.fcmToken.length > 0);
    const withoutTokens = parents.filter((p) => !p.fcmToken || p.fcmToken.length === 0);

    return res.json({
      success: true,
      totalParents: parents.length,
      parentsWithTokensCount: withTokens.length,
      parentsWithoutTokensCount: withoutTokens.length,
      parentsWithTokens: withTokens.map((p) => ({
        _id: p._id,
        parentName: p.parentName,
        mobileNo: p.mobileNo,
        email: p.email,
        notificationEnabled: p.Notification,
        tokenCount: p.fcmToken.length,
        tokens: p.fcmToken,
      })),
      parentsWithoutTokens: withoutTokens.map((p) => ({
        _id: p._id,
        parentName: p.parentName,
        mobileNo: p.mobileNo,
      })),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

