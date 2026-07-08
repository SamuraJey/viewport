import { selectionStatusClasses, selectionStatusLabel } from './utils';

export const SessionStatusBadge = ({ status }: { status?: string | null }) => (
  <span
    className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold capitalize ${selectionStatusClasses(status)}`}
  >
    {selectionStatusLabel(status)}
  </span>
);
