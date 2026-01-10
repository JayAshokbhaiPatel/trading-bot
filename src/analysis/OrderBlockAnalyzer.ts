import { OHLCV } from '../types/market';

export interface OrderBlock {
    price: number;
    high: number;
    low: number;
    type: 'BULLISH' | 'BEARISH';
    index: number;
    candle: OHLCV;
    strength: number; // Based on the size of the move away from it
    isMitigated: boolean; // Has price returned to this OB?
}

export interface CLSCandle {
    candle: OHLCV;
    index: number;
    type: 'BULLISH' | 'BEARISH'; // Direction of expected reversal
    liquidityLevel: number;
    sweptLevel: boolean;
    wickSize: number; // Size of the wick that swept liquidity
}

export interface CIOD {
    index: number;
    type: 'BULLISH' | 'BEARISH';
    candle: OHLCV;
    breakLevel: number; // The level that was broken to confirm CIOD
    strength: number;
}

export interface EntryOrderBlock {
    orderBlock: OrderBlock;
    ciod: CIOD;
    entryZone: { high: number; low: number };
    stopLoss: number;
    confidence: number;
}

export class OrderBlockAnalyzer {
    private readonly MIN_OB_MOVE_PERCENT = 1.5; // Minimum 1.5% move to create valid OB
    private readonly CLS_WICK_MIN_PERCENT = 0.3; // Minimum wick size for CLS
    private readonly CIOD_LOOKBACK = 5; // Candles to look for CIOD after CLS

    /**
     * Detect order blocks in candle data
     */
    public detectOrderBlocks(candles: OHLCV[], lookback: number = 50): OrderBlock[] {
        if (candles.length < 10) {
            return [];
        }

        const orderBlocks: OrderBlock[] = [];
        const startIndex = Math.max(0, candles.length - lookback);

        for (let i = startIndex; i < candles.length - 3; i++) {
            const currentCandle = candles[i];
            
            // Check for bullish order block (strong move up after this candle)
            const bullishOB = this.checkBullishOrderBlock(candles, i);
            if (bullishOB) {
                orderBlocks.push(bullishOB);
            }

            // Check for bearish order block (strong move down after this candle)
            const bearishOB = this.checkBearishOrderBlock(candles, i);
            if (bearishOB) {
                orderBlocks.push(bearishOB);
            }
        }

        return orderBlocks.filter(ob => !ob.isMitigated);
    }

    /**
     * Check if a candle is a CLS (Candle Liquidity Sweep) candle
     */
    public isCLSCandle(
        candle: OHLCV,
        htfLevel: number,
        trend: 'BULLISH' | 'BEARISH',
        tolerance: number = 0.002 // 0.2% tolerance
    ): CLSCandle | null {
        const levelTolerance = htfLevel * tolerance;

        if (trend === 'BEARISH') {
            // For bearish trend, look for sweep of highs (liquidity above)
            const sweptHigh = candle.high >= htfLevel - levelTolerance;
            const closedBelow = candle.close < htfLevel;
            const wickSize = ((candle.high - candle.close) / candle.close) * 100;

            if (sweptHigh && closedBelow && wickSize >= this.CLS_WICK_MIN_PERCENT) {
                return {
                    candle,
                    index: -1, // Will be set by caller
                    type: 'BEARISH',
                    liquidityLevel: htfLevel,
                    sweptLevel: true,
                    wickSize
                };
            }
        } else if (trend === 'BULLISH') {
            // For bullish trend, look for sweep of lows (liquidity below)
            const sweptLow = candle.low <= htfLevel + levelTolerance;
            const closedAbove = candle.close > htfLevel;
            const wickSize = ((candle.close - candle.low) / candle.close) * 100;

            if (sweptLow && closedAbove && wickSize >= this.CLS_WICK_MIN_PERCENT) {
                return {
                    candle,
                    index: -1, // Will be set by caller
                    type: 'BULLISH',
                    liquidityLevel: htfLevel,
                    sweptLevel: true,
                    wickSize
                };
            }
        }

        return null;
    }

    /**
     * Detect Change in Orderflow (CIOD) after a CLS candle
     */
    public detectCIOD(
        candles: OHLCV[],
        clsIndex: number,
        clsType: 'BULLISH' | 'BEARISH'
    ): CIOD | null {
        if (clsIndex >= candles.length - 2) {
            return null; // Not enough candles after CLS
        }

        const clsCandle = candles[clsIndex];
        const lookAhead = Math.min(this.CIOD_LOOKBACK, candles.length - clsIndex - 1);

        if (clsType === 'BEARISH') {
            // Look for break below CLS low (bearish CIOD)
            const breakLevel = clsCandle.low;

            for (let i = clsIndex + 1; i <= clsIndex + lookAhead; i++) {
                if (candles[i].close < breakLevel) {
                    const moveSize = ((breakLevel - candles[i].close) / breakLevel) * 100;
                    
                    return {
                        index: i,
                        type: 'BEARISH',
                        candle: candles[i],
                        breakLevel,
                        strength: moveSize
                    };
                }
            }
        } else if (clsType === 'BULLISH') {
            // Look for break above CLS high (bullish CIOD)
            const breakLevel = clsCandle.high;

            for (let i = clsIndex + 1; i <= clsIndex + lookAhead; i++) {
                if (candles[i].close > breakLevel) {
                    const moveSize = ((candles[i].close - breakLevel) / breakLevel) * 100;
                    
                    return {
                        index: i,
                        type: 'BULLISH',
                        candle: candles[i],
                        breakLevel,
                        strength: moveSize
                    };
                }
            }
        }

        return null;
    }

    /**
     * Find valid entry order block after CIOD
     */
    public findValidEntryOB(
        candles: OHLCV[],
        ciodIndex: number,
        ciodType: 'BULLISH' | 'BEARISH'
    ): EntryOrderBlock | null {
        if (ciodIndex < 5) {
            return null;
        }

        // Look for the last order block before CIOD
        const searchStart = Math.max(0, ciodIndex - 10);
        const orderBlocks = this.detectOrderBlocks(candles.slice(0, ciodIndex + 1), ciodIndex - searchStart + 5);

        // Filter OBs that match the CIOD type
        const validOBs = orderBlocks.filter(ob => ob.type === ciodType && ob.index < ciodIndex);

        if (validOBs.length === 0) {
            return null;
        }

        // Get the most recent valid OB
        const orderBlock = validOBs[validOBs.length - 1];
        const ciod: CIOD = {
            index: ciodIndex,
            type: ciodType,
            candle: candles[ciodIndex],
            breakLevel: ciodType === 'BULLISH' ? candles[ciodIndex].high : candles[ciodIndex].low,
            strength: orderBlock.strength
        };

        // Define entry zone (the order block range)
        const entryZone = {
            high: orderBlock.high,
            low: orderBlock.low
        };

        // Define stop loss (beyond the order block)
        const stopLoss = ciodType === 'BULLISH' 
            ? orderBlock.low * 0.995  // 0.5% below OB low
            : orderBlock.high * 1.005; // 0.5% above OB high

        // Calculate confidence based on OB strength and CIOD strength
        const confidence = Math.min(0.95, (orderBlock.strength + ciod.strength) / 4);

        return {
            orderBlock,
            ciod,
            entryZone,
            stopLoss,
            confidence
        };
    }

    /**
     * Check for bullish order block
     */
    private checkBullishOrderBlock(candles: OHLCV[], index: number): OrderBlock | null {
        if (index >= candles.length - 3) {
            return null;
        }

        const currentCandle = candles[index];
        const nextCandles = candles.slice(index + 1, index + 4);

        // Check if there's a strong bullish move after this candle
        const highestHigh = Math.max(...nextCandles.map(c => c.high));
        const movePercent = ((highestHigh - currentCandle.high) / currentCandle.high) * 100;

        if (movePercent >= this.MIN_OB_MOVE_PERCENT) {
            // Check if price has returned to this OB
            const isMitigated = this.checkIfMitigated(candles, index, currentCandle.low, currentCandle.high, 'BULLISH');

            return {
                price: (currentCandle.high + currentCandle.low) / 2,
                high: currentCandle.high,
                low: currentCandle.low,
                type: 'BULLISH',
                index,
                candle: currentCandle,
                strength: movePercent,
                isMitigated
            };
        }

        return null;
    }

    /**
     * Check for bearish order block
     */
    private checkBearishOrderBlock(candles: OHLCV[], index: number): OrderBlock | null {
        if (index >= candles.length - 3) {
            return null;
        }

        const currentCandle = candles[index];
        const nextCandles = candles.slice(index + 1, index + 4);

        // Check if there's a strong bearish move after this candle
        const lowestLow = Math.min(...nextCandles.map(c => c.low));
        const movePercent = ((currentCandle.low - lowestLow) / currentCandle.low) * 100;

        if (movePercent >= this.MIN_OB_MOVE_PERCENT) {
            // Check if price has returned to this OB
            const isMitigated = this.checkIfMitigated(candles, index, currentCandle.low, currentCandle.high, 'BEARISH');

            return {
                price: (currentCandle.high + currentCandle.low) / 2,
                high: currentCandle.high,
                low: currentCandle.low,
                type: 'BEARISH',
                index,
                candle: currentCandle,
                strength: movePercent,
                isMitigated
            };
        }

        return null;
    }

    /**
     * Check if an order block has been mitigated (price returned to it)
     */
    private checkIfMitigated(
        candles: OHLCV[],
        obIndex: number,
        obLow: number,
        obHigh: number,
        obType: 'BULLISH' | 'BEARISH'
    ): boolean {
        // Check candles after the OB
        for (let i = obIndex + 4; i < candles.length; i++) {
            const candle = candles[i];

            if (obType === 'BULLISH') {
                // Bullish OB is mitigated if price closes below it
                if (candle.close < obLow) {
                    return true;
                }
            } else {
                // Bearish OB is mitigated if price closes above it
                if (candle.close > obHigh) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Check if current price is near an order block (potential entry)
     */
    public isPriceNearOrderBlock(
        currentPrice: number,
        orderBlock: OrderBlock,
        tolerance: number = 0.005 // 0.5%
    ): boolean {
        const obMid = (orderBlock.high + orderBlock.low) / 2;
        const distance = Math.abs(currentPrice - obMid) / obMid;
        
        return distance <= tolerance;
    }
}
