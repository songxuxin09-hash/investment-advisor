"""
使用MinerU本地解析PDF为Markdown - 本地模式不需要网络
"""
import os
import sys
from pathlib import Path
from dotenv import load_dotenv
load_dotenv("/Users/tinasmacair/Documents/investment-advisor/.env")

# 设置环境变量禁用网络相关功能
os.environ["MINERU_USE_LOCAL_ONLY"] = "1"
os.environ["MINERU_DISABLE_NETWORK"] = "1"

# 设置输出目录
OUTPUT_DIR = "/Users/tinasmacair/Documents/investment-advisor/local_knowledge_base"

# PDF文件
pdf_files = [
    ("20260416-招商证券-专题报告：重估2026年CPI中枢与上行斜率.pdf", "zhaoshang_cpi"),
    ("20260417-国海证券-2026年4月大类资产配置报告：筑底进行时，四月把握结构性机遇.pdf", "guohai_asset")
]

from mineru.cli.client import main as mineru_main

# 使用mineru的本地模式
for pdf_name, output_prefix in pdf_files:
    pdf_path = f"/Users/tinasmacair/Documents/investment-advisor/local_knowledge_base/{pdf_name}"
    output_path = f"{OUTPUT_DIR}/{output_prefix}.md"

    print(f"正在解析: {pdf_name}")

    try:
        # 使用mineru解析
        sys.argv = [
            "mineru",
            pdf_path,
            "--output-dir", OUTPUT_DIR,
            "--output-filename", f"{output_prefix}.md"
        ]
        mineru_main()
        print(f"✓ 完成: {output_path}")
    except Exception as e:
        print(f"解析失败: {e}")
        import traceback
        traceback.print_exc()