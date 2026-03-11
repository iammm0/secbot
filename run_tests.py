
import unittest
import sys

if __name__ == "__main__":
    print("Starting test discovery...")
    try:
        loader = unittest.TestLoader()
        suite = loader.discover("tests")
        print(f"Discovered {suite.countTestCases()} test cases.")

        if suite.countTestCases() > 0:
            print("Running tests...")
            runner = unittest.TextTestRunner(verbosity=2)
            result = runner.run(suite)
            if not result.wasSuccessful():
                sys.exit(1)
            print("Test execution finished.")
        else:
            print("No tests found to execute.")

    except Exception as e:
        print(f"An error occurred during test execution: {e}", file=sys.stderr)
        sys.exit(1)
