import { OHLCV } from '../types/market';
import { TradeSignal } from '../types/trading';
import { OrderBlockAnalyzer, CLSCandle, EntryOrderBlock } from '../analysis/OrderBlockAnalyzer';
import { SMCAnalyzer } from '../analysis/SMCAnalyzer';
import { StrategyConfig, OPTIMIZED_CONFIG } from '../config/StrategyConfig';

/**
 * Pure SMC Strategy Engine
 * Based on Market Structure, Dealing Ranges, and Order Blocks.
 */
export class StrategyEngine {
    private orderBlockAnalyzer: OrderBlockAnalyzer;
    private smcAnalyzer: SMCAnalyzer;
    private config: StrategyConfig;

    private readonly MIN_SL_DISTANCE_PERCENT = 0.2; // 0.2% minimum stop distance
    private readonly MAX_RR_CAP = 10; // Cap RR at 10:1 for sizing stability

    constructor(config: StrategyConfig = OPTIMIZED_CONFIG) {
        this.orderBlockAnalyzer = new OrderBlockAnalyzer();
        this.smcAnalyzer = new SMCAnalyzer();
        this.config = config;
    }

    /**
     * Evaluate trading opportunity using pure SMC (Async)
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

        if (candles.length < 100) {
            signal.reasoning.push('❌ Insufficient candle data');
            return signal;
        }

        try {
            // STEP 1: SMC Analysis
            const smcAnalysis = this.smcAnalyzer.analyze(candles);
            const trend = smcAnalysis.structure; // BULLISH, BEARISH, or RANGING

            if (trend === 'RANGING') {
                signal.reasoning.push('❌ Market structure is RANGING');
                return signal;
            }

            signal.reasoning.push(`✅ Market Structure: ${trend}`);

            // STEP 2: Dealing Range Filter (Premium vs Discount)
            if (smcAnalysis.dealingRange) {
                const dr = smcAnalysis.dealingRange;
                const isPremium = currentPrice > dr.equilibrium;
                
                if (trend === 'BULLISH' && isPremium) {
                    signal.reasoning.push('❌ BUY filtered: Price in Premium zone');
                    return signal;
                }
                if (trend === 'BEARISH' && !isPremium) {
                    signal.reasoning.push('❌ SELL filtered: Price in Discount zone');
                    return signal;
                }
                signal.reasoning.push(`✅ Price in ${trend === 'BULLISH' ? 'Discount' : 'Premium'} zone`);
            }

            // STEP 3: Entry Setup (Turtle Soup or OB Setup)
            let entrySetup = null;
            const turtleSoup = this.orderBlockAnalyzer.detectTurtleSoup(candles);

            if (turtleSoup && ((trend === 'BULLISH' && turtleSoup.type === 'BULLISH') || (trend === 'BEARISH' && turtleSoup.type === 'BEARISH'))) {
                signal.reasoning.push(`🐢 Turtle Soup ${turtleSoup.type} detected!`);
                entrySetup = {
                    orderBlock: { high: 0, low: 0, index: turtleSoup.index, type: trend === 'BULLISH' ? 'BULLISH' : 'BEARISH' },
                    stopLoss: turtleSoup.stopLoss,
                    confidence: 0.85
                };
            }

            if (!entrySetup) {
                // Look for most recent unmitigated OB in direction of trend
                const obs = this.orderBlockAnalyzer.detectOrderBlocks(candles);
                const validOBs = obs.filter(ob => ob.type === trend && !ob.isMitigated);
                
                if (validOBs.length > 0) {
                    const ob = validOBs[validOBs.length - 1];
                    const isNear = this.orderBlockAnalyzer.isPriceNearOrderBlock(currentPrice, ob, 0.005); // 0.5% proximity
                    
                    if (isNear) {
                        signal.reasoning.push(`✅ Price near valid ${trend} Order Block`);
                        entrySetup = {
                            orderBlock: ob,
                            stopLoss: trend === 'BULLISH' ? ob.low * 0.998 : ob.high * 1.002,
                            confidence: 0.7
                        };
                    }
                }
            }

            if (!entrySetup) {
                signal.reasoning.push('⏳ Waiting for valid SMC entry setup');
                return signal;
            }

            // STEP 4: Target Projection using Standard Deviation
            let finalTarget = currentPrice;
            const lastBreak = smcAnalysis.breaks.pop();
            if (lastBreak) {
                const sdTargets = this.smcAnalyzer.calculateSDTargets(lastBreak.price, currentPrice);
                finalTarget = sdTargets[0].price; // Use 2.0 SD
                signal.reasoning.push(`🎯 SD-based Target (2.0 SD): ${finalTarget.toFixed(2)}`);
            } else {
                // Fallback target based on structural high/low
                const range = smcAnalysis.dealingRange;
                finalTarget = trend === 'BULLISH' ? (range?.high || currentPrice * 1.05) : (range?.low || currentPrice * 0.95);
                signal.reasoning.push('🎯 Structural target applied');
            }

            // STEP 5: Risk-Reward and SL Safety
            let risk = Math.abs(currentPrice - entrySetup.stopLoss) || 0.0001;
            const minRisk = currentPrice * (this.MIN_SL_DISTANCE_PERCENT / 100);
            
            if (risk < minRisk) {
                signal.reasoning.push(`⚠️ Stop loss too tight, adjusting to ${this.MIN_SL_DISTANCE_PERCENT}% floor`);
                entrySetup.stopLoss = trend === 'BULLISH' ? currentPrice - minRisk : currentPrice + minRisk;
                risk = minRisk;
            }

            const reward = Math.abs(finalTarget - currentPrice);
            let riskReward = reward / risk;

            if (riskReward > this.MAX_RR_CAP) {
                signal.reasoning.push(`⚠️ RR capped at ${this.MAX_RR_CAP}:1`);
                riskReward = this.MAX_RR_CAP;
            }

            if (riskReward < this.config.minRiskReward) {
                signal.reasoning.push(`❌ RR too low: ${riskReward.toFixed(2)}:1`);
                return signal;
            }

            // SUCCESS: Generate Signal
            signal.action = trend === 'BULLISH' ? 'BUY' : 'SELL';
            signal.stopLoss = entrySetup.stopLoss;
            signal.takeProfit1 = finalTarget;
            signal.confidence = Math.max(0.2, Math.min(0.95, entrySetup.confidence));

            signal.reasoning.push(`🎯 Pure SMC ${signal.action} Generated | RR: ${riskReward.toFixed(2)}:1`);

        } catch (error: any) {
             signal.reasoning.push(`❌ Strategy Error: ${error.message}`);
        }

        return signal;
    }

    /**
     * Synchronous evaluate method for backtesting (Pure SMC)
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
            const smc = this.smcAnalyzer.analyze(candles);
            const trend = smc.structure;
            if (trend === 'RANGING') return signal;

            // Simple OB check for sync evaluate
            const obs = this.orderBlockAnalyzer.detectOrderBlocks(candles);
            const validOBs = obs.filter(ob => ob.type === trend && !ob.isMitigated);
            if (validOBs.length === 0) return signal;

            const ob = validOBs[validOBs.length - 1];
            if (!this.orderBlockAnalyzer.isPriceNearOrderBlock(currentPrice, ob, 0.01)) return signal;

            let stopLoss = trend === 'BULLISH' ? ob.low : ob.high;
            const target = trend === 'BULLISH' ? (smc.dealingRange?.high || currentPrice * 1.02) : (smc.dealingRange?.low || currentPrice * 0.98);

            // RISK SAFEGUARDS
            let risk = Math.abs(currentPrice - stopLoss) || 0.0001;
            const minRisk = currentPrice * (this.MIN_SL_DISTANCE_PERCENT / 100);
            
            if (risk < minRisk) {
                stopLoss = trend === 'BULLISH' ? currentPrice - minRisk : currentPrice + minRisk;
                risk = minRisk;
            }

            const reward = Math.abs(target - currentPrice);
            let rr = reward / risk;

            if (rr > this.MAX_RR_CAP) {
                rr = this.MAX_RR_CAP;
            }

            if (rr < this.config.minRiskReward) return signal;

            signal.action = trend === 'BULLISH' ? 'BUY' : 'SELL';
            signal.stopLoss = stopLoss;
            signal.takeProfit1 = target;
            signal.confidence = 0.6;
            signal.reasoning.push(`SMC Sync: ${signal.action} RR: ${rr.toFixed(2)}:1`);

        } catch (error) {
            // Silence
        }

        return signal;
    }
}
