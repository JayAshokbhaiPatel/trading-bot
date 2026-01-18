import { BaseStrategy } from '../core/BaseStrategy';
import { Candle, Signal } from '../types/index';

export class SupplyDemandStrategy extends BaseStrategy {
  private zones: { type: 'SUPPLY' | 'DEMAND', high: number, low: number, strength: number }[] = [];

  constructor(config: any = {}) {
    super('Supply/Demand Zone Reversal', {
      zoneLookback: 100,
      displacementThreshold: 0.01, // 1% move to create zone
      ...config
    });
  }

  public analyze(candles: Candle[]): Signal {
    if (candles.length < 50) return { action: 'WAIT', price: 0, stopLoss: 0, takeProfit: 0, confidence: 0 };

    this.findZones(candles);
    const sma200 = this.getSMA(candles, 200);
    const rsi = this.getRSI(candles, 14);
    const atr = this.getATR(candles, 14);
    const current = candles[candles.length - 1];

    for (const zone of this.zones) {
        // Demand Zone Reversal
        if (zone.type === 'DEMAND' && current.low <= zone.high && current.close > zone.low) {
            const ratios = this.getWickRatios(current);
            if (ratios.lower > 1.2) { // Bullish rejection in demand zone
                // Filters
                if (current.close < sma200) continue; // Buy in uptrend
                if (rsi > 65) continue; // Avoid overbought

                const risk = atr > 0 ? atr * 1.5 : (current.close - zone.low);
                return {
                    action: 'BUY',
                    price: current.close,
                    stopLoss: current.close - risk,
                    takeProfit: current.close + (risk * 3),
                    confidence: 0.85,
                    pattern: 'Demand Zone Reversal',
                    setup: 'Bullish rejection (Trend: UP, RSI: Low)'
                };
            }
        }

        // Supply Zone Reversal
        if (zone.type === 'SUPPLY' && current.high >= zone.low && current.close < zone.high) {
            const ratios = this.getWickRatios(current);
            if (ratios.upper > 1.2) { // Bearish rejection in supply zone
                // Filters
                if (current.close > sma200) continue; // Sell in downtrend
                if (rsi < 35) continue; // Avoid oversold

                const risk = atr > 0 ? atr * 1.5 : (zone.high - current.close);
                return {
                    action: 'SELL',
                    price: current.close,
                    stopLoss: current.close + risk,
                    takeProfit: current.close - (risk * 3),
                    confidence: 0.85,
                    pattern: 'Supply Zone Reversal',
                    setup: 'Bearish rejection (Trend: DOWN, RSI: High)'
                };
            }
        }
    }

    return { action: 'WAIT', price: 0, stopLoss: 0, takeProfit: 0, confidence: 0 };
  }

  private findZones(candles: Candle[]): void {
    // Simple Displacement Logic: Big move after a pause
    this.zones = [];
    for (let i = 5; i < candles.length - 5; i++) {
        const prev = candles[i];
        const next = candles[i + 1];
        const change = (next.close - prev.close) / prev.close;

        if (Math.abs(change) > this.config.displacementThreshold) {
            if (change > 0) {
                this.zones.push({ type: 'DEMAND', high: prev.high, low: prev.low, strength: 1 });
            } else {
                this.zones.push({ type: 'SUPPLY', high: prev.high, low: prev.low, strength: 1 });
            }
        }
    }
  }
}
