import dotenv from 'dotenv';
dotenv.config();

import { AccountManager } from './core/AccountManager';
import { DeltaExchangeService } from './services/DeltaExchangeService';
import { PinBarStrategy } from './strategies/PinBarStrategy';
import { BreakoutRetestStrategy } from './strategies/BreakoutRetestStrategy';
import { ConsolidationBreakoutStrategy } from './strategies/ConsolidationBreakoutStrategy';
import { DoubleTopBottomStrategy } from './strategies/DoubleTopBottomStrategy';
import { InsideBarStrategy } from './strategies/InsideBarStrategy';
import { SupplyDemandStrategy } from './strategies/SupplyDemandStrategy';
import { TrendContinuationStrategy } from './strategies/TrendContinuationStrategy';
import { FailedBreakoutStrategy } from './strategies/FailedBreakoutStrategy';

import { MTFConfluenceManager } from './core/MTFConfluenceManager';

async function startLiveScanner() {
  console.log('🚀 Crypto Swing Trading Bot - MTF Confluence Scanner Starting...');
  console.log(`📈 Timeframes: 15m, 1h, 4h`);

  const account = new AccountManager({
    initialCapital: parseFloat(process.env.ACCOUNT_BALANCE || '1000'),
    commission: 0.001,
    slippage: 0.0005,
    riskPerTrade: parseFloat(process.env.NORMAL_RISK_PERCENT || '2.0') / 100,
    maxDailyLoss: 0.05,
    maxTradesPerDay: 10,
    leverage: parseInt(process.env.NORMAL_MAX_LEVERAGE || '10')
  });

  const delta = new DeltaExchangeService();
  const mtfManager = new MTFConfluenceManager();
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

  console.log('📊 Fetching top 20 coins by volume...');
  const topCoins = await delta.getTop20ByVolume();
  console.log(`✅ Monitoring: ${topCoins.join(', ')}\n`);
  console.log('⏰ Bot is running. Scanning for MTF Confluence every 5 minutes.\n');

  const runScan = async (isInitial = false) => {
    const label = isInitial ? 'Initial Scan' : 'Regular Scan';
    const state = account.getState();
    const threshold = parseFloat(process.env.RISK_SWITCH_THRESHOLD || '300');
    
    // Determine risk level based on current capital
    const isHighRisk = state.capital < threshold;
    const riskPercent = isHighRisk 
        ? parseFloat(process.env.HIGH_RISK_PERCENT || '10.0') 
        : parseFloat(process.env.NORMAL_RISK_PERCENT || '2.0');
    const maxLeverage = isHighRisk 
        ? parseInt(process.env.HIGH_RISK_MAX_LEVERAGE || '20') 
        : parseInt(process.env.NORMAL_MAX_LEVERAGE || '10');

    // Update account config for this scan
    account.updateConfig({
        riskPerTrade: riskPercent / 100,
        leverage: maxLeverage
    });

    console.log(`\n${'='.repeat(80)}`);
    console.log(`⏰ [${new Date().toLocaleString()}] ${label} - MTF Confluence`);
    console.log(`💰 Capital: $${state.capital.toFixed(2)} | Risk: ${riskPercent}% | Max Leverage: ${maxLeverage}x`);
    console.log(`${'='.repeat(80)}`);

    const psychology = account.isRevengeTrading();
    if (psychology.status) {
        console.log(psychology.message);
        return;
    }

    for (const symbol of topCoins) {
      try {
        // Fetch all timeframes in parallel for speed
        const [tf15m, tf1h, tf4h, ticker] = await Promise.all([
          delta.getCandles(symbol, '15m', 100),
          delta.getCandles(symbol, '1h', 100),
          delta.getCandles(symbol, '4h', 100),
          delta.getTicker(symbol)
        ]);

        const result = mtfManager.analyzeMTF(symbol, tf15m, tf1h, tf4h, strategies, ticker.markPrice);
        
        if (result) {
          const { bestSignal, confluenceScore, tfHighTrend, tfMediumTrend } = result;
          
          // Calculate execution details
          const { shares, riskAmount } = account.calculatePositionSize(bestSignal.price, bestSignal.stopLoss);
          const positionValue = shares * bestSignal.price;
          const effectiveLeverage = positionValue / account.getState().capital;
          const potentialProfit = Math.abs(bestSignal.takeProfit - bestSignal.price) * shares;

          const risk = Math.abs(bestSignal.price - bestSignal.stopLoss);
          const reward = Math.abs(bestSignal.takeProfit - bestSignal.price);
          const rr = risk > 0 ? reward / risk : 0;

          console.log(`\n🎯 MTF SIGNAL [${symbol}] | Score: ${confluenceScore}/100`);
          console.log(`   Action: ${bestSignal.action} @ ${bestSignal.price.toFixed(4)} (Live Price)`);
          console.log(`   Trends: 4H [${tfHighTrend}] | 1H [${tfMediumTrend}]`);
          console.log(`   Strategy: ${bestSignal.pattern || 'Setup'}`);
          console.log(`   SL: ${bestSignal.stopLoss.toFixed(4)} | TP: ${bestSignal.takeProfit.toFixed(4)}`);
          console.log(`   🛡️ Support: [${result.supportLevels.map(l => l.toFixed(4)).join(', ')}]`);
          console.log(`   🧱 Resistance: [${result.resistanceLevels.map(l => l.toFixed(4)).join(', ')}]`);
          console.log(`   Risk/Reward: ${rr.toFixed(2)}R`);
          console.log(`   📊 Position Size: ${shares.toFixed(2)} contracts ($${positionValue.toFixed(2)})`);
          console.log(`   💸 Effective Leverage: ${effectiveLeverage.toFixed(2)}x (Max: ${maxLeverage}x)`);
          console.log(`   💰 Potential Loss: $${riskAmount.toFixed(2)} | 💵 Potential Profit: $${potentialProfit.toFixed(2)}`);
          console.log(`   --------------------------------------------------------------------------------`);
        }
      } catch (error) {
        console.error(`❌ Error scanning ${symbol}:`, error);
      }
    }
    console.log(`\n✅ ${label} complete.`);
  };

  // Main scanning loop - every 5 minutes
  setInterval(() => runScan(), 5 * 60 * 1000);

  // Run initial scan immediately
  runScan(true);
}

startLiveScanner().catch(console.error);
