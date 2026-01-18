import { Types } from 'mongoose';
import { EXPO_PUSH_API_URL, expoPushConfig, isExpoPushErrorCode } from '../config/expoPushConfig.js';
import { logger } from '../utils/logger.js';
import { UserDeviceModel } from '../models/mongoose/userDevices.js';

export interface PushNotificationPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
  sound?: 'default' | null;
  priority?: 'default' | 'high';
  channelId?: string;
}

export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  sound?: 'default' | null;
  priority?: 'default' | 'high';
  channelId?: string;
  _internal?: {
    metadata?: {
      messageId?: string;
    };
  };
}

export interface ExpoPushResponse {
  data: {
    status: 'ok' | 'error';
    message?: string;
    details?: {
      error?: string;
      fault?: string;
    };
    pushNotificationId?: string;
  }[];
}

export interface PushNotificationResult {
  success: boolean;
  messageId?: string;
  error?: string;
  shouldRemoveToken?: boolean;
}

/**
 * Expo Push Notification Service
 * Handles sending push notifications through Expo's Push API
 */
export class PushNotificationService {
  private accessToken: string | undefined;

  constructor() {
    this.accessToken = expoPushConfig.accessToken;
  }

  /**
   * Check if push notifications are configured
   */
  isConfigured(): boolean {
    return expoPushConfig.isConfigured;
  }

  /**
   * Send a push notification to a single device
   */
  async sendNotification(
    expoPushToken: string,
    payload: PushNotificationPayload
  ): Promise<PushNotificationResult> {
    if (!this.isConfigured()) {
      return { success: false, error: 'Push notifications not configured' };
    }

    if (!expoPushToken) {
      return { success: false, error: 'Invalid push token' };
    }

    try {
      const message: ExpoPushMessage = {
        to: expoPushToken,
        title: payload.title,
        body: payload.body,
        data: payload.data,
        sound: payload.sound ?? 'default',
        priority: payload.priority ?? 'high',
        channelId: payload.channelId,
      };

      const response = await this.sendToExpo([message]);

      const result = response.data[0];
      
      if (!result) {
        return { success: false, error: 'No result from Expo API' };
      }

      if (result.status === 'ok' && result.pushNotificationId) {
        logger.info(`Push notification sent successfully: ${result.pushNotificationId}`);
        return { success: true, messageId: result.pushNotificationId };
      }

      const error = result.details?.error ?? result.message ?? 'Unknown error';

      if (isExpoPushErrorCode(error)) {
        const shouldRemove = error === 'DeviceNotRegistered' || error === 'InvalidCredentials';
        logger.warn(`Push notification failed: ${error}`, { shouldRemoveToken: shouldRemove });
        return { success: false, error, shouldRemoveToken: shouldRemove };
      }

      logger.error(`Push notification failed: ${error}`);
      return { success: false, error };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Push notification error: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Send push notifications to multiple devices
   */
  async sendNotifications(
    expoPushTokens: string[],
    payload: PushNotificationPayload
  ): Promise<PushNotificationResult[]> {
    if (!this.isConfigured()) {
      return expoPushTokens.map(() => ({ success: false, error: 'Push notifications not configured' }));
    }

    const messages: ExpoPushMessage[] = expoPushTokens.map(token => ({
      to: token,
      title: payload.title,
      body: payload.body,
      data: payload.data,
      sound: payload.sound ?? 'default',
      priority: payload.priority ?? 'high',
      channelId: payload.channelId,
    }));

    try {
      const response = await this.sendToExpo(messages);

      return response.data.map((result) => {
        if (result.status === 'ok' && result.pushNotificationId) {
          return { success: true, messageId: result.pushNotificationId };
        }

        const error = result.details?.error ?? result.message ?? 'Unknown error';
        const shouldRemove = error === 'DeviceNotRegistered' || error === 'InvalidCredentials';

        return { success: false, error, shouldRemoveToken: shouldRemove };
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Bulk push notification error: ${errorMessage}`);
      return expoPushTokens.map(() => ({ success: false, error: errorMessage }));
    }
  }

  /**
   * Send push notification to all user devices
   */
  async sendToUser(
    userId: string,
    payload: PushNotificationPayload
  ): Promise<{ sent: number; failed: number; tokensToRemove: string[] }> {
    const devices = await UserDeviceModel.find({ userId: new Types.ObjectId(userId), isActive: true });

    if (devices.length === 0) {
      logger.info(`No active devices found for user ${userId}`);
      return { sent: 0, failed: 0, tokensToRemove: [] };
    }

    const tokens = devices.map(d => d.expoPushToken);
    const results = await this.sendNotifications(tokens, payload);

    let sent = 0;
    let failed = 0;
    const tokensToRemove: string[] = [];

    results.forEach((result, index) => {
      if (result.success) {
        sent++;
      } else {
        failed++;
        const token = tokens[index];
        if (result.shouldRemoveToken && token) {
          tokensToRemove.push(token);
        }
      }
    });

    // Remove invalid tokens
    if (tokensToRemove.length > 0) {
      await UserDeviceModel.updateMany(
        { expoPushToken: { $in: tokensToRemove } },
        { $set: { isActive: false } }
      );
      logger.info(`Deactivated ${tokensToRemove.length} invalid push tokens`);
    }

    return { sent, failed, tokensToRemove };
  }

  /**
   * Register or update a device's push token
   */
  async registerDevice(
    userId: string,
    expoPushToken: string,
    deviceId: string,
    platform: 'ios' | 'android' | 'web',
    deviceName?: string,
    appVersion?: string
  ): Promise<void> {
    await UserDeviceModel.findOneAndUpdate(
      { deviceId },
      {
        userId: new Types.ObjectId(userId),
        expoPushToken,
        deviceName: deviceName ?? undefined,
        platform,
        appVersion: appVersion ?? undefined,
        lastActiveAt: new Date(),
        isActive: true,
      },
      { upsert: true, new: true }
    );

    logger.info(`Device registered: ${deviceId} for user ${userId}`);
  }

  /**
   * Deactivate a device's push token
   */
  async deactivateDevice(deviceId: string): Promise<void> {
    await UserDeviceModel.updateOne(
      { deviceId },
      { $set: { isActive: false } }
    );

    logger.info(`Device deactivated: ${deviceId}`);
  }

  /**
   * Get all active devices for a user
   */
  async getUserActiveDevices(userId: string): Promise<string[]> {
    const devices = await UserDeviceModel.find({
      userId: new Types.ObjectId(userId),
      isActive: true,
    }).select('expoPushToken').lean();

    return devices.map(d => d.expoPushToken);
  }

  /**
   * Internal method to send messages to Expo Push API
   */
  private async sendToExpo(messages: ExpoPushMessage[]): Promise<ExpoPushResponse> {
    const response = await fetch(EXPO_PUSH_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${this.accessToken}`,
      },
      body: JSON.stringify({ messages }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Expo API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as ExpoPushResponse;
    return data;
  }
}

// Singleton instance
export const pushNotificationService = new PushNotificationService();
