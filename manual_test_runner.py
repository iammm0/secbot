
import unittest
import sys
import os
import importlib.util

# Add the project root to the Python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '.')))

if __name__ == "__main__":
    print("Starting manual test execution...")
    try:
        loader = unittest.TestLoader()
        suite = unittest.TestSuite()

        # Discover and load tests
        for root, _, files in os.walk("tests"):
            for filename in files:
                if filename.startswith("test_") and filename.endswith(".py"):
                    filepath = os.path.join(root, filename)
                    # Dynamically import the module
                    module_name = filepath.replace("\\", ".").replace(".py", "")
                    spec = importlib.util.spec_from_file_location(module_name, filepath)
                    module = importlib.util.module_from_spec(spec)
                    spec.loader.exec_module(module)

                    # Add tests from the module to the suite
                    for name in dir(module):
                        obj = getattr(module, name)
                        if isinstance(obj, type) and issubclass(obj, unittest.TestCase):
                            suite.addTest(loader.loadTestsFromTestCase(obj))

        # Run the tests
        runner = unittest.TextTestRunner(verbosity=2)
        result = runner.run(suite)

        if not result.wasSuccessful():
            sys.exit(1)

        print("Manual test execution finished.")

    except Exception as e:
        print(f"An error occurred during test execution: {e}", file=sys.stderr)
        sys.exit(1)
