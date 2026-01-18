import dotenv from 'dotenv';
dotenv.config();

export interface ExpoPushConfig {
  accessToken: string | undefined;
  isConfigured: boolean;
}

export const expoPushConfig: ExpoPushConfig = {
  get accessToken() {
    return process.env.EXPO_ACCESS_TOKEN;
  },
  get isConfigured() {
    return !!process.env.EXPO_ACCESS_TOKEN;
  },
};

export const EXPO_PUSH_API_URL = 'https://exp.host/--/api/v2/push/send';

export const EXPO_PUSH_ERRORS = {
  DEVICE_NOT_REGISTRED: 'DeviceNotRegistered',
  INVALID_CREDENTIALS: 'InvalidCredentials',
  MESSAGE_TOO_BIG: 'MessageTooBig',
  QUOTA_EXCEEDED: 'QuotaExceeded',
  TOO_MANY_REQUESTS: 'TooManyRequests',
} as const;

export function isExpoPushErrorCode(code: string): boolean {
  return Object.values(EXPO_PUSH_ERRORS).includes(code as typeof EXPO_PUSH_ERRORS[keyof typeof EXPO_PUSH_ERRORS]);
}

export function getExpoPushConfig(): ExpoPushConfig {
  return expoPushConfig;
}
