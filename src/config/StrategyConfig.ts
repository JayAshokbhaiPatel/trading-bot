export interface StrategyConfig {
    // HTF Trend Requirements
    requireHTFAlignment: boolean;        // Require Daily AND 4H to align
    allowSingleHTFTrend: boolean;        // Accept Daily OR 4H trend
    
    // Fibonacci Zone Requirements
    strictFibZone: boolean;              // Only Premium/Discount (no Equilibrium)
    allowEquilibriumZone: boolean;       // Allow trading at 50% level
    
    // CLS Candle Requirements
    requireCLSCandle: boolean;           // Require CLS candle detection
    clsWickMinPercent: number;           // Minimum wick size for CLS
    
    // CIOD Requirements
    requireCIOD: boolean;                // Require Change in Orderflow
    ciodLookback: number;                // Candles to look for CIOD
    
    // Order Block Requirements
    requireOrderBlockRetest: boolean;    // Require price to retest OB
    orderBlockProximity: number;         // % proximity to OB for entry
    
    // Risk-Reward Requirements
    minRiskReward: number;               // Minimum R:R ratio
    
    // Signal Quality Tiers
    enableTieredSignals: boolean;        // Enable multi-tier signal quality
}

// Optimized configuration for better signal frequency
export const OPTIMIZED_CONFIG: StrategyConfig = {
    requireHTFAlignment: false,
    allowSingleHTFTrend: true,
    strictFibZone: false,
    allowEquilibriumZone: true,
    requireCLSCandle: false,
    clsWickMinPercent: 0.2,
    requireCIOD: false,
    ciodLookback: 10,
    requireOrderBlockRetest: true,
    orderBlockProximity: 2.0,
    minRiskReward: 1.5,
    enableTieredSignals: true
};

// Strict configuration (original behavior)
export const STRICT_CONFIG: StrategyConfig = {
    requireHTFAlignment: true,
    allowSingleHTFTrend: false,
    strictFibZone: true,
    allowEquilibriumZone: false,
    requireCLSCandle: true,
    clsWickMinPercent: 0.3,
    requireCIOD: true,
    ciodLookback: 5,
    requireOrderBlockRetest: true,
    orderBlockProximity: 1.0,
    minRiskReward: 2.0,
    enableTieredSignals: false
};

// Balanced configuration
export const BALANCED_CONFIG: StrategyConfig = {
    requireHTFAlignment: false,
    allowSingleHTFTrend: true,
    strictFibZone: false,
    allowEquilibriumZone: true,
    requireCLSCandle: false,
    clsWickMinPercent: 0.25,
    requireCIOD: false,
    ciodLookback: 7,
    requireOrderBlockRetest: true,
    orderBlockProximity: 1.5,
    minRiskReward: 1.8,
    enableTieredSignals: true
};

// Default export
export const DEFAULT_CONFIG = OPTIMIZED_CONFIG;
