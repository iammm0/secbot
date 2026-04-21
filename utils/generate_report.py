import re
from datetime import datetime
from pathlib import Path

def generate_report(test_results_file, report_file):
    with open(test_results_file, 'r', encoding='utf-16') as f:
        results = f.read()

    # Extract relevant information using regex
    ran_match = re.search(r"Ran (\d+) tests", results)
    _ok_match = results.strip().endswith("OK")
    failed_match = re.search(r"FAILED \(failures=(\d+)\)", results)
    errors_match = re.search(r"FAILED \(errors=(\d+)\)", results)
    failures_and_errors_match = re.search(r"FAILED \(failures=(\d+), errors=(\d+)\)", results)

    total_tests = int(ran_match.group(1)) if ran_match else 0
    successes = total_tests
    failures = 0
    errors = 0

    if failures_and_errors_match:
        failures = int(failures_and_errors_match.group(1))
        errors = int(failures_and_errors_match.group(2))
        successes = total_tests - failures - errors
    elif failed_match:
        failures = int(failed_match.group(1))
        successes = total_tests - failures
    elif errors_match:
        errors = int(errors_match.group(1))
        successes = total_tests - errors

    # Generate the report content
    report = f"""# Test Report

**Generated on:** {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}

## Summary

| Metric        | Value |
|---------------|-------|
| Total Tests   | {total_tests}   |
| ✅ Successes  | {successes}   |
| ❌ Failures   | {failures}    |
| ⚠️ Errors      | {errors}      |

## Details

```
{results}
```
"""

    out = Path(report_file)
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, 'w', encoding='utf-8') as f:
        f.write(report)

if __name__ == "__main__":
    root = Path(__file__).resolve().parent.parent
    generate_report(str(root / "test_results.txt"), str(root / "reports" / "test_report.md"))
