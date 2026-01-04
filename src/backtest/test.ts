import { BacktestEngine } from './BacktestEngine';
import { MarketDataEngine } from '../engine/MarketDataEngine';

const run = async () => {
    try {
        const marketData = new MarketDataEngine();
        const symbol = 'ETHUSD';
        
        console.log(`Fetching data for ${symbol}...`);
        const candles = await marketData.getCandles(symbol, '1h', 500);
        console.log(`Got ${candles.length} candles`);
        
        const engine = new BacktestEngine({
            initialCapital: 10000,
            riskPerTrade: 2,
            commission: 0.001,
            slippage: 0.0005
        });

        const results = engine.runBacktest(symbol, candles);
        
        console.log('\n--- RESULTS ---');
        console.log(`Total Trades: ${results.totalTrades}`);
        console.log(`Win Rate: ${results.metrics.winRate}%`);
        console.log(`P/L: $${results.metrics.totalReturn}`);
        
    } catch (error) {
        console.error('Backtest failed:', error);
    }
};

run();
