import { logger } from '../utils/logger';
import { DeltaApiClient } from '../client/DeltaApiClient';
import { STABLECOINS } from '../config/constants';

interface CoinConfig {
  refreshInterval: number; // ms
  topN: number;
}

interface DeltaTicker {
  symbol: string;
  contract_type: string;
  turnover_usd: number; // 24h Volume
}

export class CoinSelector {
  private coins: string[] = [];
  private intervalId: NodeJS.Timeout | null = null;
  private readonly config: CoinConfig;
  private isRunning: boolean = false;
  private client: DeltaApiClient;

  constructor(config: CoinConfig = { refreshInterval: 60000, topN: 20 }) {
    this.config = config;
    this.client = new DeltaApiClient();
  }

  public async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('CoinSelector is already running');
      return;
    }

    this.isRunning = true;
    logger.info(`Starting CoinSelector (Delta Tickers Volume Based)...`);
    await this.refresh();

    this.intervalId = setInterval(() => {
      this.refresh().catch((err) => {
        logger.error(err, 'Error in CoinSelector refresh loop');
      });
    }, this.config.refreshInterval);
  }

  public stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    logger.info('Stopped CoinSelector');
  }

  public getSelectedCoins(): string[] {
    return [...this.coins];
  }

  private async refresh(retryCount = 0): Promise<void> {
    try {
      logger.debug('Fetching tickers from Delta...');
      const tickers = await this.fetchTickers();
      const filtered = this.processTickers(tickers);
      
      this.coins = filtered;
      logger.info(
        { count: this.coins.length, top5: this.coins.slice(0, 5) },
        'Coin selection updated (Volume Based)',
      );
    } catch (error) {
      const maxRetries = 3;
      if (retryCount < maxRetries) {
        const delay = 2000 * (retryCount + 1);
        logger.warn(
          { retryCount: retryCount + 1, delay },
          'Failed to fetch tickers, retrying...',
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.refresh(retryCount + 1);
      }
      logger.error(error, 'Failed to update coin selection after retries');
    }
  }

  private async fetchTickers(): Promise<DeltaTicker[]> {
    // /v2/tickers
    return this.client.get<DeltaTicker[]>('/v2/tickers', {}, false);
  }

  private processTickers(tickers: DeltaTicker[]): string[] {
    return tickers
      .filter(t => {
          // 1. Must be perpetual futures
          if (t.contract_type !== 'perpetual_futures') return false;
          
          // 2. Exclude Stablecoins
          // Check if the filtered symbol (base asset) is in STABLECOINS?
          // Delta symbols: BTCUSD, ETHUSD, USDTUSD?
          // We can try to guess base asset or just exclude known stable pairs.
          // Common stablecoins in constants: usdt, usdc, etc.
          // If symbol starts with 'USDT' (like USDTUSD), exclude it.
          // Or if symbol is exactly a stablecoin pair.
          
          const symbolLower = t.symbol.toLowerCase();
          
          // Check if it starts with any stablecoin
          for (const stable of STABLECOINS) {
              if (symbolLower.startsWith(stable)) return false;
          }
          
          return true;
      })
      .sort((a, b) => (b.turnover_usd || 0) - (a.turnover_usd || 0)) // Sort by Volume High -> Low
      .map(t => t.symbol)
      .slice(0, this.config.topN); 
  }
}
