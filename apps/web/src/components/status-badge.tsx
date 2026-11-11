import { JobStatus } from '@piwu/shared';
import { Badge } from '@/components/ui/badge';

const STATUS_MAP: Record<
  JobStatus,
  { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'accent' }
> = {
  [JobStatus.PENDING]: { label: 'Queued', variant: 'default' },
  [JobStatus.GENERATING_SCRIPT]: { label: 'Script', variant: 'accent' },
  [JobStatus.AWAITING_APPROVAL]: { label: 'Review', variant: 'warning' },
  [JobStatus.GENERATING_AUDIO]: { label: 'Audio', variant: 'accent' },
  [JobStatus.GENERATING_ASSETS]: { label: 'Assets', variant: 'accent' },
  [JobStatus.RENDERING]: { label: 'Rendering', variant: 'warning' },
  [JobStatus.COMPLETED]: { label: 'Ready', variant: 'success' },
  [JobStatus.FAILED]: { label: 'Failed', variant: 'danger' },
};

export function StatusBadge({ status }: { status: JobStatus }) {
  const meta = STATUS_MAP[status] ?? STATUS_MAP[JobStatus.PENDING];
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}
