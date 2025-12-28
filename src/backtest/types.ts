import { PositionResult } from '../types/trading';

export interface BacktestConfig {
  initialCapital: number;
  riskPerTrade: number; // Percentage (e.g. 2 for 2%)
  commission: number; // e.g. 0.001 for 0.1%
  slippage: number; // e.g. 0.0005 for 0.05%
}

export interface CompletedTrade {
  symbol: string;
  side: 'BUY' | 'SELL';
  entryPrice: number;
  exitPrice: number;
  entryTime: number;
  exitTime: number;
  size: number;
  grossProfit: number;
  netProfit: number; // After fees
  fee: number;
  exitReason: 'TP' | 'SL' | 'MANUAL';
  holdDuration: number;
}

export interface BacktestMetrics {
  totalTrades: number;
  winRate: number; // 0-1
  profitFactor: number;
  maxDrawdown: number; // 0-1
  sharpeRatio: number;
  expectancy: number; // Average return per trade
  grossProfit: number;
  grossLoss: number;
  totalFees: number;
  finalBalance: number;
  returnPercentage: number;
}

export interface BacktestResult {
  metrics: BacktestMetrics;
  trades: CompletedTrade[];
  equityCurve: { timestamp: number; equity: number }[];
}
