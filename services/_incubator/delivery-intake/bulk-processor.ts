/**
 * Delivery Intake — Bulk Processor
 * 
 * Handles batch processing of delivery stops with progress reporting.
 * Supports up to 300 stops without UI freezing.
 */

import type {
  IntakeStopInput,
  IntakeStopOutput,
  BulkIntakeInput,
  BulkIntakeProgress,
  BulkIntakeResult,
} from './index';
import { processStop } from './resolver';

/**
 * Process multiple stops in parallel with controlled concurrency.
 * Never blocks the UI - uses async processing with progress callbacks.
 */
export async function processBulkIntake(
  input: BulkIntakeInput,
  onProgress?: (progress: BulkIntakeProgress) => void
): Promise<BulkIntakeResult> {
  const { stops, options } = input;
  const concurrency = options?.concurrency ?? 5;
  const skipDuplicateCheck = options?.skipDuplicateCheck ?? false;
  
  const results: IntakeStopOutput[] = [];
  const seenAddresses = new Map<string, string>();
  
  let processed = 0;
  let successful = 0;
  let failed = 0;
  let duplicates = 0;
  
  // Process in chunks to avoid overwhelming the API
  for (let i = 0; i < stops.length; i += concurrency) {
    const chunk = stops.slice(i, i + concurrency);
    
    const chunkResults = await Promise.all(
      chunk.map(async (stop) => {
        try {
          const result = await processStop(stop, skipDuplicateCheck ? new Map() : seenAddresses);
          
          // Update counters
          processed++;
          if (result.duplicateStatus !== 'UNIQUE') {
            duplicates++;
          }
          if (result.confidence !== 'UNRESOLVED') {
            successful++;
          } else {
            failed++;
          }
          
          // Report progress
          if (onProgress) {
            onProgress({
              total: stops.length,
              processed,
              successful,
              failed,
              duplicates,
              currentItem: stop.address.substring(0, 50),
            });
          }
          
          return result;
        } catch (err) {
          processed++;
          failed++;
          
          if (onProgress) {
            onProgress({
              total: stops.length,
              processed,
              successful,
              failed,
              duplicates,
              currentItem: stop.address.substring(0, 50),
            });
          }
          
          // Return a failed stop
          return {
            id: `failed-${Date.now()}-${Math.random()}`,
            address: stop.address,
            postcode: null,
            lat: null,
            lng: null,
            confidence: 'UNRESOLVED' as const,
            source: 'none' as const,
            duplicateStatus: 'UNIQUE' as const,
            riskFactors: [],
            parcelCount: stop.parcelCount ?? 1,
            resolvedIn: 0,
          };
        }
      })
    );
    
    results.push(...chunkResults);
  }
  
  // Calculate summary
  const summary = {
    total: stops.length,
    successful,
    failed,
    duplicates,
    highConfidence: results.filter(r => r.confidence === 'HIGH').length,
    mediumConfidence: results.filter(r => r.confidence === 'MEDIUM').length,
    lowConfidence: results.filter(r => r.confidence === 'LOW').length,
    unresolved: results.filter(r => r.confidence === 'UNRESOLVED').length,
    totalResolvedIn: results.reduce((acc, r) => acc + r.resolvedIn, 0),
  };
  
  return { stops: results, summary };
}

/**
 * Quick validation without geocoding (for instant feedback)
 */
export function validateInputs(stops: IntakeStopInput[]): {
  valid: IntakeStopInput[];
  errors: Array<{ index: number; error: string }>;
} {
  const valid: IntakeStopInput[] = [];
  const errors: Array<{ index: number; error: string }> = [];
  
  stops.forEach((stop, index) => {
    if (!stop.address || stop.address.trim().length === 0) {
      errors.push({ index, error: 'Address is required' });
      return;
    }
    
    if (stop.address.length > 500) {
      errors.push({ index, error: 'Address too long (max 500 characters)' });
      return;
    }
    
    if (stop.parcelCount !== undefined && (stop.parcelCount < 1 || stop.parcelCount > 999)) {
      errors.push({ index, error: 'Parcel count must be between 1 and 999' });
      return;
    }
    
    valid.push(stop);
  });
  
  return { valid, errors };
}
