export function Bars({ values, max = 100 }: { values: Array<{ label: string; value: number }>; max?: number }) {
  const labelStep = values.length > 21 ? 5 : values.length > 14 ? 2 : 1;
  return (
    <div className="mini-bars">
      {values.map((item, index) => (
        <div className="mini-bar" key={item.label} title={`${item.label}: ${item.value}`}>
          <span style={{ height: `${Math.max(4, Math.min(100, (item.value / max) * 100))}%` }} />
          <small>{index === 0 || index === values.length - 1 || (index + 1) % labelStep === 0 ? item.label : ""}</small>
        </div>
      ))}
    </div>
  );
}
