import { BaseStrategy } from '../core/BaseStrategy';
import { Candle, Signal } from '../types/index';

export class InsideBarStrategy extends BaseStrategy {
  constructor(config: any = {}) {
    super('Inside Bar Breakout', {
      ...config
    });
  }

  public analyze(candles: Candle[]): Signal {
    if (candles.length < 3) return { action: 'WAIT', price: 0, stopLoss: 0, takeProfit: 0, confidence: 0 };

    const motherBar = candles[candles.length - 2];
    const insideBar = candles[candles.length - 1];

    // Check if current bar is inside the previous bar
    const isInside = insideBar.high < motherBar.high && insideBar.low > motherBar.low;

    if (isInside) {
        // We wait for the breakout of the mother bar
        // In a live system, we'd set a pending order
        // For this analyze loop, we detect if the NEXT candle breaks out (simulated in backtester)
        // But here we signal that an Inside Bar setup is active
        return { action: 'WAIT', price: 0, stopLoss: 0, takeProfit: 0, confidence: 0, setup: 'Inside Bar Active' };
    }

    // Logic to detect breakout of the mother bar (if we have 3 candles)
    if (candles.length >= 3) {
        const potentialMother = candles[candles.length - 3];
        const potentialInside = candles[candles.length - 2];
        const current = candles[candles.length - 1];

        if (potentialInside.high < potentialMother.high && potentialInside.low > potentialMother.low) {
            // Bullish Breakout
            if (current.close > potentialMother.high) {
                return {
                    action: 'BUY',
                    price: current.close,
                    stopLoss: potentialMother.low,
                    takeProfit: current.close + (current.close - potentialMother.low) * 1.5,
                    confidence: 0.7,
                    pattern: 'Inside Bar Breakout',
                    setup: 'Bullish breakout of mother bar'
                };
            }
            // Bearish Breakout
            if (current.close < potentialMother.low) {
                return {
                    action: 'SELL',
                    price: current.close,
                    stopLoss: potentialMother.high,
                    takeProfit: current.close - (potentialMother.high - current.close) * 1.5,
                    confidence: 0.7,
                    pattern: 'Inside Bar Breakout',
                    setup: 'Bearish breakout of mother bar'
                };
            }
        }
    }

    return { action: 'WAIT', price: 0, stopLoss: 0, takeProfit: 0, confidence: 0 };
  }
}
