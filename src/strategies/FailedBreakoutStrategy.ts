import { BaseStrategy } from '../core/BaseStrategy';
import { Candle, Signal } from '../types/index';

export class FailedBreakoutStrategy extends BaseStrategy {
  constructor(config: any = {}) {
    super('Failed Breakout (Stop Hunt)', {
      lookback: 20,
      springThreshold: 0.003, // 0.3%
      ...config
    });
  }

  public analyze(candles: Candle[]): Signal {
    if (candles.length < 30) return { action: 'WAIT', price: 0, stopLoss: 0, takeProfit: 0, confidence: 0 };

    const recent = candles.slice(-this.config.lookback, -1);
    const current = candles[candles.length - 1];
    
    const rangeHigh = Math.max(...recent.map(c => c.high));
    const rangeLow = Math.min(...recent.map(c => c.low));

    // Support Failure (Spring / Bullish Trapped)
    // Price dips below rangeLow and then closes back inside with a rejection wick
    if (current.low < rangeLow && current.close > rangeLow) {
        const ratios = this.getWickRatios(current);
        if (ratios.lower > 1.5) { 
            return {
                action: 'BUY',
                price: current.close,
                stopLoss: current.low * 0.999,
                takeProfit: current.close + (rangeHigh - current.close),
                confidence: 0.9,
                pattern: 'Failed Breakout (Spring)',
                setup: 'Liquidity grab below support'
            };
        }
    }

    // Resistance Failure (Upthrust / Bearish Trapped)
    // Price spikes above rangeHigh and then closes back inside with a rejection wick
    if (current.high > rangeHigh && current.close < rangeHigh) {
        const ratios = this.getWickRatios(current);
        if (ratios.upper > 1.5) {
            return {
                action: 'SELL',
                price: current.close,
                stopLoss: current.high * 1.001,
                takeProfit: current.close - (current.close - rangeLow),
                confidence: 0.9,
                pattern: 'Failed Breakout (Upthrust)',
                setup: 'Liquidity grab above resistance'
            };
        }
    }

    return { action: 'WAIT', price: 0, stopLoss: 0, takeProfit: 0, confidence: 0 };
  }
}
