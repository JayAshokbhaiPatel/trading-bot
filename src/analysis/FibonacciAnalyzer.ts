import { OHLCV } from '../types/market';

export interface SwingPoints {
    high: number;
    low: number;
    highIndex: number;
    lowIndex: number;
    swingSize: number; // Size of swing in price
    swingSizePercent: number; // Size of swing in %
}

export interface FibonacciLevels {
    level_0: number;    // 0% (swing low for uptrend, swing high for downtrend)
    level_236: number;  // 23.6%
    level_382: number;  // 38.2%
    level_50: number;   // 50% - Equilibrium
    level_618: number;  // 61.8%
    level_786: number;  // 78.6%
    level_100: number;  // 100% (swing high for uptrend, swing low for downtrend)
}

export type PriceZone = 'PREMIUM' | 'DISCOUNT' | 'EQUILIBRIUM';

export interface ZoneInfo {
    zone: PriceZone;
    currentPrice: number;
    equilibrium: number;
    distanceFromEquilibrium: number; // % distance from 50% level
    fibLevel: number; // Actual fib level (0-100)
}

export class FibonacciAnalyzer {
    private readonly MIN_SWING_SIZE_PERCENT = 2; // Minimum 2% swing to be considered significant
    private readonly EQUILIBRIUM_TOLERANCE = 0.5; // 0.5% around 50% is considered equilibrium

    /**
     * Find the last significant swing in the candle data
     */
    public findLastSwing(candles: OHLCV[], minSwingSize?: number): SwingPoints | null {
        if (candles.length < 10) {
            return null;
        }

        const minSize = minSwingSize || this.MIN_SWING_SIZE_PERCENT;
        
        // Look for the most recent significant swing
        // We'll search backwards for a swing high and swing low
        let swingHigh = -Infinity;
        let swingLow = Infinity;
        let highIndex = -1;
        let lowIndex = -1;

        // Start from recent candles and work backwards
        const lookback = Math.min(100, candles.length);
        const recentCandles = candles.slice(-lookback);

        for (let i = 0; i < recentCandles.length; i++) {
            if (recentCandles[i].high > swingHigh) {
                swingHigh = recentCandles[i].high;
                highIndex = candles.length - lookback + i;
            }
            if (recentCandles[i].low < swingLow) {
                swingLow = recentCandles[i].low;
                lowIndex = candles.length - lookback + i;
            }
        }

        if (swingHigh === -Infinity || swingLow === Infinity) {
            return null;
        }

        const swingSize = swingHigh - swingLow;
        const swingSizePercent = (swingSize / swingLow) * 100;

        // Check if swing is significant enough
        if (swingSizePercent < minSize) {
            return null;
        }

        return {
            high: swingHigh,
            low: swingLow,
            highIndex,
            lowIndex,
            swingSize,
            swingSizePercent
        };
    }

    /**
     * Calculate Fibonacci retracement levels
     */
    public calculateFibLevels(swingHigh: number, swingLow: number): FibonacciLevels {
        const range = swingHigh - swingLow;

        return {
            level_0: swingLow,
            level_236: swingLow + (range * 0.236),
            level_382: swingLow + (range * 0.382),
            level_50: swingLow + (range * 0.50),
            level_618: swingLow + (range * 0.618),
            level_786: swingLow + (range * 0.786),
            level_100: swingHigh
        };
    }

    /**
     * Determine which zone the current price is in
     */
    public getCurrentZone(currentPrice: number, fibLevels: FibonacciLevels): PriceZone {
        const equilibrium = fibLevels.level_50;
        const range = fibLevels.level_100 - fibLevels.level_0;
        const toleranceAmount = range * (this.EQUILIBRIUM_TOLERANCE / 100);

        if (currentPrice >= equilibrium - toleranceAmount && 
            currentPrice <= equilibrium + toleranceAmount) {
            return 'EQUILIBRIUM';
        } else if (currentPrice > equilibrium + toleranceAmount) {
            return 'PREMIUM';
        } else {
            return 'DISCOUNT';
        }
    }

    /**
     * Get detailed zone information for current price
     */
    public getZoneInfo(currentPrice: number, fibLevels: FibonacciLevels): ZoneInfo {
        const zone = this.getCurrentZone(currentPrice, fibLevels);
        const equilibrium = fibLevels.level_50;
        const distanceFromEquilibrium = ((currentPrice - equilibrium) / equilibrium) * 100;
        
        // Calculate actual fib level (0-100)
        const range = fibLevels.level_100 - fibLevels.level_0;
        const fibLevel = ((currentPrice - fibLevels.level_0) / range) * 100;

        return {
            zone,
            currentPrice,
            equilibrium,
            distanceFromEquilibrium,
            fibLevel: Math.max(0, Math.min(100, fibLevel))
        };
    }

    /**
     * Validate if current zone is appropriate for the trend direction
     * Bearish trend: Should be in PREMIUM zone (above 50%)
     * Bullish trend: Should be in DISCOUNT zone (below 50%)
     */
    public isValidZoneForTrend(
        zone: PriceZone, 
        trend: 'BULLISH' | 'BEARISH' | 'RANGING'
    ): boolean {
        if (trend === 'RANGING') {
            return false; // Don't trade in ranging markets
        }

        if (trend === 'BEARISH') {
            return zone === 'PREMIUM';
        } else if (trend === 'BULLISH') {
            return zone === 'DISCOUNT';
        }

        return false;
    }

    /**
     * Check if price is in deep premium/discount (better entry zones)
     * Deep premium: Above 61.8%
     * Deep discount: Below 38.2%
     */
    public isDeepZone(currentPrice: number, fibLevels: FibonacciLevels, trend: 'BULLISH' | 'BEARISH'): boolean {
        if (trend === 'BEARISH') {
            // For bearish, we want deep premium (above 61.8%)
            return currentPrice >= fibLevels.level_618;
        } else if (trend === 'BULLISH') {
            // For bullish, we want deep discount (below 38.2%)
            return currentPrice <= fibLevels.level_382;
        }
        return false;
    }

    /**
     * Get the optimal entry zone range for a given trend
     */
    public getOptimalEntryZone(
        fibLevels: FibonacciLevels, 
        trend: 'BULLISH' | 'BEARISH'
    ): { min: number; max: number; description: string } {
        if (trend === 'BEARISH') {
            // For bearish entries, premium zone (50% - 78.6% is optimal)
            return {
                min: fibLevels.level_50,
                max: fibLevels.level_786,
                description: 'Premium Zone (50-78.6%)'
            };
        } else {
            // For bullish entries, discount zone (23.6% - 50% is optimal)
            return {
                min: fibLevels.level_236,
                max: fibLevels.level_50,
                description: 'Discount Zone (23.6-50%)'
            };
        }
    }

    /**
     * Analyze complete Fibonacci context for trading decision
     */
    public analyzeFibonacciContext(
        candles: OHLCV[], 
        trend: 'BULLISH' | 'BEARISH' | 'RANGING'
    ): {
        swing: SwingPoints | null;
        fibLevels: FibonacciLevels | null;
        zoneInfo: ZoneInfo | null;
        isValidForEntry: boolean;
        isDeepZone: boolean;
        reasoning: string;
    } {
        const swing = this.findLastSwing(candles);
        
        if (!swing) {
            return {
                swing: null,
                fibLevels: null,
                zoneInfo: null,
                isValidForEntry: false,
                isDeepZone: false,
                reasoning: 'No significant swing found'
            };
        }

        const fibLevels = this.calculateFibLevels(swing.high, swing.low);
        const currentPrice = candles[candles.length - 1].close;
        const zoneInfo = this.getZoneInfo(currentPrice, fibLevels);
        const isValidForEntry = this.isValidZoneForTrend(zoneInfo.zone, trend);
        const isDeep = (trend !== 'RANGING') ? this.isDeepZone(currentPrice, fibLevels, trend) : false;

        let reasoning = `Price at ${zoneInfo.fibLevel.toFixed(1)}% Fib (${zoneInfo.zone} zone)`;
        
        if (trend === 'RANGING') {
            reasoning += ' - No trend, skip';
        } else if (!isValidForEntry) {
            reasoning += ` - Wrong zone for ${trend} trend`;
        } else {
            reasoning += ` - Valid ${zoneInfo.zone} zone for ${trend} trend`;
            if (isDeep) {
                reasoning += ' (Deep zone - optimal)';
            }
        }

        return {
            swing,
            fibLevels,
            zoneInfo,
            isValidForEntry,
            isDeepZone: isDeep,
            reasoning
        };
    }
}
