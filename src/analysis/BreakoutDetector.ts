import { OHLCV } from '../types/market';
import { Zone, BreakoutResult } from '../types/analysis';
import { bodySize, isGreen, isRed, upperShadow, lowerShadow } from './geometry';

export class BreakoutDetector {
  /**
   * Detects breakouts from zones in the provided candles.
   * @param candles Array of OHLCV candles
   * @param zones Array of Support/Resistance Zones
   * @param volumeMultiplier Volume multiplier threshold (default 1.5x average)
   */
  public detectBreakouts(
    candles: OHLCV[],
    zones: Zone[],
    volumeMultiplier: number = 1.5,
  ): BreakoutResult[] {
    const results: BreakoutResult[] = [];
    if (candles.length < 2) return results;

    const lastIndex = candles.length - 1;
    const current = candles[lastIndex];
    // Calculate Volume SMA (e.g. 20 period or length of array)
    const avgVolume = this.calculateAvgVolume(candles, 20);

    for (const zone of zones) {
      if (this.isBullishBreakout(current, zone)) {
        const isHighVolume = current.volume > avgVolume * volumeMultiplier;
        const isFakeout = this.isFakeout(current, 'BULLISH');
        
        results.push({
            zone,
            candleIndex: lastIndex,
            type: 'BULLISH_BREAKOUT',
            confidence: isHighVolume ? 0.9 : 0.5,
            isFakeout
        });
      }

      if (this.isBearishBreakout(current, zone)) {
         const isHighVolume = current.volume > avgVolume * volumeMultiplier;
         const isFakeout = this.isFakeout(current, 'BEARISH');

         results.push({
            zone,
            candleIndex: lastIndex,
            type: 'BEARISH_BREAKOUT',
            confidence: isHighVolume ? 0.9 : 0.5,
            isFakeout
         });
      }
    }

    return results;
  }

  private isBullishBreakout(c: OHLCV, zone: Zone): boolean {
    // Basic Rule: Close must be above the zone max
    // Also ensuring it's a green candle adds strictness
    return c.close > zone.max && isGreen(c);
  }

  private isBearishBreakout(c: OHLCV, zone: Zone): boolean {
    // Basic Rule: Close must be below the zone min
    return c.close < zone.min && isRed(c);
  }

  private isFakeout(c: OHLCV, type: 'BULLISH' | 'BEARISH'): boolean {
    const body = bodySize(c);
    
    // Bullish Breakout but long upper wick (rejection) -> Likely Fakeout
    if (type === 'BULLISH') {
        const upper = upperShadow(c);
        // If upper shadow is significantly larger than body (e.g. Shooting Star shape)
        if (upper > body * 1.5) return true;
    }

    // Bearish Breakout but long lower wick (rejection) -> Likely Fakeout
    if (type === 'BEARISH') {
        const lower = lowerShadow(c);
        if (lower > body * 1.5) return true;
    }

    return false;
  }

  private calculateAvgVolume(candles: OHLCV[], period: number): number {
    const slice = candles.slice(-period); // Get last N
    if (slice.length === 0) return 0;
    const sum = slice.reduce((acc, c) => acc + c.volume, 0);
    return sum / slice.length;
  }
}
