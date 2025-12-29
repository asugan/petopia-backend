import { Schema, model } from 'mongoose';
import { IExchangeRateDocument } from './types';

const exchangeRateSchema = new Schema<IExchangeRateDocument>({
  baseCurrency: { type: String, required: true, unique: true, index: true },
  rates: {
    type: Object,
    required: true
  },
  fetchedAt: { type: Date, required: true }
}, {
  timestamps: true
});

// TTL Index: Automatically expire documents after 24 hours (86400 seconds)
exchangeRateSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });

export const ExchangeRateModel = model<IExchangeRateDocument>('ExchangeRate', exchangeRateSchema);
