import { Candle, Signal } from '../types/index.js';
import { IndicatorUtils } from '../utils/IndicatorUtils';
import { LevelAnalyzer } from '../utils/LevelAnalyzer';
import { CandlestickUtils, CandlestickPattern } from '../utils/CandlestickUtils';
import { VolumeUtils, VolumeMetrics } from '../utils/VolumeUtils';

export abstract class BaseStrategy {
  public name: string;
  protected config: any;

  constructor(name: string, config: any = {}) {
    this.name = name;
    this.config = config;
  }

  public abstract analyze(candles: Candle[]): Signal;

  // Utility: Calculate Wick Ratios
  protected getWickRatios(candle: Candle): { upper: number; lower: number; body: number } {
    const bodySize = Math.abs(candle.close - candle.open);
    const upperWick = candle.high - Math.max(candle.open, candle.close);
    const lowerWick = Math.min(candle.open, candle.close) - candle.low;
    
    return {
      upper: upperWick / (bodySize || 0.000001),
      lower: lowerWick / (bodySize || 0.000001),
      body: bodySize
    };
  }

  // Utility: Identify Trend
  protected getTrend(candles: Candle[], period: number = 20): 'UP' | 'DOWN' | 'SIDEWAYS' {
    if (candles.length < period) return 'SIDEWAYS';
    
    const slice = candles.slice(-period);
    const firstClose = slice[0].close;
    const lastClose = slice[slice.length - 1].close;
    
    const change = (lastClose - firstClose) / firstClose;
    if (change > 0.005) return 'UP';
    if (change < -0.005) return 'DOWN';
    return 'SIDEWAYS';
  }

  // Utility: Detect Consolidation (Decreasing Volume + Tight Range)
  protected isConsolidating(candles: Candle[], period: number = 10): boolean {
    if (candles.length < period) return false;
    
    const slice = candles.slice(-period);
    
    // Check Volatility (Range)
    const highs = slice.map(c => c.high);
    const lows = slice.map(c => c.low);
    const range = (Math.max(...highs) - Math.min(...lows)) / Math.min(...lows);
    
    // Check Volume Trend (Decreasing volume)
    let volumeDecreasing = true;
    for (let i = 1; i < slice.length; i++) {
        // Very simple check: average volume of first half vs second half
        const firstHalf = slice.slice(0, period / 2);
        const secondHalf = slice.slice(period / 2);
        const avgVol1 = firstHalf.reduce((s, c) => s + c.volume, 0) / firstHalf.length;
        const avgVol2 = secondHalf.reduce((s, c) => s + c.volume, 0) / secondHalf.length;
        volumeDecreasing = avgVol2 < avgVol1;
    }

    return range < 0.02 && volumeDecreasing; // Loosened from 0.01
  }

  // New Indicator Helpers
  protected getSMA(candles: Candle[], period: number = 200): number {
    return IndicatorUtils.calculateSMA(candles, period);
  }

  protected getRSI(candles: Candle[], period: number = 14): number {
    return IndicatorUtils.calculateRSI(candles, period);
  }

  protected getATR(candles: Candle[], period: number = 14): number {
    return IndicatorUtils.calculateATR(candles, period);
  }

  protected getCandlePatterns(candles: Candle[]): CandlestickPattern[] {
    return CandlestickUtils.identifyPatterns(candles);
  }

  protected getVolumeAnalysis(candles: Candle[]): VolumeMetrics {
    return VolumeUtils.analyzeVolume(candles);
  }

  protected getRVOL(candles: Candle[], period: number = 20): number {
    return IndicatorUtils.calculateRVOL(candles, period);
  }

  /**
   * Centralized Fakeout Detection
   */
  protected isFakeoutRisk(candles: Candle[]): { risk: boolean; reason: string } {
    const current = candles[candles.length - 1];
    
    // 1. Volume Confirmation (Breakouts/Patterns need volume)
    const rvol = this.getRVOL(candles, 20);
    if (rvol < 1.0) {
        return { risk: true, reason: `Low Volume (RVOL: ${rvol.toFixed(2)})` };
    }

    // 2. Overextension (Avoid chasing a move that's already exhausted)
    const ext = IndicatorUtils.isOverextended(candles, 20, 3.5);
    if (ext.overextended) {
        return { risk: true, reason: `Overextended (${ext.distance.toFixed(1)} ATRs from EMA20)` };
    }

    // 3. Indecision Check (Tiny bodies with big wicks often fake out)
    const bodySize = Math.abs(current.close - current.open);
    const totalRange = current.high - current.low;
    const bodyRatio = bodySize / (totalRange || 0.0001);
    if (bodyRatio < 0.2) {
        return { risk: true, reason: `Indecision Candle (Body: ${(bodyRatio * 100).toFixed(0)}%)` };
    }

    return { risk: false, reason: '' };
  }

  protected checkLevelProximity(candles: Candle[], type: 'SUPPORT' | 'RESISTANCE', threshold: number = 0.005): boolean {
    const levels = LevelAnalyzer.findLevels(candles);
    const currentPrice = candles[candles.length - 1].close;
    const targetLevels = type === 'SUPPORT' ? levels.support : levels.resistance;

    return targetLevels.some(l => Math.abs(currentPrice - l) / l <= threshold);
  }
}
