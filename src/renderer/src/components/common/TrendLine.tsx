export function TrendLine({ values }: { values: number[] }) {
  const points =
    values.length > 1
      ? values
          .map((value, index) => {
            const x = (index / (values.length - 1)) * 220;
            const y = 90 - (Math.max(0, Math.min(10, value)) / 10) * 80;
            return `${x},${y}`;
          })
          .join(" ")
      : "";

  return (
    <svg className="trend-line" viewBox="0 0 220 96" role="img" aria-label="Mental state trend">
      <line x1="0" y1="90" x2="220" y2="90" />
      <line x1="0" y1="10" x2="220" y2="10" />
      {points && <polyline points={points} />}
    </svg>
  );
}
