import axios, { Method } from 'axios';
import * as crypto from 'crypto';
import * as fs from 'fs';
import { Candle } from '../types/index';

export class DeltaExchangeService {
  private baseUrl = process.env.DELTA_API_URL || 'https://api.delta.exchange';
  private apiKey = process.env.DELTA_API_KEY || '';
  private apiSecret = process.env.DELTA_API_SECRET || '';

  constructor() {
    // Remove /v2 from baseUrl if present - we'll add it per request
    this.baseUrl = this.baseUrl.replace(/\/v2$/, '');
  }

  /**
   * Fetch top 20 perpetual products by 24h volume
   */
  async getTop20ByVolume(): Promise<string[]> {
    try {
      // Public endpoints - no authentication required
      const tickers = await this.publicRequest('GET', '/v2/tickers');
      const products = await this.publicRequest('GET', '/v2/products', { settle_asset: 'USDT' });

      // Map products for quick lookup
      const productMap = new Map<string, any>(products.map((p: any) => [p.symbol, p]));

      // Filter and Sort by turnover_usd (24h volume in USD)
      const sortedPerps = tickers
        .filter((t: any) => {
          const product = productMap.get(t.symbol);
          return product && product.contract_type === 'perpetual_futures';
        })
        .sort((a: any, b: any) => {
          // Sort by turnover_usd (24h volume in USD) in descending order
          const volumeA = parseFloat(a.turnover_usd || '0');
          const volumeB = parseFloat(b.turnover_usd || '0');
          return volumeB - volumeA;
        })
        .slice(0, 20)
        .map((t: any) => t.symbol);

      return sortedPerps;
    } catch (error: any) {
      console.error('❌ Error fetching top coins from Delta:', error.response?.data || error.message);
      return [];
    }
  }
  
  /**
   * Fetch latest ticker data for a symbol
   */
  async getTicker(symbol: string): Promise<{ markPrice: number; lastPrice: number }> {
    try {
      const tickers = await this.publicRequest('GET', '/v2/tickers', { symbol });
      const ticker = Array.isArray(tickers) ? tickers.find((t: any) => t.symbol === symbol) : tickers;
      
      if (!ticker) {
        throw new Error(`Ticker not found for ${symbol}`);
      }

      return {
        markPrice: parseFloat(ticker.mark_price),
        lastPrice: parseFloat(ticker.last_price)
      };
    } catch (error: any) {
      console.error(`❌ Error fetching ticker for ${symbol}:`, error.response?.data || error.message);
      return { markPrice: 0, lastPrice: 0 };
    }
  }

  /**
   * Fetch historical candles (klines) for a symbol
   */
  async getCandles(symbol: string, resolution: string = '1m', limit: number = 200): Promise<Candle[]> {
    try {
      // Calculate start and end timestamps (Delta requires timestamps in seconds)
      const end = Math.floor(Date.now() / 1000);
      
      // Convert resolution to seconds
      const resolutionInSeconds = this.getResolutionInSeconds(resolution);
      const start = end - (limit * resolutionInSeconds);

      // Public endpoint - no authentication required
      const candles = await this.publicRequest('GET', '/v2/history/candles', {
          symbol,
          resolution,
          start: start.toString(),
          end: end.toString()
      });

      if (!candles) return [];

      return candles.map((c: any) => ({
        timestamp: c.time * 1000, // Convert to ms
        open: parseFloat(c.open),
        high: parseFloat(c.high),
        low: parseFloat(c.low),
        close: parseFloat(c.close),
        volume: parseFloat(c.volume)
      }));
    } catch (error: any) {
      console.error(`❌ Error fetching candles for ${symbol}:`, error.response?.data || error.message);
      return [];
    }
  }

  /**
   * Convert resolution string to seconds
   */
  private getResolutionInSeconds(resolution: string): number {
    const resolutionMap: { [key: string]: number } = {
      '1m': 60,
      '3m': 180,
      '5m': 300,
      '15m': 900,
      '30m': 1800,
      '1h': 3600,
      '2h': 7200,
      '4h': 14400,
      '6h': 21600,
      '1d': 86400,
      '1w': 604800
    };
    return resolutionMap[resolution] || 60; // Default to 1 minute
  }

  /**
   * Public request (no authentication)
   */
  private async publicRequest(method: Method, path: string, params: any = {}) {
    const queryString = Object.keys(params).length > 0 
        ? '?' + new URLSearchParams(params).toString() 
        : '';

    const url = `${this.baseUrl}${path}${queryString}`;

    const headers = {
      'User-Agent': 'node-js-bot',
      'Content-Type': 'application/json'
    };

    const response = await axios({
      method,
      url,
      headers
    });

    return response.data.result;
  }

  /**
   * Signed request (for private endpoints like orders, positions, wallet)
   */
  private async signedRequest(method: Method, path: string, params: any = {}, body: any = null) {
    const timestamp = Math.floor(Date.now() / 1000);
    
    // Build query string
    const queryString = Object.keys(params).length > 0 
        ? '?' + new URLSearchParams(params).toString() 
        : '';
    
    // Signature uses the path WITHOUT the base URL
    // Example: /v2/orders?product_id=1&state=open
    const signaturePath = path + queryString;
    
    // Prepare body data for signature
    const bodyData = !body || Object.keys(body).length === 0 
        ? '' 
        : JSON.stringify(body);
    
    // Build signature payload: METHOD + timestamp + path (with query) + body
    const signaturePayload = method.toUpperCase() + timestamp + signaturePath + bodyData;
    const signature = crypto.createHmac('sha256', this.apiSecret).update(signaturePayload).digest('hex');

    // Debugging (Remove in production)
    fs.appendFileSync('delta_debug.log', `[${timestamp}] Method: ${method.toUpperCase()}\n`);
    fs.appendFileSync('delta_debug.log', `[${timestamp}] Signature Path: ${signaturePath}\n`);
    fs.appendFileSync('delta_debug.log', `[${timestamp}] Body: ${bodyData}\n`);
    fs.appendFileSync('delta_debug.log', `[${timestamp}] Payload: ${signaturePayload}\n`);
    fs.appendFileSync('delta_debug.log', `[${timestamp}] Signature: ${signature}\n\n`);

    const headers: any = {
      'api-key': this.apiKey,
      'signature': signature,
      'timestamp': timestamp.toString(),
      'User-Agent': 'node-js-bot',
      'Content-Type': 'application/json'
    };

    const url = `${this.baseUrl}${path}${queryString}`;

    const response = await axios({
      method,
      url,
      data: body,
      headers
    });

    return response.data.result;
  }
}
