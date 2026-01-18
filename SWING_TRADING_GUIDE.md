# Swing Trading Multi-Timeframe Scanner

## Overview

Converted the trading bot from **1-minute scalping** to **swing trading** with multiple higher timeframes.

## Changes Made

### Timeframes Configuration

The bot now scans three higher timeframes optimized for swing trading:

| Timeframe | Scan Interval | Candles | Purpose |
|-----------|--------------|---------|---------|
| **15-Minute** | Every 15 minutes | 200 | Short-term swing setups |
| **1-Hour** | Every 60 minutes | 200 | Medium-term trends |
| **4-Hour** | Every 4 hours | 150 | Long-term swing positions |

### Key Improvements

1. **Intelligent Scanning Schedule**
   - Each timeframe scans only when its interval has elapsed
   - 15m scans every 15 minutes
   - 1h scans every hour
   - 4h scans every 4 hours
   - Reduces API calls and focuses on meaningful price action

2. **Increased Candle History**
   - 150-200 candles per timeframe (vs. 100 on 1m)
   - Better pattern recognition for swing setups
   - More reliable trend identification

3. **Enhanced Signal Display**
   - Shows timeframe in signal output
   - Displays Risk/Reward ratio
   - Clearer formatting with separators
   - Labels as "SWING SIGNAL" for clarity

4. **Optimized for Swing Trading**
   - Larger targets suitable for swing positions
   - Less noise from small timeframe fluctuations
   - Better suited for holding positions hours/days

## Example Output

```
🚀 Crypto Swing Trading Bot - Multi-Timeframe Scanner Starting...
📈 Timeframes: 15-Minute, 1-Hour, 4-Hour
📊 Fetching top 20 coins by volume...
✅ Monitoring: ETHUSD, BTCUSD, SOLUSD, XRPUSD, ...

================================================================================
⏰ [1/18/2026, 5:00:00 PM] Scanning 15-Minute Timeframe
================================================================================

🎯 SWING SIGNAL [BTCUSD] | 15-Minute | Pin Bar Reversal
   Action: BUY @ 102500
   SL: 102000 | TP: 103500
   Risk/Reward: 2.00R
   Confidence: 85.0%

✅ 15-Minute scan complete. Next scan in 15 minutes.

================================================================================
⏰ [1/18/2026, 5:00:00 PM] Scanning 1-Hour Timeframe
================================================================================

🎯 SWING SIGNAL [ETHUSD] | 1-Hour | Trend Continuation Pattern
   Action: BUY @ 3300
   SL: 3250 | TP: 3450
   Risk/Reward: 3.00R
   Confidence: 80.0%

✅ 1-Hour scan complete. Next scan in 60 minutes.
```

## Benefits for Swing Trading

✅ **Larger Targets** - Higher timeframes = bigger price moves  
✅ **Less Noise** - Filters out small fluctuations  
✅ **Better R:R** - Swing setups typically offer 2-5R  
✅ **Time Efficient** - Not constantly monitoring 1-minute charts  
✅ **Lower Stress** - Fewer signals, higher quality  
✅ **API Friendly** - Fewer requests to Delta Exchange

## Configuration

You can adjust the timeframes in [`src/index.ts`](file:///d:/trading-bot/src/index.ts):

```typescript
const TIMEFRAMES = [
  { resolution: '15m', interval: 15 * 60 * 1000, candles: 200, name: '15-Minute' },
  { resolution: '1h', interval: 60 * 60 * 1000, candles: 200, name: '1-Hour' },
  { resolution: '4h', interval: 4 * 60 * 60 * 1000, candles: 150, name: '4-Hour' }
];
```

**Supported resolutions**: `1m`, `3m`, `5m`, `15m`, `30m`, `1h`, `2h`, `4h`, `6h`, `1d`, `1w`

## Running the Bot

```bash
npm run dev
```

The bot will:
1. Fetch top 20 coins by volume
2. Immediately scan all timeframes on startup
3. Then scan each timeframe at its designated interval
4. Display swing trading signals with R:R ratios
