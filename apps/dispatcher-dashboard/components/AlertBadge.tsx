interface Props { level: 'red' | 'amber' | 'blue'; count: number; label: string }

const STYLES = {
  red:   'bg-red-900/50 text-red-300 border-red-800',
  amber: 'bg-amber-900/50 text-amber-300 border-amber-800',
  blue:  'bg-blue-900/50 text-blue-300 border-blue-800',
};

export default function AlertBadge({ level, count, label }: Props) {
  if (!count) return null;
  return (
    <span className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${STYLES[level]}`}>
      <span className="font-bold">{count}</span> {label}
    </span>
  );
}