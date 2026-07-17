import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useIsMobile } from "../portfolio/useIsMobile";
import { getChartTickFontSize } from "./chartResponsive";
import { CHART_TOOLTIP_PROPS } from "./chartTheme";

export function HistoryLineChart({
  data,
  label,
}: {
  data: { x: string; y: number | null }[];
  label: string;
}) {
  const tickFontSize = getChartTickFontSize(useIsMobile());
  return (
    <div className="history-chart">
      <h3>{label}</h3>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#262d38" />
          <XAxis dataKey="x" tick={{ fill: "#8891a0", fontSize: tickFontSize }} stroke="#262d38" />
          <YAxis tick={{ fill: "#8891a0", fontSize: tickFontSize }} stroke="#262d38" />
          <Tooltip {...CHART_TOOLTIP_PROPS} />
          <Line type="monotone" dataKey="y" stroke="#35d0c0" dot={false} name={label} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
