// src/components/charts/Charts.jsx
// Recharts wrappers used on the Dashboard and Reports pages.

import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { formatMoney } from '../../utils/currency';
import { dayKeyLabel } from '../../utils/dates';

const AXIS = { stroke: 'var(--faint)', fontSize: 11, tickLine: false };
const GRID = { strokeDasharray: '3 4', stroke: 'var(--border)', vertical: false };

function tooltipContent(fmtMoney) {
  return (props) => {
    const { active, payload, label } = props;
    if (!active || !payload?.length) return null;
    const isMoney = payload.some((p) => ['sales', 'revenue', 'value'].includes(p.dataKey));
    return (
      <div className="chart-tooltip">
        <div className="tt-title">{dayKeyLabel(label)}</div>
        {payload.map((p, i) => (
          <div className="tt-row" key={i}>
            <span className="tt-dot" style={{ background: p.color || p.fill }} />
            <span>{p.name}</span>
            <span className="tt-val">{isMoney ? formatMoney(p.value * 100) : `${p.value.toLocaleString()} units`}</span>
          </div>
        ))}
      </div>
    );
  };
}

export function SalesAreaChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.32} />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="label" {...AXIS} minTickGap={24} />
        <YAxis {...AXIS} width={54} tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)} />
        <Tooltip content={tooltipContent()} />
        <Area type="monotone" dataKey="sales" name="Sales" stroke="#2563eb" strokeWidth={2.2} fill="url(#salesFill)" activeDot={{ r: 4 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function ReceivedIssuedBars({ data }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 10, left: 0, bottom: 0 }} barGap={2}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="label" {...AXIS} minTickGap={24} />
        <YAxis {...AXIS} width={38} />
        <Tooltip content={tooltipContent()} cursor={{ fill: 'rgba(37,99,235,0.06)' }} />
        <Legend wrapperStyle={{ fontSize: 11.5 }} />
        <Bar dataKey="received" name="Received" fill="#16a34a" radius={[3, 3, 0, 0]} maxBarSize={14} />
        <Bar dataKey="issued" name="Issued" fill="#d97706" radius={[3, 3, 0, 0]} maxBarSize={14} />
        <Bar dataKey="sold" name="Sold" fill="#2563eb" radius={[3, 3, 0, 0]} maxBarSize={14} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TrendLineChart({ data, keys, colors }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="label" {...AXIS} minTickGap={24} />
        <YAxis {...AXIS} width={38} />
        <Tooltip content={tooltipContent()} />
        {keys.map((k, i) => (
          <Area key={k.key} type="monotone" dataKey={k.key} name={k.name || k.key} stroke={colors[k.key]} fill={colors[k.key]} fillOpacity={0.1} strokeWidth={2} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function CategoryDonut({ data, fmtMoney }) {
  const totalValue = data.reduce((a, c) => a + c.value, 0);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius="52%"
          outerRadius="80%"
          paddingAngle={2}
          stroke="var(--surface)"
          strokeWidth={2}
        >
          {data.map((d) => <Cell key={d.id} fill={d.color} />)}
        </Pie>
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0];
            const pct = totalValue ? Math.round((p.value / totalValue) * 100) : 0;
            return (
              <div className="chart-tooltip">
                <div className="tt-title">{p.name}</div>
                <div className="tt-row"><span className="tt-dot" style={{ background: p.payload.color }} /><span>Stock value</span><span className="tt-val">{fmtMoney(p.value * 100)}</span></div>
                <div className="tt-row"><span className="tt-dot" style={{ background: p.payload.color }} /><span>Share</span><span className="tt-val">{pct}%</span></div>
                <div className="tt-row"><span className="tt-dot" style={{ background: p.payload.color }} /><span>Units</span><span className="tt-val">{p.payload.units.toLocaleString()}</span></div>
              </div>
            );
          }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function HealthDonut({ data }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius="55%"
          outerRadius="82%"
          paddingAngle={2}
          stroke="var(--surface)"
          strokeWidth={2}
        >
          {data.map((d, i) => <Cell key={i} fill={d.color} />)}
        </Pie>
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0];
            const total = data.reduce((a, d) => a + d.value, 0);
            return (
              <div className="chart-tooltip">
                <div className="tt-title">{p.name}</div>
                <div className="tt-row"><span className="tt-dot" style={{ background: p.color }} /><span>Products</span><span className="tt-val">{p.value} ({Math.round((p.value / total) * 100)}%)</span></div>
              </div>
            );
          }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

/** HTML bar list for top products (cleaner than a chart for few items). */
export function TopBars({ rows, fmtMoney, metric = 'qty' }) {
  const max = Math.max(1, ...rows.map((r) => (metric === 'revenue' ? r.revenue : r.qty)));
  return (
    <div className="bar-list">
      {rows.map((r, i) => (
        <div className="bar-row" key={r.productId}>
          <div className="bar-name" title={r.name}>{i + 1}. {r.name}</div>
          <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.round(((metric === 'revenue' ? r.revenue : r.qty) / max) * 100)}%` }} /></div>
          <div className="bar-val">
            {r.qty} units · {metric === 'revenue' ? fmtMoney(r.revenue) : ''}
          </div>
        </div>
      ))}
    </div>
  );
}
