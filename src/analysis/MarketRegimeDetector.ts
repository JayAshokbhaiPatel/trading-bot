import { OHLCV } from '../types/market';
import { calculateATR } from './indicators';

export type MarketRegime = 'TRENDING_UP' | 'TRENDING_DOWN' | 'RANGING' | 'CHOPPY';

export interface RegimeResult {
    regime: MarketRegime;
    adx: number;
    trendStrength: 'STRONG' | 'MODERATE' | 'WEAK' | 'NONE';
    allowTrendStrategy: boolean;
    allowReversalStrategy: boolean;
    description: string;
}

export class MarketRegimeDetector {
    
    /**
     * Detect market regime using ADX and price structure
     */
    public detect(candles: OHLCV[], period: number = 14): RegimeResult {
        if (candles.length < period * 2) {
            return this.createResult('CHOPPY', 0, 'NONE', 'Insufficient data');
        }

        const adx = this.calculateADX(candles, period);
        const trendDirection = this.detectTrendDirection(candles);
        
        // Classify regime based on ADX
        let regime: MarketRegime;
        let trendStrength: 'STRONG' | 'MODERATE' | 'WEAK' | 'NONE';
        let allowTrend: boolean;
        let allowReversal: boolean;
        let description: string;

        if (adx >= 40) {
            // Strong trend
            regime = trendDirection === 'UP' ? 'TRENDING_UP' : 'TRENDING_DOWN';
            trendStrength = 'STRONG';
            allowTrend = true;
            allowReversal = false;
            description = `Strong ${trendDirection} trend (ADX: ${adx.toFixed(1)})`;
        } else if (adx >= 25) {
            // Moderate trend
            regime = trendDirection === 'UP' ? 'TRENDING_UP' : 'TRENDING_DOWN';
            trendStrength = 'MODERATE';
            allowTrend = true;
            allowReversal = false;
            description = `Moderate ${trendDirection} trend (ADX: ${adx.toFixed(1)})`;
        } else if (adx >= 20) {
            // Weak trend / Transition
            regime = 'CHOPPY';
            trendStrength = 'WEAK';
            allowTrend = false;
            allowReversal = false;
            description = `Weak/Transitional market (ADX: ${adx.toFixed(1)})`;
        } else {
            // Ranging market
            regime = 'RANGING';
            trendStrength = 'NONE';
            allowTrend = false;
            allowReversal = true;
            description = `Ranging market (ADX: ${adx.toFixed(1)})`;
        }

        return this.createResult(regime, adx, trendStrength, description, allowTrend, allowReversal);
    }

    /**
     * Calculate ADX (Average Directional Index)
     */
    private calculateADX(candles: OHLCV[], period: number): number {
        if (candles.length < period * 2) return 0;

        const plusDM: number[] = [];
        const minusDM: number[] = [];
        const tr: number[] = [];

        // Calculate +DM, -DM, and TR
        for (let i = 1; i < candles.length; i++) {
            const high = candles[i].high;
            const low = candles[i].low;
            const prevHigh = candles[i - 1].high;
            const prevLow = candles[i - 1].low;
            const prevClose = candles[i - 1].close;

            // Directional Movement
            const upMove = high - prevHigh;
            const downMove = prevLow - low;

            plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
            minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);

            // True Range
            tr.push(Math.max(
                high - low,
                Math.abs(high - prevClose),
                Math.abs(low - prevClose)
            ));
        }

        // Smooth with Wilder's method
        const smoothPlusDM = this.wilderSmooth(plusDM, period);
        const smoothMinusDM = this.wilderSmooth(minusDM, period);
        const smoothTR = this.wilderSmooth(tr, period);

        // Calculate +DI and -DI
        const plusDI = (smoothPlusDM / smoothTR) * 100;
        const minusDI = (smoothMinusDM / smoothTR) * 100;

        // Calculate DX
        const dx = Math.abs(plusDI - minusDI) / (plusDI + minusDI) * 100;

        // ADX is smoothed DX (we'll return approximate current value)
        return dx;
    }

    /**
     * Wilder's smoothing method
     */
    private wilderSmooth(values: number[], period: number): number {
        if (values.length < period) return 0;
        
        let sum = values.slice(0, period).reduce((a, b) => a + b, 0);
        let smoothed = sum;

        for (let i = period; i < values.length; i++) {
            smoothed = smoothed - (smoothed / period) + values[i];
        }

        return smoothed / period;
    }

    /**
     * Detect trend direction using higher highs/lows
     */
    private detectTrendDirection(candles: OHLCV[]): 'UP' | 'DOWN' {
        const recent = candles.slice(-20);
        
        // Compare first half vs second half
        const firstHalf = recent.slice(0, 10);
        const secondHalf = recent.slice(10);

        const avgFirst = firstHalf.reduce((sum, c) => sum + c.close, 0) / firstHalf.length;
        const avgSecond = secondHalf.reduce((sum, c) => sum + c.close, 0) / secondHalf.length;

        return avgSecond > avgFirst ? 'UP' : 'DOWN';
    }

    private createResult(
        regime: MarketRegime,
        adx: number,
        trendStrength: 'STRONG' | 'MODERATE' | 'WEAK' | 'NONE',
        description: string,
        allowTrend: boolean = false,
        allowReversal: boolean = false
    ): RegimeResult {
        return {
            regime,
            adx,
            trendStrength,
            allowTrendStrategy: allowTrend,
            allowReversalStrategy: allowReversal,
            description
        };
    }
}
