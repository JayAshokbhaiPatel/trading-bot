export enum PatternType {
  DOJI = 'DOJI',
  HAMMER = 'HAMMER',
  INVERTED_HAMMER = 'INVERTED_HAMMER',
  BULLISH_ENGULFING = 'BULLISH_ENGULFING',
  BEARISH_ENGULFING = 'BEARISH_ENGULFING',
  MORNING_STAR = 'MORNING_STAR',
  EVENING_STAR = 'EVENING_STAR',
  SHOOTING_STAR = 'SHOOTING_STAR',
  MARUBOZU = 'MARUBOZU',
  PIERCING_LINE = 'PIERCING_LINE',
  DARK_CLOUD_COVER = 'DARK_CLOUD_COVER',
  HARAMI = 'HARAMI',
  THREE_WHITE_SOLDIERS = 'THREE_WHITE_SOLDIERS',
  THREE_BLACK_CROWS = 'THREE_BLACK_CROWS',
  BULLISH_KICKER = 'BULLISH_KICKER',
  BEARISH_KICKER = 'BEARISH_KICKER',
}

export interface PatternResult {
  type: PatternType;
  confidence: number;
  // Index of the last candle in the pattern relative to the input array
  lastCandleIndex: number;
}

export interface Zone {
  min: number;
  max: number;
  center: number;
  strength: number; // Number of touches
  type: 'SUPPORT' | 'RESISTANCE' | 'BOTH';
}

export interface BreakoutResult {
  zone: Zone;
  candleIndex: number;
  type: 'BULLISH_BREAKOUT' | 'BEARISH_BREAKOUT';
  confidence: number;
  isFakeout: boolean;
}

export interface VolumeAnalysisResult {
  currentVolume: number;
  avgVolume: number;
  volumeRatio: number;
  category: 'VERY_HIGH' | 'HIGH' | 'NORMAL' | 'LOW' | 'VERY_LOW';
  trend: 'INCREASING' | 'DECREASING' | 'NEUTRAL';
  isSpike: boolean; // Retained for compatibility
  spikeFactor: number; // Retained for compatibility
  divergence: 'BULLISH' | 'BEARISH' | 'NONE'; // Retained for compatibility
  obv: {
    obv: number;
    signal: 'BULLISH' | 'BEARISH';
    trend: 'INCREASING' | 'DECREASING';
  };
  ad: {
    ad: number;
    signal: 'ACCUMULATION' | 'DISTRIBUTION';
    trend: 'BULLISH' | 'BEARISH';
  };
  mfi: {
    mfi: number;
    signal: 'OVERBOUGHT' | 'OVERSOLD' | 'NEUTRAL';
    buyingPressure: 'STRONG' | 'WEAK';
  } | null;
  vwap: {
    vwap: number;
    priceVsVWAP: 'ABOVE' | 'BELOW';
    bandUpper: number;
    bandLower: number;
    signal: 'OVERBOUGHT' | 'OVERSOLD' | 'FAIR_VALUE';
  };
}
