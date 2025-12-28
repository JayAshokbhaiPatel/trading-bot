import { OHLCV } from '../types/market';
import { TradeSignal } from '../types/trading';
import { PatternDetector } from '../analysis/PatternDetector';
import { ZoneDetector } from '../analysis/ZoneDetector';
import { BreakoutDetector } from '../analysis/BreakoutDetector';
import { VolumeAnalyzer } from '../analysis/VolumeAnalyzer';
import { MarketRegimeDetector } from '../analysis/MarketRegimeDetector';
import { PatternType } from '../types/analysis';
import { calculateRSI, calculateMACD, calculateMA, calculateATR } from '../analysis/indicators';

interface ConfluenceTracker {
    bullish: string[];
    bearish: string[];
}

interface SignalQuality {
    score: number;
    grade: 'A+' | 'A' | 'B' | 'C' | 'D';
    confluenceCount: number;
    regimeMatch: boolean;
    htfAligned: boolean;
    volumeConfirmed: boolean;
}

export class StrategyEngine {
    private patternDetector: PatternDetector;
    private zoneDetector: ZoneDetector;
    private breakoutDetector: BreakoutDetector;
    private volumeAnalyzer: VolumeAnalyzer;
    private regimeDetector: MarketRegimeDetector;

    constructor() {
        this.patternDetector = new PatternDetector();
        this.zoneDetector = new ZoneDetector();
        this.breakoutDetector = new BreakoutDetector();
        this.volumeAnalyzer = new VolumeAnalyzer();
        this.regimeDetector = new MarketRegimeDetector();
    }

    public evaluate(candles: OHLCV[], timeframe: string = '1h'): TradeSignal {
        if (candles.length < 50) {
            return this.createSignal('NO_TRADE', 0, ['Insufficient data (need 50+)'], candles[candles.length - 1]?.close || 0);
        }

        const currentCandle = candles[candles.length - 1];
        const currentPrice = currentCandle.close;
        const prices = candles.map(c => c.close);
        const reasoning: string[] = [];
        
        // Confluence tracker for independent confirmations
        const confluence: ConfluenceTracker = { bullish: [], bearish: [] };

        // ═══════════════════════════════════════════════════════════════
        // 1️⃣ MARKET REGIME DETECTION (NEW)
        // ═══════════════════════════════════════════════════════════════
        const regime = this.regimeDetector.detect(candles);
        reasoning.push(`📊 Regime: ${regime.regime} (ADX: ${regime.adx.toFixed(1)})`);

        // ═══════════════════════════════════════════════════════════════
        // 2️⃣ HIGHER TIMEFRAME TREND BIAS (NEW)
        // ═══════════════════════════════════════════════════════════════
        const ma50 = calculateMA(prices, 50);
        const ma200 = calculateMA(prices, 200) || calculateMA(prices, 100); // Fallback to MA100
        
        let htfTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
        if (ma50 && ma200) {
            if (ma50 > ma200 && currentPrice > ma50) {
                htfTrend = 'BULLISH';
                reasoning.push(`📈 HTF Trend: BULLISH (MA50 > MA200)`);
            } else if (ma50 < ma200 && currentPrice < ma50) {
                htfTrend = 'BEARISH';
                reasoning.push(`📉 HTF Trend: BEARISH (MA50 < MA200)`);
            } else {
                reasoning.push(`➖ HTF Trend: NEUTRAL`);
            }
        }

        // ═══════════════════════════════════════════════════════════════
        // DETECT COMPONENTS
        // ═══════════════════════════════════════════════════════════════
        const zones = this.zoneDetector.detectZones(candles);
        const patterns = this.patternDetector.detect(candles);
        const breakouts = this.breakoutDetector.detectBreakouts(candles, zones);
        const volumeAnalysis = this.volumeAnalyzer.analyze(candles);

        // Calculate Indicators
        const rsi = calculateRSI(prices);
        const macd = calculateMACD(prices);
        const ma20 = calculateMA(prices, 20);
        const atr = calculateATR(candles, 14);

        // ═══════════════════════════════════════════════════════════════
        // SCORE CALCULATION WITH CONFLUENCE TRACKING
        // ═══════════════════════════════════════════════════════════════
        let bullishScore = 0;
        let bearishScore = 0;

        // A. Candlestick Patterns
        const BULLISH_PATTERNS = new Set([
            PatternType.HAMMER, PatternType.BULLISH_ENGULFING, PatternType.MORNING_STAR,
            PatternType.PIERCING_LINE, PatternType.THREE_WHITE_SOLDIERS, PatternType.BULLISH_KICKER,
            PatternType.INVERTED_HAMMER
        ]);
        
        const BEARISH_PATTERNS = new Set([
            PatternType.SHOOTING_STAR, PatternType.BEARISH_ENGULFING, PatternType.EVENING_STAR,
            PatternType.DARK_CLOUD_COVER, PatternType.THREE_BLACK_CROWS, PatternType.BEARISH_KICKER
        ]);

        for (const pattern of patterns) {
            if (BULLISH_PATTERNS.has(pattern.type)) {
                bullishScore += pattern.confidence * 2;
                confluence.bullish.push(`Pattern:${pattern.type}`);
                reasoning.push(`Bullish Pattern: ${pattern.type}`);
            } else if (BEARISH_PATTERNS.has(pattern.type)) {
                bearishScore += pattern.confidence * 2;
                confluence.bearish.push(`Pattern:${pattern.type}`);
                reasoning.push(`Bearish Pattern: ${pattern.type}`);
            }
        }

        // B. S/R Breakouts
        for (const breakout of breakouts) {
            if (breakout.isFakeout) {
                if (breakout.type === 'BULLISH_BREAKOUT') {
                    bearishScore += breakout.confidence * 2.0;
                    confluence.bearish.push('Fakeout:Resistance');
                } else {
                    bullishScore += breakout.confidence * 2.0;
                    confluence.bullish.push('Fakeout:Support');
                }
            } else {
                if (breakout.type === 'BULLISH_BREAKOUT') {
                    bullishScore += breakout.confidence * 2.5;
                    confluence.bullish.push('Breakout:Resistance');
                } else {
                    bearishScore += breakout.confidence * 2.5;
                    confluence.bearish.push('Breakout:Support');
                }
            }
        }

        // C. RSI
        if (rsi) {
            if (rsi.signal === 'OVERSOLD') {
                bullishScore += 1.5;
                confluence.bullish.push('RSI:Oversold');
                reasoning.push(`RSI Oversold (${rsi.rsi})`);
            } else if (rsi.signal === 'OVERBOUGHT') {
                bearishScore += 1.5;
                confluence.bearish.push('RSI:Overbought');
                reasoning.push(`RSI Overbought (${rsi.rsi})`);
            }
        }

        // D. MACD
        if (macd) {
            if (macd.signal === 'BULLISH') {
                bullishScore += 1.5;
                confluence.bullish.push('MACD:Bullish');
                reasoning.push(`MACD Bullish`);
            } else {
                bearishScore += 1.5;
                confluence.bearish.push('MACD:Bearish');
                reasoning.push(`MACD Bearish`);
            }
        }

        // E. MA Trend
        if (ma20 && ma50) {
            if (currentPrice > ma20 && currentPrice > ma50) {
                bullishScore += 1;
                confluence.bullish.push('MA:Above');
            } else if (currentPrice < ma20 && currentPrice < ma50) {
                bearishScore += 1;
                confluence.bearish.push('MA:Below');
            }
        }

        // F. Volume Confirmation
        let volumeConfirmed = false;
        if (volumeAnalysis.obv.signal === 'BULLISH') {
            bullishScore += 1.5;
            confluence.bullish.push('OBV:Bullish');
        } else {
            bearishScore += 1.5;
            confluence.bearish.push('OBV:Bearish');
        }

        if (volumeAnalysis.ad.trend === 'BULLISH') {
            bullishScore += 1.5;
            confluence.bullish.push('AD:Bullish');
        } else {
            bearishScore += 1.5;
            confluence.bearish.push('AD:Bearish');
        }

        if (volumeAnalysis.isSpike) {
            volumeConfirmed = true;
            if (currentCandle.close > currentCandle.open) {
                bullishScore += 2.0;
                confluence.bullish.push('Volume:Spike');
            } else {
                bearishScore += 2.0;
                confluence.bearish.push('Volume:Spike');
            }
        }

        // ═══════════════════════════════════════════════════════════════
        // PRELIMINARY DECISION
        // ═══════════════════════════════════════════════════════════════
        let action: 'BUY' | 'SELL' | 'NO_TRADE' = 'NO_TRADE';
        let confidence = 0;

        if (bullishScore > bearishScore && bullishScore > 5) {
            action = 'BUY';
            confidence = Math.min(bullishScore / 15, 1.0);
        } else if (bearishScore > bullishScore && bearishScore > 5) {
            action = 'SELL';
            confidence = Math.min(bearishScore / 15, 1.0);
        }

        // ═══════════════════════════════════════════════════════════════
        // 2️⃣ CONFLUENCE GATE (Minimum 2 confirmations)
        // ═══════════════════════════════════════════════════════════════
        const relevantConfluence = action === 'BUY' ? confluence.bullish : confluence.bearish;
        const uniqueCategories = new Set(relevantConfluence.map(c => c.split(':')[0]));
        
        if (action !== 'NO_TRADE' && uniqueCategories.size < 2) {
            reasoning.push(`❌ Confluence Gate Failed: Only ${uniqueCategories.size}/2 independent confirmations`);
            reasoning.push(`   Confirmations: ${Array.from(uniqueCategories).join(', ')}`);
            return this.createSignal('NO_TRADE', 0, reasoning, currentPrice);
        }
        
        if (action !== 'NO_TRADE') {
            reasoning.push(`✅ Confluence: ${uniqueCategories.size} confirmations (${Array.from(uniqueCategories).join(', ')})`);
        }

        // ═══════════════════════════════════════════════════════════════
        // 1️⃣ MARKET REGIME FILTER
        // ═══════════════════════════════════════════════════════════════
        if (action !== 'NO_TRADE') {
            const isBreakoutTrade = breakouts.length > 0 && !breakouts.some(b => b.isFakeout);
            const isReversalTrade = patterns.length > 0 || (rsi && (rsi.signal === 'OVERSOLD' || rsi.signal === 'OVERBOUGHT'));
            
            if (regime.regime === 'RANGING' && isBreakoutTrade && !isReversalTrade) {
                reasoning.push(`❌ Regime Mismatch: Breakout trade in RANGING market`);
                return this.createSignal('NO_TRADE', 0, reasoning, currentPrice);
            }
            
            if ((regime.regime === 'TRENDING_UP' || regime.regime === 'TRENDING_DOWN') && isReversalTrade && !isBreakoutTrade) {
                reasoning.push(`❌ Regime Mismatch: Reversal trade in TRENDING market`);
                return this.createSignal('NO_TRADE', 0, reasoning, currentPrice);
            }
            
            reasoning.push(`✅ Regime Match: ${regime.regime}`);
        }

        // ═══════════════════════════════════════════════════════════════
        // 3️⃣ HIGHER TIMEFRAME TREND ALIGNMENT
        // ═══════════════════════════════════════════════════════════════
        let htfAligned = false;
        if (action !== 'NO_TRADE') {
            // HTF is now a SOFT filter (warning, not rejection)
            if (action === 'BUY' && htfTrend === 'BEARISH') {
                reasoning.push(`⚠️ HTF Warning: BUY against BEARISH HTF trend (proceed with smaller size)`);
                confidence = confidence * 0.7; // Reduce confidence
            }
            if (action === 'SELL' && htfTrend === 'BULLISH') {
                reasoning.push(`⚠️ HTF Warning: SELL against BULLISH HTF trend (proceed with smaller size)`);
                confidence = confidence * 0.7; // Reduce confidence
            }
            
            htfAligned = (action === 'BUY' && htfTrend === 'BULLISH') || 
                         (action === 'SELL' && htfTrend === 'BEARISH');
            
            if (htfAligned) {
                reasoning.push(`✅ HTF Aligned: ${action} with ${htfTrend} trend`);
            } else {
                reasoning.push(`➖ HTF Neutral: Proceeding with caution`);
            }
        }

        // ═══════════════════════════════════════════════════════════════
        // 4️⃣ ZONE-AWARE SL/TP (Priority over ATR)
        // ═══════════════════════════════════════════════════════════════
        let stopLoss: number | undefined;
        let takeProfit1: number | undefined;
        let takeProfit2: number | undefined;
        let slMethod = 'ATR';
        let tpMethod = 'ATR';

        if (action !== 'NO_TRADE') {
            // Sort zones by distance from current price
            const sortedZones = [...zones].sort((a, b) => 
                Math.abs(a.center - currentPrice) - Math.abs(b.center - currentPrice)
            );

            if (action === 'BUY') {
                // SL: Find zone below current price
                const supportZone = sortedZones.find(z => z.center < currentPrice);
                if (supportZone && (currentPrice - supportZone.min) < (atr * 3)) {
                    stopLoss = Number((supportZone.min - (atr * 0.5)).toFixed(2));
                    slMethod = 'Zone';
                } else {
                    stopLoss = Number((currentPrice - (atr * 2)).toFixed(2));
                }

                // TP: Find zones above current price
                const resistanceZones = sortedZones.filter(z => z.center > currentPrice);
                if (resistanceZones.length >= 1) {
                    takeProfit1 = Number(resistanceZones[0].center.toFixed(2));
                    tpMethod = 'Zone';
                } else {
                    takeProfit1 = Number((currentPrice + (atr * 2)).toFixed(2));
                }
                
                if (resistanceZones.length >= 2) {
                    takeProfit2 = Number(resistanceZones[1].center.toFixed(2));
                } else {
                    takeProfit2 = Number((currentPrice + (atr * 3)).toFixed(2));
                }
            } else {
                // SELL logic
                const resistanceZone = sortedZones.find(z => z.center > currentPrice);
                if (resistanceZone && (resistanceZone.max - currentPrice) < (atr * 3)) {
                    stopLoss = Number((resistanceZone.max + (atr * 0.5)).toFixed(2));
                    slMethod = 'Zone';
                } else {
                    stopLoss = Number((currentPrice + (atr * 2)).toFixed(2));
                }

                const supportZones = sortedZones.filter(z => z.center < currentPrice);
                if (supportZones.length >= 1) {
                    takeProfit1 = Number(supportZones[0].center.toFixed(2));
                    tpMethod = 'Zone';
                } else {
                    takeProfit1 = Number((currentPrice - (atr * 2)).toFixed(2));
                }
                
                if (supportZones.length >= 2) {
                    takeProfit2 = Number(supportZones[1].center.toFixed(2));
                } else {
                    takeProfit2 = Number((currentPrice - (atr * 3)).toFixed(2));
                }
            }

            reasoning.push(`SL: ${stopLoss} (${slMethod}), TP1: ${takeProfit1} (${tpMethod}), TP2: ${takeProfit2}`);
        }

        // ═══════════════════════════════════════════════════════════════
        // 5️⃣ SIGNAL QUALITY SCORE
        // ═══════════════════════════════════════════════════════════════
        if (action !== 'NO_TRADE') {
            const quality = this.calculateSignalQuality(
                uniqueCategories.size,
                regime.regime !== 'CHOPPY',
                htfAligned,
                volumeConfirmed
            );

            reasoning.push(`\n📊 SIGNAL QUALITY: ${quality.grade} (${quality.score}/100)`);
            reasoning.push(`   Confluence: ${quality.confluenceCount}, Regime: ${quality.regimeMatch ? '✓' : '✗'}, HTF: ${quality.htfAligned ? '✓' : '✗'}, Volume: ${quality.volumeConfirmed ? '✓' : '✗'}`);

            if (quality.score < 45) {
                reasoning.push(`❌ Quality Score ${quality.score} < 45 - Trade rejected`);
                return this.createSignal('NO_TRADE', 0, reasoning, currentPrice);
            }

            // Adjust confidence based on quality
            confidence = confidence * (quality.score / 100);
        }

        // ═══════════════════════════════════════════════════════════════
        // RISK/REWARD VALIDATION
        // ═══════════════════════════════════════════════════════════════
        if (action !== 'NO_TRADE' && stopLoss && takeProfit1) {
            const risk = Math.abs(currentPrice - stopLoss);
            const reward = Math.abs(takeProfit1 - currentPrice);
            const rrRatio = reward / risk;
            
            if (rrRatio < 1.5) {
                reasoning.push(`❌ R:R ${rrRatio.toFixed(2)} < 1.5 - Trade rejected`);
                return this.createSignal('NO_TRADE', 0, reasoning, currentPrice, stopLoss, takeProfit1, takeProfit2, timeframe);
            }
            
            reasoning.push(`✅ R:R ${rrRatio.toFixed(2)} meets minimum 1:1.5`);
        }

        return this.createSignal(action, Number(confidence.toFixed(2)), reasoning, currentPrice, stopLoss, takeProfit1, takeProfit2, timeframe);
    }

    private calculateSignalQuality(
        confluenceCount: number,
        regimeMatch: boolean,
        htfAligned: boolean,
        volumeConfirmed: boolean
    ): SignalQuality {
        let score = 0;
        
        // Confluence (max 40 points)
        score += Math.min(confluenceCount * 10, 40);
        
        // Regime match (20 points)
        if (regimeMatch) score += 20;
        
        // HTF alignment (25 points)
        if (htfAligned) score += 25;
        
        // Volume confirmation (15 points)
        if (volumeConfirmed) score += 15;

        let grade: 'A+' | 'A' | 'B' | 'C' | 'D';
        if (score >= 85) grade = 'A+';
        else if (score >= 70) grade = 'A';
        else if (score >= 60) grade = 'B';
        else if (score >= 50) grade = 'C';
        else grade = 'D';
        

        return { score, grade, confluenceCount, regimeMatch, htfAligned, volumeConfirmed };
    }

    private createSignal(
        action: 'BUY' | 'SELL' | 'NO_TRADE', 
        confidence: number, 
        reasoning: string[],
        price: number,
        stopLoss?: number,
        takeProfit1?: number,
        takeProfit2?: number,
        timeframe?: string
    ): TradeSignal {
        return {
            action,
            confidence,
            reasoning,
            price,
            timestamp: Date.now(),
            stopLoss,
            takeProfit1,
            takeProfit2,
            timeframe
        };
    }
}
