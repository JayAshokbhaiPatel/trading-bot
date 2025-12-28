import { ExchangeAdapter } from './ExchangeAdapter';
import { DeltaAdapter } from './exchanges/DeltaAdapter';
import { OHLCV, Timeframe } from '../types/market';
import { logger } from '../utils/logger';

export class MarketDataEngine {
  private adapter: ExchangeAdapter;
  private cache: Map<string, { data: OHLCV[]; timestamp: number }>;
  private readonly CACHE_TTL = 10000; // 10 seconds default for forming candles

  constructor() {
    this.adapter = new DeltaAdapter();
    this.cache = new Map();
  }

  public async getCandles(
    symbol: string,
    timeframe: Timeframe,
    limit: number = 100,
  ): Promise<OHLCV[]> {
    const key = `${this.adapter.name}:${symbol}:${timeframe}:${limit}`;
    const cached = this.cache.get(key);
    const now = Date.now();

    if (cached && now - cached.timestamp < this.CACHE_TTL) {
      logger.debug({ symbol, timeframe }, 'Returning cached market data');
      return cached.data;
    }

    try {
      const data = await this.adapter.fetchCandles(symbol, timeframe, limit);
      this.cache.set(key, { data, timestamp: now });
      return data;
    } catch (error) {
      logger.error({ error, symbol, timeframe }, 'Error parsing market data');
      throw error;
    }
  }
}
