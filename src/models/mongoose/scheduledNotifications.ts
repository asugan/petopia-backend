import { Schema, model } from 'mongoose';
import { IScheduledNotificationDocument } from './types.js';

/**
 * ScheduledNotification Model
 * 
 * Tracks push notifications that have been processed for event reminders.
 * 
 * Status values:
 * - 'pending': Notification is queued but not yet sent (for future scheduled delivery)
 * - 'sent': Notification was successfully delivered to Expo Push API
 * - 'failed': Notification delivery failed after all retry attempts
 * - 'cancelled': Notification was cancelled (e.g., event was deleted/updated)
 * 
 * Note: Currently, notifications are sent immediately when processed by the scheduler,
 * so most records will have status 'sent' with sentAt populated. The 'pending' status
 * is reserved for future use if we implement delayed/scheduled delivery.
 */
const scheduledNotificationSchema = new Schema<IScheduledNotificationDocument>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  eventId: { type: Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
  expoPushToken: { type: String, required: true },
  scheduledFor: { type: Date, required: true, index: true },
  sentAt: { type: Date },
  status: {
    type: String,
    enum: ['pending', 'sent', 'failed', 'cancelled'],
    default: 'pending',
    index: true
  },
  errorMessage: { type: String },
  retryCount: { type: Number, default: 0 },
  maxRetries: { type: Number, default: 3 },
  notificationId: { type: String }, // Expo push notification ID returned after successful send
}, {
  timestamps: true
});

// Compound indexes for efficient queries
scheduledNotificationSchema.index({ userId: 1, status: 1 });
scheduledNotificationSchema.index({ eventId: 1, status: 1 });
scheduledNotificationSchema.index({ scheduledFor: 1, status: 1, sentAt: 1 });

export const ScheduledNotificationModel = model<IScheduledNotificationDocument>('ScheduledNotification', scheduledNotificationSchema);
