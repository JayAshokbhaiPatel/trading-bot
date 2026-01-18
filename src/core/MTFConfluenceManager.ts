import { Candle, Signal, Action } from '../types/index';
import { BaseStrategy } from './BaseStrategy';
import { LevelAnalyzer } from '../utils/LevelAnalyzer';

export interface MTFResult {
    symbol: string;
    bestSignal: Signal;
    timeframe: string;
    confluenceScore: number; // 0 to 100
    tfHighTrend: 'UP' | 'DOWN' | 'SIDEWAYS';
    tfMediumTrend: 'UP' | 'DOWN' | 'SIDEWAYS';
    supportLevels: number[];
    resistanceLevels: number[];
}

export class MTFConfluenceManager extends BaseStrategy {
    constructor() {
        super('MTF Confluence Manager');
    }

    // This manager doesn't implement analyze(candles[]) directly as it needs multiple timeframes
    public analyze(candles: Candle[]): Signal {
        return { action: 'WAIT', price: 0, stopLoss: 0, takeProfit: 0, confidence: 0 };
    }

    /**
     * Analyze a symbol across multiple timeframes for confluence
     */
    public analyzeMTF(
        symbol: string,
        tf15m: Candle[],
        tf1h: Candle[],
        tf4h: Candle[],
        strategies: BaseStrategy[],
        livePrice: number
    ): MTFResult | null {
        if (tf15m.length < 20 || tf1h.length < 20 || tf4h.length < 20) return null;

        const trend4h = this.getTrend(tf4h, 20);
        const trend1h = this.getTrend(tf1h, 20);

        const timeframeSets = [
            { name: '4-Hour', candles: tf4h, hTrend: 'SIDEWAYS' as any, mTrend: 'SIDEWAYS' as any }, // Higher TF self-validates
            { name: '1-Hour', candles: tf1h, hTrend: trend4h, mTrend: 'SIDEWAYS' as any },
            { name: '15-Minute', candles: tf15m, hTrend: trend4h, mTrend: trend1h }
        ];

        let bestResult: MTFResult | null = null;

        for (const tfSet of timeframeSets) {
            for (const strategy of strategies) {
                const signal = strategy.analyze(tfSet.candles);
                if (signal && signal.action !== 'WAIT') {
                    // Check confluence with higher trends
                    // For 4h, both hTrend and mTrend are sideways so it passes
                    const trendMatch = this.checkTrendConfluence(signal.action, tfSet.mTrend, tfSet.hTrend);
                    
                    if (trendMatch) {
                        // Update price to live price if provided
                        if (livePrice > 0) {
                            // VALIDATION: Ensure live price hasn't already hit/passed SL
                            if (signal.action === 'BUY' && livePrice <= signal.stopLoss) continue;
                            if (signal.action === 'SELL' && livePrice >= signal.stopLoss) continue;
                            
                            signal.price = livePrice;
                        }

                        // VALIDATION: Ensure R/R is at least 1.5
                        const risk = Math.abs(signal.price - signal.stopLoss);
                        const reward = Math.abs(signal.takeProfit - signal.price);
                        const rr = risk > 0 ? reward / risk : 0;
                        if (rr < 1.5) continue;
                        
                        // Calculate score
                        let score = (signal.confidence * 60);
                        if (signal.action === 'BUY') {
                            if (tfSet.mTrend === 'UP') score += 20;
                            if (tfSet.hTrend === 'UP') score += 20;
                        } else if (signal.action === 'SELL') {
                            if (tfSet.mTrend === 'DOWN') score += 20;
                            if (tfSet.hTrend === 'DOWN') score += 20;
                        }

                        const levels = LevelAnalyzer.findLevels(tfSet.candles);

                        const result: MTFResult = {
                            symbol,
                            bestSignal: signal,
                            timeframe: tfSet.name,
                            confluenceScore: Math.round(score),
                            tfHighTrend: trend4h,
                            tfMediumTrend: trend1h,
                            supportLevels: levels.support,
                            resistanceLevels: levels.resistance
                        };

                        // Selection logic: Prefer higher timeframes or higher confluence scores
                        if (!bestResult || result.confluenceScore > bestResult.confluenceScore) {
                            bestResult = result;
                        }
                    }
                }
            }
            // If we found a high quality 4h/1h signal, we might want to prioritize it over 15m
            if (bestResult && bestResult.confluenceScore > 80) break;
        }

        return bestResult;
    }

    private checkTrendConfluence(action: Action, trend1h: string, trend4h: string): boolean {
        if (action === 'BUY') {
            // Must not be against 4h trend (unless 4h is sideways)
            if (trend4h === 'DOWN') return false;
            // 1h should ideally be UP or SIDEWAYS
            if (trend1h === 'DOWN') return false;
            return true;
        } else if (action === 'SELL') {
            if (trend4h === 'UP') return false;
            if (trend1h === 'UP') return false;
            return true;
        }
        return false;
    }
}
