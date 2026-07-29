import sys
from pathlib import Path

# 让 tests 能 import src
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
