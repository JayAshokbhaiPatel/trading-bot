export interface TradeSignal {
  action: 'BUY' | 'SELL' | 'NO_TRADE';
  confidence: number; // 0-1
  reasoning: string[];
  price: number;
  timestamp: number;
  stopLoss?: number;
  takeProfit1?: number;
  takeProfit2?: number;
  timeframe?: string;
}

export interface PositionResult {
  symbol: string;
  action: 'BUY' | 'SELL';
  size: number; // units
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  riskAmount: number;
  riskRewardRatio: number;
  isValid: boolean;
  reasons: string[];
}
