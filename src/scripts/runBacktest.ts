
import { MarketDataEngine } from '../engine/MarketDataEngine';
import { StrategyEngine } from '../engine/StrategyEngine';
import { BacktestEngine } from '../backtest/BacktestEngine';
import { logger } from '../utils/logger';

const TOP_20_COINS = [
    'BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'AVAX', 'DOGE', 'DOT', 'TRX',
    'LINK', 'MATIC', 'LTC', 'BCH', 'ATOM', 'UNI', 'XLM', 'ETC', 'FIL', 'HBAR'
];

async function runComprehensiveBacktest() {
    console.log('🚀 Starting Comprehensive Backtest (Top 20, 1000 Candles)...');
    
    const marketData = new MarketDataEngine();
    const timeframe = '1h';
    const limit = 1000;
    
    const summary: any[] = [];

    for (const coin of TOP_20_COINS) {
        try {
            const pair = `${coin}USD`;
            console.log(`\n⏳ Fetching data for ${pair}...`);
            
            // Check if MarketDataEngine supports limit > 100. 
            // If it uses DeltaAdapter which uses CCXT, it usually respects limit.
            // If it's hardcoded to 100 in MarketDataEngine, we might get less.
            // But we passed limit param to getCandles.
            
            const candles = await marketData.getCandles(pair, timeframe, limit);
            
            if (candles.length < 500) {
                console.warn(`⚠️ Warning: Only fetched ${candles.length} candles for ${pair}`);
            }

            const backtestEngine = new BacktestEngine({
                initialCapital: 10000,
                riskPerTrade: 2,
                commission: 0.001,
                slippage: 0.0005
            });

            const results = backtestEngine.runBacktest(pair, candles);
            
            summary.push({
                coin: pair,
                ...results.metrics
            });

        } catch (error: any) {
            console.error(`❌ Error backtesting ${coin}: ${error.message}`);
        }
    }

    console.log('\n\n═══════════════════════════════════════════════════════════════');
    console.log('📊 FINAL BACKTEST SUMMARY (Top 20 Coins)');
    console.log('═══════════════════════════════════════════════════════════════');
    console.table(summary);
    
    // Calculate averages
    if (summary.length > 0) {
        const totalProfitPer = summary.reduce((sum, s) => sum + parseFloat(s.totalReturnPercent), 0);
        const avgProfit = totalProfitPer / summary.length;
        const totalWinRate = summary.reduce((sum, s) => sum + parseFloat(s.winRate), 0);
        const avgWinRate = totalWinRate / summary.length;
        
        console.log(`\n📈 AVERAGE PROFIT: ${avgProfit.toFixed(2)}%`);
        console.log(`🎯 AVERAGE WIN RATE: ${avgWinRate.toFixed(2)}%`);
    }
}

runComprehensiveBacktest().catch(console.error);
