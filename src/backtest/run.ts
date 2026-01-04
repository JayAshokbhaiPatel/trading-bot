import { BacktestEngine } from './BacktestEngine';
import { MarketDataEngine } from '../engine/MarketDataEngine';
import { CoinSelector } from '../engine/CoinSelector';
import { logger } from '../utils/logger';

interface AggregatedResults {
    symbol: string;
    totalTrades: number;
    winRate: string;
    profitFactor: string;
    totalReturn: string;
    maxDrawdown: string;
}

const run = async () => {
    try {
        const marketData = new MarketDataEngine();
        const coinSelector = new CoinSelector({ refreshInterval: 60 * 60 * 1000, topN: 20 });
        
        // Start coin selector and wait for initial fetch
        await coinSelector.start();
        await new Promise(r => setTimeout(r, 2000));
        
        const symbols = coinSelector.getSelectedCoins();
        coinSelector.stop();
        
        console.log(`\n📊 Running backtest on ${symbols.length} coins...\n`);
        
        const allResults: AggregatedResults[] = [];
        let totalWins = 0;
        let totalLosses = 0;
        let totalPL = 0;
        
        for (const symbol of symbols) {
            try {
                const candles = await marketData.getCandles(symbol, '1h', 500);
                
                if (candles.length < 100) {
                    console.log(`⚠️ Skipping ${symbol}: insufficient data (${candles.length} candles)`);
                    continue;
                }

                const engine = new BacktestEngine({
                    initialCapital: 10000,
                    riskPerTrade: 2,
                    commission: 0.001,
                    slippage: 0.0005
                });

                const results = engine.runBacktest(symbol, candles);
                
                allResults.push({
                    symbol,
                    totalTrades: results.metrics.totalTrades || 0,
                    winRate: results.metrics.winRate || '0',
                    profitFactor: results.metrics.profitFactor || '0',
                    totalReturn: results.metrics.totalReturn || '0',
                    maxDrawdown: results.metrics.maxDrawdown || '0'
                });
                
                totalWins += results.winningTrades;
                totalLosses += results.losingTrades;
                totalPL += parseFloat(results.metrics.totalReturn || '0');
                
            } catch (error: any) {
                console.error(`❌ Error backtesting ${symbol}:`, error.message);
            }
        }
        
        // Print Summary
        console.log('\n' + '='.repeat(80));
        console.log('📈 AGGREGATE BACKTEST SUMMARY - ALL COINS');
        console.log('='.repeat(80));
        console.log('Symbol       | Trades | Win Rate | Profit Fac |    Return | Max DD');
        console.log('-'.repeat(80));
        
        for (const r of allResults) {
            const line = `${r.symbol.padEnd(12)} | ${String(r.totalTrades).padStart(6)} | ${r.winRate.padStart(7)}% | ${r.profitFactor.padStart(10)} | $${r.totalReturn.padStart(9)} | ${r.maxDrawdown.padStart(6)}%`;
            console.log(line);
        }
        
        console.log('-'.repeat(80));
        const overallWinRate = totalWins + totalLosses > 0 
            ? ((totalWins / (totalWins + totalLosses)) * 100).toFixed(2) 
            : '0';
        console.log(`\n📊 OVERALL STATS:`);
        console.log(`   Total Coins Tested: ${allResults.length}`);
        console.log(`   Total Trades: ${totalWins + totalLosses}`);
        console.log(`   Overall Win Rate: ${overallWinRate}%`);
        console.log(`   Total P/L: $${totalPL.toFixed(2)}`);
        console.log('='.repeat(80) + '\n');
        
    } catch (error) {
        console.error('Backtest failed:', error);
    }
};

run();
