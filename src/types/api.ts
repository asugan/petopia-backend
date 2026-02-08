import type { EventStatus, EventType, HealthRecordType, ReminderPresetKey } from '../models/mongoose/types';
import { SupportedCurrency } from '../lib/constants';

// API Response Types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
    totalPages?: number;
  };
}

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export type { EventStatus, EventType, HealthRecordType, ReminderPresetKey } from '../models/mongoose/types';

// Request/Response types for each entity
export interface CreatePetRequest {
  name: string;
  type: string;
  breed?: string;
  birthDate?: string;
  weight?: number;
  gender?: 'male' | 'female' | 'other';
  profilePhoto?: string;
}

export interface UpdatePetRequest {
  name?: string;
  type?: string;
  breed?: string;
  birthDate?: string;
  weight?: number;
  gender?: 'male' | 'female' | 'other';
  profilePhoto?: string;
}

export interface CreateHealthRecordRequest {
  petId: string;
  type: HealthRecordType;
  title: string;
  date: string;
  attachments?: string;
  treatmentPlan?: {
    name: string;
    dosage: string;
    frequency: string;
    duration?: string;
    notes?: string;
  }[];
}

export interface UpdateHealthRecordRequest {
  type?: HealthRecordType;
  title?: string;
  date?: string;
  attachments?: string;
  treatmentPlan?: {
    name: string;
    dosage: string;
    frequency: string;
    duration?: string;
    notes?: string;
  }[];
}

export interface CreateEventRequest {
  petId: string;
  title: string;
  type: EventType;
  startTime: string;
  reminder?: boolean;
  reminderPreset?: ReminderPresetKey;
  status?: EventStatus;
  vaccineName?: string;
  vaccineManufacturer?: string;
  batchNumber?: string;
  medicationName?: string;
  dosage?: string;
  frequency?: string;
}

export interface UpdateEventRequest {
  title?: string;
  type?: EventType;
  startTime?: string;
  reminder?: boolean;
  reminderPreset?: ReminderPresetKey;
  status?: EventStatus;
  vaccineName?: string;
  vaccineManufacturer?: string;
  batchNumber?: string;
  medicationName?: string;
  dosage?: string;
  frequency?: string;
}

export interface CreateFeedingScheduleRequest {
  petId: string;
  time: string;
  foodType: string;
  amount: string;
  days: string;
  isActive?: boolean;
  remindersEnabled?: boolean;
  reminderMinutesBefore?: number;
}

export interface UpdateFeedingScheduleRequest {
  time?: string;
  foodType?: string;
  amount?: string;
  days?: string;
  isActive?: boolean;
  remindersEnabled?: boolean;
  reminderMinutesBefore?: number;
}

// Database entity types (re-exported from schema)
export type {
  Pet,
  NewPet,
  HealthRecord,
  NewHealthRecord,
  Event,
  NewEvent,
  FeedingSchedule,
  NewFeedingSchedule,
  Expense,
  NewExpense,
  BudgetLimit,
  NewBudgetLimit,
} from '../models/schema';

// Query parameter types
export interface PetQueryParams extends PaginationParams {
  type?: string;
  breed?: string;
  gender?: string;
}

export interface HealthRecordQueryParams extends PaginationParams {
  type?: string;
  startDate?: string;
  endDate?: string;
}

export interface EventQueryParams extends PaginationParams {
  type?: string;
  startDate?: string;
  endDate?: string;
  date?: string; // For calendar view
}

export interface FeedingScheduleQueryParams extends PaginationParams {
  isActive?: boolean;
  foodType?: string;
}

// Expense types
export interface CreateExpenseRequest {
  petId: string;
  category: string;
  amount: number;
  currency?: string;
  paymentMethod?: string;
  date: string;
}

export interface UpdateExpenseRequest {
  category?: string;
  amount?: number;
  currency?: string;
  paymentMethod?: string;
  date?: string;
}

export interface ExpenseQueryParams extends PaginationParams {
  category?: string;
  startDate?: string;
  endDate?: string;
  minAmount?: number;
  maxAmount?: number;
  currency?: string;
  paymentMethod?: string;
}

// Budget types
export interface CreateBudgetLimitRequest {
  petId: string;
  category?: string;
  amount: number;
  currency: string;
  period: 'monthly' | 'yearly';
  alertThreshold?: number;
  isActive?: boolean;
}

export interface UpdateBudgetLimitRequest {
  category?: string;
  amount?: number;
  currency?: string;
  period?: 'monthly' | 'yearly';
  alertThreshold?: number;
  isActive?: boolean;
}

export interface BudgetQueryParams extends PaginationParams {
  period?: string;
  isActive?: boolean;
  category?: string;
}

// Simplified User Budget System Types
export interface SetUserBudgetInput {
  amount: number;
  currency: string;
  alertThreshold?: number; // optional, default 0.8
  isActive?: boolean; // optional, default true
}

export interface UserBudget {
  id: string;
  userId: string;
  amount: number;
  currency: string;
  alertThreshold: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface BudgetStatus {
  budget: UserBudget;
  currentSpending: number;
  percentage: number;
  remainingAmount: number;
  isAlert: boolean;
  petBreakdown?: {
    petId: string;
    petName: string;
    spending: number;
  }[];
}

export interface BudgetAlert {
  budget: UserBudget;
  currentSpending: number;
  percentage: number;
  alertThreshold: number;
  isOverBudget: boolean;
  petBreakdown?: {
    petId: string;
    petName: string;
    spending: number;
  }[];
}

export interface UserSettings {
  id: string;
  userId: string;
  baseCurrency: SupportedCurrency;
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

export interface UpdateUserSettingsRequest {
  baseCurrency?: SupportedCurrency;
  timezone?: string;
  language?: string;
  theme?: 'light' | 'dark';
  notificationsEnabled?: boolean;
  budgetNotificationsEnabled?: boolean;
  quietHoursEnabled?: boolean;
  quietHours?: {
    startHour: number;
    startMinute: number;
    endHour: number;
    endMinute: number;
  };
}

export interface UpdateBaseCurrencyRequest {
  baseCurrency: SupportedCurrency;
}

// Recurrence Rule Types
export type { RecurrenceFrequency } from '../models/mongoose/types';

export interface CreateRecurrenceRuleRequest {
  petId: string;
  title: string;
  type: EventType;
  reminder?: boolean;
  reminderPreset?: ReminderPresetKey;

  // Medication/Vaccination fields
  vaccineName?: string;
  vaccineManufacturer?: string;
  batchNumber?: string;
  medicationName?: string;
  dosage?: string;

  // Recurrence settings
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom' | 'times_per_day';
  interval?: number;
  daysOfWeek?: number[];
  dayOfMonth?: number;
  timesPerDay?: number;
  dailyTimes?: string[];

  // Timezone
  timezone: string;

  // Date boundaries
  startDate: string;
  endDate?: string;
}

export interface UpdateRecurrenceRuleRequest {
  title?: string;
  type?: EventType;
  reminder?: boolean;
  reminderPreset?: ReminderPresetKey;

  // Medication/Vaccination fields
  vaccineName?: string;
  vaccineManufacturer?: string;
  batchNumber?: string;
  medicationName?: string;
  dosage?: string;

  // Recurrence settings
  frequency?: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom' | 'times_per_day';
  interval?: number;
  daysOfWeek?: number[];
  dayOfMonth?: number;
  timesPerDay?: number;
  dailyTimes?: string[];

  // Timezone
  timezone?: string;

  // Date boundaries
  startDate?: string;
  endDate?: string | null;

  // Management
  isActive?: boolean;
}

export interface RecurrenceRuleQueryParams extends PaginationParams {
  isActive?: boolean;
  petId?: string;
}
