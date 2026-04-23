"""Japanese property cost calculation engine.

All calculations are deterministic and all amounts are in JPY.
"""

import math


def calc_monthly_payment(principal: float, annual_rate: float, years: int) -> float:
    """Return the equal monthly mortgage payment."""
    if principal <= 0:
        return 0
    if years <= 0:
        return principal
    if annual_rate <= 0:
        return principal / (years * 12)
    if annual_rate > 0.20:
        raise ValueError(
            f"Interest rate {annual_rate} seems too high. Expected decimal like 0.00475 for 0.475%"
        )

    monthly_rate = annual_rate / 12
    months = years * 12
    payment = (
        principal
        * monthly_rate
        * math.pow(1 + monthly_rate, months)
        / (math.pow(1 + monthly_rate, months) - 1)
    )
    return round(payment)


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
    """Calculate recurring monthly costs for buying."""
    loan_amount = max(0, price - down_payment)
    mortgage = calc_monthly_payment(loan_amount, interest_rate, loan_term_years)

    assessed = price * 0.70
    assessed_building = assessed * 0.60
    assessed_land = assessed * 0.40

    property_tax_building = assessed_building * 0.014 / 12
    property_tax_land = assessed_land * (1 / 6) * 0.014 / 12
    property_tax = round(property_tax_building + property_tax_land)

    city_tax_building = assessed_building * 0.003 / 12
    city_tax_land = assessed_land * (1 / 3) * 0.003 / 12
    city_tax = round(city_tax_building + city_tax_land)

    if structure and structure.upper() in ("RC", "SRC"):
        insurance_annual = area * 200
    else:
        insurance_annual = area * 350
    fire_insurance = round(insurance_annual / 12)

    return [
        {"label": "房贷月供", "amount": mortgage},
        {"label": "管理费", "amount": round(management_fee)},
        {"label": "修缮积立金", "amount": round(repair_reserve)},
        {"label": "固定资产税", "amount": property_tax},
        {"label": "都市计划税", "amount": city_tax},
        {"label": "火灾保险", "amount": fire_insurance},
    ]


def calc_buy_initial(
    price: float,
    loan_amount: float,
    is_new: bool = False,
) -> list[dict]:
    """Calculate one-time purchase costs."""
    assessed = price * 0.70
    assessed_building = assessed * 0.60

    agent_fee = round((price * 0.03 + 60000) * 1.10) if not is_new else 0

    if is_new:
        registration_tax = round(assessed * 0.0015)
    else:
        registration_tax = round(assessed * 0.003)

    mortgage_registration = round(loan_amount * 0.001)

    building_taxable = max(0, assessed_building - 12_000_000)
    acquisition_tax = round(building_taxable * 0.03)
    acquisition_tax_land = round(assessed * 0.40 * 0.5 * 0.03)
    acquisition_tax += acquisition_tax_land

    if price <= 10_000_000:
        stamp_tax = 10000
    elif price <= 50_000_000:
        stamp_tax = 20000
    elif price <= 100_000_000:
        stamp_tax = 60000
    else:
        stamp_tax = 100000

    judicial_fee = 120000
    loan_admin_fee = round(loan_amount * 0.022)

    items = [
        {"label": "中介费", "amount": agent_fee},
        {"label": "登记税", "amount": registration_tax},
        {"label": "抵押登记", "amount": mortgage_registration},
        {"label": "不动产取得税", "amount": acquisition_tax},
        {"label": "印花税", "amount": stamp_tax},
        {"label": "司法书士", "amount": judicial_fee},
        {"label": "贷款手续费", "amount": loan_admin_fee},
    ]

    return [item for item in items if item["amount"] > 0]


def calc_cumulative_mortgage_interest(
    principal: float,
    annual_rate: float,
    years: int,
    months: int,
) -> float:
    """Return the interest paid over the requested holding period."""
    if principal <= 0 or months <= 0 or annual_rate <= 0:
        return 0

    payment = calc_monthly_payment(principal, annual_rate, years)
    remaining = principal
    interest_paid = 0.0

    for _ in range(min(months, years * 12)):
        interest = remaining * annual_rate / 12
        principal_component = max(0.0, payment - interest)
        if principal_component > remaining:
            principal_component = remaining
        interest_paid += interest
        remaining -= principal_component
        if remaining <= 0:
            break

    return round(interest_paid)


def calc_buy_long_term(
    initial_items: list[dict],
    monthly_non_mortgage_total: float,
    loan_amount: float,
    annual_rate: float,
    loan_term_years: int,
    horizons_years: tuple[int, ...] = (10, 20),
) -> list[dict]:
    """Return holding cost while excluding mortgage principal repayments."""
    initial_total = sum(item["amount"] for item in initial_items)
    results = []

    for horizon_years in horizons_years:
        months = horizon_years * 12
        interest_paid = calc_cumulative_mortgage_interest(
            principal=loan_amount,
            annual_rate=annual_rate,
            years=loan_term_years,
            months=months,
        )
        results.append(
            {
                "label": f"{horizon_years}年持有成本（不含还本金）",
                "amount": round(initial_total + monthly_non_mortgage_total * months + interest_paid),
            }
        )

    return results


def calc_rent_monthly(
    rent: float,
    management_fee: float,
    needs_guarantor: bool = True,
) -> list[dict]:
    """Calculate recurring monthly rent costs."""
    renewal_monthly = round(rent / 24)
    guarantor_monthly = 833 if needs_guarantor else 0
    fire_insurance = round(15000 / 12)

    return [
        {"label": "房租", "amount": round(rent)},
        {"label": "管理费/共益费", "amount": round(management_fee)},
        {"label": "更新费（月均）", "amount": renewal_monthly},
        {"label": "保证公司费（月均）", "amount": guarantor_monthly},
        {"label": "火灾保险（月均）", "amount": fire_insurance},
    ]


def calc_rent_initial(
    rent: float,
    deposit_months: float = 1,
    key_money_months: float = 1,
) -> list[dict]:
    """Calculate one-time move-in costs for renting."""
    items = [
        {"label": "押金", "amount": round(rent * deposit_months)},
        {"label": "礼金", "amount": round(rent * key_money_months)},
        {"label": "中介费", "amount": round(rent * 1.1)},
        {"label": "保证公司初费", "amount": round(rent * 0.5)},
        {"label": "火灾保险", "amount": 15000},
        {"label": "换锁费", "amount": 18000},
    ]

    return [item for item in items if item["amount"] > 0]


def calc_rent_long_term(
    monthly_items: list[dict],
    initial_items: list[dict],
) -> list[dict]:
    """Calculate 1-year and 2-year cumulative rent costs."""
    monthly_total = sum(item["amount"] for item in monthly_items)
    initial_total = sum(item["amount"] for item in initial_items)

    return [
        {"label": "1年总成本", "amount": initial_total + monthly_total * 12},
        {"label": "2年总成本", "amount": initial_total + monthly_total * 24},
    ]
