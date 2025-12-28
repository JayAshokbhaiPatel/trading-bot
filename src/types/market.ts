export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

export interface OHLCV {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
