// Charts that React-only wiring breaks easily: elements inside <Bar> kept in the store (Cell, LabelList, ErrorBar), Legend content,
// every other chart family. Written for React and Preact alike; the counts in smoke.test.tsx come from React recharts rendering it.
import {
  Area, Bar, BarChart, Brush, CartesianGrid, Cell, ComposedChart, ErrorBar, Funnel, FunnelChart, LabelList, Legend, Line, Pie, PieChart,
  ReferenceArea, ReferenceDot, ReferenceLine, Sankey, Scatter, ScatterChart, SunburstChart, Tooltip, Treemap, XAxis, YAxis, ZAxis,
} from "recharts"
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"

const data = [
  { month: "January", desktop: 186, mobile: 80, other: 40 },
  { month: "February", desktop: 305, mobile: 200, other: 90 },
  { month: "March", desktop: 237, mobile: 120, other: 60 },
  { month: "April", desktop: 73, mobile: 190, other: 30 },
  { month: "May", desktop: 209, mobile: 130, other: 70 },
]
const config = {
  desktop: { label: "Desktop", color: "var(--chart-1)" },
  mobile: { label: "Mobile", color: "var(--chart-2)" },
  other: { label: "Other", color: "var(--chart-3)" },
} satisfies ChartConfig
const colors = ["#e11d48", "#2563eb", "#16a34a", "#d97706", "#7c3aed"]
const frame = "h-[260px] w-full"

export default function Stress({ only }: { only?: number[] }) {
  const charts = [
      <ChartContainer config={config} className={frame}>
        <BarChart accessibilityLayer data={data}>
          <XAxis dataKey="month" />
          <Bar dataKey="desktop">{data.map((_, i) => <Cell key={i} fill={colors[i]} />)}</Bar>
        </BarChart>
      </ChartContainer>,
      <ChartContainer config={config} className={frame}>
        <BarChart accessibilityLayer data={data}>
          <XAxis dataKey="month" />
          <Bar dataKey="desktop" fill="var(--color-desktop)"><LabelList dataKey="desktop" position="top" /></Bar>
        </BarChart>
      </ChartContainer>,
      <ChartContainer config={config} className={frame}>
        <BarChart accessibilityLayer data={data}>
          <XAxis dataKey="month" />
          <Bar dataKey="mobile" fill="var(--color-mobile)"><ErrorBar dataKey="other" width={4} /></Bar>
        </BarChart>
      </ChartContainer>,
      <ChartContainer config={config} className={frame}>
        <BarChart accessibilityLayer data={data} layout="horizontal" margin={{ top: 20 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="month" tickLine={false} tickMargin={10} axisLine={false} tickFormatter={(v) => v.slice(0, 3)} />
          <YAxis />
          <ChartTooltip content={<ChartTooltipContent hideLabel />} />
          <ChartLegend content={<ChartLegendContent />} />
          <ReferenceLine y={150} stroke="red" strokeDasharray="3 3" label="avg" />
          <Bar dataKey="desktop" stackId="a" fill="var(--color-desktop)" radius={[0, 0, 4, 4]}>
            <LabelList dataKey="desktop" position="top" />
            {data.map((_, i) => <Cell key={i} fill={colors[i]} />)}
          </Bar>
          <Bar dataKey="mobile" stackId="a" fill="var(--color-mobile)" radius={[4, 4, 0, 0]}>
            <ErrorBar dataKey="other" width={4} />
          </Bar>
        </BarChart>
      </ChartContainer>,
      <ChartContainer config={config} className={frame}>
        <ComposedChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" />
          <YAxis yAxisId="left" />
          <YAxis yAxisId="right" orientation="right" />
          <Tooltip />
          <Legend />
          <ReferenceArea x1="February" x2="April" y1={50} y2={150} fill="#ccc" fillOpacity={0.3} yAxisId="left" />
          <ReferenceDot x="March" y={237} r={5} fill="red" yAxisId="left" />
          <Area yAxisId="left" type="monotone" dataKey="other" fill="var(--color-other)" stroke="var(--color-other)" />
          <Bar yAxisId="left" dataKey="mobile" barSize={20} fill="var(--color-mobile)" />
          <Line yAxisId="right" type="monotone" dataKey="desktop" stroke="var(--color-desktop)" />
          <Brush dataKey="month" height={24} stroke="#888" />
        </ComposedChart>
      </ChartContainer>,
      <ChartContainer config={config} className={frame}>
        <ScatterChart margin={{ top: 10 }}>
          <CartesianGrid />
          <XAxis type="number" dataKey="desktop" name="desktop" />
          <YAxis type="number" dataKey="mobile" name="mobile" />
          <ZAxis type="number" dataKey="other" range={[60, 400]} />
          <Tooltip cursor={{ strokeDasharray: "3 3" }} />
          <Scatter name="A" data={data} fill="#8884d8" />
        </ScatterChart>
      </ChartContainer>,
      <ChartContainer config={config} className={frame}>
        <PieChart>
          <Pie data={data} dataKey="desktop" nameKey="month" outerRadius={80} label />
          <Tooltip />
          <Legend />
        </PieChart>
      </ChartContainer>,
      <ChartContainer config={config} className={frame}>
        <Treemap data={data.map((d) => ({ name: d.month, size: d.desktop }))} dataKey="size" aspectRatio={4 / 3} stroke="#fff" isAnimationActive={false} />
      </ChartContainer>,
      <ChartContainer config={config} className={frame}>
        <FunnelChart>
          <Tooltip />
          <Funnel dataKey="value" data={[{ value: 100, name: "a", fill: "#8884d8" }, { value: 80, name: "b", fill: "#83a6ed" }, { value: 50, name: "c", fill: "#8dd1e1" }]} isAnimationActive={false}>
            <LabelList position="right" fill="#000" stroke="none" dataKey="name" />
          </Funnel>
        </FunnelChart>
      </ChartContainer>,
      <ChartContainer config={config} className={frame}>
        <Sankey data={{ nodes: [{ name: "A" }, { name: "B" }, { name: "C" }], links: [{ source: 0, target: 1, value: 5 }, { source: 0, target: 2, value: 3 }] }} nodePadding={30} link={{ stroke: "#77c878" }} />
      </ChartContainer>,
      <ChartContainer config={config} className={frame}>
        <SunburstChart data={{ name: "root", children: [{ name: "a", value: 3 }, { name: "b", value: 5 }] }} dataKey="value" />
      </ChartContainer>,
  ]
  return <div>{charts.map((chart, i) => (!only || only.includes(i)) && <div key={i}>{chart}</div>)}</div>
}
