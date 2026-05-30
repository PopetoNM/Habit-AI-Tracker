export function DonutChart({ value, label }: { value: number; label: string }) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.max(0, Math.min(100, value)) / 100) * circumference;

  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 96 96" role="img" aria-label={`${label} ${value}%`}>
        <circle cx="48" cy="48" r={radius} className="donut-bg" />
        <circle
          cx="48"
          cy="48"
          r={radius}
          className="donut-fill"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <strong>{value}%</strong>
      <small>{label}</small>
    </div>
  );
}
