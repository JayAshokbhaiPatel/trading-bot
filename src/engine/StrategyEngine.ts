import { OHLCV } from '../types/market';
import { TradeSignal } from '../types/trading';
import { LiquidityAnalyzer } from '../analysis/LiquidityAnalyzer';
import { FibonacciAnalyzer } from '../analysis/FibonacciAnalyzer';
import { OrderBlockAnalyzer, CLSCandle, EntryOrderBlock } from '../analysis/OrderBlockAnalyzer';
import { MultiTimeframeEngine, TrendDirection, HTFContext } from './MultiTimeframeEngine';
import { StrategyConfig, OPTIMIZED_CONFIG } from '../config/StrategyConfig';

/**
 * High Risk-Reward Strategy Engine (Optimized)
 * Based on TradingView strategy: Trading LTF reversals inside HTF trends
 * 
 * Optimized to increase signal frequency while maintaining quality.
 */
export class StrategyEngine {
    private liquidityAnalyzer: LiquidityAnalyzer;
    private fibonacciAnalyzer: FibonacciAnalyzer;
    private orderBlockAnalyzer: OrderBlockAnalyzer;
    private mtfEngine: MultiTimeframeEngine;
    private config: StrategyConfig;

    constructor(config: StrategyConfig = OPTIMIZED_CONFIG) {
        this.liquidityAnalyzer = new LiquidityAnalyzer();
        this.fibonacciAnalyzer = new FibonacciAnalyzer();
        this.orderBlockAnalyzer = new OrderBlockAnalyzer();
        this.mtfEngine = new MultiTimeframeEngine();
        this.config = config;
    }

    /**
     * Evaluate trading opportunity using high R:R strategy (Async)
     */
    public async evaluateAsync(candles: OHLCV[], coin?: string, timeframe: string = '1h'): Promise<TradeSignal> {
        const currentPrice = candles[candles.length - 1].close;
        const signal: TradeSignal = {
            action: 'NO_TRADE',
            price: currentPrice,
            timestamp: candles[candles.length - 1].timestamp,
            reasoning: [],
            confidence: 0,
        };

        if (!coin) {
            signal.reasoning.push('❌ No coin symbol provided');
            return signal;
        }

        if (candles.length < 100) {
            signal.reasoning.push('❌ Insufficient candle data');
            return signal;
        }

        try {
            // STEP 1: HTF Context Analysis
            const mtfAnalysis = await this.mtfEngine.getMultiTimeframeAnalysis(coin);
            let htfTrend: TrendDirection = 'RANGING';
            let mtfConfidence = 0;

            if (this.config.requireHTFAlignment) {
                if (!mtfAnalysis.isAligned) {
                    signal.reasoning.push('❌ HTF alignment required but not found');
                    return signal;
                }
                htfTrend = mtfAnalysis.alignedTrend;
                mtfConfidence = mtfAnalysis.confidence;
            } else if (this.config.allowSingleHTFTrend) {
                const dailyTrend = mtfAnalysis.daily?.trend || 'RANGING';
                const fourHourTrend = mtfAnalysis.fourHour?.trend || 'RANGING';

                if (dailyTrend !== 'RANGING') {
                    htfTrend = dailyTrend;
                    mtfConfidence = (mtfAnalysis.daily?.trendStrength || 0) / 100;
                    signal.reasoning.push(`✅ Using Daily Trend: ${htfTrend}`);
                } else if (fourHourTrend !== 'RANGING') {
                    htfTrend = fourHourTrend;
                    mtfConfidence = (mtfAnalysis.fourHour?.trendStrength || 0) / 100;
                    signal.reasoning.push(`✅ Using 4H Trend: ${htfTrend}`);
                }
            }

            if (htfTrend === 'RANGING') {
                signal.reasoning.push('❌ No significant HTF trend found');
                return signal;
            }

            // STEP 2: Fibonacci context
            const fibContext = this.fibonacciAnalyzer.analyzeFibonacciContext(candles, htfTrend);
            let isFibValid = fibContext.isValidForEntry;

            if (!isFibValid && this.config.allowEquilibriumZone && fibContext.zoneInfo?.zone === 'EQUILIBRIUM') {
                isFibValid = true;
                signal.reasoning.push('⚠️ Using Equilibrium Zone (Relaxed)');
            }

            if (!isFibValid && this.config.strictFibZone) {
                signal.reasoning.push(`❌ ${fibContext.reasoning}`);
                return signal;
            }

            signal.reasoning.push(`✅ ${fibContext.reasoning}`);

            // STEP 3: Liquidity Target
            const htfLiquidityTarget = mtfAnalysis.daily?.liquidityTarget || mtfAnalysis.fourHour?.liquidityTarget;
            const targetPrice = htfLiquidityTarget || (htfTrend === 'BULLISH' ? mtfAnalysis.daily?.swingHigh : mtfAnalysis.daily?.swingLow) || currentPrice;

            if (!htfLiquidityTarget) {
                signal.reasoning.push('⚠️ No specific HTF liquidity target, using swing extreme');
            }
            
            const targetDistance = currentPrice > 0 ? Math.abs((targetPrice - currentPrice) / currentPrice) * 100 : 0;
            signal.reasoning.push(`✅ HTF Target: ${targetPrice.toFixed(2)} (${targetDistance.toFixed(2)}% away)`);

            // STEP 4: Entry Setup (CLS -> CIOD -> OB)
            const clsCandle = this.detectCLSCandle(candles, targetPrice, htfTrend);
            let ciod = null;
            let entrySetup = null;

            if (clsCandle) {
                signal.reasoning.push(`✅ CLS detected at index ${clsCandle.index} (${clsCandle.type})`);
                ciod = this.orderBlockAnalyzer.detectCIOD(candles, clsCandle.index, clsCandle.type);
                if (ciod) {
                    signal.reasoning.push(`✅ CIOD detected at index ${ciod.index} (${ciod.type})`);
                    entrySetup = this.orderBlockAnalyzer.findValidEntryOB(candles, ciod.index, ciod.type);
                }
            }

            // FALLBACK Entry Logic
            if (!entrySetup && !this.config.requireCLSCandle) {
                signal.reasoning.push('🔍 Looking for Fallback Entry Setup...');
                entrySetup = this.generateFallbackEntry(candles, htfTrend);
            }

            if (!entrySetup) {
                signal.reasoning.push('⏳ Waiting for valid entry setup');
                return signal;
            }

            if (entrySetup.orderBlock) {
                signal.reasoning.push(`✅ Entry OB: ${entrySetup.entryZone.low.toFixed(2)} - ${entrySetup.entryZone.high.toFixed(2)}`);
            }

            // STEP 5: Price Proximity
            const isPriceInZone = this.orderBlockAnalyzer.isPriceNearOrderBlock(
                currentPrice,
                entrySetup.orderBlock,
                this.config.orderBlockProximity / 100
            );

            if (this.config.requireOrderBlockRetest && !isPriceInZone) {
                signal.reasoning.push(`⏳ Price not in entry zone: ${entrySetup.entryZone.low.toFixed(2)}-${entrySetup.entryZone.high.toFixed(2)}`);
                return signal;
            }

            // STEP 6: Risk-Reward
            const risk = Math.abs(currentPrice - entrySetup.stopLoss) || 0.0001;
            const reward = Math.abs(targetPrice - currentPrice);
            const riskReward = reward / risk;

            if (riskReward < this.config.minRiskReward) {
                signal.reasoning.push(`❌ RR too low: ${riskReward.toFixed(2)}:1 (Min: ${this.config.minRiskReward}:1)`);
                return signal;
            }

            // SUCCESS: Generate Signal
            const type = htfTrend === 'BULLISH' ? 'BUY' : 'SELL';
            signal.action = type;
            signal.stopLoss = entrySetup.stopLoss;
            signal.takeProfit1 = targetPrice;
            
            // Calculate Confidence Tiered
            let baseConfidence = (entrySetup.confidence || 0.5) * (mtfConfidence || 0.5);
            if (!clsCandle) baseConfidence *= 0.8;
            if (!ciod) baseConfidence *= 0.9;
            if (fibContext.zoneInfo?.zone === 'EQUILIBRIUM') baseConfidence *= 0.8;
            
            signal.confidence = Math.max(0.2, Math.min(0.95, baseConfidence));

            signal.reasoning.push(`🎯 ${type} Signal Generated`);
            signal.reasoning.push(`   RR: ${riskReward.toFixed(2)}:1`);
            signal.reasoning.push(`   Confidence: ${(signal.confidence * 100).toFixed(0)}%`);

            if (this.config.enableTieredSignals) {
                const tier = signal.confidence > 0.8 ? 'PREMIUM (Tier 1)' : (signal.confidence > 0.5 ? 'STANDARD (Tier 2)' : 'OPPORTUNISTIC (Tier 3)');
                signal.reasoning.push(`💎 Tier: ${tier}`);
            }

        } catch (error: any) {
             signal.reasoning.push(`❌ Error: ${error.message}`);
        }

        return signal;
    }

    private generateFallbackEntry(candles: OHLCV[], trend: TrendDirection): EntryOrderBlock | null {
        try {
            const orderBlocks = this.orderBlockAnalyzer.detectOrderBlocks(candles, 30);
            const entryType: 'BULLISH' | 'BEARISH' = trend === 'BULLISH' ? 'BULLISH' : 'BEARISH';
            const validOBs = orderBlocks.filter(ob => ob.type === entryType && !ob.isMitigated);
            
            if (validOBs.length === 0) return null;
            const ob = validOBs[validOBs.length - 1]; // Take the most recent unmitigated OB
            
            return {
                orderBlock: ob,
                ciod: { 
                    index: ob.index, 
                    type: entryType, 
                    candle: candles[ob.index], 
                    breakLevel: 0, 
                    strength: 1 
                }, 
                entryZone: { high: ob.high, low: ob.low },
                stopLoss: entryType === 'BULLISH' ? ob.low * 0.99 : ob.high * 1.01,
                confidence: 0.5
            };
        } catch { return null; }
    }

    private detectCLSCandle(candles: OHLCV[], liquidityLevel: number, trend: TrendDirection): CLSCandle | null {
        if (trend === 'RANGING') return null;
        const lookback = Math.min(20, candles.length);
        const recent = candles.slice(-lookback);

        for (let i = 0; i < recent.length; i++) {
            const cls = this.orderBlockAnalyzer.isCLSCandle(
                recent[i], 
                liquidityLevel, 
                trend as 'BULLISH' | 'BEARISH', 
                this.config.clsWickMinPercent / 100
            );
            if (cls) {
                cls.index = candles.length - lookback + i;
                return cls;
            }
        }
        return null;
    }

    /**
     * Synchronous evaluate method for backtesting
     */
    public evaluate(candles: OHLCV[], coin?: string, timeframe: string = '1h'): TradeSignal {
        const currentPrice = candles[candles.length - 1].close;
        const signal: TradeSignal = {
            action: 'NO_TRADE',
            price: currentPrice,
            timestamp: candles[candles.length - 1].timestamp,
            reasoning: [],
            confidence: 0,
        };

        if (candles.length < 100) return signal;

        try {
            const trend = this.mtfEngine.determineHTFTrend(candles);
            if (trend === 'RANGING') return signal;

            const fibContext = this.fibonacciAnalyzer.analyzeFibonacciContext(candles, trend);
            let isFibValid = fibContext.isValidForEntry;
            if (!isFibValid && this.config.allowEquilibriumZone && fibContext.zoneInfo?.zone === 'EQUILIBRIUM') {
                isFibValid = true;
            }
            if (!isFibValid && this.config.strictFibZone) return signal;

            const liquidityTargets = this.liquidityAnalyzer.identifyLiquidityTargets(candles, trend, 100);
            const targetPrice = liquidityTargets.length > 0 
                ? liquidityTargets[0].price 
                : (trend === 'BULLISH' ? currentPrice * 1.05 : currentPrice * 0.95);

            let entrySetup = null;
            const cls = this.detectCLSCandle(candles, targetPrice, trend);
            if (cls) {
                const ciod = this.orderBlockAnalyzer.detectCIOD(candles, cls.index, cls.type);
                if (ciod) {
                    entrySetup = this.orderBlockAnalyzer.findValidEntryOB(candles, ciod.index, ciod.type);
                }
            }

            if (!entrySetup && !this.config.requireCLSCandle) {
                entrySetup = this.generateFallbackEntry(candles, trend);
            }

            if (!entrySetup) return signal;

            const isPriceInZone = this.orderBlockAnalyzer.isPriceNearOrderBlock(
                currentPrice,
                entrySetup.orderBlock,
                this.config.orderBlockProximity / 100
            );

            if (this.config.requireOrderBlockRetest && !isPriceInZone) return signal;

            const risk = Math.abs(currentPrice - entrySetup.stopLoss) || 0.0001;
            const reward = Math.abs(targetPrice - currentPrice);
            const riskReward = reward / risk;

            if (riskReward < this.config.minRiskReward) return signal;

            signal.action = trend === 'BULLISH' ? 'BUY' : 'SELL';
            signal.stopLoss = entrySetup.stopLoss;
            signal.takeProfit1 = targetPrice;
            signal.confidence = entrySetup.confidence;
            signal.reasoning.push(`Sync Signal: ${signal.action} RR: ${riskReward.toFixed(2)}:1`);

        } catch (error: any) {
            // Silently return no trade
        }

        return signal;
    }
}
