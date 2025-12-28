import { OHLCV } from '../types/market';
import { PatternResult, PatternType } from '../types/analysis';
import {
  isGreen,
  isRed,
  bodySize,
  upperShadow,
  lowerShadow,
  range,
  getMidpoint,
} from './geometry';

export class PatternDetector {
  public detect(candles: OHLCV[]): PatternResult[] {
    const results: PatternResult[] = [];
    if (candles.length < 3) return results;

    const current = candles[candles.length - 1];
    const prev = candles[candles.length - 2];
    const prev2 = candles[candles.length - 3];
    const index = candles.length - 1;

    // --- Single Candle Patterns ---

    // Doji
    if (this.isDoji(current)) {
      results.push({ type: PatternType.DOJI, confidence: 0.85, lastCandleIndex: index });
    }

    // Hammer
    if (this.isHammer(current)) {
      results.push({ type: PatternType.HAMMER, confidence: 0.75, lastCandleIndex: index });
    }

    // Inverted Hammer
    if (this.isInvertedHammer(current)) {
      results.push({ type: PatternType.INVERTED_HAMMER, confidence: 0.70, lastCandleIndex: index });
    }

    // Shooting Star
    if (this.isShootingStar(current)) {
        results.push({ type: PatternType.SHOOTING_STAR, confidence: 0.80, lastCandleIndex: index });
    }

    // Marubozu
    if (this.isMarubozu(current)) {
        results.push({ type: PatternType.MARUBOZU, confidence: 0.85, lastCandleIndex: index });
    }

    // --- Two Candle Patterns ---

    // Bullish Engulfing
    if (this.isBullishEngulfing(prev, current)) {
      results.push({ type: PatternType.BULLISH_ENGULFING, confidence: 0.82, lastCandleIndex: index });
    }

    // Bearish Engulfing
    if (this.isBearishEngulfing(prev, current)) {
      results.push({ type: PatternType.BEARISH_ENGULFING, confidence: 0.82, lastCandleIndex: index });
    }

    // Piercing Line
    if (this.isPiercingLine(prev, current)) {
        results.push({ type: PatternType.PIERCING_LINE, confidence: 0.75, lastCandleIndex: index });
    }

    // Dark Cloud Cover
    if (this.isDarkCloudCover(prev, current)) {
        results.push({ type: PatternType.DARK_CLOUD_COVER, confidence: 0.75, lastCandleIndex: index });
    }

    // Harami
    if (this.isHarami(prev, current)) {
        results.push({ type: PatternType.HARAMI, confidence: 0.65, lastCandleIndex: index });
    }

    // --- Three Candle Patterns ---
    
    // Morning Star
    if (this.isMorningStar(prev2, prev, current)) {
       results.push({ type: PatternType.MORNING_STAR, confidence: 0.85, lastCandleIndex: index });
    }

    // Evening Star
    if (this.isEveningStar(prev2, prev, current)) {
        results.push({ type: PatternType.EVENING_STAR, confidence: 0.85, lastCandleIndex: index });
    }

    // Three White Soldiers
    if (this.isThreeWhiteSoldiers(prev2, prev, current)) {
        results.push({ type: PatternType.THREE_WHITE_SOLDIERS, confidence: 0.80, lastCandleIndex: index });
    }

    // Three Black Crows
    if (this.isThreeBlackCrows(prev2, prev, current)) {
        results.push({ type: PatternType.THREE_BLACK_CROWS, confidence: 0.80, lastCandleIndex: index });
    }

    // Bullish Kicker
    if (this.isBullishKicker(prev, current)) {
        results.push({ type: PatternType.BULLISH_KICKER, confidence: 0.88, lastCandleIndex: index });
    }

    // Bearish Kicker
    if (this.isBearishKicker(prev, current)) {
        results.push({ type: PatternType.BEARISH_KICKER, confidence: 0.88, lastCandleIndex: index });
    }

    return results.sort((a, b) => b.confidence - a.confidence);
  }

  // --- Helpers ---

  private isDoji(c: OHLCV): boolean {
    const bodyPercent = bodySize(c) / range(c);
    const upperWickPercent = upperShadow(c) / range(c);
    const lowerWickPercent = lowerShadow(c) / range(c);
    return bodyPercent < 0.1 && upperWickPercent > 0.4 && lowerWickPercent > 0.4;
  }

  private isHammer(c: OHLCV): boolean {
    const bodyPercent = bodySize(c) / range(c);
    const lowerWickPercent = lowerShadow(c) / range(c);
    const upperWickPercent = upperShadow(c) / range(c);
    
    // Snippet: body < 0.4, lower > 0.6, upper < 0.1
    return bodyPercent < 0.4 && lowerWickPercent > 0.6 && upperWickPercent < 0.1;
  }

  private isInvertedHammer(c: OHLCV): boolean {
    const bodyPercent = bodySize(c) / range(c);
    const lowerWickPercent = lowerShadow(c) / range(c);
    const upperWickPercent = upperShadow(c) / range(c);
    return bodyPercent < 0.4 && upperWickPercent > 0.6 && lowerWickPercent < 0.1;
  }

  private isShootingStar(c: OHLCV): boolean {
      const bodyPercent = bodySize(c) / range(c);
      const upperWickPercent = upperShadow(c) / range(c);
      // Bearish (Red) Candle preferred for strong SS, but snippet says close < open
      return bodyPercent < 0.3 && upperWickPercent > 0.7 && isRed(c);
  }

  private isMarubozu(c: OHLCV): boolean {
      const upperWickPercent = upperShadow(c) / range(c);
      const lowerWickPercent = lowerShadow(c) / range(c);
      return upperWickPercent < 0.05 && lowerWickPercent < 0.05;
  }

  private isBullishEngulfing(prev: OHLCV, curr: OHLCV): boolean {
    return curr.close > prev.open && curr.open < prev.close;
  }

  private isBearishEngulfing(prev: OHLCV, curr: OHLCV): boolean {
    return curr.open > prev.close && curr.close < prev.open;
  }

  private isPiercingLine(prev: OHLCV, curr: OHLCV): boolean {
      return isRed(prev) && 
             isGreen(curr) && 
             curr.open < prev.close && 
             curr.close > getMidpoint(prev);
  }

  private isDarkCloudCover(prev: OHLCV, curr: OHLCV): boolean {
      return isGreen(prev) &&
             isRed(curr) &&
             curr.open > prev.close &&
             curr.close < getMidpoint(prev);
  }

  private isHarami(prev: OHLCV, curr: OHLCV): boolean {
      return curr.high < prev.high && curr.low > prev.low;
  }
  
  private isMorningStar(c1: OHLCV, c2: OHLCV, c3: OHLCV): boolean {
    return isRed(c1) && 
           // c2 small body? Snippet: c2.close > c2.open is not strictly required for morning star doji, but classic is small body.
           // Snippet code: c2.close > c2.open (Green) -- this is strict.
           // Actually snippet checks c2.close > c2.open. Standard Morning Star middle candle can be red or green.
           // Let's loosen to small body like previous impl if possible, but snippet was strict.
           // Staying faithful to snippet logic:
           // c1 red, c2 green + gap down?, c3 green + close > midpoint c1
           // Warning: Snippet says "c2.close > c2.open".
           // I will follow snippet logic.
           isRed(c1) &&
           isGreen(c2) &&
           isGreen(c3) &&
           c3.close > getMidpoint(c1);
  }

  private isEveningStar(c1: OHLCV, c2: OHLCV, c3: OHLCV): boolean {
      return isGreen(c1) &&
             isRed(c2) &&
             isRed(c3) &&
             c3.close < getMidpoint(c1);
  }

  private isThreeWhiteSoldiers(c1: OHLCV, c2: OHLCV, c3: OHLCV): boolean {
      return isGreen(c1) && isGreen(c2) && isGreen(c3) &&
             c2.close > c1.close && c3.close > c2.close;
  }

  private isThreeBlackCrows(c1: OHLCV, c2: OHLCV, c3: OHLCV): boolean {
      return isRed(c1) && isRed(c2) && isRed(c3) &&
             c2.close < c1.close && c3.close < c2.close;
  }

  private isBullishKicker(prev: OHLCV, curr: OHLCV): boolean {
      // Prev Red, Curr Green, Curr Open > Prev Open (Gap up)
      // Snippet: c1.close < c1.open && c2.close > c2.open && c2.open > c1.close
      // Note: "c2.open > c1.close". Prev close (Low) vs Curr Open (High).
      // Gap Up means Curr Low > Prev High usually.
      // But Kicker definition: Open of 2nd is above Open of 1st (for bullish).
      // Snippet says: c2.open > c1.close. Since c1 is red, c1.close is bottom.
      // So it just requires opening above the previous close? That's just a green candle.
      // Real Kicker is Open vs Open. 
      // I will trace snippet EXACTLY: `c1.close < c1.open && c2.close > c2.open && c2.open > c1.close`
      return isRed(prev) && isGreen(curr) && curr.open > prev.close; 
  }

  private isBearishKicker(prev: OHLCV, curr: OHLCV): boolean {
      // Snippet: c1.close > c1.open && c2.close < c2.open && c2.open < c1.close
      return isGreen(prev) && isRed(curr) && curr.open < prev.close;
  }
}
