import { useState, useRef } from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Area, ComposedChart, ReferenceLine } from "recharts";

// ─── DATA ───
const revenueData = [
  { year: "2021", revenue: 18.9, netIncome: 8.7 },
  { year: "2022", revenue: 22.2, netIncome: 9.9 },
  { year: "2023", revenue: 25.1, netIncome: 11.2 },
  { year: "2024", revenue: 28.2, netIncome: 12.9 },
  { year: "2025", revenue: 32.8, netIncome: 15.0 },
];

const epsData = [
  { year: "2021", eps: 8.76 },
  { year: "2022", eps: 10.65 },
  { year: "2023", eps: 12.26 },
  { year: "2024", eps: 14.23 },
  { year: "2025", eps: 16.52 },
  { year: "2026E", eps: 19.73 },
];

const segmentData = [
  { name: "Payment Network", value: 60, color: "#1a2744" },
  { name: "Value-Added Services", value: 40, color: "#3b82f6" },
];

const waterfallData = [
  { name: "FY24 Rev", value: 28.2, base: 0, fill: "#555555" },
  { name: "Payment Net", value: 2.1, base: 28.2, fill: "#3b82f6" },
  { name: "VAS Growth", value: 2.8, base: 30.3, fill: "#4ade80" },
  { name: "FX & Other", value: -0.3, base: 33.1, fill: "#f87171" },
  { name: "FY25 Rev", value: 32.8, base: 0, fill: "#e8ecf1" },
];

const pePriceData = [
  { year: "2017", pe: 32.5, price: 151 },
  { year: "2018", pe: 28.8, price: 188 },
  { year: "2019", pe: 38.2, price: 298 },
  { year: "2020", pe: 55.8, price: 357 },
  { year: "2021", pe: 40.1, price: 359 },
  { year: "2022", pe: 30.2, price: 348 },
  { year: "2023", pe: 33.5, price: 427 },
  { year: "2024", pe: 37.7, price: 528 },
  { year: "2025", pe: 36.0, price: 597 },
  { year: "Now", pe: 30.3, price: 483 },
];

const peerData = [
  { metric: "Market Cap", ma: "$432B", v: "$620B", pypl: "$72B" },
  { metric: "Revenue (FY)", ma: "$32.8B", v: "$36.3B", pypl: "$31.4B" },
  { metric: "Rev Growth", ma: "+16%", v: "+12%", pypl: "+7%" },
  { metric: "Net Margin", ma: "45.7%", v: "55%", pypl: "15%" },
  { metric: "P/E Ratio", ma: "30x", v: "30x", pypl: "18x" },
  { metric: "ROE", ma: "210%", v: "49%", pypl: "22%" },
  { metric: "FCF (TTM)", ma: "$17.2B", v: "$19.8B", pypl: "$6.2B" },
  { metric: "Div Yield", ma: "0.63%", v: "0.76%", pypl: "—" },
  { metric: "Moat", ma: "Wide", v: "Wide", pypl: "Narrow" },
];

const tabs = ["Overview", "Financials", "Valuation", "Strategy", "Risks"];

// ─── COMPONENTS ───
const KPI = ({ label, value, sub, color, children }) => (
  <div style={{
    padding: "20px 16px", background: "rgba(255,255,255,0.04)", borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.06)", flex: 1, minWidth: 130,
  }}>
    <div style={{ fontSize: 11, letterSpacing: 1.5, color: "#8b95a5", textTransform: "uppercase", fontFamily: "'DM Sans', sans-serif", marginBottom: 6 }}>{label}</div>
    <div style={{ fontSize: 26, fontWeight: 700, color: color || "#e8ecf1", fontFamily: "'Instrument Serif', serif", lineHeight: 1.1 }}>{value}</div>
    {sub && <div style={{ fontSize: 12, color: sub.startsWith("+") || sub.startsWith("Strong") ? "#4ade80" : sub.startsWith("-") ? "#f87171" : "#8b95a5", marginTop: 4, fontFamily: "'DM Sans', sans-serif" }}>{sub}</div>}
    {children}
  </div>
);

const Section = ({ title, children }) => (
  <div style={{ marginBottom: 36 }}>
    <h2 style={{
      fontSize: 20, fontWeight: 700, color: "#e8ecf1", fontFamily: "'Instrument Serif', serif",
      marginBottom: 16, paddingBottom: 10, borderBottom: "1px solid rgba(255,255,255,0.08)"
    }}>{title}</h2>
    {children}
  </div>
);

const Pill = ({ text, variant }) => {
  const colors = {
    green: { bg: "rgba(74,222,128,0.12)", color: "#4ade80", border: "rgba(74,222,128,0.2)" },
    red: { bg: "rgba(248,113,113,0.12)", color: "#f87171", border: "rgba(248,113,113,0.2)" },
    blue: { bg: "rgba(59,130,246,0.12)", color: "#60a5fa", border: "rgba(59,130,246,0.2)" },
    gray: { bg: "rgba(255,255,255,0.06)", color: "#8b95a5", border: "rgba(255,255,255,0.1)" },
  };
  const c = colors[variant] || colors.gray;
  return (
    <span style={{
      display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600,
      background: c.bg, color: c.color, border: `1px solid ${c.border}`,
      fontFamily: "'DM Sans', sans-serif", letterSpacing: 0.5
    }}>{text}</span>
  );
};

const MetricRow = ({ label, value, highlight }) => (
  <div style={{
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.04)"
  }}>
    <span style={{ color: "#8b95a5", fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>{label}</span>
    <span style={{
      color: highlight === "green" ? "#4ade80" : highlight === "red" ? "#f87171" : "#e8ecf1",
      fontSize: 14, fontWeight: 600, fontFamily: "'DM Sans', sans-serif"
    }}>{value}</span>
  </div>
);

const Collapsible = ({ title, level, color, text }) => {
  const [open, setOpen] = useState(false);
  return (
    <div style={{
      background: "rgba(255,255,255,0.035)", borderRadius: 10,
      border: "1px solid rgba(255,255,255,0.04)", marginBottom: 10, overflow: "hidden"
    }}>
      <div onClick={() => setOpen(!open)} style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "14px 16px", cursor: "pointer", userSelect: "none"
      }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: "#e8ecf1", fontFamily: "'Instrument Serif', serif" }}>{title}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Pill text={level} variant={color} />
          <span style={{
            color: "#555", fontSize: 14, transition: "transform 0.3s ease",
            transform: open ? "rotate(180deg)" : "rotate(0deg)", display: "inline-block"
          }}>▾</span>
        </div>
      </div>
      <div style={{
        maxHeight: open ? 300 : 0, overflow: "hidden",
        transition: "max-height 0.4s ease",
      }}>
        <p style={{ fontSize: 12, color: "#8b95a5", margin: 0, lineHeight: 1.7, padding: "0 16px 14px" }}>{text}</p>
      </div>
    </div>
  );
};

// ─── DCF Calculator ───
const DCFCalculator = () => {
  const [fcf, setFcf] = useState(17.16);
  const [growth, setGrowth] = useState(12);
  const [termGrowth, setTermGrowth] = useState(3);
  const [discount, setDiscount] = useState(10);
  const shares = 0.894;

  const calc = () => {
    let totalPV = 0;
    let cf = fcf;
    for (let i = 1; i <= 10; i++) {
      const gr = Math.max(growth - (i - 1) * ((growth - termGrowth - 1) / 9), termGrowth + 1);
      cf = cf * (1 + gr / 100);
      totalPV += cf / Math.pow(1 + discount / 100, i);
    }
    const terminalValue = (cf * (1 + termGrowth / 100)) / (discount / 100 - termGrowth / 100);
    const pvTerminal = terminalValue / Math.pow(1 + discount / 100, 10);
    return ((totalPV + pvTerminal) / shares).toFixed(0);
  };

  const intrinsic = calc();
  const upside = (((intrinsic - 483) / 483) * 100).toFixed(1);

  const Slider = ({ label, val, setVal, min, max, step, unit }) => (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: "#8b95a5" }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#e8ecf1" }}>{val}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={val}
        onChange={e => setVal(parseFloat(e.target.value))}
        style={{ width: "100%", height: 4, appearance: "none", background: "rgba(255,255,255,0.1)", borderRadius: 2, outline: "none", cursor: "pointer", accentColor: "#3b82f6" }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#444" }}>
        <span>{min}{unit}</span><span>{max}{unit}</span>
      </div>
    </div>
  );

  return (
    <div style={{ background: "rgba(255,255,255,0.035)", borderRadius: 12, padding: 20, border: "1px solid rgba(255,255,255,0.04)" }}>
      <Slider label="Base FCF ($B)" val={fcf} setVal={setFcf} min={14} max={22} step={0.5} unit="B" />
      <Slider label="Revenue Growth (Yr 1)" val={growth} setVal={setGrowth} min={5} max={20} step={1} unit="%" />
      <Slider label="Terminal Growth" val={termGrowth} setVal={setTermGrowth} min={1} max={5} step={0.5} unit="%" />
      <Slider label="Discount Rate (WACC)" val={discount} setVal={setDiscount} min={7} max={14} step={0.5} unit="%" />
      <div style={{
        marginTop: 8, padding: 16, borderRadius: 10, background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center"
      }}>
        <div>
          <div style={{ fontSize: 11, color: "#8b95a5", textTransform: "uppercase", letterSpacing: 1 }}>Intrinsic Value</div>
          <div style={{ fontSize: 32, fontWeight: 700, color: "#e8ecf1", fontFamily: "'Instrument Serif', serif" }}>${intrinsic}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, color: "#8b95a5", textTransform: "uppercase", letterSpacing: 1 }}>vs Current ($483)</div>
          <div style={{
            fontSize: 24, fontWeight: 700, fontFamily: "'Instrument Serif', serif",
            color: parseFloat(upside) >= 0 ? "#4ade80" : "#f87171"
          }}>{parseFloat(upside) >= 0 ? "+" : ""}{upside}%</div>
        </div>
      </div>
      <div style={{ fontSize: 10, color: "#444", marginTop: 8, textAlign: "center" }}>10-year DCF with linear growth fade · {shares}B diluted shares</div>
    </div>
  );
};

// ─── MAIN ───
export default function MAAnalysis() {
  const [activeTab, setActiveTab] = useState("Overview");
  const [animating, setAnimating] = useState(false);

  const switchTab = (t) => {
    if (t === activeTab) return;
    setAnimating(true);
    setTimeout(() => {
      setActiveTab(t);
      setTimeout(() => setAnimating(false), 30);
    }, 150);
  };

  const cardBg = "rgba(255,255,255,0.035)";

  return (
    <div style={{ minHeight: "100vh", background: "#000000", color: "#e8ecf1", fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet" />
      <style>{`
        input[type=range]::-webkit-slider-thumb {
          appearance: none; width: 14px; height: 14px; border-radius: 50%;
          background: #3b82f6; cursor: pointer; border: 2px solid #000;
        }
      `}</style>

      {/* Header */}
      <div style={{
        padding: "32px 28px 20px",
        background: "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, transparent 100%)",
        borderBottom: "1px solid rgba(255,255,255,0.06)"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 4 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 10, background: "#111111",
            display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", padding: 4
          }}>
            <svg viewBox="0 0 48 30" width="38" height="24">
              <circle cx="16" cy="15" r="14" fill="#EB001B" />
              <circle cx="32" cy="15" r="14" fill="#F79E1B" />
              <path d="M24 3.8a14 14 0 0 0-5.2 11.2A14 14 0 0 0 24 26.2a14 14 0 0 0 5.2-11.2A14 14 0 0 0 24 3.8z" fill="#FF5F00" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "'Instrument Serif', serif", lineHeight: 1.1 }}>Mastercard Inc.</div>
            <div style={{ fontSize: 12, color: "#8b95a5", marginTop: 2 }}>NYSE: MA · Payments Technology</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, margin: "16px 0 6px" }}>
          <span style={{ fontSize: 38, fontWeight: 700, fontFamily: "'Instrument Serif', serif" }}>$482.87</span>
          <span style={{ fontSize: 14, color: "#f87171", fontWeight: 600 }}>▼ 19.2% from ATH</span>
        </div>
        <div style={{ fontSize: 12, color: "#8b95a5" }}>As of Mar 29, 2026 · All-time high: $597.27 (Aug 2025)</div>
      </div>

      {/* Tabs */}
      <div style={{
        display: "flex", gap: 0, padding: "0 28px",
        borderBottom: "1px solid rgba(255,255,255,0.06)", overflowX: "auto",
      }}>
        {tabs.map(t => (
          <button key={t} onClick={() => switchTab(t)} style={{
            padding: "14px 16px 12px", fontSize: 13,
            fontWeight: activeTab === t ? 700 : 500,
            color: activeTab === t ? "#60a5fa" : "#555555",
            background: "none", border: "none", cursor: "pointer",
            borderBottom: activeTab === t ? "2px solid #3b82f6" : "2px solid transparent",
            fontFamily: "'DM Sans', sans-serif", whiteSpace: "nowrap",
            transition: "all 0.25s ease"
          }}>{t}</button>
        ))}
      </div>

      {/* Content */}
      <div style={{
        padding: "24px 28px 48px",
        opacity: animating ? 0 : 1,
        transform: animating ? "translateY(8px)" : "translateY(0)",
        transition: "opacity 0.2s ease, transform 0.2s ease",
      }}>

        {activeTab === "Overview" && <>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 28 }}>
            <KPI label="Market Cap" value="$431.7B" sub="#2 Payment Network" />
            <KPI label="P/E Ratio" value="30.3x" sub="5yr avg: 38x" />
            <KPI label="Consensus" value="Strong Buy" sub="25 Buy / 3 Hold" color="#4ade80" />
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 28 }}>
            <KPI label="Beta" value="0.86" sub="Sector avg: 1.12" />
            <KPI label="Div Yield" value="0.63%" sub="$3.48/yr annual" />
            <KPI label="Next Earnings" value="Apr 23" sub="Q1 2026 report" />
            <div style={{
              padding: "20px 16px", background: "rgba(255,255,255,0.04)", borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.06)", flex: 1, minWidth: 130,
            }}>
              <div style={{ fontSize: 11, letterSpacing: 1.5, color: "#8b95a5", textTransform: "uppercase", fontFamily: "'DM Sans', sans-serif", marginBottom: 6 }}>Sentiment (6mo)</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: "#4ade80", fontFamily: "'Instrument Serif', serif", lineHeight: 1.1 }}>Bullish</div>
            </div>
          </div>

          <Section title="Investment Highlights">
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                { icon: "📈", text: "VAS segment growing 21%+ YoY, now ~40% of revenue, compounding above payment network growth" },
                { icon: "🔗", text: "$1.8B BVNK acquisition positions MA as leader in stablecoin infrastructure — largest crypto-payments deal ever" },
                { icon: "💳", text: "77% contactless penetration; 40% of transactions tokenized; 3.7B cards globally" },
                { icon: "💰", text: "~$17B annual free cash flow with 59% operating margins and aggressive buybacks" },
                { icon: "📉", text: "Trading at ~30x P/E vs 38x 5yr average — compressed valuation may offer opportunity" },
              ].map((item, i) => (
                <div key={i} style={{
                  display: "flex", gap: 12, padding: "14px 16px",
                  background: cardBg, borderRadius: 10, border: "1px solid rgba(255,255,255,0.04)"
                }}>
                  <span style={{ fontSize: 18, lineHeight: 1.4 }}>{item.icon}</span>
                  <span style={{ fontSize: 13, color: "#c0c8d4", lineHeight: 1.5 }}>{item.text}</span>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Analyst Price Targets">
            <div style={{ background: cardBg, borderRadius: 12, padding: "24px 24px 16px", border: "1px solid rgba(255,255,255,0.04)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 10, color: "#444" }}>$400</span>
                <span style={{ fontSize: 10, color: "#444" }}>$750</span>
              </div>
              <div style={{ position: "relative", height: 6, borderRadius: 3, background: "rgba(255,255,255,0.06)" }}>
                <div style={{
                  position: "absolute", left: `${((550 - 400) / 350) * 100}%`,
                  width: `${((735 - 550) / 350) * 100}%`, top: 0, height: 6,
                  background: "linear-gradient(90deg, #f87171, #f59e0b, #4ade80, #60a5fa)",
                  borderRadius: 3, opacity: 0.6
                }} />
              </div>
              <div style={{ position: "relative", height: 56 }}>
                {[
                  { price: 483, label: "$483", sub: "Current", color: "#f87171", bold: true, tri: true },
                  { price: 550, label: "$550", sub: "Low", color: "#666666" },
                  { price: 660, label: "$660", sub: "Avg Target", color: "#4ade80", bold: true },
                  { price: 735, label: "$735", sub: "High", color: "#60a5fa" },
                ].map((t, i) => (
                  <div key={i} style={{
                    position: "absolute", left: `${((t.price - 400) / 350) * 100}%`,
                    top: 0, transform: "translateX(-50%)", textAlign: "center", zIndex: t.tri ? 3 : 1
                  }}>
                    {t.tri ? (
                      <div style={{ width: 0, height: 0, borderLeft: "6px solid transparent", borderRight: "6px solid transparent", borderTop: `8px solid ${t.color}`, margin: "0 auto" }} />
                    ) : (
                      <div style={{ width: t.bold ? 2 : 1, height: 12, background: t.color, margin: "0 auto", opacity: t.bold ? 1 : 0.5 }} />
                    )}
                    <div style={{ fontSize: 11, color: t.color, marginTop: 3, whiteSpace: "nowrap", fontWeight: t.bold ? 700 : 500 }}>{t.label}</div>
                    <div style={{ fontSize: 9, color: t.color, whiteSpace: "nowrap", opacity: 0.8 }}>{t.sub}</div>
                  </div>
                ))}
              </div>
            </div>
          </Section>

          <Section title="Peer Comparison">
            <div style={{ background: cardBg, borderRadius: 12, border: "1px solid rgba(255,255,255,0.04)", overflow: "hidden" }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                      {["Metric", "MA", "V", "PYPL"].map((h, i) => (
                        <th key={i} style={{
                          padding: "12px 14px", textAlign: i === 0 ? "left" : "center",
                          color: i === 1 ? "#60a5fa" : "#8b95a5", fontWeight: 700,
                          background: i === 1 ? "rgba(59,130,246,0.06)" : "transparent", whiteSpace: "nowrap"
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {peerData.map((row, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                        <td style={{ padding: "10px 14px", color: "#8b95a5", fontWeight: 500 }}>{row.metric}</td>
                        <td style={{ padding: "10px 14px", textAlign: "center", color: "#e8ecf1", fontWeight: 600, background: "rgba(59,130,246,0.06)" }}>{row.ma}</td>
                        <td style={{ padding: "10px 14px", textAlign: "center", color: "#c0c8d4" }}>{row.v}</td>
                        <td style={{ padding: "10px 14px", textAlign: "center", color: "#c0c8d4" }}>{row.pypl}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Section>
        </>}

        {activeTab === "Financials" && <>
          <Section title="Revenue & Net Income ($B)">
            <div style={{ background: cardBg, borderRadius: 12, padding: "16px 8px 8px", border: "1px solid rgba(255,255,255,0.04)" }}>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={revenueData} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="year" tick={{ fill: "#8b95a5", fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#8b95a5", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} labelStyle={{ color: "#e8ecf1" }} />
                  <Bar dataKey="revenue" name="Revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="netIncome" name="Net Income" fill="#4ade80" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div style={{ display: "flex", gap: 16, justifyContent: "center", paddingBottom: 8 }}>
                <span style={{ fontSize: 11, color: "#3b82f6" }}>● Revenue</span>
                <span style={{ fontSize: 11, color: "#4ade80" }}>● Net Income</span>
              </div>
            </div>
          </Section>

          <Section title="Revenue Bridge — FY24 to FY25">
            <div style={{ background: cardBg, borderRadius: 12, padding: "16px 8px 8px", border: "1px solid rgba(255,255,255,0.04)" }}>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={waterfallData} barSize={36}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="name" tick={{ fill: "#8b95a5", fontSize: 11 }} axisLine={false} tickLine={false} interval={0} />
                  <YAxis tick={{ fill: "#8b95a5", fontSize: 11 }} axisLine={false} tickLine={false} domain={[0, 36]} />
                  <Tooltip contentStyle={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                    formatter={(v, name) => name === "base" ? [null, null] : [`$${v}B`, "Amount"]} />
                  <Bar dataKey="base" stackId="a" fill="transparent" />
                  <Bar dataKey="value" stackId="a" radius={[4, 4, 0, 0]}>
                    {waterfallData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div style={{ textAlign: "center", fontSize: 11, color: "#555", paddingBottom: 4 }}>
                FY2024 → FY2025 Revenue Bridge ($B)
              </div>
            </div>
          </Section>

          <Section title="EPS Growth Trajectory">
            <div style={{ background: cardBg, borderRadius: 12, padding: "16px 8px 8px", border: "1px solid rgba(255,255,255,0.04)" }}>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={epsData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="year" tick={{ fill: "#8b95a5", fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#8b95a5", fontSize: 11 }} axisLine={false} tickLine={false} domain={[6, 22]} />
                  <Tooltip contentStyle={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} formatter={(v) => [`$${v}`, "EPS"]} />
                  <Line type="monotone" dataKey="eps" stroke="#f59e0b" strokeWidth={2.5} dot={{ fill: "#f59e0b", r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Section>

          <Section title="Q4 2025 Results">
            <div style={{ background: cardBg, borderRadius: 12, padding: "4px 16px", border: "1px solid rgba(255,255,255,0.04)" }}>
              <MetricRow label="Net Revenue" value="$8.81B (+18% YoY)" highlight="green" />
              <MetricRow label="Adjusted EPS" value="$4.76 (+25% YoY)" highlight="green" />
              <MetricRow label="Operating Income" value="$4.9B (+25%)" highlight="green" />
              <MetricRow label="Operating Margin" value="55.8%" />
              <MetricRow label="Payment Network Rev" value="+12% (+9% CC)" highlight="green" />
              <MetricRow label="VAS Revenue" value="+26% (+22% CC)" highlight="green" />
              <MetricRow label="Cross-Border Volume" value="+14% (Local Currency)" highlight="green" />
              <MetricRow label="Switched Transactions" value="+10%" highlight="green" />
            </div>
          </Section>

          <Section title="Revenue Mix">
            <div style={{ background: cardBg, borderRadius: 12, padding: 20, border: "1px solid rgba(255,255,255,0.04)", display: "flex", alignItems: "center", gap: 20 }}>
              <ResponsiveContainer width={120} height={120}>
                <PieChart>
                  <Pie data={segmentData} dataKey="value" cx="50%" cy="50%" innerRadius={30} outerRadius={55} strokeWidth={0}>
                    {segmentData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {segmentData.map((s, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: s.color }} />
                    <span style={{ fontSize: 13, color: "#c0c8d4" }}>{s.name} <span style={{ color: "#8b95a5" }}>~{s.value}%</span></span>
                  </div>
                ))}
              </div>
            </div>
          </Section>

          <Section title="Capital Return">
            <div style={{ background: cardBg, borderRadius: 12, padding: "4px 16px", border: "1px solid rgba(255,255,255,0.04)" }}>
              <MetricRow label="Q4 Buybacks" value="$3.6B (6.4M shares)" />
              <MetricRow label="Q4 Dividends" value="$684M" />
              <MetricRow label="Remaining Auth." value="$16.7B" />
              <MetricRow label="Share Count Change" value="-2.27% YoY" highlight="green" />
              <MetricRow label="Annual Dividend" value="$3.48/share (0.63% yield)" />
            </div>
          </Section>
        </>}

        {activeTab === "Valuation" && <>
          <Section title="Valuation Multiples">
            <div style={{ background: cardBg, borderRadius: 12, padding: "4px 16px", border: "1px solid rgba(255,255,255,0.04)" }}>
              <MetricRow label="Trailing P/E" value="30.3x (5yr avg: 38x)" />
              <MetricRow label="Forward P/E" value="~28.5x" />
              <MetricRow label="PEG Ratio" value="1.81" />
              <MetricRow label="EV/EBITDA" value="24.4x" />
              <MetricRow label="EV/FCF" value="29.2x" />
              <MetricRow label="Beta" value="0.86 (lower vol than market)" />
            </div>
          </Section>

          <Section title="Historical P/E vs Price">
            <div style={{ background: cardBg, borderRadius: 12, padding: "16px 8px 8px", border: "1px solid rgba(255,255,255,0.04)" }}>
              <ResponsiveContainer width="100%" height={240}>
                <ComposedChart data={pePriceData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="year" tick={{ fill: "#8b95a5", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="price" orientation="right" tick={{ fill: "#8b95a5", fontSize: 10 }} axisLine={false} tickLine={false} domain={[100, 650]} />
                  <YAxis yAxisId="pe" orientation="left" tick={{ fill: "#8b95a5", fontSize: 10 }} axisLine={false} tickLine={false} domain={[20, 60]} />
                  <Tooltip contentStyle={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} />
                  <ReferenceLine yAxisId="pe" y={37.5} stroke="rgba(255,255,255,0.15)" strokeDasharray="4 4" label={{ value: "10yr avg P/E", fill: "#555", fontSize: 10, position: "insideTopLeft" }} />
                  <Area yAxisId="price" type="monotone" dataKey="price" stroke="#3b82f6" fill="rgba(59,130,246,0.08)" strokeWidth={2} name="Price ($)" dot={{ r: 3, fill: "#3b82f6" }} />
                  <Line yAxisId="pe" type="monotone" dataKey="pe" stroke="#f59e0b" strokeWidth={2} name="P/E Ratio" dot={{ r: 3, fill: "#f59e0b" }} />
                </ComposedChart>
              </ResponsiveContainer>
              <div style={{ display: "flex", gap: 16, justifyContent: "center", paddingBottom: 8 }}>
                <span style={{ fontSize: 11, color: "#3b82f6" }}>● Price (right)</span>
                <span style={{ fontSize: 11, color: "#f59e0b" }}>● P/E (left)</span>
                <span style={{ fontSize: 11, color: "#555" }}>--- 10yr avg</span>
              </div>
            </div>
          </Section>

          <Section title="Profitability Profile">
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                { label: "Gross Margin", val: 100, display: "~100%" },
                { label: "EBITDA Margin", val: 64, display: "64.0%" },
                { label: "Operating Margin", val: 59.2, display: "59.2%" },
                { label: "Net Margin", val: 45.7, display: "45.7%" },
              ].map((m, i) => (
                <div key={i} style={{ background: cardBg, borderRadius: 10, padding: "14px 16px", border: "1px solid rgba(255,255,255,0.04)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontSize: 13, color: "#8b95a5" }}>{m.label}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#4ade80" }}>{m.display}</span>
                  </div>
                  <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3 }}>
                    <div style={{ height: 6, borderRadius: 3, width: `${m.val}%`, background: "linear-gradient(90deg, #3b82f6, #4ade80)" }} />
                  </div>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Returns on Capital">
            <div style={{ background: cardBg, borderRadius: 12, padding: "4px 16px", border: "1px solid rgba(255,255,255,0.04)" }}>
              <MetricRow label="Return on Equity (ROE)" value="209.9%" highlight="green" />
              <MetricRow label="ROIC" value="97.4%" highlight="green" />
              <MetricRow label="Free Cash Flow (TTM)" value="$17.16B" />
              <MetricRow label="Debt / Equity" value="2.45x" />
              <MetricRow label="Cash" value="$10.9B" />
              <MetricRow label="Total Debt" value="$19.0B" />
            </div>
          </Section>

          <Section title="DCF Intrinsic Value Calculator">
            <DCFCalculator />
          </Section>

          <Section title="Analyst Targets vs Current">
            <div style={{ background: cardBg, borderRadius: 12, padding: "16px", border: "1px solid rgba(255,255,255,0.04)", display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { firm: "Citigroup", target: "$735", rating: "Buy" },
                { firm: "TD Cowen", target: "$671", rating: "Buy" },
                { firm: "J.P. Morgan", target: "$655", rating: "Overweight" },
                { firm: "Truist", target: "$611", rating: "Buy" },
                { firm: "BofA", target: "$610", rating: "Buy" },
                { firm: "Morningstar Fair Value", target: "$394", rating: "Hold" },
              ].map((a, i) => (
                <div key={i} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "8px 0", borderBottom: i < 5 ? "1px solid rgba(255,255,255,0.04)" : "none"
                }}>
                  <span style={{ fontSize: 13, color: "#c0c8d4" }}>{a.firm}</span>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <Pill text={a.rating} variant={a.rating === "Hold" ? "gray" : "green"} />
                    <span style={{ fontSize: 14, fontWeight: 700, color: a.target === "$394" ? "#f87171" : "#4ade80", minWidth: 50, textAlign: "right" }}>{a.target}</span>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        </>}

        {activeTab === "Strategy" && <>
          <Section title="BVNK Acquisition — $1.8B">
            <div style={{
              background: "linear-gradient(135deg, rgba(59,130,246,0.08), rgba(139,92,246,0.08))",
              borderRadius: 12, padding: 20, border: "1px solid rgba(59,130,246,0.15)"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <Pill text="ANNOUNCED MAR 17, 2026" variant="blue" />
                <Pill text="LARGEST STABLECOIN DEAL" variant="blue" />
              </div>
              <p style={{ fontSize: 13, color: "#c0c8d4", lineHeight: 1.7, margin: 0 }}>
                Mastercard agreed to acquire London-based stablecoin infrastructure firm BVNK for up to $1.8B (including $300M in contingent payments). This surpasses Stripe's $1.1B Bridge acquisition as the largest stablecoin deal ever.
              </p>
              <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
                {[
                  "Connects on-chain stablecoin rails with MA's global fiat network",
                  "Enables cross-border transfers, remittances & B2B payment use cases",
                  "Stablecoin volumes reached $350B+ in 2025 and growing rapidly",
                  "BVNK revenue ~$40M — strategic positioning > near-term earnings",
                  "Expected to close by year-end 2026 pending regulatory approval"
                ].map((t, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, fontSize: 12, color: "#8b95a5" }}>
                    <span style={{ color: "#60a5fa" }}>→</span> {t}
                  </div>
                ))}
              </div>
            </div>
          </Section>

          <Section title="Other Key Catalysts">
            {[
              { title: "Crypto Partner Program", desc: "85+ digital asset & payments companies united to bridge blockchain with global commerce. Launched March 2026.", tag: "NEW" },
              { title: "Capital One Credit Renewal", desc: "Secured renewal/extension of Capital One credit portfolio — one of the largest issuing partnerships in the U.S.", tag: "WIN" },
              { title: "Apple Card Exclusivity", desc: "Maintained network exclusivity with Apple Card, providing access to a high-value premium consumer base.", tag: "RETAINED" },
              { title: "Tokenization at Scale", desc: "40% of all MA transactions now tokenized. Enables faster, more secure payment flows and positions MA for agentic commerce.", tag: "MILESTONE" },
              { title: "Global Issuing Wins", desc: "Yapi Kredi (10M cards), Walmart/Sam's Club Mexico, Amazon UAE credit card, 60+ new affluent programs.", tag: "GROWTH" },
              { title: "AI & Agentic Commerce", desc: "Investing in AI-driven consulting, analytics, fraud prevention and emerging agentic payment capabilities.", tag: "INNOVATION" },
            ].map((item, i) => (
              <div key={i} style={{
                background: cardBg, borderRadius: 10, padding: "14px 16px",
                border: "1px solid rgba(255,255,255,0.04)", marginBottom: 10
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#e8ecf1", fontFamily: "'Instrument Serif', serif" }}>{item.title}</span>
                  <Pill text={item.tag} variant="blue" />
                </div>
                <p style={{ fontSize: 12, color: "#8b95a5", margin: 0, lineHeight: 1.6 }}>{item.desc}</p>
              </div>
            ))}
          </Section>

          <Section title="2026 Forward Guidance">
            <div style={{ background: cardBg, borderRadius: 12, padding: "4px 16px", border: "1px solid rgba(255,255,255,0.04)" }}>
              <MetricRow label="Q1 Revenue Growth" value="Low-teens (GAAP)" />
              <MetricRow label="FY OpEx Growth" value="Low double-digits (CC)" />
              <MetricRow label="Q1 Restructuring" value="~$200M charge (4% headcount)" highlight="red" />
              <MetricRow label="2026 EPS Est." value="$19.73 (range $18.42-$20.65)" highlight="green" />
              <MetricRow label="Revenue Growth Est." value="~14% annual" highlight="green" />
            </div>
          </Section>
        </>}

        {activeTab === "Risks" && <>
          <Section title="Risk Assessment">
            <p style={{ fontSize: 12, color: "#555", marginBottom: 12 }}>Tap a card to expand details</p>
            {[
              { level: "MEDIUM-HIGH", color: "red", title: "Macroeconomic Slowdown", text: "Consumer spending could decelerate amid geopolitical tensions and potential recession. Credit card purchase volume growth already slowed from +10.5% to +8.2% YoY. U.S. debit volume dropped to +2.3% after Capital One's Discover migration." },
              { level: "MEDIUM-HIGH", color: "red", title: "Regulatory Pressure", text: "FTC sent warning letters to MA, Visa, PayPal & Stripe regarding debanking practices (Mar 2026). UK courts hearing interchange fee challenges. Global regulatory scrutiny on card network pricing continues." },
              { level: "MEDIUM", color: "blue", title: "DeFi & Stablecoin Disruption", text: "Stablecoins could reduce card network relevance for cross-border and B2B payments. Analysts note card networks are the most exposed payment rails to stablecoin disruption — though BVNK acquisition provides a hedge." },
              { level: "MEDIUM", color: "blue", title: "Competitive Dynamics", text: "Visa remains the dominant #1 network. Capital One migrated debit to Discover, impacting U.S. volumes. Fintech competitors (PayPal, Affirm, Block) and alternative payment methods continue to fragment the landscape." },
              { level: "LOW-MEDIUM", color: "gray", title: "Valuation Risk", text: "Even at compressed multiples (~30x P/E), MA trades at a premium. Morningstar's fair value of $394 suggests possible overvaluation by DCF. Growth deceleration could trigger further multiple compression." },
              { level: "LOW", color: "gray", title: "Restructuring Execution", text: "~$200M one-time restructuring charge in Q1 2026 cutting 4% of global employees. Introduces short-term earnings headwinds and organizational disruption risk." },
            ].map((r, i) => (
              <Collapsible key={i} title={r.title} level={r.level} color={r.color} text={r.text} />
            ))}
          </Section>

          <Section title="Bull vs Bear">
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 200, background: "rgba(74,222,128,0.04)", borderRadius: 12, padding: 16, border: "1px solid rgba(74,222,128,0.1)" }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#4ade80", marginBottom: 12, fontFamily: "'Instrument Serif', serif" }}>Bull Case</div>
                {["Best-in-class margins & FCF", "VAS compounding 20%+", "Cash→digital secular shift", "BVNK stablecoin positioning", "P/E at 5yr lows"].map((t, i) => (
                  <div key={i} style={{ fontSize: 12, color: "#c0c8d4", padding: "4px 0", display: "flex", gap: 6 }}>
                    <span style={{ color: "#4ade80" }}>+</span> {t}
                  </div>
                ))}
              </div>
              <div style={{ flex: 1, minWidth: 200, background: "rgba(248,113,113,0.04)", borderRadius: 12, padding: 16, border: "1px solid rgba(248,113,113,0.1)" }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#f87171", marginBottom: 12, fontFamily: "'Instrument Serif', serif" }}>Bear Case</div>
                {["Macro & spending slowdown", "Interchange fee regulation", "Stablecoin disintermediation", "Morningstar FV of $394", "Geopolitical headwinds"].map((t, i) => (
                  <div key={i} style={{ fontSize: 12, color: "#c0c8d4", padding: "4px 0", display: "flex", gap: 6 }}>
                    <span style={{ color: "#f87171" }}>−</span> {t}
                  </div>
                ))}
              </div>
            </div>
          </Section>
        </>}
      </div>
    </div>
  );
}
