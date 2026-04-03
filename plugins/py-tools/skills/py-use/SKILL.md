---
name: py-use
description: Use the Windows `py` launcher to run Python helpers from this plugin. Trigger when a task is easier as a small Python script or when the user explicitly asks for `py`.
---

# Py Use

Use this skill when a task benefits from a short Python script on Windows.

## Workflow

1. Prefer the `.cmd` wrapper because it bypasses restrictive PowerShell execution policies cleanly:

```powershell
& "<plugin-root>\\scripts\\invoke_py.cmd" "<plugin-root>\\scripts\\sysinfo.py"
```

2. The wrapper checks two things before execution:
   - `py.exe` is available.
   - a Python runtime is actually installed behind the launcher.

3. If the wrapper reports that no runtime is installed, stop there and tell the user that the plugin exists but Python still needs to be installed or repaired.

## Notes

- On Windows, prefer `py -3` over `python`.
- If you need the PowerShell script directly, call it with `powershell -ExecutionPolicy Bypass -File ...`.
- Keep Python snippets small and task-focused.
- Reuse files in `scripts/` instead of inlining large ad-hoc Python blocks when a plugin script already fits.

## Included scripts

- `scripts/sysinfo.py`: prints interpreter, version, working directory, and arguments as JSON.
