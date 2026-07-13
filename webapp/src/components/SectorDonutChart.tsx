import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { CalculatedPosition } from "../types";
import { useIsMobile } from "../portfolio/useIsMobile";
import { getChartLegendFontSize } from "./chartResponsive";

const COLORS = ["#35d0c0", "#e8b339", "#f2555f", "#5b8def", "#34c77b", "#c77dff", "#ff9d5c", "#6ee7d8", "#9aa3b5", "#e08ac9"];

export function SectorDonutChart({ positions }: { positions: CalculatedPosition[] }) {
  const legendFontSize = getChartLegendFontSize(useIsMobile());
  const bySector = new Map<string, number>();
  for (const p of positions) {
    bySector.set(p.sector, (bySector.get(p.sector) ?? 0) + p.positionValue);
  }
  const data = Array.from(bySector.entries())
    .filter(([, value]) => value > 0)
    .map(([sector, value]) => ({ name: sector, value }));

  if (data.length === 0) {
    return <p className="empty-state">Нет данных для распределения по секторам.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={70} outerRadius={110} paddingAngle={2} stroke="#141920">
          {data.map((_, index) => (
            <Cell key={index} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ background: "#141920", border: "1px solid #262d38", borderRadius: 2 }}
          labelStyle={{ color: "#8891a0" }}
          itemStyle={{ color: "#e7eaee" }}
        />
        <Legend wrapperStyle={{ color: "#8891a0", fontSize: legendFontSize }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
