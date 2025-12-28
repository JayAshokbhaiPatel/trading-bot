import { ExchangeAdapter } from '../ExchangeAdapter';
import { OHLCV, Timeframe } from '../../types/market';
import { logger } from '../../utils/logger';
import { DeltaApiClient } from '../../client/DeltaApiClient';

export class DeltaAdapter implements ExchangeAdapter {
  public name = 'Delta';
  private client: DeltaApiClient;

  constructor() {
    this.client = new DeltaApiClient();
  }

  public async fetchCandles(
    symbol: string,
    timeframe: Timeframe,
    limit: number = 100,
  ): Promise<OHLCV[]> {
    try {
      // Calculate start/end
      const resolutionSeconds = this.getResolutionInSeconds(timeframe);
      const endTime = Math.floor(Date.now() / 1000);
      const startTime = endTime - (limit * resolutionSeconds);

      // Path: /v2/history/candles
      const path = '/v2/history/candles';
      const params = {
          symbol: symbol.toUpperCase(),
          resolution: timeframe,
          start: startTime,
          end: endTime
      };

      // Fetch public data (auth=true per user request)
      const result: any[] = await this.client.get(path, params, true);

      // Delta returns array of objects with time, open, high, low, close, volume
      const candles = result.map((c: any) => ({
        timestamp: c.time * 1000,
        open: parseFloat(c.open),
        high: parseFloat(c.high),
        low: parseFloat(c.low),
        close: parseFloat(c.close),
        volume: parseFloat(c.volume),
      }));

      return candles.sort((a, b) => a.timestamp - b.timestamp);

    } catch (error: any) {
      if (error.response) {
          logger.error({ 
              status: error.response.status, 
              data: error.response.data, 
              symbol 
          }, 'Delta API Error Fetching Candles');
      } else {
          logger.error({ error: error.message || error, symbol }, 'Error fetching candles from Delta');
      }
      return [];
    }
  }

  private getResolutionInSeconds(timeframe: Timeframe): number {
      const unit = timeframe.slice(-1);
      const value = parseInt(timeframe.slice(0, -1));
      switch(unit) {
          case 'm': return value * 60;
          case 'h': return value * 3600;
          case 'd': return value * 86400;
          case 'w': return value * 604800;
          default: return 60;
      }
  }
}
