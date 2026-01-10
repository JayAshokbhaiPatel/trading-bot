
import { StrategyEngine } from './src/engine/StrategyEngine';
import { OHLCV } from './src/types/market';

function runTest() {
    console.log('--- Starting Verification Test With Strict Filters ---');
    
    // Scenario 1: Activated Entry but Bad Trend (Price < EMA50 for Buy)
    // We expect NO SIGNAL.
    
    const candles: OHLCV[] = [];
    let t = 100000;
    
    // Create candles to establish EMA50.
    // We need at least 50 candles.
    // Let's create a downtrend so EMA50 is high, preventing BUY signals.
    let price = 200;
    for(let i=0; i<60; i++) {
        price -= 1;
        candles.push({ timestamp: t, open: price+1, high: price+2, low: price-1, close: price, volume: 100 }); t+=3600;
    }
    
    // Now create a "Bullish Structure" locally to trick SMC, but Trend is still Bearish.
    // Swing Low
    candles.push({ timestamp: t, open: 140, high: 142, low: 138, close: 140, volume: 100 }); t+=3600;
    // Swing High
    candles.push({ timestamp: t, open: 140, high: 145, low: 140, close: 144, volume: 100 }); t+=3600;
    // Bearish Candle (OB)
    const OB_TOP = 144;
    candles.push({ timestamp: t, open: 144, high: 144, low: 142, close: 143, volume: 100 }); t+=3600;
    // Break UP
    candles.push({ timestamp: t, open: 143, high: 150, low: 143, close: 148, volume: 500 }); t+=3600;
    
    // Trend Check: Price ~148. EMA50 of previous 50 candles (approx avg of 200->140 = 170).
    // Price < EMA50. Should be NO BUY.
    
    // Mitigation
    candles.push({ timestamp: t, open: 148, high: 148, low: 143, close: 145, volume: 100 }); t+=3600; // Mitigated
    
    // Move slightly away (Activated logic)
    candles.push({ timestamp: t, open: 145, high: 146, low: 145, close: 145.5, volume: 100 }); t+=3600;
    
    const engine = new StrategyEngine();
    const signal1 = engine.evaluate(candles);
    
    console.log('Scenario 1 (Bad Trend):', signal1.action);
    if(signal1.reasoning) console.log(signal1.reasoning);
    
    if (signal1.action === 'NO_TRADE') {
        console.log('SUCCESS: Bad Trend blocked the signal.');
    } else {
        console.log('FAILURE: Signal allowed despite bad trend.');
    }


    // Scenario 2: Good Trend, Recent Activation
    // We need Price > EMA50.
    const candles2: OHLCV[] = [];
    t = 200000;
    price = 100;
    
    // 1. Establish Bullish Trend (EMA50) with some noise
    for(let i=0; i<60; i++) {
        price += 0.1;
        candles2.push({ timestamp: t, open: price-0.2, high: price+0.5, low: price-0.2, close: price, volume: 100 }); t+=3600;
    } 
    // Price ~106. EMA50 ~103. Trend OK.
    
    // 2. Create a Swing High (Peak)
    // Up
    candles2.push({ timestamp: t, open: price, high: price+2, low: price, close: price+1.5, volume: 100 }); t+=3600;
    price += 1.5; // ~107.5
    // Down (Confirm Swing High at 107.5)
    candles2.push({ timestamp: t, open: price, high: price+0.5, low: price-1, close: price-0.5, volume: 100 }); t+=3600;
    price -= 0.5; // ~107
    
    // 3. Create Pullback (Bearish Candle -> OB)
    // Down more
    candles2.push({ timestamp: t, open: price, high: price+0.2, low: price-1, close: price-0.8, volume: 100 }); t+=3600;
    // Current Price ~106.2.
    // Bearish Candle (The OB Candidate)
    const OB_CANDLE_HIGH = price - 0.8 + 0.5; // ~106.7
    const OB_CANDLE_LOW = price - 0.8 - 0.5; // ~105.7
    // This candle must be RED.
    candles2.push({ timestamp: t, open: OB_CANDLE_HIGH, high: OB_CANDLE_HIGH, low: OB_CANDLE_LOW, close: OB_CANDLE_LOW, volume: 100 }); t+=3600;
    
    const OB_TOP_2 = OB_CANDLE_HIGH; // Top of Bearish Candle
    
    // 4. Break Structure (Break above Swing High 109.5? No, previous high was ~109.5?
    // Let's just Blast UP.
    candles2.push({ timestamp: t, open: OB_CANDLE_LOW, high: 120, low: OB_CANDLE_LOW, close: 115, volume: 500 }); t+=3600;
    
    // 5. Mitigate (Touch OB_TOP_2)
    // Price drops to 106.7
    candles2.push({ timestamp: t, open: 115, high: 115, low: OB_TOP_2 - 0.1, close: OB_TOP_2 + 0.1, volume: 100 }); t+=3600;
    
    // 6. Stay Close (Activated Logic)
    // Within 0.5% of OB_TOP_2.
    // 0.5% of 106 is ~0.53.
    // Price must be < 107.2
    
    // Current price is OB_TOP_2 + 0.1.
    // Let's close slightly higher.
    candles2.push({ timestamp: t, open: OB_TOP_2+0.1, high: OB_TOP_2+0.2, low: OB_TOP_2+0.1, close: OB_TOP_2 + 0.2, volume: 100 }); t+=3600;
    
    const signal2 = engine.evaluate(candles2);
    console.log('Scenario 2 Signal:', JSON.stringify(signal2, null, 2));

    // Debug Tech
    const techAnalyzer = new (require('./src/analysis/TechnicalAnalyzer').TechnicalAnalyzer)();
    const prices2 = candles2.map(c => c.close);
    const ema = techAnalyzer.calculateEMA(prices2, 50);
    const rsi = techAnalyzer.calculateRSI(prices2);
    console.log(`DEBUG: Last Price: ${candles2[candles2.length-1].close}, EMA50: ${ema}, RSI: ${rsi?.rsi}`);

    if (signal2.action === 'BUY') {
        console.log('SUCCESS: Good Trend allowed the signal.');
    } else {
        console.log('FAILURE: Valid signal blocked.');
    }
}

runTest();
