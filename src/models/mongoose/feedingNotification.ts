import { Document, Schema, Types, model } from 'mongoose';

export interface IFeedingNotificationDocument extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  scheduleId: Types.ObjectId;
  petId: Types.ObjectId;
  scheduledFor: Date;
  sentAt?: Date;
  status: 'pending' | 'sent' | 'failed' | 'cancelled';
  expoPushToken: string;
  notificationId?: string;
  errorMessage?: string;
  retryCount?: number;
  maxRetries?: number;
  createdAt: Date;
  updatedAt: Date;
}

const feedingNotificationSchema = new Schema<IFeedingNotificationDocument>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  scheduleId: { type: Schema.Types.ObjectId, ref: 'FeedingSchedule', required: true, index: true },
  petId: { type: Schema.Types.ObjectId, ref: 'Pet', required: true, index: true },
  scheduledFor: { type: Date, required: true, index: true },
  sentAt: { type: Date },
  status: {
    type: String,
    enum: ['pending', 'sent', 'failed', 'cancelled'],
    default: 'pending',
    index: true,
  },
  expoPushToken: { type: String, required: true },
  notificationId: { type: String },
  errorMessage: { type: String },
  retryCount: { type: Number, default: 0 },
  maxRetries: { type: Number, default: 3 },
}, {
  timestamps: true,
});

// Compound indexes for efficient queries
feedingNotificationSchema.index({ userId: 1, status: 1, scheduledFor: 1 });
feedingNotificationSchema.index({ scheduleId: 1, status: 1 });

// Unique compound index to prevent duplicate notifications for the same schedule at the same time
feedingNotificationSchema.index(
  { scheduleId: 1, scheduledFor: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } }
);

export const FeedingNotificationModel = model<IFeedingNotificationDocument>('FeedingNotification', feedingNotificationSchema);
