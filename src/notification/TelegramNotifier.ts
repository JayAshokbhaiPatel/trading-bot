import axios from 'axios';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { TradeSignal } from '../types/trading';

export class TelegramNotifier {
  private readonly botToken: string | undefined;
  private readonly chatId: string | undefined;
  private readonly cooldowns: Map<string, number> = new Map();
  private readonly COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes

  constructor() {
    this.botToken = env.TELEGRAM_BOT_TOKEN;
    this.chatId = env.TELEGRAM_CHAT_ID;
  }

  public async sendAlert(signal: TradeSignal, symbol: string): Promise<boolean> {
    if (!this.botToken || !this.chatId) {
      logger.warn('Telegram credentials not configured. Skipping alert.');
      return false;
    }

    if (signal.action === 'NO_TRADE') return false;

    // Check Cooldown
    const now = Date.now();
    const lastSent = this.cooldowns.get(symbol);
    if (lastSent && now - lastSent < this.COOLDOWN_MS) {
        logger.info(`Skipping alert for ${symbol} due to cooldown.`);
        return false;
    }

    const message = this.formatMessage(signal, symbol);

    try {
      // In a real scenario, use axios.post to Telegram API
      // await axios.post(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
      //   chat_id: this.chatId,
      //   text: message,
      //   parse_mode: 'Markdown'
      // });
      
      // For now, we simulate success and log the message intended for Telegram
      logger.info({ telegramMessage: message }, '📧 Sending Telegram Alert (Simulated)');
      
      this.cooldowns.set(symbol, now);
      return true;
    } catch (error) {
      logger.error(error, 'Failed to send Telegram alert');
      return false;
    }
  }

  private formatMessage(signal: TradeSignal, symbol: string): string {
    const icon = signal.action === 'BUY' ? '🚀' : '🔻';
    const side = signal.action;
    
    return `
${icon} *${side} Signal: ${symbol}*
Price: \`${signal.price.toFixed(2)}\`
Confidence: *${signal.confidence}%*

*Reasons:*
${signal.reasoning.map(r => `• ${r}`).join('\n')}

_${new Date(signal.timestamp).toISOString()}_
    `.trim();
  }
}
