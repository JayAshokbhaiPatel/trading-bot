import { BaseStrategy } from '../core/BaseStrategy';
import { Candle, Signal } from '../types/index';

export class TrendContinuationStrategy extends BaseStrategy {
  constructor(config: any = {}) {
    super('Trend Continuation Pattern', {
      emaPeriod: 20,
      pullbackTolerance: 0.005, // 0.5%
      ...config
    });
  }

  public analyze(candles: Candle[]): Signal {
    if (candles.length < 30) return { action: 'WAIT', price: 0, stopLoss: 0, takeProfit: 0, confidence: 0 };

    const current = candles[candles.length - 1];
    const trend = this.getTrend(candles, 10); 
    const sma200 = this.getSMA(candles, 200);
    const rsi = this.getRSI(candles, 14);
    const atr = this.getATR(candles, 14);
    const fakeout = this.isFakeoutRisk(candles);

    // Bullish Trend Continuation (Pullback to Support in Uptrend)
    if (current.close > sma200 && trend === 'UP') {
        const nearSupport = this.checkLevelProximity(candles, 'SUPPORT', 0.01); 
        if (nearSupport && rsi < 50) { // Deep enough pullback
            if (fakeout.risk) return { action: 'WAIT', price: 0, stopLoss: 0, takeProfit: 0, confidence: 0 };
            const risk = atr > 0 ? atr * 2.5 : current.close * 0.01;
            return {
                action: 'BUY',
                price: current.close,
                stopLoss: current.close - risk,
                takeProfit: current.close + (risk * 3),
                confidence: 0.85,
                pattern: 'Trend Continuation (Pullback)',
                setup: `Pullback near support in an UPTREND (RSI: ${rsi.toFixed(1)})`
            };
        }
    }

    // Bearish Trend Continuation (Pullback to Resistance in Downtrend)
    if (current.close < sma200 && trend === 'DOWN') {
        const nearResistance = this.checkLevelProximity(candles, 'RESISTANCE', 0.01);
        if (nearResistance && rsi > 50) { 
            if (fakeout.risk) return { action: 'WAIT', price: 0, stopLoss: 0, takeProfit: 0, confidence: 0 };
            const risk = atr > 0 ? atr * 2.5 : current.close * 0.01;
            return {
                action: 'SELL',
                price: current.close,
                stopLoss: current.close + risk,
                takeProfit: current.close - (risk * 3),
                confidence: 0.85,
                pattern: 'Trend Continuation (Pullback)',
                setup: `Rally near resistance in a DOWNTREND (RSI: ${rsi.toFixed(1)})`
            };
        }
    }

    return { action: 'WAIT', price: 0, stopLoss: 0, takeProfit: 0, confidence: 0 };
  }

  private calculateEMA(candles: Candle[], period: number): number {
    const closes = candles.slice(-period * 2).map(c => c.close);
    const k = 2 / (period + 1);
    let ema = closes[0];
    for (let i = 1; i < closes.length; i++) {
        ema = closes[i] * k + ema * (1 - k);
    }
    return ema;
  }
}
