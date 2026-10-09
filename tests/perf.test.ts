import { test } from "node:test";
import { performance } from "node:perf_hooks";
import assert from "node:assert/strict";

import { buildAbstractFilterTree, $and, $or } from "../src";

test('Performance', () => {
  const filter = {
    a: "1",
    [$and]: {
      b: "$between(1,4)",
      [$or]: {
        c: '$in(1,2,3,4,5)',
        [$and]: {
          d: 12,
        },
      },
    },
  };

  const results: number[] = [];
  const ITERATIONS = 1_000_000;
  const THRESHOLD = 0.05; // ms
  const WARMUP = 1_000;

  // Warm up the JIT, not recorded
  for (let i = 0; i < WARMUP; i++) {
    buildAbstractFilterTree(filter);
  }

  // Collect all measurements
  for (let i = 0; i < ITERATIONS; i++) {
    const start = performance.now();
    buildAbstractFilterTree(filter);
    const elapsed = performance.now() - start;
    results.push(elapsed);
  }

  // Sort for percentile calculations
  const sorted = [...results].sort((a, b) => a - b);

  // Basic stats
  const mean = results.reduce((sum, val) => sum + val, 0) / ITERATIONS;
  const variance = results.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / ITERATIONS;
  const stdDev = Math.sqrt(variance);
  const cv = stdDev / mean;

  // Threshold analysis
  const outliers = results.filter(val => val > THRESHOLD);
  const outlierCount = outliers.length;
  const outlierPercentage = (outlierCount / ITERATIONS) * 100;

  // Percentiles
  const p50: number = sorted[Math.floor(ITERATIONS * 0.5)];
  const p90: number = sorted[Math.floor(ITERATIONS * 0.9)];
  const p95: number = sorted[Math.floor(ITERATIONS * 0.95)];
  const p99: number = sorted[Math.floor(ITERATIONS * 0.99)];
  const p999: number = sorted[Math.floor(ITERATIONS * 0.999)];
  const max: number = sorted[ITERATIONS - 1];

  // Outlier analysis
  const minOutlier = outliers.length > 0 ? Math.min(...outliers) : 0;
  const maxOutlier = outliers.length > 0 ? Math.max(...outliers) : 0;
  const meanOutlier = outliers.length > 0 ?
    outliers.reduce((sum, val) => sum + val, 0) / outliers.length : 0;

  // Run analysis (clusters of outliers)
  let runs = 0;
  let inRun = false;
  for (let i = 0; i < results.length; i++) {
    if (results[i] > THRESHOLD) {
      if (!inRun) {
        runs++;
        inRun = true;
      }
    } else {
      inRun = false;
    }
  }

  // Throughput impact
  const normalOps = results.filter(val => val <= THRESHOLD);
  const normalMean = normalOps.reduce((sum, val) => sum + val, 0) / normalOps.length;
  const normalThroughput = 1000 / normalMean;
  const actualThroughput = 1000 / mean;
  const throughputReduction = (1 - (actualThroughput / normalThroughput)) * 100;

  console.log("=== Performance Test Results ===");
  console.log(`Total iterations: ${ITERATIONS.toLocaleString()}`);
  console.log(`Mean execution time: ${mean.toFixed(5)} ms`);
  console.log(`Median execution time: ${p50.toFixed(5)} ms`);
  console.log(`Standard deviation: ${stdDev.toFixed(5)} ms`);
  console.log(`Coefficient of variation: ${cv.toFixed(2)}`);

  console.log("\n=== Outlier Analysis ===");
  console.log(`Executions > ${THRESHOLD} ms: ${outlierCount.toLocaleString()} (${outlierPercentage.toFixed(4)}%)`);
  console.log(`Min outlier: ${minOutlier.toFixed(5)} ms (${(minOutlier/THRESHOLD).toFixed(2)}x threshold)`);
  console.log(`Mean outlier: ${meanOutlier.toFixed(5)} ms (${(meanOutlier/THRESHOLD).toFixed(2)}x threshold)`);
  console.log(`Max outlier: ${maxOutlier.toFixed(5)} ms (${(maxOutlier/THRESHOLD).toFixed(2)}x threshold)`);
  console.log(`Outlier runs: ${runs} (${(outlierCount/runs).toFixed(2)} per run)`);

  console.log("\n=== Percentiles ===");
  console.log(`50th (median): ${p50.toFixed(5)} ms`);
  console.log(`90th: ${p90.toFixed(5)} ms`);
  console.log(`95th: ${p95.toFixed(5)} ms`);
  console.log(`99th: ${p99.toFixed(5)} ms`);
  console.log(`99.9th: ${p999.toFixed(5)} ms`);
  console.log(`Maximum: ${max.toFixed(5)} ms`);

  console.log("\n=== Throughput Impact ===");
  console.log(`Normal operations: ${normalThroughput.toLocaleString()} ops/sec`);
  console.log(`Actual throughput: ${actualThroughput.toLocaleString()} ops/sec`);
  console.log(`Throughput reduction: ${throughputReduction.toFixed(4)}%`);

  // Assertions based on your requirements
  assert.ok(outlierPercentage < 0.2, `More than 0.2% exceeding threshold. Actual: ${outlierPercentage}`);
  assert.ok(max < 3, `Failed: No single execution more than 3ms. Actual: ${max}ms`); 
  assert.ok(throughputReduction < 10, `More than 10% throughput reduction. Actual: ${throughputReduction}`);
  assert.ok(mean < 0.003, `Mean execution time more than 0.003ms. Actual: ${mean}ms`);
  assert.ok(p99 < 0.005, `p99 value more than 0.005ms. Actual: ${p99}ms`);
});
