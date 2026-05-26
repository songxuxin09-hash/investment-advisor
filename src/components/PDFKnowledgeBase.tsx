import { PDFAnalysis } from '../types';

interface Props {
  pdfInsights: PDFAnalysis[];
}

export function PDFKnowledgeBase({ pdfInsights }: Props) {
  if (!pdfInsights || pdfInsights.length === 0) {
    return (
      <div style={{ padding: 12, backgroundColor: '#fffbeb', borderRadius: 8, color: '#744210' }}>
        暂无知识库数据
      </div>
    );
  }

  return (
    <div style={{ marginTop: 16, padding: 12, backgroundColor: '#fffbeb', borderRadius: 8, border: '1px solid #f6ad55' }}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: '#744210' }}>
        知识库分析结果
      </div>
      {pdfInsights.map((pdf, idx: number) => (
        <div key={idx} style={{ marginBottom: 8, padding: 8, backgroundColor: '#fff', borderRadius: 4 }}>
          <div style={{ fontSize: 11, color: '#b7791f', marginBottom: 4 }}>
            {pdf.source}
          </div>
          {pdf.keyInsights && pdf.keyInsights.map((insight: string, i: number) => (
            <div key={i} style={{ fontSize: 11, color: '#4a5568' }}>
              - {insight}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}