import { Document, Types } from 'mongoose';

export type HealthRecordType =
  | 'checkup'
  | 'visit'
  | 'surgery'
  | 'dental'
  | 'grooming'
  | 'other';

export type EventType =
  | 'feeding'
  | 'exercise'
  | 'grooming'
  | 'play'
  | 'training'
  | 'vet_visit'
  | 'walk'
  | 'bath'
  | 'vaccination'
  | 'medication'
  | 'other';

export type ReminderPresetKey = 'standard' | 'compact' | 'minimal';
export type EventStatus = 'upcoming' | 'completed' | 'cancelled' | 'missed';
export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom' | 'times_per_day';

// Pet Document Interface
export interface IPetDocument extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  name: string;
  type: string;
  breed?: string;
  birthDate?: Date;
  weight?: number;
  gender?: 'male' | 'female' | 'other';
  profilePhoto?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Health Record Document Interface
export interface ITreatmentPlanItem {
  name: string;
  dosage: string;
  frequency: string;
  duration?: string;
  notes?: string;
}

export interface IHealthRecordDocument extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  petId: Types.ObjectId;
  type: HealthRecordType;
  title: string;
  description?: string;
  date: Date;
  veterinarian?: string;
  clinic?: string;
  cost?: number;
  currency?: string;
  baseCurrency?: string;
  amountBase?: number;
  fxRate?: number;
  fxAsOf?: Date;
  notes?: string;
  attachments?: string;
  treatmentPlan?: ITreatmentPlanItem[];
  nextVisitEventId?: Types.ObjectId;
  expenseId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// Event Document Interface
export interface IEventDocument extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  petId: Types.ObjectId;
  title: string;
  description?: string;
  type: EventType;
  startTime: Date;
  endTime?: Date;
  location?: string;
  notes?: string;
  reminder: boolean;
  reminderPreset?: ReminderPresetKey;
  status: EventStatus;
  vaccineName?: string;
  vaccineManufacturer?: string;
  batchNumber?: string;
  medicationName?: string;
  dosage?: string;
  frequency?: string;
  // Recurrence fields
  recurrenceRuleId?: Types.ObjectId;
  seriesIndex?: number;
  isException?: boolean;
  scheduledNotificationIds?: string[];
  createdAt: Date;
  updatedAt: Date;
}

// Feeding Schedule Document Interface
export interface IFeedingScheduleDocument extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  petId: Types.ObjectId;
  time: string;
  foodType: string;
  amount: string;
  days: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Expense Document Interface
export interface IExpenseDocument extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  petId: Types.ObjectId;
  category: string;
  amount: number;
  currency: string;
  baseCurrency?: string;
  amountBase?: number;
  fxRate?: number;
  fxAsOf?: Date;
  paymentMethod?: string;
  description?: string;
  date: Date;
  receiptPhoto?: string;
  vendor?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

// User Budget Document Interface
export interface IUserBudgetDocument extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  amount: number;
  currency: string;
  alertThreshold: number;
  isActive: boolean;
  lastAlertAt?: Date;
  lastAlertSeverity?: 'warning' | 'critical';
  lastAlertPeriod?: string;
  lastAlertPercentage?: number;
  createdAt: Date;
  updatedAt: Date;
}

// Subscription Document Interface
export interface ISubscriptionDocument extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  provider: 'internal' | 'revenuecat';
  revenueCatId?: string;
  tier: 'pro';
  status: 'active' | 'expired' | 'cancelled';
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Budget Limit Document Interface
export interface IBudgetLimitDocument extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  petId: Types.ObjectId;
  category?: string;
  amount: number;
  currency: string;
  period: 'monthly' | 'yearly';
  alertThreshold: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Device Trial Registry Document Interface
export interface IDeviceTrialRegistryDocument extends Document {
  _id: Types.ObjectId;
  deviceId: string;
  firstTrialUserId: Types.ObjectId;
  trialUsedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

// User Trial Registry Document Interface
export interface IUserTrialRegistryDocument extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  trialUsedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Exchange Rate Document Interface
export interface IExchangeRateDocument extends Document {
  _id: Types.ObjectId;
  baseCurrency: string;
  rates: Record<string, number>;
  fetchedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserSettingsDocument extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  baseCurrency: 'TRY' | 'USD' | 'EUR' | 'GBP';
  timezone: string;
  language: string;
  theme: 'light' | 'dark';
  notificationsEnabled: boolean;
  budgetNotificationsEnabled: boolean;
  quietHoursEnabled: boolean;
  quietHours: {
    startHour: number;
    startMinute: number;
    endHour: number;
    endMinute: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

// Recurrence Rule Document Interface
export interface IRecurrenceRuleDocument extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  petId: Types.ObjectId;

  // Event template data
  title: string;
  description?: string;
  type: EventType;
  location?: string;
  notes?: string;
  reminder: boolean;
  reminderPreset?: ReminderPresetKey;

  // Medication/Vaccination fields
  vaccineName?: string;
  vaccineManufacturer?: string;
  batchNumber?: string;
  medicationName?: string;
  dosage?: string;

  // Recurrence settings
  frequency: RecurrenceFrequency;
  interval: number;
  daysOfWeek?: number[];
  dayOfMonth?: number;
  timesPerDay?: number;
  dailyTimes?: string[];

  // Duration settings
  eventDurationMinutes?: number;

  // Timezone
  timezone: string;

  // Date boundaries
  startDate: Date;
  endDate?: Date;

  // Management
  isActive: boolean;
  lastGeneratedDate?: Date;
  excludedDates?: Date[];

  createdAt: Date;
  updatedAt: Date;
}

// User Device Document Interface (for push notifications)
export interface IUserDeviceDocument extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  expoPushToken: string;
  deviceId: string;
  deviceName?: string;
  platform: 'ios' | 'android' | 'web';
  appVersion?: string;
  lastActiveAt: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Scheduled Notification Document Interface
export interface IScheduledNotificationDocument extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  eventId: Types.ObjectId;
  expoPushToken: string;
  scheduledFor: Date;
  sentAt?: Date;
  status: 'pending' | 'sent' | 'failed' | 'cancelled';
  errorMessage?: string;
  retryCount: number;
  maxRetries: number;
  notificationId?: string;
  createdAt: Date;
  updatedAt: Date;
}
