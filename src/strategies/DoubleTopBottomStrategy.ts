import { BaseStrategy } from '../core/BaseStrategy';
import { Candle, Signal } from '../types/index';

export class DoubleTopBottomStrategy extends BaseStrategy {
  constructor(config: any = {}) {
    super('Double-Top/Bottom Fade', {
      lookback: 50,
      tolerance: 0.01, // 1% deviation allowed
      ...config
    });
  }

  public analyze(candles: Candle[]): Signal {
    if (candles.length < this.config.lookback) return { action: 'WAIT', price: 0, stopLoss: 0, takeProfit: 0, confidence: 0 };

    const current = candles[candles.length - 1];
    const previous = candles.slice(-this.config.lookback, -10); // Look at older candles for potential first tip
    
    // Find Major Peaks/Valleys in history
    const historicalHighs = previous.map(c => c.high);
    const historicalLows = previous.map(c => c.low);
    
    const maxHistHigh = Math.max(...historicalHighs);
    const minHistLow = Math.min(...historicalLows);

    const sma200 = this.getSMA(candles, 200);
    const rsi = this.getRSI(candles, 14);
    const atr = this.getATR(candles, 14);
    const fakeout = this.isFakeoutRisk(candles);

    // Double Top (Fade)
    if (Math.abs(current.high - maxHistHigh) / maxHistHigh < this.config.tolerance) {
        const ratios = this.getWickRatios(current);
        if (ratios.upper > 1.5) { // Confirmation by rejection
            if (fakeout.risk) return { action: 'WAIT', price: 0, stopLoss: 0, takeProfit: 0, confidence: 0 };
            // Confluence
            const nearResistance = this.checkLevelProximity(candles, 'RESISTANCE', 0.005);
            if (!nearResistance) return { action: 'WAIT', price: 0, stopLoss: 0, takeProfit: 0, confidence: 0 };
            if (rsi < 60) return { action: 'WAIT', price: 0, stopLoss: 0, takeProfit: 0, confidence: 0 }; 

            const risk = atr > 0 ? atr * 1.5 : (current.high - current.close) * 2;
            return {
                action: 'SELL',
                price: current.close,
                stopLoss: current.close + risk,
                takeProfit: current.close - (risk * 3),
                confidence: 0.9,
                pattern: 'Double Top Fade',
                setup: `RESISTANCE Test + Double Top (RSI: ${rsi.toFixed(1)})`
            };
        }
    }

    // Double Bottom (Fade)
    if (Math.abs(current.low - minHistLow) / minHistLow < this.config.tolerance) {
        const ratios = this.getWickRatios(current);
        if (ratios.lower > 1.2) { // Confirmation by rejection
            if (fakeout.risk) return { action: 'WAIT', price: 0, stopLoss: 0, takeProfit: 0, confidence: 0 };
            // Confluence
            const nearSupport = this.checkLevelProximity(candles, 'SUPPORT', 0.005);
            if (!nearSupport) return { action: 'WAIT', price: 0, stopLoss: 0, takeProfit: 0, confidence: 0 };
            if (rsi > 40) return { action: 'WAIT', price: 0, stopLoss: 0, takeProfit: 0, confidence: 0 };

            const risk = atr > 0 ? atr * 1.5 : (current.close - current.low) * 2;
            return {
                action: 'BUY',
                price: current.close,
                stopLoss: current.close - risk,
                takeProfit: current.close + (risk * 3),
                confidence: 0.9,
                pattern: 'Double Bottom Fade',
                setup: `SUPPORT Test + Double Bottom (RSI: ${rsi.toFixed(1)})`
            };
        }
    }

    return { action: 'WAIT', price: 0, stopLoss: 0, takeProfit: 0, confidence: 0 };
  }
}
