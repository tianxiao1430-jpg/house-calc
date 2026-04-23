import asyncio
import unittest
from unittest.mock import patch

import main


class ChatFallbackTests(unittest.TestCase):
    def test_chat_adds_calc_ready_when_required_fields_exist(self):
        req = main.ChatRequest(
            mode="rent",
            extracted=main.ExtractedProperty(rent=120_000),
            conversation=[],
            user_message="Please analyze this property.",
        )

        with patch("main.chat_completion", return_value="I need one more preference from you."):
            response = asyncio.run(main.chat(req))

        self.assertIn("[CALC_READY]", response["reply"])

    def test_chat_adds_calc_ready_for_legacy_empty_extracted_payload(self):
        req = main.ChatRequest(
            mode="rent",
            extracted=main.ExtractedProperty(),
            conversation=[],
            user_message="Please analyze this property.",
        )

        with patch("main.chat_completion", return_value="I need one more preference from you."):
            response = asyncio.run(main.chat(req))

        self.assertIn("[CALC_READY]", response["reply"])

    def test_chat_returns_calc_ready_fallback_when_llm_fails(self):
        req = main.ChatRequest(
            mode="buy",
            extracted=main.ExtractedProperty(price=50_000_000),
            conversation=[],
            user_message="Please analyze this property.",
        )

        with patch("main.chat_completion", side_effect=RuntimeError("llm unavailable")):
            response = asyncio.run(main.chat(req))

        self.assertIn("[CALC_READY]", response["reply"])
        self.assertEqual(response["conversation"][-1]["role"], "assistant")


if __name__ == "__main__":
    unittest.main()
