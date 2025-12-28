import { PositionResult } from '../types/trading';
import { logger } from '../utils/logger';

export interface RiskConfig {
    maxDailyLoss: number; // Percentage (e.g., 0.02 for 2%)
    maxPositions: number; // Max concurrent positions
    sizingMethod: 'FIXED' | 'KELLY' | 'VOLATILITY' | 'COMBINED';
    kellyFraction: number; // 0.5 (Half-Kelly)
    volatilityTarget: number; // Target daily volatility impact (e.g. 0.01)
    baseRiskPercentage: number; // 0.01
}

export interface PerformanceState {
    winRate: number; // 0-1
    profitFactor: number;
    dailyPL: number; // Absolute value
    openPositionsCount: number;
}

export class RiskManager {
  private config: RiskConfig;

  constructor(config: Partial<RiskConfig> = {}) {
      this.config = {
          maxDailyLoss: 0.03, // 3% Max Daily Loss
          maxPositions: 3,
          sizingMethod: 'FIXED',
          kellyFraction: 0.5,
          volatilityTarget: 0.01,
          baseRiskPercentage: 0.01,
          ...config
      };
  }

  public updateConfig(newConfig: Partial<RiskConfig>) {
      this.config = { ...this.config, ...newConfig };
  }

  public calculatePosition(
    accountBalance: number,
    entryPrice: number,
    stopLossPrice: number,
    takeProfitPrice: number,
    symbol: string,
    action: 'BUY' | 'SELL',
    confidence: number = 50, // 0-100
    atr?: number,
    performance?: PerformanceState
  ): PositionResult {
    const reasons: string[] = [];
    let isValid = true;

    // 1. Check Circuit Breakers
    if (performance && performance.dailyPL <= -(accountBalance * this.config.maxDailyLoss)) {
        return this.createInvalidResult(symbol, action, entryPrice, stopLossPrice, takeProfitPrice, 0, [`Daily Loss Limit Hit: $${performance.dailyPL.toFixed(2)}`]);
    }

    if (performance && performance.openPositionsCount >= this.config.maxPositions) {
        return this.createInvalidResult(symbol, action, entryPrice, stopLossPrice, takeProfitPrice, 0, [`Max Positions Reached (${this.config.maxPositions})`]);
    }

    // 2. Adjust Risk % based on Confidence
    let confidenceMultiplier = 1.0;
    if (confidence >= 80) confidenceMultiplier = 1.25;
    else if (confidence >= 60) confidenceMultiplier = 1.0;
    else if (confidence >= 40) confidenceMultiplier = 0.8;
    else confidenceMultiplier = 0.5;

    // 3. Determine Base Risk Percentage
    let riskPercentage = this.config.baseRiskPercentage;

    switch (this.config.sizingMethod) {
        case 'KELLY':
            if (performance && performance.winRate > 0) {
                const reward = Math.abs(takeProfitPrice - entryPrice);
                const risk = Math.abs(entryPrice - stopLossPrice);
                const setupR = reward / risk;
                
                const kelly = performance.winRate - ((1 - performance.winRate) / setupR);
                let kellySize = Math.max(0, kelly * this.config.kellyFraction);
                // Cap Kelly at 5%
                riskPercentage = Math.min(kellySize, 0.05); 
                reasons.push(`Kelly Sizing: WinRate ${performance.winRate.toFixed(2)}, R ${setupR.toFixed(2)} -> ${(riskPercentage*100).toFixed(2)}%`);
            } else {
                 // Fallback if no performance data
                 riskPercentage = 0.01;
            }
            break;

        case 'VOLATILITY':
            if (atr) {
                 const units = (accountBalance * this.config.volatilityTarget) / atr;
                 const stopDist = Math.abs(entryPrice - stopLossPrice);
                 const impliedRisk = units * stopDist;
                 riskPercentage = impliedRisk / accountBalance;
                 reasons.push(`Volatility Sizing: Target ${this.config.volatilityTarget*100}% Vol -> ${(riskPercentage*100).toFixed(2)}% Risk`);
            } else {
                reasons.push('No ATR provided, falling back to Fixed');
            }
            break;

        case 'COMBINED':
             riskPercentage = riskPercentage * confidenceMultiplier;
             break;
             
        case 'FIXED':
        default:
             riskPercentage = riskPercentage * confidenceMultiplier;
             break;
    }

    // Safety Cap
    riskPercentage = Math.min(riskPercentage, 0.05);

    // 4. Calculate Amounts
    const riskAmount = accountBalance * riskPercentage;
    const stopDistance = Math.abs(entryPrice - stopLossPrice);

    if (stopDistance === 0) {
         return this.createInvalidResult(symbol, action, entryPrice, stopLossPrice, takeProfitPrice, 0, ['Stop distance is zero']);
    }

    let size = riskAmount / stopDistance;
    const cost = size * entryPrice;

    // 5. Leverage Constraints
    const maxLeverage = 2.0; 
    if (cost > accountBalance * maxLeverage) {
        size = (accountBalance * maxLeverage) / entryPrice;
        reasons.push(`Capped at ${maxLeverage}x Leverage`);
    }

    // 6. R:R Check
    const rewardDistance = Math.abs(takeProfitPrice - entryPrice);
    const rrRatio = rewardDistance / stopDistance;
    if (rrRatio < 1.0) { 
        isValid = false;
        reasons.push(`R:R ${rrRatio.toFixed(2)} < 1.0`);
    }

    // 7. Stop Logic Validation
    if ((action === 'BUY' && stopLossPrice >= entryPrice) || (action === 'SELL' && stopLossPrice <= entryPrice)) {
        isValid = false;
        reasons.push('Invalid Stop Loss Placement');
    }

    if (!isValid) return this.createInvalidResult(symbol, action, entryPrice, stopLossPrice, takeProfitPrice, riskAmount, reasons);

    return {
        symbol,
        action,
        size,
        entryPrice,
        stopLoss: stopLossPrice,
        takeProfit: takeProfitPrice,
        riskAmount,
        riskRewardRatio: rrRatio,
        isValid: true,
        reasons
    };
  }

  private createInvalidResult(symbol: string, action: 'BUY' | 'SELL', entry: number, stop: number, tp: number, risk: number, reasons: string[]): PositionResult {
      return {
          symbol, action, size: 0, entryPrice: entry, stopLoss: stop, takeProfit: tp, 
          riskAmount: risk, riskRewardRatio: 0, isValid: false, reasons
      };
  }
}
