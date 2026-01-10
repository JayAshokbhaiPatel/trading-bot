import { OHLCV } from '../types/market';

export interface LiquidityLevel {
    price: number;
    type: 'HIGH' | 'LOW';
    strength: number; // Number of times this level was touched
    indices: number[]; // Candle indices where this level exists
    isSwept: boolean;
}

export interface LiquiditySweep {
    level: number;
    type: 'HIGH' | 'LOW';
    sweepIndex: number;
    sweepCandle: OHLCV;
    reversalConfirmed: boolean;
}

export interface LiquidityTarget {
    price: number;
    type: 'RESISTANCE' | 'SUPPORT';
    distance: number; // Distance from current price in %
    strength: number;
}

export class LiquidityAnalyzer {
    private readonly EQUAL_LEVEL_TOLERANCE = 0.002; // 0.2% tolerance for equal levels
    private readonly MIN_TOUCHES = 2; // Minimum touches to consider a liquidity level
    private readonly SWEEP_CONFIRMATION_CANDLES = 3; // Candles to confirm reversal after sweep

    /**
     * Find equal highs in the candle data
     */
    public findEqualHighs(candles: OHLCV[], lookback: number = 50): LiquidityLevel[] {
        if (candles.length < lookback) {
            lookback = candles.length;
        }

        const recentCandles = candles.slice(-lookback);
        const swingHighs = this.findSwingHighs(recentCandles, 3);
        
        return this.groupEqualLevels(swingHighs, 'HIGH', candles.length - lookback);
    }

    /**
     * Find equal lows in the candle data
     */
    public findEqualLows(candles: OHLCV[], lookback: number = 50): LiquidityLevel[] {
        if (candles.length < lookback) {
            lookback = candles.length;
        }

        const recentCandles = candles.slice(-lookback);
        const swingLows = this.findSwingLows(recentCandles, 3);
        
        return this.groupEqualLevels(swingLows, 'LOW', candles.length - lookback);
    }

    /**
     * Detect if a liquidity sweep occurred at a specific level
     */
    public detectLiquiditySweep(
        candles: OHLCV[], 
        level: number, 
        type: 'HIGH' | 'LOW',
        lookback: number = 10
    ): LiquiditySweep | null {
        if (candles.length < lookback + this.SWEEP_CONFIRMATION_CANDLES) {
            return null;
        }

        const recentCandles = candles.slice(-lookback);
        
        for (let i = 0; i < recentCandles.length - this.SWEEP_CONFIRMATION_CANDLES; i++) {
            const candle = recentCandles[i];
            const swept = type === 'HIGH' 
                ? candle.high > level && candle.close < level
                : candle.low < level && candle.close > level;

            if (swept) {
                // Check for reversal confirmation in next candles
                const confirmationCandles = recentCandles.slice(i + 1, i + 1 + this.SWEEP_CONFIRMATION_CANDLES);
                const reversalConfirmed = this.checkReversalConfirmation(confirmationCandles, type);

                return {
                    level,
                    type,
                    sweepIndex: candles.length - lookback + i,
                    sweepCandle: candle,
                    reversalConfirmed
                };
            }
        }

        return null;
    }

    /**
     * Identify liquidity targets based on trend direction
     */
    public identifyLiquidityTargets(
        candles: OHLCV[], 
        trend: 'BULLISH' | 'BEARISH' | 'RANGING',
        lookback: number = 100
    ): LiquidityTarget[] {
        const targets: LiquidityTarget[] = [];
        const currentPrice = candles[candles.length - 1].close;

        if (trend === 'BEARISH') {
            // Look for equal lows as targets
            const equalLows = this.findEqualLows(candles, lookback);
            for (const level of equalLows) {
                if (level.price < currentPrice && level.strength >= this.MIN_TOUCHES) {
                    targets.push({
                        price: level.price,
                        type: 'SUPPORT',
                        distance: ((currentPrice - level.price) / currentPrice) * 100,
                        strength: level.strength
                    });
                }
            }
        } else if (trend === 'BULLISH') {
            // Look for equal highs as targets
            const equalHighs = this.findEqualHighs(candles, lookback);
            for (const level of equalHighs) {
                if (level.price > currentPrice && level.strength >= this.MIN_TOUCHES) {
                    targets.push({
                        price: level.price,
                        type: 'RESISTANCE',
                        distance: ((level.price - currentPrice) / currentPrice) * 100,
                        strength: level.strength
                    });
                }
            }
        }

        // Sort by distance (closest first)
        return targets.sort((a, b) => a.distance - b.distance);
    }

    /**
     * Find swing highs in candle data
     */
    private findSwingHighs(candles: OHLCV[], leftBars: number = 3, rightBars: number = 3): Array<{price: number, index: number}> {
        const swings: Array<{price: number, index: number}> = [];

        for (let i = leftBars; i < candles.length - rightBars; i++) {
            const currentHigh = candles[i].high;
            let isSwingHigh = true;

            // Check left bars
            for (let j = i - leftBars; j < i; j++) {
                if (candles[j].high >= currentHigh) {
                    isSwingHigh = false;
                    break;
                }
            }

            // Check right bars
            if (isSwingHigh) {
                for (let j = i + 1; j <= i + rightBars; j++) {
                    if (candles[j].high >= currentHigh) {
                        isSwingHigh = false;
                        break;
                    }
                }
            }

            if (isSwingHigh) {
                swings.push({ price: currentHigh, index: i });
            }
        }

        return swings;
    }

    /**
     * Find swing lows in candle data
     */
    private findSwingLows(candles: OHLCV[], leftBars: number = 3, rightBars: number = 3): Array<{price: number, index: number}> {
        const swings: Array<{price: number, index: number}> = [];

        for (let i = leftBars; i < candles.length - rightBars; i++) {
            const currentLow = candles[i].low;
            let isSwingLow = true;

            // Check left bars
            for (let j = i - leftBars; j < i; j++) {
                if (candles[j].low <= currentLow) {
                    isSwingLow = false;
                    break;
                }
            }

            // Check right bars
            if (isSwingLow) {
                for (let j = i + 1; j <= i + rightBars; j++) {
                    if (candles[j].low <= currentLow) {
                        isSwingLow = false;
                        break;
                    }
                }
            }

            if (isSwingLow) {
                swings.push({ price: currentLow, index: i });
            }
        }

        return swings;
    }

    /**
     * Group swing points into equal levels
     */
    private groupEqualLevels(
        swings: Array<{price: number, index: number}>, 
        type: 'HIGH' | 'LOW',
        indexOffset: number
    ): LiquidityLevel[] {
        const levels: LiquidityLevel[] = [];

        for (const swing of swings) {
            let foundLevel = false;

            for (const level of levels) {
                const priceDiff = Math.abs(swing.price - level.price) / level.price;
                
                if (priceDiff <= this.EQUAL_LEVEL_TOLERANCE) {
                    // Add to existing level
                    level.indices.push(indexOffset + swing.index);
                    level.strength++;
                    // Update price to average
                    level.price = (level.price * (level.strength - 1) + swing.price) / level.strength;
                    foundLevel = true;
                    break;
                }
            }

            if (!foundLevel) {
                // Create new level
                levels.push({
                    price: swing.price,
                    type,
                    strength: 1,
                    indices: [indexOffset + swing.index],
                    isSwept: false
                });
            }
        }

        // Filter to only include levels with minimum touches
        return levels.filter(l => l.strength >= this.MIN_TOUCHES)
                     .sort((a, b) => b.strength - a.strength);
    }

    /**
     * Check if reversal is confirmed after a sweep
     */
    private checkReversalConfirmation(candles: OHLCV[], sweepType: 'HIGH' | 'LOW'): boolean {
        if (candles.length < this.SWEEP_CONFIRMATION_CANDLES) {
            return false;
        }

        if (sweepType === 'HIGH') {
            // After sweeping highs, expect bearish reversal (lower closes)
            const firstClose = candles[0].close;
            const lastClose = candles[candles.length - 1].close;
            return lastClose < firstClose;
        } else {
            // After sweeping lows, expect bullish reversal (higher closes)
            const firstClose = candles[0].close;
            const lastClose = candles[candles.length - 1].close;
            return lastClose > firstClose;
        }
    }

    /**
     * Get the nearest liquidity level above current price
     */
    public getNearestLiquidityAbove(candles: OHLCV[], lookback: number = 50): LiquidityLevel | null {
        const currentPrice = candles[candles.length - 1].close;
        const equalHighs = this.findEqualHighs(candles, lookback);
        
        const levelsAbove = equalHighs.filter(l => l.price > currentPrice);
        if (levelsAbove.length === 0) return null;

        return levelsAbove.reduce((nearest, current) => 
            (current.price < nearest.price) ? current : nearest
        );
    }

    /**
     * Get the nearest liquidity level below current price
     */
    public getNearestLiquidityBelow(candles: OHLCV[], lookback: number = 50): LiquidityLevel | null {
        const currentPrice = candles[candles.length - 1].close;
        const equalLows = this.findEqualLows(candles, lookback);
        
        const levelsBelow = equalLows.filter(l => l.price < currentPrice);
        if (levelsBelow.length === 0) return null;

        return levelsBelow.reduce((nearest, current) => 
            (current.price > nearest.price) ? current : nearest
        );
    }
}
