import { PositionResult } from '../types/trading';
import { CompletedTrade } from './types';

export class Portfolio {
  private balance: number;
  private initialBalance: number;
  private equity: number;
  public positions: PositionResult[] = [];
  public tradeHistory: CompletedTrade[] = [];
  public equityCurve: { timestamp: number; equity: number }[] = [];

  constructor(initialBalance: number) {
    this.initialBalance = initialBalance;
    this.balance = initialBalance;
    this.equity = initialBalance;
  }

  public getBalance(): number {
    return this.balance;
  }

  public getEquity(): number {
    return this.equity;
  }

  public addPosition(position: PositionResult): void {
      this.positions.push(position);
  }

  public closePosition(
      position: PositionResult, 
      exitPrice: number, 
      exitTime: number, 
      reason: 'TP' | 'SL' | 'MANUAL',
      fee: number
  ): CompletedTrade {
      // Calculate Profit
      const priceDiff = position.action === 'BUY' 
          ? exitPrice - position.entryPrice 
          : position.entryPrice - exitPrice;
      
      const grossProfit = priceDiff * position.size;
      const netProfit = grossProfit - fee;

      // Update Balance
      this.balance += netProfit; // Balance reflects realized PnL only?
      // Actually usually Balance = Cash. 
      // When opening, we don't deduct cost unless checking margin. 
      // But for simplicity: Balance is Cash + Realized PnL. 
      // Equity is Balance + Unrealized PnL.
      // So on close, we add realized PnL to balance.

      const trade: CompletedTrade = {
          symbol: position.symbol,
          side: position.action,
          entryPrice: position.entryPrice,
          exitPrice: exitPrice,
          entryTime: 0, // Need to track entry time in PositionResult usually, assume 0 for now or update PositionResult
          exitTime: exitTime,
          size: position.size,
          grossProfit,
          netProfit,
          fee,
          exitReason: reason,
          holdDuration: 0 // Update if timestamp tracked
      };

      this.tradeHistory.push(trade);
      
      // Remove from active positions
      this.positions = this.positions.filter(p => p !== position);

      return trade;
  }

  public updateEquity(currentPrices: Map<string, number>, timestamp: number): void {
      let unrealizedPnL = 0;
      
      for (const pos of this.positions) {
          const currentPrice = currentPrices.get(pos.symbol);
          if (currentPrice) {
              const diff = pos.action === 'BUY' 
                  ? currentPrice - pos.entryPrice 
                  : pos.entryPrice - currentPrice;
              unrealizedPnL += diff * pos.size;
          }
      }

      this.equity = this.balance + unrealizedPnL;
      this.equityCurve.push({ timestamp, equity: this.equity });
  }
}
