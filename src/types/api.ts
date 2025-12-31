import type { EventType, HealthRecordType } from '../models/mongoose/types';

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

export type { EventType, HealthRecordType } from '../models/mongoose/types';

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
  description?: string;
  date: string;
  veterinarian?: string;
  clinic?: string;
  cost?: number;
  notes?: string;
  attachments?: string;
  treatmentPlan?: Array<{
    name: string;
    dosage: string;
    frequency: string;
    duration?: string;
    notes?: string;
  }>;
  nextVisitDate?: string;
}

export interface UpdateHealthRecordRequest {
  type?: HealthRecordType;
  title?: string;
  description?: string;
  date?: string;
  veterinarian?: string;
  clinic?: string;
  cost?: number;
  notes?: string;
  attachments?: string;
  treatmentPlan?: Array<{
    name: string;
    dosage: string;
    frequency: string;
    duration?: string;
    notes?: string;
  }>;
  nextVisitDate?: string;
}

export interface CreateEventRequest {
  petId: string;
  title: string;
  description?: string;
  type: EventType;
  startTime: string;
  endTime?: string;
  location?: string;
  notes?: string;
  reminder?: boolean;
  vaccineName?: string;
  vaccineManufacturer?: string;
  batchNumber?: string;
  medicationName?: string;
  dosage?: string;
  frequency?: string;
}

export interface UpdateEventRequest {
  title?: string;
  description?: string;
  type?: EventType;
  startTime?: string;
  endTime?: string;
  location?: string;
  notes?: string;
  reminder?: boolean;
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
}

export interface UpdateFeedingScheduleRequest {
  time?: string;
  foodType?: string;
  amount?: string;
  days?: string;
  isActive?: boolean;
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
  description?: string;
  date: string;
  receiptPhoto?: string;
  vendor?: string;
  notes?: string;
}

export interface UpdateExpenseRequest {
  category?: string;
  amount?: number;
  currency?: string;
  paymentMethod?: string;
  description?: string;
  date?: string;
  receiptPhoto?: string;
  vendor?: string;
  notes?: string;
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
  baseCurrency: 'TRY' | 'USD' | 'EUR' | 'GBP';
  timezone: string;
  language: string;
  theme: 'light' | 'dark';
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdateUserSettingsRequest {
  baseCurrency?: 'TRY' | 'USD' | 'EUR' | 'GBP';
  timezone?: string;
  language?: string;
  theme?: 'light' | 'dark';
}

export interface UpdateBaseCurrencyRequest {
  baseCurrency: 'TRY' | 'USD' | 'EUR' | 'GBP';
}
