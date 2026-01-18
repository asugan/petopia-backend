import { Schema, model } from 'mongoose';
import { IUserSettingsDocument } from './types';

const defaultQuietHours = {
  startHour: 22,
  startMinute: 0,
  endHour: 8,
  endMinute: 0,
};

const userSettingsSchema = new Schema<IUserSettingsDocument>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
  baseCurrency: {
    type: String,
    enum: ['TRY', 'USD', 'EUR', 'GBP'],
    default: 'USD',
    required: true
  },
  timezone: {
    type: String,
    default: 'Europe/Istanbul'
  },
  language: {
    type: String,
    default: 'tr'
  },
  theme: {
    type: String,
    enum: ['light', 'dark'],
    default: 'light'
  },
  notificationsEnabled: {
    type: Boolean,
    default: true
  },
  budgetNotificationsEnabled: {
    type: Boolean,
    default: true
  },
  feedingRemindersEnabled: {
    type: Boolean,
    default: true
  },
  quietHoursEnabled: {
    type: Boolean,
    default: true
  },
  quietHours: {
    startHour: { type: Number, default: defaultQuietHours.startHour },
    startMinute: { type: Number, default: defaultQuietHours.startMinute },
    endHour: { type: Number, default: defaultQuietHours.endHour },
    endMinute: { type: Number, default: defaultQuietHours.endMinute },
  },
}, {
  timestamps: true
});

export const UserSettingsModel = model<IUserSettingsDocument>('UserSettings', userSettingsSchema);
