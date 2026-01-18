export interface Candle {
  timestamp: string | number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type Action = 'BUY' | 'SELL' | 'WAIT';
export type Direction = 'LONG' | 'SHORT';
export type ExitType = 'STOP_LOSS' | 'TAKE_PROFIT' | 'TIME_EXIT' | 'END_OF_DATA' | 'TRAILING_STOP';

export interface Signal {
  action: Action;
  price: number;
  stopLoss: number;
  takeProfit: number;
  confidence: number;
  pattern?: string;
  setup?: string;
  atKeyLevel?: boolean;
}

export interface Position {
  id: string;
  entryTime: string | number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  shares: number;
  direction: Direction;
  strategy: string;
  setup: string;
  riskAmount: number;
  riskPercent: number;
  initialCapital: number;
  psychology?: {
    emotionalState: string;
    confidence: number;
    setupQuality: number;
  };
}

export interface AccountState {
  initialCapital: number;
  capital: number;
  equity: number;
  todayPNL: number;
  weeklyPNL: number;
  tradesToday: number;
  winningStreak: number;
  losingStreak: number;
  maxEquity: number;
  maxDrawdown: number;
}

export interface Trade {
  id: string;
  entryTime: string | number;
  entryPrice: number;
  exitTime: string | number;
  exitPrice: number;
  exitType: ExitType;
  direction: Direction;
  shares: number;
  pnl: number;
  pnlPercent: number;
  riskAmount: number;
  riskReward: number;
  duration: string;
  strategy: string;
  setup: string;
}

export interface StrategyConfig {
  [key: string]: any;
}
