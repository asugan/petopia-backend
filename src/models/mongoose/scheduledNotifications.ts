import { Schema, model } from 'mongoose';
import { IScheduledNotificationDocument } from './types.js';

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
  notificationId: { type: String }, // Expo notification ID for tracking
}, {
  timestamps: true
});

// Compound indexes for efficient queries
scheduledNotificationSchema.index({ userId: 1, status: 1 });
scheduledNotificationSchema.index({ eventId: 1, status: 1 });
scheduledNotificationSchema.index({ scheduledFor: 1, status: 1, sentAt: 1 });

export const ScheduledNotificationModel = model<IScheduledNotificationDocument>('ScheduledNotification', scheduledNotificationSchema);
