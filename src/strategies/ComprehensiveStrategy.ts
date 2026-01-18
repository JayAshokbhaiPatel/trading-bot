import { BaseStrategy } from '../core/BaseStrategy';
import { Candle, Signal } from '../types/index';

export class ComprehensiveStrategy extends BaseStrategy {
  constructor(config: any = {}) {
    super('Comprehensive Confluence Strategy', {
      minConfidence: 0.6,
      rsiPeriod: 14,
      ...config
    });
  }

  public analyze(candles: Candle[]): Signal {
    if (candles.length < 50) return { action: 'WAIT', price: 0, stopLoss: 0, takeProfit: 0, confidence: 0 };

    const current = candles[candles.length - 1];
    const patterns = this.getCandlePatterns(candles);
    const volume = this.getVolumeAnalysis(candles);
    const rsi = this.getRSI(candles, this.config.rsiPeriod);
    const sma200 = this.getSMA(candles, 200);
    const atr = this.getATR(candles, 14);

    let bullishScore = 0;
    let bearishScore = 0;

    // 1. Candlestick Patterns
    patterns.forEach(p => {
      if (p.signal === 'BULLISH') bullishScore += p.confidence * 2;
      if (p.signal === 'BEARISH') bearishScore += p.confidence * 2;
    });

    // 2. Volume Confluence
    if (volume.obv.signal === 'BULLISH') bullishScore += 1.5;
    if (volume.obv.signal === 'BEARISH') bearishScore += 1.5;
    if (volume.mfi < 20) bullishScore += 1.2;
    if (volume.mfi > 80) bearishScore += 1.2;
    if (volume.category === 'HIGH' || volume.category === 'VERY_HIGH') {
        // Boost existing direction if volume is high
        if (current.close > current.open) bullishScore += 1.0;
        else bearishScore += 1.0;
    }

    // 3. Technical Indicators
    if (rsi < 30) bullishScore += 1.5;
    if (rsi > 70) bearishScore += 1.5;
    if (current.close > sma200) bullishScore += 1.0;
    else bearishScore += 1.0;

    // 4. S/R Confluence
    const nearSupport = this.checkLevelProximity(candles, 'SUPPORT', 0.01);
    const nearResistance = this.checkLevelProximity(candles, 'RESISTANCE', 0.01);
    if (nearSupport) bullishScore += 2.0;
    if (nearResistance) bearishScore += 2.0;

    // Decision Logic
    const diff = bullishScore - bearishScore;
    const finalConfidence = Math.min(Math.abs(diff) / 10, 1);

    if (diff > 5 && finalConfidence >= this.config.minConfidence) {
        const risk = atr > 0 ? atr * 2 : current.close * 0.01;
        return {
            action: 'BUY',
            price: current.close,
            stopLoss: current.close - risk,
            takeProfit: current.close + (risk * 3),
            confidence: finalConfidence,
            pattern: patterns[0]?.name || 'Confluence',
            setup: `Bullish confluence score: ${bullishScore.toFixed(1)}`
        };
    }

    if (diff < -5 && finalConfidence >= this.config.minConfidence) {
        const risk = atr > 0 ? atr * 2 : current.close * 0.01;
        return {
            action: 'SELL',
            price: current.close,
            stopLoss: current.close + risk,
            takeProfit: current.close - (risk * 3),
            confidence: finalConfidence,
            pattern: patterns[0]?.name || 'Confluence',
            setup: `Bearish confluence score: ${bearishScore.toFixed(1)}`
        };
    }

    return { action: 'WAIT', price: 0, stopLoss: 0, takeProfit: 0, confidence: 0 };
  }
}
