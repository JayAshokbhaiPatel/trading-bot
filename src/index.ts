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
  const coinSelector = new CoinSelector({ refreshInterval: 60 * 60 * 1000, topN: 25 });
  
  // Initialize Position Sizer
  const positionSizer = new PositionSizer({
    accountBalance: env.ACCOUNT_BALANCE,
    riskPercentage: env.RISK_PER_TRADE,
    maxRiskPercentage: env.MAX_RISK_PER_TRADE,
    minRiskPercentage: env.MIN_RISK_PER_TRADE,
    maxLeverage: 5,
  });

  await coinSelector.start();
  // Wait for initial fetch
  await new Promise(r => setTimeout(r, 2000));
  
  const symbols = coinSelector.getSelectedCoins();
  logger.info({ symbols }, 'Dynamically Selected Top Coins (Delta)');

  logger.info('Engines initialized. Entering main loop...');

  // Main Loop Handler
  const runAnalysis = async () => {
      const currentSymbols = coinSelector.getSelectedCoins();
      let signalCount = 0;
      
      for (const symbol of currentSymbols) {
          try {
              const candles = await marketData.getCandles(symbol, TIMEFRAME, 100);
              if (candles.length < 50) continue;

              const signal = await strategy.evaluateAsync(candles, symbol, TIMEFRAME);

              if (signal.action !== 'NO_TRADE') {
                  const rrRatio = signal.stopLoss && signal.takeProfit1 
                      ? (Math.abs(signal.takeProfit1 - signal.price) / Math.abs(signal.price - signal.stopLoss)).toFixed(2)
                      : 'N/A';
                  
                  logger.info({
                      symbol,
                      action: signal.action,
                      price: signal.price,
                      sl: signal.stopLoss,
                      tp1: signal.takeProfit1,
                      rr: `1:${rrRatio}`,
                      confidence: signal.confidence,
                      reasoning: signal.reasoning
                  }, `🔥 SIGNAL`);
                  
                  if (signal.stopLoss && signal.takeProfit1) {
                      const sizing = positionSizer.intelligentSizing({
                          entryPrice: signal.price,
                          stopLossPrice: signal.stopLoss,
                          takeProfitPrice: signal.takeProfit1,
                          confidenceScore: signal.confidence,
                          tradeGrade: signal.confidence > 0.8 ? 'A' : (signal.confidence > 0.6 ? 'B' : 'C')
                      });
                      
                      if ('error' in sizing) {
                          logger.warn(`⚠️ Sizing Error: ${sizing.error}`);
                      } else if (sizing.riskCheck.canOpen) {
                          logger.info({
                              qty: sizing.recommendation.quantity,
                              risk: `$${sizing.recommendation.riskAmount}`
                          }, `📊 Position`);
                      } else {
                          logger.warn(`⚠️ Blocked: ${sizing.riskCheck.failureReasons.join(', ')}`);
                      }
                  }
                  
                  await notifier.sendAlert(signal, symbol);
                  signalCount++;
              }

          } catch (error) {
              logger.error({ error, symbol }, 'Error');
          }
      }
      logger.info(`✅ Cycle: ${currentSymbols.length} coins scanned, ${signalCount} signals`);
  };

  // Run immediately
  await runAnalysis();

  setInterval(runAnalysis, INTERVAL_MS); 
};

main().catch((err) => {
  logger.error(err, 'Uncaught error in main process');
  process.exit(1);
});
