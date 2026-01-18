import dotenv from 'dotenv';
dotenv.config();

import { BacktestEngine } from './BacktestEngine';
import { DeltaExchangeService } from '../services/DeltaExchangeService';
import { PinBarStrategy } from '../strategies/PinBarStrategy';
import { BreakoutRetestStrategy } from '../strategies/BreakoutRetestStrategy';
import { ConsolidationBreakoutStrategy } from '../strategies/ConsolidationBreakoutStrategy';
import { DoubleTopBottomStrategy } from '../strategies/DoubleTopBottomStrategy';
import { InsideBarStrategy } from '../strategies/InsideBarStrategy';
import { SupplyDemandStrategy } from '../strategies/SupplyDemandStrategy';
import { TrendContinuationStrategy } from '../strategies/TrendContinuationStrategy';
import { FailedBreakoutStrategy } from '../strategies/FailedBreakoutStrategy';
import { ComprehensiveStrategy } from '../strategies/ComprehensiveStrategy';

async function runLiveBacktest() {
  console.log('🏁 Starting Backtest on Real Delta Exchange Data...');

  const delta = new DeltaExchangeService();
  const engine = new BacktestEngine({
    initialCapital: 10000, // Increased from 1000 to allow sizing on big coins
    commission: 0.001,
    slippage: 0.0005,
    riskPerTrade: 0.03, // 3% risk
    leverage: 10,
    includePsychology: false // Disabled for backtest to see all signals
  });

  const strategies = [
    new PinBarStrategy(),
    new BreakoutRetestStrategy(),
    new ConsolidationBreakoutStrategy(),
    new DoubleTopBottomStrategy(),
    new InsideBarStrategy(),
    new SupplyDemandStrategy(),
    new TrendContinuationStrategy(),
    new FailedBreakoutStrategy()
  ];

  const summary: Record<string, { trades: number, wins: number, pnl: number }> = {};
  
  const topCoins = (await delta.getTop20ByVolume()).slice(0, 5);
  console.log(`📡 Testing on top 5 coins: ${topCoins.join(', ')}`);

  for (const symbol of topCoins) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🔍 Analyzing ${symbol}...`);
    
    // Using 15m for better signal frequency
    const data = await delta.getCandles(symbol, '15m', 1000);
    if (data.length < 100) {
        console.log(`⚠️ Skiping ${symbol} due to insufficient data.`);
        continue;
    }

    // Re-instantiate strategies per coin to avoid state pollution (e.g., breakout levels)
    const coinStrategies = [
        new PinBarStrategy(),
        new BreakoutRetestStrategy(),
        new ConsolidationBreakoutStrategy(),
        new DoubleTopBottomStrategy(),
        new InsideBarStrategy(),
        new SupplyDemandStrategy(),
        new TrendContinuationStrategy(),
        new FailedBreakoutStrategy(),
        new ComprehensiveStrategy()
    ];

    for (const strategy of coinStrategies) {
        // Initialize summary entry if it doesn't exist
        if (!summary[strategy.name]) summary[strategy.name] = { trades: 0, wins: 0, pnl: 0 };

        const results = await engine.run(strategy, data);
        
        // Track aggregate stats
        summary[strategy.name].trades += results.totalTrades;
        summary[strategy.name].wins += results.trades.filter((t: any) => t.pnl > 0).length;
        summary[strategy.name].pnl += results.totalPnL;

        if (results.totalTrades > 0) {
            console.log(`✅ ${strategy.name}: ${results.totalTrades} trades | Win Rate: ${results.winRate.toFixed(1)}% | PNL: $${results.totalPnL.toFixed(2)}`);
        } else {
            console.log(`⚪ ${strategy.name}: No signals found.`);
        }
    }
  }

  // Print aggregate summary table
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 FINAL BACKTEST SUMMARY (Top 20 Coins)`);
  console.log(`${'='.repeat(60)}`);
  console.log(`${'Strategy'.padEnd(30)} | ${'Trades'.padEnd(8)} | ${'Win%'.padEnd(8)} | ${'Net PNL'.padEnd(10)}`);
  console.log(`${'-'.repeat(30)}-|-${'-'.repeat(8)}-|-${'-'.repeat(8)}-|-${'-'.repeat(10)}`);

  let totalTrades = 0;
  let totalPnL = 0;

  Object.entries(summary).forEach(([name, stats]) => {
      const winRate = stats.trades > 0 ? (stats.wins / stats.trades) * 100 : 0;
      console.log(`${name.padEnd(30)} | ${stats.trades.toString().padEnd(8)} | ${winRate.toFixed(1).padEnd(7)}% | $${stats.pnl.toFixed(2).padEnd(9)}`);
      totalTrades += stats.trades;
      totalPnL += stats.pnl;
  });

  console.log(`${'-'.repeat(60)}`);
  console.log(`${'TOTAL'.padEnd(30)} | ${totalTrades.toString().padEnd(8)} | ${'N/A'.padEnd(8)} | $${totalPnL.toFixed(2)}`);
  console.log(`${'='.repeat(60)}`);

  console.log('\n✅ Live Data Backtest Complete.');
}

runLiveBacktest().catch(console.error);
