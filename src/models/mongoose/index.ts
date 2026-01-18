// Centralized exports for all mongoose models
export { PetModel } from './pet';
export { HealthRecordModel } from './healthRecord';
export { EventModel } from './event';
export { FeedingScheduleModel } from './feedingSchedule';
export { ExpenseModel } from './expense';
export { BudgetLimitModel } from './budgetLimit';
export { UserBudgetModel } from './userBudget';
export { UserSettingsModel } from './userSettings';
export { SubscriptionModel } from './subscription';
export { DeviceTrialRegistryModel } from './deviceTrialRegistry';
export { UserTrialRegistryModel } from './userTrialRegistry';
export { ExchangeRateModel } from './exchangeRate';
export { RecurrenceRuleModel } from './recurrenceRule';

// Export document interfaces
export type {
  IPetDocument,
  IHealthRecordDocument,
  IEventDocument,
  IFeedingScheduleDocument,
  IExpenseDocument,
  IUserBudgetDocument,
  IUserSettingsDocument,
  ISubscriptionDocument,
  IBudgetLimitDocument,
  IDeviceTrialRegistryDocument,
  IUserTrialRegistryDocument,
  IExchangeRateDocument,
  IRecurrenceRuleDocument,
  RecurrenceFrequency,
} from './types';
