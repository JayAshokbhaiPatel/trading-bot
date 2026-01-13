import { OHLCV } from '../types/market';

export interface SwingPoint {
    type: 'HIGH' | 'LOW';
    price: number;
    index: number;
    timestamp: number;
}

export interface StructureBreak {
    type: 'BOS' | 'CHOCH' | 'SWEEP';
    direction: 'BULLISH' | 'BEARISH';
    index: number;
    price: number; // Break price (Swing High/Low)
    timestamp: number;
    isConfirmed: boolean; // Confirmed by close (for BOS/CHOCH) or just wick (for SWEEP)
}

export interface DealingRange {
    high: number;
    low: number;
    equilibrium: number;
    premium: { top: number; bottom: number };
    discount: { top: number; bottom: number };
    indexHigh: number;
    indexLow: number;
}

export interface StandardDeviationTarget {
    level: number;
    price: number;
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
    dealingRange?: DealingRange;
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
        const dealingRange = this.findDealingRange(swingHighs, swingLows);

        // Determine current structure based on last confirmed break (BOS/CHOCH)
        let structure: 'BULLISH' | 'BEARISH' | 'RANGING' = 'RANGING';
        const confirmedBreaks = breaks.filter(b => b.type !== 'SWEEP');
        if (confirmedBreaks.length > 0) {
            const lastBreak = confirmedBreaks[confirmedBreaks.length - 1];
            structure = lastBreak.direction;
        }

        return {
            structure,
            swingHighs,
            swingLows,
            breaks,
            orderBlocks,
            fvgs,
            dealingRange
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
        
        // Track the "Active" range
        let lastHigh: SwingPoint | null = null;
        let lastLow: SwingPoint | null = null;

        // Current market state
        let trend: 'BULLISH' | 'BEARISH' = 'BULLISH'; // Assumption start

        let currentHighIndex = 0;
        let currentLowIndex = 0;
        
        for (let i = 0; i < candles.length; i++) {
            const candle = candles[i];
            
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

            // Check for Break of Structure (Close beyond) or Sweep (Wick beyond)
            if (trend === 'BULLISH') {
                // Check High for BOS or Sweep
                if (candle.high > lastHigh.price) {
                    const isBOS = candle.close > lastHigh.price;
                    breaks.push({
                        type: isBOS ? 'BOS' : 'SWEEP',
                        direction: 'BULLISH',
                        index: i,
                        price: lastHigh.price,
                        timestamp: candle.timestamp,
                        isConfirmed: isBOS
                    });
                    if (isBOS) lastHigh = null; // Wait for new high on BOS
                }
                // Check Low for CHOCH or Sweep
                else if (candle.low < lastLow.price) {
                    const isCHOCH = candle.close < lastLow.price;
                    breaks.push({
                        type: isCHOCH ? 'CHOCH' : 'SWEEP',
                        direction: 'BEARISH',
                        index: i,
                        price: lastLow.price,
                        timestamp: candle.timestamp,
                        isConfirmed: isCHOCH
                    });
                    if (isCHOCH) {
                        trend = 'BEARISH';
                        lastLow = null;
                    }
                }
            } else {
                // Bearish Trend
                // Check Low for BOS or Sweep
                if (candle.low < lastLow.price) {
                    const isBOS = candle.close < lastLow.price;
                    breaks.push({
                        type: isBOS ? 'BOS' : 'SWEEP',
                        direction: 'BEARISH',
                        index: i,
                        price: lastLow.price,
                        timestamp: candle.timestamp,
                        isConfirmed: isBOS
                    });
                    if (isBOS) lastLow = null;
                }
                // Check High for CHOCH or Sweep
                else if (candle.high > lastHigh.price) {
                    const isCHOCH = candle.close > lastHigh.price;
                    breaks.push({
                        type: isCHOCH ? 'CHOCH' : 'SWEEP',
                        direction: 'BULLISH',
                        index: i,
                        price: lastHigh.price,
                        timestamp: candle.timestamp,
                        isConfirmed: isCHOCH
                    });
                    if (isCHOCH) {
                        trend = 'BULLISH';
                        lastHigh = null;
                    }
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

    private findDealingRange(highs: SwingPoint[], lows: SwingPoint[]): DealingRange | undefined {
        if (highs.length === 0 || lows.length === 0) return undefined;

        const lastHigh = highs[highs.length - 1];
        const lastLow = lows[lows.length - 1];

        const rangeHigh = lastHigh.price;
        const rangeLow = lastLow.price;
        const equilibrium = (rangeHigh + rangeLow) / 2;

        return {
            high: rangeHigh,
            low: rangeLow,
            equilibrium,
            premium: { top: rangeHigh, bottom: equilibrium },
            discount: { top: equilibrium, bottom: rangeLow },
            indexHigh: lastHigh.index,
            indexLow: lastLow.index
        };
    }

    /**
     * Calculate Standard Deviation targets based on manipulation leg
     * Formula: target = anchor + (extension * (anchor - origin))
     */
    public calculateSDTargets(origin: number, anchor: number): StandardDeviationTarget[] {
        const ranges = [2.0, 2.5, 4.0];
        const diff = anchor - origin;
        
        return ranges.map(ext => ({
            level: ext,
            price: anchor + (ext * diff)
        }));
    }
}
