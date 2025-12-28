import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import crypto from 'crypto';
import { env } from '../config/env';
import { logger } from '../utils/logger';

export class DeltaApiClient {
  private readonly axiosInstance: AxiosInstance;
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;
  private readonly apiSecret: string | undefined;

  constructor() {
    this.baseUrl = env.DELTA_API_URL;
    this.apiKey = env.DELTA_API_KEY;
    this.apiSecret = env.DELTA_API_SECRET;

    // Normalize base URL (remove /v2 suffix if present to allow flexible path appending)
    // Actually typically we want base to be host. 
    // Docs say: base_url = 'https://api.india.delta.exchange'
    // path = '/v2/orders'
    // So if env is .../v2, we should probably strip it or append carefully.
    // Let's rely on full paths or relative to host.
    
    // Safety check for /v2
    if (this.baseUrl.endsWith('/v2')) {
        this.baseUrl = this.baseUrl.slice(0, -3);
    }

    this.axiosInstance = axios.create({
      baseURL: this.baseUrl, // 'https://api.india.delta.exchange'
      timeout: 10000,
    });
    
    // Interceptor to log 4XX errors cleanly?
    // Using axios error handling in methods usually better for control.
  }

  public async get<T>(path: string, params: Record<string, any> = {}, auth: boolean = false): Promise<T> {
    return this.request<T>('GET', path, params, undefined, auth);
  }

  public async post<T>(path: string, data: any, auth: boolean = true): Promise<T> {
    return this.request<T>('POST', path, {}, data, auth);
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE', 
    path: string, 
    params: Record<string, any>, 
    data: any, 
    auth: boolean
  ): Promise<T> {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const headers: Record<string, string> = {
        'User-Agent': 'node-trading-bot', // Required by Delta to avoid 4XX
        'Content-Type': 'application/json'
    };

    if (auth) {
        if (!this.apiKey || !this.apiSecret) {
            throw new Error('Delta API Key/Secret not configured for authenticated request');
        }
        
        // Query String generation for signature
        // Sort keys? Docs don't explicitly say "sort" but typically standard. 
        // Docs example: query_string = '?product_id=1&state=open'
        // Let's assume standard order or matching what axios sends.
        // Axios `params` serialization might vary.
        // Safer to construct query string manually if using it in signature.
        
        let queryString = '';
        if (Object.keys(params).length > 0) {
            // Sort keys alphabetically to match likely server canonicalization
            const sortedKeys = Object.keys(params).sort();
            const parts = sortedKeys.map(k => `${k}=${params[k]}`);
            queryString = '?' + parts.join('&');
            // Axios will serialize normally. We need to ensure signature matches what is SENT.
            // If we pass `params` to axios, we rely on its serializer. 
            // Better to pass formatted query string in URL or ensure exact match.
            // We will attach query to URL for axios if we build it here.
        }

        const payloadString = data ? JSON.stringify(data) : '';
        // Signature: method + timestamp + path + query_string + payload
        // Path should include /v2 if it's there?
        // Method signature: get('/v2/products') -> path is '/v2/products'
        
        const signatureData = method + timestamp + path + queryString + payloadString;
        const signature = this.generateSignature(this.apiSecret, signatureData);

        headers['api-key'] = this.apiKey;
        headers['timestamp'] = timestamp;
        headers['signature'] = signature;
        
        // For axios, if we built queryString manually, we append to path or use params?
        // If we use params, axios builds query. 
        // Let's use `url: path + queryString` and empty params to ensure 1:1 match.
        path = path + queryString;
        params = {}; // Clear params since they are in path now
    }

    try {
        const config: AxiosRequestConfig = {
            method,
            url: path,
            headers,
            params, // Should be empty if auth=true to avoid double query
            data
        };
        
        const response = await this.axiosInstance.request<T>(config);
        
        if ((response.data as any).success === false) {
             throw new Error(`Delta API Error: ${JSON.stringify(response.data)}`);
        }
        
        return (response.data as any).result || response.data; // Return result or full data if standard
    } catch (error) {
        if (axios.isAxiosError(error) && error.response) {
            logger.error({ 
                status: error.response.status, 
                data: error.response.data, 
                url: error.config?.url 
            }, 'Delta API Request Failed');
        }
        throw error;
    }
  }

  private generateSignature(secret: string, message: string): string {
    return crypto
      .createHmac('sha256', secret)
      .update(message)
      .digest('hex');
  }
}
