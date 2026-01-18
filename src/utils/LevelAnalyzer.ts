import { Candle } from '../types/index';

export interface Level {
  price: number;
  strength: number;
  method: string;
}

export class LevelAnalyzer {
  /**
   * Identifies key support and resistance levels using multiple methods.
   */
  public static findLevels(candles: Candle[], lookback: number = 50): { support: number[], resistance: number[] } {
    if (candles.length < 20) return { support: [], resistance: [] };

    const recent = candles.slice(-lookback);
    const levels: Level[] = [];

    // Method 1: Pivot Points (Already exists as getPivots, enhanced here)
    levels.push(...this.getPivots(recent));

    // Method 2: Swing Extrema
    levels.push(...this.getSwingExtrema(recent));

    // Method 3: Donchian Channels
    levels.push(...this.getDonchianLevels(recent));

    const currentPrice = candles[candles.length - 1].close;
    const consolidated = this.consolidate(levels);

    const support = consolidated
      .filter(l => l.price < currentPrice)
      .sort((a, b) => b.price - a.price)
      .slice(0, 3)
      .map(l => l.price);

    const resistance = consolidated
      .filter(l => l.price > currentPrice)
      .sort((a, b) => a.price - b.price)
      .slice(0, 3)
      .map(l => l.price);

    return { support, resistance };
  }

  private static getPivots(candles: Candle[]): Level[] {
    const levels: Level[] = [];
    const window = 3;

    for (let i = window; i < candles.length - window; i++) {
        const current = candles[i];
        const left = candles.slice(i - window, i);
        const right = candles.slice(i + 1, i + window + 1);

        if (left.every(c => c.high <= current.high) && right.every(c => c.high <= current.high)) {
            levels.push({ price: current.high, strength: 0.8, method: 'Pivot Resistance' });
        }

        if (left.every(c => c.low >= current.low) && right.every(c => c.low >= current.low)) {
            levels.push({ price: current.low, strength: 0.8, method: 'Pivot Support' });
        }
    }
    return levels;
  }

  private static getSwingExtrema(candles: Candle[], lookback: number = 3): Level[] {
    const levels: Level[] = [];
    for (let i = lookback; i < candles.length - lookback; i++) {
      const current = candles[i];
      let isHigh = true;
      let isLow = true;

      for (let j = i - lookback; j <= i + lookback; j++) {
        if (j !== i) {
          if (candles[j].high > current.high) isHigh = false;
          if (candles[j].low < current.low) isLow = false;
        }
      }

      if (isHigh) levels.push({ price: current.high, strength: 0.75, method: 'Swing High' });
      if (isLow) levels.push({ price: current.low, strength: 0.75, method: 'Swing Low' });
    }
    return levels;
  }

  private static getDonchianLevels(candles: Candle[]): Level[] {
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);
    return [
      { price: Math.max(...highs), strength: 0.7, method: 'Donchian High' },
      { price: Math.min(...lows), strength: 0.7, method: 'Donchian Low' }
    ];
  }

  private static consolidate(levels: Level[], tolerance: number = 0.005): { price: number; strength: number }[] {
    if (levels.length === 0) return [];

    const grouped: { price: number; strength: number; count: number }[] = [];
    const sorted = [...levels].sort((a, b) => a.price - b.price);

    for (const level of sorted) {
      const existing = grouped.find(g => Math.abs(g.price - level.price) / level.price < tolerance);
      if (existing) {
        existing.price = (existing.price * existing.count + level.price) / (existing.count + 1);
        existing.strength = Math.max(existing.strength, level.strength);
        existing.count++;
      } else {
        grouped.push({ price: level.price, strength: level.strength, count: 1 });
      }
    }

    return grouped.map(g => ({
      price: g.price,
      strength: g.strength * (1 + (g.count - 1) * 0.1) // Slightly boost strength for recurring levels
    }));
  }
}
