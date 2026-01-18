import { Candle } from '../types/index';

export interface VolumeMetrics {
  currentVolume: number;
  avgVolume: number;
  volumeRatio: number;
  category: 'VERY_HIGH' | 'HIGH' | 'NORMAL' | 'LOW' | 'VERY_LOW';
  trend: 'INCREASING' | 'DECREASING' | 'NEUTRAL';
  obv: { value: number; signal: 'BULLISH' | 'BEARISH' };
  mfi: number;
  vwap: number;
}

export class VolumeUtils {
  /**
   * Calculates comprehensive volume metrics
   */
  public static analyzeVolume(candles: Candle[], period: number = 20): VolumeMetrics {
    const recent = candles.slice(-period);
    const currentVolume = recent[recent.length - 1].volume;
    const avgVolume = recent.reduce((sum, c) => sum + c.volume, 0) / period;
    const volumeRatio = currentVolume / avgVolume;

    const category = this.categorize(volumeRatio);
    const trend = this.detectTrend(recent);
    const obv = this.calculateOBV(candles);
    const mfi = this.calculateMFI(candles);
    const vwap = this.calculateVWAP(recent);

    return {
      currentVolume,
      avgVolume,
      volumeRatio,
      category,
      trend,
      obv,
      mfi,
      vwap
    };
  }

  private static categorize(ratio: number): 'VERY_HIGH' | 'HIGH' | 'NORMAL' | 'LOW' | 'VERY_LOW' {
    if (ratio > 1.5) return 'VERY_HIGH';
    if (ratio > 1.2) return 'HIGH';
    if (ratio > 0.8) return 'NORMAL';
    if (ratio > 0.5) return 'LOW';
    return 'VERY_LOW';
  }

  private static detectTrend(candles: Candle[]): 'INCREASING' | 'DECREASING' | 'NEUTRAL' {
    const recent = candles[candles.length - 1].volume;
    const prev = candles[candles.length - 2]?.volume || recent;
    const avg = candles.slice(-5).reduce((s, c) => s + c.volume, 0) / 5;

    if (recent > prev && recent > avg) return 'INCREASING';
    if (recent < prev && recent < avg) return 'DECREASING';
    return 'NEUTRAL';
  }

  private static calculateOBV(candles: Candle[]): { value: number; signal: 'BULLISH' | 'BEARISH' } {
    let obv = 0;
    for (let i = 1; i < candles.length; i++) {
      if (candles[i].close > candles[i - 1].close) {
        obv += candles[i].volume;
      } else if (candles[i].close < candles[i - 1].close) {
        obv -= candles[i].volume;
      }
    }
    return { value: obv, signal: obv >= 0 ? 'BULLISH' : 'BEARISH' };
  }

  private static calculateMFI(candles: Candle[], period: number = 14): number {
    if (candles.length < period + 1) return 50;

    const typicalPrices = candles.map(c => (c.high + c.low + c.close) / 3);
    const moneyFlows = candles.map((c, i) => typicalPrices[i] * c.volume);

    let positiveFlow = 0;
    let negativeFlow = 0;

    for (let i = candles.length - period; i < candles.length; i++) {
      if (typicalPrices[i] > typicalPrices[i - 1]) {
        positiveFlow += moneyFlows[i];
      } else {
        negativeFlow += moneyFlows[i];
      }
    }

    const ratio = positiveFlow / (negativeFlow || 1);
    return 100 - (100 / (1 + ratio));
  }

  private static calculateVWAP(candles: Candle[]): number {
    let cumulativeVP = 0;
    let cumulativeV = 0;

    for (const candle of candles) {
      const tp = (candle.high + candle.low + candle.close) / 3;
      cumulativeVP += tp * candle.volume;
      cumulativeV += candle.volume;
    }

    return cumulativeVP / (cumulativeV || 1);
  }

  public static checkConfirmation(candles: Candle[]): { signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL'; confidence: number } {
    if (candles.length < 2) return { signal: 'NEUTRAL', confidence: 0 };

    const current = candles[candles.length - 1];
    const prev = candles[candles.length - 2];
    const metrics = this.analyzeVolume(candles, 20);

    const priceMove = current.close > prev.close ? 'UP' : 'DOWN';
    const confirmed = metrics.volumeRatio > 1.2;

    if (confirmed) {
      return {
        signal: priceMove === 'UP' ? 'BULLISH' : 'BEARISH',
        confidence: Math.min(metrics.volumeRatio / 2, 1)
      };
    }

    return { signal: 'NEUTRAL', confidence: 0.3 };
  }
}
