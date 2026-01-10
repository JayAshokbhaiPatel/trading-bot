import { OHLCV } from '../types/market';

export interface SwingPoint {
    type: 'HIGH' | 'LOW';
    price: number;
    index: number;
    timestamp: number;
}

export interface StructureBreak {
    type: 'BOS' | 'CHOCH';
    direction: 'BULLISH' | 'BEARISH';
    index: number;
    price: number; // Break price (Swing High/Low)
    timestamp: number;
}

export interface OrderBlock {
    type: 'BULLISH' | 'BEARISH';
    top: number;
    bottom: number; // For Bearish OB, top is High, bottom is Open/Low. For Bullish, top is Open/High, bottom is Low.
    index: number; 
    timestamp: number;
    mitigated: boolean;
    mitigationIndex?: number;
}

export interface FairValueGap {
    type: 'BULLISH' | 'BEARISH';
    top: number;
    bottom: number;
    index: number;
    timestamp: number;
    mitigated: boolean;
    mitigationIndex?: number;
    midPrice?: number;
}

export interface SMCAnalysis {
    structure: 'BULLISH' | 'BEARISH' | 'RANGING';
    swingHighs: SwingPoint[];
    swingLows: SwingPoint[];
    breaks: StructureBreak[];
    orderBlocks: OrderBlock[];
    fvgs: FairValueGap[];
}

export class SMCAnalyzer {
    
    /**
     * Analyze market for SMC setup
     */
    public analyze(candles: OHLCV[]): SMCAnalysis {
        const swingHighs = this.findSwingHighs(candles);
        const swingLows = this.findSwingLows(candles);
        const breaks = this.findStructureBreaks(candles, swingHighs, swingLows);
        const orderBlocks = this.findOrderBlocks(candles, breaks);
        const fvgs = this.findFVGs(candles);

        // Determine current structure based on last break
        let structure: 'BULLISH' | 'BEARISH' | 'RANGING' = 'RANGING';
        if (breaks.length > 0) {
            const lastBreak = breaks[breaks.length - 1];
            structure = lastBreak.direction;
        }

        return {
            structure,
            swingHighs,
            swingLows,
            breaks,
            orderBlocks,
            fvgs
        };
    }

    private findSwingHighs(candles: OHLCV[], left: number = 2, right: number = 2): SwingPoint[] {
        const swings: SwingPoint[] = [];
        for (let i = left; i < candles.length - right; i++) {
            let isHigh = true;
            for (let j = 1; j <= left; j++) {
                if (candles[i - j].high >= candles[i].high) isHigh = false;
            }
            for (let j = 1; j <= right; j++) {
                if (candles[i + j].high > candles[i].high) isHigh = false; // Right side strict >
            }
            
            if (isHigh) {
                swings.push({
                    type: 'HIGH',
                    price: candles[i].high,
                    index: i,
                    timestamp: candles[i].timestamp
                });
            }
        }
        return swings;
    }

    private findSwingLows(candles: OHLCV[], left: number = 2, right: number = 2): SwingPoint[] {
        const swings: SwingPoint[] = [];
        for (let i = left; i < candles.length - right; i++) {
            let isLow = true;
            for (let j = 1; j <= left; j++) {
                if (candles[i - j].low <= candles[i].low) isLow = false;
            }
            for (let j = 1; j <= right; j++) {
                if (candles[i + j].low < candles[i].low) isLow = false; // Right side strict <
            }
            
            if (isLow) {
                swings.push({
                    type: 'LOW',
                    price: candles[i].low,
                    index: i,
                    timestamp: candles[i].timestamp
                });
            }
        }
        return swings;
    }

    private findStructureBreaks(candles: OHLCV[], highs: SwingPoint[], lows: SwingPoint[]): StructureBreak[] {
        const breaks: StructureBreak[] = [];
        const allSwings = [...highs, ...lows].sort((a, b) => a.index - b.index);
        
        // Track the "Active" range
        let lastHigh: SwingPoint | null = null;
        let lastLow: SwingPoint | null = null;

        // Current market state
        let trend: 'BULLISH' | 'BEARISH' = 'BULLISH'; // Assumption start

        // We iterate through SWINGS to set boundaries, and verify breaks with CANDLES
        // But simply iterating swings misses the exact candle that broke it.
        // Better: Iterate candles, and update "Active High/Low" when a new swing is formed.
        
        let currentHighIndex = 0;
        let currentLowIndex = 0;
        
        for (let i = 0; i < candles.length; i++) {
            const candle = candles[i];
            
            // 1. Check for new Swings formed at this index
            // Note: Swings are confirmed retrospectively (after 'right' candles). 
            // So at index i, we might "discover" a swing at i-right.
            // For backtesting compatibility, we must handle this carefully.
            // If we use pre-calculated swings, we know where they ARE.
            
            // Update "Last Confirmed Swing" relative to current candle 'i'
            // A swing at swing.index is only "confirmed" at swing.index + right
            
            // Simple approach: Use pre-calc swings. 
            // If candle[i] closes > lastConfirmedHigh.price => BREAK.
            
            // Update active swings
            while(currentHighIndex < highs.length && highs[currentHighIndex].index < i) {
                lastHigh = highs[currentHighIndex];
                currentHighIndex++;
            }
            while(currentLowIndex < lows.length && lows[currentLowIndex].index < i) {
                lastLow = lows[currentLowIndex];
                currentLowIndex++;
            }

            if (!lastHigh || !lastLow) continue;

            // Check Break of Structure
            if (trend === 'BULLISH') {
                // Expect BOS (Break High)
                if (candle.close > lastHigh.price) {
                    // Valid BOS
                    breaks.push({
                        type: 'BOS',
                        direction: 'BULLISH',
                        index: i,
                        price: lastHigh.price,
                        timestamp: candle.timestamp
                    });
                    // Reset 'lastHigh' to avoid multiple breaks of same high? 
                    // Usually we wait for a NEW high to form. 
                    // For simplicity, we just log it. Real SMC requires re-mapping structure.
                    // Let's assume structure resets.
                    lastHigh = null; // Wait for new high
                }
                // Expect ChoCH (Break Low)
                else if (candle.close < lastLow.price) {
                    breaks.push({
                        type: 'CHOCH',
                        direction: 'BEARISH',
                        index: i,
                        price: lastLow.price,
                        timestamp: candle.timestamp
                    });
                    trend = 'BEARISH';
                    lastLow = null;
                }
            } else {
                // Bearish Trend
                // Expect BOS (Break Low)
                if (candle.close < lastLow.price) {
                    breaks.push({
                        type: 'BOS',
                        direction: 'BEARISH',
                        index: i,
                        price: lastLow.price,
                        timestamp: candle.timestamp
                    });
                    lastLow = null;
                }
                // Expect ChoCH (Break High)
                else if (candle.close > lastHigh.price) {
                    breaks.push({
                        type: 'CHOCH',
                        direction: 'BULLISH',
                        index: i,
                        price: lastHigh.price,
                        timestamp: candle.timestamp
                    });
                    trend = 'BULLISH';
                    lastHigh = null;
                }
            }
        }
        
        return breaks;
    }

    private findOrderBlocks(candles: OHLCV[], breaks: StructureBreak[]): OrderBlock[] {
        // Defined as: The last contrary candle before the displacement that caused the break.
        const orderBlocks: OrderBlock[] = [];
        
        for (const bk of breaks) {
            // Search backwards from break index
            const searchLimit = 50; // Don't look back too far
            let found = false;
            
            for (let i = bk.index - 1; i >= Math.max(0, bk.index - searchLimit); i--) {
                const candle = candles[i];
                
                if (bk.direction === 'BULLISH') {
                    // Looking for last BEARISH candle (Red) before the move up
                    if (candle.close < candle.open) {
                        orderBlocks.push({
                            type: 'BULLISH',
                            top: candle.high, // Some use High, some use Open. Let using High for wider zone.
                            bottom: candle.low,
                            index: i,
                            timestamp: candle.timestamp,
                            mitigated: false
                        });
                        found = true;
                        break;
                    }
                } else {
                    // Looking for last BULLISH candle (Green) before the move down
                    if (candle.close > candle.open) {
                         orderBlocks.push({
                            type: 'BEARISH',
                            top: candle.high,
                            bottom: candle.low,
                            index: i,
                            timestamp: candle.timestamp,
                            mitigated: false
                        });
                        found = true;
                        break;
                    }
                }
            }
        }
        
        // Filter Mitigated OBs
        // An OB is mitigated if Price touches it *after* it was formed + displacement.
        // We start checking from (OB Index + 1)
        for(const ob of orderBlocks) {
            for(let i = ob.index + 5; i < candles.length; i++) { // +5 buffer to let price leave
                 if (ob.mitigated) break;
                 
                 const candle = candles[i];
                 if (ob.type === 'BULLISH') {
                     if (candle.low <= ob.top) {
                         ob.mitigated = true;
                         ob.mitigationIndex = i;
                     }
                 } else {
                     if (candle.high >= ob.bottom) {
                         ob.mitigated = true;
                         ob.mitigationIndex = i;
                     }
                 }
            }
        }
        
        return orderBlocks;
    }

    private findFVGs(candles: OHLCV[]): FairValueGap[] {
        const fvgs: FairValueGap[] = [];
        
        for (let i = 1; i < candles.length - 1; i++) {
            const first = candles[i - 1];
            const third = candles[i + 1];
            const current = candles[i];
            
            // Bullish FVG: Third Low > First High (Gap Up)
            if (third.low > first.high) {
                // The gap is between First High and Third Low
                fvgs.push({
                    type: 'BULLISH',
                    top: third.low,
                    bottom: first.high,
                    index: i,
                    timestamp: current.timestamp,
                    mitigated: false
                });
            }
            
            // Bearish FVG: Third High < First Low (Gap Down)
            if (third.high < first.low) {
                // The gap is between First Low and Third High
                fvgs.push({
                    type: 'BEARISH',
                    top: first.low,
                    bottom: third.high,
                    index: i,
                    timestamp: current.timestamp,
                    mitigated: false
                });
            }
        }
        
        // Check mitigation (price returning to gap)
        for (const fvg of fvgs) {
            for (let i = fvg.index + 2; i < candles.length; i++) {
                const candle = candles[i];
                if (fvg.type === 'BULLISH') {
                    if (candle.low <= fvg.top) { // Touched the gap
                        fvg.mitigated = true;
                        fvg.mitigationIndex = i;
                        break;
                    }
                } else {
                    if (candle.high >= fvg.bottom) {
                        fvg.mitigated = true;
                        fvg.mitigationIndex = i;
                        break;
                    }
                }
            }
        }
        
        return fvgs; // Return all, let strategy filter
    }
}
