import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });
const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().default(3000),
  DELTA_API_URL: z.string().url().default('https://api.india.delta.exchange'),
  DELTA_API_KEY: z.string().optional(),
  DELTA_API_SECRET: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
  ACCOUNT_BALANCE: z.coerce.number().default(300),
  RISK_PER_TRADE: z.coerce.number().default(1),
  MAX_RISK_PER_TRADE: z.coerce.number().default(3),
  MIN_RISK_PER_TRADE: z.coerce.number().default(0.25),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;
