import { OHLCV } from '../types/market';

export class VolumeAnalyzer {
  private volumeThresholds = {
    veryHigh: 1.5, // Volume > 150% of average
    high: 1.2,     // Volume > 120% of average
    normal: 0.8,   // Volume 80-120% of average
    low: 0.5       // Volume < 50% of average
  };

  /**
   * Calculate volume metrics
   */
  public analyzeVolume(candles: OHLCV[], period = 20) {
    if (candles.length < period) return null;

    const recentCandles = candles.slice(-period);
    const currentVolume = recentCandles[recentCandles.length - 1].volume;
    const avgVolume = this.calculateAverageVolume(recentCandles);
    const volumeRatio = currentVolume / avgVolume;

    const volumeCategory = this.categorizeVolume(volumeRatio);

    return {
      currentVolume,
      avgVolume: parseFloat(avgVolume.toFixed(0)),
      volumeRatio: parseFloat(volumeRatio.toFixed(2)),
      category: volumeCategory,
      trend: this.analyzeVolumeTrend(recentCandles),
      obv: this.calculateOBV(recentCandles),
      ad: this.calculateAccumulationDistribution(recentCandles),
      mfi: this.calculateMoneyFlowIndex(recentCandles),
      vwap: this.calculateVWAP(recentCandles)
    };
  }

  private calculateAverageVolume(candles: OHLCV[]) {
    return candles.reduce((sum, c) => sum + c.volume, 0) / candles.length;
  }

  private categorizeVolume(ratio: number) {
    if (ratio > this.volumeThresholds.veryHigh) return 'VERY_HIGH';
    if (ratio > this.volumeThresholds.high) return 'HIGH';
    if (ratio > this.volumeThresholds.normal) return 'NORMAL';
    if (ratio > this.volumeThresholds.low) return 'LOW';
    return 'VERY_LOW';
  }

  private analyzeVolumeTrend(candles: OHLCV[]) {
    const recentVol = candles[candles.length - 1].volume;
    const prevVol = candles[candles.length - 2].volume;
    const avgVol = this.calculateAverageVolume(candles.slice(-5));

    if (recentVol > prevVol && recentVol > avgVol) return 'INCREASING';
    if (recentVol < prevVol && recentVol < avgVol) return 'DECREASING';
    return 'NEUTRAL';
  }

  /**
   * On-Balance Volume (OBV)
   */
  private calculateOBV(candles: OHLCV[]) {
    let obv = 0;
    const obvValues: number[] = [];

    candles.forEach((candle, index) => {
      if (index === 0) {
        obv = candle.volume;
      } else {
        if (candle.close > candles[index - 1].close) {
          obv += candle.volume;
        } else if (candle.close < candles[index - 1].close) {
          obv -= candle.volume;
        }
      }
      obvValues.push(obv);
    });

    const currentOBV = obvValues[obvValues.length - 1];
    const prevOBV = obvValues[Math.max(0, obvValues.length - 2)];
    const signal = currentOBV > prevOBV ? 'BULLISH' : 'BEARISH';

    return {
      obv: currentOBV,
      signal,
      trend: currentOBV > prevOBV ? 'INCREASING' : 'DECREASING'
    };
  }

  /**
   * Accumulation/Distribution Line
   */
  private calculateAccumulationDistribution(candles: OHLCV[]) {
    let ad = 0;
    const adValues: number[] = [];

    candles.forEach(candle => {
      const range = candle.high - candle.low;
      const clv = range === 0 ? 0 : ((candle.close - candle.low) - (candle.high - candle.close)) / range;
      ad += clv * candle.volume;
      adValues.push(ad);
    });

    const currentAD = adValues[adValues.length - 1];
    const prevAD = adValues[Math.max(0, adValues.length - 2)];

    return {
      ad: parseFloat(currentAD.toFixed(0)),
      signal: currentAD > prevAD ? 'ACCUMULATION' : 'DISTRIBUTION',
      trend: currentAD > prevAD ? 'BULLISH' : 'BEARISH'
    };
  }

  /**
   * Money Flow Index (MFI)
   */
  private calculateMoneyFlowIndex(candles: OHLCV[], period = 14) {
    if (candles.length < period) return null;

    const typicalPrices = candles.map(c => (c.high + c.low + c.close) / 3);
    const moneyFlows = candles.map((c, i) => typicalPrices[i] * c.volume);

    let positiveFlow = 0;
    let negativeFlow = 0;

    // Start from 1 because we compare with i-1
    // Loop over the last 'period' candles
    // The provided code loops slightly differently, let's align
    // Code: for (let i = 1; i < Math.min(period + 1, candles.length); i++)
    
    // We should look at the LAST 'period' intervals
    const startIndex = Math.max(1, candles.length - period);
    
    for (let i = startIndex; i < candles.length; i++) {
        const i_mapped = i; // in existing array
        // We need mapped index if we were slicing, but we are using full array?
        // Let's use slice to avoid index confusion
    }
    
    const slice = candles.slice(-period - 1); // Get period+1 candles
    const sliceTP = slice.map(c => (c.high + c.low + c.close) / 3);
    const sliceMF = slice.map((c, i) => sliceTP[i] * c.volume);
    
    positiveFlow = 0;
    negativeFlow = 0;
    
    for (let i = 1; i < slice.length; i++) {
         if (sliceTP[i] > sliceTP[i - 1]) {
            positiveFlow += sliceMF[i];
         } else {
            negativeFlow += sliceMF[i];
         }
    }

    if (negativeFlow === 0) return { mfi: 100, signal: 'OVERBOUGHT', buyingPressure: 'STRONG' };

    const moneyFlowRatio = positiveFlow / negativeFlow;
    const mfi = 100 - (100 / (1 + moneyFlowRatio));

    return {
      mfi: parseFloat(mfi.toFixed(2)),
      signal: mfi > 80 ? 'OVERBOUGHT' : mfi < 20 ? 'OVERSOLD' : 'NEUTRAL',
      buyingPressure: mfi > 50 ? 'STRONG' : 'WEAK'
    };
  }

  /**
   * VWAP
   */
  private calculateVWAP(candles: OHLCV[]) {
    let cumulativeVolumePrice = 0;
    let cumulativeVolume = 0;

    candles.forEach(candle => {
      const typicalPrice = (candle.high + candle.low + candle.close) / 3;
      cumulativeVolumePrice += typicalPrice * candle.volume;
      cumulativeVolume += candle.volume;
    });

    const vwap = cumulativeVolumePrice / cumulativeVolume;
    const currentPrice = candles[candles.length - 1].close;
    const priceVsVWAP = currentPrice > vwap ? 'ABOVE' : 'BELOW';

    // VWAP bands
    const vwapBandUpper = vwap * 1.02; // 2% above VWAP
    const vwapBandLower = vwap * 0.98; // 2% below VWAP

    return {
      vwap: parseFloat(vwap.toFixed(2)),
      priceVsVWAP,
      bandUpper: parseFloat(vwapBandUpper.toFixed(2)),
      bandLower: parseFloat(vwapBandLower.toFixed(2)),
      signal: currentPrice > vwapBandUpper ? 'OVERBOUGHT' : currentPrice < vwapBandLower ? 'OVERSOLD' : 'FAIR_VALUE'
    };
  }

  /**
   * Volume Confirmation
   */
  public checkVolumeConfirmation(candles: OHLCV[]) {
    if (candles.length < 2) return null;

    const current = candles[candles.length - 1];
    const previous = candles[candles.length - 2];
    const avgVolume = this.calculateAverageVolume(candles.slice(-20));

    const priceMove = current.close > previous.close ? 'UP' : 'DOWN';
    const volumeRatio = current.volume / avgVolume;
    const isConfirmed = volumeRatio > 1.2; // Volume above average

    let signal = 'WEAK'; 
    let confidence = 0.3;

    if (isConfirmed) {
      if (priceMove === 'UP') {
        signal = 'BULLISH_CONFIRMED';
        confidence = Math.min(volumeRatio / 2, 1.0);
      } else {
        signal = 'BEARISH_CONFIRMED';
        confidence = Math.min(volumeRatio / 2, 1.0);
      }
    } else {
      signal = 'UNCONFIRMED_' + priceMove;
    }

    return {
      priceMove,
      volumeRatio: parseFloat(volumeRatio.toFixed(2)),
      isConfirmed,
      signal,
      confidence: parseFloat(confidence.toFixed(2)),
      recommendation: isConfirmed ? 'TRUST_THE_MOVE' : 'WAIT_FOR_CONFIRMATION'
    };
  }

  /**
   * Detect volume breakout
   */
  public detectVolumeBreakout(candles: OHLCV[], threshold = 2.0) {
    const current = candles[candles.length - 1];
    const avgVolume = this.calculateAverageVolume(candles.slice(-20));
    const volumeRatio = current.volume / avgVolume;

    if (volumeRatio > threshold) {
      return {
        detected: true,
        type: 'VOLUME_BREAKOUT',
        volumeRatio: parseFloat(volumeRatio.toFixed(2)),
        avgVolume: parseFloat(avgVolume.toFixed(0)),
        currentVolume: current.volume,
        confidence: parseFloat(Math.min(volumeRatio / threshold, 1.0).toFixed(2)),
        signal: 'Strong breakout likely - volume confirms move'
      };
    }

    return { detected: false };
  }

  /**
   * Generate volume-based confluence signals
   */
  public generateVolumeSignals(candles: OHLCV[]) {
    if (candles.length < 20) return null;

    const volumeMetrics = this.analyzeVolume(candles);
    const volumeConfirmation = this.checkVolumeConfirmation(candles);
    const volumeBreakout = this.detectVolumeBreakout(candles);

    if (!volumeMetrics || !volumeConfirmation || !volumeBreakout) return null;

    let bullishScore = 0;
    let bearishScore = 0;
    const signals: any[] = [];

    // OBV signal
    if (volumeMetrics.obv.signal === 'BULLISH') {
      bullishScore += 1.5;
      signals.push({ type: 'OBV', signal: 'BULLISH', score: 1.5 });
    } else {
      bearishScore += 1.5;
      signals.push({ type: 'OBV', signal: 'BEARISH', score: 1.5 });
    }

    // AD signal
    if (volumeMetrics.ad.trend === 'BULLISH') {
      bullishScore += 1.5;
      signals.push({ type: 'AD_LINE', signal: 'BULLISH', score: 1.5 });
    } else {
      bearishScore += 1.5;
      signals.push({ type: 'AD_LINE', signal: 'BEARISH', score: 1.5 });
    }

    // MFI signal
    if (volumeMetrics.mfi) {
      if (volumeMetrics.mfi.signal === 'OVERBOUGHT') {
        bearishScore += 1.2;
        signals.push({ type: 'MFI', signal: 'OVERBOUGHT', score: 1.2 });
      } else if (volumeMetrics.mfi.signal === 'OVERSOLD') {
        bullishScore += 1.2;
        signals.push({ type: 'MFI', signal: 'OVERSOLD', score: 1.2 });
      }
    }

    // VWAP signal
    if (volumeMetrics.vwap.priceVsVWAP === 'ABOVE' && volumeMetrics.vwap.signal !== 'OVERBOUGHT') {
      bullishScore += 1.0;
      signals.push({ type: 'VWAP', signal: 'BULLISH', score: 1.0 });
    } else if (volumeMetrics.vwap.priceVsVWAP === 'BELOW' && volumeMetrics.vwap.signal !== 'OVERSOLD') {
      bearishScore += 1.0;
      signals.push({ type: 'VWAP', signal: 'BEARISH', score: 1.0 });
    }

    // Volume confirmation bonus
    if (volumeConfirmation.isConfirmed) {
      if (volumeConfirmation.signal.includes('BULLISH')) {
        bullishScore += 2.0;
      } else {
        bearishScore += 2.0;
      }
    }

    // Volume breakout bonus
    if (volumeBreakout.detected) {
      bullishScore += 1.5;
      signals.push({ type: 'VOLUME_BREAKOUT', signal: 'CONFIRMED', score: 1.5 });
    }

    // Final decision
    let action = 'HOLD';
    if (bullishScore > bearishScore) action = 'BUY';
    else if (bearishScore > bullishScore) action = 'SELL';

    return {
      action,
      bullishScore: parseFloat(bullishScore.toFixed(2)),
      bearishScore: parseFloat(bearishScore.toFixed(2)),
      confidence: parseFloat(Math.min(Math.abs(bullishScore - bearishScore) / 10, 1.0).toFixed(2)),
      signals,
      volumeMetrics,
      volumeConfirmation,
      volumeBreakout
    };
  }
}
