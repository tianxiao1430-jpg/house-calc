import os
import unittest
from unittest.mock import patch

import llm_client


class LlmClientEnvTests(unittest.TestCase):
    def test_env_trims_secret_manager_newline(self):
        with patch.dict(os.environ, {"GOOGLE_API_KEY": "AIzaExampleKey\n"}):
            self.assertEqual(llm_client._env("GOOGLE_API_KEY"), "AIzaExampleKey")


if __name__ == "__main__":
    unittest.main()
