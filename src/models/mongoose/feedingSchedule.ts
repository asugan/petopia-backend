import { Schema, model } from 'mongoose';
import { IFeedingScheduleDocument } from './types';

const feedingScheduleSchema = new Schema<IFeedingScheduleDocument>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  petId: { type: Schema.Types.ObjectId, ref: 'Pet', required: true, index: true },
  time: { type: String, required: true },
  foodType: { type: String, required: true },
  amount: { type: String, required: true },
  days: { type: String, required: true },
  isActive: { type: Boolean, default: true },
  // Notification fields
  remindersEnabled: { type: Boolean, default: false },
  reminderMinutesBefore: { type: Number, default: 15 },
  lastNotificationAt: { type: Date },
  nextNotificationTime: { type: Date },
}, {
  timestamps: true
});

// Compound indexes
feedingScheduleSchema.index({ userId: 1, petId: 1 });
feedingScheduleSchema.index({ userId: 1, isActive: 1 });

export const FeedingScheduleModel = model<IFeedingScheduleDocument>('FeedingSchedule', feedingScheduleSchema);