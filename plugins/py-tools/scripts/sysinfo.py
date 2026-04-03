from __future__ import annotations

import json
import os
import platform
import sys


payload = {
    "argv": sys.argv[1:],
    "cwd": os.getcwd(),
    "executable": sys.executable,
    "platform": platform.platform(),
    "python_version": platform.python_version(),
}

print(json.dumps(payload, indent=2, ensure_ascii=True))
