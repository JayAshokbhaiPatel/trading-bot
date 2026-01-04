import { OHLCV } from '../types/market';
import { StrategyEngine } from '../engine/StrategyEngine';
import { PositionSizer } from '../execution/PositionSizer';
import { BacktestConfig } from './types';
import { TradeSignal } from '../types/trading';

/**
 * Position interface for BacktestEngine
 */
interface BacktestPosition {
    coin: string;
    type: 'LONG' | 'SHORT';
    entryPrice: number;
    entryTime: number;
    quantity: number;
    stopLoss: number;
    takeProfit: number;
    riskAmount: number;
    status: 'OPEN';
    highWaterMark: number; // For trailing stops
    isBreakeven: boolean; // For SL to Entry
}

/**
 * Trade record interface for BacktestEngine
 */
interface BacktestTrade {
    coin: string;
    type: 'LONG' | 'SHORT';
    entryPrice: number;
    exitPrice: number;
    quantity: number;
    entryTime: number;
    exitTime: number;
    duration: string;
    grossPL: number;
    netPL: number;
    plPercent: string;
    riskReward: string;
    status: 'WIN' | 'LOSS';
    reason: string;
}

interface BacktestResults {
    coin: string;
    startDate: number;
    endDate: number;
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    trades: BacktestTrade[];
    equityHistory: { time: number; equity: number, price?: number }[];
    metrics: any;
}

export class BacktestEngine {
  private initialCapital: number;
  private riskPerTrade: number;
  private commission: number;
  private slippage: number;
  
  private capital: number;
  private equity: number;
  private positions: Map<string, BacktestPosition>;
  private trades: BacktestTrade[];
  private equityHistory: { time: number; equity: number, price?: number }[];
  
  private strategyEngine: StrategyEngine;
  private positionSizer: PositionSizer;

  constructor(config: BacktestConfig) {
    this.initialCapital = config.initialCapital || 25000;
    this.riskPerTrade = config.riskPerTrade || 2; // 2%
    this.commission = config.commission || 0.001; // 0.1%
    this.slippage = config.slippage || 0.0005; // 0.05%

    this.capital = this.initialCapital;
    this.equity = this.initialCapital;
    this.positions = new Map();
    this.trades = [];
    this.equityHistory = [];
    this.strategyEngine = new StrategyEngine();
    
    // Initialize PositionSizer
    this.positionSizer = new PositionSizer({
        accountBalance: this.initialCapital,
        riskPercentage: this.riskPerTrade
    });
  }

  /**
   * Run backtest on historical candle data
   */
  public runBacktest(coin: string, candles: OHLCV[]): BacktestResults {
    console.log(`\n🔄 Backtesting ${coin} with ${candles.length} candles...`);
    
    // Reset state for new run if needed
    this.equity = this.initialCapital;
    this.capital = this.initialCapital;
    this.positions.clear();
    this.trades = [];
    this.equityHistory = [];
    
    // Reset PositionSizer metrics
    this.positionSizer = new PositionSizer({
        accountBalance: this.initialCapital,
        riskPercentage: this.riskPerTrade
    });

    const results: BacktestResults = {
      coin,
      startDate: candles[0].timestamp,
      endDate: candles[candles.length - 1].timestamp,
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      trades: [],
      equityHistory: [],
      metrics: {}
    };

    // Run strategy on each candle
    let signalCount = 0;
    
    for (let i = 50; i < candles.length; i++) {
        const recentCandles = candles.slice(0, i + 1);
        const currentCandle = candles[i];
        
        this.checkStops(currentCandle, results);

        try {
            const signal = this.strategyEngine.evaluate(recentCandles, coin);
            
            // ENTRY LOGIC
            const position = this.positions.get(coin);
            
            if (!position) {
                if (signal.action === 'BUY' || signal.action === 'SELL') {
                     // Log potential entry
                     // console.log(`[Backtest] Signal ${signal.action} for ${coin}`);

                     const sizingParams = {
                        accountBalance: this.equity, // Corrected from this.balance
                        riskPercentage: this.riskPerTrade,
                        entryPrice: signal.price,
                        stopLossPrice: signal.stopLoss || (signal.action === 'BUY' ? signal.price * 0.98 : signal.price * 1.02),
                        confidence: signal.confidence || 0.5,
                        volatility: 0 
                     };
                     
                     const sizing = this.positionSizer.intelligentSizing(sizingParams);
                     
                     if ('error' in sizing && sizing.error) {
                         console.log(`[Backtest] Sizing Error for ${coin}: ${sizing.error}`);
                         continue;
                     }
                     
                     // Narrow type
                     if ('error' in sizing) continue; 
                     
                     if (!sizing.recommendation || !sizing.recommendation.quantity || parseFloat(sizing.recommendation.quantity) <= 0) {
                         console.log(`[Backtest] Invalid Size for ${coin}`);
                         continue;
                     }
                     
                     const tradeSize = parseFloat(sizing.recommendation.quantity);
                     const side = signal.action === 'BUY' ? 'LONG' : 'SHORT';
                     const fee = tradeSize * signal.price * this.commission;
                     
                     // Use this.equity as proxy for available capital for simplicity in this engine
                     if (this.equity < fee) {
                         console.log(`[Backtest] Insufficient Equity for ${coin}: ${this.equity} < ${fee}`);
                         continue; 
                     }
                     
                     this.equity -= fee;
                     // this.totalFees += fee; // Remove tracking if property missing

                     this.positions.set(coin, {
                         coin: coin, // Corrected from symbol
                         type: side,
                         entryPrice: signal.price * (side === 'LONG' ? 1 + this.slippage : 1 - this.slippage),
                         quantity: tradeSize, // BacktestPosition has quantity
                         stopLoss: sizing.recommendation && sizing.recommendation.stopLoss ? parseFloat(sizing.recommendation.stopLoss) : (signal.stopLoss || signal.price),
                         takeProfit: signal.takeProfit1 || 0,
                         entryTime: currentCandle.timestamp,
                         riskAmount: sizing.recommendation && sizing.recommendation.riskAmount ? parseFloat(sizing.recommendation.riskAmount) : 0,
                         status: 'OPEN',
                         highWaterMark: signal.action === 'BUY' ? signal.price : signal.price,
                         isBreakeven: false
                     });
                     
                     signalCount++; 
                     console.log(`      [TRADE OPEN] ${side} ${coin} at ${signal.price} | Conf: ${signal.confidence} | Reason: ${signal.reasoning[0]}`);
                }
            } 
            // EXIT LOGIC for MANUAL signals (Strategy reversed or Close)
            else {
                 if (position.type === 'LONG' && signal.action === 'SELL') {
                      this.executeSellSignal(coin, currentCandle, signal, results, 'MANUAL');
                 } else if (position.type === 'SHORT' && signal.action === 'BUY') {
                      this.executeSellSignal(coin, currentCandle, signal, results, 'MANUAL');
                 }
            }
            
            this.updateEquityHistory(currentCandle, results);

        } catch (error: any) {
            console.error(`Error at candle ${i}:`, error.message);
        }
    }
    
    console.log(`   ${coin}: ${signalCount} signals, ${this.trades.length} executed trades`);

    if (this.positions.has(coin)) {
        const lastCandle = candles[candles.length - 1];
        this.executeSellSignal(coin, lastCandle, { action: 'SELL' } as any, results);
    }

    results.trades = this.trades;
    results.equityHistory = this.equityHistory;
    results.metrics = this.calculateMetrics(results);
    results.totalTrades = results.trades.length;
    results.winningTrades = this.trades.filter(t => t.status === 'WIN').length;
    results.losingTrades = this.trades.filter(t => t.status === 'LOSS').length;

    this.printBacktestResults(results);
    return results;
  }

  private checkStops(candle: OHLCV, results: BacktestResults) {
      const highCapSymbols = ['BTCUSD', 'ETHUSD', 'SOLUSD', 'BNBUSD', 'XRPUSD', 'BTC', 'ETH', 'SOL', 'BNB', 'XRP'];
      
      this.positions.forEach((position, coin) => {
          const isHighCap = highCapSymbols.includes(coin.toUpperCase());

          if (position.type === 'LONG') {
              // 1. Check Hard SL
              if (candle.low <= position.stopLoss) {
                  this.executeSellSignal(coin, candle, { action: 'SELL' } as any, results, 'STOP_LOSS');
                  return;
              } 
              
              // 2. Check TP
              if (candle.high >= position.takeProfit) {
                  this.executeSellSignal(coin, candle, { action: 'SELL' } as any, results, 'TAKE_PROFIT');
                  return;
              }

              // 3. Trailing Stop Logic (Move SL to Break-even at 0.5R profit)
              const risk = position.entryPrice - position.stopLoss;
              const beThreshold = risk * 0.5;
              
              if (!position.isBreakeven && candle.high >= (position.entryPrice + beThreshold)) {
                  position.stopLoss = position.entryPrice;
                  position.isBreakeven = true;
              }

              // 4. Update High Water Mark & Simple Trail
              if (candle.high > position.highWaterMark) {
                  position.highWaterMark = candle.high;
                  
                  const currentProfit = (candle.high - position.entryPrice) / position.entryPrice;
                  if (currentProfit > 0.03) {
                      // Tighter trail for high-cap (1.5% vs 2%)
                      const trailDist = isHighCap ? 0.985 : 0.98;
                      const newSL = candle.high * trailDist;
                      if (newSL > position.stopLoss) {
                          position.stopLoss = newSL;
                      }
                  }
              }
          } else if (position.type === 'SHORT') {
              // 1. Check Hard SL
              if (candle.high >= position.stopLoss) {
                  this.executeSellSignal(coin, candle, { action: 'BUY' } as any, results, 'STOP_LOSS'); // 'BUY' to close short
                  return;
              } 
              
              // 2. Check TP
              if (candle.low <= position.takeProfit) {
                  this.executeSellSignal(coin, candle, { action: 'BUY' } as any, results, 'TAKE_PROFIT'); // 'BUY' to close short
                  return;
              }

              // 3. Trailing Stop Logic (Move SL to Break-even at 0.5R profit)
              const risk = position.stopLoss - position.entryPrice; // Risk for short is SL - Entry
              const beThreshold = risk * 0.5;
              
              if (!position.isBreakeven && candle.low <= (position.entryPrice - beThreshold)) {
                  position.stopLoss = position.entryPrice;
                  position.isBreakeven = true;
              }

              // 4. Update High Water Mark & Simple Trail (for short, low water mark)
              if (candle.low < position.highWaterMark) { // highWaterMark used as lowWaterMark for shorts
                  position.highWaterMark = candle.low;
                  
                  const currentProfit = (position.entryPrice - candle.low) / position.entryPrice;
                  if (currentProfit > 0.03) {
                      // Tighter trail for high-cap (1.5% vs 2%)
                      const trailDist = isHighCap ? 1.015 : 1.02; // Trail up for short
                      const newSL = candle.low * trailDist;
                      if (newSL < position.stopLoss) { // For short, SL moves down
                          position.stopLoss = newSL;
                      }
                  }
              }
          }
      });
  }

  // executeBuySignal is no longer used directly for opening positions, its logic is now in runBacktest loop
  private executeBuySignal(coin: string, candle: OHLCV, signal: TradeSignal) {
    // This method is effectively deprecated by the new logic in runBacktest
    // Keeping it for now to avoid breaking other parts if they exist, but it's not called.
    const entryPrice = candle.close * (1 + this.slippage);
    // Use SL/TP directly from signal object
    const stopLoss = signal.stopLoss || (entryPrice * 0.98);
    const takeProfit = signal.takeProfit1 || (entryPrice * 1.04);

    const sizing = this.positionSizer.intelligentSizing({
        entryPrice,
        stopLossPrice: stopLoss,
        takeProfitPrice: takeProfit,
        confidenceScore: signal.confidence,
        tradeGrade: signal.confidence > 0.8 ? 'A' : (signal.confidence > 0.6 ? 'B' : 'C'),
        atr: 0
    });

    // Handle error case from sizing
    if ('error' in sizing) {
        return;
    }

    if (!sizing.riskCheck || !sizing.riskCheck.canOpen) {
        return;
    }

    const quantity = parseFloat(sizing.recommendation.quantity);
    const riskAmount = parseFloat(sizing.recommendation.riskAmount);

    const position: BacktestPosition = {
      coin,
      type: 'LONG',
      entryPrice,
      entryTime: candle.timestamp,
      quantity,
      stopLoss,
      takeProfit: takeProfit || (entryPrice * 1.02),
      riskAmount,
      status: 'OPEN',
      highWaterMark: entryPrice,
      isBreakeven: false
    };
    
    console.log(`      [TRADE OPEN] ${coin} at ${entryPrice.toFixed(2)} | Confidence: ${signal.confidence} | Reasoning: ${signal.reasoning.join(', ')}`);
    
    const commissionCost = (quantity * entryPrice) * this.commission;
    this.equity -= commissionCost; 
    
    this.positions.set(coin, position);
    // We inform Sizer indirectly via recordTrade on exit, no open method needed in this version
  }

  private executeSellSignal(coin: string, candle: OHLCV, signal: TradeSignal, results: BacktestResults, reasonOverride?: string) {
    const position = this.positions.get(coin);
    if (!position) return;

    // Determine exit price based on trigger
    let exitPrice = candle.close;
    if (reasonOverride === 'STOP_LOSS') exitPrice = position.stopLoss;
    if (reasonOverride === 'TAKE_PROFIT') exitPrice = position.takeProfit;
    
    // Apply slippage
    // For Long Closing (Selling), Price Lower = Bad. Slippage lowers price.
    // For Short Closing (Buying), Price Higher = Bad. Slippage raises price.
    if (position.type === 'LONG') {
        exitPrice = exitPrice * (1 - this.slippage);
    } else {
        exitPrice = exitPrice * (1 + this.slippage);
    }

    const positionValue = position.quantity * position.entryPrice;
    const exitValue = position.quantity * exitPrice;
    
    let grossPL = 0;
    if (position.type === 'LONG') {
        grossPL = exitValue - positionValue;
    } else {
        grossPL = positionValue - exitValue; // Short: Entry - Exit
    }

    const commissionCost = exitValue * this.commission;
    const netPL = grossPL - commissionCost;

    this.equity += grossPL - commissionCost; 
    
    const trade: BacktestTrade = {
      coin,
      type: position.type,
      entryPrice: position.entryPrice,
      exitPrice,
      quantity: position.quantity,
      entryTime: position.entryTime,
      exitTime: candle.timestamp,
      duration: this.calculateDuration(position.entryTime, candle.timestamp),
      grossPL,
      netPL,
      plPercent: ((netPL / positionValue) * 100).toFixed(2),
      riskReward: this.calculateRiskReward(position, exitPrice),
      status: netPL > 0 ? 'WIN' : 'LOSS',
      reason: reasonOverride || signal.action
    };

    console.log(`      [TRADE CLOSE] ${position.type} ${coin} at ${exitPrice.toFixed(2)} | Net P/L: $${netPL.toFixed(2)} | Reason: ${trade.reason}`);
    this.trades.push(trade);
    this.positions.delete(coin);
    
    // Record trade in PositionSizer
    this.positionSizer.recordTrade(position.entryPrice, exitPrice, position.quantity, netPL, position.type);
  }

  // ... (updateEquityHistory is fine as it uses quantity * price vs quantity * entry which is implicitly long, we should fix that too)
  // Actually updateEquityHistory logic: currentVal = Q * Price. cost = Q * Entry.
  // Equity += (Current - Cost).
  // For Short: Equity += (Cost - Current). 
  // I need to check updateEquityHistory too.
  
  private updateEquityHistory(candle: OHLCV, results: BacktestResults) {
      let currentEquity = this.equity; // This `equity` is realized equity + initial capital? 
      // check constructor: equity = initial.
      // executeSellSignal updates `this.equity`.
      // So `this.equity` is Realized Balance.
      
      this.positions.forEach(p => {
          const currentVal = p.quantity * candle.close;
          const cost = p.quantity * p.entryPrice;
          let unrealizedPL = 0;
          
          if (p.type === 'LONG') {
              unrealizedPL = currentVal - cost;
          } else {
              unrealizedPL = cost - currentVal;
          }
          
          currentEquity += unrealizedPL;
      });

      this.equityHistory.push({
          time: candle.timestamp,
          equity: currentEquity,
          price: candle.close
      });
  }

  private calculateMetrics(results: BacktestResults) {
    // ... existing logic ...
    const trades = this.trades;
    if (trades.length === 0) return {};

    const winningTrades = trades.filter(t => t.status === 'WIN');
    const losingTrades = trades.filter(t => t.status === 'LOSS');

    const totalReturn = this.equity - this.initialCapital; 
    const totalReturnPercent = ((totalReturn / this.initialCapital) * 100).toFixed(2);
    const winRate = ((winningTrades.length / trades.length) * 100).toFixed(2);
    
    const winningSum = winningTrades.reduce((sum, t) => sum + t.netPL, 0);
    const losingSum = Math.abs(losingTrades.reduce((sum, t) => sum + t.netPL, 0));
    const profitFactor = losingSum > 0 ? (winningSum / losingSum).toFixed(2) : winningSum.toFixed(2);

    // Max Drawdown
    let peak = -Infinity;
    let maxDrawdown = 0;
    this.equityHistory.forEach(e => {
        if (e.equity > peak) peak = e.equity;
        const dd = ((peak - e.equity) / peak) * 100;
        if (dd > maxDrawdown) maxDrawdown = dd;
    });

    // Sharpe
    const returns = [];
    for(let i=1; i<this.equityHistory.length; i++) {
        const r = (this.equityHistory[i].equity - this.equityHistory[i-1].equity) / this.equityHistory[i-1].equity;
        returns.push(r);
    }
    const avgRet = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
    const stdDev = returns.length > 0 ? Math.sqrt(returns.reduce((s, r) => s + Math.pow(r - avgRet, 2), 0) / returns.length) : 0;
    // Sharpe annualized approx
    const sharpeRatio = stdDev > 0 ? (avgRet / stdDev * Math.sqrt(24 * 365)).toFixed(2) : '0.00'; // 1h candles -> 8760/yr? 24*365

    return {
        totalReturn: totalReturn.toFixed(2),
        totalReturnPercent,
        winRate,
        profitFactor,
        maxDrawdown: maxDrawdown.toFixed(2),
        sharpeRatio,
        totalTrades: trades.length,
        winningTrades: winningTrades.length,
        losingTrades: losingTrades.length
    };
  }

  private calculateRiskReward(position: BacktestPosition, exitPrice: number) {
      let risk = 0;
      let reward = 0;
      
      if (position.type === 'LONG') {
          risk = position.entryPrice - position.stopLoss;
          reward = position.takeProfit - position.entryPrice;
      } else {
          risk = position.stopLoss - position.entryPrice;
          reward = position.entryPrice - position.takeProfit;
      }
      
      if (risk <= 0) return '0';
      return (reward / risk).toFixed(2);
  }

  private calculateDuration(start: number, end: number) {
      const ms = end - start;
      const hours = ms / (1000 * 60 * 60);
      return `${hours.toFixed(1)}h`;
  }

  private printBacktestResults(results: BacktestResults) {
      const m = results.metrics;
      console.log(`\n${'='.repeat(60)}`);
      console.log(`📊 BACKTEST RESULTS - ${results.coin}`);
      console.log(`${'='.repeat(60)}`);
      console.log(`   Initial Capital: $${this.initialCapital.toFixed(2)}`);
      console.log(`   Final Equity: $${this.equity.toFixed(2)}`);
      console.log(`   Total Return: $${m.totalReturn} (${m.totalReturnPercent}%)`);
      console.log(`   Win Rate: ${m.winRate}%`);
      console.log(`   Max Drawdown: ${m.maxDrawdown}%`);
      console.log(`   Profit Factor: ${m.profitFactor}`);
      console.log(`   Sharpe Ratio: ${m.sharpeRatio}`);
      console.log(`   Total Trades: ${m.totalTrades} (W: ${m.winningTrades} L: ${m.losingTrades})`);
      console.log(`${'='.repeat(60)}\n`);
  }
}
