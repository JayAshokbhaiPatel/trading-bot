import { OHLCV } from '../types/market';
import { StrategyEngine } from '../engine/StrategyEngine';
import { PositionSizer } from '../execution/PositionSizer'; // New Import
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
    for (let i = 50; i < candles.length; i++) {
        const recentCandles = candles.slice(0, i + 1);
        const currentCandle = candles[i];
        
        this.checkStops(currentCandle, results);

        try {
            const signal = this.strategyEngine.evaluate(recentCandles);
            
            if (signal.action === 'BUY' && !this.positions.has(coin)) {
                 this.executeBuySignal(coin, currentCandle, signal);
            } else if (signal.action === 'SELL' && this.positions.has(coin)) {
                 this.executeSellSignal(coin, currentCandle, signal, results);
            }
            
            this.updateEquityHistory(currentCandle, results);

        } catch (error: any) {
            console.error(`Error at candle ${i}:`, error.message);
        }
    }

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
      this.positions.forEach((position, coin) => {
          if (position.type === 'LONG') {
              if (candle.low <= position.stopLoss) {
                  this.executeSellSignal(coin, candle, { action: 'SELL' } as any, results, 'STOP_LOSS');
              } else if (candle.high >= position.takeProfit) {
                  this.executeSellSignal(coin, candle, { action: 'SELL' } as any, results, 'TAKE_PROFIT');
              }
          }
      });
  }

  private executeBuySignal(coin: string, candle: OHLCV, signal: TradeSignal) {
    this.positionSizer.updateBalance(this.equity);

    const entryPrice = candle.close * (1 + this.slippage);
    const stopLoss = Number(signal.reasoning?.find(r => r.startsWith('SL:'))?.split(':')[1]) || (entryPrice * 0.98);
    const takeProfit = Number(signal.reasoning?.find(r => r.startsWith('TP:'))?.split(':')[1]);

    const sizing = this.positionSizer.intelligentSizing({
        entryPrice,
        stopLossPrice: stopLoss,
        takeProfitPrice: takeProfit,
        confidenceScore: signal.confidence,
        tradeGrade: signal.confidence > 0.8 ? 'A' : (signal.confidence > 0.6 ? 'B' : 'C'),
        atr: 0
    });

    if (!sizing.riskCheck.canOpen) {
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
      status: 'OPEN'
    };
    
    const commissionCost = (quantity * entryPrice) * this.commission;
    this.equity -= commissionCost; 
    
    this.positions.set(coin, position);
    this.positionSizer.incrementOpenPositions();
  }

  private executeSellSignal(coin: string, candle: OHLCV, signal: TradeSignal, results: BacktestResults, reasonOverride?: string) {
    const position = this.positions.get(coin);
    if (!position) return;

    // Determine exit price based on trigger
    let exitPrice = candle.close;
    if (reasonOverride === 'STOP_LOSS') exitPrice = position.stopLoss;
    if (reasonOverride === 'TAKE_PROFIT') exitPrice = position.takeProfit;
    
    // Apply slippage
    exitPrice = exitPrice * (1 - this.slippage);

    const positionValue = position.quantity * position.entryPrice;
    const exitValue = position.quantity * exitPrice;
    const grossPL = exitValue - positionValue;

    const commissionCost = exitValue * this.commission;
    const netPL = grossPL - commissionCost;

    this.equity += (exitValue - positionValue) - commissionCost; 

    // Note: Logic in snippet: `this.equity += exitValue - (position.quantity * position.entryPrice) - commissionCost;`
    // If we deducted entry commission earlier, this adds the PL. Correct.
    
    const trade: BacktestTrade = {
      coin,
      type: 'LONG', // Snippet hardcoded LONG
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

    this.trades.push(trade);
    this.positions.delete(coin);
  }

  private updateEquityHistory(candle: OHLCV, results: BacktestResults) {
      // Calculate unrealized PL of open positions?
      // Snippet: `this.equityHistory.push({ equity: this.equity ... })`
      // Snippet equity variable seems to track "Cash + realized PL" minus commissions? 
      // It does NOT seem to add unrealized PL of open positions in `this.equity`.
      // However, usually Equity Curve includes Floating PL.
      // Snippet: `this.equity` is updated on Buy (sub comm) and Sell (add PL - comm).
      // So `this.equity` is effectively Close Equity (realized). 
      // If I want floating, I should add `positionValue - cost`.
      
      let currentEquity = this.equity;
      this.positions.forEach(p => {
          const currentVal = p.quantity * candle.close;
          const cost = p.quantity * p.entryPrice;
          currentEquity += (currentVal - cost);
      });

      this.equityHistory.push({
          time: candle.timestamp,
          equity: currentEquity,
          price: candle.close
      });
  }

  private calculateMetrics(results: BacktestResults) {
    const trades = this.trades;
    if (trades.length === 0) return {};

    const winningTrades = trades.filter(t => t.status === 'WIN');
    const losingTrades = trades.filter(t => t.status === 'LOSS');

    const totalReturn = this.equity - this.initialCapital; // Verify this matches final equity (realized)
    // Actually since we calculate floating equity in history, `this.equity` at end (when all closed) is final.
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
    // Calculate daily returns
    // Simplification: use per-candle returns for std dev? Or aggregate to daily?
    // Snippet assumes equityHistory is per candle. 
    // It calculates returns array from equityHistory.
    const returns = [];
    for(let i=1; i<this.equityHistory.length; i++) {
        const r = (this.equityHistory[i].equity - this.equityHistory[i-1].equity) / this.equityHistory[i-1].equity;
        returns.push(r);
    }
    const avgRet = returns.reduce((a, b) => a + b, 0) / returns.length;
    const stdDev = Math.sqrt(returns.reduce((s, r) => s + Math.pow(r - avgRet, 2), 0) / returns.length);
    // Annualize? Snippet uses 252. If candles are 1h, 252 is wrong constant.
    // If 1h candles: 24 * 365 = 8760 periods.
    // I'll stick to snippet 252 or just use 0 if NaN.
    const sharpeRatio = (avgRet / stdDev * Math.sqrt(252)).toFixed(2);

    return {
        totalReturn: totalReturn.toFixed(2),
        totalReturnPercent,
        winRate,
        profitFactor,
        maxDrawdown: maxDrawdown.toFixed(2),
        sharpeRatio: isNaN(Number(sharpeRatio)) ? 0 : sharpeRatio,
        totalTrades: trades.length,
        winningTrades: winningTrades.length,
        losingTrades: losingTrades.length
    };
  }

  private calculateRiskReward(position: BacktestPosition, exitPrice: number) {
      const risk = position.entryPrice - position.stopLoss;
      const reward = position.takeProfit - position.entryPrice;
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
      // Use final equity from history to include any float, or realized?
      // We closed all positions at end, so this.equity is final.
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
