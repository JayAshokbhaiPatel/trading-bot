import { OHLCV } from '../types/market';
import { Zone } from '../types/analysis';

export class ZoneDetector {
  /**
   * Detects support and resistance zones using multiple methods.
   * @param candles Array of OHLCV candles
   * @param windowSize Window for swing points
   * @param thresholdPct Threshold for clustering
   */
  public detectZones(
    candles: OHLCV[],
    windowSize: number = 5,
    thresholdPct: number = 0.005, // Tightened from 0.01 to 0.005 as per snippet tolerance
  ): Zone[] {
    if (candles.length < windowSize * 2 + 1) return [];

    // Method 1: Swing Highs/Lows
    const swingHighs = this.getSwingHighs(candles, windowSize);
    const swingLows = this.getSwingLows(candles, windowSize);

    // Method 2: Pivot Points
    const pivotLevels = this.calculatePivotPoints(candles);

    // Method 3: Donchian Channels (Support/Resistance)
    const donchianLevels = this.calculateDonchianLevels(candles, 20); // Default 20 from snippet

    // Combine all levels
    const allLevels = [
      ...swingHighs, 
      ...swingLows, 
      ...pivotLevels, 
      ...donchianLevels
    ].sort((a, b) => a - b);

    // Cluster levels into zones
    return this.clusterLevels(allLevels, thresholdPct);
  }

  private getSwingHighs(candles: OHLCV[], window: number): number[] {
    const swings: number[] = [];
    for (let i = window; i < candles.length - window; i++) {
        const currentHigh = candles[i].high;
        let isSwing = true;
        for (let j = 1; j <= window; j++) {
            if (candles[i - j].high > currentHigh || candles[i + j].high > currentHigh) {
                isSwing = false;
                break;
            }
        }
        if (isSwing) swings.push(currentHigh);
    }
    return swings;
  }

  private getSwingLows(candles: OHLCV[], window: number): number[] {
    const swings: number[] = [];
    for (let i = window; i < candles.length - window; i++) {
        const currentLow = candles[i].low;
        let isSwing = true;
        for (let j = 1; j <= window; j++) {
            if (candles[i - j].low < currentLow || candles[i + j].low < currentLow) {
                isSwing = false;
                break;
            }
        }
        if (isSwing) swings.push(currentLow);
    }
    return swings;
  }

  private calculatePivotPoints(candles: OHLCV[]): number[] {
    if (candles.length === 0) return [];
    const last = candles[candles.length - 1];
    const pivot = (last.high + last.low + last.close) / 3;

    const r1 = (2 * pivot) - last.low;
    const r2 = pivot + (last.high - last.low);
    const s1 = (2 * pivot) - last.high;
    const s2 = pivot - (last.high - last.low);
    
    return [s2, s1, r1, r2];
  }

  private calculateDonchianLevels(candles: OHLCV[], period: number): number[] {
    if (candles.length < period) return [];
    
    const recentCandles = candles.slice(-period);
    const highs = recentCandles.map(c => c.high);
    const lows = recentCandles.map(c => c.low);

    return [Math.max(...highs), Math.min(...lows)];
  }

  private clusterLevels(levels: number[], thresholdPct: number): Zone[] {
    if (levels.length === 0) return [];

    const zones: Zone[] = [];
    let currentCluster: number[] = [levels[0]];

    for (let i = 1; i < levels.length; i++) {
      const price = levels[i];
      const clusterMean = currentCluster.reduce((a, b) => a + b, 0) / currentCluster.length;
      
      // If price is within threshold of the cluster average, add to cluster
      if (Math.abs(price - clusterMean) / clusterMean <= thresholdPct) {
        currentCluster.push(price);
      } else {
        zones.push(this.createZoneFromCluster(currentCluster));
        currentCluster = [price];
      }
    }
    
    if (currentCluster.length > 0) {
        zones.push(this.createZoneFromCluster(currentCluster));
    }

    // Filter weak zones (single point of data) unless it's a very fresh pivot
    return zones;
  }

  private createZoneFromCluster(cluster: number[]): Zone {
    const min = Math.min(...cluster);
    const max = Math.max(...cluster);
    const mean = cluster.reduce((a, b) => a + b, 0) / cluster.length;
    
    return {
        min,
        max,
        center: mean,
        strength: cluster.length, // Rough proxy for strength (confluence of methods)
        type: 'BOTH'
    };
  }
}
