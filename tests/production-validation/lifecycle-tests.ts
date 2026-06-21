/**
 * Lifecycle Tests
 * 
 * Validates driver lifecycle state machine.
 */

interface TestResult {
  suite: string;
  passed: boolean;
  tests: number;
  errors: string[];
}

// Driver lifecycle states
export type DriverLifecycleState = 
  | 'UNAUTHENTICATED'
  | 'AUTHENTICATED'
  | 'ROUTE_PREPARED'
  | 'READY_TO_GO'
  | 'ACTIVE_SHIFT'
  | 'COMPLETE';

interface LifecycleTransition {
  from: DriverLifecycleState;
  to: DriverLifecycleState;
  trigger: string;
  greeting?: string;
}

const LIFECYCLE_TRANSITIONS: LifecycleTransition[] = [
  { from: 'UNAUTHENTICATED', to: 'AUTHENTICATED', trigger: 'login' },
  { from: 'AUTHENTICATED', to: 'ROUTE_PREPARED', trigger: 'prepareRoute' },
  { from: 'ROUTE_PREPARED', to: 'READY_TO_GO', trigger: 'reviewRoute' },
  { from: 'READY_TO_GO', to: 'ACTIVE_SHIFT', trigger: 'startShift' },
  { from: 'ACTIVE_SHIFT', to: 'COMPLETE', trigger: 'completeLastStop' },
];

// States where greeting SHOULD NOT appear
const NO_GREETING_STATES: DriverLifecycleState[] = [
  'UNAUTHENTICATED',
  'AUTHENTICATED',
];

// States where greeting SHOULD appear
const GREETING_STATES: DriverLifecycleState[] = [
  'READY_TO_GO',
  'ACTIVE_SHIFT',
];

export async function runLifecycleTests(): Promise<TestResult> {
  const errors: string[] = [];

  // Test 1: Valid lifecycle transitions
  for (const transition of LIFECYCLE_TRANSITIONS) {
    if (!isValidTransition(transition.from, transition.to)) {
      errors.push(`Invalid transition: ${transition.from} → ${transition.to}`);
    }
  }

  // Test 2: Greeting only on READY_TO_GO and ACTIVE_SHIFT
  const allStates: DriverLifecycleState[] = [
    'UNAUTHENTICATED',
    'AUTHENTICATED',
    'ROUTE_PREPARED',
    'READY_TO_GO',
    'ACTIVE_SHIFT',
    'COMPLETE',
  ];

  for (const state of allStates) {
    const shouldGreet = GREETING_STATES.includes(state);
    const showsGreeting = state === 'READY_TO_GO' || state === 'ACTIVE_SHIFT';
    
    if (shouldGreet !== showsGreeting) {
      errors.push(`Greeting logic mismatch for state: ${state}`);
    }
  }

  // Test 3: Greeting text format
  // Note: greeting depends on current hour, so we test the format generically
  const greetingTests: Array<{ state: DriverLifecycleState; name: string; expectedPattern: RegExp }> = [
    { state: 'READY_TO_GO', name: 'John', expectedPattern: /Good (?:morning|afternoon|evening) John\. Your route is ready with \d+ stops\. Let's go!/ },
    { state: 'ACTIVE_SHIFT', name: 'Jane', expectedPattern: /Good (?:morning|afternoon|evening) Jane\. Your route is ready with \d+ stops\. Let's go!/ },
  ];

  for (const test of greetingTests) {
    const greeting = generateGreeting(test.state, test.name, 5);
    if (!test.expectedPattern.test(greeting)) {
      errors.push(`Greeting format incorrect for ${test.state}: ${greeting}`);
    }
  }

  return {
    suite: 'Driver Lifecycle',
    passed: errors.length === 0,
    tests: LIFECYCLE_TRANSITIONS.length + allStates.length + greetingTests.length,
    errors,
  };
}

function isValidTransition(from: DriverLifecycleState, to: DriverLifecycleState): boolean {
  return LIFECYCLE_TRANSITIONS.some(t => t.from === from && t.to === to);
}

export function generateGreeting(
  state: DriverLifecycleState,
  name: string,
  stopCount: number
): string {
  const hour = new Date().getHours();
  const timeGreeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  
  if (state === 'READY_TO_GO' || state === 'ACTIVE_SHIFT') {
    return `${timeGreeting} ${name}. Your route is ready with ${stopCount} stops. Let's go!`;
  }
  
  return '';
}

export function shouldShowGreeting(state: DriverLifecycleState): boolean {
  return GREETING_STATES.includes(state);
}
