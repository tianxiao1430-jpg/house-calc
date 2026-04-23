"""House Calc Backend — FastAPI server for AI property analysis."""

import base64
import asyncio
import json
import os
import smtplib
import uuid
from datetime import datetime, timezone
from email.mime.text import MIMEText
from typing import Optional
from urllib.parse import urlparse

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Request
from starlette.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, ConfigDict

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

ALLOWED_ORIGINS = os.getenv(
    "CORS_ORIGINS",
    "https://house-calc.expo.app,http://localhost:3000,http://localhost:8081",
).split(",")
PUBLIC_BROWSER_ORIGINS = {
    origin.strip()
    for origin in os.getenv("ANONYMOUS_BROWSER_ORIGINS", ",".join(ALLOWED_ORIGINS)).split(",")
    if origin.strip()
}
ANONYMOUS_COMPAT_PATHS = {
    "/extract",
    "/chat",
    "/calculate/buy",
    "/calculate/rent",
    "/submit-lead",
}
VALID_MODES = {"buy", "rent"}
LEAD_BACKUP_BUCKET = os.getenv("LEAD_BACKUP_BUCKET", "").strip()
CHAT_LLM_TIMEOUT_SECONDS = float(os.getenv("CHAT_LLM_TIMEOUT_SECONDS", "8"))

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "304135313939-fp7iucrc3jim096gitjuer03502shu3j.apps.googleusercontent.com")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in ALLOWED_ORIGINS],
    allow_credentials=True,
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


# ── Google ID Token Verification ───────────────────────────────────

async def verify_google_token(request: Request) -> Optional[str]:
    """Verify Google ID token from Authorization header. Returns user email or None."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    token = auth_header[7:]
    if not token:
        return None

    try:
        from google.auth.transport.requests import Request as GoogleAuthRequest
        from google.oauth2 import id_token as google_id_token

        data = google_id_token.verify_oauth2_token(token, GoogleAuthRequest(), GOOGLE_CLIENT_ID)
        if data.get("aud") != GOOGLE_CLIENT_ID:
            print(f"[auth] ID token audience mismatch: {data.get('aud')}")
            return None
        if not _is_email_verified(data.get("email_verified")):
            return None
        return data.get("email")
    except Exception as id_error:
        try:
            import urllib.request

            url = f"https://oauth2.googleapis.com/tokeninfo?access_token={token}"
            req = urllib.request.Request(url)
            with urllib.request.urlopen(req, timeout=5) as resp:
                data = json.loads(resp.read())
            if data.get("aud") != GOOGLE_CLIENT_ID:
                print(f"[auth] Access token audience mismatch: {data.get('aud')}")
                return None
            if not _is_email_verified(data.get("email_verified")):
                return None
            return data.get("email")
        except Exception as access_error:
            print(
                "[auth] Token verification failed "
                f"id_token_error={id_error} access_token_error={access_error}"
            )
            return None


def _is_email_verified(value) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.lower() == "true"
    return False


def _request_origin(request: Request) -> Optional[str]:
    origin = (request.headers.get("Origin") or "").strip()
    if origin:
        return origin

    referer = (request.headers.get("Referer") or "").strip()
    if not referer:
        return None

    parsed = urlparse(referer)
    if not parsed.scheme or not parsed.netloc:
        return None
    return f"{parsed.scheme}://{parsed.netloc}"


def _allow_anonymous_request(request: Request) -> bool:
    if request.url.path not in ANONYMOUS_COMPAT_PATHS:
        return False

    origin = _request_origin(request)
    if origin in PUBLIC_BROWSER_ORIGINS:
        return True

    print(
        f"[auth] Anonymous request rejected path={request.url.path} "
        f"origin={origin or 'missing'}"
    )
    return False


def _require_number(value: Optional[float], field_name: str) -> float:
    if value is None:
        raise HTTPException(422, f"{field_name} is required.")
    if value < 0:
        raise HTTPException(422, f"{field_name} must be >= 0.")
    return value


def _require_non_negative(value: Optional[float], field_name: str) -> Optional[float]:
    if value is None:
        return None
    if value < 0:
        raise HTTPException(422, f"{field_name} must be >= 0.")
    return value


def _fallback_chat_reply(mode: str) -> str:
    if mode == "rent":
        return (
            "AI 助手暂时响应较慢。你可以先查看租房费用试算结果，"
            "押金/礼金等字段如果不确定，系统会按默认值估算，之后再人工核对。 "
            "[CALC_READY]"
        )
    return (
        "AI 助手暂时响应较慢。你可以先查看买房费用试算结果，"
        "首付、贷款年限等会按默认值估算，之后再人工核对。 "
        "[CALC_READY]"
    )


def _can_calculate_from_extracted(mode: str, extracted: "ExtractedProperty") -> bool:
    if mode == "buy":
        return bool((extracted.price and extracted.price > 0) or _looks_like_legacy_empty_chat(extracted))
    if mode == "rent":
        return bool((extracted.rent and extracted.rent > 0) or _looks_like_legacy_empty_chat(extracted))
    return False


def _looks_like_legacy_empty_chat(extracted: "ExtractedProperty") -> bool:
    """Production web may send property in session but an empty extracted object to /chat."""
    return not any(
        [
            extracted.price,
            extracted.rent,
            extracted.location,
            extracted.area,
            extracted.building_age,
        ]
    )


def _ensure_calc_ready_marker(text: str, mode: str, extracted: "ExtractedProperty") -> str:
    if "[CALC_READY]" in text or not _can_calculate_from_extracted(mode, extracted):
        return text
    return f"{text.rstrip()}\n\n你也可以先查看费用明细，再继续补充条件。[CALC_READY]"


async def _chat_completion_with_timeout(
    messages: list,
    system: Optional[str],
    max_tokens: int,
) -> str:
    return await asyncio.wait_for(
        asyncio.to_thread(chat_completion, messages, system=system, max_tokens=max_tokens),
        timeout=CHAT_LLM_TIMEOUT_SECONDS,
    )


@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    """Require valid Google ID token for all endpoints except /health."""
    if request.url.path == "/health" or request.method == "OPTIONS":
        return await call_next(request)

    email = await verify_google_token(request)
    if email:
        request.state.user_email = email
        request.state.auth_mode = "google"
        response = await call_next(request)
        return response

    if _allow_anonymous_request(request):
        request.state.user_email = None
        request.state.auth_mode = "anonymous"
        response = await call_next(request)
        return response

    return JSONResponse(status_code=401, content={"detail": "Unauthorized: valid Google login required"})


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
    if mode not in VALID_MODES:
        raise HTTPException(400, "mode must be 'buy' or 'rent'")
    if image.content_type and not image.content_type.startswith("image/"):
        raise HTTPException(400, "Unsupported file type. Please upload an image.")

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
        print(f"[extract] Failed to parse model output mode={mode}")
        raise HTTPException(422, "Failed to extract structured property data from the image.")

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
        assistant_text = await _chat_completion_with_timeout(
            messages,
            system=system_prompt,
            max_tokens=512,
        )
    except Exception as e:
        print(f"[chat] LLM unavailable, returning fallback reply: {type(e).__name__}: {e}")
        assistant_text = _fallback_chat_reply(req.mode)

    assistant_text = _ensure_calc_ready_marker(assistant_text, req.mode, req.extracted)
    messages.append({"role": "assistant", "content": assistant_text})

    return {"reply": assistant_text, "conversation": messages}


@app.post("/calculate/buy", response_model=CostResult)
async def calculate_buy(inputs: BuyInputs):
    """Calculate buy-mode cost breakdown."""
    p = inputs.property
    price = _require_number(p.price, "property.price")
    down_payment = _require_number(inputs.down_payment, "down_payment")
    if down_payment > price:
        raise HTTPException(422, "down_payment cannot exceed property.price.")
    _require_non_negative(inputs.interest_rate, "interest_rate")
    if inputs.loan_term_years <= 0:
        raise HTTPException(422, "loan_term_years must be > 0.")

    monthly_items = calc_buy_monthly(
        price=price,
        management_fee=_require_non_negative(p.management_fee, "property.management_fee") or 0,
        repair_reserve=_require_non_negative(p.repair_reserve, "property.repair_reserve") or 0,
        area=p.area or 60,
        structure=p.structure or "RC",
        down_payment=down_payment,
        loan_term_years=inputs.loan_term_years,
        interest_rate=inputs.interest_rate,
    )
    loan_amount = price - down_payment
    initial_items = calc_buy_initial(
        price=price,
        loan_amount=loan_amount,
        is_new=inputs.is_new_construction,
    )
    long_term = calc_buy_long_term(
        initial_items=initial_items,
        monthly_non_mortgage_total=sum(i["amount"] for i in monthly_items[1:]),
        loan_amount=loan_amount,
        annual_rate=inputs.interest_rate,
        loan_term_years=inputs.loan_term_years,
    )

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
    rent = _require_number(p.rent, "property.rent")
    management_fee = (
        (_require_non_negative(p.management_fee, "property.management_fee") or 0)
        + (_require_non_negative(p.common_fee, "property.common_fee") or 0)
    )
    deposit_months = 1 if p.deposit_months is None else _require_non_negative(
        p.deposit_months, "property.deposit_months"
    )
    key_money_months = 1 if p.key_money_months is None else _require_non_negative(
        p.key_money_months, "property.key_money_months"
    )
    monthly_items = calc_rent_monthly(
        rent=rent,
        management_fee=management_fee,
        needs_guarantor=inputs.needs_guarantor,
    )
    initial_items = calc_rent_initial(
        rent=rent,
        deposit_months=deposit_months,
        key_money_months=key_money_months,
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
        print(
            f"[LEAD] Email not configured mode={lead.mode} "
            f"satisfied={lead.satisfied}"
        )
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


def _store_lead_backup(lead: LeadSubmission) -> bool:
    """Persist a lead when email delivery is unavailable."""
    if not LEAD_BACKUP_BUCKET:
        print("[LEAD] Backup bucket not configured")
        return False

    try:
        from google.cloud import storage
    except Exception as e:
        print(f"[LEAD] Backup storage dependency unavailable: {e}")
        return False

    object_name = (
        f"leads/{datetime.now(timezone.utc):%Y/%m/%d}/"
        f"{datetime.now(timezone.utc):%H%M%S}-{uuid.uuid4().hex}.json"
    )
    payload = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        **lead.model_dump(),
    }

    try:
        storage.Client().bucket(LEAD_BACKUP_BUCKET).blob(object_name).upload_from_string(
            json.dumps(payload, ensure_ascii=False),
            content_type="application/json",
        )
        print(f"[LEAD] Backup stored object={object_name}")
        return True
    except Exception as e:
        print(f"[LEAD] Backup store failed: {e}")
        return False


@app.post("/submit-lead")
async def submit_lead(lead: LeadSubmission):
    """Submit a lead from the app to notify staff."""
    email_sent = _send_lead_email(lead)
    backup_stored = False
    if not email_sent:
        backup_stored = _store_lead_backup(lead)
    location = lead.property_summary.get("location", "unknown")
    print(
        f"[LEAD] submit_lead mode={lead.mode} satisfied={lead.satisfied} "
        f"location={location} email_sent={email_sent} backup_stored={backup_stored}"
    )
    if not email_sent and not backup_stored:
        raise HTTPException(503, "Lead submission failed. Please retry later.")
    return {"status": "ok", "email_sent": email_sent, "backup_stored": backup_stored}
