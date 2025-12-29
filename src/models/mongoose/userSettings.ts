import { Schema, model } from 'mongoose';
import { IUserSettingsDocument } from './types';

const userSettingsSchema = new Schema<IUserSettingsDocument>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
  baseCurrency: {
    type: String,
    enum: ['TRY', 'USD', 'EUR', 'GBP'],
    default: 'TRY',
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
  }
}, {
  timestamps: true
});

export const UserSettingsModel = model<IUserSettingsDocument>('UserSettings', userSettingsSchema);
