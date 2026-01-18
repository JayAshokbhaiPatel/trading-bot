import { BaseStrategy } from '../core/BaseStrategy';
import { Candle, Signal } from '../types/index';

export class BreakoutRetestStrategy extends BaseStrategy {
  private resistanceLevel: number | null = null;
  private supportLevel: number | null = null;
  private breakoutOccurred = false;

  constructor(config: any = {}) {
    super('Breakout-Retest System', config);
  }

  public analyze(candles: Candle[]): Signal {
    if (candles.length < 30) return { action: 'WAIT', price: 0, stopLoss: 0, takeProfit: 0, confidence: 0 };

    const recent = candles.slice(-20);
    const highs = recent.map(c => c.high);
    const lows = recent.map(c => c.low);
    
    const currentResistance = Math.max(...highs);
    const currentSupport = Math.min(...lows);
    const currentPrice = candles[candles.length - 1].close;

    // 1. Detect Breakout
    if (!this.breakoutOccurred) {
      if (currentPrice > currentResistance) {
        this.breakoutOccurred = true;
        this.resistanceLevel = currentResistance;
        return { action: 'WAIT', price: 0, stopLoss: 0, takeProfit: 0, confidence: 0 };
      }
      if (currentPrice < currentSupport) {
        this.breakoutOccurred = true;
        this.supportLevel = currentSupport;
        return { action: 'WAIT', price: 0, stopLoss: 0, takeProfit: 0, confidence: 0 };
      }
    }

    // 2. Detect Retest
    if (this.breakoutOccurred) {
      // Bullish Retest (Price touches old resistance now acting as support)
      if (this.resistanceLevel && Math.abs(currentPrice - this.resistanceLevel) / this.resistanceLevel < 0.01) { // Loosened from 0.002
        this.breakoutOccurred = false; // Reset
        return {
          action: 'BUY',
          price: currentPrice,
          stopLoss: currentPrice * 0.99,
          takeProfit: currentPrice * 1.03,
          confidence: 0.85,
          pattern: 'Breakout-Retest (Bullish)',
          setup: 'Old resistance becomes support'
        };
      }

      // Bearish Retest (Price touches old support now acting as resistance)
      if (this.supportLevel && Math.abs(currentPrice - this.supportLevel) / this.supportLevel < 0.01) { // Loosened from 0.002
        this.breakoutOccurred = false; // Reset
        return {
          action: 'SELL',
          price: currentPrice,
          stopLoss: currentPrice * 1.01,
          takeProfit: currentPrice * 0.97,
          confidence: 0.85,
          pattern: 'Breakout-Retest (Bearish)',
          setup: 'Old support becomes resistance'
        };
      }
      
      // Reset if price moves too far without retest
      if (this.resistanceLevel && currentPrice > this.resistanceLevel * 1.05) this.breakoutOccurred = false;
      if (this.supportLevel && currentPrice < this.supportLevel * 0.95) this.breakoutOccurred = false;
    }

    return { action: 'WAIT', price: 0, stopLoss: 0, takeProfit: 0, confidence: 0 };
  }
}
