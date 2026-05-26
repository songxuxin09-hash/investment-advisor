# 投顾智能决策系统 v3.2 - 完整技术规格文档

> **版本差异 (v3.1 → v3.2)**: 底层逻辑全面升级为多智能体协同架构，UI设计保持不变。
> - 新增: Black-Litterman 量化优化模型
> - 新增: 双轨美林时钟宏观判断
> - 新增: Tushare 实时数据获取
> - 新增: τ 参数用户可调节
> - 新增: Stress Testing Agent (VaR/CVaR)
> - 新增: Backtesting Agent (恒定比例持有回测)

## 1. 项目概述

**项目名称**: 智能投顾决策系统 (Investment Advisory Decision System)
**项目类型**: 交互式Web应用 (Single Page Application)
**核心功能**: 多智能体协同的智能投顾决策系统，MarketInsight Agent 产出宏观约束 + AssetAlloc Agent 执行 BL 优化 + Backtesting Agent 历史验证 + StressTesting Agent 风险压测
**目标用户**: 投资顾问、财富管理客户、机构投资者

---

## 2. UI/UX 规格

### 2.1 布局结构

**页面区域**:
- **Header**: 系统Logo、版本号、状态指示器
- **Sidebar**: 导航菜单 (客户管理 / 市场诊断 / 组合优化 / 报告生成)
- **Main Content**: 4个主要工作区面板
- **Footer**: 系统信息、执行状态

**响应式断点**:
- Desktop: > 1200px (完整3栏布局)
- Tablet: 768px - 1200px (折叠侧边栏)
- Mobile: < 768px (单列堆叠)

### 2.2 视觉设计

**色彩系统**:
- Primary: #1a365d (深蓝 - 专业金融)
- Secondary: #2d5a87 (中蓝 - 交互元素)
- Accent: #38a169 (绿色 - 正向信号)
- Warning: #e53e3e (红色 - 风险警示)
- Background: #f7fafc (浅灰背景)
- Card: #ffffff (卡片白)
- Text Primary: #1a202c
- Text Secondary: #718096
- Border: #e2e8f0

**风险等级配色**:
- R1保守型: #48bb78 (绿色)
- R2稳健型: #4299e1 (蓝色)
- R3成长型: #ed8936 (橙色)
- R4积极型: #f56565 (红色)

**字体**:
- 中文: "Noto Sans SC", "PingFang SC", sans-serif
- 数字/代码: "JetBrains Mono", monospace
- 标题: 600 weight, 24px/20px/16px
- 正文: 400 weight, 14px
- 数据: 500 weight, 13px monospace

**间距系统**:
- 基础: 4px / 8px / 16px / 24px / 32px
- 卡片: 24px padding, 12px border-radius
- 表格: 8px cell-padding

**视觉效果**:
- 卡片阴影: 0 1px 3px rgba(0,0,0,0.1)
- Hover阴影: 0 4px 12px rgba(0,0,0,0.15)
- 过渡: 0.2s ease-out

### 2.3 组件列表

**表单组件**:
- [ ] 风险测评问卷 (5问题评分)
- [ ] 资产池选择器 (6资产多选)
- [ ] 约束参数输入器 (滑块+数字输入)
- [ ] 日期范围选择器

**数据展示**:
- [ ] 客户画像仪表盘 (风险雷达图)
- [ ] 市场状态卡片 (宏观指标面板)
- [ ] 资产配置饼图 (ECharts)
- [ ] 持仓权重表格 (排序表格)
- [ ] 实时行情看板 (涨跌幅刷新)

**控制组件**:
- [ ] "开始分析" 按钮
- [ ] "生成报告" 按钮
- [ ] "重置" 按钮
- [ ] 进度指示器

**模态框**:
- [ ] PDF预览窗口
- [ ] 完整报告下载

---

## 3. 功能规格

### 3.1 核心工作流 (多智能体协同)

#### Step 0: 客户尽职调查 (CustomerInsight Agent)
- PDF解析 + MiniMax M2.7 API
- 提取客户画像、财富需求

#### Step 1: 风险测评 (Risk Level Agent)
- 5道KYC问卷
- 计算风险评分 (20-100)
- 匹配R1-R4画像
- 生成硬约束边界 (maxDrawdown / minBondWeight / maxCryptoWeight)

#### Step 2: 市场感知 (MarketInsight Agent)
- 双轨美林时钟（中国 + 美国独立判断）
- SAA基准 + 周期调整 → 各类资产比例约束
- 与 Risk Level 约束取 min → 最终硬约束
- MinerU MCP 解读 local_knowledge_base 研报（定性参考）
- Tushare 获取6个月历史数据（收益率 + 波动率）

#### Step 3: 组合优化 (AssetAlloc Agent)
- BL模型融合历史先验 + 用户主观观点
- τ 参数用户可调节（0.01-0.5）
- 均值方差优化（在 MarketInsight 硬约束内求解）
- 输出最优权重 + 预期指标

#### Step 4: 历史回测 (Backtesting Agent)
- Tushare 历史数据（6个月 / 1年）
- 恒定比例持有 + 月度/季度再平衡
- 净值曲线 + 绩效指标 + vs 基准对比

#### Step 5: 风控压测 (Stress Testing Agent)
- 5个历史极端场景回撤计算
- VaR(95%) / CVaR(95%) 统计
- 一票否决机制（任一场景超标 → 重新配置）

#### Step 6: PDF报告生成 (ReportSynthesis Agent)
- 5个Part章节
- 配置参数镜像
- 市场快照
- 投资建议

### 3.2 数据模型

**客户画像**:
```typescript
interface ClientProfile {
  riskScore: number;           // 20-100
  riskType: "R1"|"R2"|"R3"|"R4";
  maxDrawdown: number;         // CVaR限制
  minBondWeight: number;       // 债券最低占比
  maxCryptoWeight: number;     // 加密最高占比
  maxSingleStock: number;      // 单只权益上限
}
```

**市场参数**:
```typescript
interface MarketParams {
  assets: Asset[];
  regime: "inflation" | "recession" | "normal";
  expectedReturns: Record<string, number>;
  covarianceMatrix: number[][];
}

interface Asset {
  code: string;
  name: string;
  type: "equity" | "bond" | "commodity" | "altcoin";
  price: number;
  volatility: number;
}
```

**组合权重**:
```typescript
interface Portfolio {
  weights: Record<string, number>;
  expectedReturn: number;
  expectedVolatility: number;
  sharpeRatio: number;
  maxDrawdown: number;
}
```

### 3.3 资产池定义

| 代码 | 名称 | 类型 | 风险 |
|------|------|------|------|
| 510300.SH | 沪深300 ETF | 权益 |中高 |
| QQQ | 纳指100 ETF | 权益 | 高 |
| TLT | 20年美债 ETF | 固收 | 低 |
| GLD | 黄金 ETF | 商品 | 中 |
| USO | 原油 ETF | 商品 | 高 |
| IBIT | 比特币 ETF | 另类 | 极高 |

### 3.4 约束规则

**R1 保守型** (评分20-40):
- maxDrawdown ≤ 5%
- minBondWeight ≥ 50%
- maxCryptoWeight = 0%
- maxSingleStock ≤ 10%

**R2 稳健型** (评分41-65):
- maxDrawdown ≤ 10%
- minBondWeight ≥ 30%
- maxCryptoWeight ≤ 3%
- maxSingleStock ≤ 20%

**R3 成长型** (评分66-85):
- maxDrawdown ≤ 15%
- minBondWeight ≥ 15%
- maxCryptoWeight ≤ 5%
- maxSingleStock ≤ 30%

**R4 积极型** (评分86-100):
- maxDrawdown ≤ 25%
- minBondWeight ≥ 0%
- maxCryptoWeight ≤ 10%
- maxSingleStock ≤ 40%

---

## 4. 验收标准

### 4.1 功能验收

- [x] v3.2: 问卷完成可生成客户画像
- [x] v3.2: 风险评分正确映射R1-R4
- [x] v3.2: 市场数据可动态获取并显示（Tushare + Yahoo Finance）
- [x] v3.2: BL模型组合优化输出合理权重
- [x] v3.2: τ 参数滑块可调节
- [x] v3.2: 双轨美林时钟宏观判断展示
- [x] v3.2: 历史回测（恒定比例持有）
- [x] v3.2: Stress Testing Agent（VaR/CVaR + 一票否决）
- [x] v3.2: PDF报告完整5个Part
- [ ] 饼图/表格数据一致

### 4.2 视觉验收

- [x] v3.2: 颜色与规格一致（保持v3.1 UI风格）
- [x] v3.2: 响应式布局正常
- [ ] 动画过渡流畅
- [x] v3.2: 数据加载状态明确
- [ ] 错误提示友好

### 4.3 技术验收

- [ ] 无控制台错误
- [ ] 构建产物可运行
- [ ] 外部CDN可访问

---

## 5. 技术栈

- **框架**: React 18 + TypeScript
- **UI组件**: 原生CSS + 自定义组件（保持v3.1设计不变）
- **图表**: ECharts (CDN)
- **PDF**: jsPDF + html2canvas
- **构建**: Vite
- **端口**: 5173

## 5.1 多智能体架构

| Agent | 职责 | 核心算法/数据 |
|-------|------|--------------|
| CustomerInsight | PDF尽职调查分析 | MinerU API + MiniMax M2.7 |
| Risk Level | KYC → 风险约束 | 问卷评分 + 约束映射表 |
| MarketInsight | 美林时钟 + 宏观约束 | 双轨SAA + 周期调整 |
| AssetAlloc | BL优化 + 权重求解 | Black-Litterman + 均值方差 |
| Backtesting | 历史回测验证 | Tushare数据 + 恒定比例 |
| StressTesting | 极端情景压测 | VaR/CVaR + 一票否决 |
| ReportSynthesis | PDF报告生成 | jsPDF + html2canvas |