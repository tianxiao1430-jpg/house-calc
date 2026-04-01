"""Japanese property cost calculation engine.

All calculations are deterministic — no LLM dependency.
Formulas based on standard Japanese real estate practice.
All amounts in JPY (円).
"""

import math


# ── Mortgage Calculation ───────────────────────────────────────────


def calc_monthly_payment(principal: float, annual_rate: float, years: int) -> float:
    """元利均等返済 (Equal Monthly Payment).

    Args:
        principal: 借入額 (円)
        annual_rate: 年利率 as decimal (e.g., 0.00475 for 0.475%)
        years: ローン年数

    Returns:
        Monthly payment (円)
    """
    if principal <= 0:
        return 0
    if years <= 0:
        return principal  # pay it all at once

    # Edge case: 0% interest
    if annual_rate <= 0:
        return principal / (years * 12)

    # Validate rate range (0-20% annual)
    if annual_rate > 0.20:
        raise ValueError(f"Interest rate {annual_rate} seems too high. Expected decimal like 0.00475 for 0.475%")

    monthly_rate = annual_rate / 12
    n = years * 12
    payment = principal * monthly_rate * math.pow(1 + monthly_rate, n) / (math.pow(1 + monthly_rate, n) - 1)
    return round(payment)


# ── Buy Mode: Monthly Costs ───────────────────────────────────────


def calc_buy_monthly(
    price: float,
    management_fee: float,
    repair_reserve: float,
    area: float,
    structure: str,
    down_payment: float,
    loan_term_years: int,
    interest_rate: float,
) -> list[dict]:
    """Calculate monthly costs for buying."""
    loan_amount = max(0, price - down_payment)
    mortgage = calc_monthly_payment(loan_amount, interest_rate, loan_term_years)

    # 固定資産税 — split building/land with residential exemptions
    assessed = price * 0.70  # 評価額 ≈ 市場価格 × 70%
    # Simplified split: 60% building, 40% land (typical for condos)
    assessed_building = assessed * 0.60
    assessed_land = assessed * 0.40

    # 小規模住宅用地特例: land assessed × 1/6
    property_tax_building = assessed_building * 0.014 / 12
    property_tax_land = assessed_land * (1 / 6) * 0.014 / 12
    property_tax = round(property_tax_building + property_tax_land)

    # 都市計画税: land × 1/3 for residential
    city_tax_building = assessed_building * 0.003 / 12
    city_tax_land = assessed_land * (1 / 3) * 0.003 / 12
    city_tax = round(city_tax_building + city_tax_land)

    # 火災保険: RC vs wooden
    if structure and structure.upper() in ("RC", "SRC", "鉄筋", "鉄骨"):
        insurance_annual = area * 200
    else:
        insurance_annual = area * 350
    fire_insurance = round(insurance_annual / 12)

    items = [
        {"label": "住宅ローン月供", "amount": mortgage},
        {"label": "管理費", "amount": round(management_fee)},
        {"label": "修繕積立金", "amount": round(repair_reserve)},
        {"label": "固定資産税", "amount": property_tax},
        {"label": "都市計画税", "amount": city_tax},
        {"label": "火災・地震保険", "amount": fire_insurance},
    ]

    return items


# ── Buy Mode: Initial Costs ───────────────────────────────────────


def calc_buy_initial(
    price: float,
    loan_amount: float,
    is_new: bool = False,
) -> list[dict]:
    """Calculate one-time costs for buying."""
    assessed = price * 0.70
    assessed_building = assessed * 0.60

    # 仲介手数料 (not applicable for new construction from developer)
    agent_fee = round((price * 0.03 + 60000) * 1.10) if not is_new else 0

    # 登録免許税 (所有権移転 or 保存)
    if is_new:
        registration_tax = round(assessed * 0.0015)  # 保存登記 0.15%
    else:
        registration_tax = round(assessed * 0.003)  # 移転登記 0.3%

    # 登録免許税 (抵当権設定)
    mortgage_registration = round(loan_amount * 0.001)  # 0.1%

    # 不動産取得税 (with 1200万 deduction for residential)
    building_taxable = max(0, assessed_building - 12_000_000)
    acquisition_tax = round(building_taxable * 0.03)
    # Land portion: simplified — often very small or zero for condos
    # after the formula-based deduction. Use conservative estimate.
    acquisition_tax_land = round(assessed * 0.40 * 0.5 * 0.03)  # 50% deduction estimate
    acquisition_tax += acquisition_tax_land

    # 印紙税
    if price <= 10_000_000:
        stamp_tax = 10000
    elif price <= 50_000_000:
        stamp_tax = 20000
    elif price <= 100_000_000:
        stamp_tax = 60000
    else:
        stamp_tax = 100000

    # 司法書士報酬
    judicial_fee = 120000  # 概算

    # ローン事務手数料
    loan_admin_fee = round(loan_amount * 0.022)

    items = [
        {"label": "仲介手数料", "amount": agent_fee},
        {"label": "登録免許税（所有権）", "amount": registration_tax},
        {"label": "登録免許税（抵当権）", "amount": mortgage_registration},
        {"label": "不動産取得税", "amount": acquisition_tax},
        {"label": "印紙税", "amount": stamp_tax},
        {"label": "司法書士報酬", "amount": judicial_fee},
        {"label": "ローン事務手数料", "amount": loan_admin_fee},
    ]

    # Filter out zero items (e.g., no agent fee for new construction)
    return [i for i in items if i["amount"] > 0]


def calc_buy_long_term(
    monthly_items: list[dict],
    initial_items: list[dict],
) -> list[dict]:
    """10-year and 20-year cumulative costs."""
    monthly_total = sum(i["amount"] for i in monthly_items)
    initial_total = sum(i["amount"] for i in initial_items)

    return [
        {"label": "10年総支出", "amount": initial_total + monthly_total * 12 * 10},
        {"label": "20年総支出", "amount": initial_total + monthly_total * 12 * 20},
    ]


# ── Rent Mode: Monthly Costs ─────────────────────────────────────


def calc_rent_monthly(
    rent: float,
    management_fee: float,
    needs_guarantor: bool = True,
) -> list[dict]:
    """Calculate monthly costs for renting."""
    # 更新料: 1 month rent every 2 years → monthly = rent / 24
    renewal_monthly = round(rent / 24)

    # 保証会社: annual renewal ¥10,000 → monthly ¥833
    guarantor_monthly = 833 if needs_guarantor else 0

    # 火災保険: ~¥15,000/year
    fire_insurance = round(15000 / 12)

    items = [
        {"label": "家賃", "amount": round(rent)},
        {"label": "管理費/共益費", "amount": round(management_fee)},
        {"label": "更新料（月割）", "amount": renewal_monthly},
        {"label": "保証会社（月割）", "amount": guarantor_monthly},
        {"label": "火災保険（月割）", "amount": fire_insurance},
    ]

    return items


# ── Rent Mode: Initial Costs ─────────────────────────────────────


def calc_rent_initial(
    rent: float,
    deposit_months: float = 1,
    key_money_months: float = 1,
) -> list[dict]:
    """Calculate one-time costs for renting."""
    items = [
        {"label": "敷金", "amount": round(rent * deposit_months)},
        {"label": "礼金", "amount": round(rent * key_money_months)},
        {"label": "仲介手数料", "amount": round(rent * 1.1)},
        {"label": "保証会社（初回）", "amount": round(rent * 0.5)},
        {"label": "火災保険（年払い）", "amount": 15000},
        {"label": "鍵交換", "amount": 18000},
    ]

    return [i for i in items if i["amount"] > 0]


def calc_rent_long_term(
    monthly_items: list[dict],
    initial_items: list[dict],
) -> list[dict]:
    """1-year and 2-year cumulative costs."""
    monthly_total = sum(i["amount"] for i in monthly_items)
    initial_total = sum(i["amount"] for i in initial_items)

    return [
        {"label": "1年総支出", "amount": initial_total + monthly_total * 12},
        {"label": "2年総支出", "amount": initial_total + monthly_total * 24},
    ]
