import { BacktestEngine } from './BacktestEngine';
import { MarketDataEngine } from '../engine/MarketDataEngine';
import { logger } from '../utils/logger';

const run = async () => {
    try {
        const symbol = 'BTCUSD'; // Default, or args
        const marketData = new MarketDataEngine();
        
        // Fetch Data (Need enough history)
        logger.info(`Fetching data for ${symbol}...`);
        const candles = await marketData.getCandles(symbol, '1h', 500); // 500 candles ~ 20 days
        
        if (candles.length < 100) {
            logger.error(`Insufficient data for backtest. Got ${candles.length}`);
            return;
        }

        const engine = new BacktestEngine({
            initialCapital: 10000,
            riskPerTrade: 2,
            commission: 0.001,
            slippage: 0.0005
        });

        const results = engine.runBacktest(symbol, candles);
        
        // Results are already printed by engine.printBacktestResults() similar to snippet
        
    } catch (error) {
        console.error('Backtest failed:', error);
    }
};

run();
