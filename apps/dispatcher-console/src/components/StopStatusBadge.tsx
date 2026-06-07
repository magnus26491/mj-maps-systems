import clsx from 'clsx';
import type { StopStatus, AlertLevel } from '@/types';

export function StopStatusBadge({ status }: { status: StopStatus }) {
  return (
    <span className={clsx(
      'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
      status === 'completed' && 'bg-emerald-900/60 text-emerald-300',
      status === 'pending'   && 'bg-zinc-700/60 text-zinc-300',
      status === 'failed'    && 'bg-red-900/60 text-red-300',
      status === 'skipped'   && 'bg-yellow-900/60 text-yellow-300',
    )}>
      {status === 'completed' && '✓ '}
      {status === 'failed'    && '✕ '}
      {status === 'skipped'   && '— '}
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

export function TurnAlertBadge({ level, score }: { level: AlertLevel; score: number }) {
  return (
    <span className={clsx(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-mono font-medium',
      level === 'GREEN' && 'bg-emerald-900/50 text-emerald-300',
      level === 'AMBER' && 'bg-yellow-900/50 text-yellow-300',
      level === 'RED'   && 'bg-red-900/60 text-red-300 animate-pulse-fast',
    )}>
      {level === 'GREEN' && '🟢'}
      {level === 'AMBER' && '🟡'}
      {level === 'RED'   && '🔴'}
      {(score * 100).toFixed(0)}%
    </span>
  );
}
