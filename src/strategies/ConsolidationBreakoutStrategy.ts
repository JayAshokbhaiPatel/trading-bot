import { BaseStrategy } from '../core/BaseStrategy';
import { Candle, Signal } from '../types/index';

export class ConsolidationBreakoutStrategy extends BaseStrategy {
  constructor(config: any = {}) {
    super('Consolidation Breakout', {
      consolidationPeriod: 10,
      rangeThreshold: 0.015, // 1.5%
      ...config
    });
  }

  public analyze(candles: Candle[]): Signal {
    const period = this.config.consolidationPeriod;
    if (candles.length < period + 1) return { action: 'WAIT', price: 0, stopLoss: 0, takeProfit: 0, confidence: 0 };

    const previousCandles = candles.slice(-(period + 1), -1);
    const current = candles[candles.length - 1];

    const isPlat = this.isConsolidating(previousCandles, period);
    
    if (isPlat) {
      const highs = previousCandles.map(c => c.high);
      const lows = previousCandles.map(c => c.low);
      const upperRange = Math.max(...highs);
      const lowerRange = Math.min(...lows);

      // Bullish Breakout
      if (current.close > upperRange) {
        return {
          action: 'BUY',
          price: current.close,
          stopLoss: lowerRange,
          takeProfit: current.close + (current.close - lowerRange) * 2,
          confidence: 0.75,
          pattern: 'Consolidation Breakout',
          setup: 'Breaking out of range with volume confirmation'
        };
      }

      // Bearish Breakout
      if (current.close < lowerRange) {
        return {
          action: 'SELL',
          price: current.close,
          stopLoss: upperRange,
          takeProfit: current.close - (upperRange - current.close) * 2,
          confidence: 0.75,
          pattern: 'Consolidation Breakout',
          setup: 'Breaking down from range with volume confirmation'
        };
      }
    }

    return { action: 'WAIT', price: 0, stopLoss: 0, takeProfit: 0, confidence: 0 };
  }
}
