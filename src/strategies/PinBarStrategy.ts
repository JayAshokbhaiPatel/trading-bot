import { BaseStrategy } from '../core/BaseStrategy';
import { Candle, Signal } from '../types/index';

export class PinBarStrategy extends BaseStrategy {
  constructor(config: any = {}) {
    super('Pin Bar Rejection', {
      minWickRatio: 1.5, // Loosened from 2.0
      minBodyRatio: 0.3,
      ...config
    });
  }

  public analyze(candles: Candle[]): Signal {
    if (candles.length < 2) return { action: 'WAIT', price: 0, stopLoss: 0, takeProfit: 0, confidence: 0 };
    
    const current = candles[candles.length - 1];
    const ratios = this.getWickRatios(current);
    const trend = this.getTrend(candles, 10);
    const sma200 = this.getSMA(candles, 200);
    const rsi = this.getRSI(candles, 14);
    const atr = this.getATR(candles, 14);
    
    const fakeout = this.isFakeoutRisk(candles);
    
    // Bullish Pin Bar (Long wick at bottom)
    if (ratios.lower > this.config.minWickRatio && ratios.upper < 0.5) {
      if (fakeout.risk) return { action: 'WAIT', price: 0, stopLoss: 0, takeProfit: 0, confidence: 0 };
      // Confluence: Near Support + RSI Neutral/Low
      const nearSupport = this.checkLevelProximity(candles, 'SUPPORT', 0.005);
      if (!nearSupport) return { action: 'WAIT', price: 0, stopLoss: 0, takeProfit: 0, confidence: 0 };
      if (rsi > 60) return { action: 'WAIT', price: 0, stopLoss: 0, takeProfit: 0, confidence: 0 }; 

      const risk = atr > 0 ? atr * 3.0 : (current.high - current.low) * 2;
      return {
        action: 'BUY',
        price: current.close,
        stopLoss: current.close - risk,
        takeProfit: current.close + (risk * 3.0), 
        confidence: 0.9, 
        pattern: 'Bullish Pin Bar',
        setup: `H1 Support Rejection (RSI: ${rsi.toFixed(1)})`
      };
    }

    // Bearish Pin Bar (Long wick at top)
    if (ratios.upper > this.config.minWickRatio && ratios.lower < 0.5) {
      // Confluence: Near Resistance + RSI Neutral/High
      const nearResistance = this.checkLevelProximity(candles, 'RESISTANCE', 0.005);
      if (!nearResistance) return { action: 'WAIT', price: 0, stopLoss: 0, takeProfit: 0, confidence: 0 };
      if (rsi < 40) return { action: 'WAIT', price: 0, stopLoss: 0, takeProfit: 0, confidence: 0 }; 

      const risk = atr > 0 ? atr * 3.0 : (current.high - current.low) * 2;
      return {
        action: 'SELL',
        price: current.close,
        stopLoss: current.close + risk,
        takeProfit: current.close - (risk * 3.0),
        confidence: 0.9,
        pattern: 'Bearish Pin Bar',
        setup: `H1 Resistance Rejection (RSI: ${rsi.toFixed(1)})`
      };
    }

    return { action: 'WAIT', price: 0, stopLoss: 0, takeProfit: 0, confidence: 0 };
  }
}
