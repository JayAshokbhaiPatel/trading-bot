import { BacktestEngine } from './backtest/BacktestEngine';
import { PinBarStrategy } from './strategies/PinBarStrategy';
import { BreakoutRetestStrategy } from './strategies/BreakoutRetestStrategy';
import { FailedBreakoutStrategy } from './strategies/FailedBreakoutStrategy';
import { Candle } from './types/index';

// Generate Mock Trending Data with some random noise and patterns
function generateMockData(count: number = 200): Candle[] {
  const candles: Candle[] = [];
  let price = 100;
  for (let i = 0; i < count; i++) {
    const open = price;
    const high = open + Math.random() * 2;
    const low = open - Math.random() * 2;
    const close = low + Math.random() * (high - low);
    candles.push({
      timestamp: Date.now() + i * 60000,
      open,
      high,
      low,
      close,
      volume: 1000 + Math.random() * 500
    });
    price = close;
  }
  return candles;
}

// Targeted Pattern Generation: Pin Bar
function injectPinBar(candles: Candle[], type: 'BULLISH' | 'BEARISH'): void {
    const last = candles[candles.length - 1];
    if (type === 'BULLISH') {
        last.open = 105;
        last.high = 106;
        last.low = 95; // Long lower wick
        last.close = 104;
    } else {
        last.open = 95;
        last.high = 105; // Long upper wick
        last.low = 94;
        last.close = 96;
    }
}

async function verify() {
  console.log('🚀 Starting Verification of Trading Bot Systems...\n');

  const data = generateMockData(100);
  injectPinBar(data, 'BULLISH');
  
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
    new FailedBreakoutStrategy()
  ];

  for (const strategy of strategies) {
    console.log(`\n--- Testing ${strategy.name} ---`);
    const results = await engine.run(strategy, data);
    console.log(`Total Trades: ${results.totalTrades}`);
    console.log(`Final Capital: $${results.finalCapital.toFixed(2)}`);
    console.log(`Win Rate: ${results.winRate.toFixed(2)}%`);

    if (results.trades.length > 0) {
        const firstTrade = results.trades[0];
        console.log(`Example Trade: ${firstTrade.direction} | Risk: $${firstTrade.riskAmount.toFixed(2)} | Shares: ${firstTrade.shares}`);
    }
  }

  console.log('\n✅ Verification Script Complete.');
}

verify();
