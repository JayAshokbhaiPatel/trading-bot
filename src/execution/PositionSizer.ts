export interface PositionSizingConfig {
  accountBalance: number;
  riskPercentage: number; // 1% default
  maxRiskPercentage: number; // Max 3% per trade
  minRiskPercentage: number; // Min 0.25%
  maxDailyLoss: number; // Max 5% daily loss
  maxMonthlyLoss: number; // Max 15% monthly loss
  maxConsecutiveLosses: number;
  maxOpenPositions: number;
}

export interface TradeResult {
    timestamp: Date;
    entryPrice: number;
    exitPrice: number;
    quantity: number;
    profitLoss: number;
    tradeType: 'LONG' | 'SHORT';
    profitPercent: string;
}

export class PositionSizer {
  private config: PositionSizingConfig;
  private tradeHistory: TradeResult[] = [];
  
  // Tracking State
  private currentBalance: number;
  private dailyLoss: number = 0;
  private monthlyLoss: number = 0;
  private consecutiveLosses: number = 0;
  private openPositionsCount: number = 0;

  constructor(config: Partial<PositionSizingConfig> = {}) {
    this.config = {
      accountBalance: 25000,
      riskPercentage: 1,
      maxRiskPercentage: 3,
      minRiskPercentage: 0.25,
      maxDailyLoss: 5,
      maxMonthlyLoss: 15,
      maxConsecutiveLosses: 3,
      maxOpenPositions: 3,
      ...config
    };

    this.currentBalance = this.config.accountBalance;
  }

  public updateBalance(newBalance: number) {
      this.currentBalance = newBalance;
  }

  // ============================================
  // METHOD 1: FIXED PERCENTAGE RISK
  // ============================================
  public fixedPercentageRisk(entryPrice: number, stopLossPrice: number) {
    const riskAmount = this.currentBalance * (this.config.riskPercentage / 100);
    const riskPerPoint = Math.abs(entryPrice - stopLossPrice);
    const quantity = riskAmount / riskPerPoint;

    return {
      method: 'FIXED_PERCENTAGE',
      quantity: quantity.toFixed(4),
      riskAmount: riskAmount.toFixed(2),
      riskPercentage: this.config.riskPercentage,
      entryPrice: entryPrice.toFixed(2),
      stopLoss: stopLossPrice.toFixed(2),
      riskPerPoint: riskPerPoint.toFixed(2)
    };
  }

  // ============================================
  // METHOD 2: KELLY CRITERION
  // ============================================
  public kellyCriterion(winProbability: number, riskRewardRatio: number, useHalfKelly = true) {
    if (winProbability < 0 || winProbability > 1) return null;
    if (riskRewardRatio <= 0) return null;

    const p = winProbability;
    const q = 1 - winProbability;
    const b = riskRewardRatio;

    let kellyFraction = ((b * p) - q) / b;
    if (kellyFraction < 0) kellyFraction = 0;

    let finalFraction = useHalfKelly ? kellyFraction * 0.5 : kellyFraction;
    
    // Cap at max risk (e.g. 3%)
    finalFraction = Math.min(finalFraction, this.config.maxRiskPercentage / 100);

    const riskAmount = this.currentBalance * finalFraction;

    return {
      method: 'KELLY_CRITERION',
      kellyFraction: (kellyFraction * 100).toFixed(2) + '%',
      halfKellyFraction: (finalFraction * 100).toFixed(2) + '%',
      riskAmount: riskAmount.toFixed(2),
      riskPercentage: (finalFraction * 100).toFixed(2),
      quantity: '0', // Computed later
      winProbability: (p * 100).toFixed(2) + '%',
      lossProbability: (q * 100).toFixed(2) + '%',
      riskRewardRatio: riskRewardRatio.toFixed(2),
      note: 'Half-Kelly used for safety.' // + (kellyFraction * 100).toFixed(2) + '%'
    };
  }

  public kellyCriterionWithPrice(entryPrice: number, stopLossPrice: number, takeProfitPrice: number, winProbability: number, useHalfKelly = true) {
    const riskPerPoint = Math.abs(entryPrice - stopLossPrice);
    const rewardPerPoint = Math.abs(takeProfitPrice - entryPrice);
    const riskRewardRatio = rewardPerPoint / riskPerPoint;

    const kelly = this.kellyCriterion(winProbability, riskRewardRatio, useHalfKelly);
    if (!kelly) return null;

    const riskAmount = parseFloat(kelly.riskAmount);
    const quantity = riskAmount / riskPerPoint;

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

  // ============================================
  // METHOD 3: VOLATILITY-ADJUSTED SIZING
  // ============================================
  public volatilityAdjustedSizing(entryPrice: number, stopLossPrice: number, atr: number, averageAtr: number) {
     if (!atr || !averageAtr || averageAtr === 0) return null;

    const volatilityRatio = atr / averageAtr;
    let adjustedRiskPercent = this.config.riskPercentage / volatilityRatio;

    adjustedRiskPercent = Math.min(
      Math.max(adjustedRiskPercent, this.config.minRiskPercentage),
      this.config.maxRiskPercentage
    );

    const riskAmount = this.currentBalance * (adjustedRiskPercent / 100);
    const riskPerPoint = Math.abs(entryPrice - stopLossPrice);
    const quantity = riskAmount / riskPerPoint;

    return {
      method: 'VOLATILITY_ADJUSTED',
      quantity: quantity.toFixed(4),
      riskAmount: riskAmount.toFixed(2),
      adjustedRiskPercent: adjustedRiskPercent.toFixed(2),
      baseRiskPercent: this.config.riskPercentage,
      volatilityRatio: volatilityRatio.toFixed(2),
      atr: atr.toFixed(4),
      averageAtr: averageAtr.toFixed(4),
      interpretation: volatilityRatio > 1 ? 'HIGH VOLATILITY - REDUCED SIZE' : 'LOW VOLATILITY - INCREASED SIZE'
    };
  }

  // ============================================
  // METHOD 4: CONFIDENCE-GRADED SIZING
  // ============================================
  public confidenceGradedSizing(entryPrice: number, stopLossPrice: number, tradeGrade: string = 'B', confidenceScore: number = 0.5) {
    const gradeMultipliers: Record<string, number> = {
      'A+': 1.5, 'A': 1.25, 'B+': 1.0, 'B': 0.75, 'C': 0.5, 'D': 0.25
    };
    const multiplier = gradeMultipliers[tradeGrade] || 0.75;
    
    // Confidence score 0-1 affects multiplier (0.5 to 1.0 range boost/drag)
    // Snippet: effective = multiplier * (0.5 + score * 0.5)
    // if score=1 -> *1.0. if score=0 -> *0.5.
    const effectiveMultiplier = multiplier * (0.5 + (confidenceScore * 0.5));

    let adjustedRiskPercent = this.config.riskPercentage * effectiveMultiplier;
    adjustedRiskPercent = Math.min(
      Math.max(adjustedRiskPercent, this.config.minRiskPercentage),
      this.config.maxRiskPercentage
    );

    const riskAmount = this.currentBalance * (adjustedRiskPercent / 100);
    const riskPerPoint = Math.abs(entryPrice - stopLossPrice);
    const quantity = riskAmount / riskPerPoint;

    return {
      method: 'CONFIDENCE_GRADED',
      quantity: quantity.toFixed(4),
      riskAmount: riskAmount.toFixed(2),
      riskPercentage: adjustedRiskPercent.toFixed(2),
      baseRiskPercent: this.config.riskPercentage,
      tradeGrade,
      gradeMultiplier: multiplier.toFixed(2),
      confidenceScore: confidenceScore.toFixed(2),
      effectiveMultiplier: effectiveMultiplier.toFixed(2),
      recommendation: tradeGrade === 'D' ? 'SKIP THIS TRADE' : 'PROCEED'
    };
  }
  
  // ============================================
  // METHOD 6: MOMENTUM-BASED SIZING
  // ============================================
  public momentumBasedSizing(entryPrice: number, stopLossPrice: number, momentumScore: number = 0.5) {
      let multiplier = 1.0;
      if (momentumScore >= 0.9) multiplier = 1.5;
      else if (momentumScore >= 0.7) multiplier = 1.25;
      else if (momentumScore >= 0.5) multiplier = 1.0;
      else if (momentumScore >= 0.3) multiplier = 0.6;
      else multiplier = 0.3;

      let adjustedRiskPercent = this.config.riskPercentage * multiplier;
      adjustedRiskPercent = Math.min(Math.max(adjustedRiskPercent, this.config.minRiskPercentage), this.config.maxRiskPercentage);

      const riskAmount = this.currentBalance * (adjustedRiskPercent / 100);
      const riskPerPoint = Math.abs(entryPrice - stopLossPrice);
      const quantity = riskAmount / riskPerPoint;

      return {
          method: 'MOMENTUM_BASED',
          quantity: quantity.toFixed(4),
          riskAmount: riskAmount.toFixed(2),
          riskPercentage: adjustedRiskPercent.toFixed(2),
          momentumScore: momentumScore.toFixed(2),
          multiplier: multiplier.toFixed(2)
      };
  }

  // ============================================
  // RISK MANAGEMENT Checks
  // ============================================
  public canOpenPosition(riskAmount: number) {
      const checks = {
          belowMaxDailyLoss: this.dailyLoss + riskAmount <= (this.config.accountBalance * (this.config.maxDailyLoss / 100)),
          belowMaxMonthlyLoss: this.monthlyLoss + riskAmount <= (this.config.accountBalance * (this.config.maxMonthlyLoss / 100)),
          belowMaxOpenPositions: this.openPositionsCount < this.config.maxOpenPositions,
          notTooManyConsecutiveLosses: this.consecutiveLosses < this.config.maxConsecutiveLosses,
          sufficientCapital: riskAmount <= this.currentBalance * 0.05 // Max 5% hard cap
      };
      
      const canOpen = Object.values(checks).every(v => v);
      return { canOpen, checks, failureReasons: Object.keys(checks).filter(k => !(checks as any)[k]) };
  }

  public recordTrade(entryPrice: number, exitPrice: number, quantity: number, profitLoss: number, tradeType: 'LONG' | 'SHORT') {
      this.tradeHistory.push({
          timestamp: new Date(),
          entryPrice, exitPrice, quantity, profitLoss, tradeType,
          profitPercent: ((profitLoss / (entryPrice * quantity)) * 100).toFixed(2)
      });
      
      this.currentBalance += profitLoss;
      
      if (profitLoss < 0) {
          this.dailyLoss += Math.abs(profitLoss);
          this.monthlyLoss += Math.abs(profitLoss);
          this.consecutiveLosses++;
      } else {
          this.consecutiveLosses = 0;
      }
      this.openPositionsCount = Math.max(0, this.openPositionsCount - 1);
  }

  public incrementOpenPositions() {
      this.openPositionsCount++;
  }

  // ============================================
  // ADVANCED: COMBINED INTELLIGENT SIZING
  // ============================================
  public intelligentSizing(params: {
      entryPrice: number;
      stopLossPrice: number;
      takeProfitPrice?: number;
      atr?: number;
      averageAtr?: number;
      winProbability?: number;
      tradeGrade?: string;
      confidenceScore?: number;
      momentumScore?: number;
  }) {
      const { entryPrice, stopLossPrice, takeProfitPrice, atr, averageAtr, winProbability = 0.55, tradeGrade='B', confidenceScore=0.5, momentumScore=0.5 } = params;
      
      const fixed = this.fixedPercentageRisk(entryPrice, stopLossPrice);
      const kelly = takeProfitPrice ? this.kellyCriterionWithPrice(entryPrice, stopLossPrice, takeProfitPrice, winProbability) : null;
      const volatility = (atr && averageAtr) ? this.volatilityAdjustedSizing(entryPrice, stopLossPrice, atr, averageAtr) : null;
      const confidence = this.confidenceGradedSizing(entryPrice, stopLossPrice, tradeGrade, confidenceScore);
      const momentum = this.momentumBasedSizing(entryPrice, stopLossPrice, momentumScore);

      const quantities = [
          parseFloat(fixed.quantity),
          kelly ? parseFloat(kelly.quantity) : parseFloat(fixed.quantity),
          volatility ? parseFloat(volatility.quantity) : parseFloat(fixed.quantity),
          parseFloat(confidence.quantity),
          parseFloat(momentum.quantity)
      ];

      // Weighted Average logic from snippet
      // Fixed 0.2, Kelly 0.25, Vol 0.2, Conf 0.2, Mom 0.15
      const weightedQty = (
        quantities[0] * 0.2 +
        quantities[1] * 0.25 +
        quantities[2] * 0.2 +
        quantities[3] * 0.2 +
        quantities[4] * 0.15
      );

      const riskAmount = parseFloat(confidence.riskAmount); // Use confidence based risk for check? 
      // User snippet uses "confidenceSizing.riskAmount" for risk check.
      const canOpen = this.canOpenPosition(riskAmount);

      return {
          recommendation: {
              quantity: weightedQty.toFixed(4),
              riskAmount: riskAmount.toFixed(2),
              entryPrice, stopLoss: stopLossPrice
          },
          riskCheck: canOpen,
          methodComparison: {
              fixed: fixed.quantity,
              kelly: kelly?.quantity || 'N/A',
              volatility: volatility?.quantity || 'N/A',
              confidence: confidence.quantity,
              momentum: momentum.quantity
          }
      };
  }
}
