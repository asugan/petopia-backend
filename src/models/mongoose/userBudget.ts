import { Schema, model } from 'mongoose';
import { IUserBudgetDocument } from './types';

const userBudgetSchema = new Schema<IUserBudgetDocument>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'TRY' },
  alertThreshold: { type: Number, default: 0.8 },
  isActive: { type: Boolean, default: true },
  lastAlertAt: { type: Date },
  lastAlertSeverity: { type: String, enum: ['warning', 'critical'] },
  lastAlertPeriod: { type: String },
  lastAlertPercentage: { type: Number },
}, {
  timestamps: true
});

export const UserBudgetModel = model<IUserBudgetDocument>('UserBudget', userBudgetSchema);
