import { Types } from 'mongoose';
import { z } from 'zod';
import { EXPO_PUSH_API_URL, expoPushConfig, isExpoPushErrorCode } from '../config/expoPushConfig.js';
import { logger } from '../utils/logger.js';
import { UserDeviceModel } from '../models/mongoose/userDevices.js';

// Expo API limits
const EXPO_BATCH_SIZE = 100; // Expo allows max 100 messages per request
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000; // 1 second

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

// Zod schema for runtime validation of Expo API response
const ExpoPushResultSchema = z.object({
  status: z.enum(['ok', 'error']),
  message: z.string().optional(),
  details: z.object({
    error: z.string().optional(),
    fault: z.string().optional(),
  }).optional(),
  pushNotificationId: z.string().optional(),
});

const ExpoPushResponseSchema = z.object({
  data: z.array(ExpoPushResultSchema),
});

export type ExpoPushResponse = z.infer<typeof ExpoPushResponseSchema>;

export interface PushNotificationResult {
  success: boolean;
  messageId?: string;
  error?: string;
  shouldRemoveToken?: boolean;
}

/**
 * Utility to wait for a specified duration
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Chunk an array into smaller arrays of specified size
 */
function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
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
   * Internal method to send messages to Expo Push API with batching and retry
   * Handles Expo's 100 message limit per request and implements exponential backoff
   */
  private async sendToExpo(messages: ExpoPushMessage[]): Promise<ExpoPushResponse> {
    if (messages.length === 0) {
      return { data: [] };
    }

    // Split messages into batches of EXPO_BATCH_SIZE (100)
    const batches = chunkArray(messages, EXPO_BATCH_SIZE);
    const allResults: ExpoPushResponse['data'] = [];

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      if (!batch || batch.length === 0) continue;

      let lastError: Error | null = null;
      let batchResult: ExpoPushResponse | null = null;

      // Retry logic with exponential backoff
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          batchResult = await this.sendBatchToExpo(batch);
          break; // Success, exit retry loop
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          
          // Check if error is retryable
          const isRetryable = this.isRetryableError(lastError);
          
          if (!isRetryable || attempt === MAX_RETRIES - 1) {
            // Non-retryable error or last attempt
            logger.error(`Push notification batch ${batchIndex + 1}/${batches.length} failed after ${attempt + 1} attempts: ${lastError.message}`);
            break;
          }

          // Calculate exponential backoff delay
          const delayMs = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
          logger.warn(`Push notification batch ${batchIndex + 1} attempt ${attempt + 1} failed, retrying in ${delayMs}ms: ${lastError.message}`);
          await delay(delayMs);
        }
      }

      if (batchResult) {
        allResults.push(...batchResult.data);
      } else {
        // All retries failed, add error results for this batch
        const errorResults = batch.map(() => ({
          status: 'error' as const,
          message: lastError?.message ?? 'Unknown error after retries',
        }));
        allResults.push(...errorResults);
      }
    }

    return { data: allResults };
  }

  /**
   * Send a single batch to Expo API with Zod validation
   */
  private async sendBatchToExpo(messages: ExpoPushMessage[]): Promise<ExpoPushResponse> {
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

    const rawData = await response.json();
    
    // Runtime validation with Zod
    const parseResult = ExpoPushResponseSchema.safeParse(rawData);
    
    if (!parseResult.success) {
      logger.error('Invalid Expo API response format:', parseResult.error.issues);
      throw new Error(`Invalid Expo API response: ${parseResult.error.message}`);
    }

    return parseResult.data;
  }

  /**
   * Check if an error is retryable
   */
  private isRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase();
    
    // Retryable: rate limits, timeouts, server errors
    const retryablePatterns = [
      'rate limit',
      'too many requests',
      'timeout',
      'timed out',
      'econnreset',
      'econnrefused',
      'socket hang up',
      '429',
      '500',
      '502',
      '503',
      '504',
    ];

    return retryablePatterns.some(pattern => message.includes(pattern));
  }
}

// Singleton instance
export const pushNotificationService = new PushNotificationService();
