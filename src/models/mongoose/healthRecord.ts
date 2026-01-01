import { Schema, model } from 'mongoose';
import { IHealthRecordDocument } from './types';

const healthRecordSchema = new Schema<IHealthRecordDocument>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  petId: { type: Schema.Types.ObjectId, ref: 'Pet', required: true, index: true },
  type: { type: String, required: true },
  title: { type: String, required: true },
  description: String,
  date: { type: Date, required: true },
  veterinarian: String,
  clinic: String,
  cost: Number,
  currency: { type: String },
  baseCurrency: { type: String, index: true },
  amountBase: { type: Number, index: true },
  fxRate: { type: Number },
  fxAsOf: { type: Date },
  notes: String,
  attachments: String,
  treatmentPlan: [{
    name: { type: String, required: true },
    dosage: { type: String, required: true },
    frequency: { type: String, required: true },
    duration: String,
    notes: String
  }],
  nextVisitEventId: { type: Schema.Types.ObjectId, ref: 'Event' },
}, {
  timestamps: true
});

// Compound indexes
healthRecordSchema.index({ userId: 1, petId: 1 });
healthRecordSchema.index({ userId: 1, date: -1 });

export const HealthRecordModel = model<IHealthRecordDocument>('HealthRecord', healthRecordSchema);
