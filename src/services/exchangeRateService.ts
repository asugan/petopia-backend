import { HydratedDocument } from 'mongoose';
import { ExchangeRateModel, IExchangeRateDocument } from '../models/mongoose';
import { logger } from '../utils/logger.js';
import { SUPPORTED_CURRENCIES, SupportedCurrency } from '../lib/constants.js';

const FRANKFURTER_API_BASE = 'https://api.frankfurter.app';
const CACHE_TTL_HOURS = 24;

interface FrankfurterRatesResponse {
  amount: number;
  base: string;
  date: string;
  rates: Record<string, number>;
}

export class ExchangeRateService {
  async getRate(fromCurrency: string, toCurrency: string): Promise<number | null> {
    if (fromCurrency === toCurrency) {
      return 1;
    }

    const rates = await this.getRates(fromCurrency);
    return rates?.[toCurrency] ?? null;
  }

  async getRates(baseCurrency: string): Promise<Record<string, number> | null> {
    try {
      const cachedRate = await ExchangeRateModel.findOne({ baseCurrency }).exec();

      if (cachedRate && this.isCacheValid(cachedRate)) {
        return cachedRate.rates;
      }

      const freshRates = await this.fetchFromFrankfurter(baseCurrency);
      return freshRates;
    } catch (error) {
      logger.error(`Error fetching rates for ${baseCurrency}:`, error);
      return null;
    }
  }

  async convertAmount(
    amount: number,
    fromCurrency: string,
    toCurrency: string
  ): Promise<number | null> {
    if (fromCurrency === toCurrency) {
      return amount;
    }

    const rate = await this.getRate(fromCurrency, toCurrency);

    if (rate === null) {
      return null;
    }

    return this.round(amount * rate);
  }

  async refreshRates(baseCurrency: string): Promise<Record<string, number> | null> {
    try {
      const rates = await this.fetchFromFrankfurter(baseCurrency);
      return rates;
    } catch (error) {
      logger.error(`Error refreshing rates for ${baseCurrency}:`, error);
      return null;
    }
  }

  async getCachedRates(baseCurrency: string): Promise<Record<string, number> | null> {
    const cachedRate = await ExchangeRateModel.findOne({ baseCurrency }).exec();

    if (!cachedRate) {
      return null;
    }

    if (!this.isCacheValid(cachedRate)) {
      return null;
    }

    return cachedRate.rates;
  }

  private async fetchFromFrankfurter(
    baseCurrency: string
  ): Promise<Record<string, number> | null> {
    try {
      const response = await fetch(
        `${FRANKFURTER_API_BASE}/latest?base=${baseCurrency}`
      );

      if (!response.ok) {
        throw new Error(`Frankfurter API error: ${response.statusText}`);
      }

      const data = await response.json() as FrankfurterRatesResponse;

      const filteredRates: Record<string, number> = {};
      Object.entries(data.rates)
        .filter(([currency]) => SUPPORTED_CURRENCIES.includes(currency as SupportedCurrency))
        .forEach(([currency, rate]) => {
          filteredRates[currency as SupportedCurrency] = rate;
        });

      await this.saveToCache(baseCurrency, filteredRates, data.date);

      return filteredRates;
    } catch (error) {
      logger.error(`Error fetching from Frankfurter for ${baseCurrency}:`, error);
      return null;
    }
  }

  private async saveToCache(
    baseCurrency: string,
    rates: Record<string, number>,
    fetchedAtDate: string
  ): Promise<void> {
    try {
      const existing = await ExchangeRateModel.findOne({
        baseCurrency
      }).exec();

      const fetchedAt = new Date(fetchedAtDate);
      fetchedAt.setHours(12, 0, 0, 0);

      if (existing) {
        existing.rates = rates;
        existing.fetchedAt = fetchedAt;
        await existing.save();
      } else {
        const newRate = new ExchangeRateModel({
          baseCurrency,
          rates,
          fetchedAt
        });
        await newRate.save();
      }
    } catch (error) {
      logger.error(`Error saving rates to cache for ${baseCurrency}:`, error);
    }
  }

  private isCacheValid(doc: HydratedDocument<IExchangeRateDocument>): boolean {
    const ageHours = (Date.now() - doc.fetchedAt.getTime()) / (1000 * 60 * 60);
    return ageHours < CACHE_TTL_HOURS;
  }

  private round(value: number, decimals = 2): number {
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
  }
}
