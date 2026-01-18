import { Router } from 'express';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth.js';
import { pushNotificationService } from '../services/pushNotificationService.js';
import { z } from 'zod';
import { validateRequest } from '../middleware/validation.js';
import { createError } from '../middleware/errorHandler.js';

const router = Router();

// Validation schema for device registration
const registerDeviceSchema = z.object({
  expoPushToken: z.string().min(1, 'Push token is required'),
  deviceId: z.string().min(1, 'Device ID is required'),
  platform: z.enum(['ios', 'android', 'web']),
  deviceName: z.string().optional(),
  appVersion: z.string().optional(),
});

const deactivateDeviceSchema = z.object({
  deviceId: z.string().min(1, 'Device ID is required'),
});

// POST /api/push/devices - Register or update device push token
router.post(
  '/devices',
  validateRequest(registerDeviceSchema, 'body'),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const userId = requireAuth(req);
      const validatedBody = req.body as z.infer<typeof registerDeviceSchema>;

      await pushNotificationService.registerDevice(
        userId,
        validatedBody.expoPushToken,
        validatedBody.deviceId,
        validatedBody.platform,
        validatedBody.deviceName,
        validatedBody.appVersion
      );

      res.json({
        success: true,
        message: 'Device registered successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/push/devices - Deactivate a device
router.delete(
  '/devices',
  validateRequest(deactivateDeviceSchema, 'body'),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const userId = requireAuth(req);
      const validatedBody = req.body as z.infer<typeof deactivateDeviceSchema>;

      // Verify the device belongs to this user
      const { UserDeviceModel } = await import('../models/mongoose/index.js');
      const device = await UserDeviceModel.findOne({ deviceId: validatedBody.deviceId, userId });

      if (!device) {
        throw createError('Device not found', 404, 'DEVICE_NOT_FOUND');
      }

      await pushNotificationService.deactivateDevice(validatedBody.deviceId);

      res.json({
        success: true,
        message: 'Device deactivated successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/push/devices - Get user's registered devices
router.get('/devices', async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = requireAuth(req);
    const { UserDeviceModel } = await import('../models/mongoose/index.js');

    const devices = await UserDeviceModel.find({
      userId,
      isActive: true,
    }).select('-expoPushToken -__v').lean();

    res.json({
      success: true,
      data: devices,
    });
  } catch (error) {
    next(error);
  }
});

const testNotificationSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  body: z.string().min(1, 'Body is required'),
});

// POST /api/push/test - Send a test notification
router.post(
  '/test',
  validateRequest(testNotificationSchema, 'body'),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const userId = requireAuth(req);
      const validatedBody = req.body as z.infer<typeof testNotificationSchema>;

      const result = await pushNotificationService.sendToUser(userId, {
        title: validatedBody.title,
        body: validatedBody.body,
        data: { screen: 'home' },
        sound: 'default',
        priority: 'high',
        channelId: 'event-reminders',
      });

      res.json({
        success: result.sent > 0,
        data: {
          sent: result.sent,
          failed: result.failed,
          tokensToRemove: result.tokensToRemove,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
