import { CompletedTrade, BacktestMetrics } from './types';

export class MetricsCalculator {
  public static calculate(
      trades: CompletedTrade[], 
      initialBalance: number, 
      finalBalance: number
  ): BacktestMetrics {
      const totalTrades = trades.length;
      if (totalTrades === 0) {
          return this.createEmptyMetrics(initialBalance);
      }

      let uniqueWins = 0;
      let grossProfit = 0;
      let grossLoss = 0;
      let totalFees = 0;
      const returns: number[] = [];

      for (const trade of trades) {
          totalFees += trade.fee;
          if (trade.netProfit > 0) {
              uniqueWins++;
              grossProfit += trade.netProfit; // Net profit already has fee deducted? Portfolio implementation says yes.
          } else {
              grossLoss += Math.abs(trade.netProfit);
          }
          // Simple return per trade (relative to entry value approx? or balance?)
          // Usually Sharpe based on period returns, but per-trade return helpful proxy
          // Return = NetProfit / (Entry * Size)
          const investment = trade.entryPrice * trade.size;
          returns.push(trade.netProfit / investment);
      }

      const winRate = uniqueWins / totalTrades;
      const profitFactor = grossLoss === 0 ? grossProfit : grossProfit / grossLoss;
      const totalReturn = finalBalance - initialBalance;
      const returnPercentage = (totalReturn / initialBalance) * 100;

      // Drawdown (Simplified based on Equity Curve needed, but if only trades available, we estimate)
      // Actually we should pass equity curve. But for now let's calculate simplistic from trades?
      // No, passed references usually better. Let's return partial metrics or rely on equity curve passed separately?
      // Method signature didn't ask for equity curve. Let's fix that or use what we have.
      // We will calculate DD from trade sequence implies "Equity at Trade Exit".
      
      let peak = initialBalance;
      let currentEquity = initialBalance;
      let maxDrawdown = 0;

      for (const trade of trades) {
          currentEquity += trade.netProfit;
          if (currentEquity > peak) {
              peak = currentEquity;
          }
          const dd = (peak - currentEquity) / peak;
          if (dd > maxDrawdown) {
              maxDrawdown = dd;
          }
      }

      // Sharpe Ratio (Simplified Risk Free = 0)
      // Avg Return / StdDev of Returns
      const avgReturn = returns.reduce((a, b) => a + b, 0) / totalTrades;
      const variance = returns.reduce((a, b) => a + Math.pow(b - avgReturn, 2), 0) / totalTrades;
      const stdDev = Math.sqrt(variance);
      const sharpeRatio = stdDev === 0 ? 0 : avgReturn / stdDev;

      const expectancy = totalReturn / totalTrades;

      return {
          totalTrades,
          winRate,
          profitFactor,
          maxDrawdown,
          sharpeRatio,
          expectancy,
          grossProfit,
          grossLoss,
          totalFees,
          finalBalance,
          returnPercentage
      };
  }

  private static createEmptyMetrics(balance: number): BacktestMetrics {
      return {
          totalTrades: 0,
          winRate: 0,
          profitFactor: 0,
          maxDrawdown: 0,
          sharpeRatio: 0,
          expectancy: 0,
          grossProfit: 0,
          grossLoss: 0,
          totalFees: 0,
          finalBalance: balance,
          returnPercentage: 0
      };
  }
}
