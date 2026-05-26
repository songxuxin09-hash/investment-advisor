"""
使用pypdf提取PDF文本内容 - 简单可靠
"""
from pypdf import PdfReader
import os

# PDF文件
PDF_DIR = "/Users/tinasmacair/Documents/investment-advisor/local_knowledge_base"
OUTPUT_DIR = "/Users/tinasmacair/Documents/investment-advisor/local_knowledge_base"

pdf_files = [
    ("20260416-招商证券-专题报告：重估2026年CPI中枢与上行斜率.pdf", "zhaoshang_cpi.md"),
    ("20260417-国海证券-2026年4月大类资产配置报告：筑底进行时，四月把握结构性机遇.pdf", "guohai_asset.md")
]

for pdf_name, output_name in pdf_files:
    pdf_path = os.path.join(PDF_DIR, pdf_name)
    output_path = os.path.join(OUTPUT_DIR, output_name)

    print(f"正在提取: {pdf_name}")

    try:
        reader = PdfReader(pdf_path)
        text_content = []

        for i, page in enumerate(reader.pages):
            text = page.extract_text()
            if text.strip():
                text_content.append(f"## 第{i+1}页\n\n{text}\n")

        # 保存为Markdown
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(f"# {pdf_name}\n\n")
            f.write("\n".join(text_content))

        print(f"✓ 已保存到: {output_path}")
        print(f"  总页数: {len(reader.pages)}")

    except Exception as e:
        print(f"失败: {e}")
        import traceback
        traceback.print_exc()