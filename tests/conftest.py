import os
import sys
from pathlib import Path

# Add project root and backend directory to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = PROJECT_ROOT / "backend"

for p in [PROJECT_ROOT, BACKEND_DIR]:
    p_str = str(p)
    if p_str not in sys.path:
        sys.path.insert(0, p_str)
