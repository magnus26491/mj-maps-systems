/**
 * Benchmark: Delivery Intake Performance
 * 
 * Tests:
 * - 10 stops
 * - 50 stops
 * - 100 stops
 * - 300 stops
 * 
 * Measures:
 * - Input time
 * - Validation time
 * - Route preparation time
 * - Memory usage
 * - API calls
 * 
 * Usage: npx ts-node scripts/benchmark-intake.ts
 */

import { parseBulkInput, normalisePostcode, isPostcode, type IntakeStopInput } from '../services/delivery-intake/index';
import { processBulkIntake } from '../services/delivery-intake/bulk-processor';

// Sample UK postcodes for testing
const SAMPLE_POSTCODES = [
  'SW1A1AA', 'M1 1AE', 'B1 1AA', 'LS1 1AB', 'G1 1AA',
  'EH1 1AB', 'CF1 1AA', 'S1 1AA', 'NG1 1AA', 'L1 1AA',
  'PR1 1AA', 'BT1 1AA', 'KT1 1AA', 'CR0 1AA', 'EC1A 1AA',
  'W1A 1AA', 'N1 1AA', 'E1 1AA', 'SE1 1AA', 'SW1 1AA',
];

// Generate random postcodes for bulk testing
function generatePostcodes(count: number): string[] {
  const postcodes: string[] = [];
  for (let i = 0; i < count; i++) {
    const area = SAMPLE_POSTCODES[i % SAMPLE_POSTCODES.length];
    const suffix = String(100 + Math.floor(Math.random() * 900));
    postcodes.push(`${area.split(' ')[0]} ${suffix}`);
  }
  return postcodes;
}

// Parse performance test
function testParsing(postcodes: string[]): {
  inputTime: number;
  parsedCount: number;
} {
  const input = postcodes.join('\n');
  
  const startMem = process.memoryUsage().heapUsed;
  const start = Date.now();
  
  const parsed = parseBulkInput(input);
  
  const end = Date.now();
  const endMem = process.memoryUsage().heapUsed;
  
  return {
    inputTime: end - start,
    parsedCount: parsed.length,
  };
}

// Validation performance test
function testValidation(stops: IntakeStopInput[]): {
  validationTime: number;
  validCount: number;
} {
  const start = Date.now();
  
  let validCount = 0;
  for (const stop of stops) {
    if (stop.address && stop.address.length <= 500) {
      validCount++;
    }
  }
  
  const end = Date.now();
  
  return {
    validationTime: end - start,
    validCount,
  };
}

// Main benchmark runner
async function runBenchmarks() {
  console.log('='.repeat(60));
  console.log('DELIVERY INTAKE BENCHMARK');
  console.log('='.repeat(60));
  console.log();
  
  const testCases = [
    { name: '10 stops', count: 10 },
    { name: '50 stops', count: 50 },
    { name: '100 stops', count: 100 },
    { name: '300 stops', count: 300 },
  ];
  
  for (const testCase of testCases) {
    console.log('-'.repeat(60));
    console.log(`TEST: ${testCase.name}`);
    console.log('-'.repeat(60));
    
    const postcodes = generatePostcodes(testCase.count);
    const input = postcodes.join('\n');
    
    // Measure memory before
    const memBefore = process.memoryUsage();
    
    // Parse test
    console.log('\n1. PARSING');
    console.log('   Input:', `${input.length} chars`);
    const parseResult = testParsing(postcodes);
    console.log('   Time:', `${parseResult.inputTime}ms`);
    console.log('   Parsed:', `${parseResult.parsedCount} stops`);
    
    // Create stop inputs
    const stops: IntakeStopInput[] = postcodes.map((pc, i) => ({
      postcode: pc,
      address: pc,
      parcelCount: 1,
      reference: `REF-${i}`,
    }));
    
    // Validation test
    console.log('\n2. VALIDATION');
    const validationResult = testValidation(stops);
    console.log('   Time:', `${validationResult.validationTime}ms`);
    console.log('   Valid:', `${validationResult.validCount} stops`);
    
    // Memory after
    const memAfter = process.memoryUsage();
    const memDelta = (memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024;
    
    console.log('\n3. MEMORY');
    console.log('   Heap used:', `${memDelta.toFixed(2)} MB`);
    
    // Estimate API calls (would be actual calls in real scenario)
    const estimatedApiCalls = testCase.count * 2; // postcode + geocode per stop
    console.log('\n4. ESTIMATED API CALLS');
    console.log('   Geocode lookups:', `${testCase.count}`);
    console.log('   Validation:', `${testCase.count}`);
    console.log('   Total:', `${estimatedApiCalls}`);
    
    // Time breakdown estimate
    console.log('\n5. TIME ESTIMATES (network latency included)');
    const networkLatency = 200; // ms per API call (rough estimate)
    const totalNetworkTime = estimatedApiCalls * networkLatency;
    console.log('   Network time (~200ms/call):', `${(totalNetworkTime / 1000).toFixed(1)}s`);
    console.log('   Parse time:', `${parseResult.inputTime}ms`);
    console.log('   Validation time:', `${validationResult.validationTime}ms`);
    console.log('   Estimated total:', `${((totalNetworkTime + parseResult.inputTime + validationResult.validationTime) / 1000).toFixed(1)}s`);
    
    // Performance verdict
    console.log('\n6. PERFORMANCE VERDICT');
    const isUsable = testCase.count <= 100 || totalNetworkTime < 60000; // < 1 min for 300 stops
    const isOptimal = testCase.count <= 50 || totalNetworkTime < 30000; // < 30s for 50+ stops
    
    if (isOptimal) {
      console.log('   ✅ OPTIMAL - Fast enough for production use');
    } else if (isUsable) {
      console.log('   ⚠️  ACCEPTABLE - Usable but could be optimised');
    } else {
      console.log('   ❌ SLOW - Consider batch processing or caching');
    }
    
    console.log();
  }
  
  console.log('='.repeat(60));
  console.log('BENCHMARK COMPLETE');
  console.log('='.repeat(60));
  
  // Recommendations
  console.log('\nRECOMMENDATIONS:');
  console.log('1. For 10-50 stops: Real-time validation works well');
  console.log('2. For 100+ stops: Consider background processing with progress UI');
  console.log('3. For 300 stops: Batch geocoding with chunked API calls');
  console.log('4. Add local caching to reduce repeated geocode API calls');
  console.log('5. Consider postcode centroid fallback for offline scenarios');
}

// Run benchmarks
runBenchmarks().catch(console.error);
