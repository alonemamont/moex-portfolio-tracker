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
          <CartesianGrid strokeDasharray="3 3" stroke="#262d38" />
          <XAxis dataKey="x" tick={{ fill: "#8891a0", fontSize: 11 }} stroke="#262d38" />
          <YAxis tick={{ fill: "#8891a0", fontSize: 11 }} stroke="#262d38" />
          <Tooltip
            contentStyle={{ background: "#141920", border: "1px solid #262d38", borderRadius: 2 }}
            labelStyle={{ color: "#8891a0" }}
            itemStyle={{ color: "#e7eaee" }}
          />
          <Line type="monotone" dataKey="y" stroke="#35d0c0" dot={false} name={label} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
