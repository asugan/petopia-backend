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
  // Recurrence fields
  recurrenceRuleId: { type: Schema.Types.ObjectId, ref: 'RecurrenceRule', index: true },
  seriesIndex: Number,
  isException: { type: Boolean, default: false },
  scheduledNotificationIds: [String],
}, {
  timestamps: true
});

// Compound indexes
eventSchema.index({ userId: 1, petId: 1 });
eventSchema.index({ userId: 1, startTime: 1 });

// Unique index for idempotent event generation (only for recurring events)
eventSchema.index(
  { recurrenceRuleId: 1, startTime: 1 },
  {
    unique: true,
    sparse: true,
    partialFilterExpression: { recurrenceRuleId: { $exists: true, $ne: null } }
  }
);

export const EventModel = model<IEventDocument>('Event', eventSchema);
