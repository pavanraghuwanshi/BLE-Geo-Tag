import { firebaseMessaging } from '../config/firebase.config.js';

/**
 * Send push notifications to mobile app users (parents, supervisors, admins)
 * Supports multiple FCM tokens and high-priority background delivery.
 *
 * @param {Object} options
 * @param {string[]|string} options.tokens - Array of FCM registration tokens or single token
 * @param {string} options.title - Notification title
 * @param {string} options.body - Notification body message
 * @param {Object} [options.data] - Custom key-value pairs (strings)
 * @param {string} [options.type] - Category or event type (e.g. 'GEOFENCE_ALERT', 'BATTERY_ALERT')
 */
export async function sendPushNotification({
  tokens,
  title,
  body,
  data = {},
  type = 'GEOFENCE_ALERT',
}) {
  if (!firebaseMessaging) {
    console.warn('⚠️ [Notification Service] Firebase Messaging is not initialized. Skipping push.');
    return { success: false, reason: 'FIREBASE_NOT_INITIALIZED' };
  }

  // Normalize tokens to non-empty unique string array
  const rawTokens = Array.isArray(tokens) ? tokens : [tokens];
  const targetTokens = Array.from(
    new Set(rawTokens.filter((t) => typeof t === 'string' && t.trim().length > 0))
  );

  if (targetTokens.length === 0) {
    // console.log('ℹ️ [Notification Service] No valid FCM tokens provided, skipping.');
    return { success: false, reason: 'NO_TOKENS' };
  }

  // Ensure all values in data payload are strings (Firebase requirement)
  const stringifiedData = {};
  for (const [key, val] of Object.entries(data)) {
    stringifiedData[key] = typeof val === 'object' ? JSON.stringify(val) : String(val ?? '');
  }
  stringifiedData.type = type;

  const payload = {
    tokens: targetTokens,
    notification: {
      title,
      body,
    },
    data: stringifiedData,
    android: {
      priority: 'high',
      notification: {
        sound: 'default',
        channelId: 'geofence_alerts',
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
          sound: 'default',
          contentAvailable: true, // Wakes iOS app in background
          category: type,
        },
      },
    },
  };

  try {
    const response = await firebaseMessaging.sendEachForMulticast(payload);
    console.log(
      `📲 [Push Notification] Sent "${title}" - Success: ${response.successCount}, Failures: ${response.failureCount}`
    );

    return {
      success: true,
      successCount: response.successCount,
      failureCount: response.failureCount,
      responses: response.responses,
    };
  } catch (error) {
    console.error('❌ [Notification Service Error]:', error.message);
    return { success: false, error: error.message };
  }
}

