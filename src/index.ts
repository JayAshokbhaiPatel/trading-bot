import { logger } from './utils/logger';
import { env } from './config/env';
import { MarketDataEngine } from './engine/MarketDataEngine';
import { StrategyEngine } from './engine/StrategyEngine';
import { TelegramNotifier } from './notification/TelegramNotifier';
import { BacktestConfig } from './backtest/types';
import { PositionSizer } from './execution/PositionSizer';

import { CoinSelector } from './engine/CoinSelector';

// Configuration
// const SYMBOLS = ['BTCUSD', 'ETHUSD', 'SOLUSD']; // Legacy Hardcoded
const TIMEFRAME = '1h'; // Analysis Timeframe
const INTERVAL_MS = 15 * 60 * 1000; 

const main = async () => {
  logger.info(`Starting Crypto Notifier Bot in ${env.NODE_ENV} mode...`);

  // Initialize Engines
  const marketData = new MarketDataEngine();
  const strategy = new StrategyEngine();
  const notifier = new TelegramNotifier();
  const coinSelector = new CoinSelector({ refreshInterval: 60 * 60 * 1000, topN: 20 });
  
  // Initialize Position Sizer
  const positionSizer = new PositionSizer({
    accountBalance: env.ACCOUNT_BALANCE,
    riskPercentage: env.RISK_PER_TRADE,
    maxRiskPercentage: env.MAX_RISK_PER_TRADE,
    minRiskPercentage: env.MIN_RISK_PER_TRADE
  });

  await coinSelector.start();
  // Wait for initial fetch
  await new Promise(r => setTimeout(r, 2000));
  
  const symbols = coinSelector.getSelectedCoins();
  logger.info({ symbols }, 'Dynamically Selected Top Coins (Delta)');

  logger.info('Engines initialized. Entering main loop...');

  // Main Loop Handler
  const runAnalysis = async () => {
      logger.info('--- Starting Analysis Cycle ---');
      
      const currentSymbols = coinSelector.getSelectedCoins();
      
      let signalCount = 0;
      for (const symbol of currentSymbols) {
          try {
              logger.debug(`Analyzing ${symbol}...`);
              
              // 1. Fetch Data
              const candles = await marketData.getCandles(symbol, TIMEFRAME, 100);
              
              if (candles.length < 50) {
                  logger.warn(`Insufficient data for ${symbol}. Skipping.`);
                  continue;
              }

              // 2. Evaluate Strategy
              const signal = strategy.evaluate(candles, TIMEFRAME);

              logger.debug({ symbol, action: signal.action, confidence: signal.confidence }, 'Strategy Result');

              // 3. Notify
              if (signal.action !== 'NO_TRADE') {
                  logger.info(`\n🔥 Signal Found for ${symbol}: ${signal.action}`);
                  logger.info(`   Timeframe: ${signal.timeframe || TIMEFRAME}`);
                  logger.info(`   Confidence: ${signal.confidence}`);
                  logger.info(`   Price: ${signal.price}`);
                  if (signal.stopLoss) logger.info(`   SL: ${signal.stopLoss}`);
                  if (signal.takeProfit1) logger.info(`   TP1: ${signal.takeProfit1}`);
                  if (signal.takeProfit2) logger.info(`   TP2: ${signal.takeProfit2}`);
                  
                  // Calculate Position Sizing
                  if (signal.stopLoss && signal.takeProfit1) {
                      const sizing = positionSizer.intelligentSizing({
                          entryPrice: signal.price,
                          stopLossPrice: signal.stopLoss,
                          takeProfitPrice: signal.takeProfit1,
                          confidenceScore: signal.confidence,
                          tradeGrade: signal.confidence > 0.8 ? 'A' : (signal.confidence > 0.6 ? 'B' : 'C')
                      });
                      
                      if (sizing.riskCheck.canOpen) {
                          logger.info(`\n   📊 POSITION SIZING:`);
                          logger.info(`   Quantity: ${sizing.recommendation.quantity} units`);
                          logger.info(`   Risk Amount: $${sizing.recommendation.riskAmount}`);
                          logger.info(`   Position Value: $${(parseFloat(sizing.recommendation.quantity) * signal.price).toFixed(2)}`);
                          const rrRatio = Math.abs(signal.takeProfit1 - signal.price) / Math.abs(signal.price - signal.stopLoss);
                          logger.info(`   Risk/Reward: 1:${rrRatio.toFixed(2)}`);
                          logger.info(`   Account Balance: $${env.ACCOUNT_BALANCE}`);
                          logger.info(`   Risk Per Trade: ${env.RISK_PER_TRADE}%`);
                      } else {
                          logger.warn(`   ⚠️  POSITION BLOCKED: ${sizing.riskCheck.failureReasons.join(', ')}`);
                      }
                  }
                  
                  logger.info(`\n   Reasoning:`);
                  signal.reasoning.forEach(r => logger.info(`    - ${r}`));
                  
                  await notifier.sendAlert(signal, symbol);
                  signalCount++;
              }

          } catch (error) {
              logger.error({ error, symbol }, 'Error processing symbol');
          }
      }
      logger.info(`--- Cycle Complete. Scanned ${currentSymbols.length} coins. Signals found: ${signalCount} ---`);
  };

  // Run immediately
  await runAnalysis();

  setInterval(runAnalysis, INTERVAL_MS); 
};

main().catch((err) => {
  logger.error(err, 'Uncaught error in main process');
  process.exit(1);
});
