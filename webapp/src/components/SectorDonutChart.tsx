import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { CalculatedPosition } from "../types";

const COLORS = ["#4e79a7", "#f28e2b", "#e15759", "#76b7b2", "#59a14f", "#edc948", "#b07aa1", "#ff9da7", "#9c755f", "#bab0ac"];

export function SectorDonutChart({ positions }: { positions: CalculatedPosition[] }) {
  const bySector = new Map<string, number>();
  for (const p of positions) {
    bySector.set(p.sector, (bySector.get(p.sector) ?? 0) + p.positionValue);
  }
  const data = Array.from(bySector.entries())
    .filter(([, value]) => value > 0)
    .map(([sector, value]) => ({ name: sector, value }));

  if (data.length === 0) {
    return <p>Нет данных для распределения по секторам.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={70} outerRadius={110} paddingAngle={2}>
          {data.map((_, index) => (
            <Cell key={index} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}
