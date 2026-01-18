import { Schema, model } from 'mongoose';
import { IUserDeviceDocument } from './types.js';

const userDeviceSchema = new Schema<IUserDeviceDocument>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  expoPushToken: { type: String, required: true },
  deviceId: { type: String, required: true, unique: true },
  deviceName: { type: String },
  platform: { type: String, enum: ['ios', 'android', 'web'], required: true },
  appVersion: { type: String },
  lastActiveAt: { type: Date, default: Date.now },
  isActive: { type: Boolean, default: true },
}, {
  timestamps: true
});

// Index for quick user device lookup
userDeviceSchema.index({ userId: 1, isActive: 1 });

// Index for token cleanup
userDeviceSchema.index({ expoPushToken: 1 });

export const UserDeviceModel = model<IUserDeviceDocument>('UserDevice', userDeviceSchema);
