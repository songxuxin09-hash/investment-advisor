# 投顾智能决策系统 v3.5 - 完整业务流程 SOP (客户尽职调查 + MCP集成版)

> **版本:** v3.5
> **更新日期:** 2026-04-24
> **核心定位:** 基于大模型与本地知识库的智能投顾系统，支持客户尽职调查PDF分析、MCP数据服务、动态市场感知、组合优化、风控压力测试、报告生成

---

## 一、系统架构与核心流程

### 1.1 系统定位
本系统彻底摒弃"静态历史收益预期"，采用**"客户画像定边界 + 实时市场定预期 + 知识库研报辅助 + 历史回测验实战"**的动态配置哲学。

### 1.2 完整工作流 (7步)
```
0 客户尽职调查 → 1 风险测评 → 2 市场感知 → 3 组合优化 → 4 历史回测 → 5 风控检查 → 6 报告生成
   (DD分析)       (KYC)        (宏观)        (优化)       (回测)      (压测)       (PDF)
```

### 1.3 Agent 矩阵 (v3.2 多智能体协同)
| Agent | 功能 | 技术实现 |
|-------|------|---------|
| CustomerInsight Agent | 客户尽职调查PDF分析 | MinerU API + MiniMax M2.7 API |
| Risk Level Agent | KYC问卷 → 风险约束 | 内置React组件 + 约束映射表 |
| MarketInsight Agent | 双轨美林时钟 + 宏观约束 | Yahoo Finance API + MinerU MCP + SAA基准 |
| AssetAlloc Agent | Black-Litterman优化 | Tushare数据 + BL模型 + τ用户可调 |
| Backtesting Agent | 恒定比例持有回测 | Tushare历史数据 + 月度/季度再平衡 |
| Stress Testing Agent | 极端情景压测 | VaR/CVaR + 一票否决机制 |
| ReportSynthesis Agent | 报告生成 + 数据转译 | jsPDF + html2canvas |

---

## 二、客户尽职调查 (CustomerInsight Agent) v3.5新增

### 2.1 功能概述
在风险测评前增加客户尽职调查步骤，通过分析客户PDF尽职调查报告，自动提取客户信息和需求分析。

### 2.2 客户分析流程
```
1. 用户输入客户姓名
2. 系统查找 "客户尽职调查" 文件夹中的对应PDF
3. 使用 pdfplumber 提取PDF文本内容
4. 调用 MiniMax M2.7 大模型分析内容
5. 返回结构化分析结果
```

### 2.3 输出字段
| 字段 | 说明 |
|------|------|
| basic_info | 客户基本信息（性别、年龄、学历、年薪、净资产） |
| company_info | 客户所在企业信息（企业名称、上市状态、市值、持股比例） |
| wealth_needs | 财富管理需求分析 |
| business_needs | 公司业务需求分析 |
| investment_needs | 投行业务需求分析 |

### 2.4 配置说明
- 客户PDF文件夹: `客户尽职调查/`
- PDF命名规则: `客户姓名.pdf` (如: 许冉.pdf)
- API配置: MiniMax API Key 保存在 `.env` 文件中

### 2.5 API配置
```bash
# .env 文件配置
MINIMAX_API_KEY=your_api_key_here
MINERU_API_KEY=your_mineru_key_here
```

---

## 三、投资者适当性管理 (约束生成规则)

### 2.1 KYC问卷
5道问题评估客户风险承受能力：
1. 您的投资目标是？(保值/增值/追求收益/最大化)
2. 您能承受的最大亏损是？(5%/10%/20%/30%+)
3. 您的投资期限是？(1年内/1-3年/3-5年/5年+)
4. 您对波动的接受程度？(非常厌恶/略感不适/可接受/欢迎)
5. 您是否投资过股票型基金？(从未/少量/较多/大量)

### 2.2 约束映射规则
| 画像 | 评分 | 最大回撤 | 债券最低 | 加密最高 | 单只上限 |
|------|------|----------|---------|---------|---------|
| R1保守型 | 20-40 | ≤5% | 50% | 0% | 10% |
| R2稳健型 | 41-65 | ≤10% | 30% | 3% | 20% |
| R3成长型 | 66-85 | ≤15% | 15% | 5% | 30% |
| R4积极型 | 86-100 | ≤25% | 0% | 10% | 40% |

---

## 三、动态市场感知与参数生成

### 3.1 核心资产池
| 代码 | 名称 | 类型 | 预期收益 | 波动率 |
|------|------|------|---------|--------|
| 510300.SH | 沪深300 ETF | 权益 | 8% | 18% |
| QQQ | 纳指100 ETF | 权益 | 12% | 25% |
| TLT | 20年美债 ETF | 固收 | 4% | 12% |
| GLD | 黄金 ETF | 商品 | 6% | 14% |
| USO | 原油 ETF | 商品 | 10% | 35% |
| IBIT | 比特币 ETF | 另类 | 20% | 55% |

### 3.2 宏观Regime诊断
| Regime | 说明 | 调整逻辑 |
|--------|------|---------|
| inflation (通胀过热) | CPI高、美债收益率上升 | GLD+3%, TLT-2% |
| recession (避险衰退) | 经济放缓、避险情绪 | GLD+2%, QQQ-3%, TLT+1% |
| normal (正常运行) | 温和增长 | 基准预期 |

### 3.3 本地知识库 (PDF研报解析) v3.4新增

#### 3.3.1 知识库文件
- 存储路径: `local_knowledge_base/*.md`
- 解析方式: pypdf提取文本 → 存储为Markdown
- 关键信息提取: CPI预测、核心CPI、油价、猪价、GDP等

#### 3.3.2 知识库处理逻辑
```typescript
// 加载知识库
export async function loadLocalKnowledgeBase(): Promise<PDFAnalysis[]> {
  const results = [];
  const pdfFiles = [
    'local_knowledge_base/zhaoshang_cpi.md',
    'local_knowledge_base/guohai_asset.md'
  ];

  for (const pdf of pdfFiles) {
    try {
      const text = await fetch(pdf).then(r => r.text());
      // 提取关键信息
      const cpiMatch = text.match(/Q[234][^\n]*(?:CPI|cpi)[^\n]*/gi);
      const oilMatch = text.match(/(?:布伦特|原油|油价|美元\/桶)[^\n]*/gi);
      const pigMatch = text.match(/(?:猪价|猪肉|生猪|9元|11元|12.5元)[^\n]*/gi);

      if (insights.length > 0) {
        results.push({source: pdf.name, keyInsights: insights});
      } else {
        // 无相关内容时返回提示
        results.push({
          source: pdf.name,
          keyInsights: ['暂无相关信息，请参考其他数据来源']
        });
      }
    } catch (e) {
      // 读取失败时返回提示
      results.push({
        source: pdf.name,
        keyInsights: ['请检查文件是否存在或网络连接']
      });
    }
  }
  return results;
}
```

#### 3.3.3 前端渲染
```typescript
// 正确：将useState放在组件内部
export default function App() {
  // PDF知识库状态 - 放在组件内部
  const [pdfInsights, setPdfInsights] = useState<PDFInsight[] | null>(null);

  // 组件代码...
}
```

---

## 四、组合优化 (AssetAlloc Agent)

### 4.1 优化流程
1. 获取客户风险约束 (maxDrawdown, minBondWeight, maxCryptoWeight)
2. 检测市场Regime (通胀/衰退/正常)
3. 根据Regime调整预期收益
4. 应用约束求解权重 (简化风险Parity)
5. 输出权重组合 + 预期指标

### 4.2 输出指标
- 预期收益率 (年化)
- 预期波动率 (年化)
- 夏普比率
- 预测最大回撤

---

## 五、历史回测 (Backtest Engine)

### 5.1 回测配置
| 参数 | 选项 |
|------|------|
| 回测周期 | 1年 / 3年 / 5年 |
| 再平衡频率 | 月度 / 季度 |
| 基准 | 纳指100 / 沪深300 / 60/40 |

### 5.2 回测指标
| 指标 | 计算方法 |
|------|----------|
| 总收益 | 期末净值/期初净值 - 1 |
| 年化收益 | (1+总收益)^(252/天数) - 1 |
| 年化波动率 | 日收益标准差 × √252 |
| 夏普比率 | 年化收益 / 年化波动率 |
| 最大回撤 | min(1 - 净值/历史最高) |
| 胜率 | 正收益交易日 / 总交易日 |
| 最佳/最差月 | 月收益排序 |

### 5.3 净值曲线图
- 组合净值 vs 基准曲线
- 各资产走势对比线

---

## 六、量化风控检查 (QuantRisk Agent)

### 6.1 压力测试场景
| 场景ID | 名称 | 时间区间 | 市场特征 |
|--------|------|----------|----------|
| 2008_subprime | 2008次贷危机 | 2007.10-2009.03 | 流动性危机 |
| 2020_covid | 2020新冠疫情 | 2020.02-2020.03 | 恐慌抛售 |
| 2022_rate_hikes | 2022激进加息 | 2022.01-2022.12 | 股债双杀 |
| 2022_china_crackdown | 2022中国教培 | 2021.07-2022.03 | 政策风险 |

### 6.2 一票否决机制
- **Pass**: 所有场景回撤 ≤ 客户maxDrawdown约束
- **Fail**: 任一场景回撤 > 约束 → 强制打回重算

### 6.3 正确归因逻辑
```typescript
// 亏损贡献 = 资产回撤 × 权重 (必须为正数)
contribution = asset_drawdown * weight;
// 找贡献最大的(最差)，排除上涨资产
worst_asset = max(contributions);
```

---

## 七、报告生成与数据转译

### 7.1 PDF报告结构
| Part | 内容 |
|------|------|
| Part A | 投资者需求摘要 (客户画像) |
| Part B | 市场环境诊断 (宏观) |
| Part C | 资产配置建议 (权重) |
| Part D | 回测/风控结果 |
| Part E | 配置参数附录 |

### 7.2 数据转译 (自然语言释义)

**一句话总结 (One-liner)**
```python
# 根据权重分布生成总结
if 防御权重 > 60%:
    "鉴于当前[宏观]环境，系统为[客户类型]量身定制了这套重兵把守于防御资产([防御比例]%)的组合..."
elif 防御权重 > 30%:
    "系统为[客户类型]配置了这套攻防兼备([防御]%防守 + [进攻]%进攻)的组合..."
```

**指标白话文**
| 指标 | 释义 |
|------|------|
| VaR (95%) | 在正常市场情况下，有95%概率单日亏损不超过X% |
| CVaR | 即使不幸遭遇最差5%情况，平均亏损X% |
| MaxDrawdown | 在历史最差时期，组合从最高点下跌X% |
| Sharpe > 1 | 每承担1单位风险获得超过1单位回报，投资效率高 |
| WinRate | 有X%的交易日是赚钱的 |

---

## 八、技术栈与部署

### 8.1 前端技术
- React 18 + TypeScript
- ECharts (图表)
- jsPDF + html2canvas (PDF生成)
- Vite (构建)

### 8.2 核心库依赖
```json
{
  "echarts": "^5.4.3",
  "echarts-for-react": "^3.0.2",
  "jspdf": "^2.5.1",
  "html2canvas": "^1.4.1"
}
```

### 8.3 本地知识库依赖
```bash
# Python虚拟环境
python3 -m venv venv
source venv/bin/activate
pip install pypdf
```

---

## 九、系统文件结构

```
investment-advisor/
├── src/
│   ├── main.tsx           # 入口
│   ├── App.tsx            # 主组件 (7步骤UI) - useState必须在组件内部
│   ├── index.css          # 样式
│   ├── types.ts          # 类型 + 核心逻辑 (约束/优化/回测/风控/知识库)
│   └── components/
│       └── PDFKnowledgeBase.tsx   # PDF知识库显示组件
├── local_knowledge_base/  # PDF研报知识库
│   └── *.pdf              # 行业研报PDF
├── 客户尽职调查/           # 客户尽职调查报告PDF
│   └── 许冉.pdf
├── mcp_server.py          # FastAPI后端服务 (MCP适配器)
├── .env                   # API配置 (Keys保存在此)
├── package.json
├── vite.config.ts
└── SOP_v3.4.md          # 本文档
```

### 9.1 MCP Server 后端服务
```bash
# 启动后端服务
python3 mcp_server.py
# 端口: 8001

# API端点:
# - GET  /health                     健康检查
# - GET  /api/market/sentiment       市场情绪 (VIX, Fear/Greed)
# - GET  /api/market/regime          市场Regime判断
# - GET  /api/market/indices         美股指数
# - GET  /api/customer/analyze/{name} 客户尽职调查分析
# - POST /api/portfolio/optimize     组合优化
# - POST /api/backtest/metrics       回测指标
```

---

## 十、常见问题排查

### 10.1 useState必须在组件内部
```typescript
// 错误 - 会导致null崩溃
const [pdfInsights, setPdfInsights] = useState(...); // 全局

const EquityCurveChart = ...

// 正确
export default function App() {
  // 放在组件内部
  const [pdfInsights, setPdfInsights] = useState(...);
  // ...
}
```

### 10.2 知识库为空时提示
```typescript
if (insights.length > 0) {
  // 有数据
  results.push({source: pdf.name, keyInsights: insights});
} else {
  // 无数据时返回提示
  results.push({
    source: pdf.name,
    keyInsights: ['暂无相关信息，请参考其他数据来源']
  });
}
```

### 10.3 接口导入问题
```typescript
// 确保导入语句正确
import { loadLocalKnowledgeBase, PDFAnalysis } from './types';
```

---

## 十一、版本历史

| 版本 | 日期 | 更新内容 |
|------|------|----------|
| v3.0 | 2026-04-16 | 初始版本 (4步骤) |
| v3.1 | 2026-04-16 | PDF报告生成 |
| v3.2 | 2026-04-16 | 修复侧边栏/百分比问题 |
| v3.3 | 2026-04-16 | 历史回测模块 + 数据转译 |
| v3.4 | 2026-04-18 | PDF知识库集成(pypdf)、修复useState位置、修复重复定义 |
| v3.5 | 2026-04-24 | 客户尽职调查(MiniMax M2.7)、MCP数据服务集成、市场感知自动加载 |

---

*Generated by Claude Code - 2026-04-24*