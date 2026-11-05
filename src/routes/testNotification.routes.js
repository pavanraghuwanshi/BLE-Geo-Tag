import { Router } from 'express';
import {
  testSendPushNotification,
  getRegisteredParentTokens,
} from '../controllers/testNotification.controller.js';

const router = Router();

// Test Firebase Push Notification endpoints (public, no token required for easy testing)
router.post('/test/notification', testSendPushNotification);
router.post('/notifications/test', testSendPushNotification);
router.post('/test-notification', testSendPushNotification);

// Helper endpoint to check existing FCM tokens for parents in MongoDB
router.get('/test/notification/parents-tokens', getRegisteredParentTokens);
router.get('/notifications/test/parents-tokens', getRegisteredParentTokens);

export default router;

