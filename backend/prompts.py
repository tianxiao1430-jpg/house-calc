"""Prompt templates for AI extraction and conversation."""

import json

EXTRACT_BUY_PROMPT = """This is a screenshot of a Japanese real estate listing. Extract the following information and return as JSON only (no explanation):

{
  "name": "<property name if shown>",
  "price": <number in yen, NOT man-en. If shown as 3500 万円，return 35000000>,
  "management_fee": <monthly management fee in yen, 0 if not shown>,
  "repair_reserve": <monthly repair reserve in yen, 0 if not shown>,
  "area": <area in m², null if not shown>,
  "building_age": <years old, null if not shown>,
  "location": <address string, null if not shown>,
  "structure": <"RC", "SRC", "木造", "鉄骨" etc, null if not shown>,
  "confidence": <0.0-1.0, your confidence in the extraction accuracy>
}

IMPORTANT:
- All monetary values must be in YEN (円), not 万円
- If price shows 3,500 万円，return 35000000
- If a field is not visible in the screenshot, use null (not 0)
- management_fee and repair_reserve: use 0 only if explicitly shown as 0
- Extract the property name (物件名) if visible
"""

EXTRACT_RENT_PROMPT = """This is a screenshot of a Japanese rental property listing. Extract the following information and return as JSON only (no explanation):

{
  "name": "<property name if shown>",
  "rent": <monthly rent in yen>,
  "management_fee": <monthly management fee in yen, 0 if not shown>,
  "common_fee": <monthly common area fee (共益費) in yen, 0 if not shown>,
  "area": <area in m², null if not shown>,
  "building_age": <years old, null if not shown>,
  "location": <address string, null if not shown>,
  "structure": <"RC", "SRC", "木造", "鉄骨" etc, null if not shown>,
  "deposit_months": <deposit in months (e.g., 1 for 1 ヶ月), null if not shown>,
  "key_money_months": <key money in months, null if not shown>,
  "confidence": <0.0-1.0, your confidence in the extraction accuracy>
}

IMPORTANT:
- All monetary values must be in YEN (円), not 万円
- rent: the monthly rent amount (家賃/賃料)
- If 管理費 and 共益費 are shown separately, put them in separate fields
- If a field is not visible in the screenshot, use null
- Extract the property name (物件名) if visible
"""

ENHANCE_PROPERTY_PROMPT = """You are a Japanese real estate data enhancement assistant.

Your task:
1. Analyze the search results provided
2. Extract accurate property information from them
3. Return ONLY JSON with fields that you found in search results
4. Do NOT guess or make up numbers
5. If search results don't contain a field, return null for that field

Rules:
- Price must be in yen (not 万円)
- Area must be in m²
- Building age must be years
- Structure: RC, SRC, 木造，鉄骨，etc.
- Location: full address if available
"""


def build_chat_prompt(mode: str, extracted: dict) -> str:
    """Build the system prompt for conversational follow-up."""
    extracted_json = json.dumps(extracted, ensure_ascii=False, indent=2)

    base = f"""你是在日华人房产顾问 AI。用中文友好对话，像朋友聊天。每次只问一个问题。

物件信息：{extracted_json}

"""
    if mode == "buy":
        return base + """任务：收集计算所需信息，收集完加 [CALC_READY]。
需要确认：头金 (默认房价 10%)、贷款年限 (默认 35 年)、自住还是投资。
规则：每次只问一个问题。回复简短。用户说"默认"就用默认值。尽快收集完。"""
    else:
        return base + """任务：收集计算所需信息，收集完加 [CALC_READY]。
需要确认：敷金 (默认 1 月)、礼金 (默认 1 月)、是否要保证会社 (默认要)。如物件信息里已有就跳过。
规则：每次只问一个问题。回复简短。用户说"默认"就用默认值。尽快收集完。"""
