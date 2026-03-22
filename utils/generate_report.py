
import re
from datetime import datetime

def generate_report(test_results_file, report_file):
    with open(test_results_file, 'r', encoding='utf-16') as f:
        results = f.read()

    # Extract relevant information using regex
    ran_match = re.search(r"Ran (\d+) tests", results)
    ok_match = results.strip().endswith("OK")
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

    with open(report_file, 'w', encoding='utf-8') as f:
        f.write(report)

if __name__ == "__main__":
    generate_report("test_results.txt", "../TEST_REPORT.md")
