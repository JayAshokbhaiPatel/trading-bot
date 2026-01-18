import { BacktestEngine } from './BacktestEngine';
import { PinBarStrategy } from '../strategies/PinBarStrategy';
import { BreakoutRetestStrategy } from '../strategies/BreakoutRetestStrategy';
import { ConsolidationBreakoutStrategy } from '../strategies/ConsolidationBreakoutStrategy';
import { DoubleTopBottomStrategy } from '../strategies/DoubleTopBottomStrategy';
import { InsideBarStrategy } from '../strategies/InsideBarStrategy';
import { SupplyDemandStrategy } from '../strategies/SupplyDemandStrategy';
import { TrendContinuationStrategy } from '../strategies/TrendContinuationStrategy';
import { FailedBreakoutStrategy } from '../strategies/FailedBreakoutStrategy';
import { Candle } from '../types/index';

// Improved mock data generator with higher volatility and injected patterns
function generateMockData(count: number = 2000): Candle[] {
  const candles: Candle[] = [];
  let price = 100;
  
  for (let i = 0; i < count; i++) {
    const open = price;
    const volatility = 3 + Math.random() * 2;
    let high = open + Math.random() * volatility;
    let low = open - Math.random() * volatility;
    let close = low + Math.random() * (high - low);
    let volume = 1000 + Math.random() * 500;

    // 1. Inject Periodic Pin Bars (Every 100 candles)
    if (i % 100 === 0) {
        low = open - 15; high = open + 2; close = open + 2;
    }

    // 2. Inject Consolidation & Breakout
    if (i % 400 > 300 && i % 400 < 350) {
        high = price + 1; low = price - 1; close = price + (Math.random() - 0.5);
        volume = 300;
    } else if (i % 400 === 351) {
        close = price + 10; volume = 4000;
    }

    // 3. Inject Trend
    if (i % 500 > 100 && i % 500 < 300) {
        price += 0.8;
        if (i % 25 === 0) { // Pullback
            low = price - 8; close = price - 2;
        }
    }

    candles.push({
      timestamp: new Date(Date.now() - (count - i) * 60000).toISOString(),
      open, high, low, close, volume
    });
    price = close;
  }
  return candles;
}

async function runAllBacktests() {
  const data = generateMockData(500);
  
  const engine = new BacktestEngine({
    initialCapital: 10000,
    commission: 0.001,
    slippage: 0.0005,
    riskPerTrade: 0.02,
    leverage: 10,
    includePsychology: true
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

  console.log('🚀 Starting Multi-Strategy Backtest Session...\n');

  for (const strategy of strategies) {
    console.log(`\n================================================================`);
    const results = await engine.run(strategy, data);
    
    console.log(`📊 RESULTS FOR ${strategy.name.toUpperCase()}`);
    console.log(`   Total Trades: ${results.totalTrades}`);
    console.log(`   Win Rate: ${results.winRate.toFixed(2)}%`);
    console.log(`   Net P/L: $${results.totalPnL.toFixed(2)}`);
    console.log(`   Final Balance: $${results.finalCapital.toFixed(2)}`);
    console.log(`================================================================\n`);
  }
}

runAllBacktests().catch(console.error);
