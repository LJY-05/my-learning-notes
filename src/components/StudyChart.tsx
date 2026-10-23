import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  LineChart,
  Line,
  CartesianGrid,
} from "recharts";
import { Empty } from "./ui";
export default function Chart({
  data,
  field,
  line = false,
}: {
  data: Record<string, any>[];
  field: string;
  line?: boolean;
}) {
  if (!data.length) return <Empty>真实记录会在这里形成趋势。</Empty>;
  const common = (
    <>
      <CartesianGrid vertical={false} stroke="var(--line)" />
      <XAxis
        dataKey="date"
        tick={{ fontSize: 11, fill: "var(--muted)" }}
        axisLine={false}
        tickLine={false}
      />
      <YAxis
        width={35}
        tick={{ fontSize: 11, fill: "var(--muted)" }}
        axisLine={false}
        tickLine={false}
      />
      <Tooltip
        contentStyle={{
          borderRadius: 12,
          border: "1px solid var(--line)",
          background: "var(--card)",
          color: "var(--text)",
        }}
      />
    </>
  );
  return (
    <div className="chart">
      <ResponsiveContainer width="100%" height={220}>
        {line ? (
          <LineChart data={data}>
            {common}
            <Line
              dataKey={field}
              type="monotone"
              stroke="var(--accent)"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          </LineChart>
        ) : (
          <BarChart data={data}>
            {common}
            <Bar
              dataKey={field}
              fill="var(--accent)"
              radius={[5, 5, 0, 0]}
              maxBarSize={26}
            />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
