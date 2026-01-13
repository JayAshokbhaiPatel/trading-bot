
export interface PositionSizerConfig {
  accountBalance: number;
  riskPercentage?: number;
  maxRiskPercentage?: number;
  minRiskPercentage?: number;
  maxDailyLoss?: number;
  maxMonthlyLoss?: number;
  maxConsecutiveLosses?: number;
  maxOpenPositions?: number;
  maxLeverage?: number; // New: Maximum leverage cap (e.g. 5 or 10)
}

export class PositionSizer {
  private accountBalance: number;
  private baseRiskPercentage: number;
  private maxRiskPercentage: number;
  private minRiskPercentage: number;
  
  private tradeHistory: any[] = [];
  
  private maxDailyLoss: number;
  private maxMonthlyLoss: number;
  private maxConsecutiveLosses: number;
  private maxOpenPositions: number;
  
  private currentBalance: number;
  private dailyLoss: number = 0;
  private monthlyLoss: number = 0;
  private consecutiveLosses: number = 0;
  private openPositionsCount: number = 0;
  private maxLeverage: number;

  constructor(config: PositionSizerConfig) {
    this.accountBalance = config.accountBalance || 300;
    this.baseRiskPercentage = config.riskPercentage || 1; // 1% default
    this.maxRiskPercentage = config.maxRiskPercentage || 3; // Max 3% per trade
    this.minRiskPercentage = config.minRiskPercentage || 0.25; // Min 0.25%
    
    this.maxDailyLoss = config.maxDailyLoss || 5; // Max 5% daily loss
    this.maxMonthlyLoss = config.maxMonthlyLoss || 15; // Max 15% monthly loss
    this.maxConsecutiveLosses = config.maxConsecutiveLosses || 3;
    this.maxOpenPositions = config.maxOpenPositions || 3;
    this.maxLeverage = config.maxLeverage || 10; // Default 10x leverage cap
    
    this.currentBalance = this.accountBalance;
  }

  public fixedPercentageRisk(entryPrice: number, stopLossPrice: number) {
    const riskAmount = this.currentBalance * (this.baseRiskPercentage / 100);
    const riskPerPoint = Math.abs(entryPrice - stopLossPrice);
    const quantity = riskPerPoint === 0 ? 0 : riskAmount / riskPerPoint;

    return {
      method: 'FIXED_PERCENTAGE',
      quantity: quantity.toFixed(4),
      riskAmount: riskAmount.toFixed(2),
      riskPercentage: this.baseRiskPercentage,
      entryPrice: entryPrice.toFixed(2),
      stopLoss: stopLossPrice.toFixed(2),
      riskPerPoint: riskPerPoint.toFixed(2)
    };
  }

  public kellyCriterion(winProbability: number, riskRewardRatio: number, useHalfKelly = true) {
    const p = winProbability;
    const q = 1 - winProbability;
    const b = riskRewardRatio;
    let kellyFraction = ((b * p) - q) / b;
    if (kellyFraction < 0) kellyFraction = 0;

    let finalFraction = useHalfKelly ? kellyFraction * 0.5 : kellyFraction;
    finalFraction = Math.min(finalFraction, this.maxRiskPercentage / 100);
    const riskAmount = this.currentBalance * finalFraction;

    return {
      method: 'KELLY_CRITERION',
      kellyFraction: (kellyFraction * 100).toFixed(2) + '%',
      halfKellyFraction: (finalFraction * 100).toFixed(2) + '%',
      riskAmount: riskAmount.toFixed(2),
      riskPercentage: (finalFraction * 100).toFixed(2),
      winProbability: (p * 100).toFixed(2) + '%',
      lossProbability: (q * 100).toFixed(2) + '%',
      riskRewardRatio: riskRewardRatio.toFixed(2)
    };
  }

  public kellyCriterionWithPrice(entryPrice: number, stopLossPrice: number, takeProfitPrice: number, winProbability: number, useHalfKelly = true) {
    const riskPerPoint = Math.abs(entryPrice - stopLossPrice);
    const rewardPerPoint = Math.abs(takeProfitPrice - entryPrice);
    const riskRewardRatio = riskPerPoint === 0 ? 0 : rewardPerPoint / riskPerPoint;
    const kelly = this.kellyCriterion(winProbability, riskRewardRatio, useHalfKelly);
    
    const riskAmount = parseFloat(kelly.riskAmount);
    const quantity = riskPerPoint === 0 ? 0 : riskAmount / riskPerPoint;

    return {
      ...kelly,
      quantity: quantity.toFixed(4),
      entryPrice: entryPrice.toFixed(2),
      stopLoss: stopLossPrice.toFixed(2),
      takeProfit: takeProfitPrice.toFixed(2),
      riskPerPoint: riskPerPoint.toFixed(2),
      rewardPerPoint: rewardPerPoint.toFixed(2)
    };
  }

  public volatilityAdjustedSizing(entryPrice: number, stopLossPrice: number, atr: number, averageAtr: number) {
    const volatilityRatio = averageAtr === 0 ? 1 : atr / averageAtr;
    let adjustedRiskPercent = this.baseRiskPercentage / volatilityRatio;
    adjustedRiskPercent = Math.min(Math.max(adjustedRiskPercent, this.minRiskPercentage), this.maxRiskPercentage);
    const riskAmount = this.currentBalance * (adjustedRiskPercent / 100);
    const riskPerPoint = Math.abs(entryPrice - stopLossPrice);
    const quantity = riskPerPoint === 0 ? 0 : riskAmount / riskPerPoint;
    return {
      method: 'VOLATILITY_ADJUSTED',
      quantity: quantity.toFixed(4),
      riskAmount: riskAmount.toFixed(2),
      adjustedRiskPercent: adjustedRiskPercent.toFixed(2),
      baseRiskPercent: this.baseRiskPercentage,
      volatilityRatio: volatilityRatio.toFixed(2),
      atr: atr.toFixed(4),
      averageAtr: averageAtr.toFixed(4)
    };
  }

  public confidenceGradedSizing(entryPrice: number, stopLossPrice: number, tradeGrade: string = 'B', confidenceScore: number = 0.5) {
    const gradeMultipliers: any = { 'A+': 1.5, 'A': 1.25, 'B+': 1.0, 'B': 0.75, 'C': 0.5, 'D': 0.25 };
    const multiplier = gradeMultipliers[tradeGrade] || 0.75;
    const effectiveMultiplier = multiplier * (0.5 + (confidenceScore * 0.5)); 
    const adjustedRiskPercent = this.baseRiskPercentage * effectiveMultiplier;
    const cappedRiskPercent = Math.min(Math.max(adjustedRiskPercent, this.minRiskPercentage), this.maxRiskPercentage);
    const riskAmount = this.currentBalance * (cappedRiskPercent / 100);
    const riskPerPoint = Math.abs(entryPrice - stopLossPrice);
    const quantity = riskPerPoint === 0 ? 0 : riskAmount / riskPerPoint;
    return {
      method: 'CONFIDENCE_GRADED',
      quantity: quantity.toFixed(4),
      riskAmount: riskAmount.toFixed(2),
      riskPercentage: cappedRiskPercent.toFixed(2),
      baseRiskPercent: this.baseRiskPercentage,
      tradeGrade,
      gradeMultiplier: multiplier.toFixed(2),
      confidenceScore: confidenceScore.toFixed(2),
      effectiveMultiplier: effectiveMultiplier.toFixed(2)
    };
  }

  public momentumBasedSizing(entryPrice: number, stopLossPrice: number, momentumScore: number = 0.5) {
    let multiplier = 1.0;
    if (momentumScore >= 0.9) multiplier = 1.5;
    else if (momentumScore >= 0.7) multiplier = 1.25;
    else if (momentumScore >= 0.5) multiplier = 1.0;
    else if (momentumScore >= 0.3) multiplier = 0.6;
    else multiplier = 0.3;

    const adjustedRiskPercent = this.baseRiskPercentage * multiplier;
    const cappedRiskPercent = Math.min(Math.max(adjustedRiskPercent, this.minRiskPercentage), this.maxRiskPercentage);
    const riskAmount = this.currentBalance * (cappedRiskPercent / 100);
    const riskPerPoint = Math.abs(entryPrice - stopLossPrice);
    const quantity = riskPerPoint === 0 ? 0 : riskAmount / riskPerPoint;
    return {
      method: 'MOMENTUM_BASED',
      quantity: quantity.toFixed(4),
      riskAmount: riskAmount.toFixed(2),
      riskPercentage: cappedRiskPercent.toFixed(2),
      momentumScore: momentumScore.toFixed(2),
      multiplier: multiplier.toFixed(2)
    };
  }

  public canOpenPosition(riskAmount: number) {
    const checks = {
      belowMaxDailyLoss: this.dailyLoss + riskAmount <= (this.accountBalance * (this.maxDailyLoss / 100)),
      belowMaxMonthlyLoss: this.monthlyLoss + riskAmount <= (this.accountBalance * (this.maxMonthlyLoss / 100)),
      belowMaxOpenPositions: this.openPositionsCount < this.maxOpenPositions,
      notTooManyConsecutiveLosses: this.consecutiveLosses < this.maxConsecutiveLosses,
      sufficientCapital: riskAmount <= this.currentBalance * 0.05 
    };
    const canOpen = Object.values(checks).every(v => v);
    return {
      canOpen,
      checks,
      failureReasons: Object.entries(checks).filter(([_, passed]) => !passed).map(([rule]) => rule)
    };
  }

  public intelligentSizing(params: any) {
    const { entryPrice, stopLossPrice, takeProfitPrice, atr, averageAtr, winProbability = 0.55, tradeGrade = 'B', confidenceScore = 0.5, momentumScore = 0.5 } = params;
    if (!entryPrice || !stopLossPrice) return { error: 'Entry and stop loss prices are required' };

    const fixed = this.fixedPercentageRisk(entryPrice, stopLossPrice);
    const kelly = takeProfitPrice ? this.kellyCriterionWithPrice(entryPrice, stopLossPrice, takeProfitPrice, winProbability) : null;
    const vol = (atr && averageAtr) ? this.volatilityAdjustedSizing(entryPrice, stopLossPrice, atr, averageAtr) : null;
    const conf = this.confidenceGradedSizing(entryPrice, stopLossPrice, tradeGrade, confidenceScore);
    const mom = this.momentumBasedSizing(entryPrice, stopLossPrice, momentumScore);
    const weightedQuantity = (
      parseFloat(fixed.quantity) * 0.2 +
      (kelly ? parseFloat(kelly.quantity) : parseFloat(fixed.quantity)) * 0.2 +
      (vol ? parseFloat(vol.quantity) : parseFloat(fixed.quantity)) * 0.15 +
      parseFloat(conf.quantity) * 0.3 +
      parseFloat(mom.quantity) * 0.15
    );

    const riskAmount = parseFloat(conf.riskAmount);
    
    // Leverage Cap Enforcement
    const maxQuantity = (this.currentBalance * this.maxLeverage) / entryPrice;
    const finalQuantity = Math.min(Math.max(0, weightedQuantity), maxQuantity);
    const isLeverageCapped = weightedQuantity > maxQuantity;

    const canOpen = this.canOpenPosition(riskAmount);
    const riskPerPoint = Math.abs(entryPrice - stopLossPrice);
    const rewardPerPoint = takeProfitPrice ? Math.abs(takeProfitPrice - entryPrice) : riskPerPoint;

    return {
      recommendation: {
        quantity: finalQuantity.toFixed(4),
        isLeverageCapped,
        maxAllowedQuantity: maxQuantity.toFixed(4),
        entryPrice: entryPrice.toFixed(2),
        stopLoss: stopLossPrice.toFixed(2),
        takeProfit: takeProfitPrice ? takeProfitPrice.toFixed(2) : 'Not specified',
        riskAmount: riskAmount.toFixed(2),
        potentialProfit: (finalQuantity * rewardPerPoint).toFixed(2),
        potentialLoss: (finalQuantity * riskPerPoint).toFixed(2),
        riskRewardRatio: riskPerPoint === 0 ? 0 : (rewardPerPoint / riskPerPoint).toFixed(2)
      },
      riskCheck: canOpen
    };
  }

  // ============== NEW METHODS ==============

  public recordTrade(entryPrice: number, exitPrice: number, quantity: number, profitLoss: number, tradeType = 'LONG') {
    const trade = {
      timestamp: new Date(),
      entryPrice,
      exitPrice,
      quantity,
      profitLoss,
      tradeType,
      profitPercent: ((profitLoss / (entryPrice * quantity)) * 100).toFixed(2)
    };

    this.tradeHistory.push(trade);
    this.currentBalance += profitLoss;

    if (profitLoss < 0) {
      this.dailyLoss += Math.abs(profitLoss);
      this.monthlyLoss += Math.abs(profitLoss);
      this.consecutiveLosses++;
    } else {
      this.consecutiveLosses = 0;
    }
    this.openPositionsCount = Math.max(0, this.openPositionsCount - 1); // Decrement
    
    return {
      newBalance: this.currentBalance.toFixed(2),
      profitLoss: profitLoss.toFixed(2),
      balanceChange: ((profitLoss / this.accountBalance) * 100).toFixed(2) + '%',
      consecutiveLosses: this.consecutiveLosses
    };
  }

  public incrementOpenPositions() {
      this.openPositionsCount++;
  }

  public resetDailyMetrics() {
    this.dailyLoss = 0;
  }

  public resetMonthlyMetrics() {
    this.monthlyLoss = 0;
  }

  public getAccountStats() {
    const winningTrades = this.tradeHistory.filter(t => t.profitLoss > 0);
    const losingTrades = this.tradeHistory.filter(t => t.profitLoss < 0);
    const totalProfit = this.tradeHistory.reduce((sum, t) => sum + t.profitLoss, 0);
    const winRate = winningTrades.length / (this.tradeHistory.length || 1);

    return {
      initialBalance: this.accountBalance.toFixed(2),
      currentBalance: this.currentBalance.toFixed(2),
      totalProfit: totalProfit.toFixed(2),
      profitPercent: ((totalProfit / this.accountBalance) * 100).toFixed(2),
      trades: {
        total: this.tradeHistory.length,
        winning: winningTrades.length,
        losing: losingTrades.length,
        winRate: (winRate * 100).toFixed(2) + '%'
      },
      riskMetrics: {
        consecutiveLosses: this.consecutiveLosses,
        maxConsecutiveLosses: this.maxConsecutiveLosses,
        dailyLoss: this.dailyLoss.toFixed(2),
        monthlyLoss: this.monthlyLoss.toFixed(2),
        openPositions: this.openPositionsCount
      }
    };
  }
}
