# Delta Exchange API Authentication Guide

## Overview

Delta Exchange uses **HMAC-SHA256** signature-based authentication for all API requests. This document explains how the authentication works based on the official Delta Exchange Node.js client.

## Authentication Flow

### 1. **Signature Components**

Every authenticated request requires three headers:
- `api-key`: Your API key from Delta Exchange
- `signature`: HMAC-SHA256 signature of the request
- `timestamp`: Current Unix timestamp in **seconds** (not milliseconds)

### 2. **Signature Generation**

The signature is created by:

```typescript
const message = METHOD + timestamp + path + body;
const signature = crypto.createHmac('sha256', apiSecret).update(message).digest('hex');
```

**Where:**
- `METHOD`: HTTP method in uppercase (GET, POST, PUT, DELETE)
- `timestamp`: Unix timestamp in seconds (e.g., `1737196320`)
- `path`: Full URL path including query parameters (e.g., `/v2/history/candles?symbol=BTCUSD&resolution=1m`)
- `body`: Request body as JSON string, or empty string `""` if no body

### 3. **Example Signature Calculation**

**Request:**
```
GET /v2/history/candles?symbol=BTCUSD&resolution=1m&limit=100
```

**Signature Payload:**
```
GET1737196320/v2/history/candles?symbol=BTCUSD&resolution=1m&limit=100
```

**Code:**
```typescript
const timestamp = 1737196320;
const method = 'GET';
const path = '/v2/history/candles?symbol=BTCUSD&resolution=1m&limit=100';
const body = '';

const payload = method + timestamp + path + body;
// Result: "GET1737196320/v2/history/candles?symbol=BTCUSD&resolution=1m&limit=100"

const signature = crypto.createHmac('sha256', apiSecret).update(payload).digest('hex');
```

## Implementation in DeltaExchangeService

### Key Method: `signedRequest()`

```typescript
private async signedRequest(method: Method, path: string, params: any = {}, body: any = null) {
  // 1. Generate timestamp in SECONDS
  const timestamp = Math.floor(Date.now() / 1000);
  
  // 2. Build query string from params
  const queryString = Object.keys(params).length > 0 
      ? '?' + new URLSearchParams(params).toString() 
      : '';
  
  // 3. Get full path (including /v2 prefix if needed)
  const fullPath = this.getPathOnly(path) + queryString;
  
  // 4. Prepare body (empty string if no body)
  const bodyData = !body || Object.keys(body).length === 0 
      ? '' 
      : JSON.stringify(body);
  
  // 5. Build signature payload
  const signaturePayload = method.toUpperCase() + timestamp + fullPath + bodyData;
  
  // 6. Generate HMAC-SHA256 signature
  const signature = crypto.createHmac('sha256', this.apiSecret)
                          .update(signaturePayload)
                          .digest('hex');

  // 7. Set headers
  const headers = {
    'api-key': this.apiKey,
    'signature': signature,
    'timestamp': timestamp.toString(),
    'Content-Type': 'application/json'
  };

  // 8. Make request
  const url = `${this.baseUrl}${path}${queryString}`;
  const response = await axios({ method, url, data: body, headers });
  
  return response.data.result;
}
```

## Common Pitfalls & Fixes

### ❌ **Mistake 1: Using Signed Requests for Public Endpoints**
```typescript
// WRONG - Public endpoints don't need authentication
const tickers = await this.signedRequest('GET', '/v2/tickers');

// CORRECT - Use unsigned requests for public data
const tickers = await this.publicRequest('GET', '/v2/tickers');
```

**Public endpoints that DON'T require authentication:**
- `/v2/tickers` - Get all tickers
- `/v2/products` - Get all products
- `/v2/history/candles` - Get historical candles
- `/v2/l2orderbook` - Get orderbook
- `/v2/trades` - Get public trades

**Private endpoints that REQUIRE authentication:**
- `/v2/orders` - Place, edit, cancel orders
- `/v2/positions` - Get positions
- `/v2/wallet` - Get wallet balance
- `/v2/fills` - Get trade history

### ❌ **Mistake 2: Timestamp in Milliseconds**
```typescript
// WRONG
const timestamp = Date.now(); // 1737196320123

// CORRECT
const timestamp = Math.floor(Date.now() / 1000); // 1737196320
```

### ❌ **Mistake 3: Query Params Not in Signature Path**
```typescript
// WRONG
const payload = method + timestamp + path + queryParams + body;

// CORRECT
const payload = method + timestamp + (path + queryParams) + body;
```

### ❌ **Mistake 4: Body as `null` instead of Empty String**
```typescript
// WRONG
const body = null;
const payload = method + timestamp + path + body; // "GET1737196320/v2/tickersnull"

// CORRECT
const body = '';
const payload = method + timestamp + path + body; // "GET1737196320/v2/tickers"
```

### ❌ **Mistake 5: Method Not Uppercase**
```typescript
// WRONG
const payload = 'get' + timestamp + path + body;

// CORRECT
const payload = 'GET' + timestamp + path + body;
```

## Testing Your Authentication

### 1. **Check Debug Logs**

The service writes to `delta_debug.log`:

```
[1737196320] Method: GET
[1737196320] Path: /v2/history/candles?symbol=BTCUSD&resolution=1m&limit=100
[1737196320] Body: 
[1737196320] Payload: GET1737196320/v2/history/candles?symbol=BTCUSD&resolution=1m&limit=100
[1737196320] Signature: a1b2c3d4e5f6...
```

### 2. **Common Error Responses**

| Error | Cause | Solution |
|-------|-------|----------|
| `401 Unauthorized` | Invalid API key or signature | Check API credentials in `.env` |
| `403 Forbidden` | Timestamp too old/new | Ensure system time is accurate |
| `400 Bad Request` | Malformed signature payload | Verify payload construction |

## Environment Variables

Ensure these are set in your `.env`:

```env
DELTA_API_URL=https://api.delta.exchange/v2
DELTA_API_KEY=your_api_key_here
DELTA_API_SECRET=your_api_secret_here
```

## Reference

- **Official Delta Exchange Node Client**: [GitHub Repository](https://github.com/delta-exchange/node-client)
- **Authentication File**: `lib/DeltaAPIKeyAuthorization.js`
- **Delta Exchange API Docs**: [https://docs.delta.exchange](https://docs.delta.exchange)

## Summary

✅ **Correct Implementation Checklist:**
- [ ] Timestamp in **seconds** (not milliseconds)
- [ ] Query parameters included in path for signature
- [ ] Body is empty string `""` when no data
- [ ] Method is **uppercase**
- [ ] Signature uses HMAC-SHA256 with hex encoding
- [ ] All three headers present: `api-key`, `signature`, `timestamp`
