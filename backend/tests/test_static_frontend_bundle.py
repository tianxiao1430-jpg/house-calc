import pathlib
import unittest


STATIC_ENTRY_JS = pathlib.Path(__file__).resolve().parents[1] / "static" / "_expo" / "static" / "js" / "web" / "entry.js"


class StaticFrontendBundleTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not STATIC_ENTRY_JS.exists():
            raise unittest.SkipTest("static frontend bundle is not present")
        cls.bundle = STATIC_ENTRY_JS.read_text(encoding="utf-8")

    def test_google_login_gate_is_not_forced_open(self):
        self.assertNotIn("t(!0)},[]),e?(0,h.jsx)(o.Slot,{})", self.bundle)
        self.assertIn("t(!!e)},[]),e?(0,h.jsx)(o.Slot,{})", self.bundle)

    def test_both_home_modes_remain_available(self):
        self.assertIn("/calculate/screenshot?mode=buy", self.bundle)
        self.assertIn("/calculate/screenshot?mode=rent", self.bundle)


if __name__ == "__main__":
    unittest.main()
