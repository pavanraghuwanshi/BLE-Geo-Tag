import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import dotenv from 'dotenv';

dotenv.config();

let firebaseMessaging = null;

try {
  if (!process.env.FIREBASE_CONFIG) {
    console.warn('⚠️  [Firebase Config] FIREBASE_CONFIG not found in environment variables. Push notifications disabled.');
  } else {
    let serviceAccount;
    try {
      serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);
    } catch (parseErr) {
      console.error('❌ [Firebase Config] Failed to parse FIREBASE_CONFIG JSON:', parseErr.message);
    }

    if (serviceAccount) {
      if (serviceAccount.private_key) {
        serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
      }

      const apps = getApps();
      const app = apps.length === 0
        ? initializeApp({ credential: cert(serviceAccount) })
        : apps[0];

      firebaseMessaging = getMessaging(app);
      console.log(`✅ [Firebase Admin] Initialized successfully for project "${serviceAccount.project_id}"`);
    }
  }
} catch (error) {
  console.error('❌ [Firebase Admin] Initialization error:', error.message);
}

export { firebaseMessaging };
export default firebaseMessaging;
