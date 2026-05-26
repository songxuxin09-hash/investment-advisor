"""
测试MinerU API - 使用Python库调用
"""
import json
import os
import sys

# 从环境变量读取
from dotenv import load_dotenv
load_dotenv("/Users/tinasmacair/Documents/investment-advisor/.env")

API_KEY = os.environ.get("MINERU_API_KEY", "")

if not API_KEY:
    print("ERROR: MINERU_API_KEY未设置")
    sys.exit(1)

print("使用API Key:", API_KEY[:50], "...")

pdf_path = "/Users/tinasmacair/Documents/investment-advisor/local_knowledge_base/20260416-招商证券-专题报告：重估2026年CPI中枢与上行斜率.pdf"

# 尝试使用MinerU库
try:
    from mineru import MagicPDF

    print("使用MinerU本地库调用...")
    magic_pdf = MagicPDF(API_KEY)

    with open(pdf_path, "rb") as f:
        result = magic_pdf.parse(pdf_file=f)
        print("解析结果:", result[:500] if result else "空结果")
except Exception as e:
    print(f"本地库调用失败: {e}")

    # 尝试HTTP API
    try:
        import requests
        url = "https://api.mineru.cn/open/v1/file/upload"

        with open(pdf_path, "rb") as f:
            files = {"file": f}
            data = {"file_name": "test.pdf"}
            headers = {"Authorization": f"Bearer {API_KEY}"}

            response = requests.post(url, files=files, data=data, headers=headers, timeout=120)
            print("HTTP响应:", response.status_code)
            if response.status_code == 200:
                result = response.json()
                print("响应:", json.dumps(result, ensure_ascii=False)[:1000])
            else:
                print("HTTP失败:", response.text[:500])
    except Exception as e2:
        print(f"HTTP也失败: {e2}")