import { OHLCV } from '../types/market';

export const isGreen = (c: OHLCV): boolean => c.close > c.open;
export const isRed = (c: OHLCV): boolean => c.close < c.open;

export const bodySize = (c: OHLCV): number => Math.abs(c.close - c.open);
export const upperShadow = (c: OHLCV): number => c.high - Math.max(c.open, c.close);
export const lowerShadow = (c: OHLCV): number => Math.min(c.open, c.close) - c.low;
export const range = (c: OHLCV): number => c.high - c.low;

export const getMidpoint = (c: OHLCV): number => (c.open + c.close) / 2;
