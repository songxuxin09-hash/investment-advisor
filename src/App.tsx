import { useState, useEffect, useRef } from 'react';
const MCP_SERVER_URL = 'https://investment-advisor-api-my3u.onrender.com';
import ReactECharts from 'echarts-for-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import {
  ClientProfile, RiskType, QuestionnaireAnswer, PortfolioResult, Asset,
  ASSET_POOL, CONSTRAINT_RULES, QUESTIONS, calculateRiskScore, getRiskType, generateConstraints,
  STRESS_SCENARIOS, runQuantRiskStressTest, QuantRiskResult,
  ASSET_CORRELATIONS, ASSET_VOLATILITY, AssetCode,
  runBacktest, BacktestConfig, BacktestResult,
  explainStressTest, explainMetric, generateOneLiner,
  // FMP API functions
  fetchFMPQuotesBatch, getPortfolioCurrentPrices, fetchBacktestDataWithFMP,
  determineMarketRegime, determineMarketRegimeMCP, FMPEconomicIndicator,
  // 市场情绪和新闻
  fetchMarketSentiment, fetchMarketSentimentMCP, fetchAssetNews,
  // MinerU
  smartParsePDF, PDFAnalysis,
  // 客户尽职调查
  analyzeCustomer, CustomerAnalysis,
  // ===== V3.2 多智能体底层逻辑 =====
  BLConfig, DEFAULT_BL_CONFIG, UserView,
  computeBLPosterior, meanVarianceOptimize,
  BacktestConfigV2, BacktestResultV2, runBacktestV2, fetchTusharePrices,
  StressScenarioV2, StressTestResultV2, runStressTestV2, STRESS_SCENARIOS_V2,
  MarketInsightResult, determineMerrillClockQuadrant, applyCycleAdjustment,
  DEFAULT_SAA, DEFAULT_CYCLE_CONFIG,
  RiskLevelProfile, loadLocalKnowledgeBase,
} from './types';

interface PDFInsight {
  source: string;
  keyInsights: string[];
}

// PDF知识库状态

// Simple in-page chart component

const EquityCurveChart = ({ equityCurve, benchmarkCurve, assetCurves }: {
  equityCurve: number[];
  benchmarkCurve: number[];
  assetCurves: Record<string, number[]>;
}) => {
  const option = {
    tooltip: { trigger: 'axis' },
    legend: { bottom: 10, data: ['Portfolio', 'Benchmark', ...Object.keys(assetCurves)] },
    grid: { left: 50, right: 20, top: 40 },
    xAxis: {
      type: 'category',
      data: equityCurve.map((_, i) => `D${i}`),
    },
    yAxis: { type: 'value', name: '净值' },
    series: [
      { name: 'Portfolio', type: 'line', data: equityCurve, lineStyle: { width: 3, color: '#1a365d' } },
      { name: 'Benchmark', type: 'line', data: benchmarkCurve, lineStyle: { type: 'dashed', color: '#718096' } },
      ...Object.entries(assetCurves).map(([asset, data]) => ({
        name: asset,
        type: 'line',
        data,
        lineStyle: { width: 1, opacity: 0.5 }
      }))
    ]
  };
  return <ReactECharts option={option} style={{ height: 280 }} />;
};

const PieChart = ({ data, height = 300 }: { data: { name: string; value: number }[]; height?: number }) => {
  const option = {
    tooltip: { trigger: 'item', formatter: '{b}: {c}% ({d}%)' },
    legend: { bottom: 10, left: 'center' },
    series: [{
      type: 'pie', radius: ['40%', '70%'], avoidLabelOverlap: false,
      itemStyle: { borderRadius: 10, borderColor: '#fff', borderWidth: 2 },
      label: { show: false },
      emphasis: { label: { show: true, fontSize: 14, fontWeight: 'bold' } },
      data: data.map((d, i) => ({
        ...d, value: Math.round(d.value * 100),
        itemStyle: { color: ['#1a365d', '#2d5a87', '#4299e1', '#48bb78', '#ed8936', '#f56565'][i] }
      }))
    }]
  };
  return <ReactECharts option={option} style={{ height: height + 'px' }} />;
};

export default function App() {
  // 客户尽职调查状态
  const [customerNameInput, setCustomerNameInput] = useState('');
  const [customerAnalysis, setCustomerAnalysis] = useState<CustomerAnalysis | null>(null);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [customerError, setCustomerError] = useState<string | null>(null);

  // PDF知识库状态
  const [pdfInsights, setPdfInsights] = useState<PDFInsight[] | null>(null);
  const [pdfUploadStatus, setPdfUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [uploadedPdfContent, setUploadedPdfContent] = useState<string | null>(null);
  const [step, setStep] = useState(0); // 0 = 客户尽职调查, 1 = 风险测评, ...
  const [answers, setAnswers] = useState<QuestionnaireAnswer[]>([]);
  const [clientProfile, setClientProfile] = useState<ClientProfile | null>(null);
  const [regime, setRegime] = useState<'inflation' | 'recession' | 'normal'>('normal');
  const [macroFactors, setMacroFactors] = useState<string[]>([]);
  const [macroConfidence, setMacroConfidence] = useState(0);
  const [macroIndicators, setMacroIndicators] = useState<{ cpi: number; gdp: number; fedRate: number } | null>(null);
  const [portfolioResult, setPortfolioResult] = useState<PortfolioResult | null>(null);
  const [quantRiskResult, setQuantRiskResult] = useState<QuantRiskResult | null>(null);
  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);
  const [backtestConfig, setBacktestConfig] = useState<BacktestConfig>({ period: '3Y', rebalanceFrequency: 'monthly', benchmark: 'CSI300' });
  // ===== V3.2 新增状态 =====
  const [tauValue, setTauValue] = useState<number>(DEFAULT_BL_CONFIG.tau);          // BL模型 τ 值
  const [userViews, setUserViews] = useState<UserView[]>([]);                          // 用户主观观点
  const [newViewAsset, setNewViewAsset] = useState('');     // 新观点-资产
  const [newViewReturn, setNewViewReturn] = useState(0);    // 新观点-收益率
  const [newViewConfidence, setNewViewConfidence] = useState(3); // 新观点-置信度
  const [stressTestResultV2, setStressTestResultV2] = useState<StressTestResultV2 | null>(null);    // V2 压力测试结果
  const [historicalStats, setHistoricalStats] = useState<Record<string, { annualReturn: number; annualVol: number }>>({});  // Tushare 统计
  // MarketInsight 计算状态（Step 2 展示用）
  const [cycleQuadrantUS, setCycleQuadrantUS] = useState<string>('recovery');
  const [cycleQuadrantCN, setCycleQuadrantCN] = useState<string>('recovery');
  const [assetConstraints, setAssetConstraints] = useState<Record<string, { min: number; max: number }>>({});
  // SAA计算结果（后端计算）
  const [saaResult, setSaaResult] = useState<{
    us_quadrant: string; cn_quadrant: string;
    constraints: Record<string, { min: number; max: number }>;
    cycle_table: Array<{ asset: string; saa_base: number; delta: number; adjusted: number; risk_limit: number; final_min: number; final_max: number }>;
    cash_weight: number;
    reasoning: Record<string, string>;
  } | null>(null);
  // 研报解读（后端实时读取KB）
  const [researchInsights, setResearchInsights] = useState<Array<{
    source: string; direction: string; key_argument: string;
    confidence: string; timeliness: string; related_assets: string[];
  }>>([]);
  // 分类新闻
  const [newsCN, setNewsCN] = useState<Array<{ source: string; title: string; url: string; asset: string; time: string; sentiment: string }>>([]);
  const [newsUS, setNewsUS] = useState<Array<{ source: string; title: string; url: string; asset: string; time: string; sentiment: string }>>([]);
  const [newsCrypto, setNewsCrypto] = useState<Array<{ source: string; title: string; url: string; asset: string; time: string; sentiment: string }>>([]);
  const [newsCommodities, setNewsCommodities] = useState<Array<{ source: string; title: string; url: string; asset: string; time: string; sentiment: string }>>([]);
  // ===== V3.2 end =====
  const [marketSentiment, setMarketSentiment] = useState<{ vix: number | null; fearGreedIndex: number | null; sentiment: 'fear' | 'greed' | 'neutral' } | null>(null);
  const [assetNews, setAssetNews] = useState<{ sentiment: string; news: { source: string; title: string; url: string; asset: string; time: string }[] } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [marketDataLoading, setMarketDataLoading] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  // 进入 step === 2 (市场感知页面) 时自动加载数据和PDF
  useEffect(() => {
    if (step === 2 && clientProfile) {
      setMarketDataLoading(true);
      console.log('[App] Entering step 2, fetching market data...');

      const fetchMarketData = async () => {
        try {
          const sentiment = await fetchMarketSentimentMCP();
          console.log('[App] Sentiment fetched:', sentiment);
          setMarketSentiment(sentiment);
        } catch (e) {
          console.error('[App] Sentiment error:', e);
        }

        try {
          const news = await fetchAssetNews();
          console.log('[App] News fetched:', news ? 'yes' : 'no');
          setAssetNews(news);
        } catch (e) {
          setAssetNews(null);
        }

        try {
          const pdfData = await loadLocalKnowledgeBase();
          console.log('[App] PDF knowledge base:', pdfData ? `${pdfData.length} files` : 'empty');
          setPdfInsights(pdfData);
        } catch (e) {
          setPdfInsights(null);
        }

        try {
          const regimeData = await determineMarketRegimeMCP();
          setRegime(regimeData.regime);
          setMacroFactors(regimeData.factors);
          setMacroConfidence(regimeData.confidence);

          const gdpVal = regimeData.indicators?.gdp ?? 2.1;
          const cpiVal = regimeData.indicators?.cpi ?? 2.8;
          setMacroIndicators({
            cpi: cpiVal,
            gdp: gdpVal,
            fedRate: regimeData.indicators?.fedRate ?? 4.50,
          });

          // ===== V3.2: MarketInsight Agent 后端计算 =====
          // 调用 SAA 计算端点
          try {
            const gdpVal2 = regimeData.indicators?.gdp ?? 2.1;
            const cpiVal2 = regimeData.indicators?.cpi ?? 2.8;
            const riskType = clientProfile?.riskType ?? 'R2';
            const resp = await fetch(`${MCP_SERVER_URL}/api/market/saa-calculate`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                risk_type: riskType,
                max_drawdown: clientProfile?.maxDrawdown ?? 0.10,
                min_bond_weight: clientProfile?.minBondWeight ?? 0.15,
                max_crypto_weight: clientProfile?.maxCryptoWeight ?? 0.03,
                max_single_stock: clientProfile?.maxSingleStock ?? 0.30,
                gdp: gdpVal2 / 100,
                cpi: cpiVal2 / 100,
                us_cpi: 2.8,
              }),
            });
            if (resp.ok) {
              const data = await resp.json();
              setSaaResult(data);
              setCycleQuadrantUS(data.us_quadrant);
              setCycleQuadrantCN(data.cn_quadrant);
              // 将约束传递给 startOptimization（通过 assetConstraints）
              const assetConstr: Record<string, { min: number; max: number }> = {};
              for (const [code, v] of Object.entries(data.constraints)) {
                if (code !== 'CASH') assetConstr[code] = v as { min: number; max: number };
              }
              setAssetConstraints(assetConstr);
              console.log('[V3.2] SAA result from backend:', data);
            } else {
              console.warn('[V3.2] SAA endpoint failed:', resp.status);
            }
          } catch (e) {
            console.warn('[V3.2] SAA calculation failed:', e);
          }

          // 调用研报解读端点
          try {
            const researchResp = await fetch(`${MCP_SERVER_URL}/api/research/insights`);
            if (researchResp.ok) {
              const rdata = await researchResp.json();
              setResearchInsights(rdata.insights ?? []);
              console.log('[V3.2] Research insights:', rdata.count, 'files');
            }
          } catch (e) {
            console.warn('[V3.2] Research insights failed:', e);
          }

          // 调用分类新闻端点
          const newsTypes = [
            { type: 'cn',         setter: setNewsCN         },
            { type: 'us',         setter: setNewsUS         },
            { type: 'crypto',     setter: setNewsCrypto     },
            { type: 'commodities', setter: setNewsCommodities },
          ];
          for (const { type, setter } of newsTypes) {
            try {
              const nr = await fetch(`${MCP_SERVER_URL}/api/news/${type}`);
              if (nr.ok) {
                const nd = await nr.json();
                setter(nd.news ?? []);
              }
            } catch (e) {
              console.warn(`[V3.2] News (${type}) failed:`, e);
            }
          }

        } catch (e) {
          console.error('[App] Regime error:', e);
          setRegime('normal');
          setMacroFactors(['使用默认宏观数据']);
          setMacroConfidence(0.5);
          setMacroIndicators({ cpi: 2.8, gdp: 2.1, fedRate: 4.50 });
          setCycleQuadrantUS('recovery');
          setCycleQuadrantCN('recovery');
        }

        console.log('[App] Market data fetch complete');
        setMarketDataLoading(false);
      };

      fetchMarketData();
    }
  }, [step, clientProfile]);

  // Auto-detect regime based on random simulation (in real app would use MCP)
  const detectRegime = () => {
    const regimes: ('inflation' | 'recession' | 'normal')[] = ['inflation', 'recession', 'normal'];
    const randomRegime = regimes[Math.floor(Math.random() * 3)];
    setRegime(randomRegime);
    return randomRegime;
  };

  // 处理客户尽职调查分析
  const handleCustomerAnalysis = async () => {
    if (!customerNameInput.trim()) return;

    setCustomerLoading(true);
    setCustomerError(null);

    try {
      const result = await analyzeCustomer(customerNameInput.trim());
      setCustomerAnalysis(result);
      console.log('[App] Customer analysis result:', result);
    } catch (e: any) {
      console.error('[App] Customer analysis error:', e);
      setCustomerError(e.message || '分析失败，请稍后重试');
    } finally {
      setCustomerLoading(false);
    }
  };

  // Proceed from customer analysis to questionnaire
  const proceedToQuestionnaire = () => {
    if (!customerAnalysis) {
      setCustomerError('请先完成客户分析');
      return;
    }
    setStep(1);
  };

  // Optimize portfolio using Black-Litterman model (V3.2)
  const optimizePortfolio = (profile: ClientProfile) => {
    const regime = detectRegime();

    // ---- MarketInsight Agent: 双轨美林时钟判断 ----
    const gdp = macroIndicators?.gdp ?? 2.1;
    const cpi = macroIndicators?.cpi ?? 2.8;
    const usQuadrant = determineMerrillClockQuadrant(gdp, cpi, DEFAULT_CYCLE_CONFIG);
    const cycleAdjusted = applyCycleAdjustment(usQuadrant, DEFAULT_SAA);

    // ---- 构建硬约束：周期调整 + Risk Level 取 min ----
    const assetConstraints: Record<string, { min: number; max: number }> = {};
    const assetList = ['510300.SH', '159605.SZ', '511010.SH', '518880.SH', '162411.SZ', '513100.SH'];
    const equityAssets = ['510300.SH', '159605.SZ'];
    const bondAssets  = ['511010.SH'];

    for (const asset of assetList) {
      if (equityAssets.includes(asset)) {
        const riskMax = profile.maxSingleStock || 0.3;
        const cycleMax = cycleAdjusted['equity']?.max ?? 0.7;
        assetConstraints[asset] = {
          min: cycleAdjusted['equity']?.min ?? 0.1,
          max: Math.min(cycleMax, riskMax),
        };
      } else if (bondAssets.includes(asset)) {
        assetConstraints[asset] = {
          min: Math.max(cycleAdjusted['bond']?.min ?? 0.1, profile.minBondWeight),
          max: cycleAdjusted['bond']?.max ?? 0.5,
        };
      } else if (asset === '162411.SZ') {
        assetConstraints[asset] = {
          min: cycleAdjusted['cash']?.min ?? 0.0,
          max: Math.min(cycleAdjusted['cash']?.max ?? 0.15, 0.15),
        };
      } else if (asset === '513100.SH') {
        assetConstraints[asset] = {
          min: 0,
          max: profile.maxCryptoWeight,
        };
      } else {
        assetConstraints[asset] = { min: 0, max: 0.15 };
      }
    }

    // ---- 历史统计（用历史数据或默认值）----
    const historicalReturns: Record<string, number> = {
      '510300.SH': historicalStats['510300.SH']?.annualReturn ?? 0.08,
      '159605.SZ': historicalStats['159605.SZ']?.annualReturn ?? 0.12,
      '511010.SH': historicalStats['511010.SH']?.annualReturn ?? 0.04,
      '518880.SH': historicalStats['518880.SH']?.annualReturn ?? 0.06,
      '162411.SZ': historicalStats['162411.SZ']?.annualReturn ?? 0.10,
      '513100.SH': historicalStats['513100.SH']?.annualReturn ?? 0.15,
    };
    const historicalCov: Record<string, Record<string, number>> = {};
    for (const a of assetList) {
      historicalCov[a] = {};
      for (const b of assetList) {
        const volA = ASSET_VOLATILITY[a as AssetCode] ?? 0.015;
        const volB = ASSET_VOLATILITY[b as AssetCode] ?? 0.015;
        const corr = ASSET_CORRELATIONS[a as AssetCode]?.[b as AssetCode] ?? 0.3;
        historicalCov[a][b] = volA * volB * corr;
      }
    }

    // ---- BL 配置：使用用户调节的 τ ----
    const blConfig: BLConfig = {
      ...DEFAULT_BL_CONFIG,
      tau: tauValue,
    };

    // ---- 融合用户主观观点（如果用户已输入）----
    const effectiveViews = userViews.length > 0 ? userViews : [];
    const posterior = computeBLPosterior(historicalReturns, historicalCov, effectiveViews, blConfig);

    // ---- 均值方差优化 ----
    let weights = meanVarianceOptimize(posterior, assetConstraints, blConfig);

    // 归一化到 100%
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    if (total > 0) {
      for (const k of Object.keys(weights)) weights[k] /= total;
    }

    // 应用单只权益上限
    for (const k of Object.keys(weights)) {
      if (weights[k] > profile.maxSingleStock) weights[k] = profile.maxSingleStock;
    }

    // ---- 计算组合绩效 ----
    let expectedReturn = 0, expectedVar = 0;
    for (const a of assetList) {
      expectedReturn += (weights[a] ?? 0) * (posterior.expectedReturns[a] ?? historicalReturns[a] ?? 0.08);
    }
    for (const a of assetList) for (const b of assetList) {
      expectedVar += (weights[a] ?? 0) * (weights[b] ?? 0) * (historicalCov[a]?.[b] ?? 0);
    }
    const expectedVol = Math.sqrt(expectedVar);
    const sharpe = expectedVol > 0 ? (expectedReturn - 0.03) / expectedVol : 0;

    setPortfolioResult({
      weights,
      expectedReturn: Math.round(expectedReturn * 10000) / 10000,
      expectedVolatility: Math.round(expectedVol * 10000) / 10000,
      sharpeRatio: Math.round(sharpe * 100) / 100,
      maxDrawdown: profile.maxDrawdown,
      timestamp: new Date().toISOString(),
    });
  };

  const handleAnswer = (qId: number, option: number) => {
    const existing = answers.findIndex(a => a.questionId === qId);
    const newAnswers = [...answers];
    if (existing >= 0) {
      newAnswers[existing] = { questionId: qId, selectedOption: option };
    } else {
      newAnswers.push({ questionId: qId, selectedOption: option });
    }
    setAnswers(newAnswers);
  };

  const proceedToMarketAnalysis = () => {
    if (answers.length < 5) return;
    const score = calculateRiskScore(answers);
    const type = getRiskType(score);
    const constraints = generateConstraints(type);
    constraints.riskScore = score;
    setClientProfile(constraints);
    setStep(2);
  };

  const startOptimization = () => {
    if (!clientProfile) return;
    setIsProcessing(true);
    setStep(3);
    setTimeout(async () => {
      // 获取宏观数据 (美林时钟+多指标体系) - 优先使用 MCP 增强版
      try {
        const regimeData = await determineMarketRegimeMCP();
        setRegime(regimeData.regime);
        setMacroFactors(regimeData.factors);
        setMacroConfidence(regimeData.confidence);

        if (regimeData.indicators) {
          setMacroIndicators({
            cpi: regimeData.indicators.cpi,
            gdp: regimeData.indicators.gdp,
            fedRate: 4.50,
          });
        } else {
          const cpiMatch = regimeData.factors.find(f => f.includes('CPI'))?.match(/CPI: ([\d.-]+)%/);
          const gdpMatch = regimeData.factors.find(f => f.includes('GDP'))?.match(/GDP[:\s]*([-\d.]+)%/);
          setMacroIndicators({
            cpi: cpiMatch ? parseFloat(cpiMatch[1]) : 2.8,
            gdp: gdpMatch ? parseFloat(gdpMatch[1]) : 2.1,
            fedRate: 4.50,
          });
        }
      } catch (e) {
        detectRegime();
        setMacroFactors(['使用默认宏观数据', '📅 数据来源: Fallback']);
        setMacroConfidence(0.5);
        setMacroIndicators({ cpi: 2.8, gdp: 2.1, fedRate: 4.50 });
      }

      // 获取市场情绪
      try {
        const sentiment = await fetchMarketSentimentMCP();
        setMarketSentiment(sentiment);
      } catch (e) {
        setMarketSentiment({ vix: null, fearGreedIndex: 50, sentiment: 'neutral' });
      }

      // 获取资产新闻
      try {
        const news = await fetchAssetNews();
        setAssetNews(news);
      } catch (e) {
        setAssetNews(null);
      }

      // 获取本地知识库PDF分析结果
      try {
        const pdfData = await loadLocalKnowledgeBase();
        setPdfInsights(pdfData);
      } catch (e) {
        setPdfInsights(null);
      }

      // ===== V3.2: 获取 Tushare 历史数据，计算收益率/波动率 =====
      try {
        const assets = ASSET_POOL.map(a => a.code);
        const prices = await fetchTusharePrices(assets, '6m');

        // 计算年化收益率和波动率
        const stats: Record<string, { annualReturn: number; annualVol: number }> = {};
        for (const asset of assets) {
          const priceArr = prices[asset] ?? [];
          if (priceArr.length >= 10) {
            const dailyReturns: number[] = [];
            for (let i = 1; i < priceArr.length; i++) {
              dailyReturns.push((priceArr[i] - priceArr[i-1]) / priceArr[i-1]);
            }
            const avg = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
            const variance = dailyReturns.reduce((s, r) => s + (r - avg) ** 2, 0) / dailyReturns.length;
            const annReturn = avg * 252;
            const annVol    = Math.sqrt(variance * 252);
            stats[asset] = { annualReturn: annReturn, annualVol: annVol };
          } else {
            // fallback
            const def = ASSET_POOL.find(a => a.code === asset);
            stats[asset] = { annualReturn: def?.expectedReturn ?? 0.08, annualVol: def?.volatility ?? 0.15 };
          }
        }
        setHistoricalStats(stats);
        console.log('[V3.2] Tushare historical stats:', stats);
      } catch (e) {
        console.warn('[V3.2] Tushare fetch failed, using defaults');
      }

      optimizePortfolio(clientProfile);
      setIsProcessing(false);
    }, 1500);
  };

  // 处理 PDF 文件上传 (使用 MinerU)
  const handlePdfUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      alert('请选择 PDF 文件');
      return;
    }

    setPdfUploadStatus('uploading');

    try {
      const result = await smartParsePDF(file);

      // 将解析结果添加到 pdfInsights
      const newInsight: PDFInsight = {
        source: file.name,
        keyInsights: result.keyInsights,
      };

      setPdfInsights(prev => {
        const updated = prev ? [...prev, newInsight] : [newInsight];
        return updated;
      });

      setUploadedPdfContent(result.content);
      setPdfUploadStatus('success');
      console.log('[PDF] Parsed successfully, source:', result.source);
    } catch (error) {
      console.error('[PDF] Parse failed:', error);
      setPdfUploadStatus('error');
      alert('PDF 解析失败，请检查网络连接或 API 配置');
    }
  };

  // Run QuantRisk stress test (V3.2: 使用 Stress Testing Agent 逻辑)
  const runStressTest = async () => {
    if (!portfolioResult || !clientProfile) return;

    setIsProcessing(true);

    // ===== V3.2: 使用新的 Stress Testing Agent =====
    const riskResultV2 = runStressTestV2(
      portfolioResult.weights,
      STRESS_SCENARIOS_V2,
      clientProfile.maxDrawdown,
    );
    setStressTestResultV2(riskResultV2);
    console.log('[V3.2] StressTestV2 result:', riskResultV2);

    // 兼容 V1 格式
    const riskResult = runQuantRiskStressTest(portfolioResult.weights, clientProfile);
    console.log('=== QuantRisk Agent Raw JSON ===');
    console.log(JSON.stringify(riskResult, null, 2));
    riskResult.results.forEach((r, i) => {
      console.log(`[${i}] scenarioId: ${r.scenarioId}, portfolioReturn: ${r.portfolioReturn}, observedDrawdown: ${r.observedDrawdown}, status: ${r.status}`);
    });
    setQuantRiskResult(riskResult);

    setIsProcessing(false);
    setStep(4);
  };

  // Proceed to risk check (Step 5)
  const proceedToReport = () => {
    if (!quantRiskResult || quantRiskResult.status !== 'PASS') {
      alert('请先通过风控检查');
      return;
    }
    setStep(5);
    setShowReport(true);
  };

  // Force bypass - for authorized users
  const forceProceedToReport = () => {
    setStep(5);
    setShowReport(true);
  };

  const downloadPDF = async () => {
    if (!reportRef.current) return;

    // Use window.print with better formatting for multi-page PDF
    const printContent = reportRef.current;

    // Create a new window for printing
    const printWindow = window.open('', '_blank');

    if (!printWindow) {
      alert('请允许弹出窗口以生成PDF');
      return;
    }

    // Clone the content and add print styles
    const clone = printContent.cloneNode(true) as HTMLElement;
    clone.style.padding = '20px';
    clone.style.background = 'white';

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>投顾决策报告</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: "Noto Sans SC", "PingFang SC", sans-serif; padding: 20px; }
          .report-section { page-break-inside: avoid; margin-bottom: 32px; padding-bottom: 24px; border-bottom: 1px solid #e2e8f0; }
          .report-part { font-size: 14px; color: #718096; margin-bottom: 8px; }
          .report-h2 { font-size: 18px; font-weight: 600; margin-bottom: 16px; }
          p { margin-bottom: 8px; line-height: 1.6; }
          table { width: 100%; border-collapse: collapse; margin: 16px 0; }
          th, td { padding: 12px; text-align: left; border-bottom: 1px solid #e2e8f0; }
          th { background: #f7fafc; font-weight: 500; }
          @media print {
            body { padding: 0; }
            .report-section { page-break-inside: avoid; }
          }
        </style>
      </head>
      <body></body>
      </html>
    `);

    printWindow.document.body.appendChild(clone);
    printWindow.document.close();

    // Wait for content to load then print
    setTimeout(() => {
      printWindow.print();
    }, 500);

    setShowReport(false);
  };

  const addUserView = () => {
    if (!newViewAsset) return;
    setUserViews([...userViews, { asset: newViewAsset, viewReturn: newViewReturn, confidence: newViewConfidence }]);
    setNewViewAsset('');
    setNewViewReturn(0);
    setNewViewConfidence(3);
  };

  const resetAll = () => {
    setStep(1);
    setAnswers([]);
    setClientProfile(null);
    setPortfolioResult(null);
    setQuantRiskResult(null);
    setBacktestResult(null);
    setShowReport(false);
  };

  return (
    <div className="app-container">
      {/* Header */}
      <header className="header">
        <div className="header-logo">
          <span style={{ fontSize: 28 }}>📊</span>
          <h1>投顾智能决策系统</h1>
          <span className="header-version">v3.2</span>
        </div>
        <div className="header-status">
          <span className="status-dot" style={{ background: isProcessing ? '#ed8936' : '#38a169'}}></span>
          <span>{isProcessing ? '处理中...' : '就绪'}</span>
        </div>
      </header>

      {/* Sidebar */}
      <aside className="sidebar">
        <div className={`nav-item ${step === 0 ? 'active' : ''}`} onClick={() => setStep(0)}>🔍 客户尽职调查</div>
        <div className={`nav-item ${step === 1 ? 'active' : ''}`} onClick={() => clientProfile && setStep(1)}>📝 客户画像</div>
        <div className={`nav-item ${step === 2 ? 'active' : ''} ${!clientProfile ? 'disabled' : ''}`} onClick={() => clientProfile && setStep(2)}>🌍 市场感知</div>
        <div className={`nav-item ${step === 3 ? 'active' : ''} ${!portfolioResult ? 'disabled' : ''}`} onClick={() => portfolioResult && setStep(3)}>⚖️ 组合优化</div>
        <div className={`nav-item ${step === 4 ? 'active' : ''} ${!portfolioResult ? 'disabled' : ''}`} onClick={() => portfolioResult && setStep(4)}>📊 历史回测</div>
        <div className={`nav-item ${step === 5 ? 'active' : ''} ${!portfolioResult ? 'disabled' : ''}`} onClick={() => portfolioResult && setStep(5)}>🛡️ 风控检查</div>
        <div className={`nav-item ${step === 6 ? 'active' : ''} ${!quantRiskResult || quantRiskResult.status !== 'PASS' ? 'disabled' : ''}`} onClick={() => quantRiskResult && quantRiskResult.status === 'PASS' && setStep(6)}>📄 报告生成</div>
        <div style={{ marginTop: 32, padding: '16px', background: '#f7fafc', borderRadius: 8 }}>
          <div style={{ fontSize: 12, color: '#718096', marginBottom: 8 }}>当前风险等级</div>
          <div className={`risk-tag ${clientProfile ? `risk-${clientProfile.riskType.toLowerCase()}` : ''}`}>
            {clientProfile ? CONSTRAINT_RULES[clientProfile.riskType].label : '待评估'}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        {/* Step Indicator */}
        <div className="steps-indicator">
          <div className={`step ${step >= 0 ? 'active' : ''} ${step > 0 ? 'completed' : ''}`}>0 客户尽职调查</div>
          <div className={`step ${step >= 1 ? 'active' : ''} ${step > 1 ? 'completed' : ''}`}>1 风险测评</div>
          <div className={`step ${step >= 2 ? 'active' : ''} ${step > 2 ? 'completed' : ''}`}>2 市场分析</div>
          <div className={`step ${step >= 3 ? 'active' : ''} ${step > 3 ? 'completed' : ''}`}>3 组合优化</div>
          <div className={`step ${step >= 4 ? 'active' : ''} ${step > 4 ? 'completed' : ''}`}>4 历史回测</div>
          <div className={`step ${step >= 5 ? 'active' : ''} ${step > 5 ? 'completed' : ''}`}>5 风控检查</div>
          <div className={`step ${step >= 6 ? 'active' : ''}`}>6 报告生成</div>
        </div>

        {/* Step 0: Customer Due Diligence */}
        {step === 0 && (
          <div className="card">
            <div className="card-title">🔍 客户尽职调查</div>
            <div style={{ marginBottom: 24 }}>
              <div className="form-group">
                <div className="form-label">请输入客户姓名</div>
                <input
                  type="text"
                  className="form-input"
                  placeholder="例如：马云"
                  value={customerNameInput}
                  onChange={(e) => setCustomerNameInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCustomerAnalysis()}
                />
              </div>
              <button
                className="btn btn-primary"
                onClick={handleCustomerAnalysis}
                disabled={customerLoading || !customerNameInput.trim()}
                style={{ marginTop: 12 }}
              >
                {customerLoading ? '正在分析...' : '🔍 分析客户报告'}
              </button>
            </div>

            {customerError && (
              <div style={{ padding: 12, background: '#fff5f5', borderRadius: 8, color: '#e53e3e', marginBottom: 16 }}>
                {customerError}
              </div>
            )}

            {customerAnalysis && (
              <>
                {/* 客户基本信息 */}
                <div style={{ marginTop: 24, padding: 16, background: '#f0f4f8', borderRadius: 8 }}>
                  <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>1. 客户基本信息</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                    <div>
                      <div style={{ fontSize: 12, color: '#718096' }}>性别</div>
                      <div style={{ fontSize: 14 }}>{customerAnalysis.basic_info.性别}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: '#718096' }}>年龄</div>
                      <div style={{ fontSize: 14 }}>{customerAnalysis.basic_info.年龄}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: '#718096' }}>学历</div>
                      <div style={{ fontSize: 14 }}>{customerAnalysis.basic_info.学历}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: '#718096' }}>年薪</div>
                      <div style={{ fontSize: 14 }}>{customerAnalysis.basic_info.年薪}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: '#718096' }}>净资产</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#1a365d' }}>{customerAnalysis.basic_info.净资产}</div>
                    </div>
                  </div>
                </div>

                {/* 客户所在企业 */}
                <div style={{ marginTop: 16, padding: 16, background: '#f0f4f8', borderRadius: 8 }}>
                  <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>2. 客户所在企业</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
                    <div>
                      <div style={{ fontSize: 12, color: '#718096' }}>企业名称</div>
                      <div style={{ fontSize: 14 }}>{customerAnalysis.company_info.企业名称}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: '#718096' }}>上市状态</div>
                      <div style={{ fontSize: 14 }}>{customerAnalysis.company_info.上市状态}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: '#718096' }}>市值</div>
                      <div style={{ fontSize: 14 }}>{customerAnalysis.company_info.市值}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: '#718096' }}>客户持股比例</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#2d5a87' }}>{customerAnalysis.company_info.客户持股比例}</div>
                    </div>
                  </div>
                </div>

                {/* 财富管理需求分析 */}
                <div style={{ marginTop: 16, padding: 16, background: '#f7fafc', borderRadius: 8, borderLeft: '3px solid #48bb78' }}>
                  <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>3. 财富管理需求分析</div>
                  <div style={{ fontSize: 14, color: '#4a5568', lineHeight: 1.6 }}>
                    {customerAnalysis.wealth_needs}
                  </div>
                </div>

                {/* 公司业务需求分析 */}
                <div style={{ marginTop: 16, padding: 16, background: '#f7fafc', borderRadius: 8, borderLeft: '3px solid #4299e1' }}>
                  <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>4. 公司业务需求分析</div>
                  <div style={{ fontSize: 14, color: '#4a5568', lineHeight: 1.6 }}>
                    {customerAnalysis.business_needs}
                  </div>
                </div>

                {/* 投行业务需求分析 */}
                <div style={{ marginTop: 16, padding: 16, background: '#f7fafc', borderRadius: 8, borderLeft: '3px solid #ed8936' }}>
                  <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>5. 投行业务需求分析</div>
                  <div style={{ fontSize: 14, color: '#4a5568', lineHeight: 1.6 }}>
                    {customerAnalysis.investment_needs}
                  </div>
                </div>

                <div className="btn-row" style={{ marginTop: 24 }}>
                  <button className="btn btn-primary" onClick={proceedToQuestionnaire}>→ 进入风险测评</button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Step 1: Questionnaire */}
        {step === 1 && (
          <div className="card">
            <div className="card-title">📝 风险承受能力评估</div>
            {QUESTIONS.map((q) => (
              <div key={q.id} className="question-item">
                <div className="question-text">{q.id}. {q.text}</div>
                <div className="option-group">
                  {q.options.map((opt, optIdx) => (
                    <button
                      key={optIdx}
                      className={`option-btn ${answers.find(a => a.questionId === q.id)?.selectedOption === optIdx ? 'selected' : ''}`}
                      onClick={() => handleAnswer(q.id, optIdx)}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <div style={{ textAlign: 'center', marginTop: 16, color: '#718096' }}>
              已回答 {answers.length}/5 题
              <div className="progress-bar" style={{ marginTop: 8 }}>
                <div className="progress-fill" style={{ width: `${(answers.length / 5) * 100}%` }}></div>
              </div>
              <div className="btn-row" style={{ justifyContent: 'center', marginTop: 16 }}>
                <button
                  className="btn btn-primary"
                  disabled={answers.length < 5}
                  onClick={proceedToMarketAnalysis}
                  style={{ opacity: answers.length < 5 ? 0.5 : 1 }}
                >
                  {answers.length < 5 ? '请完成所有问题' : '→ 进入市场分析'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Client Profile & Market Info */}
        {step === 2 && clientProfile && (
          <>
            {marketDataLoading && (
              <div className="card" style={{ textAlign: 'center', padding: 32 }}>
                <div className="loading-spinner" style={{ width: 32, height: 32, margin: '0 auto 16px' }}></div>
                <div>正在加载市场数据...</div>
              </div>
            )}
            <div className="card">
              <div className="card-title">👤 投资者画像</div>
              <div className="data-grid">
                <div className="data-item">
                  <div className="data-label">风险评分</div>
                  <div className="data-value">{clientProfile.riskScore}</div>
                </div>
                <div className="data-item">
                  <div className="data-label">风险类型</div>
                  <div className={`risk-tag risk-${clientProfile.riskType.toLowerCase()}`} style={{ display: 'inline-block', marginTop: 4 }}>
                    {CONSTRAINT_RULES[clientProfile.riskType].label}
                  </div>
                </div>
                <div className="data-item">
                  <div className="data-label">最大回撤限制</div>
                  <div className="data-value">{(clientProfile.maxDrawdown * 100)}<span className="data-unit">%</span></div>
                </div>
                <div className="data-item">
                  <div className="data-label">单只权益上限</div>
                  <div className="data-value">{clientProfile.maxSingleStock * 100}<span className="data-unit">%</span></div>
                </div>
              </div>
              <div style={{ marginTop: 24 }}>
                <div className="card-title">🔒 投资约束</div>
                <div className="constraint-item">
                  <span className="constraint-name">债券类最低占比</span>
                  <span className="constraint-value" style={{ color: '#38a169' }}>≥ {clientProfile.minBondWeight * 100}%</span>
                </div>
                <div className="constraint-item">
                  <span className="constraint-name">加密资产最高占比</span>
                  <span className="constraint-value" style={{ color: '#e53e3e' }}>≤ {clientProfile.maxCryptoWeight * 100}%</span>
                </div>
              </div>
            </div>

            {/* ===== V3.2 MarketInsight Agent ===== */}
            <div className="card">
              <div className="card-title">🌍 MarketInsight Agent — 宏观周期守门人</div>

              {/* 1. 双轨美林时钟 */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#2d5a87', marginBottom: 8 }}>🗺️ 双轨美林时钟</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {/* 美国时钟 */}
                  <div style={{ padding: 14, background: '#ebf8ff', borderRadius: 8, border: '1px solid #bee3f8' }}>
                    <div style={{ fontSize: 12, color: '#2b6cb0', fontWeight: 600, marginBottom: 8 }}>🇺🇸 美国经济周期</div>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                      {(['recovery', 'overheat', 'stagflation', 'recession'] as const).map(q => (
                        <div key={q} style={{
                          padding: '4px 8px', borderRadius: 4, fontSize: 11,
                          background: cycleQuadrantUS === q ? '#2b6cb0' : '#e2e8f0',
                          color: cycleQuadrantUS === q ? '#fff' : '#4a5568',
                          fontWeight: cycleQuadrantUS === q ? 600 : 400,
                        }}>
                          {q === 'recovery' ? '复苏' : q === 'overheat' ? '过热' : q === 'stagflation' ? '滞胀' : '衰退'}
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize: 11, color: '#718096' }}>
                      GDP: {macroIndicators?.gdp?.toFixed(1) ?? '--'}% · CPI: {macroIndicators?.cpi?.toFixed(1) ?? '--'}%
                    </div>
                  </div>
                  {/* 中国时钟 */}
                  <div style={{ padding: 14, background: '#fff5f5', borderRadius: 8, border: '1px solid #fed7d7' }}>
                    <div style={{ fontSize: 12, color: '#c53030', fontWeight: 600, marginBottom: 8 }}>🇨🇳 中国经济周期</div>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                      {(['recovery', 'overheat', 'stagflation', 'recession'] as const).map(q => (
                        <div key={q} style={{
                          padding: '4px 8px', borderRadius: 4, fontSize: 11,
                          background: cycleQuadrantCN === q ? '#c53030' : '#e2e8f0',
                          color: cycleQuadrantCN === q ? '#fff' : '#4a5568',
                          fontWeight: cycleQuadrantCN === q ? 600 : 400,
                        }}>
                          {q === 'recovery' ? '复苏' : q === 'overheat' ? '过热' : q === 'stagflation' ? '滞胀' : '衰退'}
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize: 11, color: '#718096' }}>
                      {cycleQuadrantCN === cycleQuadrantUS ? '与美国周期同步' : '与美国周期背离（略滞后）'}
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. SAA基准 + 周期修正 (预设值 + 美林周期调整) */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#2d5a87', marginBottom: 8 }}>⚖️ SAA基准 + 美林周期修正</div>
                {saaResult && (
                  <div style={{ fontSize: 11, color: '#718096', marginBottom: 6 }}>
                    <span style={{ background: cycleQuadrantUS === 'recovery' ? '#f0fff4' : cycleQuadrantUS === 'overheat' ? '#fff5f5' : cycleQuadrantUS === 'stagflation' ? '#fffbeb' : '#ebf8ff', padding: '2px 8px', borderRadius: 4 }}>
                      美国周期: {cycleQuadrantUS === 'recovery' ? '复苏' : cycleQuadrantUS === 'overheat' ? '过热' : cycleQuadrantUS === 'stagflation' ? '滞胀' : '衰退'}
                    </span>
                    <span style={{ marginLeft: 8 }}>中国周期: {cycleQuadrantCN === 'recovery' ? '复苏' : cycleQuadrantCN === 'overheat' ? '过热' : cycleQuadrantCN === 'stagflation' ? '滞胀' : '衰退'}</span>
                  </div>
                )}
                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table" style={{ fontSize: 12 }}>
                    <thead>
                      <tr>
                        <th>资产</th>
                        <th>SAA基准</th>
                        <th>周期调整</th>
                        <th>调整后</th>
                        <th>Risk上限</th>
                        <th>最终约束</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* 后端返回数据优先，否则使用预设值 */}
                      {saaResult?.cycle_table?.map((row: any) => {
                        const delta = row.delta;
                        const deltaColor = delta > 0 ? '#38a169' : delta < 0 ? '#e53e3e' : '#718096';
                        const deltaSign = delta > 0 ? '+' : '';
                        return (
                          <tr key={row.asset}>
                            <td>{row.asset}</td>
                            <td>{(row.saa_base * 100).toFixed(0)}%</td>
                            <td style={{ color: deltaColor, fontWeight: 600 }}>{deltaSign}{(delta * 100).toFixed(0)}%</td>
                            <td style={{ fontWeight: 600, color: '#2d5a87' }}>{(row.adjusted * 100).toFixed(0)}%</td>
                            <td style={{ color: '#718096' }}>≤{(row.risk_limit * 100).toFixed(0)}%</td>
                            <td>
                              <span style={{ color: '#e53e3e', fontWeight: 600 }}>≤{(row.final_constraint * 100).toFixed(0)}%</span>
                            </td>
                          </tr>
                        );
                      })}
                      {/* 无后端数据时使用预设值 */}
                      {!saaResult?.cycle_table && (() => {
                        const quadrant = cycleQuadrantUS;
                        const adjMap: Record<string, Record<string, number>> = {
                          recovery:    { equity: 10, bond: 5, cash: -5, gold: 0, foreign: -5 },
                          overheat:    { equity: 5, bond: -5, cash: -5, gold: 5, foreign: 0 },
                          stagflation: { equity: -10, bond: -5, cash: 5, gold: 10, foreign: 0 },
                          recession:   { equity: -10, bond: 10, cash: 0, gold: 5, foreign: -5 },
                        };
                        const adj = adjMap[quadrant] || adjMap['recovery'];
                        const assets = [
                          { name: '沪深300', code: '510300.SH', base: 25, key: 'equity' },
                          { name: '纳指ETF', code: '159605.SZ', base: 25, key: 'equity' },
                          { name: '国债ETF', code: '511010.SH', base: 30, key: 'bond' },
                          { name: '黄金ETF', code: '518880.SH', base: 5,  key: 'gold' },
                          { name: '原油ETF', code: '162411.SZ', base: 10, key: 'cash' },
                          { name: '纳指ETF(上)', code: '513100.SH', base: 5,  key: 'foreign' },
                        ];
                        return assets.map(row => {
                          const delta = adj[row.key] || 0;
                          const adjusted = row.base + delta;
                          const riskLimit = row.key === 'equity' ? (clientProfile?.maxSingleStock ?? 0.3) :
                                           row.key === 'bond' ? 1.0 :
                                           row.key === 'foreign' ? (clientProfile?.maxCryptoWeight ?? 0.05) : 1.0;
                          const finalConstr = Math.min(adjusted / 100, riskLimit);
                          const deltaColor = delta > 0 ? '#38a169' : delta < 0 ? '#e53e3e' : '#718096';
                          const deltaSign = delta > 0 ? '+' : '';
                          return (
                            <tr key={row.code}>
                              <td>{row.name}</td>
                              <td>{row.base}%</td>
                              <td style={{ color: deltaColor, fontWeight: 600 }}>{deltaSign}{delta}%</td>
                              <td style={{ fontWeight: 600, color: '#2d5a87' }}>{adjusted}%</td>
                              <td style={{ color: '#718096' }}>
                                {row.key === 'equity' ? `≤${((clientProfile?.maxSingleStock ?? 0.3) * 100).toFixed(0)}%` :
                                 row.key === 'bond' ? `≥${((clientProfile?.minBondWeight ?? 0.15) * 100).toFixed(0)}%` :
                                 row.key === 'foreign' ? `≤${((clientProfile?.maxCryptoWeight ?? 0.05) * 100).toFixed(0)}%` : '—'}
                              </td>
                              <td>
                                <span style={{ color: '#e53e3e', fontWeight: 600 }}>≤{(finalConstr * 100).toFixed(0)}%</span>
                              </td>
                            </tr>
                          );
                        });
                      })()}
                      {/* 现金配置行 */}
                      <tr style={{ background: '#f0fff4' }}>
                        <td><strong>💵 现金</strong></td>
                        <td>—</td>
                        <td>—</td>
                        <td>—</td>
                        <td>—</td>
                        <td><strong style={{ color: '#38a169' }}>{((saaResult?.cash_weight ?? 0) * 100).toFixed(0)}%</strong></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div style={{ fontSize: 11, color: '#a0aec0', marginTop: 4 }}>
                  * 最终约束 = min(SAA周期调整, Risk Level)；所有资产+现金=100%；预设SAA基准可自由调整
                </div>
              </div>

              {/* 3. MinerU 研报解读（防火墙1：定性参考，不形成约束） */}
              {researchInsights && researchInsights.length > 0 && (
                <div style={{ marginBottom: 20, padding: 12, background: '#fffbeb', borderRadius: 8, border: '1px solid #f6ad55' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#b7791f' }}>📄 MinerU 研报解读（定性参考，不形成约束）</div>
                    <span style={{ fontSize: 10, color: '#f6ad55', background: '#fff', padding: '2px 6px', borderRadius: 4 }}>防火墙①</span>
                  </div>
                  {researchInsights.map((pdf: any, idx: number) => (
                    <div key={idx} style={{ marginBottom: 8, padding: 8, background: '#fff', borderRadius: 4 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <div style={{ fontSize: 11, color: '#b7791f', fontWeight: 600 }}>{pdf.source?.replace('.pdf', '').replace(/_/g, ' ')}</div>
                        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, background: pdf.direction === 'bullish' ? '#c6f6d5' : pdf.direction === 'bearish' ? '#fed7d7' : '#e2e8f0', color: pdf.direction === 'bullish' ? '#38a169' : pdf.direction === 'bearish' ? '#e53e3e' : '#718096' }}>
                          {pdf.direction === 'bullish' ? '看多' : pdf.direction === 'bearish' ? '看空' : '中性'}
                        </span>
                      </div>
                      {pdf.key_argument && (
                        <div style={{ fontSize: 12, color: '#4a5568', lineHeight: 1.6 }}>
                          <span style={{ color: '#38a169', fontWeight: 600 }}>核心观点：</span>
                          {pdf.key_argument.length > 150 ? pdf.key_argument.slice(0, 150) + '...' : pdf.key_argument}
                        </div>
                      )}
                      {pdf.related_assets?.length > 0 && (
                        <div style={{ fontSize: 10, color: '#a0aec0', marginTop: 4 }}>
                          涉及资产：{pdf.related_assets.join(' / ')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* 4. 市场情绪 */}
              {marketSentiment && (
                <div style={{ marginBottom: 20, padding: 14, background: marketSentiment.sentiment === 'greed' ? '#f0fff4' : marketSentiment.sentiment === 'fear' ? '#fff5f5' : '#f7fafc', borderRadius: 8, border: '1px solid' + (marketSentiment.sentiment === 'greed' ? '#c6f6d5' : marketSentiment.sentiment === 'fear' ? '#fed7d7' : '#e2e8f0') }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#4a5568' }}>📈 市场情绪</div>
                    {marketSentiment.vix !== null && (
                      <div style={{ fontSize: 12, color: '#718096' }}>VIX <strong style={{ color: marketSentiment.vix > 25 ? '#e53e3e' : '#38a169' }}>{marketSentiment.vix.toFixed(1)}</strong></div>
                    )}
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: marketSentiment.sentiment === 'greed' ? '#38a169' : marketSentiment.sentiment === 'fear' ? '#e53e3e' : '#718096' }}>
                    {marketSentiment.sentiment === 'greed' ? '🟢 贪婪' : marketSentiment.sentiment === 'fear' ? '🔴 恐惧' : '⚪ 中性'}
                    {marketSentiment.fearGreedIndex !== null && (
                      <span style={{ fontSize: 13, fontWeight: 400, marginLeft: 8 }}>(Fear & Greed: {marketSentiment.fearGreedIndex})</span>
                    )}
                  </div>
                </div>
              )}

              {/* 5. 市场热点 - 分类新闻 */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#4a5568', marginBottom: 8 }}>📰 市场热点</div>
                {/* 中国资产 */}
                {newsCN.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 11, color: '#c53030', fontWeight: 600, marginBottom: 4 }}>🇨🇳 中国资产</div>
                    <div style={{ maxHeight: 80, overflow: 'auto' }}>
                      {newsCN.slice(0, 3).map((item: any, idx: number) => (
                        <div key={idx} style={{ marginBottom: 4, padding: 4, background: '#fff5f5', borderRadius: 4 }}>
                          <div style={{ fontSize: 10, color: '#a0aec0' }}>{item.source} · {item.time || '今日'}</div>
                          <a href={item.url || '#'} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#2d3748', textDecoration: 'none' }}>
                            {item.title?.length > 60 ? item.title.slice(0, 60) + '...' : item.title}
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {/* 美国资产 */}
                {newsUS.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 11, color: '#2b6cb0', fontWeight: 600, marginBottom: 4 }}>🇺🇸 美国资产</div>
                    <div style={{ maxHeight: 80, overflow: 'auto' }}>
                      {newsUS.slice(0, 3).map((item: any, idx: number) => (
                        <div key={idx} style={{ marginBottom: 4, padding: 4, background: '#ebf8ff', borderRadius: 4 }}>
                          <div style={{ fontSize: 10, color: '#a0aec0' }}>{item.source} · {item.time || '今日'}</div>
                          <a href={item.url || '#'} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#2d3748', textDecoration: 'none' }}>
                            {item.title?.length > 60 ? item.title.slice(0, 60) + '...' : item.title}
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {/* 加密货币 */}
                {newsCrypto.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 11, color: '#6b46c1', fontWeight: 600, marginBottom: 4 }}>₿ 加密货币</div>
                    <div style={{ maxHeight: 80, overflow: 'auto' }}>
                      {newsCrypto.slice(0, 3).map((item: any, idx: number) => (
                        <div key={idx} style={{ marginBottom: 4, padding: 4, background: '#faf5ff', borderRadius: 4 }}>
                          <div style={{ fontSize: 10, color: '#a0aec0' }}>{item.source} · {item.time || '今日'}</div>
                          <a href={item.url || '#'} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#2d3748', textDecoration: 'none' }}>
                            {item.title?.length > 60 ? item.title.slice(0, 60) + '...' : item.title}
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {/* 商品 */}
                {newsCommodities.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, color: '#38a169', fontWeight: 600, marginBottom: 4 }}>🛢️ 大宗商品</div>
                    <div style={{ maxHeight: 80, overflow: 'auto' }}>
                      {newsCommodities.slice(0, 2).map((item: any, idx: number) => (
                        <div key={idx} style={{ marginBottom: 4, padding: 4, background: '#f0fff4', borderRadius: 4 }}>
                          <div style={{ fontSize: 10, color: '#a0aec0' }}>{item.source} · {item.time || '今日'}</div>
                          <a href={item.url || '#'} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#2d3748', textDecoration: 'none' }}>
                            {item.title?.length > 60 ? item.title.slice(0, 60) + '...' : item.title}
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {(newsCN.length === 0 && newsUS.length === 0 && newsCrypto.length === 0 && newsCommodities.length === 0) && (
                  <div style={{ fontSize: 11, color: '#a0aec0', padding: 12, textAlign: 'center' }}>正在加载市场热点...</div>
                )}
              </div>

              {/* 6. 资产池 + Tushare历史统计 */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#4a5568', marginBottom: 8 }}>📊 资产池历史统计（Tushare / Yahoo Finance）</div>
                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table" style={{ fontSize: 12 }}>
                    <thead><tr><th>代码</th><th>名称</th><th>类型</th><th>近6月年化收益</th><th>年化波动率</th></tr></thead>
                    <tbody>
                      {ASSET_POOL.map(a => {
                        const stats = historicalStats[a.code];
                        return (
                          <tr key={a.code}>
                            <td style={{ fontFamily: 'JetBrains Mono, monospace' }}>{a.code}</td>
                            <td>{a.name}</td>
                            <td>
                              <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 3,
                                background: a.type === 'equity' ? '#ebf8ff' : a.type === 'bond' ? '#f0fff4' : a.type === 'commodity' ? '#fff5f5' : '#faf5ff',
                                color: a.type === 'equity' ? '#2b6cb0' : a.type === 'bond' ? '#38a169' : a.type === 'commodity' ? '#c53030' : '#6b46c1'
                              }}>
                                {a.type === 'equity' ? '权益' : a.type === 'bond' ? '债券' : a.type === 'commodity' ? '商品' : '另类'}
                              </span>
                            </td>
                            <td className={stats && stats.annualReturn > 0 ? 'weight-positive' : 'weight-negative'} style={{ fontWeight: 600 }}>
                              {stats ? `${(stats.annualReturn * 100).toFixed(1)}%` : `${(a.expectedReturn * 100).toFixed(1)}%`}
                              {!stats && <span style={{ fontSize: 10, color: '#a0aec0' }}> (默认)</span>}
                            </td>
                            <td style={{ color: '#718096' }}>
                              {stats ? `${(stats.annualVol * 100).toFixed(1)}%` : `${(a.volatility * 100).toFixed(1)}%`}
                              {!stats && <span style={{ fontSize: 10, color: '#a0aec0' }}> (默认)</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {Object.keys(historicalStats).length === 0 && (
                  <div style={{ fontSize: 11, color: '#a0aec0', marginTop: 4 }}>
                    将在「开始组合优化」时自动拉取 Tushare 数据计算实际统计值
                  </div>
                )}
              </div>

              {/* 宏观指标详情（折叠保留） */}
              {macroFactors.length > 0 && (
                <div style={{ marginBottom: 16, padding: 12, background: '#f7fafc', borderRadius: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#4a5568', marginBottom: 6 }}>📐 宏观指标详情</div>
                  <div style={{ fontSize: 11, color: '#718096', lineHeight: 1.8 }}>
                    {macroFactors.map((f, idx) => (
                      <div key={idx}>{f}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {/* ===== V3.2 MarketInsight Agent end ===== */}

            {/* V3.2: BL 模型 τ 调节滑块 */}
              <div style={{ marginTop: 16, padding: 16, background: '#f7fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>⚙️ BL模型参数调节</div>
                <div style={{ fontSize: 12, color: '#718096', marginBottom: 8 }}>
                  τ (tau) 控制主观观点权重：τ越小越信任历史先验，τ越大越信任主观判断
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 12, color: '#718096' }}>保守</span>
                  <input
                    type="range"
                    min="0.01"
                    max="0.5"
                    step="0.01"
                    value={tauValue}
                    onChange={(e) => setTauValue(parseFloat(e.target.value))}
                    style={{ flex: 1 }}
                  />
                  <span style={{ fontSize: 12, color: '#718096' }}>激进</span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#2d5a87', minWidth: 48, textAlign: 'right' }}>
                    τ={tauValue.toFixed(2)}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: '#a0aec0', marginTop: 4 }}>
                  {tauValue < 0.05 ? '主要依赖历史先验，稳健配置' :
                   tauValue < 0.20 ? '适度融合历史与观点，平衡风格' :
                   '侧重主观观点，激进配置'}
                </div>
              </div>

              {/* V3.2: 用户观点输入 */}
              <div style={{ marginTop: 16, padding: 16, background: '#fffbeb', borderRadius: 8, border: '1px solid #f6ad55' }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>📝 用户主观观点输入</div>
                <div style={{ fontSize: 12, color: '#718096', marginBottom: 12 }}>
                  设置对各资产的收益预期和置信度，观点将融入BL模型优化
                </div>

                {/* 已有观点列表 */}
                {userViews.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    {userViews.map((view, idx) => {
                      const assetInfo = ASSET_POOL.find(a => a.code === view.asset);
                      return (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, padding: '8px 12px', background: '#f7fafc', borderRadius: 6 }}>
                          <span style={{ fontSize: 13, flex: 1 }}>
                            <strong>{assetInfo?.name || view.asset}</strong>: 预期 {view.viewReturn >= 0 ? '+' : ''}{(view.viewReturn * 100).toFixed(0)}%
                          </span>
                          <span style={{ fontSize: 11, color: '#718096' }}>置信度: {'★'.repeat(view.confidence)}{'☆'.repeat(5 - view.confidence)}</span>
                          <button
                            onClick={() => setUserViews(userViews.filter((_, i) => i !== idx))}
                            style={{ padding: '2px 8px', background: '#fed7d7', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}
                          >删除</button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 添加观点表单 */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div className="form-group">
                    <div className="form-label">选择资产</div>
                    <select
                      className="form-input"
                      value={newViewAsset}
                      onChange={(e) => setNewViewAsset(e.target.value)}
                      style={{ fontSize: 12 }}
                    >
                      <option value="">-- 选择 --</option>
                      {ASSET_POOL.map(a => (
                        <option key={a.code} value={a.code}>{a.name} ({a.code})</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <div className="form-label">置信度 (1-5星)</div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {[1, 2, 3, 4, 5].map(star => (
                        <span
                          key={star}
                          onClick={() => setNewViewConfidence(star)}
                          style={{ cursor: 'pointer', fontSize: 16, color: star <= newViewConfidence ? '#f6ad55' : '#cbd5e0' }}
                        >
                          ★
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: 12 }}>
                  <div className="form-label">
                    预期年化收益率: {newViewReturn >= 0 ? '+' : ''}{(newViewReturn * 100).toFixed(0)}%
                  </div>
                  <input
                    type="range"
                    min="-0.20"
                    max="0.30"
                    step="0.01"
                    value={newViewReturn}
                    onChange={(e) => setNewViewReturn(parseFloat(e.target.value))}
                    style={{ width: '100%' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#a0aec0' }}>
                    <span>-20%</span>
                    <span>0%</span>
                    <span>+30%</span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btn btn-primary"
                    onClick={addUserView}
                    disabled={!newViewAsset}
                    style={{ fontSize: 12, padding: '6px 12px' }}
                  >
                    + 添加观点
                  </button>
                  {userViews.length > 0 && (
                    <button
                      className="btn btn-outline"
                      onClick={() => setUserViews([])}
                      style={{ fontSize: 12, padding: '6px 12px' }}
                    >
                      清除所有
                    </button>
                  )}
                </div>
              </div>

            <div className="btn-row">
              <button className="btn btn-primary" onClick={startOptimization}>⚡ 开始组合优化 (BL模型)</button>
              <button className="btn btn-outline" onClick={resetAll}>↺ 重新测评</button>
            </div>
          </>
        )}

        {/* Step 3: Optimization Results */}
        {step === 3 && (
          <>
            {isProcessing ? (
              <div className="card" style={{ textAlign: 'center', padding: 48 }}>
                <div className="loading-spinner" style={{ width: 48, height: 48, margin: '0 auto 24px' }}></div>
                <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>正在调用 AssetAlloc Agent (BL模型 + Tushare数据)...</div>
                <div style={{ color: '#718096' }}>MarketInsight → 宏观约束 → BL融合 → 均值方差优化</div>
              </div>
            ) : portfolioResult && (
              <>
                <div className="card">
                  <div className="card-title">📊 资产配置权重 (Markowitz优化)</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                    <PieChart data={Object.entries(portfolioResult.weights).map(([k, v]) => ({ name: ASSET_POOL.find(a => a.code === k)?.name || k, value: v }))} />
                    <div>
                      <div className="data-grid" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 16 }}>
                        <div className="data-item">
                          <div className="data-label">预期收益率</div>
                          <div className="data-value" style={{ color: '#38a169' }}>{(portfolioResult.expectedReturn * 100).toFixed(1)}<span className="data-unit">%</span></div>
                        </div>
                        <div className="data-item">
                          <div className="data-label">预期波动率</div>
                          <div className="data-value">{(portfolioResult.expectedVolatility * 100).toFixed(1)}<span className="data-unit">%</span></div>
                        </div>
                        <div className="data-item">
                          <div className="data-label">夏普比率</div>
                          <div className="data-value" style={{ color: '#2d5a87' }}>{portfolioResult.sharpeRatio}</div>
                        </div>
                        <div className="data-item">
                          <div className="data-label">预测最大回撤</div>
                          <div className="data-value" style={{ color: '#e53e3e' }}>-{(portfolioResult.maxDrawdown * 100).toFixed(1)}<span className="data-unit">%</span></div>
                        </div>
                      </div>
                      <table className="data-table">
                        <thead><tr><th>资产</th><th>配置比例</th></tr></thead>
                        <tbody>
                          {Object.entries(portfolioResult.weights).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                            <tr key={k}>
                              <td>{ASSET_POOL.find(a => a.code === k)?.name} ({k})</td>
                              <td className="weight-positive">{(v * 100).toFixed(1)}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* QuantRisk Agent Results */}
                {quantRiskResult && (
                  <div className="card" style={{ marginTop: 24, border: quantRiskResult.status === 'PASS' ? '2px solid #38a169' : '2px solid #e53e3e' }}>
                    <div className="card-title">
                      🛡️ 风控压力测试 (QuantRisk Agent)
                      {quantRiskResult.status === 'PASS' ? (
                        <span style={{ color: '#38a169', marginLeft: 12 }}>✅ 通过</span>
                      ) : (
                        <span style={{ color: '#e53e3e', marginLeft: 12 }}>❌ 未通过</span>
                      )}
                    </div>

                    <div style={{ marginBottom: 16, color: '#718096' }}>
                      {quantRiskResult.recommendation}
                    </div>

                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>场景</th>
                          <th>时间区间</th>
                          <th>组合收益</th>
                          <th>回撤</th>
                          <th>状态</th>
                        </tr>
                      </thead>
                      <tbody>
                        {quantRiskResult.results.map((r) => {
                          const scenario = STRESS_SCENARIOS.find(s => s.id === r.scenarioId);
                          return (
                            <tr key={r.scenarioId}>
                              <td>{scenario?.name}</td>
                              <td>{scenario?.period}</td>
                              <td className={r.portfolioReturn >= 0 ? 'weight-positive' : 'weight-negative'}>
                                {(r.portfolioReturn * 100).toFixed(1)}%
                              </td>
                              <td className="weight-negative">
                                {(r.observedDrawdown * 100).toFixed(1)}%
                              </td>
                              <td>
                                {r.status === 'PASS' ? (
                                  <span style={{ color: '#38a169' }}>✅ PASS</span>
                                ) : (
                                  <span style={{ color: '#e53e3e' }}>❌ FAIL</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    {/* Risk Education Section */}
                    {quantRiskResult.results.map((r, _idx) => (
                      <div key={r.scenarioId} style={{ marginTop: 16, padding: 12, background: '#f7fafc', borderRadius: 8 }}>
                        <div style={{ fontSize: 13, color: '#718096', marginBottom: 8 }}>
                          {explainStressTest(r.scenarioId, r.observedDrawdown, '组合资产', portfolioResult?.weights || {})}
                        </div>
                        <div style={{ fontSize: 12, color: '#4a5568' }}>
                          💡 {explainMetric('MaxDrawdown', r.observedDrawdown, STRESS_SCENARIOS.find(s => s.id === r.scenarioId)?.name || '历史')}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="btn-row">
                  <button className="btn btn-primary" onClick={() => setStep(4)}>📊 进入历史回测</button>
                  <button className="btn btn-outline" onClick={resetAll}>↺ 重新开始</button>
                </div>
              </>
            )}
          </>
        )}

        {/* Step 4: Backtest - New! */}
        {step === 4 && portfolioResult && (
          <>
            <div className="card">
              <div className="card-title">📊 历史回测 (Backtest Engine)</div>

              <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
                <div className="form-group">
                  <div className="form-label">回测周期</div>
                  <select
                    className="form-input"
                    value={backtestConfig.period}
                    onChange={(e) => setBacktestConfig({ ...backtestConfig, period: e.target.value as any })}
                  >
                    <option value="1Y">1年</option>
                    <option value="3Y">3年</option>
                    <option value="5Y">5年</option>
                  </select>
                </div>
                <div className="form-group">
                  <div className="form-label">再平衡频率</div>
                  <select
                    className="form-input"
                    value={backtestConfig.rebalanceFrequency}
                    onChange={(e) => setBacktestConfig({ ...backtestConfig, rebalanceFrequency: e.target.value as any })}
                  >
                    <option value="monthly">月度</option>
                    <option value="quarterly">季度</option>
                  </select>
                </div>
                <div className="form-group">
                  <div className="form-label">基准</div>
                  <select
                    className="form-input"
                    value={backtestConfig.benchmark}
                    onChange={(e) => setBacktestConfig({ ...backtestConfig, benchmark: e.target.value as any })}
                  >
                    <option value="159605.SZ">纳指ETF</option>
                    <option value="510300.SH">沪深300</option>
                    <option value="60_40">60/40</option>
                  </select>
                </div>
              </div>

              <div className="btn-row">
                <button className="btn btn-primary" onClick={async () => {
                  setIsProcessing(true);
                  try {
                    // ===== V3.2: 使用 Tushare 数据进行恒定比例持有回测 =====
                    const assets = ASSET_POOL.map(a => a.code);
                    const prices = await fetchTusharePrices(assets, backtestConfig.period === '1Y' ? '1y' : '6m');

                    // 生成日期序列
                    const today = new Date();
                    const startDate = new Date(today);
                    startDate.setMonth(startDate.getMonth() - (backtestConfig.period === '1Y' ? 12 : 6));
                    const dates: string[] = [];
                    const days = Object.values(prices)[0]?.length ?? 252;
                    for (let i = 0; i < days; i++) {
                      const d = new Date(startDate);
                      d.setDate(d.getDate() + i);
                      dates.push(d.toISOString().split('T')[0]);
                    }

                    const btConfig: BacktestConfigV2 = {
                      period: backtestConfig.period === '1Y' ? '1y' : '6m',
                      rebalanceFreq: backtestConfig.rebalanceFrequency === 'monthly' ? 'monthly' : 'quarterly',
                      benchmarks: [backtestConfig.benchmark],
                      initialCapital: 1_000_000,
                    };

                    const resultV2 = runBacktestV2(portfolioResult.weights, prices, dates, btConfig);

                    // 转换为 V1 格式兼容 UI
                    const resultV1: BacktestResult = {
                      period: backtestConfig.period,
                      rebalanceFrequency: backtestConfig.rebalanceFrequency,
                      benchmark: backtestConfig.benchmark,
                      totalReturn: resultV2.metrics.totalReturn,
                      annualizedReturn: resultV2.metrics.annualizedReturn,
                      annualizedVolatility: resultV2.metrics.volatility,
                      sharpeRatio: resultV2.metrics.sharpeRatio,
                      maxDrawdown: resultV2.metrics.maxDrawdown,
                      winRate: resultV2.metrics.winRate,
                      bestMonth: resultV2.metrics.bestMonth.ret,
                      worstMonth: resultV2.metrics.worstMonth.ret,
                      monthlyReturns: resultV2.monthlyReturns.map(m => m.portfolioReturn),
                      equityCurve: resultV2.navCurve.map(n => n.nav / resultV2.navCurve[0].nav),
                      benchmarkCurve: resultV2.navCurve.map(n => n.nav / resultV2.navCurve[0].nav),
                      assetCurves: {},
                      monthlyData: resultV2.monthlyReturns.map((m) => ({
                        date: m.month,
                        portfolio: 1 + m.portfolioReturn,
                        benchmark: 1,
                        assets: {},
                      })),
                    };

                    setBacktestResult(resultV1);
                  } catch (error) {
                    console.error('Backtest error:', error);
                    const result = runBacktest(portfolioResult.weights, backtestConfig);
                    setBacktestResult(result);
                  } finally {
                    setIsProcessing(false);
                  }
                }}>
                  ▶️ 运行回测 (V3.2 Tushare数据)
                </button>
              </div>

              {backtestResult && (
                <>
                  <div className="data-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginTop: 24 }}>
                    <div className="data-item">
                      <div className="data-label">总收益</div>
                      <div className="data-value" style={{ color: backtestResult.totalReturn >= 0 ? '#38a169' : '#e53e3e' }}>
                        {(backtestResult.totalReturn * 100).toFixed(1)}%
                      </div>
                    </div>
                    <div className="data-item">
                      <div className="data-label">年化收益</div>
                      <div className="data-value" style={{ color: backtestResult.annualizedReturn >= 0 ? '#38a169' : '#e53e3e' }}>
                        {(backtestResult.annualizedReturn * 100).toFixed(1)}%
                      </div>
                    </div>
                    <div className="data-item">
                      <div className="data-label">年化波动率</div>
                      <div className="data-value">{(backtestResult.annualizedVolatility * 100).toFixed(1)}%</div>
                    </div>
                    <div className="data-item">
                      <div className="data-label">夏普比率</div>
                      <div className="data-value">{backtestResult.sharpeRatio.toFixed(2)}</div>
                    </div>
                  </div>

                  {/* Metric Explanations */}
                  <div style={{ marginTop: 16, padding: 12, background: '#f7fafc', borderRadius: 8, fontSize: 13, color: '#4a5568' }}>
                    <div>{explainMetric('SharpeRatio', backtestResult.sharpeRatio, '')}</div>
                    <div style={{ marginTop: 8 }}>{explainMetric('MaxDrawdown', backtestResult.maxDrawdown, backtestConfig.period)}</div>
                    <div style={{ marginTop: 8 }}>{explainMetric('WinRate', backtestResult.winRate, '')}</div>
                  </div>

                  <div className="data-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginTop: 16 }}>
                    <div className="data-item">
                      <div className="data-label">最大回撤</div>
                      <div className="data-value" style={{ color: '#e53e3e' }}>-{(backtestResult.maxDrawdown * 100).toFixed(1)}%</div>
                    </div>
                    <div className="data-item">
                      <div className="data-label">胜率</div>
                      <div className="data-value">{(backtestResult.winRate * 100).toFixed(1)}%</div>
                    </div>
                    <div className="data-item">
                      <div className="data-label">最佳月</div>
                      <div className="data-value" style={{ color: '#38a169' }}>+{(backtestResult.bestMonth * 100).toFixed(1)}%</div>
                    </div>
                    <div className="data-item">
                      <div className="data-label">最差月</div>
                      <div className="data-value" style={{ color: '#e53e3e' }}>{(backtestResult.worstMonth * 100).toFixed(1)}%</div>
                    </div>
                  </div>

                  {/* Equity Curve Chart */}
                  <div style={{ marginTop: 24, height: 300 }}>
                    <div className="form-label">净值曲线 (Portfolio vs Benchmark)</div>
                    <EquityCurveChart
                      equityCurve={backtestResult.equityCurve}
                      benchmarkCurve={backtestResult.benchmarkCurve}
                      assetCurves={backtestResult.assetCurves}
                    />
                  </div>
                </>
              )}
            </div>

            <div className="btn-row">
              <button className="btn btn-primary" onClick={() => setStep(5)}>🛡️ 进入风控检查</button>
              <button className="btn btn-outline" onClick={() => setStep(3)}>← 返回优化</button>
            </div>
          </>
        )}

        {/* Step 5: Stress Test */}
        {step === 5 && (
          <>
            {isProcessing ? (
              <div className="card" style={{ textAlign: 'center', padding: 48 }}>
                <div className="loading-spinner" style={{ width: 48, height: 48, margin: '0 auto 24px' }}></div>
                <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>正在运行 Stress Testing Agent...</div>
                <div style={{ color: '#718096' }}>5个历史极端场景 + VaR/CVaR 统计 + 一票否决机制</div>
              </div>
            ) : (
              <>
                <div className="card">
                  <div className="card-title">🛡️ 风控压力测试 (QuantRisk Agent)</div>
                  <div style={{ marginBottom: 24 }}>
                    <div style={{ fontSize: 14, color: '#718096', marginBottom: 8 }}>测试场景:</div>
                    <div className="asset-chips" style={{ gap: 8 }}>
                      {STRESS_SCENARIOS.map(s => (
                        <span key={s.id} className="asset-chip" style={{ background: '#fff5f5', border: '1px solid #fed7d7' }}>{s.name}</span>
                      ))}
                    </div>
                  </div>
                  <div style={{ marginBottom: 16, padding: 12, background: '#f7fafc', borderRadius: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span>客户最大回撤容忍:</span>
                      <strong>{(clientProfile?.maxDrawdown || 0.1) * 100}%</strong>
                    </div>
                    <div style={{ fontSize: 13, color: '#718096' }}>任一场景回撤超过此阈值将导致风控检查失败</div>
                  </div>
                  {!quantRiskResult && (
                    <div style={{ textAlign: 'center', padding: 24 }}>
                      <button className="btn btn-primary" onClick={runStressTest}>🛡️ 运行压力测试</button>
                    </div>
                  )}
                  {quantRiskResult && (
                    <>
                      {/* V3.2: Stress Testing Agent 结果 */}
                      {stressTestResultV2 && (
                        <div style={{ padding: 16, borderRadius: 8, marginBottom: 16,
                          border: stressTestResultV2.passed ? '2px solid #38a169' : '2px solid #e53e3e',
                          background: stressTestResultV2.passed ? '#f0fff4' : '#fff5f5' }}>
                          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                            🛡️ Stress Testing Agent (V3.2)
                          </div>
                          <div style={{ display: 'flex', gap: 24, marginBottom: 8 }}>
                            <div>
                              <div style={{ fontSize: 12, color: '#718096' }}>VaR (95%)</div>
                              <div style={{ fontSize: 16, fontWeight: 600, color: '#e53e3e' }}>
                                {(stressTestResultV2.var95 * 100).toFixed(2)}%
                              </div>
                            </div>
                            <div>
                              <div style={{ fontSize: 12, color: '#718096' }}>CVaR (95%)</div>
                              <div style={{ fontSize: 16, fontWeight: 600, color: '#e53e3e' }}>
                                {(stressTestResultV2.cvar95 * 100).toFixed(2)}%
                              </div>
                            </div>
                            <div>
                              <div style={{ fontSize: 12, color: '#718096' }}>最差场景</div>
                              <div style={{ fontSize: 16, fontWeight: 600, color: '#e53e3e' }}>
                                {(stressTestResultV2.worstCase * 100).toFixed(1)}%
                              </div>
                            </div>
                          </div>
                          <div style={{ fontSize: 13, color: '#4a5568', marginTop: 8 }}>
                            {stressTestResultV2.recommendation === 'APPROVE' ? '✅ 建议放行' :
                             stressTestResultV2.recommendation === 'WARN' ? '⚠️ 建议关注' : '❌ 建议重新配置'}
                          </div>
                          {/* V2 场景明细 */}
                          <div style={{ marginTop: 12 }}>
                            {Object.entries(stressTestResultV2.scenarioResults).map(([id, r]) => (
                              <div key={id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #e2e8f0', fontSize: 12 }}>
                                <span>{r.scenarioName}</span>
                                <span className={r.passed ? 'weight-positive' : 'weight-negative'}>
                                  {r.portfolioLoss >= 0 ? '+' : ''}{(r.portfolioLoss * 100).toFixed(1)}%
                                  {r.passed ? ' ✅' : ` ❌ 突破${(r.breach * 100).toFixed(1)}%`}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div style={{ padding: 16, borderRadius: 8, marginBottom: 16, border: quantRiskResult.status === 'PASS' ? '2px solid #38a169' : '2px solid #e53e3e', background: quantRiskResult.status === 'PASS' ? '#f0fff4' : '#fff5f5' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                          <span style={{ fontSize: 24 }}>{quantRiskResult.status === 'PASS' ? '✅' : '❌'}</span>
                          <span style={{ fontSize: 18, fontWeight: 600 }}>{quantRiskResult.status === 'PASS' ? '风控检查通过' : '风控检查未通过'}</span>
                        </div>
                        <div style={{ color: '#718096' }}>{quantRiskResult.recommendation}</div>
                      </div>
                      <table className="data-table">
                        <thead><tr><th>场景</th><th>时间区间</th><th>组合收益</th><th>回撤</th><th>状态</th></tr></thead>
                        <tbody>
                          {quantRiskResult.results.map((r) => {
                            const scenario = STRESS_SCENARIOS.find(s => s.id === r.scenarioId);
                            return (
                              <tr key={r.scenarioId}>
                                <td>{scenario?.name}</td>
                                <td>{scenario?.period}</td>
                                <td className={r.portfolioReturn >= 0 ? 'weight-positive' : 'weight-negative'}>{(r.portfolioReturn * 100).toFixed(1)}%</td>
                                <td className="weight-negative">{(r.observedDrawdown * 100).toFixed(1)}%</td>
                                <td>{r.status === 'PASS' ? <span style={{ color: '#38a169' }}>✅</span> : <span style={{ color: '#e53e3e' }}>❌</span>}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      {quantRiskResult.status === 'FAIL' && (
                        <div style={{ marginTop: 16, padding: 12, background: '#fed7d7', borderRadius: 8 }}>
                          <strong>⚠️ 诊断:</strong> {quantRiskResult.results.find(r => r.scenarioId === quantRiskResult.worstScenario)?.diagnosis}
                        </div>
                      )}
                    </>
                  )}
                </div>
                <div className="btn-row">
                  {quantRiskResult?.status === 'PASS' ? (
                    <button className="btn btn-accent" onClick={proceedToReport}>📄 生成PDF报告</button>
                  ) : (
                    <button className="btn btn-outline" onClick={forceProceedToReport}>⚠️ 强制生成报告</button>
                  )}
                  <button className="btn btn-outline" onClick={() => setStep(3)}>← 返回优化</button>
                  <button className="btn btn-outline" onClick={resetAll}>↺ 重新开始</button>
                </div>
              </>
            )}
          </>
        )}

        {/* Step 5: Report Modal */}
        {showReport && (
          <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowReport(false)}>
            <div className="modal" ref={reportRef} style={{ maxWidth: 800 }}>
              <div className="modal-title">📋 投资决策报告</div>

              {/* One-Liner Summary */}
              <div style={{ padding: 16, background: 'linear-gradient(135deg, #1a365d 0%, #2d5a87 100%)', borderRadius: 12, color: 'white', marginBottom: 24 }}>
                <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 8 }}>一句话总结</div>
                <div style={{ fontSize: 16, fontWeight: 500 }}>
                  {clientProfile && portfolioResult
                    ? generateOneLiner(clientProfile, portfolioResult.weights, regime)
                    : '正在生成组合总结...'}
                </div>
              </div>

              <div className="report-section">
                <div className="report-part">Part A</div>
                <h2 className="report-h2">投资者需求摘要</h2>
                <p>风险评分: <strong>{clientProfile?.riskScore}</strong> | 风险类型: <strong>{clientProfile && CONSTRAINT_RULES[clientProfile.riskType].label}</strong></p>
                <p>最大回撤容忍: <strong>{(clientProfile?.maxDrawdown || 0) * 100}%</strong></p>
                <p>债券类最低占比: <strong>{(clientProfile?.minBondWeight || 0) * 100}%</strong></p>
                <p>加密资产最高占比: <strong>{(clientProfile?.maxCryptoWeight || 0) * 100}%</strong></p>
              </div>

              <div className="report-section">
                <div className="report-part">Part B</div>
                <h2 className="report-h2">市场环境诊断</h2>
                <p>当前宏观周期: <strong className={regime === 'inflation' ? 'regime-tag regime-inflation' : regime === 'recession' ? 'regime-tag regime-recession' : 'regime-tag regime-normal'}>
                  {regime === 'inflation' ? '通胀过热' : regime === 'recession' ? '避险衰退' : '正常运行'}
                </strong></p>
                <p>检测日期: <strong>{new Date().toLocaleDateString('zh-CN')}</strong></p>
                <table className="data-table">
                  <thead><tr><th>资产</th><th>预期收益</th><th>波动率</th></tr></thead>
                  <tbody>
                    {ASSET_POOL.map(a => (
                      <tr key={a.code}><td>{a.name}</td><td>{(a.expectedReturn * 100).toFixed(1)}%</td><td>{(a.volatility * 100).toFixed(1)}%</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="report-section">
                <div className="report-part">Part C</div>
                <h2 className="report-h2">资产配置建议</h2>
                {portfolioResult && (
                  <>
                    <p>预期年化收益: <strong>{(portfolioResult.expectedReturn * 100).toFixed(2)}%</strong> | 预期波动率: <strong>{(portfolioResult.expectedVolatility * 100).toFixed(2)}%</strong></p>
                    <p>夏普比率: <strong>{portfolioResult.sharpeRatio}</strong> | 预测最大回撤: <strong>-{(portfolioResult.maxDrawdown * 100).toFixed(2)}%</strong></p>
                    <table className="data-table">
                      <thead><tr><th>资产</th><th>配置权重</th></tr></thead>
                      <tbody>
                        {Object.entries(portfolioResult.weights).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                          <tr key={k}><td>{ASSET_POOL.find(a => a.code === k)?.name}</td><td>{(v * 100).toFixed(2)}%</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
              </div>

              <div className="report-section">
                <div className="report-part">Part D</div>
                <h2 className="report-h2">风险压力测试</h2>
                <p>在极端下跌行情下(-20%): <strong>组合预期下跌约{clientProfile ? Math.round(clientProfile.maxDrawdown * 20 * 100) : 10}%</strong></p>
                <p>在极端上涨行情下(+20%): <strong>组合预期上涨约{portfolioResult ? Math.round(portfolioResult.expectedReturn * 2 * 100) : 16}%</strong></p>
              </div>

              <div className="report-section" style={{ borderBottom: 'none' }}>
                <div className="report-part">Part E</div>
                <h2 className="report-h2">配置参数附录 (合规审计)</h2>
                <p>报告编号: <code>IA-{Date.now()}</code></p>
                <p>生成时间: <code>{new Date().toISOString()}</code></p>
                <p>优化器: <code>Quant_Optimizer_MCP (PyPortfolioOpt)</code></p>
              </div>

              <div style={{ marginTop: 32, display: 'flex', gap: 12, justifyContent: 'center' }}>
                <button className="btn btn-accent" onClick={downloadPDF}>⬇️ 下载PDF</button>
                <button className="btn btn-outline" onClick={() => setShowReport(false)}>关闭</button>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <footer style={{ marginTop: 48, textAlign: 'center', color: '#718096', fontSize: 13, padding: 24, borderTop: '1px solid #e2e8f0' }}>
          <div>投顾智能决策系统 v3.2 | 多智能体协同 | MarketInsight + AssetAlloc + Backtesting + StressTesting</div>
          <div style={{ marginTop: 8 }}>Powered by 大模型 + 动态量化模型解算</div>
        </footer>
      </main>
    </div>
  );
}