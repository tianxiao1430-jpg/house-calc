import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

import main


class PublicCompatibilityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(main.app)
        cls.origin = "https://house-calc.expo.app"

    def test_calculate_rent_allows_anonymous_requests_from_production_origin(self):
        response = self.client.post(
            "/calculate/rent",
            headers={"Origin": self.origin},
            json={
                "property": {
                    "rent": 100000,
                    "management_fee": 5000,
                    "deposit_months": 1,
                    "key_money_months": 1,
                },
                "needs_guarantor": True,
            },
        )
        self.assertEqual(response.status_code, 200, response.text)

    def test_calculate_rent_rejects_anonymous_requests_without_trusted_origin(self):
        response = self.client.post(
            "/calculate/rent",
            json={
                "property": {
                    "rent": 100000,
                    "management_fee": 5000,
                    "deposit_months": 1,
                    "key_money_months": 1,
                },
                "needs_guarantor": True,
            },
        )
        self.assertEqual(response.status_code, 401, response.text)

    def test_submit_lead_succeeds_when_backup_storage_catches_email_failure(self):
        with patch("main._send_lead_email", return_value=False), patch(
            "main._store_lead_backup", return_value=True, create=True
        ):
            response = self.client.post(
                "/submit-lead",
                headers={"Origin": self.origin},
                json={
                    "mode": "buy",
                    "satisfied": False,
                    "feedback": "Need a lower monthly payment.",
                    "contact_name": "Test User",
                    "contact_info": "line:test-user",
                    "property_summary": {"location": "Tokyo"},
                    "cost_summary": {"monthly_total": 123456, "initial_total": 789000},
                },
            )

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["status"], "ok")
        self.assertFalse(response.json()["email_sent"])
        self.assertTrue(response.json()["backup_stored"])

    def test_search_endpoint_stays_protected_without_google_auth(self):
        response = self.client.post(
            "/search/property",
            headers={"Origin": self.origin},
            json={"property_name": "Park Axis"},
        )
        self.assertEqual(response.status_code, 401, response.text)


if __name__ == "__main__":
    unittest.main()
