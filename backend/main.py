"""House Calc Backend — FastAPI server for AI property analysis."""

import base64
import os
import smtplib
from email.mime.text import MIMEText
from typing import Optional

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from cost_model import (
    calc_buy_monthly,
    calc_buy_initial,
    calc_buy_long_term,
    calc_rent_monthly,
    calc_rent_initial,
    calc_rent_long_term,
)
from llm_client import vision_extract, chat_completion, parse_json_response
from prompts import (
    EXTRACT_BUY_PROMPT,
    EXTRACT_RENT_PROMPT,
    ENHANCE_PROPERTY_PROMPT,
    build_needs_prompt,
    build_analysis_report,
)
from search_tools import search_property_info, search_property_reviews, search_area_info

app = FastAPI(title="House Calc API", version="0.3.0")

ALLOWED_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:8081").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in ALLOWED_ORIGINS],
    allow_credentials=True,
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


# ── Request / Response Models ──────────────────────────────────────


class ExtractedProperty(BaseModel):
    price: Optional[float] = Field(None, description="物件価格 (円)")
    rent: Optional[float] = Field(None, description="家賃 (円/月)")
    management_fee: Optional[float] = Field(0, description="管理費 (円/月)")
    repair_reserve: Optional[float] = Field(0, description="修繕積立金 (円/月)")
    common_fee: Optional[float] = Field(0, description="共益費 (円/月)")
    area: Optional[float] = Field(None, description="専有面積 (m²)")
    building_age: Optional[int] = Field(None, description="築年数")
    location: Optional[str] = Field(None, description="所在地")
    structure: Optional[str] = Field(None, description="構造 (RC/木造等)")
    deposit_months: Optional[float] = Field(1, description="敷金 (月数)")
    key_money_months: Optional[float] = Field(1, description="礼金 (月数)")
    confidence: Optional[float] = Field(None, description="識別信頼度 0-1")
    name: Optional[str] = Field(None, description="物件名")
    station: Optional[str] = Field(None, description="最寄駅")
    walk_minutes: Optional[int] = Field(None, description="駅徒歩分数")
    floor: Optional[int] = Field(None, description="階数")
    year_built: Optional[int] = Field(None, description="築年")


class PropertySearchRequest(BaseModel):
    property_name: str
    location: Optional[str] = None


class PropertyEnhanceRequest(BaseModel):
    extracted: ExtractedProperty
    search_results: list[dict]


class ClientNeedsRequest(BaseModel):
    mode: str = Field(..., description="buy | rent")
    conversation: list = Field(default_factory=list)
    user_message: str = Field("")


class AnalysisReportRequest(BaseModel):
    mode: str = Field(..., description="buy | rent")
    property_info: dict
    client_needs: list = Field(default_factory=list)
    search_info: str = Field("", description="Optional search results")


class BuyInputs(BaseModel):
    property: ExtractedProperty
    down_payment: float = Field(..., description="頭金 (円)")
    loan_term_years: int = Field(35, description="ローン年数")
    interest_rate: float = Field(0.00475, description="年利率 (0.00475 = 0.475%)")
    purpose: str = Field("residence", description="residence | investment")
    is_new_construction: bool = Field(False, description="新築かどうか")


class RentInputs(BaseModel):
    property: ExtractedProperty
    needs_guarantor: bool = Field(True, description="保証会社が必要か")


class ChatRequest(BaseModel):
    mode: str = Field(..., description="buy | rent")
    extracted: ExtractedProperty
    conversation: list = Field(default_factory=list)
    user_message: str = Field("")


class CostLineItem(BaseModel):
    label: str
    amount: float


class CostResult(BaseModel):
    mode: str
    monthly_items: list[CostLineItem]
    monthly_total: float
    initial_items: list[CostLineItem]
    initial_total: float
    long_term: list[dict]


# ── Endpoints ──────────────────────────────────────────────────────


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/extract", response_model=ExtractedProperty)
async def extract_property(
    image: UploadFile = File(...),
    mode: str = Form("buy"),
):
    """Screenshot -> AI extracts property information."""
    print(f"[extract] Received image: {image.filename}, content_type: {image.content_type}, mode: {mode}")
    contents = await image.read()
    print(f"[extract] Image size: {len(contents)} bytes")
    if len(contents) > 10_000_000:
        raise HTTPException(400, "Image too large (max 10MB)")

    b64 = base64.standard_b64encode(contents).decode("utf-8")
    media_type = image.content_type or "image/jpeg"

    prompt = EXTRACT_BUY_PROMPT if mode == "buy" else EXTRACT_RENT_PROMPT

    try:
        raw = vision_extract(b64, media_type, prompt)
    except Exception as e:
        raise HTTPException(502, f"LLM API error: {e}")

    try:
        data = parse_json_response(raw)
    except Exception:
        raise HTTPException(
            422, {"error": "Failed to parse AI response", "raw": raw}
        )

    return ExtractedProperty(**data)


@app.post("/search/property", response_model=list[dict])
async def search_property(req: PropertySearchRequest):
    """Search for property information online to complement extracted data."""
    print(f"[search] Searching for: {req.property_name} in {req.location or 'Japan'}")
    
    results = search_property_info(req.property_name, req.location or "")
    
    if not results:
        results = search_property_info(req.property_name)
    
    print(f"[search] Found {len(results)} results")
    return results


@app.post("/search/reviews", response_model=list[dict])
async def search_reviews(req: PropertySearchRequest):
    """Search for property reviews and 口碑."""
    print(f"[search] Searching reviews for: {req.property_name}")
    
    results = search_property_reviews(req.property_name, req.location or "")
    
    print(f"[search] Found {len(results)} review results")
    return results


@app.post("/search/area", response_model=list[dict])
async def search_area(location: str = Form(...)):
    """Search for area information (nearby facilities, transport, etc.)."""
    print(f"[search] Searching area info for: {location}")
    
    results = search_area_info(location)
    
    print(f"[search] Found {len(results)} area results")
    return results


@app.post("/enhance/property", response_model=ExtractedProperty)
async def enhance_property(req: PropertyEnhanceRequest):
    """Use search results to enhance extracted property information."""
    print(f"[enhance] Enhancing property: {req.extracted.name or 'Unknown'}")
    
    search_text = "\n\n".join([
        f"来源：{r.get('title', 'Unknown')}\nURL: {r.get('url', '')}\n内容：{r.get('body', '')}"
        for r in req.search_results
    ])
    
    try:
        enhanced_raw = chat_completion(
            messages=[{"role": "user", "content": f"""
物件情報：{req.extracted.model_dump_json()}

検索結果：
{search_text}

上記の検索結果を元に、物件情報を補完してください。
見つかった情報だけを JSON で返してください（説明不要）：
{{
  "price": <number or null>,
  "area": <number or null>,
  "building_age": <number or null>,
  "structure": <string or null>,
  "location": <string or null>,
  "name": <string or null>,
  "station": <string or null>,
  "walk_minutes": <number or null>
}}
"""}],
            system=ENHANCE_PROPERTY_PROMPT,
            max_tokens=512
        )
        enhanced_data = parse_json_response(enhanced_raw)
        
        merged = req.extracted.model_dump()
        for key, value in enhanced_data.items():
            if value is not None and (merged.get(key) is None or merged.get(key) == 0):
                merged[key] = value
        
        return ExtractedProperty(**merged)
    except Exception as e:
        print(f"[enhance] Error: {e}")
        return req.extracted


@app.post("/needs/collect")
async def collect_needs(req: ClientNeedsRequest):
    """Collect client needs through conversation."""
    print(f"[needs] Mode: {req.mode}, message: {req.user_message}")
    
    system_prompt = build_needs_prompt(req.mode)
    
    messages = list(req.conversation)
    if req.user_message:
        messages.append({"role": "user", "content": req.user_message})
    
    try:
        assistant_text = chat_completion(messages, system=system_prompt, max_tokens=256)
    except Exception as e:
        raise HTTPException(502, f"LLM API error: {e}")
    
    messages.append({"role": "assistant", "content": assistant_text})
    
    # Check if needs collection is complete
    needs_ready = "[NEEDS_READY]" in assistant_text
    
    return {
        "reply": assistant_text.replace("[NEEDS_READY]", ""),
        "conversation": messages,
        "needs_ready": needs_ready
    }


@app.post("/analysis/report", response_model=dict)
async def generate_analysis_report(req: AnalysisReportRequest):
    """Generate suitability analysis report for a property."""
    print(f"[analysis] Generating report for {req.mode} mode")
    
    try:
        report_prompt = build_analysis_report(req.property_info, req.client_needs, req.search_info)
        
        report_text = chat_completion(
            messages=[{"role": "user", "content": "请生成适合度分析报告"}],
            system=report_prompt,
            max_tokens=1024
        )
        
        return {
            "report": report_text,
            "property_info": req.property_info,
            "client_needs": req.client_needs
        }
    except Exception as e:
        raise HTTPException(502, f"LLM API error: {e}")


@app.post("/chat")
async def chat(req: ChatRequest):
    """Conversational follow-up questions (legacy endpoint)."""
    from prompts import build_chat_prompt
    
    system_prompt = build_chat_prompt(req.mode, req.extracted.model_dump())

    messages = list(req.conversation)
    if req.user_message:
        messages.append({"role": "user", "content": req.user_message})

    if len(messages) > 10:
        messages = messages[-10:]

    try:
        assistant_text = chat_completion(messages, system=system_prompt, max_tokens=512)
    except Exception as e:
        raise HTTPException(502, f"LLM API error: {e}")

    messages.append({"role": "assistant", "content": assistant_text})

    return {"reply": assistant_text, "conversation": messages}


@app.post("/calculate/buy", response_model=CostResult)
async def calculate_buy(inputs: BuyInputs):
    """Calculate buy-mode cost breakdown."""
    p = inputs.property
    monthly_items = calc_buy_monthly(
        price=p.price,
        management_fee=p.management_fee,
        repair_reserve=p.repair_reserve,
        area=p.area or 60,
        structure=p.structure or "RC",
        down_payment=inputs.down_payment,
        loan_term_years=inputs.loan_term_years,
        interest_rate=inputs.interest_rate,
    )
    initial_items = calc_buy_initial(
        price=p.price,
        loan_amount=p.price - inputs.down_payment,
        is_new=inputs.is_new_construction,
    )
    long_term = calc_buy_long_term(monthly_items, initial_items)

    monthly_total = sum(i["amount"] for i in monthly_items)
    initial_total = sum(i["amount"] for i in initial_items)

    return CostResult(
        mode="buy",
        monthly_items=[CostLineItem(**i) for i in monthly_items],
        monthly_total=monthly_total,
        initial_items=[CostLineItem(**i) for i in initial_items],
        initial_total=initial_total,
        long_term=long_term,
    )


@app.post("/calculate/rent", response_model=CostResult)
async def calculate_rent(inputs: RentInputs):
    """Calculate rent-mode cost breakdown."""
    p = inputs.property
    monthly_items = calc_rent_monthly(
        rent=p.rent,
        management_fee=p.management_fee + p.common_fee,
        needs_guarantor=inputs.needs_guarantor,
    )
    initial_items = calc_rent_initial(
        rent=p.rent,
        deposit_months=p.deposit_months or 1,
        key_money_months=p.key_money_months or 1,
    )
    long_term = calc_rent_long_term(monthly_items, initial_items)

    monthly_total = sum(i["amount"] for i in monthly_items)
    initial_total = sum(i["amount"] for i in initial_items)

    return CostResult(
        mode="rent",
        monthly_items=[CostLineItem(**i) for i in monthly_items],
        monthly_total=monthly_total,
        initial_items=[CostLineItem(**i) for i in initial_items],
        initial_total=initial_total,
        long_term=long_term,
    )


# ── Lead Submission ────────────────────────────────────────────────


class LeadSubmission(BaseModel):
    mode: str = Field(..., description="buy | rent")
    satisfied: bool = Field(..., description="Client satisfied with property?")
    feedback: str = Field("", description="What client is unsatisfied about")
    contact_name: str = Field("", description="Client name")
    contact_info: str = Field("", description="Phone, LINE, WeChat etc.")
    property_summary: dict = Field(default_factory=dict, description="Property info")
    cost_summary: dict = Field(default_factory=dict, description="Cost calculation result")


def _send_lead_email(lead: LeadSubmission):
    """Send lead notification email to staff."""
    smtp_host = os.getenv("SMTP_HOST", "")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER", "")
    smtp_pass = os.getenv("SMTP_PASS", "")
    notify_to = os.getenv("LEAD_NOTIFY_EMAIL", "")

    if not all([smtp_host, smtp_user, smtp_pass, notify_to]):
        print(f"[LEAD] Email not configured. Lead data: {lead.model_dump_json()}")
        return False

    status = "满意，希望推进" if lead.satisfied else "不满意，需要跟进"
    prop = lead.property_summary
    location = prop.get("location", "未知")
    price_or_rent = (
        f"¥{prop.get('price', 0):,.0f}" if lead.mode == "buy"
        else f"¥{prop.get('rent', 0):,.0f}/月"
    )

    feedback_section = f"不满意原因:\n  {lead.feedback}" if not lead.satisfied and lead.feedback else ""

    body = f"""新客户线索通知

状态：{status}
模式：{"买房" if lead.mode == "buy" else "租房"}
物件：{location} ({price_or_rent})

客户信息:
  姓名：{lead.contact_name}
  联系方式：{lead.contact_info}

{feedback_section}

费用概要:
  月支出：¥{lead.cost_summary.get("monthly_total", 0):,.0f}
  初期费用：¥{lead.cost_summary.get("initial_total", 0):,.0f}
"""

    msg = MIMEText(body, "plain", "utf-8")
    msg["Subject"] = f"[House Calc] 新线索 - {location} ({status})"
    msg["From"] = smtp_user
    msg["To"] = notify_to

    try:
        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.starttls()
            server.login(smtp_user, smtp_pass)
            server.send_message(msg)
        return True
    except Exception as e:
        print(f"[LEAD] Email send failed: {e}")
        return False


@app.post("/submit-lead")
async def submit_lead(lead: LeadSubmission):
    """Submit a lead from the app to notify staff."""
    email_sent = _send_lead_email(lead)
    print(f"[LEAD] {'Email sent' if email_sent else 'Logged only'}: "
          f"{lead.contact_name} / {lead.contact_info} / "
          f"{'satisfied' if lead.satisfied else 'unsatisfied'}")
    return {"status": "ok", "email_sent": email_sent}
