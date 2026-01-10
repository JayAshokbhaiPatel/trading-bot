import { OHLCV } from '../types/market';
import { MarketDataEngine } from './MarketDataEngine';
import { LiquidityAnalyzer, LiquidityLevel } from '../analysis/LiquidityAnalyzer';

export type TrendDirection = 'BULLISH' | 'BEARISH' | 'RANGING';

export interface HTFContext {
    trend: TrendDirection;
    trendStrength: number; // 0-100
    liquidityTarget: number | null;
    liquidityType: 'HIGH' | 'LOW' | null;
    swingHigh: number;
    swingLow: number;
    currentPrice: number;
    reasoning: string[];
}

export interface MultiTimeframeAnalysis {
    daily: HTFContext | null;
    fourHour: HTFContext | null;
    oneHour: OHLCV[];
    alignedTrend: TrendDirection;
    isAligned: boolean; // Are Daily and 4H trends aligned?
    confidence: number;
}

export class MultiTimeframeEngine {
    private marketData: MarketDataEngine;
    private liquidityAnalyzer: LiquidityAnalyzer;
    private cache: Map<string, { data: MultiTimeframeAnalysis; timestamp: number }>;
    private readonly CACHE_TTL = 60000; // 1 minute cache for HTF data

    constructor(marketData?: MarketDataEngine) {
        this.marketData = marketData || new MarketDataEngine();
        this.liquidityAnalyzer = new LiquidityAnalyzer();
        this.cache = new Map();
    }

    /**
     * Get complete multi-timeframe analysis for a symbol
     */
    public async getMultiTimeframeAnalysis(symbol: string): Promise<MultiTimeframeAnalysis> {
        const cacheKey = `mtf:${symbol}`;
        const cached = this.cache.get(cacheKey);
        const now = Date.now();

        if (cached && now - cached.timestamp < this.CACHE_TTL) {
            return cached.data;
        }

        try {
            // Fetch all timeframes
            const [dailyCandles, fourHourCandles, oneHourCandles] = await Promise.all([
                this.marketData.getCandles(symbol, '1d', 100),
                this.marketData.getCandles(symbol, '4h', 200),
                this.marketData.getCandles(symbol, '1h', 500)
            ]);

            // Analyze each timeframe
            const dailyContext = this.analyzeHTFContext(dailyCandles, 'DAILY');
            const fourHourContext = this.analyzeHTFContext(fourHourCandles, '4H');

            // Determine aligned trend
            const { alignedTrend, isAligned, confidence } = this.determineAlignedTrend(
                dailyContext,
                fourHourContext
            );

            const analysis: MultiTimeframeAnalysis = {
                daily: dailyContext,
                fourHour: fourHourContext,
                oneHour: oneHourCandles,
                alignedTrend,
                isAligned,
                confidence
            };

            this.cache.set(cacheKey, { data: analysis, timestamp: now });
            return analysis;

        } catch (error: any) {
            throw new Error(`Failed to get multi-timeframe analysis: ${error.message}`);
        }
    }

    /**
     * Analyze higher timeframe context
     */
    private analyzeHTFContext(candles: OHLCV[], timeframeName: string): HTFContext {
        if (candles.length < 20) {
            return {
                trend: 'RANGING',
                trendStrength: 0,
                liquidityTarget: null,
                liquidityType: null,
                swingHigh: 0,
                swingLow: 0,
                currentPrice: candles[candles.length - 1]?.close || 0,
                reasoning: ['Insufficient data']
            };
        }

        const currentPrice = candles[candles.length - 1].close;
        const reasoning: string[] = [];

        // Determine trend using market structure
        const trend = this.determineHTFTrend(candles);
        const trendStrength = this.calculateTrendStrength(candles, trend);

        reasoning.push(`${timeframeName} trend: ${trend} (strength: ${trendStrength.toFixed(0)}%)`);

        // Find swing high and low
        const lookback = Math.min(50, candles.length);
        const recentCandles = candles.slice(-lookback);
        const swingHigh = Math.max(...recentCandles.map(c => c.high));
        const swingLow = Math.min(...recentCandles.map(c => c.low));

        // Get liquidity target
        const { target, type } = this.getHTFLiquidityTarget(candles, trend);

        if (target && type) {
            const distance = type === 'HIGH' 
                ? ((target - currentPrice) / currentPrice * 100).toFixed(2)
                : ((currentPrice - target) / currentPrice * 100).toFixed(2);
            reasoning.push(`Liquidity target: ${type} at ${target.toFixed(2)} (${distance}% away)`);
        }

        return {
            trend,
            trendStrength,
            liquidityTarget: target,
            liquidityType: type,
            swingHigh,
            swingLow,
            currentPrice,
            reasoning
        };
    }

    /**
     * Determine HTF trend using market structure
     */
    public determineHTFTrend(candles: OHLCV[]): TrendDirection {
        if (candles.length < 20) {
            return 'RANGING';
        }

        // Use last 30 candles for trend determination
        const lookback = Math.min(30, candles.length);
        const recentCandles = candles.slice(-lookback);

        // Find swing highs and lows
        const swingHighs: number[] = [];
        const swingLows: number[] = [];

        for (let i = 5; i < recentCandles.length - 5; i++) {
            const candle = recentCandles[i];
            
            // Check if it's a swing high
            let isSwingHigh = true;
            for (let j = i - 5; j <= i + 5; j++) {
                if (j !== i && recentCandles[j].high >= candle.high) {
                    isSwingHigh = false;
                    break;
                }
            }
            if (isSwingHigh) swingHighs.push(candle.high);

            // Check if it's a swing low
            let isSwingLow = true;
            for (let j = i - 5; j <= i + 5; j++) {
                if (j !== i && recentCandles[j].low <= candle.low) {
                    isSwingLow = false;
                    break;
                }
            }
            if (isSwingLow) swingLows.push(candle.low);
        }

        // Determine trend based on swing structure
        if (swingHighs.length >= 2 && swingLows.length >= 2) {
            const higherHighs = swingHighs[swingHighs.length - 1] > swingHighs[0];
            const higherLows = swingLows[swingLows.length - 1] > swingLows[0];
            const lowerHighs = swingHighs[swingHighs.length - 1] < swingHighs[0];
            const lowerLows = swingLows[swingLows.length - 1] < swingLows[0];

            if (higherHighs && higherLows) {
                return 'BULLISH';
            } else if (lowerHighs && lowerLows) {
                return 'BEARISH';
            }
        }

        // Fallback: Use simple moving average comparison
        const ma20 = this.calculateSMA(recentCandles, 20);
        const ma50 = this.calculateSMA(candles, 50);
        const currentPrice = candles[candles.length - 1].close;

        if (currentPrice > ma20 && ma20 > ma50) {
            return 'BULLISH';
        } else if (currentPrice < ma20 && ma20 < ma50) {
            return 'BEARISH';
        }

        return 'RANGING';
    }

    /**
     * Get HTF liquidity target based on trend
     */
    public getHTFLiquidityTarget(
        candles: OHLCV[],
        trend: TrendDirection
    ): { target: number | null; type: 'HIGH' | 'LOW' | null } {
        if (trend === 'RANGING') {
            return { target: null, type: null };
        }

        if (trend === 'BEARISH') {
            // Look for equal lows below current price
            const nearestLow = this.liquidityAnalyzer.getNearestLiquidityBelow(candles, 100);
            if (nearestLow) {
                return { target: nearestLow.price, type: 'LOW' };
            }
        } else if (trend === 'BULLISH') {
            // Look for equal highs above current price
            const nearestHigh = this.liquidityAnalyzer.getNearestLiquidityAbove(candles, 100);
            if (nearestHigh) {
                return { target: nearestHigh.price, type: 'HIGH' };
            }
        }

        return { target: null, type: null };
    }

    /**
     * Validate if LTF price action aligns with HTF context
     */
    public validateHTFContext(
        ltfPrice: number,
        htfTrend: TrendDirection,
        fibZone: 'PREMIUM' | 'DISCOUNT' | 'EQUILIBRIUM'
    ): { isValid: boolean; reasoning: string } {
        if (htfTrend === 'RANGING') {
            return {
                isValid: false,
                reasoning: 'HTF trend is ranging - no clear direction'
            };
        }

        if (htfTrend === 'BEARISH' && fibZone === 'PREMIUM') {
            return {
                isValid: true,
                reasoning: 'Bearish HTF trend + Premium zone = Valid for shorts'
            };
        }

        if (htfTrend === 'BULLISH' && fibZone === 'DISCOUNT') {
            return {
                isValid: true,
                reasoning: 'Bullish HTF trend + Discount zone = Valid for longs'
            };
        }

        return {
            isValid: false,
            reasoning: `HTF ${htfTrend} trend does not align with ${fibZone} zone`
        };
    }

    /**
     * Determine aligned trend across timeframes
     */
    private determineAlignedTrend(
        daily: HTFContext | null,
        fourHour: HTFContext | null
    ): { alignedTrend: TrendDirection; isAligned: boolean; confidence: number } {
        if (!daily || !fourHour) {
            return { alignedTrend: 'RANGING', isAligned: false, confidence: 0 };
        }

        const dailyTrend = daily.trend;
        const fourHourTrend = fourHour.trend;

        // Check if both timeframes agree
        if (dailyTrend === fourHourTrend && dailyTrend !== 'RANGING') {
            const avgStrength = (daily.trendStrength + fourHour.trendStrength) / 2;
            return {
                alignedTrend: dailyTrend,
                isAligned: true,
                confidence: avgStrength / 100
            };
        }

        // If daily is strong and 4H is ranging, use daily
        if (dailyTrend !== 'RANGING' && fourHourTrend === 'RANGING' && daily.trendStrength > 60) {
            return {
                alignedTrend: dailyTrend,
                isAligned: false,
                confidence: daily.trendStrength / 150 // Reduced confidence
            };
        }

        // No clear alignment
        return {
            alignedTrend: 'RANGING',
            isAligned: false,
            confidence: 0
        };
    }

    /**
     * Calculate trend strength (0-100)
     */
    private calculateTrendStrength(candles: OHLCV[], trend: TrendDirection): number {
        if (trend === 'RANGING') {
            return 0;
        }

        const lookback = Math.min(20, candles.length);
        const recentCandles = candles.slice(-lookback);
        
        let trendingCandles = 0;
        for (let i = 1; i < recentCandles.length; i++) {
            if (trend === 'BULLISH' && recentCandles[i].close > recentCandles[i - 1].close) {
                trendingCandles++;
            } else if (trend === 'BEARISH' && recentCandles[i].close < recentCandles[i - 1].close) {
                trendingCandles++;
            }
        }

        return (trendingCandles / (recentCandles.length - 1)) * 100;
    }

    /**
     * Calculate Simple Moving Average
     */
    private calculateSMA(candles: OHLCV[], period: number): number {
        if (candles.length < period) {
            period = candles.length;
        }

        const recentCandles = candles.slice(-period);
        const sum = recentCandles.reduce((acc, c) => acc + c.close, 0);
        return sum / period;
    }
}
