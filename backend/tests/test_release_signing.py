"""Regression: Expo's equals-style debug assignment must never win in release."""
from contextlib import redirect_stdout
from io import StringIO
import os
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / '.github/workflows/build-play-aab.yml'

class SigningTests(unittest.TestCase):
    def configure(self, template):
        workflow = WORKFLOW.read_text()
        start = workflow.index('          from pathlib import Path', workflow.index('      - name: Configure release signing'))
        end = workflow.index('          PY', start)
        script = '\n'.join(line[10:] for line in workflow[start:end].splitlines())
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'android/app/build.gradle'
            path.parent.mkdir(parents=True)
            path.write_text(template)
            original = os.getcwd()
            try:
                os.chdir(tmp)
                with redirect_stdout(StringIO()):
                    exec(compile(script, 'release-signing', 'exec'), {})
            finally:
                os.chdir(original)
            return path.read_text()
    def fixture(self, assignment):
        return """android {
    signingConfigs {
        debug { storeFile file('debug.keystore') }
    }
    buildTypes {
        debug {
            signingConfig = signingConfigs.debug
        }
        release {
            ASSIGNMENT
            minifyEnabled false
        }
    }
}
""".replace('ASSIGNMENT', assignment)
    def test_new_equals_assignment(self):
        result = self.configure(self.fixture('signingConfig = signingConfigs.debug'))
        self.assertEqual(result.count('signingConfig = signingConfigs.debug'), 1)
        self.assertEqual(result.count('signingConfig = signingConfigs.release'), 1)
    def test_old_method_assignment(self):
        result = self.configure(self.fixture('signingConfig signingConfigs.debug'))
        self.assertEqual(result.count('signingConfig = signingConfigs.release'), 1)
        self.assertNotIn('signingConfig signingConfigs.debug', result)
    def test_patch_is_idempotent(self):
        once = self.configure(self.fixture('signingConfig = signingConfigs.debug'))
        self.assertEqual(self.configure(once), once)

if __name__ == '__main__': unittest.main()
