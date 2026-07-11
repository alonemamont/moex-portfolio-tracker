import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export function HistoryLineChart({
  data,
  label,
}: {
  data: { x: string; y: number | null }[];
  label: string;
}) {
  return (
    <div className="history-chart">
      <h3>{label}</h3>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="x" />
          <YAxis />
          <Tooltip />
          <Line type="monotone" dataKey="y" stroke="#1a1a1a" dot={false} name={label} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
