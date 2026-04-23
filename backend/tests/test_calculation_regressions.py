import asyncio
import unittest

from fastapi import HTTPException

import main
from cost_model import calc_buy_long_term


class CalculationRegressionTests(unittest.TestCase):
    def test_rent_zero_deposit_and_key_money_stay_zero(self):
        result = asyncio.run(
            main.calculate_rent(
                main.RentInputs(
                    property=main.ExtractedProperty(
                        rent=100000,
                        management_fee=5000,
                        deposit_months=0,
                        key_money_months=0,
                    ),
                    needs_guarantor=True,
                )
            )
        )

        self.assertEqual(result.initial_total, 193000)
        self.assertEqual(
            [item.amount for item in result.initial_items],
            [110000.0, 50000.0, 15000.0, 18000.0],
        )

    def test_buy_requires_price_instead_of_crashing(self):
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(
                main.calculate_buy(
                    main.BuyInputs(
                        property=main.ExtractedProperty(),
                        down_payment=0,
                    )
                )
            )

        self.assertEqual(ctx.exception.status_code, 422)
        self.assertIn("price", str(ctx.exception.detail).lower())

    def test_rent_requires_rent_instead_of_crashing(self):
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(
                main.calculate_rent(
                    main.RentInputs(
                        property=main.ExtractedProperty(),
                        needs_guarantor=True,
                    )
                )
            )

        self.assertEqual(ctx.exception.status_code, 422)
        self.assertIn("rent", str(ctx.exception.detail).lower())

    def test_buy_long_term_excludes_principal_repayments(self):
        result = calc_buy_long_term(
            initial_items=[{"label": "fees", "amount": 500}],
            monthly_non_mortgage_total=100,
            loan_amount=12000,
            annual_rate=0,
            loan_term_years=1,
            horizons_years=(10, 20),
        )

        self.assertEqual(result[0]["amount"], 12500)
        self.assertEqual(result[1]["amount"], 24500)


if __name__ == "__main__":
    unittest.main()
