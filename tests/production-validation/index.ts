/**
 * Production Validation Test Suite
 * Phase 21.5 - Platform Synchronisation Layer
 * 
 * Validates complete production readiness.
 */

export { runDomainTests } from './domain-tests';
export { runLifecycleTests } from './lifecycle-tests';
export { runIntelligenceTests } from './intelligence-tests';

import { runDomainTests } from './domain-tests';
import { runLifecycleTests } from './lifecycle-tests';
import { runIntelligenceTests } from './intelligence-tests';

interface TestResult {
  suite: string;
  passed: boolean;
  tests: number;
  errors: string[];
}

async function main() {
  console.log('='.repeat(60));
  console.log('PHASE 21.5 - PRODUCTION VALIDATION SUITE');
  console.log('='.repeat(60));
  console.log('');

  const results: TestResult[] = [];

  // Domain tests
  console.log('Running Domain Tests...');
  results.push(await runDomainTests());

  // Lifecycle tests
  console.log('\nRunning Lifecycle Tests...');
  results.push(await runLifecycleTests());

  // Intelligence tests
  console.log('\nRunning Intelligence Tests...');
  results.push(await runIntelligenceTests());

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('VALIDATION SUMMARY');
  console.log('='.repeat(60));

  let totalTests = 0;
  let totalPassed = 0;

  for (const result of results) {
    totalTests += result.tests;
    if (result.passed) totalPassed += result.tests;
    
    const status = result.passed ? '✅' : '❌';
    console.log(`${status} ${result.suite}: ${result.tests}/${result.tests} passed`);
    
    if (result.errors.length > 0) {
      for (const error of result.errors) {
        console.log(`   └─ ${error}`);
      }
    }
  }

  console.log('\n' + '-'.repeat(60));
  console.log(`Total: ${totalPassed}/${totalTests} tests passed`);
  
  if (totalPassed === totalTests) {
    console.log('✅ All production validation tests passed');
    process.exit(0);
  } else {
    console.log('❌ Some tests failed - review required');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Test suite error:', err);
  process.exit(1);
});
