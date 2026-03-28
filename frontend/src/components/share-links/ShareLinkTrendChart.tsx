import type { ShareLinkDailyPoint } from '../../types';

interface ShareLinkTrendChartProps {
  points: ShareLinkDailyPoint[];
}

const CHART_WIDTH = 820;
const CHART_HEIGHT = 280;
const PADDING_LEFT = 58;
const PADDING_RIGHT = 20;
const PADDING_TOP = 20;
const PADDING_BOTTOM = 42;

const DRAWABLE_WIDTH = CHART_WIDTH - PADDING_LEFT - PADDING_RIGHT;
const DRAWABLE_HEIGHT = CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM;

const numberFormatter = new Intl.NumberFormat();

const parseIsoDayAsLocalDate = (isoDay: string): Date => {
  const [year, month, day] = isoDay.split('-').map((part) => Number.parseInt(part, 10));
  if (!year || !month || !day) {
    return new Date(isoDay);
  }
  return new Date(year, month - 1, day);
};

const linePath = (values: number[], maxValue: number): string => {
  if (values.length === 0) {
    return '';
  }

  return values
    .map((value, index) => {
      const ratio = values.length > 1 ? index / (values.length - 1) : 0;
      const x = PADDING_LEFT + DRAWABLE_WIDTH * ratio;
      const y = PADDING_TOP + DRAWABLE_HEIGHT - (value / maxValue) * DRAWABLE_HEIGHT;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
};

const pickXAxisLabelIndexes = (pointCount: number): number[] => {
  if (pointCount <= 1) {
    return [0];
  }

  const middle = Math.round((pointCount - 1) / 2);
  const quarter = Math.round((pointCount - 1) / 4);
  const threeQuarter = Math.round(((pointCount - 1) * 3) / 4);

  return [...new Set([0, quarter, middle, threeQuarter, pointCount - 1])].sort((a, b) => a - b);
};

const formatDayShort = (isoDay: string) =>
  parseIsoDayAsLocalDate(isoDay).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });

export const ShareLinkTrendChart = ({ points }: ShareLinkTrendChartProps) => {
  if (points.length === 0) {
    return (
      <div className="rounded-2xl border border-border/50 bg-surface-1 p-6 text-sm text-muted dark:bg-surface-dark-1">
        No analytics points yet.
      </div>
    );
  }

  const totalValues = points.map((point) => point.views_total);
  const uniqueValues = points.map((point) => point.views_unique);

  const maxValue = Math.max(1, ...totalValues, ...uniqueValues);
  const totalPath = linePath(totalValues, maxValue);
  const uniquePath = linePath(uniqueValues, maxValue);
  const xLabelIndexes = pickXAxisLabelIndexes(points.length);

  const latestPoint = points[points.length - 1];
  const latestLabel = parseIsoDayAsLocalDate(latestPoint.day).toLocaleDateString();

  return (
    <div className="rounded-2xl border border-border/50 bg-surface-1 p-5 dark:bg-surface-dark-1">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-text">Visits by day</h3>
          <p className="text-xs text-muted">Latest point: {latestLabel}</p>
        </div>
        <div className="flex items-center gap-4 text-xs font-semibold">
          <span className="inline-flex items-center gap-2 text-accent">
            <span className="h-2.5 w-2.5 rounded-full bg-accent" />
            Total views
          </span>
          <span className="inline-flex items-center gap-2 text-success">
            <span className="h-2.5 w-2.5 rounded-full bg-success" />
            Unique views
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <svg
          width="100%"
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          role="img"
          aria-label="Share link visits chart"
          className="min-w-140"
        >
          {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
            const y = PADDING_TOP + DRAWABLE_HEIGHT * tick;
            const value = Math.round(maxValue * (1 - tick));
            return (
              <g key={tick}>
                <line
                  x1={PADDING_LEFT}
                  x2={CHART_WIDTH - PADDING_RIGHT}
                  y1={y}
                  y2={y}
                  stroke="currentColor"
                  strokeOpacity="0.12"
                />
                <text
                  x={PADDING_LEFT - 8}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-muted text-[11px]"
                >
                  {numberFormatter.format(value)}
                </text>
              </g>
            );
          })}

          <line
            x1={PADDING_LEFT}
            y1={PADDING_TOP}
            x2={PADDING_LEFT}
            y2={CHART_HEIGHT - PADDING_BOTTOM}
            stroke="currentColor"
            strokeOpacity="0.2"
          />
          <line
            x1={PADDING_LEFT}
            y1={CHART_HEIGHT - PADDING_BOTTOM}
            x2={CHART_WIDTH - PADDING_RIGHT}
            y2={CHART_HEIGHT - PADDING_BOTTOM}
            stroke="currentColor"
            strokeOpacity="0.2"
          />

          <path
            d={totalPath}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            className="text-accent"
          />
          <path
            d={uniquePath}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            className="text-success"
          />

          {points.map((point, index) => {
            const ratio = points.length > 1 ? index / (points.length - 1) : 0;
            const x = PADDING_LEFT + DRAWABLE_WIDTH * ratio;
            const totalY =
              PADDING_TOP + DRAWABLE_HEIGHT - (point.views_total / maxValue) * DRAWABLE_HEIGHT;
            const uniqueY =
              PADDING_TOP + DRAWABLE_HEIGHT - (point.views_unique / maxValue) * DRAWABLE_HEIGHT;

            const tooltipText = `${parseIsoDayAsLocalDate(point.day).toLocaleDateString()}\nTotal: ${numberFormatter.format(point.views_total)}\nUnique: ${numberFormatter.format(point.views_unique)}\nZIP: ${numberFormatter.format(point.zip_downloads)}\nSingle: ${numberFormatter.format(point.single_downloads)}`;

            return (
              <g key={point.day}>
                <circle cx={x} cy={totalY} r="7" className="fill-transparent">
                  <title>{tooltipText}</title>
                </circle>
                <circle cx={x} cy={uniqueY} r="7" className="fill-transparent">
                  <title>{tooltipText}</title>
                </circle>
                <circle cx={x} cy={totalY} r="3.8" className="fill-accent" />
                <circle cx={x} cy={uniqueY} r="3.2" className="fill-success" />
              </g>
            );
          })}

          {xLabelIndexes.map((index) => {
            const ratio = points.length > 1 ? index / (points.length - 1) : 0;
            const x = PADDING_LEFT + DRAWABLE_WIDTH * ratio;
            const point = points[index];

            return (
              <text
                key={`x-label-${point.day}`}
                x={x}
                y={CHART_HEIGHT - 12}
                textAnchor="middle"
                className="fill-muted text-[11px]"
              >
                {formatDayShort(point.day)}
              </text>
            );
          })}

          <text x={PADDING_LEFT - 42} y={PADDING_TOP + 4} className="fill-muted text-[11px]">
            Views
          </text>
          <text
            x={(PADDING_LEFT + CHART_WIDTH - PADDING_RIGHT) / 2}
            y={CHART_HEIGHT - 2}
            textAnchor="middle"
            className="fill-muted text-[11px]"
          >
            Date
          </text>
        </svg>
      </div>
    </div>
  );
};
