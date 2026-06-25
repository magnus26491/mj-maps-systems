/**
 * External Road Data Provider Abstraction
 * 
 * Provides a unified interface for traffic and road data from multiple providers.
 * Supports HERE Traffic, TomTom Traffic, and Google Traffic fallback.
 * 
 * All providers feed into navigation-events, never directly to the driver app.
 */

export * from './types';
export * from './adapter';
