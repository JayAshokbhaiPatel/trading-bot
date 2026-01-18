import { Candle } from '../types/index';

export interface CandlestickPattern {
  name: string;
  type: 'reversal' | 'continuation';
  signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  confidence: number;
  description: string;
}

export class CandlestickUtils {
  /**
   * Identifies all candlestick patterns in the given data
   */
  public static identifyPatterns(candles: Candle[]): CandlestickPattern[] {
    const patterns: CandlestickPattern[] = [];
    if (candles.length < 3) return patterns;

    const last = candles[candles.length - 1];
    const prev = candles[candles.length - 2];

    // Single Candle Patterns
    patterns.push(...this.detectSingleCandle(last));

    // Two Candle Patterns
    patterns.push(...this.detectTwoCandle(prev, last));

    // Multi Candle Patterns
    patterns.push(...this.detectMultiCandle(candles));

    return patterns.sort((a, b) => b.confidence - a.confidence);
  }

  private static detectSingleCandle(candle: Candle): CandlestickPattern[] {
    const patterns: CandlestickPattern[] = [];
    const bodySize = Math.abs(candle.close - candle.open);
    const range = candle.high - candle.low || 0.0001;
    const bodyPercent = bodySize / range;
    const upperWick = (candle.high - Math.max(candle.open, candle.close)) / range;
    const lowerWick = (Math.min(candle.open, candle.close) - candle.low) / range;

    // Doji
    if (bodyPercent < 0.1 && upperWick > 0.4 && lowerWick > 0.4) {
      patterns.push({
        name: 'DOJI',
        type: 'reversal',
        signal: 'NEUTRAL',
        confidence: 0.85,
        description: 'Indecision pattern - reversal likely'
      });
    }

    // Hammer
    if (bodyPercent < 0.4 && lowerWick > 0.6 && upperWick < 0.1) {
      patterns.push({
        name: 'HAMMER',
        type: 'reversal',
        signal: candle.close > candle.open ? 'BULLISH' : 'BEARISH',
        confidence: 0.75,
        description: 'Rejection of lower prices'
      });
    }

    // Shooting Star
    if (bodyPercent < 0.3 && upperWick > 0.7 && candle.close < candle.open) {
      patterns.push({
        name: 'SHOOTING_STAR',
        type: 'reversal',
        signal: 'BEARISH',
        confidence: 0.80,
        description: 'Strong bearish reversal signal'
      });
    }

    // Marubozu
    if (upperWick < 0.05 && lowerWick < 0.05 && bodyPercent > 0.9) {
      patterns.push({
        name: 'MARUBOZU',
        type: 'continuation',
        signal: candle.close > candle.open ? 'BULLISH' : 'BEARISH',
        confidence: 0.85,
        description: 'Strong trend continuation'
      });
    }

    return patterns;
  }

  private static detectTwoCandle(prev: Candle, curr: Candle): CandlestickPattern[] {
    const patterns: CandlestickPattern[] = [];

    // Engulfing
    if (curr.close > prev.open && curr.open < prev.close && curr.close > curr.open) {
      patterns.push({
        name: 'BULLISH_ENGULFING',
        type: 'reversal',
        signal: 'BULLISH',
        confidence: 0.82,
        description: 'Bullish reversal - engulfs previous candle'
      });
    } else if (curr.open > prev.close && curr.close < prev.open && curr.close < curr.open) {
      patterns.push({
        name: 'BEARISH_ENGULFING',
        type: 'reversal',
        signal: 'BEARISH',
        confidence: 0.82,
        description: 'Bearish reversal - engulfs previous candle'
      });
    }

    // Harami (Inside Bar)
    if (curr.high < prev.high && curr.low > prev.low) {
      patterns.push({
        name: 'HARAMI',
        type: 'reversal',
        signal: 'NEUTRAL',
        confidence: 0.65,
        description: 'Indecision - potential reversal'
      });
    }

    return patterns;
  }

  private static detectMultiCandle(candles: Candle[]): CandlestickPattern[] {
    const patterns: CandlestickPattern[] = [];
    const len = candles.length;
    const c1 = candles[len - 3];
    const c2 = candles[len - 2];
    const c3 = candles[len - 1];

    // Morning Star
    if (c1.close < c1.open && c2.close > c2.open && c3.close > c3.open && c3.close > (c1.open + c1.close) / 2) {
      patterns.push({
        name: 'MORNING_STAR',
        type: 'reversal',
        signal: 'BULLISH',
        confidence: 0.85,
        description: 'Strong bullish reversal after downtrend'
      });
    }

    // Evening Star
    if (c1.close > c1.open && c2.close < c2.open && c3.close < c3.open && c3.close < (c1.open + c1.close) / 2) {
      patterns.push({
        name: 'EVENING_STAR',
        type: 'reversal',
        signal: 'BEARISH',
        confidence: 0.85,
        description: 'Strong bearish reversal after uptrend'
      });
    }

    return patterns;
  }
}
