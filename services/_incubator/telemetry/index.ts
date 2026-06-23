/**
 * Telemetry Service
 * 
 * Provides measurement layer for world-class logistics software.
 * 
 * Categories:
 * - Driver Metrics: App performance, route actions, usage patterns
 * - Route Metrics: Prediction accuracy, navigation, completion
 * - Product Metrics: Conversion, adoption, feature usage
 * - Technical Metrics: API latency, service health
 * 
 * Privacy:
 * - No unnecessary personal data collection
 * - No customer-sensitive information
 * - No continuous location tracking outside active shift
 */

export { trackDriverEvent, trackRouteMetric, trackProductMetric, getTelemetrySummary } from './tracker';
export { checkApiHealth, checkRedisHealth, checkDatabaseHealth, getServiceStatus } from './monitor';
export { type TelemetryEvent, type DriverEvent, type RouteMetric, type ProductMetric } from './types';
