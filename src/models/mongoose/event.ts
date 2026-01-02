import { Schema, model } from 'mongoose';
import { IEventDocument } from './types';

const eventSchema = new Schema<IEventDocument>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  petId: { type: Schema.Types.ObjectId, ref: 'Pet', required: true, index: true },
  title: { type: String, required: true },
  description: String,
  type: { type: String, required: true },
  startTime: { type: Date, required: true },
  endTime: Date,
  location: String,
  notes: String,
  reminder: { type: Boolean, default: false },
  reminderPreset: {
    type: String,
    enum: ['standard', 'compact', 'minimal'],
    default: 'standard',
  },
  status: {
    type: String,
    enum: ['upcoming', 'completed', 'cancelled', 'missed'],
    default: 'upcoming',
  },
  vaccineName: String,
  vaccineManufacturer: String,
  batchNumber: String,
  medicationName: String,
  dosage: String,
  frequency: String,
}, {
  timestamps: true
});

// Compound indexes
eventSchema.index({ userId: 1, petId: 1 });
eventSchema.index({ userId: 1, startTime: 1 });

export const EventModel = model<IEventDocument>('Event', eventSchema);
