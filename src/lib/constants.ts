// Supported currencies for the application (Frankfurter API compatible)
export const SUPPORTED_CURRENCIES = [
  'TRY', 'USD', 'EUR', 'GBP', 'AUD', 'BRL', 'CAD', 'CHF', 'CNY', 'CZK', 'DKK',
  'HKD', 'HUF', 'IDR', 'ILS', 'INR', 'ISK', 'JPY', 'KRW', 'MXN', 'MYR', 'NOK',
  'NZD', 'PHP', 'PLN', 'RON', 'SEK', 'SGD', 'THB', 'ZAR',
] as const;

export type SupportedCurrency = typeof SUPPORTED_CURRENCIES[number];

// Legacy type alias for backward compatibility
export type Currency = SupportedCurrency;
