import pathlib
import unittest


ENTRY_JS = pathlib.Path(__file__).resolve().parents[1] / "entry.js"


class FrontendAuthRegressionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not ENTRY_JS.exists():
            raise unittest.SkipTest("production web bundle is not part of the monorepo backend checkout")
        cls.bundle = ENTRY_JS.read_text(encoding="utf-8")

    def test_core_routes_use_shared_authenticated_api_helpers(self):
        self.assertIn("e.submitLead=async function(t){return r('/submit-lead',{method:'POST',body:JSON.stringify(t)})}", self.bundle)
        self.assertIn("await y.chatWithAgent({mode:e,extracted:I,conversation:t,user_message:o})", self.bundle)
        self.assertIn("await p.calculateBuy({property:n,down_payment:.1*(n.price||0),loan_term_years:35,interest_rate:.00475,purpose:'residence',is_new_construction:!1})", self.bundle)
        self.assertIn("await p.calculateRent({property:n,needs_guarantor:!0})", self.bundle)
        self.assertIn("await w.submitLead({mode:e,satisfied:_,feedback:t,contact_name:E,contact_info:J,property_summary:v,cost_summary:{monthly_total:L.monthly_total||0,initial_total:L.initial_total||0}})", self.bundle)

        self.assertNotIn("await fetch(`${y.BASE_URL}/chat`", self.bundle)
        self.assertNotIn("await fetch(`${p.BASE_URL}/calculate/buy`", self.bundle)
        self.assertNotIn("await fetch(`${p.BASE_URL}/calculate/rent`", self.bundle)
        self.assertNotIn("await fetch(`${w.BASE_URL}/submit-lead`", self.bundle)
        self.assertNotIn("catch{I('done')}", self.bundle)


if __name__ == "__main__":
    unittest.main()
