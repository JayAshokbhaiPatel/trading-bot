
import { MarketDataEngine } from '../engine/MarketDataEngine';
import { StrategyEngine } from '../engine/StrategyEngine';
import { BacktestEngine } from '../backtest/BacktestEngine';

async function runDebugBacktest() {
    console.log('🚀 Starting Debug Backtest (BTCUSD)...');
    
    const marketData = new MarketDataEngine();
    const timeframe = '1h';
    const limit = 500;
    
    const pair = 'BTCUSD';
    const candles = await marketData.getCandles(pair, timeframe, limit);
    
    const strategy = new StrategyEngine();
    
    let buySignals = 0;
    let sellSignals = 0;
    let blockedCount = 0;

    console.log(`Analyzing ${candles.length} candles...`);

    for (let i = 50; i < candles.length; i++) {
        const recent = candles.slice(0, i + 1);
        const signal = strategy.evaluate(recent, pair);
        
        if (signal.action === 'NO_TRADE') {
            blockedCount++;
            // Check if it WAS a tech signal but blocked
            const techReason = signal.reasoning.find(r => r.startsWith('Technical:'));
            const isTechBuy = techReason && techReason.includes('Technical: BUY');
            
            if (isTechBuy) { 
                console.log(`\n[${new Date(recent[recent.length-1].timestamp).toISOString()}] 🛑 BLOCKED BUY:`);
                console.log(signal.reasoning.join('\n  '));
            }
        } else {
            if (signal.action === 'BUY') buySignals++;
            if (signal.action === 'SELL') sellSignals++;
            console.log(`\n[${new Date(signal.timestamp).toISOString()}] ✅ ${signal.action} SIGNAL:`);
            console.log(signal.reasoning.join('\n  '));
        }
    }
    
    console.log(`\nResults: BUY: ${buySignals}, SELL: ${sellSignals}, BLOCKED: ${blockedCount}`);
}

runDebugBacktest().catch(console.error);
