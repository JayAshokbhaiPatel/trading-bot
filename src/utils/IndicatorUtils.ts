import { Candle } from '../types/index';

export class IndicatorUtils {
  /**
   * Calculates Simple Moving Average (SMA)
   */
  public static calculateSMA(candles: Candle[], period: number): number {
    if (candles.length < period) return 0;
    const slice = candles.slice(-period);
    const sum = slice.reduce((acc, candle) => acc + candle.close, 0);
    return sum / period;
  }

  /**
   * Calculates Relative Strength Index (RSI)
   */
  public static calculateRSI(candles: Candle[], period: number = 14): number {
    if (candles.length <= period) return 50;

    let gains = 0;
    let losses = 0;

    for (let i = candles.length - period; i < candles.length; i++) {
      const difference = candles[i].close - candles[i - 1].close;
      if (difference >= 0) {
        gains += difference;
      } else {
        losses -= difference;
      }
    }

    if (losses === 0) return 100;
    
    const rs = gains / losses;
    return 100 - (100 / (1 + rs));
  }

  /**
   * Calculates Average True Range (ATR)
   */
  public static calculateATR(candles: Candle[], period: number = 14): number {
    if (candles.length <= period) return 0;

    const trueRanges: number[] = [];
    for (let i = candles.length - period; i < candles.length; i++) {
      const current = candles[i];
      const previous = candles[i - 1];
      
      const tr = Math.max(
        current.high - current.low,
        Math.abs(current.high - previous.close),
        Math.abs(current.low - previous.close)
      );
      trueRanges.push(tr);
    }

    return trueRanges.reduce((a, b) => a + b, 0) / period;
  }

  /**
   * Calculates Exponential Moving Average (EMA)
   */
  public static calculateEMA(candles: Candle[], period: number): number {
    if (candles.length < period) return 0;
    const closes = candles.map(c => c.close);
    const k = 2 / (period + 1);
    let ema = closes[candles.length - period * 2] || closes[0]; 
    
    const startIdx = Math.max(0, candles.length - period * 2);
    for (let i = startIdx; i < closes.length; i++) {
        ema = closes[i] * k + ema * (1 - k);
    }
    return ema;
  }

  /**
   * Calculates Relative Volume (RVOL)
   */
  public static calculateRVOL(candles: Candle[], period: number = 20): number {
    if (candles.length < period) return 1;
    const currentVolume = candles[candles.length - 1].volume;
    const avgVolume = candles.slice(-period).reduce((acc, c) => acc + c.volume, 0) / period;
    return avgVolume === 0 ? 1 : currentVolume / avgVolume;
  }

  /**
   * Checks if price is overextended from a baseline
   */
  public static isOverextended(candles: Candle[], period: number = 20, thresholdATRs: number = 3.5): { overextended: boolean, distance: number } {
    const ema = this.calculateEMA(candles, period);
    const atr = this.calculateATR(candles, 14);
    if (atr === 0) return { overextended: false, distance: 0 };
    
    const currentPrice = candles[candles.length - 1].close;
    const distance = Math.abs(currentPrice - ema);
    
    return {
      overextended: distance > (atr * thresholdATRs),
      distance: distance / atr
    };
  }
}
