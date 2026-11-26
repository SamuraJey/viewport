import { useId, useLayoutEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { AppPopover } from './AppPopover';
import { cn } from '../../lib/utils';

interface CalendarFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  compact?: boolean;
  withTime?: boolean;
  disabled?: boolean;
}

const formatter = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(undefined, { ...options, timeZone: 'UTC' });
const fullDate = formatter({ dateStyle: 'full' });
const shortDate = formatter({ dateStyle: 'medium' });
const monthName = formatter({ month: 'long' });
const months = Array.from({ length: 12 }, (_, month) =>
  monthName.format(new Date(Date.UTC(2024, month, 1))),
);
const yearPageSize = 12;
const lastYear = 9999;
const weekday = formatter({ weekday: 'short' });
const iso = (date: Date) => date.toISOString().slice(0, 10);
const parseDay = (value: string) => new Date(value + 'T12:00:00Z');
const shift = (day: Date, days: number) => new Date(day.getTime() + days * 86400000);
const todayKey = (utc: boolean) => {
  const now = new Date();
  return iso(utc ? now : new Date(now.getTime() - now.getTimezoneOffset() * 60000));
};
const smallButton =
  'inline-flex size-10 items-center justify-center rounded-xl text-muted hover:bg-accent/10 hover:text-accent-text focus-visible:outline-accent disabled:opacity-45';

const pickerButton = (active: boolean) =>
  cn(
    'min-h-11 rounded-xl px-1 text-sm focus-visible:outline-2 focus-visible:outline-accent',
    active ? 'bg-accent font-bold text-accent-foreground' : 'text-text hover:bg-accent/10',
  );

function Calendar({
  value,
  today,
  choose,
}: {
  value: string;
  today: string;
  choose: (key: string) => void;
}) {
  const [cursor, setCursor] = useState(() => parseDay(value || today));
  const [view, setView] = useState<'days' | 'months' | 'years'>('days');
  const yearInputId = useId();
  const [yearStart, setYearStart] = useState(1);
  const [yearInput, setYearInput] = useState('');
  const monthTrigger = useRef<HTMLButtonElement>(null);
  const yearTrigger = useRef<HTMLButtonElement>(null);
  const year = cursor.getUTCFullYear();
  const month = cursor.getUTCMonth();
  const typedYear = Number(yearInput);
  const validYear = /^\d{1,4}$/.test(yearInput) && typedYear >= 1 && typedYear <= lastYear;
  const first = new Date(cursor);
  first.setUTCDate(1);
  const start = shift(first, -((first.getUTCDay() + 6) % 7));
  const cursorButton = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);

  useLayoutEffect(() => {
    if (restoreFocus.current) cursorButton.current?.focus();
    restoreFocus.current = false;
  }, [cursor]);

  function showMonth(nextYear: number, nextMonth: number) {
    const next = new Date(first);
    next.setUTCFullYear(nextYear, nextMonth);
    if (next.getUTCFullYear() >= 1 && next.getUTCFullYear() <= lastYear) setCursor(next);
  }

  function finishJump(nextYear: number, nextMonth: number) {
    showMonth(nextYear, nextMonth);
    setView('days');
    (view === 'years' ? yearTrigger : monthTrigger).current?.focus();
  }

  function toggleYearView() {
    setYearInput(String(year));
    setYearStart(Math.min(lastYear - yearPageSize + 1, Math.max(1, year - 5)));
    setView(view === 'years' ? 'days' : 'years');
  }

  function navigate(direction: number) {
    if (view === 'years') {
      const nextStart = yearStart + direction * yearPageSize;
      setYearStart(Math.min(lastYear - yearPageSize + 1, Math.max(1, nextStart)));
    } else if (view === 'months') {
      showMonth(year + direction, month);
    } else {
      showMonth(year, month + direction);
    }
  }

  const navigationUnit = { days: 'month', months: 'year', years: 'years' }[view];
  const atStart =
    view === 'years' ? yearStart === 1 : year === 1 && (view === 'months' || month === 0);
  const atEnd =
    view === 'years'
      ? yearStart + yearPageSize - 1 === lastYear
      : year === lastYear && (view === 'months' || month === 11);

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex min-w-0 items-center gap-1">
          <button
            ref={monthTrigger}
            type="button"
            aria-label={`Change month, ${months[month]}`}
            aria-expanded={view === 'months'}
            onClick={() => setView(view === 'months' ? 'days' : 'months')}
            className="inline-flex min-h-10 min-w-0 items-center gap-1 rounded-lg px-1 text-text hover:bg-accent/10 focus-visible:outline-accent"
          >
            <span className="truncate text-xl font-bold capitalize">{months[month]}</span>
            <ChevronDown size={14} className="shrink-0" aria-hidden="true" />
          </button>
          <button
            ref={yearTrigger}
            type="button"
            aria-label={`Change year, ${year}`}
            aria-expanded={view === 'years'}
            onClick={toggleYearView}
            className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-lg px-1 text-sm tabular-nums text-muted hover:bg-accent/10 hover:text-accent-text focus-visible:outline-accent"
          >
            {year}
            <ChevronDown size={14} aria-hidden="true" />
          </button>
        </div>
        <div className="flex shrink-0">
          <button
            type="button"
            className={smallButton}
            aria-label={`Previous ${navigationUnit}`}
            disabled={atStart}
            onClick={() => navigate(-1)}
          >
            <ChevronLeft size={17} />
          </button>
          <button
            type="button"
            className={smallButton}
            aria-label={`Next ${navigationUnit}`}
            disabled={atEnd}
            onClick={() => navigate(1)}
          >
            <ChevronRight size={17} />
          </button>
        </div>
      </div>
      {view === 'months' && (
        <div role="group" aria-label="Choose month" className="grid grid-cols-3 gap-1">
          {months.map((name, index) => (
            <button
              type="button"
              key={name}
              aria-pressed={index === month}
              onClick={() => finishJump(year, index)}
              className={cn(pickerButton(index === month), 'capitalize')}
            >
              {name}
            </button>
          ))}
        </div>
      )}
      {view === 'years' && (
        <>
          <div className="mb-3 flex items-center gap-2 rounded-xl bg-surface-1 p-2 dark:bg-surface-dark-1">
            <label htmlFor={yearInputId} className="text-sm font-semibold text-muted">
              Year
            </label>
            <input
              id={yearInputId}
              type="text"
              inputMode="numeric"
              maxLength={4}
              value={yearInput}
              onChange={(event) => setYearInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                if (validYear) finishJump(typedYear, month);
              }}
              className="h-10 min-w-0 flex-1 rounded-lg border border-border/50 bg-surface px-2 text-base tabular-nums text-text sm:text-sm dark:bg-surface-dark"
            />
            <button
              type="button"
              disabled={!validYear}
              onClick={() => finishJump(typedYear, month)}
              className="min-h-10 rounded-lg px-3 text-sm font-bold text-accent-text hover:bg-accent/10 focus-visible:outline-accent disabled:opacity-45"
            >
              Go
            </button>
          </div>
          <p aria-live="polite" className="mb-2 px-1 text-sm tabular-nums text-muted">
            {yearStart}–{yearStart + yearPageSize - 1}
          </p>
          <div role="group" aria-label="Choose year" className="grid grid-cols-4 gap-1">
            {Array.from({ length: yearPageSize }, (_, index) => {
              const option = yearStart + index;
              return (
                <button
                  type="button"
                  key={option}
                  aria-pressed={option === year}
                  onClick={() => finishJump(option, month)}
                  className={cn(pickerButton(option === year), 'tabular-nums')}
                >
                  {option}
                </button>
              );
            })}
          </div>
        </>
      )}
      {view === 'days' && (
        <div className="grid grid-cols-7 text-center">
          {Array.from({ length: 7 }, (_, i) => (
            <span aria-hidden="true" key={i} className="pb-2 text-xs font-bold text-muted">
              {weekday.format(shift(start, i))}
            </span>
          ))}
          {Array.from({ length: 42 }, (_, i) => {
            const day = shift(start, i);
            const key = iso(day);
            const active = key === iso(cursor);
            return (
              <button
                type="button"
                key={day.getTime()}
                ref={active ? cursorButton : undefined}
                disabled={day.getUTCFullYear() < 1 || day.getUTCFullYear() > lastYear}
                tabIndex={active ? 0 : -1}
                aria-label={fullDate.format(day)}
                aria-pressed={key === value}
                aria-current={key === today ? 'date' : undefined}
                onKeyDown={(event) => {
                  const offsets: Record<string, number> = {
                    ArrowLeft: -1,
                    ArrowRight: 1,
                    ArrowUp: -7,
                    ArrowDown: 7,
                    Home: -(i % 7),
                    End: 6 - (i % 7),
                  };
                  if (!(event.key in offsets)) return;
                  event.preventDefault();
                  const next = shift(day, offsets[event.key]);
                  if (next.getUTCFullYear() < 1 || next.getUTCFullYear() > lastYear) return;
                  restoreFocus.current = true;
                  setCursor(next);
                }}
                onClick={() => choose(key)}
                className={cn(
                  'relative h-10 rounded-xl text-sm tabular-nums focus-visible:outline-2 focus-visible:outline-accent',
                  day.getUTCMonth() === cursor.getUTCMonth() ? 'text-text' : 'text-muted',
                  key === value
                    ? 'bg-accent font-bold text-accent-foreground'
                    : 'hover:bg-accent/10',
                  key === today && 'underline decoration-2 underline-offset-4',
                )}
              >
                {day.getUTCDate()}
              </button>
            );
          })}
        </div>
      )}
      <div className="mt-3 flex justify-between border-t border-border/50 pt-2">
        <button
          type="button"
          disabled={!value}
          className="min-h-10 rounded-lg px-2 text-sm text-muted hover:text-text disabled:opacity-45"
          onClick={() => choose('')}
        >
          Clear
        </button>
        <button
          type="button"
          className="min-h-10 rounded-lg px-3 text-sm font-bold text-accent-text hover:bg-accent/10"
          onClick={() => choose(today)}
        >
          Today
        </button>
      </div>
    </>
  );
}

export function CalendarField({
  id,
  label,
  value,
  onChange,
  compact,
  withTime,
  disabled,
}: CalendarFieldProps) {
  const anchor = '--calendar-' + useId().replace(/[^\w-]/g, '');
  const [rawDate, time = '00:00'] = value.split('T');
  const date = rawDate && Number.isFinite(parseDay(rawDate).getTime()) ? rawDate : '';
  return (
    <div className={cn('min-w-0', withTime && 'flex flex-wrap items-center gap-2')}>
      <AppPopover
        buttonId={id}
        disabled={disabled}
        topLayerAnchor={anchor}
        buttonAriaLabel={label + (date ? ', ' + fullDate.format(parseDay(date)) : '')}
        buttonClassName={cn(
          'flex w-full items-center gap-2 rounded-xl border border-border/50 bg-surface-1 px-3 text-sm font-semibold text-text hover:border-accent/50 focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50 dark:bg-surface-dark-1',
          compact ? 'min-h-9' : 'min-h-12',
        )}
        buttonContent={
          <>
            <CalendarDays size={16} className="shrink-0 text-muted" />
            <span className="flex-1 text-left">
              {date ? shortDate.format(parseDay(date)) : 'Choose date'}
            </span>
            <ChevronDown size={14} aria-hidden="true" />
          </>
        }
        panelFocus
        panelClassName="calendar-panel rounded-2xl border border-border/60 bg-surface p-3 text-text shadow-xl dark:bg-surface-dark"
        panel={(close) => (
          <Calendar
            today={todayKey(!!withTime)}
            value={date}
            choose={(key) => {
              onChange(key && withTime ? key + 'T' + time : key);
              close();
            }}
          />
        )}
      />
      {withTime && (
        <label className="flex min-h-12 items-center gap-2 rounded-xl border border-border/50 px-3 text-sm text-muted">
          <input
            aria-label="Expiration time in UTC"
            type="time"
            disabled={disabled || !date}
            value={date ? time : ''}
            onChange={(event) => {
              if (event.target.value) onChange(date + 'T' + event.target.value);
            }}
            className="bg-transparent text-text"
          />{' '}
          UTC
        </label>
      )}
    </div>
  );
}
