import { Schema, model } from 'mongoose';
import { IRecurrenceRuleDocument } from './types';

const recurrenceRuleSchema = new Schema<IRecurrenceRuleDocument>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  petId: { type: Schema.Types.ObjectId, ref: 'Pet', required: true, index: true },

  // Event template data
  title: { type: String, required: true },
  description: String,
  type: { type: String, required: true },
  location: String,
  notes: String,
  reminder: { type: Boolean, default: false },
  reminderPreset: {
    type: String,
    enum: ['standard', 'compact', 'minimal'],
    default: 'standard',
  },

  // Medication/Vaccination fields
  vaccineName: String,
  vaccineManufacturer: String,
  batchNumber: String,
  medicationName: String,
  dosage: String,

  // Recurrence settings
  frequency: {
    type: String,
    enum: ['daily', 'weekly', 'monthly', 'yearly', 'custom', 'times_per_day'],
    required: true,
  },
  interval: { type: Number, default: 1, min: 1 },
  daysOfWeek: [{ type: Number, min: 0, max: 6 }], // 0 = Sunday, 6 = Saturday
  dayOfMonth: { type: Number, min: 1, max: 31 },
  timesPerDay: { type: Number, min: 1, max: 10 },
  dailyTimes: [String], // ["08:00", "14:00", "20:00"]

  // Duration settings
  eventDurationMinutes: { type: Number, min: 0 },

  // Timezone
  timezone: { type: String, required: true, default: 'UTC' },

  // Date boundaries
  startDate: { type: Date, required: true },
  endDate: Date, // null = infinite

  // Management
  isActive: { type: Boolean, default: true },
  lastGeneratedDate: Date,
  excludedDates: [{ type: Date }],
}, {
  timestamps: true
});

// Compound indexes
recurrenceRuleSchema.index({ userId: 1, isActive: 1 });
recurrenceRuleSchema.index({ userId: 1, petId: 1 });

export const RecurrenceRuleModel = model<IRecurrenceRuleDocument>('RecurrenceRule', recurrenceRuleSchema);
