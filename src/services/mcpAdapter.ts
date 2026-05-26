// MCP 适配器服务 - 将 V2 的 MCP 数据获取能力迁移到 V1
// 同时保持与 V1 现有数据模型的兼容性

// ==================== 类型定义 ====================

export interface MarketData {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
}

export interface PriceHistory {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface BacktestMetrics {
  totalReturn: number;
  annualizedReturn: number;
  volatility: number;
  sharpeRatio: number;
  maxDrawdown: number;
}

// ==================== MCP 配置 ====================
export const MCP_CONFIG = {
  // Finance MCP (Tushare) - 与 V2 一致
  financeMcp: {
    url: 'https://finvestai.top/mcp',
    token: '3802840e1052096c0d5a166e3a60eecb3e4467258e9ee734848900eb',
  },
  // 组合优化服务
  portfolioOptimizer: {
    url: 'http://localhost:8000',
  },
};

// ==================== MCP 请求函数 ====================
async function callFinanceMCP<T>(toolName: string, args: Record<string, unknown>): Promise<T> {
  const response = await fetch(MCP_CONFIG.financeMcp.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Tushare-Token': MCP_CONFIG.financeMcp.token,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: JSON.stringify(args),
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`MCP call failed: ${response.status}`);
  }

  const result = await response.json();
  if (result.error) {
    throw new Error(`MCP error: ${result.error.message}`);
  }

  return result.result;
}

// ==================== 市场数据获取 ====================

/**
 * 获取实时市场数据 (从 MCP)
 * 对应 V2: fetchMarketData()
 */
export async function fetchMarketDataFromMCP(
  symbols: string[]
): Promise<Record<string, MarketData>> {
  const results: Record<string, MarketData> = {};

  for (const symbol of symbols) {
    try {
      const data = await callFinanceMCP<any>('stock_zh_a_hist', {
        symbol,
        period: 'daily',
        start_date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        end_date: new Date().toISOString().split('T')[0],
        adjust: 'qfq',
      });

      if (data && data.length > 0) {
        const latest = data[data.length - 1];
        const prev = data.length > 1 ? data[data.length - 2] : latest;
        const change = latest.close - prev.close;

        results[symbol] = {
          symbol,
          price: latest.close,
          change,
          changePercent: (change / prev.close) * 100,
        };
      }
    } catch (e) {
      console.warn(`[MCP] Failed to fetch ${symbol}:`, e);
    }
  }

  return results;
}

/**
 * 获取历史价格数据 (从 MCP)
 * 对应 V2: fetchPriceHistory()
 */
export async function fetchPriceHistoryFromMCP(
  symbol: string,
  period: string = '1y'
): Promise<PriceHistory[]> {
  try {
    const result = await callFinanceMCP<any>('yahoo-history', {
      symbol,
      period,
      interval: '1d',
    });

    return (result || []).map((item: any) => ({
      date: item.date,
      open: item.open,
      high: item.high,
      low: item.low,
      close: item.close,
      volume: item.volume,
    }));
  } catch (error) {
    console.error(`[MCP] Failed to fetch history for ${symbol}:`, error);
    return [];
  }
}

// ==================== 回测计算 ====================

/**
 * 计算回测指标
 * 对应 V2: calculateBacktestMetrics()
 */
export function calculateBacktestMetricsFromPrices(
  prices: number[]
): BacktestMetrics {
  if (prices.length < 2) {
    return {
      totalReturn: 0,
      annualizedReturn: 0,
      volatility: 0,
      sharpeRatio: 0,
      maxDrawdown: 0,
    };
  }

  const returns: number[] = [];
  let maxPrice = prices[0];
  let maxDrawdown = 0;

  for (let i = 1; i < prices.length; i++) {
    const ret = (prices[i] - prices[i - 1]) / prices[i - 1];
    returns.push(ret);

    if (prices[i] > maxPrice) {
      maxPrice = prices[i];
    }
    const drawdown = (maxPrice - prices[i]) / maxPrice;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }

  const totalReturn = (prices[prices.length - 1] - prices[0]) / prices[0];
  const days = prices.length;
  const annualizedReturn = Math.pow(1 + totalReturn, 252 / days) - 1;

  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
  const volatility = Math.sqrt(variance * 252);

  const sharpeRatio = volatility > 0 ? (annualizedReturn - 0.03) / volatility : 0;

  return {
    totalReturn,
    annualizedReturn,
    volatility,
    sharpeRatio,
    maxDrawdown,
  };
}

// ==================== 优雅降级 ====================

/**
 * 带降级的市场数据获取
 * 优先使用 MCP，失败时使用 fallback
 */
export async function fetchWithFallback<T>(
  mcpFetch: () => Promise<T>,
  fallback: T,
  fallbackReason: string
): Promise<{ data: T; isFromFallback: boolean }> {
  try {
    const data = await mcpFetch();
    return { data, isFromFallback: false };
  } catch (error) {
    console.warn(`[MCP] Fetch failed, using fallback: ${fallbackReason}`, error);
    return { data: fallback, isFromFallback: true };
  }
}

// ==================== VIX/恐慌指数获取 ====================

/**
 * 获取 VIX 恐慌指数 (从 Yahoo Finance)
 * 对应 V1: fetchMarketSentiment() 中的 VIX 获取逻辑
 */
export async function fetchVIX(): Promise<number | null> {
  try {
    const response = await fetch(
      'https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?range=1d&interval=1d',
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    );

    if (!response.ok) return null;

    const data = await response.json();
    const quote = data?.chart?.result?.[0]?.indicators?.quote?.[0];
    if (quote?.close) {
      return quote.close.find((c: number | null) => c !== null) as number;
    }
    return null;
  } catch (e) {
    console.warn('[MCP] VIX fetch failed:', e);
    return null;
  }
}

// ==================== 宏观经济数据获取 ====================

/**
 * 获取美股指数 (道琼斯、纳指、标普500)
 * 对应 AKShare MCP: index_us_spot()
 */
export async function fetchUSIndices(): Promise<Record<string, { close: number; change: number }>> {
  try {
    const response = await fetch(
      'https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?range=5d&interval=1d',
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    );

    if (!response.ok) return {};

    const data = await response.json();
    const result = data?.chart?.result?.[0];
    const quote = result?.indicators?.quote?.[0];
    const meta = result?.meta;

    if (!quote?.close) return {};

    const closes = quote.close.filter((c: number | null) => c !== null) as number[];
    if (closes.length < 2) return {};

    const current = closes[closes.length - 1];
    const prev = closes[closes.length - 2];

    return {
      'SP500': { close: current, change: current - prev }
    };
  } catch (e) {
    console.warn('[MCP] US Indices fetch failed:', e);
    return {};
  }
}

/**
 * 获取国债收益率
 * 对应 AKShare MCP: bond_yield()
 */
export async function fetchBondYields(): Promise<Record<string, number>> {
  try {
    const response = await fetch(
      'https://query1.finance.yahoo.com/v8/finance/chart/%5ETNX?range=1d&interval=1d',
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    );

    if (!response.ok) return {};

    const data = await response.json();
    const quote = data?.chart?.result?.[0]?.indicators?.quote?.[0];

    if (quote?.close) {
      const rate = quote.close.find((c: number | null) => c !== null) as number;
      if (rate) {
        return { '10Y': rate };
      }
    }
    return {};
  } catch (e) {
    console.warn('[MCP] Bond yields fetch failed:', e);
    return {};
  }
}

// ==================== GPU/ML 增强分析 (可选) ====================

/**
 * 简化版: 基于技术指标的信号分析
 * 在后端实现时可以使用 GPU 加速
 */
export interface TechnicalSignal {
  asset: string;
  signal: 'bullish' | 'bearish' | 'neutral';
  strength: number;
  indicators: {
    rsi?: number;
    macd?: string;
    trend?: string;
  };
}

/**
 * 生成技术信号 (简化版)
 * 在完整实现中可以对接 etf_data_server.py 获取真实指标
 */
export async function generateTechnicalSignals(
  symbols: string[]
): Promise<TechnicalSignal[]> {
  const signals: TechnicalSignal[] = [];

  for (const symbol of symbols) {
    try {
      // 获取最近60天数据
      const history = await fetchPriceHistoryFromMCP(symbol, '1mo');

      if (history.length < 20) {
        signals.push({
          asset: symbol,
          signal: 'neutral',
          strength: 0,
          indicators: { trend: 'insufficient data' }
        });
        continue;
      }

      // 简化 RSI 计算
      const closes = history.map(h => h.close);
      const gains: number[] = [];
      const losses: number[] = [];

      for (let i = 1; i < closes.length; i++) {
        const diff = closes[i] - closes[i - 1];
        if (diff > 0) gains.push(diff);
        else losses.push(Math.abs(diff));
      }

      const avgGain = gains.length > 0 ? gains.reduce((a, b) => a + b, 0) / gains.length : 0;
      const avgLoss = losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / losses.length : 0;

      const rs = avgGain / (avgLoss || 1);
      const rsi = 100 - (100 / (1 + rs));

      // 信号判断
      let signal: 'bullish' | 'bearish' | 'neutral' = 'neutral';
      let strength = 0;

      if (rsi > 70) {
        signal = 'bearish';
        strength = Math.min((rsi - 70) / 30, 1);
      } else if (rsi < 30) {
        signal = 'bullish';
        strength = Math.min((30 - rsi) / 30, 1);
      }

      signals.push({
        asset: symbol,
        signal,
        strength,
        indicators: { rsi: Math.round(rsi) }
      });
    } catch (e) {
      console.warn(`[MCP] Technical signal failed for ${symbol}:`, e);
      signals.push({
        asset: symbol,
        signal: 'neutral',
        strength: 0,
        indicators: { trend: 'error' }
      });
    }
  }

  return signals;
}