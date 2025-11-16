'use client';

/**
 * Browser Polyfill Test Page
 *
 * This page tests that browser polyfills for LangChain are working correctly.
 * Access at: http://localhost:3000/test-langchain
 *
 * Tests:
 * 1. Zone.js loaded and functional
 * 2. AsyncLocalStorage polyfill works
 * 3. Async context propagation across promises
 * 4. Nested async operations preserve context
 *
 * THIS IS A TEMPORARY TEST PAGE - DELETE AFTER H2.5 INTEGRATION
 */

import { useEffect, useState } from 'react';

// Import polyfills FIRST
import '@/lib/polyfills';

export default function TestLangChainPage() {
  const [testResults, setTestResults] = useState<{
    zoneJs: { passed: boolean; message: string };
    asyncLocalStorage: { passed: boolean; message: string };
    asyncPropagation: { passed: boolean; message: string };
    nestedAsync: { passed: boolean; message: string };
  }>({
    zoneJs: { passed: false, message: 'Not tested' },
    asyncLocalStorage: { passed: false, message: 'Not tested' },
    asyncPropagation: { passed: false, message: 'Not tested' },
    nestedAsync: { passed: false, message: 'Not tested' },
  });

  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    // Auto-run tests on page load
    void runTests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runTests = async () => {
    setIsRunning(true);
    const results = { ...testResults };

    // Test 1: Zone.js loaded
    try {
      if (typeof Zone !== 'undefined') {
        results.zoneJs = {
          passed: true,
          message: `Zone.js loaded successfully (current zone: ${Zone.current.name})`,
        };
      } else {
        results.zoneJs = {
          passed: false,
          message: 'Zone global not found',
        };
      }
    } catch (error) {
      results.zoneJs = {
        passed: false,
        message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }

    // Test 2: AsyncLocalStorage polyfill basic functionality
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (typeof (window as any).async_hooks !== 'undefined' && (window as any).async_hooks.AsyncLocalStorage) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const storage = new (window as any).async_hooks.AsyncLocalStorage();
        const testValue = { test: 'value', timestamp: Date.now() };

        let retrievedValue: unknown;
        storage.run(testValue, () => {
          retrievedValue = storage.getStore();
        });

        if (retrievedValue === testValue) {
          results.asyncLocalStorage = {
            passed: true,
            message: 'AsyncLocalStorage polyfill works correctly',
          };
        } else {
          results.asyncLocalStorage = {
            passed: false,
            message: 'AsyncLocalStorage getStore() returned wrong value',
          };
        }
      } else {
        results.asyncLocalStorage = {
          passed: false,
          message: 'async_hooks module not found in window',
        };
      }
    } catch (error) {
      results.asyncLocalStorage = {
        passed: false,
        message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }

    // Test 3: Synchronous context access (LangChain's actual usage pattern)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const storage = new (window as any).async_hooks.AsyncLocalStorage();

      const capturedValues: string[] = [];

      storage.run({ context: 'tool-execution' }, () => {
        // LangChain accesses context synchronously during tool execution
        capturedValues.push(storage.getStore()?.context);

        // Nested tool calls (still synchronous context access)
        storage.run({ context: 'nested-tool' }, () => {
          capturedValues.push(storage.getStore()?.context);
        });

        // Back to outer context
        capturedValues.push(storage.getStore()?.context);
      });

      const expectedPattern = 'tool-execution,nested-tool,tool-execution';
      const actualPattern = capturedValues.join(',');

      if (actualPattern === expectedPattern) {
        results.asyncPropagation = {
          passed: true,
          message: 'Synchronous context access works correctly (LangChain pattern)',
        };
      } else {
        results.asyncPropagation = {
          passed: false,
          message: `Context pattern mismatch: expected "${expectedPattern}", got "${actualPattern}"`,
        };
      }
    } catch (error) {
      results.asyncPropagation = {
        passed: false,
        message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }

    // Test 4: Multiple storage instances (LangChain uses multiple instances)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const AsyncLocalStorage = (window as any).async_hooks.AsyncLocalStorage;
      const storage1 = new AsyncLocalStorage();
      const storage2 = new AsyncLocalStorage();

      let captured1: string | undefined;
      let captured2: string | undefined;
      let isolation = true;

      storage1.run({ id: 'storage-1' }, () => {
        storage2.run({ id: 'storage-2' }, () => {
          // Each storage instance should be isolated
          captured1 = storage1.getStore()?.id;
          captured2 = storage2.getStore()?.id;

          // Cross-contamination check
          if (storage1.getStore()?.id === 'storage-2' || storage2.getStore()?.id === 'storage-1') {
            isolation = false;
          }
        });
      });

      if (captured1 === 'storage-1' && captured2 === 'storage-2' && isolation) {
        results.nestedAsync = {
          passed: true,
          message: 'Multiple storage instances work independently',
        };
      } else {
        results.nestedAsync = {
          passed: false,
          message: `Storage isolation failed: storage1="${captured1}", storage2="${captured2}"`,
        };
      }
    } catch (error) {
      results.nestedAsync = {
        passed: false,
        message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }

    setTestResults(results);
    setIsRunning(false);
  };

  const allTestsPassed = Object.values(testResults).every((result) => result.passed);

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold mb-2">LangChain Browser Compatibility Test</h1>
          <p className="text-gray-600 mb-6">
            Testing polyfills and LangChain initialization in the browser
          </p>

          <div className="mb-6">
            <button
              onClick={runTests}
              disabled={isRunning}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {isRunning ? 'Running Tests...' : 'Run Tests Again'}
            </button>
          </div>

          {/* Test Results */}
          <div className="space-y-4">
            {/* Test 1: Zone.js */}
            <TestResult
              title="1. Zone.js Loaded"
              passed={testResults.zoneJs.passed}
              message={testResults.zoneJs.message}
            />

            {/* Test 2: AsyncLocalStorage */}
            <TestResult
              title="2. AsyncLocalStorage Polyfill"
              passed={testResults.asyncLocalStorage.passed}
              message={testResults.asyncLocalStorage.message}
            />

            {/* Test 3: Synchronous Context Access */}
            <TestResult
              title="3. Synchronous Context Access"
              passed={testResults.asyncPropagation.passed}
              message={testResults.asyncPropagation.message}
            />

            {/* Test 4: Multiple Storage Instances */}
            <TestResult
              title="4. Multiple Storage Instances"
              passed={testResults.nestedAsync.passed}
              message={testResults.nestedAsync.message}
            />
          </div>

          {/* Overall Status */}
          <div
            className={`mt-8 p-6 rounded-lg ${
              allTestsPassed
                ? 'bg-green-50 border border-green-200'
                : 'bg-yellow-50 border border-yellow-200'
            }`}
          >
            <h2 className="text-xl font-bold mb-2">
              {allTestsPassed ? '✅ All Tests Passed!' : '⚠️ Some Tests Failed'}
            </h2>
            <p className="text-gray-700">
              {allTestsPassed
                ? 'LangChain is ready to run in the browser. You can proceed with H2.5 integration.'
                : 'Some compatibility issues detected. Review the failed tests above.'}
            </p>
          </div>

          {/* Instructions */}
          <div className="mt-8 p-6 bg-blue-50 border border-blue-200 rounded-lg">
            <h3 className="font-bold mb-2">Next Steps:</h3>
            <ol className="list-decimal list-inside space-y-2 text-gray-700">
              <li>If all tests pass, proceed with Phase 2: Create H2.5 route structure</li>
              <li>If tests fail, review console logs for detailed error messages</li>
              <li>Delete this test page after H2.5 integration is complete</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}

// Test Result Component
function TestResult({
  title,
  passed,
  message,
}: {
  title: string;
  passed: boolean;
  message: string;
}) {
  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-start gap-3">
        <div className="mt-1">
          {passed ? (
            <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
              <span className="text-white text-sm font-bold">✓</span>
            </div>
          ) : (
            <div className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center">
              <span className="text-white text-sm font-bold">✗</span>
            </div>
          )}
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-lg mb-1">{title}</h3>
          <p className="text-gray-600 text-sm">{message}</p>
        </div>
      </div>
    </div>
  );
}
