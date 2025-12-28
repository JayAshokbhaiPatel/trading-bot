import { OHLCV } from '../types/market';
import { PositionResult } from '../types/trading';
import { Portfolio } from './Portfolio';
import { BacktestConfig } from './types';

export class TradeSimulator {
  private config: BacktestConfig;
  private portfolio: Portfolio;

  constructor(config: BacktestConfig, portfolio: Portfolio) {
    this.config = config;
    this.portfolio = portfolio;
  }

  public processCandle(candle: OHLCV, symbol: string): void {
      // Check all open positions for this symbol
      // We iterate backwards to allow safe removal
      for (let i = this.portfolio.positions.length - 1; i >= 0; i--) {
          const pos = this.portfolio.positions[i];
          if (pos.symbol !== symbol) continue;

          this.checkExit(pos, candle);
      }
  }

  private checkExit(pos: PositionResult, candle: OHLCV): void {
      let exitPrice: number | null = null;
      let exitReason: 'TP' | 'SL' | 'MANUAL' | null = null;

      // Logic: Did price hit SL or TP in this candle?
      // Assumption: Low/High covers the range.
      // Order of precedence: In real market, impossible to know if High or Low happened first without lower timeframe data.
      // Conservative Approach: Assume SL hit first if both SL and TP are within candle range (worst case).
      
      const low = candle.low;
      const high = candle.high;

      // --- Trailing Stop Logic ---
      // Trigger: 2R Profit
      // Trailing Step: Keep SL at distance of 1R from High (BUY) / Low (SELL)
      const riskPerUnit = Math.abs(pos.entryPrice - pos.stopLoss); // Initial Risk (approx)
      // Note: If SL moved, riskPerUnit calculation changes if we use pos.stopLoss. 
      // We should ideally store outcome of initial risk. But simple heuristic:
      // If we don't have initial risk stored, assume current SL distance isn't reliable if moved.
      // But we can estimate R from Entry.
      // Let's assume Risk = Entry * 0.02 (approx) or derive from current price?
      // Better: assume we Trail if Price > Entry + 2 * (Entry - StartSL).
      // Since we overwrite pos.stopLoss, we lose StartSL.
      // Limitation: We don't have initial SL stored in PositionResult clearly (only current SL).
      // Workaround: Use Entry * 0.01 (1%) as generic R estimate or just trail based on price action.
      // OR: Don't overwrite pos.stopLoss? No, we must overwrite to execute it.
      // Let's rely on Price Movement.
      
      // Heuristic: If we are profitable > 2% (assuming 1% risk = 1R, so 2R = 2%), Trail.
      if (pos.action === 'BUY') {
          const profitPct = (high - pos.entryPrice) / pos.entryPrice;
          if (profitPct > 0.02) { // > 2% Profit (approx 2R)
               // New SL = High - 1% (Secure 1R and trail)
               const newSL = high * 0.99; 
               if (newSL > pos.stopLoss) {
                   pos.stopLoss = newSL; // Move SL UP
                   // Don't close yet, wait for Low check below
               }
          }
      } else {
          const profitPct = (pos.entryPrice - low) / pos.entryPrice;
          if (profitPct > 0.02) {
              const newSL = low * 1.01;
              if (newSL < pos.stopLoss) {
                  pos.stopLoss = newSL; // Move SL DOWN
              }
          }
      }

      if (pos.action === 'BUY') {
          // BUY: SL is below entry, TP is above.
          if (low <= pos.stopLoss) {
              exitPrice = pos.stopLoss; // Executed at Stop Price (subject to slippage)
              exitReason = 'SL';
          } else if (high >= pos.takeProfit) {
              exitPrice = pos.takeProfit;
              exitReason = 'TP';
          }
      } else {
          // SELL: SL is above entry, TP is below.
          if (high >= pos.stopLoss) {
              exitPrice = pos.stopLoss;
              exitReason = 'SL';
          } else if (low <= pos.takeProfit) {
              exitPrice = pos.takeProfit;
              exitReason = 'TP';
          }
      }

      if (exitPrice !== null && exitReason !== null) {
          this.executeExit(pos, exitPrice, exitReason, candle.timestamp);
      }
  }

  private executeExit(pos: PositionResult, price: number, reason: 'TP' | 'SL' | 'MANUAL', timestamp: number): void {
      // Apply Slippage
      // If BUY closed (Sell), Slippage lowers price.
      // If SELL closed (Buy), Slippage raises price.
      let finalPrice = price;
      const slippageAmount = price * this.config.slippage;

      if (pos.action === 'BUY') {
          // Selling to close
          finalPrice -= slippageAmount; 
      } else {
          // Buying to close
          finalPrice += slippageAmount;
      }

      // Calculate Fee
      // Fee based on total value = Size * Price
      const tradeValue = pos.size * finalPrice;
      const fee = tradeValue * this.config.commission;

      this.portfolio.closePosition(pos, finalPrice, timestamp, reason, fee);
  }
}
