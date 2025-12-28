import { OHLCV, Timeframe } from '../types/market';

export interface ExchangeAdapter {
  name: string;
  fetchCandles(symbol: string, timeframe: Timeframe, limit?: number): Promise<OHLCV[]>;
}
