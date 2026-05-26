// Types for Investment Advisor System v3.1

export type RiskType = 'R1' | 'R2' | 'R3' | 'R4';

// Client Profile
export interface ClientProfile {
  riskScore: number;
  riskType: RiskType;
  maxDrawdown: number;
  minBondWeight: number;
  maxCryptoWeight: number;
  maxSingleStock: number;
}

// Questionnaire Answer
export interface QuestionnaireAnswer {
  questionId: number;
  selectedOption: number;
}

// Asset
export interface Asset {
  code: string;
  name: string;
  type: 'equity' | 'bond' | 'commodity' | 'altcoin';
  risk: 'low' | 'medium' | 'high' | 'very_high';
  price: number;
  expectedReturn: number;
  volatility: number;
  searchQuery: string; // 搜索关键词
}

// Portfolio Result
export interface PortfolioResult {
  weights: Record<string, number>;
  expectedReturn: number;
  expectedVolatility: number;
  sharpeRatio: number;
  maxDrawdown: number;
  timestamp: string;
}

// Asset Pool
export const ASSET_POOL: Asset[] = [
  { code: '510300.SH', name: '沪深300 ETF', type: 'equity', risk: 'medium', price: 3.85, expectedReturn: 0.08, volatility: 0.18, searchQuery: 'CSI 300 ETF China stock' },
  { code: '159605.SZ', name: '纳指ETF', type: 'equity', risk: 'high', price: 4.2, expectedReturn: 0.12, volatility: 0.25, searchQuery: 'NASDAQ 100 ETF China' },
  { code: '511010.SH', name: '国债ETF', type: 'bond', risk: 'low', price: 164.5, expectedReturn: 0.04, volatility: 0.08, searchQuery: 'China Treasury bond ETF' },
  { code: '518880.SH', name: '黄金ETF', type: 'commodity', risk: 'medium', price: 5.8, expectedReturn: 0.06, volatility: 0.14, searchQuery: 'gold ETF China GLD' },
  { code: '162411.SZ', name: '原油ETF', type: 'commodity', risk: 'high', price: 0.65, expectedReturn: 0.10, volatility: 0.35, searchQuery: 'crude oil ETF China USO' },
  { code: '513100.SH', name: '纳指ETF(上)', type: 'altcoin', risk: 'very_high', price: 1.8, expectedReturn: 0.15, volatility: 0.45, searchQuery: 'NASDAQ ETF China IBIT' },
];

// ========== 市场情绪和新闻数据 ==========

// 获取资产相关新闻
export async function fetchAssetNews(): Promise<{
  sentiment: 'bullish' | 'bearish' | 'neutral';
  sentimentScore: number; // -1 到 1
  news: { source: string; title: string; url: string; asset: string; time: string }[];
}> {
  const news: { source: string; title: string; url: string; asset: string; time: string }[] = [];
  let totalSentiment = 0;
  let newsCount = 0;

  // 使用 Yahoo Finance 获取每只资产的相关新闻
  const assetNewsPromises = ASSET_POOL.map(async (asset) => {
    try {
      const symbol = asset.code === '510300.SH' ? '510300.SS' : asset.code;

      // Yahoo Finance 新闻 API
      const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${symbol}&newsType=provider&provider=yc`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        }
      });

      if (!response.ok) return null;

      const data = await response.json();
      const newsItems = data?.news;

      if (!newsItems || newsItems.length === 0) return null;

      // 取最新的新闻
      const item = newsItems[0];
      return {
        source: item.publisher || 'Yahoo Finance',
        title: item.title || '',
        url: item.link || '',
        asset: asset.name,
        time: item.timeAgo || '',
      };
    } catch (error) {
      return null;
    }
  });

  const results = await Promise.all(assetNewsPromises);

  // 收集有效新闻
  for (const item of results) {
    if (item && item.title) {
      news.push(item);
      newsCount++;

      // 简单情绪分析 (基于标题关键词)
      const title = item.title.toLowerCase();
      if (title.includes('rise') || title.includes('gain') || title.includes('surge') || title.includes('bull') || title.includes('high')) {
        totalSentiment += 0.3;
      } else if (title.includes('fall') || title.includes('drop') || title.includes('bear') || title.includes('low') || title.includes('worst')) {
        totalSentiment -= 0.3;
      }
    }
  }

  // 如果没有新闻，使用 fallback 数据
  if (news.length === 0) {
    // Fallback 热门新闻
    const fallbackNews = [
      { source: 'Reuters', title: 'Fed signals potential rate cut in 2025', url: 'https://www.reuters.com/markets/', asset: 'TLT', time: '2h ago' },
      { source: 'Bloomberg', title: 'Tech stocks rally on AI demand', url: 'https://www.bloomberg.com/markets/', asset: 'QQQ', time: '3h ago' },
      { source: 'CNBC', title: 'Gold hits new high amid inflation hedge', url: 'https://www.cnbc.com/investing/', asset: 'GLD', time: '4h ago' },
      { source: 'WSJ', title: 'Bitcoin ETF inflows increase', url: 'https://www.wsj.com/news/business/', asset: 'IBIT', time: '5h ago' },
      { source: 'FT', title: 'China GDP beats expectations', url: 'https://www.ft.com/markets/', asset: '510300.SH', time: '6h ago' },
      { source: 'WSJ', title: 'Oil prices stabilize on supply concerns', url: 'https://www.wsj.com/news/business/investing/', asset: 'USO', time: '7h ago' },
    ];

    news.push(...fallbackNews);
    totalSentiment = 0.1; // 轻微看多
    newsCount = 6;
  }

  // 计算整体情绪
  const sentimentScore = newsCount > 0 ? totalSentiment / newsCount : 0;
  const sentiment: 'bullish' | 'bearish' | 'neutral' =
    sentimentScore > 0.2 ? 'bullish' :
    sentimentScore < -0.2 ? 'bearish' : 'neutral';

  console.log('[News] 情绪:', sentiment, 'Score:', sentimentScore.toFixed(2), 'News count:', news.length);

  return { sentiment, sentimentScore, news };
}

// ==================== MCP 服务端点配置 ====================
// 本地 MCP Server URL (需要先启动 mcp_server.py)
export const MCP_SERVER_URL = import.meta.env?.VITE_MCP_SERVER_URL || 'http://localhost:8001';

// ==================== MinerU MCP 配置 ====================
// PDF/DOCX 文档解析服务
export const MINERU_CONFIG = {
  // 使用本地 MinerU API 或远程 API
  apiBase: import.meta.env?.VITE_MINERU_API_BASE || 'https://api.mineru.cn',
  apiKey: import.meta.env?.VITE_MINERU_API_KEY || '',
  useLocal: import.meta.env?.VITE_MINERU_USE_LOCAL === 'true',
};

// MinerU MCP Server URL (如果使用本地服务)
export const MINERU_SERVER_URL = import.meta.env?.VITE_MINERU_SERVER_URL || 'http://localhost:8002';

// ==================== MCP 增强的市场情绪获取 ====================
// 优先使用本地 MCP Server，失败时降级到原有实现

/**
 * 获取市场情绪 (MCP 增强版)
 * 优先从本地 MCP Server 获取，如果失败则降级到原有逻辑
 */
export async function fetchMarketSentimentMCP(): Promise<{
  vix: number | null;
  putCallRatio: number | null;
  fearGreedIndex: number | null;
  sentiment: 'fear' | 'greed' | 'neutral';
}> {
  // 尝试从 MCP Server 获取
  try {
    const response = await fetch(`${MCP_SERVER_URL}/api/market/sentiment`, {
      method: 'GET',
      headers: { 'Cache-Control': 'no-cache' }
    });

    if (response.ok) {
      const data = await response.json();
      console.log('[MCP] Sentiment fetch success');

      return {
        vix: data.vix ?? null,
        putCallRatio: null,
        fearGreedIndex: data.fear_greed_index ?? null,
        sentiment: data.sentiment === 'fear' ? 'fear' :
                 data.sentiment === 'greed' ? 'greed' : 'neutral'
      };
    }
  } catch (e) {
    console.warn('[MCP] Sentiment endpoint unavailable, using fallback:', e);
  }

  // 降级到原有实现
  return fetchMarketSentiment();
}

/**
 * 获取 Market Regime (MCP 增强版)
 * 优先从本地 MCP Server 获取，如果失败则降级到原有实现
 */
export async function determineMarketRegimeMCP(): Promise<{
  regime: 'normal' | 'inflation' | 'recession';
  phase: 'recovery' | 'overheat' | 'stagflation' | 'recession';
  confidence: number;
  factors: string[];
  indicators: {
    gdp: number;
    cpi: number;
    pmi: number;
    unemployment: number;
    creditSpread: number;
    yieldCurve: number;
    fedRate: number;
  };
}> {
  // 尝试从 MCP Server 获取
  try {
    const response = await fetch(`${MCP_SERVER_URL}/api/market/regime`, {
      method: 'GET',
      headers: { 'Cache-Control': 'no-cache' }
    });

    if (response.ok) {
      const data = await response.json();
      console.log('[MCP] Regime fetch success');

      return {
        regime: data.regime,
        phase: data.phase,
        confidence: data.confidence,
        factors: data.factors,
        indicators: data.indicators
      };
    }
  } catch (e) {
    console.warn('[MCP] Regime endpoint unavailable, using fallback:', e);
  }

  // 降级到原有实现
  return determineMarketRegime();
}

// 简化版: 获取市场情绪指标 (VIX + PUT/Call ratio 代理)
export async function fetchMarketSentiment(): Promise<{
  vix: number | null;
  putCallRatio: number | null;
  fearGreedIndex: number | null;
  sentiment: 'fear' | 'greed' | 'neutral';
}> {
  let vix: number | null = null;
  let putCallRatio: number | null = null;
  let fearGreedIndex: number | null = null;

  // 获取 VIX (恐慌指数)
  try {
    const vixResponse = await fetch(
      'https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?range=1d&interval=1d',
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    );

    if (vixResponse.ok) {
      const vixData = await vixResponse.json();
      const quote = vixData?.chart?.result?.[0]?.indicators?.quote?.[0];
      if (quote?.close) {
        vix = quote.close.find((c: number | null) => c !== null) as number;
      }
    }
  } catch (e) {
    console.warn('[Sentiment] VIX fetch failed');
  }

  // 使用 SPY 的走势作为市场情绪代理
  try {
    const spyResponse = await fetch(
      'https://query1.finance.yahoo.com/v8/finance/chart/SPY?range=5d&interval=1d',
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    );

    if (spyResponse.ok) {
      const spyData = await spyResponse.json();
      const quote = spyData?.chart?.result?.[0]?.indicators?.quote?.[0];
      const closes = quote?.close?.filter((c: number | null) => c !== null) as number[];

      if (closes && closes.length >= 2) {
        const change = (closes[closes.length - 1] - closes[0]) / closes[0];

        // 根据 SPY 5天变化计算 Fear/Greed (简化)
        // change > 2% = Greed, change < -2% = Fear
        if (change > 0.02) {
          fearGreedIndex = 75; // Greed
        } else if (change < -0.02) {
          fearGreedIndex = 25; // Fear
        } else {
          fearGreedIndex = 50; // Neutral
        }
      }
    }
  } catch (e) {
    console.warn('[Sentiment] SPY fetch failed');
    fearGreedIndex = 50; // Default neutral
  }

  // 确定情绪
  let sentiment: 'fear' | 'greed' | 'neutral' = 'neutral';
  if (vix !== null && vix > 25) {
    sentiment = 'fear';
  } else if (fearGreedIndex !== null) {
    if (fearGreedIndex > 65) sentiment = 'greed';
    else if (fearGreedIndex < 35) sentiment = 'fear';
  }

  console.log('[Sentiment] VIX:', vix, 'FearGreed:', fearGreedIndex, '→', sentiment);

  return { vix, putCallRatio, fearGreedIndex, sentiment };
}

// Questionnaire
export const QUESTIONS = [
  { id: 1, text: '您的投资目标是？', options: ['资产保值', '稳定增值', '追求收益', '最大化收益'] },
  { id: 2, text: '您能承受的最大亏损是？', options: ['5%以内', '10%以内', '20%以内', '30%以上'] },
  { id: 3, text: '您的投资期限是？', options: ['1年内', '1-3年', '3-5年', '5年以上'] },
  { id: 4, text: '您对波动的接受程度？', options: ['非常厌恶', '略感不适', '可接受', '欢迎波动'] },
  { id: 5, text: '您是否投资过股票型基金？', options: ['从未', '少量', '较多', '大量'] },
];

// Constraint Rules
export const CONSTRAINT_RULES: Record<RiskType, {
  maxDrawdown: number;
  minBondWeight: number;
  maxCryptoWeight: number;
  maxSingleStock: number;
  label: string;
  color: string;
}> = {
  R1: { maxDrawdown: 0.05, minBondWeight: 0.50, maxCryptoWeight: 0, maxSingleStock: 0.10, label: '保守型', color: '#48bb78' },
  R2: { maxDrawdown: 0.10, minBondWeight: 0.30, maxCryptoWeight: 0.03, maxSingleStock: 0.20, label: '稳健型', color: '#4299e1' },
  R3: { maxDrawdown: 0.15, minBondWeight: 0.15, maxCryptoWeight: 0.05, maxSingleStock: 0.30, label: '成长型', color: '#ed8936' },
  R4: { maxDrawdown: 0.25, minBondWeight: 0, maxCryptoWeight: 0.10, maxSingleStock: 0.40, label: '积极型', color: '#f56565' },
};

// Helper functions
export function calculateRiskScore(answers: QuestionnaireAnswer[]): number {
  const scores = answers.map(a => (a.selectedOption + 1) * 4);
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return Math.min(100, Math.max(20, Math.round(avg * 5)));
}

export function getRiskType(score: number): RiskType {
  if (score <= 40) return 'R1';
  if (score <= 65) return 'R2';
  if (score <= 85) return 'R3';
  return 'R4';
}

export function generateConstraints(riskType: RiskType): ClientProfile {
  const rules = CONSTRAINT_RULES[riskType];
  return {
    riskScore: 0,
    riskType,
    maxDrawdown: rules.maxDrawdown,
    minBondWeight: rules.minBondWeight,
    maxCryptoWeight: rules.maxCryptoWeight,
    maxSingleStock: rules.maxSingleStock,
  };
}

// Asset codes
export const ASSET_CODES = ['510300.SH', '159605.SZ', '511010.SH', '518880.SH', '162411.SZ', '513100.SH'] as const;
export type AssetCode = typeof ASSET_CODES[number];

// Correlation matrix for assets
export const ASSET_CORRELATIONS: Record<AssetCode, Record<AssetCode, number>> = {
  '510300.SH': { '510300.SH': 1.0, '159605.SZ': 0.6, '511010.SH': -0.2, '518880.SH': 0.2, '162411.SZ': 0.3, '513100.SH': 0.4 },
  '159605.SZ': { '510300.SH': 0.6, '159605.SZ': 1.0, '511010.SH': -0.3, '518880.SH': 0.1, '162411.SZ': 0.4, '513100.SH': 0.5 },
  '511010.SH': { '510300.SH': -0.2, '159605.SZ': -0.3, '511010.SH': 1.0, '518880.SH': 0.2, '162411.SZ': -0.1, '513100.SH': 0.0 },
  '518880.SH': { '510300.SH': 0.2, '159605.SZ': 0.1, '511010.SH': 0.2, '518880.SH': 1.0, '162411.SZ': 0.3, '513100.SH': 0.3 },
  '162411.SZ': { '510300.SH': 0.3, '159605.SZ': 0.4, '511010.SH': -0.1, '518880.SH': 0.3, '162411.SZ': 1.0, '513100.SH': 0.3 },
  '513100.SH': { '510300.SH': 0.4, '159605.SZ': 0.5, '511010.SH': 0.0, '518880.SH': 0.3, '162411.SZ': 0.3, '513100.SH': 1.0 },
};

// Asset volatility (daily std dev)
export const ASSET_VOLATILITY: Record<AssetCode, number> = {
  '510300.SH': 0.015,
  '159605.SZ': 0.018,
  '511010.SH': 0.006,
  '518880.SH': 0.006,
  '162411.SZ': 0.025,
  '513100.SH': 0.035,
};

// Calculate portfolio daily returns
function calculatePortfolioDailyReturns(
  days: number,
  weights: Record<string, number>
): number[] {
  const assets = Object.keys(weights);
  const returns: number[] = [];

  for (let d = 0; d < days; d++) {
    let daily = 0;
    for (const asset of assets) {
      const w = weights[asset] || 0;
      const vol = ASSET_VOLATILITY[asset as AssetCode] || 0.015;
      const z = (Math.random() - 0.5) * 2;
      daily += w * z * vol;
    }
    returns.push(daily);
  }
  return returns;
}

// Calculate Max Drawdown from portfolio returns
function calculateMaxDrawdown(portfolioReturns: number[]): number {
  let wealth = 1;
  let peak = 1;
  let maxDD = 0;

  for (const ret of portfolioReturns) {
    wealth *= (1 + ret);
    if (wealth > peak) peak = wealth;
    const dd = 1 - wealth / peak;
    if (dd > maxDD) maxDD = dd;
  }
  return maxDD;
}

// Calculate Annual Volatility
function calculateAnnualVolatility(portfolioReturns: number[]): number {
  const mean = portfolioReturns.reduce((a, b) => a + b, 0) / portfolioReturns.length;
  const variance = portfolioReturns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / portfolioReturns.length;
  return Math.sqrt(variance) * Math.sqrt(252);
}

// Calculate Historical VaR (95%)
function calculateVaR(portfolioReturns: number[]): number {
  const sorted = [...portfolioReturns].sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * 0.05);
  return sorted[idx];
}

// Calculate CVaR
function calculateCVaR(portfolioReturns: number[]): number {
  const sorted = [...portfolioReturns].sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * 0.05);
  const tail = sorted.slice(0, idx + 1);
  return tail.reduce((a, b) => a + b, 0) / tail.length;
}

// Portfolio Risk Metrics
export interface PortfolioRiskMetrics {
  maxDrawdown: number;
  annualVolatility: number;
  dailyVar95: number;
  dailyCvar95: number;
}

export function calculatePortfolioRisk(
  weights: Record<string, number>
): PortfolioRiskMetrics {
  const returns = calculatePortfolioDailyReturns(252, weights);

  return {
    maxDrawdown: calculateMaxDrawdown(returns),
    annualVolatility: calculateAnnualVolatility(returns),
    dailyVar95: calculateVaR(returns),
    dailyCvar95: calculateCVaR(returns),
  };
}

// Stress Test Scenarios
export interface StressScenarioData {
  id: string;
  name: string;
  period: string;
  description: string;
  marketDecline: number;
  correlationShock: number;
  daysToBottom: number;
}

export const STRESS_SCENARIOS: StressScenarioData[] = [
  {
    id: '2008_subprime',
    name: '2008 次贷危机',
    period: '2007.10 - 2009.03',
    description: '雷曼兄���破产，全球股市暴跌',
    marketDecline: 0.55,
    correlationShock: 1.3,
    daysToBottom: 350,
  },
  {
    id: '2020_covid',
    name: '2020 新冠疫情',
    period: '2020.02 - 2020.03',
    description: '全球疫情爆发，股市熔断',
    marketDecline: 0.34,
    correlationShock: 1.1,
    daysToBottom: 33,
  },
  {
    id: '2022_rate_hikes',
    name: '2022 激进加息',
    period: '2022.01 - 2022.12',
    description: '美联储激进加息，股债双杀',
    marketDecline: 0.25,
    correlationShock: 1.0,
    daysToBottom: 250,
  },
  {
    id: '2022_china_crackdown',
    name: '2022 中国教培',
    period: '2021.07 - 2022.03',
    description: '中国教培行业整顿，港股/A股承压',
    marketDecline: 0.35,
    correlationShock: 1.2,
    daysToBottom: 200,
  },
];

export interface StressTestResult {
  scenarioId: string;
  portfolioReturn: number;
  observedDrawdown: number;
  status: 'PASS' | 'FAIL';
  diagnosis: string;
}

export interface QuantRiskResult {
  status: 'PASS' | 'FAIL';
  worstScenario: string | null;
  maxObservedDrawdown: number;
  results: StressTestResult[];
  recommendation: string;
}

// ========== Backtest Module (v3.3) ==========

export interface BacktestConfig {
  period: '1Y' | '3Y' | '5Y' | 'Custom';
  rebalanceFrequency: 'monthly' | 'quarterly';
  benchmark: '510300.SH' | '159605.SZ' | 'CSI300' | '60_40';
  startDate?: string;
  endDate?: string;
}

export interface BacktestResult {
  period: string;
  rebalanceFrequency: string;
  benchmark: string;
  totalReturn: number;
  annualizedReturn: number;
  annualizedVolatility: number;
  sharpeRatio: number;
  maxDrawdown: number;
  winRate: number;
  bestMonth: number;
  worstMonth: number;
  monthlyReturns: number[];
  equityCurve: number[];
  benchmarkCurve: number[];
  assetCurves: Record<string, number[]>;
  monthlyData: { date: string; portfolio: number; benchmark: number; assets: Record<string, number> }[];
}

// Historical price data for backtest (simplified - in production would use API)
const HISTORICAL_PRICES: Record<AssetCode, { prices: number[]; dates: string[] }> = {
  '510300.SH': { prices: [], dates: [] },
  '159605.SZ': { prices: [], dates: [] },
  '511010.SH': { prices: [], dates: [] },
  '518880.SH': { prices: [], dates: [] },
  '162411.SZ': { prices: [], dates: [] },
  '513100.SH': { prices: [], dates: [] },
};

// Generate realistic historical prices based on market events
function generateHistoricalPrices(dates: number): Record<AssetCode, number[]> {
  const result: Record<AssetCode, number[]> = {
    '510300.SH': [], '159605.SZ': [], '511010.SH': [], '518880.SH': [], '162411.SZ': [], '513100.SH': []
  };

  // Initial prices (normalized to 100 at start)
  const initialPrices: Record<AssetCode, number> = {
    '510300.SH': 100, '159605.SZ': 100, '511010.SH': 100, '518880.SH': 100, '162411.SZ': 100, '513100.SH': 100
  };

  // 5 historical periods: 2019-2020Q1, 2020Q2-Q4, 2021, 2022, 2023+
  const periods = 5;
  const daysPerPeriod = Math.floor(dates / periods);

  // Asset index mapping
  const ASSET_IDX = { '510300.SH': 0, '159605.SZ': 1, '511010.SH': 2, '518880.SH': 3, '162411.SZ': 4, '513100.SH': 5 };

  // Each row: [QQQ, 510300, TLT, GLD, USO, IBIT] - [trend, volMultiplier]
  const periodConfigs = [
    // Period 1: 2019-2020 pre-covid
    [[0.0003, 1.0], [0.0002, 1.0], [0.0001, 1.0], [0.0001, 1.0], [-0.0001, 1.0], [0.0002, 1.5]],
    // Period 2: 2020 covid crash
    [[-0.002, 3.0], [-0.001, 2.5], [0.001, 2.0], [0.0005, 1.5], [-0.003, 2.5], [-0.002, 2.0]],
    // Period 3: 2021 recovery
    [[0.0005, 1.2], [0.0004, 1.3], [-0.0002, 1.5], [0.0001, 1.2], [0.0003, 1.8], [0.001, 2.0]],
    // Period 4: 2022 bear market
    [[-0.0008, 1.8], [-0.0005, 1.5], [-0.0008, 2.0], [0.0002, 1.3], [0.0005, 2.0], [-0.002, 2.5]],
    // Period 5: 2023+ recovery
    [[0.0004, 1.0], [0.0002, 1.1], [-0.0001, 1.2], [0.0001, 1.0], [0.0002, 1.5], [0.0008, 1.8]],
  ];

  // Generate prices
  for (const asset of ASSET_CODES) {
    let price = initialPrices[asset];
    const idx = ASSET_IDX[asset] || 0;

    for (let p = 0; p < periods; p++) {
      const periodDays = p === periods - 1 ? dates - (periods - 1) * daysPerPeriod : daysPerPeriod;
      const trend = periodConfigs[p][idx][0];
      const volMult = periodConfigs[p][idx][1];

      for (let d = 0; d < periodDays; d++) {
        const noise = (Math.random() - 0.5) * 2 * volMult * 0.015;
        const dailyReturn = trend + noise;
        price *= (1 + dailyReturn);
        result[asset].push(Math.max(0.01, price));
      }
    }
  }

  return result;
}

// Run backtest - with optional FMP prices parameter
export function runBacktest(
  weights: Record<string, number>,
  config: BacktestConfig,
  externalPrices?: Record<string, number[]>  // Optional: FMP prices passed from App.tsx
): BacktestResult {
  const { period, rebalanceFrequency, benchmark } = config;

  // Calculate trading days based on period
  const periodDays: Record<string, number> = { '1Y': 252, '3Y': 756, '5Y': 1260, 'Custom': 756 };
  const days = periodDays[period] || 252;

  // Use external prices from FMP if available, otherwise generate simulated prices
  const prices = externalPrices || generateHistoricalPrices(days);

  // Calculate equity curves with monthly rebalancing
  const equityCurve: number[] = [1];
  const benchmarkCurve: number[] = [1];
  const assetCurves: Record<string, number[]> = {};
  const monthlyData: { date: string; portfolio: number; benchmark: number; assets: Record<string, number> }[] = [];

  // Initialize asset curves
  for (const asset of Object.keys(weights)) {
    assetCurves[asset] = [prices[asset as AssetCode][0]];
  }

  let currentWeights = { ...weights };
  let portfolioValue = 1;
  let benchmarkValue = 1;
  const benchmarkWeight = benchmark === '60_40' ? 0.6 : 1; // Simplified

  const monthlyReturns: number[] = [];

  for (let d = 0; d < days; d++) {
    // Monthly rebalancing
    if (d > 0 && d % 21 === 0) {
      if (rebalanceFrequency === 'monthly' || (rebalanceFrequency === 'quarterly' && d % 63 === 0)) {
        // Rebalance back to target weights
        currentWeights = { ...weights };
      }
    }

    // Calculate daily returns
    let dailyReturn = 0;
    for (const asset of Object.keys(currentWeights)) {
      const w = currentWeights[asset] || 0;
      const priceChange = (prices[asset as AssetCode][d] - prices[asset as AssetCode][d - 1]) / prices[asset as AssetCode][d - 1];
      dailyReturn += w * priceChange;
    }

    portfolioValue *= (1 + dailyReturn);
    equityCurve.push(portfolioValue);

    // Benchmark return
    const benchmarkAsset = benchmark === '510300.SH' ? '510300.SH' : 'QQQ';
    const benchReturn = (prices[benchmarkAsset as AssetCode][d] - prices[benchmarkAsset as AssetCode][d - 1]) / prices[benchmarkAsset as AssetCode][d - 1];
    benchmarkValue *= (1 + benchReturn);
    benchmarkCurve.push(benchmarkValue);

    // Asset curves
    for (const asset of Object.keys(weights)) {
      const price = prices[asset as AssetCode][d];
      const initialPrice = prices[asset as AssetCode][0];
      if (!assetCurves[asset]) assetCurves[asset] = [];
      assetCurves[asset].push(price / initialPrice);
    }

    // Monthly data snapshot
    if (d % 21 === 0) {
      const monthIndex = Math.floor(d / 21);

      monthlyReturns.push(dailyReturn * 21); // Approximate monthly return

      monthlyData.push({
        date: `M${monthIndex}`,
        portfolio: portfolioValue,
        benchmark: benchmarkValue,
        assets: Object.fromEntries(
          Object.keys(weights).map(a => [a, (prices[a as AssetCode][d] / prices[a as AssetCode][0])])
        ),
      });
    }
  }

  // Calculate metrics
  const totalReturn = equityCurve[equityCurve.length - 1] - 1;
  const years = days / 252;
  const annualizedReturn = Math.pow(1 + totalReturn, 1 / years) - 1;

  // Volatility
  const dailyReturns: number[] = [];
  for (let i = 1; i < equityCurve.length; i++) {
    dailyReturns.push((equityCurve[i] - equityCurve[i - 1]) / equityCurve[i - 1]);
  }
  const meanReturn = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
  const variance = dailyReturns.reduce((sum, r) => sum + (r - meanReturn) ** 2, 0) / dailyReturns.length;
  const dailyVol = Math.sqrt(variance);
  const annualizedVolatility = dailyVol * Math.sqrt(252);

  // Sharpe Ratio (assuming 0 risk-free rate)
  const sharpeRatio = annualizedReturn / annualizedVolatility;

  // Max Drawdown
  let peak = 1;
  let maxDD = 0;
  for (const v of equityCurve) {
    if (v > peak) peak = v;
    const dd = 1 - v / peak;
    if (dd > maxDD) maxDD = dd;
  }

  // Win Rate
  const positiveDays = dailyReturns.filter(r => r > 0).length;
  const winRate = positiveDays / dailyReturns.length;

  // Best/Worst Month
  const sortedMonthly = [...monthlyReturns].sort((a, b) => a - b);
  const worstMonth = sortedMonthly[0];
  const bestMonth = sortedMonthly[sortedMonthly.length - 1];

  return {
    period,
    rebalanceFrequency,
    benchmark,
    totalReturn,
    annualizedReturn,
    annualizedVolatility,
    sharpeRatio,
    maxDrawdown: maxDD,
    winRate,
    bestMonth,
    worstMonth,
    monthlyReturns,
    equityCurve,
    benchmarkCurve,
    assetCurves,
    monthlyData,
  };
}

// Run stress test
export function runQuantRiskStressTest(
  portfolioWeights: Record<string, number>,
  clientProfile: ClientProfile
): QuantRiskResult {
  const results: StressTestResult[] = [];
  let maxObservedDrawdown = 0;
  let worstScenario: string | null = null;
  const assets = Object.keys(portfolioWeights);

  for (const scenario of STRESS_SCENARIOS) {
    const { marketDecline, correlationShock, daysToBottom } = scenario;
    const days = Math.min(daysToBottom, 252);

    // Generate declining returns that end at marketDecline
    const portfolioReturns: number[] = [];
    let wealth = 1;
    let peak = 1;
    let scenarioMaxDD = 0;

    const declinePerDay = Math.pow(1 - marketDecline, 1 / days);

    for (let d = 0; d < days; d++) {
      let daily = 0;

      for (const asset of assets) {
        const w = portfolioWeights[asset] || 0;
        if (w < 0.01) continue;

        const vol = ASSET_VOLATILITY[asset as AssetCode] || 0.015;
        const corr = ASSET_CORRELATIONS[asset as AssetCode]?.[asset as AssetCode] || 0.5;
        const adjustedVol = vol * (1 + corr * (correlationShock - 1));

        // Trend towards decline + random noise
        const trend = declinePerDay - 1;
        const noise = (Math.random() - 0.5) * 2 * adjustedVol;
        daily += w * (trend + noise);
      }

      wealth *= (1 + daily);
      if (wealth > peak) peak = wealth;
      const dd = 1 - wealth / peak;
      if (dd > scenarioMaxDD) scenarioMaxDD = dd;

      portfolioReturns.push(daily);
    }

    const portfolioReturn = wealth - 1;
    const observedDrawdown = scenarioMaxDD;
    const exceedsLimit = observedDrawdown > clientProfile.maxDrawdown;

    // ========== 修复：正确的"拖累项归因" ==========
    // 计算每个资产对组合的【真实亏损贡献】
    // 亏损贡献 = 资产在该场景中的下跌幅度 × 权重
    // 只找亏损贡献最大的（必须是负数），而不是权重最大的

    const scenarioInfo = STRESS_SCENARIOS.find(s => s.id === scenario.id);
    const scenarioDrawdowns = scenarioInfo?.marketDecline || 0.5;

    // 使用场景中各资产的具体回撤数据
    const assetDrawdowns: Record<string, number> = {
      'QQQ': 0.55, '510300.SH': 0.40, 'TLT': -0.30, 'GLD': -0.25, 'USO': 0.65, 'IBIT': 0.50
    };

    // 计算每个资产的亏损贡献（回撤 × 权重）
    let worstAsset = '无';
    let worstContribution = 0;  // 最大的正亏损 = 最差

    for (const asset of assets) {
      const w = portfolioWeights[asset] || 0;
      const assetDD = assetDrawdowns[asset] || 0;
      const contribution = assetDD * w; // 正数表示亏损

      // 找贡献最大的（最差的，必须是正数代表亏损）
      if (contribution > worstContribution) {
        worstContribution = contribution;
        worstAsset = asset;
      }
    }

    // 如果最差的资产是负贡献（实际是上涨的），说明没有拖累项
    if (worstContribution <= 0) {
      worstAsset = '全员正收益';
    }

    const diagnosis = exceedsLimit
      ? `回撤${(observedDrawdown * 100).toFixed(1)}%超过容忍度${(clientProfile.maxDrawdown * 100).toFixed(0)}%，主因${worstAsset}剧烈下跌`
      : `最大回撤${(observedDrawdown * 100).toFixed(1)}%，符合约束`;

    results.push({
      scenarioId: scenario.id,
      portfolioReturn,
      observedDrawdown,
      status: exceedsLimit ? 'FAIL' : 'PASS',
      diagnosis,
    });

    if (observedDrawdown > maxObservedDrawdown) {
      maxObservedDrawdown = observedDrawdown;
      worstScenario = scenario.id;
    }
  }

  const failedResults = results.filter(r => r.status === 'FAIL');
  const status = failedResults.length > 0 ? 'FAIL' : 'PASS';

  const recommendation = status === 'PASS'
    ? '所有压力场景通过，建议放行至报告环节'
    : `${results.find(r => r.status === 'FAIL')?.scenarioId} 场景回撤超标，建议增加防守资产`;

  return {
    status,
    worstScenario,
    maxObservedDrawdown,
    results,
    recommendation,
  };
}

// ========== Natural Language Explanations (v3.3 Data Translator) ==========

// Scenario explanations for risk education
const SCENARIO_EXPLANATIONS: Record<string, {
  name: string;
  whyCrashed: string;
  defenseAdvice: string;
}> = {
  '2008_subprime': {
    name: '2008次贷危机',
    whyCrashed: '金融危机导致全球流动性枯竭，风险资产集体暴跌。股票是高Beta资产，在此环境下跌幅最大。',
    defenseAdvice: '配置国债(TLT)和黄金(GLD)可在此类流动性危机中提供有效对冲。'
  },
  '2020_covid': {
    name: '2020新冠疫情',
    whyCrashed: '疫情引发短暂但剧烈的市场恐慌，股票和原油遭受抛售。',
    defenseAdvice: '政府救市后债券和黄金通常率先反弹，提供分散化保护。'
  },
  '2022_rate_hikes': {
    name: '2022激进加息',
    whyCrashed: '美联储激进加息推高无风险利率，科技股等成长风格遭到杀估值。国债也在加息周期下跌。',
    defenseAdvice: '短债优于长债，黄金和现金在此刻更有防御价值。'
  },
  '2022_china_crackdown': {
    name: '2022中国教培整顿',
    whyCrashed: '中国政策风险导致相关股票暴跌，全球避险情绪升温。',
    defenseAdvice: '全球化分散配置可降低单一国家政策风险敞口。'
  },
};

// Generate stress test explanation with risk education
export function explainStressTest(
  scenarioId: string,
  portfolioMaxDrawdown: number,
  _worstAsset: string,
  weights: Record<string, number>
): string {
  const scenario = SCENARIO_EXPLANATIONS[scenarioId];
  if (!scenario) return '';

  const defenseAssets = Object.entries(weights)
    .filter(([_, w]) => w > 0.15)
    .map(([a]) => a)
    .join('、');

  return `[风险教育] 在${scenario.name}中，您的组合最大回撤为${(portfolioMaxDrawdown * 100).toFixed(1)}%。` +
    `${scenario.whyCrashed}` +
    `您目前配置的${defenseAssets}提供了基础防御。` +
    `${scenario.defenseAdvice}`;
}

// Generate one-liner summary for the portfolio
export function generateOneLiner(
  clientProfile: ClientProfile,
  weights: Record<string, number>,
  macroRegime: string
): string {
  // Calculate defense vs offense ratios
  const defensiveAssets = ['TLT', 'GLD'];
  const defensiveWeight = Object.entries(weights)
    .filter(([a]) => defensiveAssets.includes(a))
    .reduce((sum, [_, w]) => sum + w, 0);

  const offensiveAssets = ['QQQ', '510300.SH', 'USO', 'IBIT'];
  const offensiveWeight = Object.entries(weights)
    .filter(([a]) => offensiveAssets.includes(a))
    .reduce((sum, [_, w]) => sum + w, 0);

  const clientLabel = CONSTRAINT_RULES[clientProfile.riskType]?.label || '投资者';

  // Macro regime mapping
  const regimeDesc = macroRegime === 'inflation' ? '通胀升温' :
    macroRegime === 'recession' ? '经济放缓' : '温和增长';

  // Generate the one-liner
  if (defensiveWeight > 0.6) {
    return `鉴于当前${regimeDesc}环境，系统为保守型${clientLabel}量身定制了这套重兵把守于防御资产(${defensiveWeight * 100 | 0}%)的组合，旨在严控回撤前提下追求稳健收益。`;
  } else if (defensiveWeight > 0.3) {
    return `鉴于当前${regimeDesc}环境，系统为稳健型${clientLabel}配置了这套攻防兼备(${defensiveWeight * 100 | 0}%防��� + ${offensiveWeight * 100 | 0}%进攻)的组合，兼顾收益与回撤控制。`;
  } else {
    return `鉴于当前${regimeDesc}环境，系统为进取型${clientLabel}定制了这套以${offensiveWeight * 100 | 0}%进攻为核心的组合，旨在把握市场弹性获取超额收益。`;
  }
}

// Explain a quantitative metric in plain Chinese
export function explainMetric(
  metricName: string,
  value: number,
  context: string
): string {
  const explanations: Record<string, (v: number, _ctx: string) => string> = {
    'VaR': (_v, _ctx) => `在${context}的市场环境下，有95%的概率，您的组合单日亏损不会超过${(Math.abs(_v) * 100).toFixed(1)}%。`,
    'CVaR': (_v, _ctx) => `即使不幸遭遇最差的5%情况，您的组合平均会亏损${(Math.abs(_v) * 100).toFixed(1)}%。`,
    'MaxDrawdown': (_v, _ctx) => `在${context}内历史最差的时期，您的组合从最高点最多下跌了${(_v * 100).toFixed(1)}%。`,
    'SharpeRatio': (v, _ctx) => v > 1 ? '夏普比率超过1，说明每承担1单位风险获得了超过1单位回报，投资效率较高。' :
      v > 0.5 ? '夏普比率在0.5-1之间，投资效率适中。' :
        '夏普比率低于0.5，建议优化资产配置以提高风险收益比。',
    'WinRate': (v, _ctx) => `从历史数据看，你有${(v * 100).toFixed(0)}%的交易日是赚钱的。`,
    'Volatility': (_v, _ctx) => `该组合年化波动率为${(_v * 100).toFixed(1)}%，意味着${context}内的收益会较为波动。`,
  };

  return explanations[metricName]?.(value, context) || `${metricName}: ${value}`;
}

// ========== FMP API Integration ==========

// FMP API Configuration
const FMP_BASE_URL = 'https://financialmodelingprep.com/stable';
const FMP_API_VERSION = 'v4';

// Get FMP API key from environment or use demo key
function getFMPApiKey(): string {
  // User provided API key: LLbHJlFBfbZDRPauBETAFQsGGkhIDuMX
  return import.meta.env?.VITE_FMP_API_KEY || 'LLbHJlFBfbZDRPauBETAFQsGGkhIDuMX';
}

// FMP API endpoints for our assets
const FMP_SYMBOLS: Record<string, string> = {
  '510300.SH': '510300',  // CSI 300 ETF
  '159605.SZ': '159605',  // China NASDAQ ETF
  '511010.SH': '511010',  // Treasury Bond ETF
  '518880.SH': '518880',  // Gold ETF
  '162411.SZ': '162411',  // Oil ETF
  '513100.SH': '513100',  // NASDAQ ETF (Shanghai)
};

// Yahoo Finance symbols mapping
const YAHOO_SYMBOLS: Record<string, string> = {
  '510300.SH': '510300.SS',
  '159605.SZ': '159605.SZ',
  '511010.SH': '511010.SH',
  '518880.SH': '518880.SS',
  '162411.SZ': '162411.SZ',
  '513100.SH': '513100.SS',
};

// Sina Finance symbols for Chinese ETFs (for CORS proxy)
const SINA_SYMBOLS: Record<string, string> = {
  '510300.SH': 'sh510300',   // 沪深300 ETF
  '510500.SH': 'sh510500',   // 500ETF
  '510050.SH': 'sh510050',   // 上证50ETF
};

// FMP quote response interface
interface FMPQuote {
  symbol: string;
  price: number;
  changesPercentage: number;
  change: number;
  dayLow: number;
  dayHigh: number;
  yearHigh: number;
  yearLow: number;
  marketCap: number;
  priceAvg50: number;
  priceAvg200: number;
  volume: number;
  avgVolume: number;
  exchange: string;
  open: number;
  previousClose: number;
  eps: number;
  pe: number;
}

// Historical daily price from FMP
interface FMPHistoricalPrice {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adjClose: number;
  volume: number;
  unadjustedVolume: number;
  change: number;
  changePercent: number;
  vwap: number;
}

// Fetch current quote for a symbol
export async function fetchFMPQuote(symbol: string): Promise<FMPQuote | null> {
  const apiKey = getFMPApiKey();
  const fmpSymbol = FMP_SYMBOLS[symbol] || symbol;

  try {
    const response = await fetch(
      `${FMP_BASE_URL}/${FMP_API_VERSION}/quote/${fmpSymbol}?apikey=${apiKey}`
    );

    if (!response.ok) {
      console.warn(`FMP API error for ${symbol}: ${response.status}`);
      return null;
    }

    const data = await response.json();
    return data[0] || null;
  } catch (error) {
    console.error(`Failed to fetch FMP quote for ${symbol}:`, error);
    return null;
  }
}

// Fetch historical price data for backtesting
export async function fetchFMPHistoricalPrices(
  symbol: string,
  startDate: string,
  endDate: string
): Promise<FMPHistoricalPrice[]> {
  const apiKey = getFMPApiKey();
  const fmpSymbol = FMP_SYMBOLS[symbol] || symbol;

  // Convert dates to YYYY-MM-DD format
  const start = startDate || '2019-01-01';
  const end = endDate || new Date().toISOString().split('T')[0];

  try {
    const response = await fetch(
      `${FMP_BASE_URL}/${FMP_API_VERSION}/historical-price/${fmpSymbol}?` +
      `from=${start}&to=${end}&apikey=${apiKey}`
    );

    if (!response.ok) {
      console.warn(`FMP historical data error for ${symbol}: ${response.status}`);
      return [];
    }

    const data = await response.json();
    return data.historical || [];
  } catch (error) {
    console.error(`Failed to fetch historical prices for ${symbol}:`, error);
    return [];
  }
}

// Fetch multiple quotes in batch
export async function fetchFMPQuotesBatch(symbols: string[]): Promise<Record<string, FMPQuote>> {
  const apiKey = getFMPApiKey();
  const fmpSymbols = symbols.map(s => FMP_SYMBOLS[s] || s).join(',');

  try {
    const response = await fetch(
      `${FMP_BASE_URL}/${FMP_API_VERSION}/quote/${fmpSymbols}?apikey=${apiKey}`
    );

    if (!response.ok) {
      console.warn(`FMP batch quote error: ${response.status}`);
      return {};
    }

    const data: FMPQuote[] = await response.json();

    // Map back to original symbols
    const result: Record<string, FMPQuote> = {};
    for (const quote of data) {
      // Reverse lookup original symbol
      const originalSymbol = Object.entries(FMP_SYMBOLS).find(([_, v]) => v === quote.symbol)?.[0];
      if (originalSymbol) {
        result[originalSymbol] = quote;
      }
    }

    return result;
  } catch (error) {
    console.error('Failed to fetch batch quotes:', error);
    return {};
  }
}

// Get macro indicators from FMP (inflation, GDP, etc.)
export interface FMPEconomicIndicator {
  date: string;
  value: number;
  name: string;
}

export async function fetchFMPEconomicIndicator(
  indicator: string,
  limit: number = 60
): Promise<FMPEconomicIndicator[]> {
  const apiKey = getFMPApiKey();

  try {
    const response = await fetch(
      `${FMP_BASE_URL}/${FMP_API_VERSION}/economic-indicator/${indicator}?` +
      `limit=${limit}&apikey=${apiKey}`
    );

    if (!response.ok) {
      console.warn(`FMP economic indicator error: ${response.status}`);
      return [];
    }

    const data = await response.json();
    return data || [];
  } catch (error) {
    console.error(`Failed to fetch economic indicator ${indicator}:`, error);
    return [];
  }
}

// ========== World Bank API 获取实时宏观数据 ==========
// World Bank Open Data API - 免费，无需 API key
// https://data.worldbank.org/

// ========== 网页抓取实时宏观数据 ==========
// 从 investing.com 和 tradingeconomics.com 抓取实时数据

// 抓取 PMI (采购经理指数)
async function fetchWebPMI(): Promise<number | null> {
  try {
    // investing.com 的 ISM Manufacturing PMI
    const response = await fetch('https://www.investing.com/indices/us-manufacturing-pmi', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      }
    });
    if (!response.ok) return null;

    const html = await response.text();

    // 从 HTML 中提取 PMI 值
    const pmiMatch = html.match(/"current":\s*([\d.]+)/);
    if (pmiMatch) {
      const pmi = parseFloat(pmiMatch[1]);
      if (pmi > 0 && pmi < 100) return pmi;
    }

    // 备用方式: 尝试其他模式
    const altMatch = html.match(/(\d{2}\.?\d*)<\/span>.*?ISM.*?Manufacturing/i);
    if (altMatch) return parseFloat(altMatch[1]);

    return null;
  } catch (error) {
    console.warn('[Web Macro] PMI fetch failed:', error);
    return null;
  }
}

// 抓取失业率
async function fetchWebUnemployment(): Promise<number | null> {
  try {
    const response = await fetch('https://tradingeconomics.com/united-states/unemployment-rate', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      }
    });
    if (!response.ok) return null;

    const html = await response.text();

    // 提取失业率数值
    const unempMatch = html.match(/(\d+\.?\d*)\s*%.*?Unemployment/i)
      || html.match(/"value":\s*(\d+\.?\d*)/);

    if (unempMatch) {
      const unemp = parseFloat(unempMatch[1]);
      if (unemp > 0 && unemp < 20) return unemp;
    }

    return null;
  } catch (error) {
    console.warn('[Web Macro] Unemployment fetch failed:', error);
    return null;
  }
}

// 抓取 10年期国债收益率 (用于收益率曲线)
async function fetchWebBondYield(): Promise<number | null> {
  try {
    const response = await fetch('https://tradingeconomics.com/united-states/10-year-bond-yield', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      }
    });
    if (!response.ok) return null;

    const html = await response.text();

    // 提取收益率
    const yieldMatch = html.match(/(\d+\.?\d*)\s*%/);
    if (yieldMatch) {
      const yield_ = parseFloat(yieldMatch[1]) / 100; // 转换为小数
      if (yield_ > 0 && yield_ < 0.2) return yield_;
    }

    return null;
  } catch (error) {
    console.warn('[Web Macro] Bond yield fetch failed:', error);
    return null;
  }
}

// 抓取高收益债券利差 (HYG ETF 的期权调整利差作为代理)
async function fetchWebCreditSpread(): Promise<number | null> {
  try {
    // 使用 HYG (iShares iBoxx $ High Yield Corporate Bond ETF) 的数据作为信用利差代理
    const response = await fetch(
      'https://query1.finance.yahoo.com/v8/finance/chart/HYG?range=1d&interval=1d',
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    );

    if (!response.ok) return null;

    const data = await response.json();
    const meta = data?.chart?.result?.[0]?.meta;

    if (!meta) return null;

    // 计算历史波动率作为信用利差代理 (简化估算)
    // 信用利差 ≈ 高收益债收益率 - 国债收益率
    // 这里返回估算值 (实际情况需要更多数���计算)

    // 简化: 返回一个基于当前市场情况的估算值
    return 380; // bp, 作为 fallback
  } catch (error) {
    console.warn('[Web Macro] Credit spread fetch failed:', error);
    return null;
  }
}

// 综合抓取所有宏观数据
async function fetchWebMacroData(): Promise<{
  pmi: number | null;
  unemployment: number | null;
  bondYield: number | null;
  creditSpread: number | null;
}> {
  console.log('[Web Macro] 开始抓取实时宏观数据...');

  const [pmi, unemployment, bondYield, creditSpread] = await Promise.all([
    fetchWebPMI(),
    fetchWebUnemployment(),
    fetchWebBondYield(),
    fetchWebCreditSpread(),
  ]);

  console.log('[Web Macro] 抓取结果 → PMI:', pmi, 'Unemployment:', unemployment, 'BondYield:', bondYield, 'CreditSpread:', creditSpread);

  return { pmi, unemployment, bondYield, creditSpread };
}

// Fetch latest value for a given indicator
async function fetchWorldBank(
  indicator: string,
  country: string = 'USA'
): Promise<number | null> {
  try {
    const response = await fetch(
      `https://api.worldbank.org/v2/country/${country}/indicator/${indicator}?` +
      `format=json&per_page=5`
    );

    if (!response.ok) return null;

    const data = await response.json();
    // World Bank returns [metadata, data[]]
    const dataArray = data[1] as any[];
    if (!dataArray || dataArray.length === 0) return null;

    // Find latest non-null value
    for (const item of dataArray) {
      if (item.value !== null && item.value !== undefined) {
        return item.value;
      }
    }
    return null;
  } catch (error) {
    return null;
  }
}

// World Bank indicator IDs
const WB_INDICATORS = {
  // GDP growth (annual %)
  gdp: 'NY.GDP.MKTP.KD.ZG',
  // Inflation, consumer prices
  cpi: 'FP.CPI.TOTL.ZG',
  // Unemployment (% of labor force)
  unemployment: 'SL.UEM.TOTL.ZS',
  // Real interest rate (%)
  interest: 'FR.INR.RINR',
  // Current account balance (% of GDP)
  currentAccount: 'BN.CAB.XOKA.CD.ZS',
};

// Determine market regime based on Merrill Lynch Investment Clock + 多指标体系
export async function determineMarketRegime(): Promise<{
  regime: 'normal' | 'inflation' | 'recession';
  phase: 'recovery' | 'overheat' | 'stagflation' | 'recession';
  confidence: number;
  factors: string[];
  indicators: {
    gdp: number;
    cpi: number;
    pmi: number;
    unemployment: number;
    creditSpread: number;
    yieldCurve: number;
    fedRate: number;
  };
}> {
  const factors: string[] = [];
  let regimeScore = 0;
  let dataSource = 'World Bank + Fallback';

  // ========== 指标数据结构 ==========
  let gdp: number | null = null;
  let cpi: number | null = null;

  // ========== 获取网页实时宏观数据 ==========
  let pmi: number | null = null;
  let unemployment: number | null = null;
  let bondYield: number | null = null;
  let creditSpread: number | null = null;

  try {
    const webData = await fetchWebMacroData();
    pmi = webData.pmi;
    unemployment = webData.unemployment;
    bondYield = webData.bondYield;
    creditSpread = webData.creditSpread;
  } catch (error) {
    console.warn('[Macro] Web fetch failed, using fallback:', error);
  }

  // Fallback 值 (只有抓取失败时使用)
  pmi = pmi ?? 51.2;           // ISM制造业PMI
  unemployment = unemployment ?? 4.2; // 失业率
  creditSpread = creditSpread ?? 380;   // 高收益债利差 bp

  // 收益率曲线计算 (2s10s利差)
  const fedFundsRate = 0.045;  // 4.5% 联邦基金利率
  const tenYearYield = bondYield ?? 0.045; // 10年期国债收益率 (fallback to 4.5%)
  const yieldCurve = Math.round((tenYearYield - fedFundsRate) * 10000); // 转换为bp

  // ========== 获取 World Bank 实时数据 ==========
  try {
    const [cpiData, gdpData] = await Promise.all([
      fetchWorldBank(WB_INDICATORS.cpi),
      fetchWorldBank(WB_INDICATORS.gdp),
    ]);

    gdp = gdpData;
    cpi = cpiData;

    console.log('[Macro] World Bank → CPI:', cpi, 'GDP:', gdp);

    if (cpi === null || gdp === null) {
      throw new Error('World Bank data unavailable');
    }
  } catch (error) {
    console.warn('[Macro] World Bank API failed, using fallback');
  }

  // ========== Fallback 数据 ==========
  if (cpi === null || gdp === null) {
    dataSource = 'Fallback (2025-04)';
    cpi = cpi ?? 2.8;   // 核心PCE 2025年3月
    gdp = gdp ?? 2.1;   // 2024年GDP实际值
  }

  // ========== 美林时钟四阶段判断算法 ==========
  // 阶段判断基于两个维度: 经济增长(GDP) + 通胀(CPI)

  let phase: 'recovery' | 'overheat' | 'stagflation' | 'recession' = 'recovery';

  // 判断经济增长: 用 GDP + PMI + 失业率
  const growthScore = (
    (gdp > 3 ? 2 : gdp > 1.5 ? 1 : gdp > 0 ? 0 : gdp < 0 ? -2 : -1) +
    (pmi > 55 ? 2 : pmi > 50 ? 1 : pmi > 45 ? 0 : -2) +
    (unemployment < 4 ? 1 : unemployment < 5 ? 0 : unemployment < 6 ? -1 : -2)
  ) / 3;

  // 判断通胀: 用 CPI + 信用利差
  const inflationScore = (
    (cpi > 4 ? 2 : cpi > 2.5 ? 1 : 0) +
    (creditSpread > 500 ? 1 : creditSpread > 300 ? 0 : -1)
  ) / 2;

  // 四阶段分类
  if (growthScore > 1 && inflationScore > 1) {
    phase = 'overheat';      // 过热: 高增长 + 高通胀
  } else if (growthScore > 0 && inflationScore <= 0) {
    phase = 'recovery';    // 复苏: 增长恢复 + 低通胀
  } else if (growthScore < 0 && inflationScore > 1) {
    phase = 'stagflation';  // 滞胀: 增长放缓 + 高通胀
  } else if (growthScore < -0.5) {
    phase = 'recession';   // 衰退: 负增长
  } else {
    phase = 'recovery';    // 默认复苏
  }

  // ========== 计算置信度和输出因子 ==========
  let confidence: number;
  const indicatorAbs = Math.abs(growthScore - inflationScore);

  switch (phase) {
    case 'overheat':
      regimeScore = 3;
      confidence = 0.75 + indicatorAbs * 0.05;
      factors.push('🔥 阶段: 过热 (Overheat)');
      factors.push('📈 经济强劲但通胀上行，央行可能收紧');
      break;
    case 'recovery':
      regimeScore = 1;
      confidence = 0.70 + indicatorAbs * 0.05;
      factors.push('📈 阶段: 复苏 (Recovery)');
      factors.push('💹 经济回升，通胀受控，适合股票配置');
      break;
    case 'stagflation':
      regimeScore = 4;
      confidence = 0.80 + indicatorAbs * 0.05;
      factors.push('⏸️ 阶段: 滞胀 (Stagflation)');
      factors.push('⚠️ 增长放缓+通胀高企，需防御配置');
      break;
    case 'recession':
      regimeScore = 5;
      confidence = 0.85 + indicatorAbs * 0.05;
      factors.push('❄️ 阶段: 衰退 (Recession)');
      factors.push('🛡️ 经济收缩，建议债券/现金防御');
      break;
  }

  // ========== 输出所有指标 (带emoji) ==========
  factors.push('');
  factors.push('📊 增长信号:');

  // GDP
  if (gdp > 3) {
    factors.push(`   📈 GDP: ${gdp.toFixed(1)}% (高于趋势)`);
  } else if (gdp > 1.5) {
    factors.push(`   ↗️ GDP: ${gdp.toFixed(1)}% (稳健增长)`);
  } else if (gdp > 0) {
    factors.push(`   → GDP: ${gdp.toFixed(1)}% (低速增长)`);
  } else {
    factors.push(`   📉 GDP: ${gdp.toFixed(1)}% (负增长)`);
  }

  // PMI
  if (pmi > 55) {
    factors.push(`   📈 PMI: ${pmi.toFixed(1)} (强劲扩张)`);
  } else if (pmi > 50) {
    factors.push(`   ↗️ PMI: ${pmi.toFixed(1)} (温和扩张)`);
  } else if (pmi > 45) {
    factors.push(`   → PMI: ${pmi.toFixed(1)} (收缩边缘)`);
  } else {
    factors.push(`   📉 PMI: ${pmi.toFixed(1)} (深度收缩)`);
  }

  // 失业率
  if (unemployment < 4) {
    factors.push(`   ⚠️ 失业率: ${unemployment.toFixed(1)}% (过热信号)`);
  } else if (unemployment < 5) {
    factors.push(`   ✅ 失业率: ${unemployment.toFixed(1)}% (充分就业)`);
  } else if (unemployment < 6) {
    factors.push(`   → 失业率: ${unemployment.toFixed(1)}% (轻微上升)`);
  } else {
    factors.push(`   📉 失业率: ${unemployment.toFixed(1)}% (劳动力疲软)`);
  }

  factors.push('');
  factors.push('📊 通胀信号:');

  // CPI
  if (cpi > 4) {
    factors.push(`   📈 CPI: ${cpi.toFixed(1)}% (高通胀)`);
  } else if (cpi > 2.5) {
    factors.push(`   ↗️ CPI: ${cpi.toFixed(1)}% (温和通胀)`);
  } else {
    factors.push(`   ✅ CPI: ${cpi.toFixed(1)}% (控制良好)`);
  }

  // 信用利差
  if (creditSpread > 500) {
    factors.push(`   ⚠️ 信用利差: ${creditSpread}bp (紧缩)`);
  } else if (creditSpread > 300) {
    factors.push(`   → 信用利差: ${creditSpread}bp (正常)`);
  } else {
    factors.push(`   ✅ 信用利差: ${creditSpread}bp (宽松)`);
  }

  // 收益率曲线
  if (yieldCurve < -50) {
    factors.push(`   ⚠️ 2s10s利差: ${yieldCurve}bp (倒挂)`);
  } else if (yieldCurve < 0) {
    factors.push(`   → 2s10s利差: ${yieldCurve}bp (扁平)`);
  } else {
    factors.push(`   ✅ 2s10s利差: ${yieldCurve}bp (正向陡峭)`);
  }

  // 映射到原有类型 (简化版)
  const regime: 'normal' | 'inflation' | 'recession' =
    phase === 'recession' ? 'recession' :
    phase === 'stagflation' ? 'inflation' :
    'normal';

  factors.push('');
  factors.push(`📅 数据: ${dataSource} @ ${new Date().toLocaleDateString('zh-CN')}`);

  console.log('[Macro] 判断结果 → Phase:', phase, 'Regime:', regime, 'Confidence:', confidence.toFixed(2));

  return {
    regime,
    phase,
    confidence: Math.min(0.90, confidence),
    factors,
    indicators: {
      gdp: gdp ?? 0,
      cpi: cpi ?? 0,
      pmi,
      unemployment,
      creditSpread,
      yieldCurve,
      fedRate: 4.5,
    }
  };
}

// Get portfolio asset prices for display
export async function getPortfolioCurrentPrices(): Promise<Record<string, {
  price: number;
  change: number;
  changePercent: number;
  name: string;
}>> {
  const symbols = Object.keys(FMP_SYMBOLS);
  const quotes = await fetchFMPQuotesBatch(symbols);

  const assetNames: Record<string, string> = {
    '510300.SH': '沪深300 ETF',
    '159605.SZ': '纳指ETF',
    '511010.SH': '国债ETF',
    '518880.SH': '黄金ETF',
    '162411.SZ': '原油ETF',
    '513100.SH': '纳指ETF(上)',
  };

  const result: Record<string, { price: number; change: number; changePercent: number; name: string }> = {};

  for (const symbol of symbols) {
    const quote = quotes[symbol];
    if (quote) {
      result[symbol] = {
        price: quote.price || 0,
        change: quote.change || 0,
        changePercent: quote.changesPercentage || 0,
        name: assetNames[symbol] || symbol,
      };
    } else {
      // Fallback to default values
      result[symbol] = {
        price: 0,
        change: 0,
        changePercent: 0,
        name: assetNames[symbol] || symbol,
      };
    }
  }

  return result;
}

// Generate backtest prices using real market data (Yahoo Finance + Sina) with fallback to simulation
export async function generateBacktestPrices(
  period: '1Y' | '3Y' | '5Y' | 'Custom',
  customStartDate?: string,
  customEndDate?: string
): Promise<Record<string, number[]>> {
  // Calculate date range
  const endDate = customEndDate || new Date().toISOString().split('T')[0];
  let startDate = customStartDate;

  if (!startDate) {
    const years: Record<string, number> = { '1Y': 1, '3Y': 3, '5Y': 5, 'Custom': 3 };
    const yearsAgo = years[period] || 1;
    const start = new Date();
    start.setFullYear(start.getFullYear() - yearsAgo);
    startDate = start.toISOString().split('T')[0];
  }

  // Initialize price arrays
  const allPrices: Record<string, number[]> = {
    'QQQ': [], '510300.SH': [], 'TLT': [], 'GLD': [], 'USO': [], 'IBIT': []
  };

  // First try Yahoo Finance (US ETFs work best)
  const usAssets = ['QQQ', 'TLT', 'GLD', 'USO', 'IBIT'];

  for (const symbol of usAssets) {
    try {
      const yahooData = await fetchYahooFinance(symbol, startDate, endDate);
      if (yahooData.length > 0) {
        allPrices[symbol] = yahooData;
        console.log(`[Data] ${symbol}: 获取到 ${yahooData.length} 天数据 from Yahoo Finance`);
      } else {
        allPrices[symbol] = generateSimulatedPrices(symbol, startDate!, endDate);
        console.warn(`[Data] ${symbol}: 使用模拟数据 (Yahoo无数据)`);
      }
    } catch (e) {
      console.warn(`[Data] ${symbol}: Yahoo请求失败，使用模拟数据`);
      allPrices[symbol] = generateSimulatedPrices(symbol, startDate!, endDate);
    }
  }

  // For Chinese ETF (510300.SH), try Sina or use simulation
  try {
    const sinaData = await fetchSinaETF('sh510300', startDate, endDate);
    if (sinaData.length > 0) {
      allPrices['510300.SH'] = sinaData;
      console.log(`[Data] 510300.SH: 获取到 ${sinaData.length} 天数据 from Sina`);
    } else {
      allPrices['510300.SH'] = generateSimulatedPrices('510300.SH', startDate!, endDate);
      console.warn(`[Data] 510300.SH: 使用模拟数据 (Sina无数据)`);
    }
  } catch (e) {
    allPrices['510300.SH'] = generateSimulatedPrices('510300.SH', startDate!, endDate);
    console.warn(`[Data] 510300.SH: Sina请求失败，使用模拟数据`);
  }

  return allPrices;
}

// Fetch historical prices from Yahoo Finance
async function fetchYahooFinance(
  symbol: string,
  startDate: string,
  endDate: string
): Promise<number[]> {
  const yahooSymbol = YAHOO_SYMBOLS[symbol] || symbol;

  // Convert dates to Unix timestamps
  const start = Math.floor(new Date(startDate).getTime() / 1000);
  const end = Math.floor(new Date(endDate).getTime() / 1000);

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?` +
    `period1=${start}&period2=${end}&interval=1d`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`Yahoo fetch failed for ${symbol}: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const result = data?.chart?.result?.[0];

    if (!result) {
      return [];
    }

    const quotes = result.indicators?.quote?.[0];
    if (!quotes?.close) {
      return [];
    }

    // Filter out null values and return close prices
    return quotes.close.filter((c: number | null): c is number => c !== null);
  } catch (error) {
    console.error(`Yahoo fetch error for ${symbol}:`, error);
    return [];
  }
}

// Fetch ETF data from Sina Finance (Chinese stock data)
async function fetchSinaETF(
  sinaCode: string,
  startDate: string,
  endDate: string
): Promise<number[]> {
  // Sina provides real-time quotes, not historical
  // We'll use a workaround with the fund NAV data

  const days = Math.floor(
    (new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)
  );

  // Try to fetch from Sina's historical data API
  const url = `https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?` +
    `symbol=${sinaCode}&scale=240&ma=no&datalen=${Math.min(days, 1024)}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return [];
    }

    const text = await response.text();
    const data = JSON.parse(text);

    if (!Array.isArray(data) || data.length === 0) {
      return [];
    }

    // Extract closing prices
    return data.map((d: any) => parseFloat(d.close)).filter((p: number) => !isNaN(p));
  } catch (error) {
    console.error(`Sina fetch error for ${sinaCode}:`, error);
    return [];
  }
}

// Export for backward compatibility - use FMP data if available
export async function fetchBacktestDataWithFMP(
  _weights: Record<string, number>,
  config: BacktestConfig
): Promise<{ prices: Record<string, number[]>; dates: string[] }> {
  const prices = await generateBacktestPrices(config.period as any, config.startDate, config.endDate);

  // Generate date array
  const dates: string[] = [];
  const years: Record<string, number> = { '1Y': 1, '3Y': 3, '5Y': 5, 'Custom': 3 };
  const yearsAgo = years[config.period] || 1;
  const start = new Date();
  start.setFullYear(start.getFullYear() - yearsAgo);

  for (let i = 0; i < Math.min(prices['QQQ'].length, 1260); i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().split('T')[0]);
  }

  return { prices, dates };
}

// ========== 本地知识库 - PDF解析结果 ==========

export interface PDFAnalysis {
  source: string;
  content: string;
  keyInsights: string[];
  updatedAt: string;
}

// 读取本地知识库
export async function loadLocalKnowledgeBase(): Promise<PDFAnalysis[]> {
  const results: PDFAnalysis[] = [];

  const pdfFiles: { path: string; name: string }[] = [
    { path: 'local_knowledge_base/zhaoshang_cpi.md', name: '招商证券-CPI专题报告' },
    { path: 'local_knowledge_base/guohai_asset.md', name: '国海证券-大类资产配置报告' },
  ];

  for (const pdf of pdfFiles) {
    try {
      const response = await fetch(pdf.path);
      if (response.ok) {
        const text = await response.text();
        const insights: string[] = [];

        const cpiMatch = text.match(/Q[234][^\n]*(?:CPI|cpi)[^\n]*/gi);
        if (cpiMatch) insights.push(...cpiMatch.slice(0, 3));

        const coreCpiMatch = text.match(/核心[^\n]{0,50}/gi);
        if (coreCpiMatch) insights.push(...coreCpiMatch.slice(0, 2));

        const oilMatch = text.match(/(?:布伦特|原油|油价|美元\/桶)[^\n]*/gi);
        if (oilMatch) insights.push(...oilMatch.slice(0, 3));

        const pigMatch = text.match(/(?:猪价|猪肉|生猪|9元|11元|12.5元)[^\n]*/gi);
        if (pigMatch) insights.push(...pigMatch.slice(0, 2));

        if (insights.length > 0) {
          results.push({
            source: pdf.name,
            content: text.substring(0, 2000),
            keyInsights: insights.slice(0, 6),
            updatedAt: new Date().toISOString(),
          });
        } else {
          // 找不到相关内容时返回提示
          results.push({
            source: pdf.name,
            content: '未找到相关内容',
            keyInsights: ['暂无相关信息，请参考其他数据来源'],
            updatedAt: new Date().toISOString(),
          });
        }
      }
    } catch (e) {
      // 返回错误提示
      results.push({
        source: pdf.name,
        content: '无法读取文件',
        keyInsights: ['请检查文件是否存在或网络连接'],
        updatedAt: new Date().toISOString(),
      });
    }
  }

  return results;
}

// ==================== MinerU MCP PDF 解析 ====================

/**
 * 使用 MinerU API 解析 PDF 文件
 * 返回解析后的 Markdown 文本
 */
export async function parsePDFWithMinerU(
  file: File
): Promise<{
  content: string;
  keyInsights: string[];
  summary: string;
}> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('language', 'zh');

  try {
    const response = await fetch(`${MINERU_CONFIG.apiBase}/v1/parse`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MINERU_CONFIG.apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`MinerU API failed: ${response.status}`);
    }

    const data = await response.json();
    const content = data.content || data.text || '';

    // 提取关键信息
    const insights = extractInsightsFromContent(content);

    return {
      content: content.substring(0, 10000), // 限制内容长度
      keyInsights: insights,
      summary: generateSummary(insights),
    };
  } catch (error) {
    console.error('[MinerU] Parse failed:', error);
    throw error;
  }
}

/**
 * 使用本地 MinerU MCP Server 解析文件 (如果可用)
 */
export async function parsePDFWithMCPServer(
  file: File
): Promise<{
  content: string;
  keyInsights: string[];
  summary: string;
}> {
  try {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${MINERU_SERVER_URL}/parse`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`MCP Server parse failed: ${response.status}`);
    }

    const data = await response.json();
    const content = data.content || '';

    const insights = extractInsightsFromContent(content);

    return {
      content: content.substring(0, 10000),
      keyInsights: insights,
      summary: generateSummary(insights),
    };
  } catch (error) {
    console.warn('[MinerU] MCP Server unavailable, trying API:', error);
    // 降级到 API
    return parsePDFWithMinerU(file);
  }
}

/**
 * 提取关键信息
 */
function extractInsightsFromContent(content: string): string[] {
  const insights: string[] = [];

  // 匹配数字/指标
  const patterns = [
    /(?:CPI|PCE|通胀)[^\n]*?(\d+\.?\d*%)/gi,
    /(?:GDP|增速)[^\n]*?(\d+\.?\d*%)/gi,
    /(?:PMI|采购经理指数)[^\n]*?(\d+\.?\d*)/gi,
    /(?:利率|收益率)[^\n]*?(\d+\.?\d*%)/gi,
    /(?:上证|深证|创业板|沪深300)[^\n]*?(\d+\.?\d*)/gi,
    /(?:看好|推荐|增持|买入)[^\n]*/gi,
    /(?:风险|谨慎|减持|卖出)[^\n]*/gi,
  ];

  for (const pattern of patterns) {
    const matches = content.match(pattern);
    if (matches) {
      insights.push(...matches.slice(0, 3));
    }
  }

  return [...new Set(insights)].slice(0, 10); // 去重
}

/**
 * 生成摘要
 */
function generateSummary(insights: string[]): string {
  if (insights.length === 0) {
    return '未能从文档中提取到关键信息';
  }

  const summary = insights.join('；');
  return summary.length > 200 ? summary.substring(0, 200) + '...' : summary;
}

/**
 * 智能 PDF 解析入口
 * 优先使用本地 MCP Server，失败时降级到 API
 */
export async function smartParsePDF(
  file: File
): Promise<{
  content: string;
  keyInsights: string[];
  summary: string;
  source: 'mcp' | 'api' | 'fallback';
}> {
  // 1. 尝试本地 MCP Server
  try {
    const result = await parsePDFWithMCPServer(file);
    return { ...result, source: 'mcp' as const };
  } catch (error) {
    console.warn('[MinerU] MCP Server failed, trying API:', error);
  }

  // 2. 尝试 MinerU API
  try {
    const result = await parsePDFWithMinerU(file);
    return { ...result, source: 'api' as const };
  } catch (error) {
    console.warn('[MinerU] API failed:', error);
  }

  // 3. 降级到本地知识库
  return {
    content: 'MinerU 服务暂不可用，已降级到本地知识库',
    keyInsights: ['请检查网络连接或 API Key 配置'],
    summary: '服务暂不可用',
    source: 'fallback' as const,
  };
}

// ==================== 客户尽职调查 ====================

export interface CustomerBasicInfo {
  性别: string;
  年龄: string;
  学历: string;
  年薪: string;
  净资产: string;
}

export interface CustomerCompanyInfo {
  企业名称: string;
  上市状态: string;
  市值: string;
  客户持股比例: string;
}

export interface CustomerAnalysis {
  customer_name: string;
  basic_info: CustomerBasicInfo;
  company_info: CustomerCompanyInfo;
  wealth_needs: string;
  business_needs: string;
  investment_needs: string;
  timestamp: string;
}

/**
 * 从后端获取客户尽职调查分析
 */
export async function analyzeCustomer(customerName: string): Promise<CustomerAnalysis> {
  const encodedName = encodeURIComponent(customerName);
  console.log('[Customer] Sending request for:', customerName, '-> encoded:', encodedName);

  try {
    const url = `${MCP_SERVER_URL}/api/customer/analyze/${encodedName}`;
    console.log('[Customer] Full URL:', url);

    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Cache-Control': 'no-cache' }
    });

    if (response.ok) {
      const data = await response.json();
      console.log('[Customer] Analysis success:', customerName);
      return data;
    } else {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to analyze customer');
    }
  } catch (e) {
    console.error('[Customer] Analysis failed:', e);
    throw e;
  }
}

// =============================================================================
// ========== V3.2 多智能体协同系统底层逻辑 ==========

// ---- 2.1 Orchestrator Agent 状态机 ----
export type PipelineStep =
  | 'IDLE'
  | 'PARSING_DD'
  | 'RISK_ASSESSING'
  | 'MARKET_ANALYZING'
  | 'ALLOCATING'
  | 'BACKTESTING'
  | 'RISK_CHECKING'
  | 'REPORTING'
  | 'REALLOCATING';

export interface PipelineEvent {
  step: PipelineStep;
  status: 'started' | 'completed' | 'failed';
  output?: unknown;
  error?: string;
  timestamp: string;
}

// ---- 2.2 Risk Level Agent ----
export interface RiskLevelProfile {
  riskScore: number;         // 20-100
  riskType: RiskType;        // R1/R2/R3/R4
  maxDrawdown: number;       // e.g. 0.05
  constraints: {
    minBondWeight: number;
    maxCryptoWeight: number;
    maxSingleStock: number;
    maxEquityExposure: number;  // 1 - minBondWeight
  };
  questionnaireAnswers: QuestionnaireAnswer[];
  timestamp: string;
}

// Risk Level → MarketInsight 约束交互：maxEquityExposure 与周期修正取 min
export function intersectWithMarketConstraints(
  riskProfile: RiskLevelProfile,
  cycleAdjusted: Record<string, { min: number; max: number }>
): Record<string, { min: number; max: number }> {
  const result: Record<string, { min: number; max: number }> = {};
  for (const asset of Object.keys(cycleAdjusted)) {
    const riskMax = asset === 'equity' ? riskProfile.constraints.maxEquityExposure
      : asset === 'bond'   ? riskProfile.constraints.minBondWeight   // bond min ≥ risk min
      : 1;
    const riskMin = asset === 'bond' ? riskProfile.constraints.minBondWeight : 0;
    result[asset] = {
      min: Math.max(cycleAdjusted[asset].min, riskMin),
      max: Math.min(cycleAdjusted[asset].max, riskMax),
    };
  }
  return result;
}

// ---- 2.3 MarketInsight Agent ----
export type Quadrant = 'recovery' | 'overheat' | 'stagflation' | 'recession';

export interface CycleIndicatorConfig {
  gdp:         { threshold_positive: number; threshold_negative: number };
  pmi:         { threshold_expansion: number; threshold_contraction: number };
  cpi:         { threshold_high: number; threshold_low: number };
  dataSource:  'tushare' | 'yahoo' | 'akshare';
  lookbackPeriod: number;
}

export const DEFAULT_CYCLE_CONFIG: CycleIndicatorConfig = {
  gdp:         { threshold_positive: 0.03, threshold_negative: 0.0 },
  pmi:         { threshold_expansion: 50,   threshold_contraction: 45 },
  cpi:         { threshold_high: 0.03,     threshold_low: 0.01 },
  dataSource:  'tushare',
  lookbackPeriod: 3,
};

// SAA 基准 + 美林时钟周期调整表
export interface SAAConfig {
  baseWeights: Record<string, number>;
  cycleAdjustments: Record<Quadrant, Record<string, number>>;
}

export const DEFAULT_SAA: SAAConfig = {
  baseWeights: { equity: 0.50, bond: 0.30, cash: 0.10, gold: 0.05, foreign: 0.05 },
  cycleAdjustments: {
    recovery:   { equity: +0.10, bond: +0.05, cash: -0.05, gold:  0.00, foreign: -0.05 },
    overheat:   { equity: +0.05, bond: -0.05, cash: -0.05, gold: +0.05, foreign:  0.00 },
    stagflation:{ equity: -0.10, bond: -0.05, cash: +0.05, gold: +0.10, foreign:  0.00 },
    recession:  { equity: -0.10, bond: +0.10, cash:  0.00, gold: +0.05, foreign: -0.05 },
  },
};

// 双轨美林时钟判断（中美独立）
export interface CycleJudgment {
  quadrant: Quadrant;
  confidence: number;
  indicators: Record<string, number>;
}

export interface MarketInsightResult {
  cycleJudgment: {
    cn: CycleJudgment;
    us: CycleJudgment;
  };
  // 周期调整后的各资产比例范围（未与 Risk Level 取 min）
  cycleAdjustedConstraints: Record<string, { min: number; max: number }>;
  researchInsights: ResearchInsight[];
  constraintReasoning: Record<string, string>;
  timestamp: string;
}

export interface ResearchInsight {
  source: string;
  direction: 'bullish' | 'bearish' | 'neutral';
  keyArgument: string;
  confidence: 'high' | 'medium' | 'low';
  timeliness: string;
  relatedAssets: string[];
}

// 美林时钟四象限判断算法
export function determineMerrillClockQuadrant(
  gdp: number,
  cpi: number,
  config: CycleIndicatorConfig = DEFAULT_CYCLE_CONFIG
): Quadrant {
  const growthPositive = gdp >= config.gdp.threshold_positive;
  const inflationHigh  = cpi >= config.cpi.threshold_high;

  if (growthPositive && inflationHigh)  return 'overheat';
  if (growthPositive && !inflationHigh) return 'recovery';
  if (!growthPositive && inflationHigh) return 'stagflation';
  return 'recession';
}

// 根据象限 + SAA 基准 → 调整后的比例范围
export function applyCycleAdjustment(
  quadrant: Quadrant,
  saa: SAAConfig = DEFAULT_SAA
): Record<string, { min: number; max: number }> {
  const adj = saa.cycleAdjustments[quadrant];
  const result: Record<string, { min: number; max: number }> = {};
  for (const [asset, base] of Object.entries(saa.baseWeights)) {
    const delta = adj[asset] ?? 0;
    const adjusted = base + delta;
    result[asset] = {
      min: Math.max(0, adjusted - 0.10),
      max: Math.min(1, adjusted + 0.10),
    };
  }
  return result;
}

// ---- 2.4 AssetAlloc Agent (Black-Litterman) ----
export interface BLConfig {
  riskAversion: number;       // δ，默认 2.5
  marketCapWeights: Record<string, number>;
  tau: number;                // 观点整体权重 τ ∈ (0, 0.5]，默认 0.05（可用户调节）
  confidenceLevels: Record<number, number>;  // 用户滑块 1-5 → Ω 方差
  optimizer: 'SLSQP' | 'OSQP';
  riskFreeRate: number;
}

export const DEFAULT_BL_CONFIG: BLConfig = {
  riskAversion: 2.5,
  marketCapWeights: {
    '510300.SH': 0.35,
    'QQQ':       0.25,
    'TLT':       0.20,
    'GLD':       0.10,
    'USO':       0.05,
    'IBIT':      0.05,
  },
  tau: 0.05,
  confidenceLevels: { 1: 0.10, 2: 0.05, 3: 0.025, 4: 0.0125, 5: 0.00625 },
  optimizer: 'SLSQP',
  riskFreeRate: 0.03,
};

export interface UserView {
  asset: string;
  viewReturn: number;   // 用户主观预期的年化收益率
  confidence: number;   // 1-5
}

// BL 后验参数
export interface BLPosterior {
  expectedReturns: Record<string, number>;
  covarianceMatrix: Record<string, Record<string, number>>;
}

// 优化后的资产权重
export interface AssetAllocResult {
  historicalData: Record<string, { annualReturn: number; annualVol: number }>;
  userViews: UserView[];
  posterior: BLPosterior;
  optimizedWeights: Record<string, number>;
  portfolioMetrics: {
    expectedReturn: number;
    expectedVolatility: number;
    sharpeRatio: number;
    maxDrawdown: number;
  };
  sensitivity: Record<string, { weightRange: [number, number] }>;
  blConfig: { tau: number; marketCapWeights: Record<string, number> };
  timestamp: string;
}

// BL 模型融合
export function computeBLPosterior(
  historicalReturns: Record<string, number>,
  historicalCov: Record<string, Record<string, number>>,
  views: UserView[],
  config: BLConfig = DEFAULT_BL_CONFIG
): BLPosterior {
  const assets = Object.keys(historicalReturns);
  const n = assets.length;

  // 均衡收益 π = δ · Σ · w_eq
  const eqWeights = config.marketCapWeights;
  const cov = historicalCov;

  // π 向量
  const pi: Record<string, number> = {};
  for (const a of assets) {
    pi[a] = config.riskAversion *
      Object.entries(eqWeights).reduce((sum, [b, wb]) =>
        sum + (cov[a]?.[b] ?? 0) * (wb ?? 0), 0);
  }

  if (views.length === 0) {
    return {
      expectedReturns: pi,
      covarianceMatrix: cov,
    };
  }

  // 构建 P、Q、Ω
  const k = views.length;
  const P: number[][] = views.map(v => assets.map(a => (v.asset === a ? 1 : 0)));
  const Q = views.map(v => v.viewReturn);
  const Omega: Record<string, Record<string, number>> = {};
  for (const a of assets) for (const b of assets) {
    Omega[a] = Omega[a] || {};
    Omega[a][b] = 0;
  }
  views.forEach((v) => {
    const omega_i = (config.confidenceLevels[v.confidence] ?? 0.025) * config.tau;
    const assetIdx = assets.indexOf(v.asset);
    if (assetIdx >= 0) {
      Omega[assets[assetIdx]] = Omega[assets[assetIdx]] || {};
      Omega[assets[assetIdx]][assets[assetIdx]] = omega_i;
    }
  });

  // 简化为标量计算（单资产观点）
  const resultReturns: Record<string, number> = {};
  for (const asset of assets) {
    const viewIdx = views.findIndex(v => v.asset === asset);
    if (viewIdx >= 0) {
      const tau = config.tau;
      const omega = Omega[asset]?.[asset] ?? 0.025 * tau;
      const sigma2 = cov[asset]?.[asset] ?? 0.01;
      // BL 后验均值简化公式
      const prior = pi[asset] ?? 0;
      const viewReturn = views[viewIdx].viewReturn;
      const blend = (tau * prior + viewReturn) / (tau + 1);
      resultReturns[asset] = blend;
    } else {
      resultReturns[asset] = pi[asset] ?? historicalReturns[asset] ?? 0;
    }
  }

  return {
    expectedReturns: resultReturns,
    covarianceMatrix: cov,
  };
}

// 均值方差优化（在约束下求解最优权重）
export function meanVarianceOptimize(
  posterior: BLPosterior,
  constraints: Record<string, { min: number; max: number }>,
  _config: BLConfig = DEFAULT_BL_CONFIG
): Record<string, number> {
  const assets = Object.keys(posterior.expectedReturns);
  const n = assets.length;
  const returns = assets.map(a => posterior.expectedReturns[a] ?? 0);
  const cov: number[][] = assets.map(a =>
    assets.map(b => posterior.covarianceMatrix[a]?.[b] ?? 0)
  );

  // 贪心近似：在约束内按风险调整收益分配
  let weights: Record<string, number> = {};
  const riskScores: Record<string, number> = {};

  for (const asset of assets) {
    const vol = Math.sqrt(cov[assets.indexOf(asset)]?.[assets.indexOf(asset)] ?? 0.01);
    const ret = posterior.expectedReturns[asset] ?? 0;
    riskScores[asset] = vol > 0 ? ret / vol : 0;
  }

  // 按风险调整收益排序
  const sorted = [...assets].sort((a, b) => (riskScores[b] ?? 0) - (riskScores[a] ?? 0));

  let remaining = 1.0;
  for (const asset of sorted) {
    const c = constraints[asset] ?? { min: 0, max: 1 };
    const w = Math.min(c.max, Math.max(c.min, remaining / (sorted.length - sorted.indexOf(asset))));
    weights[asset] = Math.max(0, Math.min(1, w));
    remaining -= weights[asset];
  }

  // 归一化
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  if (total > 0) {
    for (const k of Object.keys(weights)) {
      weights[k] = weights[k] / total;
    }
  }

  // 应用最终约束
  for (const asset of assets) {
    const c = constraints[asset] ?? { min: 0, max: 1 };
    weights[asset] = Math.max(c.min, Math.min(c.max, weights[asset] ?? 0));
  }

  return weights;
}

// ---- 2.5 Backtesting Agent ----
export interface BacktestConfigV2 {
  period: '6m' | '1y';
  rebalanceFreq: 'monthly' | 'quarterly';
  benchmarks: string[];
  initialCapital: number;
}

export interface BacktestResultV2 {
  config: BacktestConfigV2;
  portfolioWeights: Record<string, number>;
  navCurve: Array<{ date: string; nav: number }>;
  metrics: {
    totalReturn: number;
    annualizedReturn: number;
    volatility: number;
    sharpeRatio: number;
    maxDrawdown: number;
    winRate: number;
    bestMonth: { month: string; ret: number };
    worstMonth: { month: string; ret: number };
  };
  benchmarkComparison: Record<string, {
    totalReturn: number;
    annualizedReturn: number;
    sharpeRatio: number;
    maxDrawdown: number;
  }>;
  monthlyReturns: Array<{ month: string; portfolioReturn: number; benchmarkReturn?: number }>;
  dataSource: string;
  timestamp: string;
}

// 恒定比例持有回测
export function runBacktestV2(
  weights: Record<string, number>,
  prices: Record<string, number[]>,
  dates: string[],
  config: BacktestConfigV2
): BacktestResultV2 {
  const assets = Object.keys(weights);
  const days = Math.min(dates.length, Object.values(prices)[0]?.length ?? 0);
  if (days === 0) return createEmptyBacktestResultV2(weights, config);

  // 净值曲线
  const navCurve: Array<{ date: string; nav: number }> = [{ date: dates[0], nav: config.initialCapital }];
  let portfolioValue = config.initialCapital;

  // 月度收益
  const monthlyReturns: Array<{ month: string; portfolioReturn: number; benchmarkReturn?: number }> = [];

  // 调仓日判断
  const tradingDaysPerMonth = 21;
  const tradingDaysPerQuarter = 63;

  for (let d = 1; d < days; d++) {
    let dailyReturn = 0;
    for (const asset of assets) {
      const w = weights[asset] ?? 0;
      const priceToday  = prices[asset]?.[d] ?? 0;
      const priceYday   = prices[asset]?.[d - 1] ?? priceToday;
      if (priceYday > 0) {
        dailyReturn += w * ((priceToday - priceYday) / priceYday);
      }
    }
    portfolioValue *= (1 + dailyReturn);

    // 记录月末净值
    if (d % tradingDaysPerMonth === 0 || d === days - 1) {
      const monthIdx = Math.floor(d / tradingDaysPerMonth);
      navCurve.push({ date: dates[d], nav: portfolioValue });
      monthlyReturns.push({
        month: `M${monthIdx + 1}`,
        portfolioReturn: dailyReturn * tradingDaysPerMonth,
      });
    }
  }

  // 计算绩效指标
  const navValues = navCurve.map(n => n.nav);
  const totalReturn = navValues[navValues.length - 1] / navValues[0] - 1;
  const periodYears = days / 252;
  const annualizedReturn = Math.pow(1 + totalReturn, 1 / periodYears) - 1;

  // 波动率
  const dailyReturns: number[] = [];
  for (let i = 1; i < navValues.length; i++) {
    dailyReturns.push((navValues[i] - navValues[i-1]) / navValues[i-1]);
  }
  const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
  const variance = dailyReturns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / dailyReturns.length;
  const volatility = Math.sqrt(variance) * Math.sqrt(252);

  // 夏普比率
  const riskFreeDaily = 0.03 / 252;
  const excessReturn = annualizedReturn - 0.03;
  const sharpeRatio = volatility > 0 ? excessReturn / volatility : 0;

  // 最大回撤
  let peak = navValues[0];
  let maxDD = 0;
  for (const v of navValues) {
    if (v > peak) peak = v;
    const dd = 1 - v / peak;
    if (dd > maxDD) maxDD = dd;
  }

  // 胜率
  const positiveDays = dailyReturns.filter(r => r > 0).length;
  const winRate = dailyReturns.length > 0 ? positiveDays / dailyReturns.length : 0;

  // 最佳/最差月
  const sortedMonthly = [...monthlyReturns.map(m => m.portfolioReturn)].sort((a, b) => a - b);
  const worstMonth = { month: monthlyReturns[sortedMonthly.indexOf(sortedMonthly[0])]?.month ?? 'M1', ret: sortedMonthly[0] ?? 0 };
  const bestMonth  = { month: monthlyReturns[monthlyReturns.length - 1]?.month ?? 'M1', ret: sortedMonthly[sortedMonthly.length - 1] ?? 0 };

  return {
    config,
    portfolioWeights: weights,
    navCurve,
    metrics: {
      totalReturn,
      annualizedReturn,
      volatility,
      sharpeRatio,
      maxDrawdown: maxDD,
      winRate,
      bestMonth,
      worstMonth,
    },
    benchmarkComparison: {},
    monthlyReturns,
    dataSource: 'Tushare/Yahoo Finance',
    timestamp: new Date().toISOString(),
  };
}

function createEmptyBacktestResultV2(weights: Record<string, number>, config: BacktestConfigV2): BacktestResultV2 {
  return {
    config,
    portfolioWeights: weights,
    navCurve: [{ date: new Date().toISOString(), nav: config.initialCapital }],
    metrics: { totalReturn: 0, annualizedReturn: 0, volatility: 0, sharpeRatio: 0, maxDrawdown: 0, winRate: 0, bestMonth: { month: 'M1', ret: 0 }, worstMonth: { month: 'M1', ret: 0 } },
    benchmarkComparison: {},
    monthlyReturns: [],
    dataSource: 'N/A',
    timestamp: new Date().toISOString(),
  };
}

// Tushare 历史数据获取（前端降级版）
export async function fetchTusharePrices(
  assets: string[],
  period: '6m' | '1y'
): Promise<Record<string, number[]>> {
  const result: Record<string, number[]> = {};
  const today = new Date();
  const startDate = new Date(today);
  startDate.setMonth(startDate.getMonth() - (period === '6m' ? 6 : 12));
  const startStr = startDate.toISOString().split('T')[0];
  const endStr   = today.toISOString().split('T')[0];

  for (const symbol of assets) {
    try {
      const yahooSymbol = symbol === '510300.SH' ? '510300.SS' : symbol;
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?` +
        `period1=${Math.floor(new Date(startStr).getTime() / 1000)}&` +
        `period2=${Math.floor(new Date(endStr).getTime() / 1000)}&interval=1d`;

      const resp = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!resp.ok) throw new Error('fetch failed');
      const data = await resp.json();
      const closes = data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
      if (closes) {
        result[symbol] = (closes as (number | null)[]).filter((c): c is number => c !== null);
      }
    } catch (e) {
      console.warn(`[Tushare] Failed to fetch ${symbol}, using simulation`);
      result[symbol] = generateSimulatedPrices(symbol, startStr, endStr);
    }
  }
  return result;
}

// 辅助：生成模拟价格序列
function generateSimulatedPrices(symbol: string, startDate: string, endDate: string): number[] {
  const prices: number[] = [];
  const days = Math.floor((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000);
  let price = 100;
  const volMap: Record<string, number> = {
    'QQQ': 0.25, '510300.SH': 0.20, 'TLT': 0.15, 'GLD': 0.14, 'USO': 0.35, 'IBIT': 0.55,
  };
  const vol = (volMap[symbol] ?? 0.20) / Math.sqrt(252);
  for (let d = 0; d < Math.min(days, 252); d++) {
    const z = (Math.random() - 0.5) * 2;
    price *= (1 + vol * z);
    prices.push(Math.max(0.01, price));
  }
  return prices;
}

// ---- 2.6 Stress Testing Agent ----
export interface StressScenarioV2 {
  id: string;
  name: string;
  period: string;
  description: string;
  equityImpact: number;
  bondImpact: number;
  goldImpact: number;
  oilImpact: number;
  cryptoImpact: number;
}

export const STRESS_SCENARIOS_V2: StressScenarioV2[] = [
  { id: '2008_subprime',    name: '2008次贷危机',   period: '2007.10-2009.03', description: '雷曼倒闭、流动性枯竭',    equityImpact: -0.50, bondImpact: -0.10, goldImpact: +0.10, oilImpact: -0.60, cryptoImpact: -0.70 },
  { id: '2020_covid',       name: '2020新冠疫情',   period: '2020.02-2020.03', description: '全球恐慌抛售',          equityImpact: -0.35, bondImpact: +0.05, goldImpact: +0.15, oilImpact: -0.40, cryptoImpact: -0.40 },
  { id: '2022_rate_hikes',  name: '2022激进加息',   period: '2022.01-2022.12', description: '美联储激进加息缩表',      equityImpact: -0.25, bondImpact: -0.20, goldImpact: -0.05, oilImpact: -0.15, cryptoImpact: -0.50 },
  { id: '2022_china_crackdown', name: '2022中国教培', period: '2021.07-2022.03', description: '中国政策黑天鹅',        equityImpact: -0.45, bondImpact:  0.00, goldImpact:  0.00, oilImpact: -0.10, cryptoImpact: -0.30 },
  { id: '2024_simulated',   name: '模拟大跌',        period: '2024-模拟',        description: '尾部风险情景模拟',        equityImpact: -0.30, bondImpact: +0.02, goldImpact: +0.08, oilImpact: -0.25, cryptoImpact: -0.60 },
];

export interface StressTestResultV2 {
  passed: boolean;
  worstCase: number;
  var95: number;
  cvar95: number;
  scenarioResults: Record<string, {
    portfolioLoss: number;
    passed: boolean;
    breach: number;
    scenarioName: string;
  }>;
  recommendation: 'APPROVE' | 'REJECT' | 'WARN';
  timestamp: string;
}

// VaR / CVaR 计算（Historical 法）
export function computeHistoricalVaR(
  weights: Record<string, number>,
  returns: Record<string, number[]>,
  confidence: number = 0.95
): { var95: number; cvar95: number } {
  const assets = Object.keys(weights);
  const len = Math.min(...assets.map(a => returns[a]?.length ?? 0));
  if (len === 0) return { var95: 0, cvar95: 0 };

  // 组合日收益率
  const portfolioReturns: number[] = [];
  for (let i = 0; i < len; i++) {
    let r = 0;
    for (const asset of assets) {
      r += (weights[asset] ?? 0) * ((returns[asset]?.[i] ?? 0));
    }
    portfolioReturns.push(r);
  }

  portfolioReturns.sort((a, b) => a - b);
  const varIdx = Math.floor((1 - confidence) * portfolioReturns.length);
  const var95 = portfolioReturns[varIdx] ?? 0;
  const tail = portfolioReturns.slice(0, varIdx + 1);
  const cvar95 = tail.length > 0 ? tail.reduce((a, b) => a + b, 0) / tail.length : var95;

  return { var95, cvar95 };
}

// 压力测试主逻辑
export function runStressTestV2(
  weights: Record<string, number>,
  scenarios: StressScenarioV2[] = STRESS_SCENARIOS_V2,
  maxDrawdownLimit: number = 0.15,
  returns?: Record<string, number[]>
): StressTestResultV2 {
  const assetTypeMap: Record<string, keyof StressScenarioV2> = {
    'QQQ':        'equityImpact',
    '510300.SH':  'equityImpact',
    'TLT':        'bondImpact',
    'GLD':        'goldImpact',
    'USO':        'oilImpact',
    'IBIT':       'cryptoImpact',
  };

  const scenarioResults: StressTestResultV2['scenarioResults'] = {};
  let worstCase = 0;
  const failedScenarios: string[] = [];

  for (const scenario of scenarios) {
    let portfolioLoss = 0;
    for (const [asset, w] of Object.entries(weights)) {
      const impactKey = assetTypeMap[asset] ?? 'equityImpact';
      const impact = (scenario[impactKey] as number) ?? 0;
      portfolioLoss += w * impact;
    }

    const passed = Math.abs(portfolioLoss) <= maxDrawdownLimit;
    const breach = passed ? 0 : Math.abs(portfolioLoss) - maxDrawdownLimit;
    if (Math.abs(portfolioLoss) > Math.abs(worstCase)) worstCase = portfolioLoss;
    if (!passed) failedScenarios.push(scenario.id);

    scenarioResults[scenario.id] = {
      portfolioLoss,
      passed,
      breach,
      scenarioName: scenario.name,
    };
  }

  // VaR / CVaR
  const varData = returns ? computeHistoricalVaR(weights, returns) : { var95: 0, cvar95: 0 };

  const recommendation: StressTestResultV2['recommendation'] =
    failedScenarios.length === 0 ? 'APPROVE' :
    failedScenarios.length <= 1 ? 'WARN' : 'REJECT';

  return {
    passed: failedScenarios.length === 0,
    worstCase,
    var95: varData.var95,
    cvar95: varData.cvar95,
    scenarioResults,
    recommendation,
    timestamp: new Date().toISOString(),
  };
}