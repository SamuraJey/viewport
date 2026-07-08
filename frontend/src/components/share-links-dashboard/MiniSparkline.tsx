import { useId } from 'react';

export const MiniSparkline = ({ values }: { values: number[] }) => {
  const gradientId = useId();
  const chartValues = values.length > 1 ? values : [0, values[0] ?? 0, values[0] ?? 0];
  const width = 120;
  const height = 34;
  const padding = 3;
  const minValue = Math.min(...chartValues, 0);
  const maxValue = Math.max(...chartValues, 1);
  const range = Math.max(maxValue - minValue, 1);
  const points = chartValues.map((value, index) => {
    const x =
      padding +
      (index / Math.max(chartValues.length - 1, 1)) * Math.max(width - padding * 2, padding);
    const y = height - padding - ((value - minValue) / range) * (height - padding * 2);
    return { x, y };
  });
  const linePath = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ');

  const areaPath = `${linePath} L ${points[points.length - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-8 w-28 text-accent"
      role="img"
      aria-label="Views trend sparkline"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.2" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} />
      <path
        d={linePath}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.5"
      />
    </svg>
  );
};
