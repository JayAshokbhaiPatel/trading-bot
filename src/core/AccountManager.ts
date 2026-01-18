import { AccountState, Candle, Direction, Position, Signal } from '../types/index';

export interface AccountManagerConfig {
  initialCapital: number;
  commission: number;
  slippage: number;
  riskPerTrade: number; // e.g., 0.02 for 2%
  maxDailyLoss: number; // e.g., 0.05 for 5%
  maxTradesPerDay: number;
  leverage: number;
}

export class AccountManager {
  private state: AccountState;
  private config: AccountManagerConfig;

  constructor(config: AccountManagerConfig) {
    this.config = config;
    this.state = {
      initialCapital: config.initialCapital,
      capital: config.initialCapital,
      equity: config.initialCapital,
      todayPNL: 0,
      weeklyPNL: 0,
      tradesToday: 0,
      winningStreak: 0,
      losingStreak: 0,
      maxEquity: config.initialCapital,
      maxDrawdown: 0
    };
  }

  public updateConfig(newConfig: Partial<AccountManagerConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  public getState(): AccountState {
    return { ...this.state };
  }

  public isRevengeTrading(): { status: boolean; message?: string } {
    // Check for excessive trades
    if (this.state.tradesToday >= this.config.maxTradesPerDay) {
      return {
        status: true,
        message: `⚠️ Revenge Trading Warning: You've reached your daily trade limit (${this.config.maxTradesPerDay}). Step away and cool down.`
      };
    }

    // Check for extreme losing streak
    if (this.state.losingStreak >= 3) {
      return {
        status: true,
        message: `⚠️ Revenge Trading Warning: ${this.state.losingStreak} losses in a row. Market structure might have shifted, or you might be chasing trades.`
      };
    }

    // Check for daily drawdown limit
    const dailyPnLPercent = this.state.todayPNL / this.config.initialCapital;
    if (dailyPnLPercent <= -this.config.maxDailyLoss) {
      return {
        status: true,
        message: `⚠️ Stop Trading: Daily loss limit of ${(this.config.maxDailyLoss * 100).toFixed(1)}% reached. Terminal locked for today.`
      };
    }

    return { status: false };
  }

  public calculatePositionSize(entryPrice: number, stopLoss: number): { shares: number; riskAmount: number } {
    const riskPerShare = Math.abs(entryPrice - stopLoss);
    if (riskPerShare === 0) return { shares: 0, riskAmount: 0 };

    // Smart sizing: Use current capital * risk %
    const riskAmount = this.state.capital * this.config.riskPerTrade;
    
    // Position size based on risk
    let shares = riskAmount / riskPerShare;

    // Apply leverage limit
    // Max position value = capital * leverage
    const maxPositionValue = this.state.capital * this.config.leverage;
    const requestedPositionValue = shares * entryPrice;

    if (requestedPositionValue > maxPositionValue) {
      shares = maxPositionValue / entryPrice;
    }

    // Final safety valve: Never allow position value to exceed what's allowed by leverage config
    // (This is already handled by maxPositionValue above, but we keep the shares rounding logic)
    return {
      shares: Math.floor(shares * 100) / 100, // Round to 2 decimals
      riskAmount: (Math.floor(shares * 100) / 100) * riskPerShare
    };
  }

  public updateOnTradeStart(): void {
    this.state.tradesToday++;
  }

  public updateOnTradeEnd(pnl: number): void {
    this.state.capital += pnl;
    this.state.todayPNL += pnl;
    this.state.weeklyPNL += pnl;

    if (pnl > 0) {
      this.state.winningStreak++;
      this.state.losingStreak = 0;
    } else {
      this.state.losingStreak++;
      this.state.winningStreak = 0;
    }

    if (this.state.capital > this.state.maxEquity) {
      this.state.maxEquity = this.state.capital;
    }

    const currentDrawdown = this.state.maxEquity - this.state.capital;
    if (currentDrawdown > this.state.maxDrawdown) {
      this.state.maxDrawdown = currentDrawdown;
    }
  }

  public resetDailyStats(): void {
    this.state.todayPNL = 0;
    this.state.tradesToday = 0;
  }
}
