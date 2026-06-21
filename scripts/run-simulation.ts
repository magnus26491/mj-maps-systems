/**
 * Simulation Runner Script
 * 
 * Runs the delivery routing simulation comparing:
 * - Google-style routing (distance-optimized)
 * - Current MJ Maps routing
 * - Learning-enabled MJ Maps routing
 * 
 * Usage:
 * npx ts-node scripts/run-simulation.ts
 */

import { runSimulation } from '../services/delivery-learning/simulation';

async function main() {
  console.log('='.repeat(60));
  console.log('DELIVERY ROUTING SIMULATION');
  console.log('='.repeat(60));
  console.log();
  
  // Run simulation with 100,000 days (large scale)
  console.log('Running simulation...');
  console.log('This may take a few moments...');
  console.log();
  
  const startTime = Date.now();
  
  const report = await runSimulation({
    numDays: 100000,
    avgStopsPerDay: 30,
    numDrivers: 100,
    seed: 42,
  });
  
  const duration = Date.now() - startTime;
  
  console.log('='.repeat(60));
  console.log('SIMULATION RESULTS');
  console.log('='.repeat(60));
  console.log();
  console.log(`Configuration:`);
  console.log(`  - Simulated days: ${report.config.numDays.toLocaleString()}`);
  console.log(`  - Avg stops/day: ${report.config.avgStopsPerDay}`);
  console.log(`  - Drivers: ${report.config.numDrivers}`);
  console.log(`  - Duration: ${duration}ms`);
  console.log();
  
  console.log('-'.repeat(60));
  console.log('STRATEGY COMPARISON');
  console.log('-'.repeat(60));
  console.log();
  
  for (const [name, result] of Object.entries(report.results)) {
    console.log(`${result.strategy}:`);
    console.log(`  Total routes:   ${result.totalRoutes.toLocaleString()}`);
    console.log(`  Total stops:    ${result.totalStops.toLocaleString()}`);
    console.log(`  Completion rate: ${result.completionRate}%`);
    console.log(`  Failed stops:    ${result.failedStops.toLocaleString()}`);
    console.log(`  Avg time/stop:  ${result.avgTimePerStop} min`);
    console.log(`  Driver effort:  ${result.driverEffort}`);
    console.log(`  ETA accuracy:   ${result.etaAccuracy}%`);
    console.log(`  Parking accuracy: ${result.parkingAccuracy}%`);
    console.log();
  }
  
  console.log('-'.repeat(60));
  console.log('LEARNING ENABLED vs CURRENT MJ MAPS');
  console.log('-'.repeat(60));
  console.log();
  console.log(`  Winner: ${report.comparison.winner === 'learning-mj-sim' ? 'Learning-Enabled MJ Maps' : 'Current MJ Maps'}`);
  console.log(`  Completion improvement: ${report.comparison.completionImprovement > 0 ? '+' : ''}${report.comparison.completionImprovement}%`);
  console.log(`  Time improvement: ${report.comparison.timeImprovement > 0 ? '+' : ''}${report.comparison.timeImprovement} min/stop`);
  console.log(`  Effort reduction: ${report.comparison.effortReduction > 0 ? '+' : ''}${report.comparison.effortReduction}`);
  console.log();
  
  // Recommendations
  console.log('-'.repeat(60));
  console.log('RECOMMENDATIONS');
  console.log('-'.repeat(60));
  console.log();
  
  if (report.comparison.winner === 'learning-mj-sim') {
    console.log('✅ Learning-enabled routing outperforms current approach');
    console.log();
    console.log('Recommended actions:');
    console.log('1. Enable learning-based route ordering for high-risk stops');
    console.log('2. Implement driver fatigue tracking');
    console.log('3. Add time-of-day optimization');
    console.log('4. Deploy stop memory to all drivers');
  } else {
    console.log('ℹ️  Current MJ Maps performs comparably to learning-enabled');
    console.log();
    console.log('Recommended actions:');
    console.log('1. Continue monitoring prediction accuracy');
    console.log('2. Collect more delivery outcome data');
    console.log('3. Implement stop memory for difficult locations');
  }
  
  console.log();
  console.log('='.repeat(60));
  console.log('SIMULATION COMPLETE');
  console.log('='.repeat(60));
}

main().catch(console.error);
