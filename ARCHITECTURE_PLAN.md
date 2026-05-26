# 多智能体协同作战投顾智能决策系统 — 架构设计 Plan v1.0

> **版本:** v1.1
> **日期:** 2026-04-24
> **更新:** 补全 Backtesting Agent + Stress Testing Agent 详细设计

---

## 1. 系统总体架构

### 1.1 全景拓扑图

```
用户输入
  │
  ├─ 客户名称 ──→ CustomerInsight Agent ──→ 客户画像(DD分析)
  │                      (MinerU + MiniMax M2.7)
  │
  ├─ KYC问卷 ──→ Risk Level Agent ──→ 风险画像 + 硬约束
  │
  └─ 投资参数 ──→ Orchestrator Agent ──→ 任务编排 + 流程调度
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
      MarketInsight    AssetAlloc       Backtesting
        Agent           Agent             Agent
      (宏观约束)       (BL优化)          (历史回测)
              │               │               │
              └───────────────┼───────────────┘
                              ▼
                     Stress Testing Agent
                          (风险压测)
                              │
                              ▼
                    ReportSynthesis Agent
                          (报告生成)
```

### 1.2 流水线执行顺序

| 步骤 | Agent | 前置依赖 | 输出 |
|------|-------|---------|------|
| 1 | CustomerInsight | — | 客户画像 |
| 2 | Risk Level | KYC问卷 | 风险等级 + 风险预算 |
| 3 | Orchestrator | 1+2 | 任务分发 |
| 4 | MarketInsight | 2的输出 | 宏观约束边界 |
| 5 | AssetAlloc | 4的输出 | 最优权重 |
| 6 | Backtesting | 5的输出 + Tushare历史数据 | 回测净值曲线 + 绩效指标 |
| 7 | Stress Testing | 5的输出 | 风险统计指标 |
| 8 | ReportSynthesis | 5+6+7 | 最终报告 |

---

## 2. Agent 详细设计

### 2.1 Orchestrator Agent — 调度中枢

**职责**：任务编排、状态流转、异常处理、节点协调。

#### 核心状态机

```
IDLE ──[启动]──→ PARSING_DD ──[完成]──→ RISK_ASSESSING
    │
    └─[无需DD]──→ RISK_ASSESSING
                              │
                              ▼
                        MARKET_ANALYZING ──[MarketInsight完成]──→ ALLOCATING
                                                                            │
                                                                            ▼
                                                                       RISK_CHECKING
                                                                            │
                                                                    ┌──────┴──────┐
                                                              Pass │            │ Fail
                                                                    ▼            ▼
                                                               REPORTING    REALLOCATING
                                                                    │            │
                                                                    └─────┬──────┘
                                                                          │
                                                                    [重新调AssetAlloc]
```

#### 关键设计

```typescript
interface OrchestratorState {
  step: Step;
  customerProfile: ClientProfile | null;
  riskProfile: RiskProfile | null;
  marketConstraints: MarketConstraints | null;
  portfolio: PortfolioResult | null;
  riskTest: RiskTestResult | null;
  retryCount: number;
}

interface OrchestratorAgent {
  // 核心调度方法
  run(userId: string, sessionId: string): AsyncGenerator<PipelineEvent>;

  // 状态查询
  getState(): OrchestratorState;

  // 人工干预接口
  overrideConstraint(key: string, value: any): void;
  manualApprove(): void;
}

interface PipelineEvent {
  agent: AgentType;
  status: 'started' | 'completed' | 'failed';
  output?: any;
  error?: string;
  timestamp: string;
}
```

#### 异常处理策略

| 异常类型 | 处理策略 |
|---------|---------|
| MCP 调用超时 | 重试3次，间隔2s；仍失败则降级到模拟数据 |
| MarketInsight 约束为空 | 启用 SAA 默认约束兜底 |
| AssetAlloc 优化无解 | 放宽约束 10% 后重试；仍失败则返回等权重 |
| QuantRisk 一票否决 | 打回 AssetAlloc 重新分配；若连续3次失败则终止 |
| MinerU PDF解析失败 | 跳过研报解读，仅用市场数据生成约束 |

---

### 2.2 Risk Level Agent — 风险测评引擎

#### 2.2.1 KYC 问卷

| 题号 | 问题 | 选项及分值 |
|------|------|-----------|
| Q1 | 您的投资目标是？ | 保值(2) / 增值(4) / 追求收益(6) / 最大化(8) |
| Q2 | 您能承受的最大亏损是？ | 5%(2) / 10%(4) / 20%(6) / 30%+(8) |
| Q3 | 您的投资期限是？ | 1年内(2) / 1-3年(4) / 3-5年(6) / 5年+(8) |
| Q4 | 您对波动的接受程度？ | 非常厌恶(2) / 略感不适(4) / 可接受(6) / 欢迎(8) |
| Q5 | 您是否投资过股票型基金？ | 从未(2) / 少量(4) / 较多(6) / 大量(8) |

**总分 = Σ(Q1..Q5) ∈ [10, 40]，归一化到 [20, 100]**

#### 2.2.2 约束映射

| 画像 | 评分范围 | 最大回撤 | 债券最低 | 加密最高 | 单只上限 |
|------|---------|---------|---------|---------|---------|
| R1保守型 | 20-40 | ≤5% | ≥50% | 0% | 10% |
| R2稳健型 | 41-65 | ≤10% | ≥30% | ≤3% | 20% |
| R3成长型 | 66-85 | ≤15% | ≥15% | ≤5% | 30% |
| R4积极型 | 86-100 | ≤25% | ≥0% | ≤10% | 40% |

#### 2.2.3 输出 Schema

```typescript
interface RiskProfile {
  riskScore: number;        // 20-100
  riskType: RiskType;       // R1/R2/R3/R4
  maxDrawdown: number;      // e.g. 0.05
  constraints: {
    minBondWeight: number;
    maxCryptoWeight: number;
    maxSingleStock: number;
    maxEquityExposure: number;  // 1 - minBondWeight
  };
  questionnaireAnswers: QuestionnaireAnswer[];
  timestamp: string;
}
```

#### 2.2.4 与 MarketInsight 的交互

Risk Level 输出的 `maxEquityExposure` 与 MarketInsight 的周期修正比例取 min：

```python
# pseudo
for asset_class in ['equity', 'bond', 'cash', 'gold', 'foreign']:
    final_max[asset_class] = min(
        cycle_adjusted_max[asset_class],
        risk_constraints.max_equity_exposure
    )
    final_min[asset_class] = max(
        cycle_adjusted_min[asset_class],
        risk_constraints.min_bond_weight
    )
```

---

### 2.3 MarketInsight Agent — 宏观周期守门人

#### 2.3.1 双轨美林时钟

**美国经济周期判断**

| 象限 | 条件 (Growth × Inflation) | 权益 | 债券 | 黄金 | 现金 |
|------|--------------------------|------|------|------|------|
| 复苏 | (+GDP, -CPI) | +10% | +5% | 0% | -5% |
| 过热 | (+GDP, +CPI) | +5% | -5% | +5% | -5% |
| 滞胀 | (-GDP, +CPI) | -10% | -5% | +10% | +5% |
| 衰退 | (-GDP, -CPI) | -10% | +10% | +5% | +0% |

**中国经济周期判断**

| 象限 | 条件 | 权益 | 债券 | 黄金 | 现金 |
|------|------|------|------|------|------|
| 复苏 | GDP↑ + CPI↓ | +8% | +3% | 0% | -3% |
| 过热 | GDP↑ + CPI↑ | +3% | -3% | +3% | -3% |
| 滞胀 | GDP↓ + CPI↑ | -8% | -3% | +8% | +3% |
| 衰退 | GDP↓ + CPI↓ | -8% | +8% | +3% | 0% |

#### 2.3.2 判断指标与阈值配置化

```typescript
interface CycleIndicatorConfig {
  // 增长维度
  gdp: { threshold_positive: number; threshold_negative: number; };
  pmi: { threshold_expansion: number; threshold_contraction: number; };
  // 通胀维度
  cpi: { threshold_high: number; threshold_low: number; };
  // 数据源
  dataSource: 'tushare' | 'yahoo' | 'akshare';
  lookbackPeriod: number;  // months
}

// 默认参数（可用户配置）
const DEFAULT_CYCLE_CONFIG: CycleIndicatorConfig = {
  gdp:        { threshold_positive: 0.03, threshold_negative: 0.0 },
  pmi:        { threshold_expansion: 50, threshold_contraction: 45 },
  cpi:        { threshold_high: 0.03, threshold_low: 0.01 },
  dataSource: 'tushare',
  lookbackPeriod: 3,
};
```

#### 2.3.3 SAA 基准配置

```typescript
interface SAAConfig {
  baseWeights: Record<AssetClass, number>;
  cycleAdjustments: Record<Quadrant, Record<AssetClass, number>>;
}

const DEFAULT_SAA: SAAConfig = {
  baseWeights: {
    equity:  0.50,
    bond:    0.30,
    cash:    0.10,
    gold:    0.05,
    foreign: 0.05,
  },
  cycleAdjustments: {
    recovery:    { equity: +0.10, bond: +0.05, cash: -0.05, gold: 0.00, foreign: -0.05 },
    overheat:    { equity: +0.05, bond: -0.05, cash: -0.05, gold: +0.05, foreign: +0.00 },
    stagflation: { equity: -0.10, bond: -0.05, cash: +0.05, gold: +0.10, foreign: +0.00 },
    recession:    { equity: -0.10, bond: +0.10, cash: +0.00, gold: +0.05, foreign: -0.05 },
  },
};
```

#### 2.3.4 MinerU MCP 研报解读

```typescript
interface MinerUConfig {
  apiKey: string;
  knowledgeBasePath: string;  // /Users/littlemonster/VS Code/investment-advisor-V1/local_knowledge_base
  supportedFormats: string[];  // ['.pdf']
  maxFileSize: number;  // bytes
  extractionPrompt: string;
}

const MINERU_CONFIG: MinerUConfig = {
  apiKey: process.env.MINERU_API_KEY || '',
  knowledgeBasePath: '/Users/littlemonster/VS Code/investment-advisor-V1/local_knowledge_base',
  supportedFormats: ['.pdf'],
  maxFileSize: 50 * 1024 * 1024,  // 50MB
  extractionPrompt: `从以下研报内容中提取：
1. 核心观点方向（看多/看空/中性）
2. 关键看多/看空逻辑（1-2句话）
3. 涉及资产类别
4. 置信度（高/中/低）
5. 发布机构
6. 发布时间`
};
```

#### 2.3.5 输出 Schema

```typescript
interface MarketConstraints {
  cycleJudgment: {
    cn: { quadrant: Quadrant; confidence: number; indicators: Record<string, number> };
    us: { quadrant: Quadrant; confidence: number; indicators: Record<string, number> };
  };
  constraints: {
    equity:  { min: number; max: number };
    bond:    { min: number; max: number };
    cash:    { min: number; max: number };
    gold:    { min: number; max: number };
    foreign: { min: number; max: number };
  };
  researchInsights: ResearchInsight[];
  constraintReasoning: Record<string, string>;  // 每类资产的推理链
  timestamp: string;
}

interface ResearchInsight {
  source: string;           // 文件名
  direction: 'bullish' | 'bearish' | 'neutral';
  keyArgument: string;
  confidence: 'high' | 'medium' | 'low';
  timeliness: string;       // YYYY-MM-DD
  relatedAssets: string[];
}
```

#### 2.3.6 Agent 边界

| 做 | 不做 |
|----|------|
| 产出约束边界（min/max） | 产出具体权重点值 |
| 宏观周期判断 | 量化优化 |
| 研报定性解读（不产生数字约束） | 修改 Risk Level 约束 |

---

### 2.4 AssetAlloc Agent — 量化优化求解器

#### 2.4.1 BL模型参数配置

```typescript
interface BLConfig {
  // 先验参数
  riskAversion: number;       // δ，风险厌恶系数，默认 2.5
  marketCapWeights: Record<string, number>;  // 市值权重（隐含先验）

  // 观点参数
  tau: number;                // 观点整体权重 τ ∈ (0, 1]，默认 0.05（可用户调节）

  // 置信度映射
  confidenceToOmega: (confidence: number) => number;  // 用户滑块1-5 → Ω方差映射
  confidenceLevels: Record<number, number>;  // { 1: 0.10, 2: 0.05, 3: 0.025, 4: 0.0125, 5: 0.00625 }

  // 优化参数
  optimizer: 'SLSQP' | 'OSQP';
  riskFreeRate: number;
}

const DEFAULT_BL_CONFIG: BLConfig = {
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
```

#### 2.4.2 τ 值用户可调节设计

τ（观点整体权重）通过前端滑块让用户调节：

```
τ 滑块: [0.01 ─────────────── 0.5]
          └─ 保守 ──→ 激进 ─┘
默认值: 0.05

含义:
- τ = 0.01: 几乎完全信任历史先验，主观观点影响极小
- τ = 0.05: 适度融合，平衡先验与观点（推荐）
- τ = 0.20: 较大权重给观点
- τ = 0.50: 激进观点，接受高不确定性
```

#### 2.4.3 用户交互：观点采集滑块

用户界面流程：

```
1. 展示历史数据统计（年化收益、波动率）
2. 用户对每类资产设置收益预期（滑块 ±20%）和置信度（1-5星）
3. 预览 BL 后验预期收益
4. 点击"生成优化方案"
```

```typescript
interface UserView {
  asset: string;
  viewReturn: number;    // 用户预期的收益率
  confidence: number;    // 1-5
}

// Q矩阵构建: Q_i = 预期收益 - 历史先验收益
// Ω矩阵: Ω_ii = (1 /  confidence) * (τ / K) * 某缩放因子
```

#### 2.4.4 Tushare 数据获取

```typescript
interface DataSourceConfig {
  tushare: {
    apiToken: string;
    mcpUrl: string;  // https://finvestai.top/mcp
  };
  akshare: {
    enabled: boolean;
  };
  yahoo: {
    enabled: boolean;
    fallbackOnly: boolean;
  };
  lookbackWindow: number;  // months, 默认 6
}

async function fetchHistoricalData(
  assets: Asset[],
  windowMonths: number
): Promise<HistoricalData> {
  // 1. 尝试 Tushare MCP
  // 2. 失败则降级到 AKShare
  // 3. 再失败则降级到 Yahoo Finance
  // 4. 全部失败则返回模拟数据并警告

  const prices = await fetchPrices(assets, windowMonths);
  const returns = calculateReturns(prices);
  return {
    annualReturns: returns.map(r => annualizedReturn(r)),
    covarianceMatrix: returns.covariance(),
    dataSource: 'tushare',  // 记录实际数据源
  };
}
```

#### 2.4.5 输出 Schema

```typescript
interface AssetAllocResult {
  historicalData: {
    [asset: string]: { annualReturn: number; annualVol: number };
  };
  userViews: UserView[];
  posteriorReturns: { [asset: string]: number };
  optimizedWeights: { [asset: string]: number };
  portfolioMetrics: {
    expectedReturn: number;
    expectedVolatility: number;
    sharpeRatio: number;
    maxDrawdown: number;
  };
  sensitivity: {
    [asset: string]: { weightRange: [number, number] };
  };
  blConfig: {
    tau: number;
    marketCapWeights: Record<string, number>;
  };
  timestamp: string;
}
```

---

### 2.5 QuantRisk Agent — 量化风控压测

#### 2.5.1 压力测试场景

| 场景ID | 名称 | 权益冲击 | 债券冲击 | 黄金冲击 | 原油冲击 |
|--------|------|---------|---------|---------|---------|
| 2008_subprime | 2008次贷危机 | -50% | -10% | +10% | -60% |
| 2020_covid | 2020新冠疫情 | -35% | +5% | +15% | -40% |
| 2022_rate_hikes | 2022激进加息 | -25% | -20% | -5% | -15% |
| 2022_china_crackdown | 2022中国教培 | -45% | 0% | 0% | -10% |
| 2024_market_crash | 模拟大跌 | -30% | +2% | +8% | -25% |

#### 2.5.2 一票否决逻辑

```python
def stress_test(weights: dict, scenarios: list, maxDrawdown: float) -> StressTestResult:
    failed_scenarios = []
    for scenario in scenarios:
        portfolio_loss = sum(
            weights[asset] * scenario[f"{asset}_impact"]
            for asset in weights.keys()
        )
        if portfolio_loss > maxDrawdown:
            failed_scenarios.append({
                'id': scenario['id'],
                'loss': portfolio_loss,
                'limit': maxDrawdown,
                'breach': portfolio_loss - maxDrawdown,
            })

    return StressTestResult(
        passed=len(failed_scenarios) == 0,
        failedScenarios=failed_scenarios,
        worstCase=max(f['loss'] for f in failed_scenarios) if failed_scenarios else 0,
    )
```

#### 2.5.3 输出 Schema

```typescript
interface RiskTestResult {
  passed: boolean;
  worstCase: number;
  scenarioResults: {
    [scenarioId: string]: {
      portfolioLoss: number;
      passed: boolean;
      breach: number;
    };
  };
  vaR95: number;
  cVaR95: number;
  timestamp: string;
}
```

---

### 2.6 CustomerInsight Agent — 客户尽职调查

#### 2.6.1 流程

```
用户输入客户姓名
    │
    ▼
遍历 /Users/littlemonster/VS Code/investment-advisor-V1/客户尽职调查/
    │
    ▼
pdfplumber 提取文本（最多10页）
    │
    ▼
MiniMax M2.7 API 结构化分析
    │
    ▼
返回客户画像
```

#### 2.6.2 输出 Schema

```typescript
interface CustomerInsight {
  customerName: string;
  basicInfo: {
    gender: string;
    age: string;
    education: string;
    annualIncome: string;
    netAssets: string;
  };
  companyInfo: {
    companyName: string;
    listedStatus: string;
    marketCap: string;
    shareholdingRatio: string;
  };
  wealthNeeds: string;
  businessNeeds: string;
  investmentNeeds: string;
  sourceFile: string;
  timestamp: string;
}
```

---

### 2.7 Backtesting Agent — 历史回测引擎

**职责**：基于 AssetAlloc 输出的恒定比例配置，在真实历史数据上进行回测，验证策略有效性。

#### 2.7.1 回测配置参数

```typescript
interface BacktestConfig {
  // 时间窗口
  period: '6m' | '1y';         // 回测周期：6个月 / 1年

  // 再平衡频率
  rebalanceFreq: 'monthly' | 'quarterly';  // 月度 / 季度

  // 基准对比
  benchmarks: Benchmark[];     // 可选：沪深300 / 纳指100 / 60/40

  // 数据源
  dataSource: {
    primary: 'tushare';
    fallback: 'akshare' | 'yahoo';
  };

  // 初始资金
  initialCapital: number;       // 默认 100万
}

const BENCHMARKS: Record<string, { code: string; name: string; type: string }> = {
  'CSI300':  { code: '510300.SH', name: '沪深300',   type: 'domestic_equity' },
  'NASDAQ100': { code: 'QQQ',     name: '纳指100',   type: 'us_equity' },
  '60_40':   { code: 'SYNTHETIC', name: '60/40组合', type: 'synthetic' },
};
```

#### 2.7.2 回测算法：恒定比例持有

```python
def backtest_constant_proportion(
    weights: dict[str, float],      # AssetAlloc 输出的资产权重
    prices: dict[str, list[float]], # Tushare 历史价格序列
    start_date: str,
    end_date: str,
    rebalance_freq: str,            # 'monthly' | 'quarterly'
    initial_capital: float = 1_000_000
) -> BacktestResult:

    # 1. 按月/季度切分调仓时点
    rebalance_dates = get_rebalance_dates(start_date, end_date, rebalance_freq)

    # 2. 初始建仓
    nav = initial_capital
    holdings = {asset: (nav * weight) / initial_price for asset, weight in weights.items()}
    nav_history = [nav]
    date_history = [start_date]

    # 3. 逐日盯市
    for date in trading_days(start_date, end_date):
        # 获取当日收盘价
        current_prices = {asset: get_price(asset, date) for asset in weights.keys()}

        # 计算当前净值
        current_nav = sum(holdings[asset] * current_prices[asset] for asset in holdings)

        # 判断是否需要调仓
        if date in rebalance_dates:
            # 调仓到目标权重
            holdings = {
                asset: (current_nav * weights[asset]) / current_prices[asset]
                for asset in weights.keys()
            }
            nav_history.append(current_nav)
            date_history.append(date)
        else:
            # 持有不动
            nav_history.append(current_nav)  # 不追加date，仅nav变化时记录

    # 4. 计算绩效指标
    returns = compute_daily_returns(nav_history)

    return BacktestResult(
        nav_curve=list(zip(date_history, nav_history)),
        total_return=nav_history[-1] / nav_history[0] - 1,
        annualized_return=annualize(nav_history[-1] / nav_history[0], len(nav_history)),
        volatility=compute_volatility(returns),
        sharpe_ratio=(annualized_return - risk_free_rate) / volatility,
        max_drawdown=compute_max_drawdown(nav_history),
        win_rate=compute_win_rate(returns),
        monthly_returns=group_by_month(returns),
    )
```

#### 2.7.3 Tushare 历史数据获取

```python
async def fetch_backtest_prices(
    assets: list[str],
    period: str
) -> dict[str, list[dict]]:
    """
    从 Tushare 获取历史价格数据
    period: '6m' → 最近6个月
            '1y' → 最近1年
    """
    import tushare as ts

    # 计算日期范围
    end_date = datetime.now().strftime('%Y%m%d')
    if period == '6m':
        start_date = (datetime.now() - relativedelta(months=6)).strftime('%Y%m%d')
    else:  # '1y'
        start_date = (datetime.now() - relativedelta(years=1)).strftime('%Y%m%d')

    result = {}
    for asset_code in assets:
        df = ts.pro_bar(
            ts_code=asset_code,
            start_date=start_date,
            end_date=end_date,
            freq='D'  # 日线
        )
        result[asset_code] = df[['trade_date', 'close']].to_dict('records')

    return result
```

#### 2.7.4 绩效指标计算

| 指标 | 计算公式 | 说明 |
|------|---------|------|
| 总收益 | `期末净值/期初净值 - 1` | 累计收益率 |
| 年化收益 | `(1+总收益)^(252/天数) - 1` | 年化后的收益 |
| 年化波动率 | `日收益标准差 × √252` | 波动风险 |
| 夏普比率 | `(年化收益 - 无风险利率) / 年化波动率` | 风险调整收益 |
| 最大回撤 | `max(历史最高净值 - 当日净值) / 历史最高净值` | 历史最大亏损 |
| 胜率 | `正收益天数 / 总交易天数` | 正收益占比 |
| 最佳月 | `月收益降序排列，取最大值` | 最幸运单月 |
| 最差月 | `月收益降序排列，取最小值` | 最倒霉单月 |

#### 2.7.5 输出 Schema

```typescript
interface BacktestResult {
  config: {
    period: string;
    rebalanceFreq: string;
    initialCapital: number;
    startDate: string;
    endDate: string;
  };
  portfolioWeights: Record<string, number>;  // 来自 AssetAlloc
  navCurve: Array<{ date: string; nav: number }>;
  metrics: {
    totalReturn: number;           // e.g. 0.1523
    annualizedReturn: number;       // e.g. 0.0891
    volatility: number;             // e.g. 0.1234
    sharpeRatio: number;            // e.g. 0.721
    maxDrawdown: number;            // e.g. -0.0823
    winRate: number;                // e.g. 0.582
    bestMonth: { month: string; return: number };
    worstMonth: { month: string; return: number };
  };
  benchmarkComparison: {
    [benchmarkName: string]: {
      navCurve: Array<{ date: string; nav: number }>;
      totalReturn: number;
      annualizedReturn: number;
      volatility: number;
      sharpeRatio: number;
      maxDrawdown: number;
    };
  };
  monthlyReturns: Array<{ month: string; portfolioReturn: number; benchmarkReturn?: number }>;
  dataSource: string;
  timestamp: string;
}
```

#### 2.7.6 前端图表展示

| 图表类型 | 内容 |
|---------|------|
| **净值曲线图** | 组合净值 vs 基准净值，双Y轴叠加 |
| **月收益柱状图** | 各月收益对比 |
| **回撤面积图** | 净值从高点下滑的深度 |
| **资产贡献分解** | 各资产对组合收益的贡献占比 |

#### 2.7.7 Agent 边界

| 做 | 不做 |
|----|------|
| 恒定比例持有回测 | 主动择时/择股 |
| 再平衡频率执行 | 修改权重配置 |
| 绩效归因分析 | 生成新的配置建议 |
| 与基准对比 | 执行风控压测 |

---

### 2.8 Stress Testing Agent — 风险压测

> 原 QuantRisk Agent 更名，聚焦极端情景下的风险暴露评估。

#### 2.8.1 压力测试场景

| 场景ID | 名称 | 触发背景 | 权益冲击 | 债券冲击 | 黄金冲击 | 原油冲击 | 加密冲击 |
|--------|------|---------|---------|---------|---------|---------|---------|
| `2008_subprime` | 2008次贷危机 | 雷曼倒闭、流动性枯竭 | -50% | -10% | +10% | -60% | -70% |
| `2020_covid` | 2020新冠疫情 | 全球恐慌抛售 | -35% | +5% | +15% | -40% | -40% |
| `2022_rate_hikes` | 2022激进加息 | 美联储缩表 | -25% | -20% | -5% | -15% | -50% |
| `2022_china_crackdown` | 2022中国教培 | 政策黑天鹅 | -45% | 0% | 0% | -10% | -30% |
| `2024_market_crash` | 模拟大跌 | 尾部风险 | -30% | +2% | +8% | -25% | -60% |

#### 2.8.2 VaR / CVaR 计算

```python
def compute_var_cvar(
    weights: dict[str, float],
    returns: dict[str, list[float]],   # 日收益率序列
    confidence: float = 0.95
) -> tuple[float, float]:
    """
    Parametric VaR / CVaR（方差-协方差法）
    假设收益率服从正态分布
    """
    import numpy as np

    # 计算组合日收益率
    ret_array = np.array([returns[a] for a in weights.keys()])
    w = np.array([weights[a] for a in weights.keys()])
    portfolio_returns = (w @ ret_array).flatten()

    mu = np.mean(portfolio_returns)
    sigma = np.std(portfolio_returns)

    # VaR: 在 (1-confidence) 分位点上的损失
    z_score = norm.ppf(1 - confidence)  # 95% → -1.645
    var = mu + z_score * sigma

    # CVaR: 超过 VaR 的平均损失
    cvar = mu + (norm.pdf(z_score) / (1 - confidence)) * sigma

    return var, cvar


def historical_var_cvar(
    weights: dict[str, float],
    returns: dict[str, list[float]],
    confidence: float = 0.95
) -> tuple[float, float]:
    """
    Historical VaR / CVaR（历史模拟法）
    基于真实历史收益率分布
    """
    import numpy as np

    ret_array = np.array([returns[a] for a in weights.keys()])
    w = np.array([weights[a] for a in weights.keys()])
    portfolio_returns = (w @ ret_array).flatten()

    var = np.percentile(portfolio_returns, (1 - confidence) * 100)
    cvar = np.mean(portfolio_returns[portfolio_returns <= var])

    return var, cvar
```

#### 2.8.3 一票否决逻辑

```python
def stress_test(
    weights: dict[str, float],
    scenarios: list[StressScenario],
    maxDrawdownLimit: float,
    varLimit: float
) -> StressTestResult:
    failed_scenarios = []
    scenario_results = {}

    for scenario in scenarios:
        portfolio_loss = sum(
            weights.get(asset, 0) * scenario.impact.get(asset, 0)
            for asset in weights.keys()
        )

        passed = portfolio_loss <= maxDrawdownLimit
        breach = portfolio_loss - maxDrawdownLimit if not passed else 0

        scenario_results[scenario.id] = {
            'portfolioLoss': portfolio_loss,
            'passed': passed,
            'breach': breach,
            'scenarioName': scenario.name,
        }

        if not passed:
            failed_scenarios.append(scenario.id)

    return StressTestResult(
        passed=len(failed_scenarios) == 0,
        failedScenarios=failed_scenarios,
        worstCase=max(r['portfolioLoss'] for r in scenario_results.values()),
        scenarioResults=scenario_results,
        vaR95=var_95,         # 从 compute_var_cvar 传入
        cVaR95=cvar_95,
        timestamp=datetime.now().isoformat(),
    )
```

#### 2.8.4 输出 Schema

```typescript
interface StressTestResult {
  passed: boolean;                              // 所有场景均通过 → true
  worstCase: number;                            // 最严重亏损
  var95: number;                                // VaR(95%)，日度
  cvar95: number;                              // CVaR(95%)，日度
  scenarioResults: {
    [scenarioId: string]: {
      portfolioLoss: number;                    // e.g. -0.1823
      passed: boolean;                         // 是否 ≤ maxDrawdown
      breach: number;                          // 超限幅度
      scenarioName: string;
    };
  };
  recommendation: 'APPROVE' | 'REJECT' | 'WARN';
  timestamp: string;
}
```

#### 2.8.5 与其他 Agent 的交互

```
AssetAlloc 输出权重 ──→ Stress Testing
        │
        ├── Pass  → ReportSynthesis（展示通过）
        │
        └── Fail  → Orchestrator 触发 REALLOCATING
                        │
                        └── AssetAlloc 重新优化（约束适当放宽5%）
```

#### 2.8.6 Agent 边界

| 做 | 不做 |
|----|------|
| 极端情景亏损计算 | 修改配置权重 |
| VaR/CVaR 统计 | 主动择时 |
| 一票否决触发 | 生成新配置方案 |
| 归因最差资产 | 执行交易 |

---

## 3. Agent 边界总结

### 3.1 核心铁律

```
MarketInsight → 做减法（缩小可行域）
AssetAlloc    → 做优化（在可行域内找最优解）
Orchestrator  → 做编排（协调流程、异常处理）
```

### 3.2 边界守则

| 维度 | MarketInsight | AssetAlloc | Backtesting | Stress Testing |
|------|---------------|------------|-------------|-----------------|
| 时间跨度 | 6-12个月 | 1-6个月 | 历史回溯 | 即时 |
| 输出类型 | 范围(min/max) | 点值(权重%) | 净值曲线+指标 | 通过/否决+VaR |
| 输出性质 | 硬约束 | 优化建议 | 历史验证 | 风险验证 |
| 驱动因素 | 宏观周期 | 量化模型 | 历史数据 | 极端情景 |
| 可违反 | — | 约束不可违反 | — | 触发重算 |

### 3.3 两道防火墙

```
防火墙1 — MarketInsight研报解读
  → 宏观定性参考，不形成数字约束
  → 仅标记"研报一致/偏离"作为提示

防火墙2 — AssetAlloc用户滑块
  → 微观量化观点，直接进入BL模型的Q矩阵
  → 受τ和Ω双重衰减
  → 仍受MarketInsight硬约束限制
```

---

## 4. 待确认问题 → 已解决

| # | 问题 | 结论 |
|---|------|------|
| 1 | Risk Level Agent 的输入输出 | KYC问卷(5题) + 约束映射表（见 2.2） |
| 2 | Orchestrator Agent 设计 | 见 2.1 状态机 + 异常处理 |
| 3 | 美林时钟参数化 | 见 2.3.2 + 2.3.3 完整配置框架 |
| 4 | BL模型 τ 值 | 用户可调节滑块（见 2.4.2） |
| 5 | MinerU MCP 路径 | `/Users/littlemonster/VS Code/investment-advisor-V1/local_knowledge_base/*.pdf` |

---

## 5. 实现路径

| 阶段 | 内容 | 交付物 | 优先级 |
|------|------|--------|--------|
| **Phase A** | MarketInsight Agent（美林时钟 + 约束生成 + MinerU研报） | `agents/market_insight.py` | P0 |
| **Phase B** | AssetAlloc Agent（Tushare数据 + BL模型 + 约束优化） | `agents/asset_alloc.py` | P0 |
| **Phase C** | Orchestrator Agent（状态机 + 串联 + 异常处理） | `agents/orchestrator.py` | P0 |
| **Phase D** | Risk Level Agent（KYC问卷 + 约束映射） | `agents/risk_level.py` | P1 |
| **Phase E** | Backtesting Agent（Tushare历史数据 + 恒定比例回测 + 图表） | `agents/backtesting.py` | P1 |
| **Phase F** | Stress Testing Agent（压力测试 + VaR/CVaR + 一票否决） | `agents/stress_testing.py` | P1 |
| **Phase G** | CustomerInsight Agent（PDF解析 + MiniMax分析） | `agents/customer_insight.py` | P1 |
| **Phase H** | ReportSynthesis Agent（PDF报告） | `agents/report_synthesis.py` | P2 |

---

## 6. 文件结构

```
investment-advisor-V1/
├── agents/                          # Agent 核心实现
│   ├── __init__.py
│   ├── orchestrator.py             # 调度中枢
│   ├── market_insight.py            # 宏观约束
│   ├── asset_alloc.py               # BL优化
│   ├── risk_level.py                # 风险测评
│   ├── backtesting.py               # 历史回测
│   ├── stress_testing.py           # 风险压测
│   ├── customer_insight.py          # DD分析
│   └── report_synthesis.py          # 报告生成
├── src/                             # 前端
│   ├── App.tsx
│   ├── types.ts
│   ├── services/
│   │   └── mcp.ts
│   └── components/
├── local_knowledge_base/            # MinerU研报知识库
│   └── *.pdf
├── 客户尽职调查/                     # 客户DD报告
│   └── *.pdf
├── mcp_server.py                    # FastAPI后端
├── ARCHITECTURE_PLAN.md             # 本文档
└── SOP_v3.5.md
```
