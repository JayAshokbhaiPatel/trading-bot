import { OHLCV } from '../types/market';
import { TradeSignal } from '../types/trading';
import { SMCAnalyzer, SMCAnalysis, OrderBlock, FairValueGap } from '../analysis/SMCAnalyzer';

export class StrategyEngine {
    private smcAnalyzer: SMCAnalyzer;

    constructor() {
        this.smcAnalyzer = new SMCAnalyzer();
    }

    public evaluate(candles: OHLCV[], coin?: string, timeframe: string = '1h'): TradeSignal {
        const analysis = this.smcAnalyzer.analyze(candles);
        const currentPrice = candles[candles.length - 1].close;

        const signal: TradeSignal = {
            action: 'NO_TRADE',
            price: currentPrice,
            timestamp: candles[candles.length - 1].timestamp,
            reasoning: [],
            confidence: 0,
        };

        // 1. Check Market Structure
        signal.reasoning.push(`Structure: ${analysis.structure}`);
        
        // 2. Identify Active POIs (Order Blocks & FVGs)
        // We look for UNMITIGATED POIs that price is currently inside or touching
        
        const activeOBs = analysis.orderBlocks.filter(ob => !ob.mitigated);
        const activeFVGs = analysis.fvgs.filter(fvg => !fvg.mitigated); // Although scan marks them mitigated if touched, we might be touching it NOW
        
        // Check if we are tapping into a POI
        let interactingOB: OrderBlock | null = null;
        let interactingFVG: FairValueGap | null = null;
        
        // Check OBs
        for(const ob of activeOBs) {
            // Check intersection with current candle
            const low = candles[candles.length - 1].low;
            const high = candles[candles.length - 1].high;
            
            if (ob.type === 'BULLISH') {
                // Price dips into Bullish OB
                if (low <= ob.top && high >= ob.bottom) {
                     interactingOB = ob;
                     break; // Prioritize most recent? List is sorted by index usually if pushed sequentially
                }
            } else {
                // Price rallies into Bearish OB
                if (high >= ob.bottom && low <= ob.top) {
                    interactingOB = ob;
                    break;
                }
            }
        }
        
        // Check FVGs (if no OB found, or maybe conflunce?)
        if (!interactingOB) {
            for(const fvg of activeFVGs) {
                const low = candles[candles.length - 1].low;
                const high = candles[candles.length - 1].high;
                
                if (fvg.type === 'BULLISH') {
                    if (low <= fvg.top && high >= fvg.bottom) {
                        interactingFVG = fvg;
                        break;
                    }
                } else {
                    if (high >= fvg.bottom && low <= fvg.top) {
                        interactingFVG = fvg;
                        break;
                    }
                }
            }
        }
        
        // 3. Generate Signal based on Structure + POI
        // Rule: 
        // - Trend is BULLISH -> Buy at Bullish OB/FVG
        // - Trend is BEARISH -> Sell at Bearish OB/FVG
        // - Counter-trend? Only if we see a valid ChoCH? For now strict trend following.
        
        if (analysis.structure === 'BULLISH') {
            if (interactingOB && interactingOB.type === 'BULLISH') {
                signal.action = 'BUY';
                signal.reasoning.push(`✅ Tap into Bullish OB at ${interactingOB.top}`);
                signal.stopLoss = interactingOB.bottom; // Stop below OB
                signal.takeProfit1 = currentPrice + (currentPrice - interactingOB.bottom) * 2; // 1:2 RR
                signal.confidence = 0.8;
            } else if (interactingFVG && interactingFVG.type === 'BULLISH') {
                signal.action = 'BUY';
                signal.reasoning.push(`✅ Tap into Bullish FVG at ${interactingFVG.top}`);
                signal.stopLoss = interactingFVG.bottom;
                signal.takeProfit1 = currentPrice + (currentPrice - interactingFVG.bottom) * 2;
                signal.confidence = 0.7; // FVG slightly less confirmed than OB?
            }
        } else if (analysis.structure === 'BEARISH') {
            if (interactingOB && interactingOB.type === 'BEARISH') {
                signal.action = 'SELL';
                signal.reasoning.push(`✅ Tap into Bearish OB at ${interactingOB.bottom}`);
                signal.stopLoss = interactingOB.top; // Stop above OB
                signal.takeProfit1 = currentPrice - (interactingOB.top - currentPrice) * 2;
                signal.confidence = 0.8;
            } else if (interactingFVG && interactingFVG.type === 'BEARISH') {
                signal.action = 'SELL';
                signal.reasoning.push(`✅ Tap into Bearish FVG at ${interactingFVG.bottom}`);
                signal.stopLoss = interactingFVG.top;
                signal.takeProfit1 = currentPrice - (interactingFVG.top - currentPrice) * 2;
                signal.confidence = 0.7;
            }
        }
        
        // 4. Validate Signal
        if (signal.action !== 'NO_TRADE') {
             // Ensure good RR? Already set 1:2.
             // Ensure Stop isn't too tight/wide?
             const risk = Math.abs(currentPrice - (signal.stopLoss || 0));
             const riskPct = risk / currentPrice;
             
             if (riskPct < 0.001) { // < 0.1% stop is too tight, noise will hit it
                  signal.action = 'NO_TRADE';
                  signal.reasoning.push(`❌ Stop too tight (${(riskPct*100).toFixed(2)}%)`);
             }
        }

        return signal;
    }
}
