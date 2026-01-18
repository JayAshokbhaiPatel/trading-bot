import { AccountManager } from '../core/AccountManager';
import { BaseStrategy } from '../core/BaseStrategy';
import { Candle, Position, Trade, ExitType } from '../types/index';
import { LevelAnalyzer } from '../utils/LevelAnalyzer';

export interface BacktestConfig {
  initialCapital: number;
  commission: number;
  slippage: number;
  riskPerTrade: number;
  leverage: number;
  includePsychology: boolean;
}

export class BacktestEngine {
  private config: BacktestConfig;
  private accountManager: AccountManager;
  private currentPosition: Position | null = null;
  private trades: Trade[] = [];
  private equityCurve: { timestamp: string | number, equity: number }[] = [];

  constructor(config: BacktestConfig) {
    this.config = config;
    this.accountManager = new AccountManager({
      initialCapital: config.initialCapital,
      commission: config.commission,
      slippage: config.slippage,
      riskPerTrade: config.riskPerTrade,
      maxDailyLoss: 0.05,
      maxTradesPerDay: 10,
      leverage: config.leverage
    });
  }

  public async run(strategy: BaseStrategy, historicalData: Candle[]): Promise<any> {
    console.log(`🔬 Starting backtest for ${strategy.name} on ${historicalData.length} candles...`);
    
    this.trades = [];
    this.currentPosition = null;

    for (let i = 50; i < historicalData.length; i++) {
      const currentCandle = historicalData[i];
      const previousCandles = historicalData.slice(0, i + 1);

      // 1. Check for exits
      if (this.currentPosition) {
        const exit = this.checkExit(this.currentPosition, currentCandle);
        if (exit) {
          this.closePosition(this.currentPosition, exit.price, exit.type, currentCandle);
        }
      }

      // 2. Check for entries
        const signal = strategy.analyze(previousCandles);
        if (signal && signal.action !== 'WAIT') {
          this.openPosition(signal, currentCandle, strategy.name, previousCandles);
        }

      // 3. Update equity
      const state = this.accountManager.getState();
      this.equityCurve.push({
        timestamp: currentCandle.timestamp,
        equity: state.capital + this.calculateUnrealizedPnL(currentCandle)
      });
    }

    return this.calculateResults();
  }

  private openPosition(signal: any, candle: Candle, strategyName: string, history: Candle[]): void {
    const sizing = this.accountManager.calculatePositionSize(signal.price, signal.stopLoss);
    if (sizing.shares <= 0) return;

    this.currentPosition = {
      id: `trade_${Date.now()}_${Math.random()}`,
      entryTime: candle.timestamp,
      entryPrice: signal.price,
      stopLoss: signal.stopLoss,
      takeProfit: signal.takeProfit,
      shares: sizing.shares,
      direction: signal.action === 'BUY' ? 'LONG' : 'SHORT',
      strategy: strategyName,
      setup: signal.setup || '',
      riskAmount: sizing.riskAmount,
      riskPercent: (sizing.riskAmount / this.accountManager.getState().capital) * 100,
      initialCapital: this.accountManager.getState().capital
    };

    this.accountManager.updateOnTradeStart();
    
    // Deduct entry cost (commission)
    const entryCost = this.currentPosition.shares * this.currentPosition.entryPrice * this.config.commission;
    this.accountManager.updateOnTradeEnd(-entryCost);

    const levels = LevelAnalyzer.findLevels(history, 50);
    
    console.log(`📈 OPEN ${this.currentPosition.direction} | ${strategyName} | Price: ${signal.price} | Risk: ${sizing.riskAmount.toFixed(2)}`);
    console.log(`   🛡️ Support: [${levels.support.map(l => l.toFixed(2)).join(', ')}]`);
    console.log(`   🧱 Resistance: [${levels.resistance.map(l => l.toFixed(2)).join(', ')}]`);
  }

  private checkExit(position: Position, candle: Candle): { price: number, type: ExitType } | null {
    if (position.direction === 'LONG') {
      if (candle.low <= position.stopLoss) return { price: position.stopLoss, type: 'STOP_LOSS' };
      if (candle.high >= position.takeProfit) return { price: position.takeProfit, type: 'TAKE_PROFIT' };
    } else {
      if (candle.high >= position.stopLoss) return { price: position.stopLoss, type: 'STOP_LOSS' };
      if (candle.low <= position.takeProfit) return { price: position.takeProfit, type: 'TAKE_PROFIT' };
    }
    return null;
  }

  private closePosition(position: Position, exitPrice: number, type: ExitType, candle: Candle): void {
    let pnl = 0;
    if (position.direction === 'LONG') {
      pnl = (exitPrice - position.entryPrice) * position.shares;
    } else {
      pnl = (position.entryPrice - exitPrice) * position.shares;
    }

    // Apply slippage and exit commission
    const exitCost = position.shares * exitPrice * (this.config.commission + this.config.slippage);
    pnl -= exitCost;

    this.accountManager.updateOnTradeEnd(pnl);

    const trade: Trade = {
      ...position,
      exitTime: candle.timestamp,
      exitPrice: exitPrice,
      exitType: type,
      pnl: pnl,
      pnlPercent: (pnl / position.initialCapital) * 100,
      riskReward: Math.abs(pnl / position.riskAmount),
      duration: 'N/A', // Simple simulation
    };

    this.trades.push(trade);
    this.currentPosition = null;

    console.log(`📉 CLOSE ${position.direction} | ${type} | P&L: ${pnl.toFixed(2)}`);
  }

  private calculateUnrealizedPnL(candle: Candle): number {
    if (!this.currentPosition) return 0;
    const pos = this.currentPosition;
    if (pos.direction === 'LONG') {
      return (candle.close - pos.entryPrice) * pos.shares;
    } else {
      return (pos.entryPrice - candle.close) * pos.shares;
    }
  }

  private calculateResults(): any {
    const wins = this.trades.filter(t => t.pnl > 0);
    const losses = this.trades.filter(t => t.pnl <= 0);
    const totalPnL = this.trades.reduce((sum, t) => sum + t.pnl, 0);
    const winRate = (wins.length / (this.trades.length || 1)) * 100;

    // Advanced Metrics
    const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + t.pnl, 0) / losses.length) : 0;
    const profitFactor = avgLoss > 0 ? (wins.reduce((s, t) => s + t.pnl, 0) / Math.abs(losses.reduce((s, t) => s + t.pnl, 0))) : totalPnL > 0 ? 100 : 0;
    const expectancy = (winRate / 100 * avgWin) - ((1 - winRate / 100) * avgLoss);

    // Simple Sharpe Ratio (Return / StdDev of Returns)
    const returns = this.trades.map(t => t.pnlPercent);
    const avgReturn = returns.reduce((a, b) => a + b, 0) / (returns.length || 1);
    const stdDev = Math.sqrt(returns.reduce((s, r) => s + Math.pow(r - avgReturn, 2), 0) / (returns.length || 1)) || 1;
    const sharpe = (avgReturn / stdDev) * Math.sqrt(252); // Annualized approximation

    return {
      totalTrades: this.trades.length,
      winRate: winRate,
      totalPnL: totalPnL,
      finalCapital: this.accountManager.getState().capital,
      maxDrawdown: this.accountManager.getState().maxDrawdown,
      profitFactor: profitFactor,
      expectancy: expectancy,
      sharpeRatio: sharpe,
      trades: this.trades
    };
  }
}
