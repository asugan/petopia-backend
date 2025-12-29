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
  notes?: string;
  attachments?: string;
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
  vaccineName?: string;
  vaccineManufacturer?: string;
  batchNumber?: string;
  medicationName?: string;
  dosage?: string;
  frequency?: string;
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
  createdAt: Date;
  updatedAt: Date;
}
