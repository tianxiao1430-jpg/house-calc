import pathlib
import unittest


MAIN_PY = pathlib.Path(__file__).resolve().parents[1] / "main.py"


class SubmitLeadRegressionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = MAIN_PY.read_text(encoding="utf-8")

    def test_submit_lead_fails_closed_when_email_delivery_fails(self):
        self.assertIn('backup_stored = _store_lead_backup(lead)', self.source)
        self.assertIn('if not email_sent and not backup_stored:', self.source)
        self.assertIn('return {"status": "ok", "email_sent": email_sent, "backup_stored": backup_stored}', self.source)
        self.assertIn('raise HTTPException(503, "Lead submission failed. Please retry later.")', self.source)
        self.assertIn('print(', self.source)
        self.assertIn('Email not configured mode={lead.mode}', self.source)
        self.assertNotIn("Logged only", self.source)
        self.assertNotIn("Email not configured. Lead data", self.source)


if __name__ == "__main__":
    unittest.main()
