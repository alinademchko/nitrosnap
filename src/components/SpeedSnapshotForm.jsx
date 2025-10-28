import React, { useState, useRef } from 'react';
import { fetchPSIReportSmart } from '../utils/psi-client-proxy';
import './SpeedSnapshotForm.css';
import ReportsSearch from './ReportsSearch';
import './ReportsSearch.css';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList
} from 'recharts';

// PDF export libs
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import autoTable from 'jspdf-autotable';
import ReactDOM from 'react-dom/client';
import CircleGauge from './CircleGauge';

const API_BASE =
  process.env.NODE_ENV === 'development'
    ? 'https://darkturquoise-antelope-174249.hostingersite.com'
    : '';

export const API_URL = `${API_BASE}/api/save-report.php`;
const GET_URL = `${API_BASE}/api/get_report.php`;

const UI = {
  GAUGE_SIZE: 240,
  GAUGE_RING: 18,
  GAUGES_CENTER_COL: 160,
  GAUGES_GAP: 32,

  CHART_W: 920,
  CHART_H: 300,

  PX_TO_PT: 0.75,
};

function fitPxToPage(pxW, pxH, pageW, marginX) {
  let wPt = pxW * UI.PX_TO_PT;
  let hPt = pxH * UI.PX_TO_PT;
  const maxW = pageW - marginX * 2;
  if (wPt > maxW) {
    const s = maxW / wPt;
    wPt = maxW;
    hPt = hPt * s;
  }
  return [wPt, hPt];
}

// Normalizer
function normalizeUrl(input) {
  if (!input) return null;
  let s = String(input).trim();

  s = s.replace(/^\s+|\s+$/g, '');

  if (s.startsWith('/') && /^[a-z0-9.-]+\.[a-z]{2,}([/:?].*)?$/i.test(s.slice(1))) {
    s = s.slice(1);
  }

  if (s.startsWith('//')) s = 'https:' + s;

  // If there is no scheme, add https://
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) {
    s = 'https://' + s;
  }

  // missing trailing slash
  try {
    const u = new URL(s);
    u.hostname = u.hostname.toLowerCase();
    return u.toString();
  } catch {
    return null; // not a valid URL even after normalization
  }
}

  //Case ID helpers
  const CASE_PREFIX = 'NS';
  const pad2 = (n) => String(n).padStart(2, '0');

  function generateCaseId() {
    const d = new Date();
    const yy = String(d.getFullYear()).slice(-2);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
  
    const rand2 = Math.floor(Math.random() * 100).toString().padStart(2, '0');
  
    // Final: YYMMDDHHMMRR (12 digits, all numbers)
    return `${yy}${mm}${dd}${hh}${mi}${rand2}`;
  }
  
  // check if a case_id already exists.
  async function caseIdTaken(id) {
    try {
      const res = await fetch(`${GET_URL}?case_id=${encodeURIComponent(id)}`, { method: 'GET' });
      if (!res.ok) return false;
      const rows = await res.json();
      return Array.isArray(rows) && rows.length > 0;
    } catch {
      return false;
    }
  }

  async function getOrMakeCaseId(userInput) {
    const wanted = (userInput || '').trim();
  
    if (wanted) {
      if (await caseIdTaken(wanted)) {
        const err = new Error(`Case ID "${wanted}" already exists. Please enter a different one.`);
        err.code = 'CASE_ID_DUP';
        throw err;
      }
      return wanted;
    }
  
    // Auto-generate (retry a few times)
    for (let i = 0; i < 5; i++) {
      const auto = generateCaseId();
      if (!(await caseIdTaken(auto))) return auto;
    }
    return generateCaseId();
  }

  async function renderChartPNGForStrategy(strategyResults, buildChartData) {
    if (!strategyResults) return null;
  
    const container = document.createElement('div');
    Object.assign(container.style, {
      position: 'fixed',
      left: '-10000px',
      top: '0',
      width: `${UI.CHART_W}px`,
      height: `${UI.CHART_H}px`,
      pointerEvents: 'none',
      background: '#fff',
      overflow: 'visible',
    });
    document.body.appendChild(container);
  
    const data = buildChartData(strategyResults);
  

    const labelFmt = (value, _name, props) => {
      const metric = props?.payload?.metric || '';
      const n = Number(value);
      if (!Number.isFinite(n)) return '';
      if (metric.startsWith('TBT')) return `${Math.round(n)} ms`;
      if (metric.startsWith('Perf')) return `${Math.round(n)}`;
      if (metric === 'CLS')        return n.toFixed(3);
      return `${n.toFixed(2)} s`;
    };
    const Chart = () => {
      const raw = buildChartData(strategyResults);

      // Caps so every metric has visible height
      const CAPS = {
        "FCP (s)": 3.0,
        "LCP (s)": 4.0,
        "TBT (ms)": 400,
        CLS: 0.3,
        "Perf. Score": 100,
      };

      // PSI-like thresholds color
      const THRESH = {
        "FCP (s)": { good: 1.8, ni: 3.0 },
        "LCP (s)": { good: 2.5, ni: 4.0 },
        "TBT (ms)": { good: 200, ni: 600 },
        CLS: { good: 0.1, ni: 0.25 },
        "Perf. Score": { good: 90, ni: 50 },
      };
      const COLORS = { good: "#10b981", ni: "#f59e0b", poor: "#ef4444" };

      const quality = (metric, v) => {
        const t = THRESH[metric];
        if (!Number.isFinite(v) || !t) return "ni";
        if (metric === "Perf. Score")
          return v >= t.good ? "good" : v >= t.ni ? "ni" : "poor";
        return v <= t.good ? "good" : v <= t.ni ? "ni" : "poor";
      };

      const fmt = (metric, v) => {
        if (!Number.isFinite(v)) return "—";
        if (metric === "CLS") return v.toFixed(2);
        if (metric.includes("(ms)")) return `${Math.round(v)} ms`;
        if (metric.includes("(s)")) return `${v.toFixed(2)} s`;
        if (metric.includes("Score")) return `${Math.round(v)}`;
        return String(v);
      };

      // Per-row cap with +10% headroom so large values don’t flatten
      const rowCap = (metric, withRaw, withoutRaw) => {
        if (metric === "Perf. Score") return 100;
        const base = CAPS[metric] ?? 100;
        const maxRaw = Math.max(Number(withRaw) || 0, Number(withoutRaw) || 0);
        return Math.max(base, maxRaw * 1.1);
      };

      // normalized data for bar heights +  raw numbers for labels
      const data = raw.map((r) => {
        const cap = rowCap(r.metric, r.WithNitro, r.WithoutNitro);
        const withN = cap
          ? Math.max(0, Math.min(100, ((Number(r.WithNitro) || 0) / cap) * 100))
          : 0;
        const withoutN = cap
          ? Math.max(
              0,
              Math.min(100, ((Number(r.WithoutNitro) || 0) / cap) * 100)
            )
          : 0;

        return {
          metric: r.metric,
          WithNitro: withN,
          WithoutNitro: withoutN,
          _withRaw: Number(r.WithNitro),
          _withoutRaw: Number(r.WithoutNitro),
        };
      });

      // Colored labels
      const labelRenderer = (series) => (props) => {
        const { x, y, width, index } = props;
        const row = data[index];
        const metric = raw[index].metric;
        const rawVal = series === "with" ? row._withRaw : row._withoutRaw;
        const color = COLORS[quality(metric, rawVal)];
        const text = fmt(metric, rawVal);
        return (
          <text
            x={x + width / 2}
            y={y - 6}
            textAnchor="middle"
            fontSize={12}
            fontWeight={700}
            fill={color}
          >
            {text}
          </text>
        );
      };

      return (
        <div
          style={{ width: UI.CHART_W, height: UI.CHART_H, background: "#fff" }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{ top: 24, right: 16, left: 8, bottom: 8 }}
              barCategoryGap={24}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="metric" />
              {/* fixed headroom so labels don’t clip */}
              <YAxis domain={[0, 111]} allowDecimals={false} tickFormatter={(val) => (val === 111 ? '100' : val)}/>
              <Legend
                verticalAlign="top"
                align="center"
                height={28}
                formatter={(v) =>
                  v === "WithNitro"
                    ? "With NitroPack"
                    : v === "WithoutNitro"
                    ? "Without NitroPack"
                    : v
                }
              />
              <Bar
                dataKey="WithNitro"
                fill="#795dff"
                isAnimationActive={false}
                barSize={36}
              >
                <LabelList
                  dataKey="WithNitro"
                  content={labelRenderer("with")}
                />
              </Bar>
              <Bar
                dataKey="WithoutNitro"
                fill="#626262"
                isAnimationActive={false}
                barSize={36}
              >
                <LabelList
                  dataKey="WithoutNitro"
                  content={labelRenderer("without")}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      );
    };
    
  
    const root = ReactDOM.createRoot(container);
    root.render(<Chart />);
  
    await new Promise((r) => setTimeout(r, 120));
    try { window.dispatchEvent(new Event('resize')); } catch {}
    await new Promise((r) => setTimeout(r, 120));
  
    const canvas = await html2canvas(container, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      removeContainer: true,
    });
    const dataUrl = canvas.toDataURL('image/png');
  
    root.unmount();
    document.body.removeChild(container);
    return dataUrl;
  }
  

async function renderGaugesPNGForStrategy(strategyResults) {
  if (!strategyResults) return null;

  const perfWith = Math.round(
    (strategyResults?.withNitro?.lighthouseResult?.categories?.performance?.score || 0) * 100
  ) || 0;

  const perfWithout = Math.round(
    (strategyResults?.withoutNitro?.lighthouseResult?.categories?.performance?.score || 0) * 100
  ) || 0;

  const diff = perfWith - perfWithout;
  const better = diff >= 0;

  const withFull = perfWith >= 99.5;
  const withoutFull = perfWithout >= 99.5;

  const W = UI.GAUGE_SIZE * 2 + UI.GAUGES_CENTER_COL + UI.GAUGES_GAP * 2;
  const H = UI.GAUGE_SIZE + 60;

  const container = document.createElement('div');
  Object.assign(container.style, {
    position: 'fixed',
    left: '-10000px',
    top: '0',
    width: `${W}px`,
    height: `${H}px`,
    background: '#fff',
    pointerEvents: 'none',
    overflow: 'visible',
  });
  document.body.appendChild(container);

  const GaugesForPNG = () => (
    <div
      style={{
        width: W,
        height: H,
        display: 'grid',
        gridTemplateColumns: `1fr ${UI.GAUGES_CENTER_COL}px 1fr`,
        alignItems: 'center',
        gap: UI.GAUGES_GAP,
        background: '#fff',
      }}
    >
      <div style={{ justifySelf: 'center' }}>
        <CircleGauge
          value={perfWith}
          label="With NitroPack"
          progressColor="#15c2b1"
          trackColor="#eaf4f2"
          size={UI.GAUGE_SIZE}
          ringWidth={UI.GAUGE_RING}
          isFull={withFull}
          animate={false}
          animateOnMount={false}
        />
      </div>

      <div style={{ textAlign: 'center', fontFamily: 'Helvetica, Arial, sans-serif' }}>
        <div
          style={{
            fontWeight: 800,
            fontSize: 28,
            lineHeight: 1.1,
            color: better ? '#10b981' : '#ef4444',
          }}
        >
          {Math.abs(diff)}%
        </div>
        <div style={{ color: '#374151', fontSize: 14 }}>
          {better ? 'Better' : 'Worse'}
        </div>
      </div>

      <div style={{ justifySelf: 'center' }}>
        <CircleGauge
          value={perfWithout}
          label="Without NitroPack"
          progressColor="#f59e0b"
          trackColor="#f7efe1"
          size={UI.GAUGE_SIZE}
          ringWidth={UI.GAUGE_RING}
          isFull={withoutFull}
          animate={false}
          animateOnMount={false}
        />
      </div>
    </div>
  );

  const root = ReactDOM.createRoot(container);
  root.render(<GaugesForPNG />);

  await new Promise((r) => setTimeout(r, 120));
  try { window.dispatchEvent(new Event('resize')); } catch {}
  await new Promise((r) => setTimeout(r, 120));

  const canvas = await html2canvas(container, {
    backgroundColor: '#ffffff',
    scale: 2,
    useCORS: true,
    removeContainer: true,
  });
  const dataUrl = canvas.toDataURL('image/png');

  root.unmount();
  document.body.removeChild(container);
  return dataUrl;
}


export default function SpeedSnapshotForm() {
  const [url, setUrl] = useState(""); //Stores the page URL to be tested.
  const [device, setDevice] = useState("both"); //Tracks whether the PSI test will run for mobile or desktop - sending this info to PSI
  const [reportName, setReportName] = useState(""); //for saving or displaying a report name.
  const [results, setResults] = useState(null); //Holds the PSI results for a single-page run.
  const [resultsBulk, setResultsBulk] = useState(null); //Holds results for multiple URLs when running in bulk mode.
  const [activePageKey, setActivePageKey] = useState(null); //Determines which page’s results are currently being shown when bulk mode is on.

  const [loading, setLoading] = useState(false); //Tracks whether a PSI request is in progress to show a spinner/disable buttons.
  const [debugInfo, setDebugInfo] = useState(null); //Stores raw API responses for debugging.
  const [selectedDevice, setSelectedDevice] = useState("mobile"); //which device’s results are being displayed in the report view
  const [loadedFromDb, setLoadedFromDb] = useState(null); //Indicate if the current results were loaded from the database instead of freshly tested.

  const resultsRef = useRef(null); //scroll to results after a search open
  const PSI_API_KEY = process.env.REACT_APP_PSI_API_KEY; //Reads the API key for Google PSI API from environment variables.

  const [caseIdTouched, setCaseIdTouched] = useState(false);
  const [blockedUrls, setBlockedUrls] = useState([]); // Track URLs that were blocked by security systems
  const [autoBulkDetected, setAutoBulkDetected] = useState(false); // Track if auto-bulk was triggered

  // Helper function to detect if an error indicates website blocking
  const isBlockingError = (error) => {
    if (!error || typeof error !== 'string') return false;
    return error.includes('FAILED_DOCUMENT_REQUEST') ||
           error.includes('unable to reliably load') ||
           error.includes('Lighthouse returned error') ||
           error.includes('HTTP 400') ||
           error.includes('Both approaches failed') ||
           error.includes('Website blocking detected');
  };

  // Helper function to detect multiple URLs in a single input
  const detectMultipleUrls = (inputText) => {
    if (!inputText || typeof inputText !== 'string') return [];
    
    // First, decode URL-encoded characters
    let decodedText = inputText;
    try {
      decodedText = decodeURIComponent(inputText);
    } catch (e) {
      // If decoding fails, use original text
      decodedText = inputText;
    }
    
    // Split by spaces, newlines, commas etc
    const separators = /[\s\n,;]+/;
    const potentialUrls = decodedText.split(separators).filter(item => item.trim());
    
    const allPotentialUrls = potentialUrls;
    
    const validUrls = allPotentialUrls.filter(item => {
      const trimmed = item.trim();
      if (!trimmed) return false;
      
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        return true;
      }
      
      // For domains without protocol, must have a proper domain structure
      if (/^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*\.[a-zA-Z]{2,}/.test(trimmed)) {
        return true;
      }
      
      return false;
    });
    
    // Remove duplicates and empty strings
    const uniqueUrls = [...new Set(validUrls.filter(url => url.trim()))];

    // Debug logging
    console.log('[URL-DETECTION] Input:', inputText);
    console.log('[URL-DETECTION] Decoded:', decodedText);
    console.log('[URL-DETECTION] Potential URLs:', potentialUrls);
    console.log('[URL-DETECTION] Valid URLs:', validUrls);
    console.log('[URL-DETECTION] Unique URLs:', uniqueUrls);

    // Only return if we have more than 1 valid URL
    return uniqueUrls.length > 1 ? uniqueUrls : [];
  };
  const chartRefs = {
    mobile: useRef(null),
    desktop: useRef(null),
  };
  const [bulkMode, setBulkMode] = useState(false); //If true, show multiple URL input fields and run tests for each URL in sequence or parallel.
  const [bulkUrls, setBulkUrls] = useState(["", "", "", "", "", ""]);

  const safeNum = (report, id) =>
    Number(report?.lighthouseResult?.audits?.[id]?.numericValue ?? NaN);

  const fmt = {
    s: (v) => `${v.toFixed(2)} s`,
    ms: (v) => `${Math.round(v)} ms`,
    cls: (v) => v.toFixed(3),
  }; //Format numeric values into readable strings for the UI and PDF

  const METRICS = [
    {
      id: "first-contentful-paint",
      label: "FCP",
      unit: "s",
      convert: (v) => v / 1000,
      format: (v) => fmt.s(v),
      tolerance: 0.05,
    },
    {
      id: "largest-contentful-paint",
      label: "LCP",
      unit: "s",
      convert: (v) => v / 1000,
      format: (v) => fmt.s(v),
      tolerance: 0.05,
    },
    {
      id: "total-blocking-time",
      label: "TBT",
      unit: "ms",
      convert: (v) => v,
      format: (v) => fmt.ms(v),
      tolerance: 5,
    },
    {
      id: "cumulative-layout-shift",
      label: "CLS",
      unit: "cls",
      convert: (v) => v,
      format: (v) => fmt.cls(v),
      tolerance: 0.005,
    },
  ];

  //PSI coloring helpers
  const PSI_THRESH = {
    FCP: { good: 1.8, ni: 3.0 },
    LCP: { good: 2.5, ni: 4.0 },
    TBT: { good: 200, ni: 600 },
    CLS: { good: 0.1, ni: 0.25 },
  };

  function psiBand(metricLabel, v) {
    const t = PSI_THRESH[metricLabel];
    const n = Number(v);
    if (!t || !Number.isFinite(n)) return "ni";
    return n <= t.good ? "good" : n <= t.ni ? "ni" : "poor";
  }

  function psiClass(metricLabel, v) {
    return `val-${psiBand(metricLabel, v)}`;
  }

  const compareMetric = (withReport, withoutReport, m) => {
    const rawWith = safeNum(withReport, m.id);
    const rawWithout = safeNum(withoutReport, m.id);
    if (Number.isNaN(rawWith) || Number.isNaN(rawWithout)) return null;
  
    const withVal = m.convert(rawWith);
    const withoutVal = m.convert(rawWithout);
    const delta = withVal - withoutVal;
    const abs = Math.abs(delta);
  
    let deltaText = '';
    let className = '';
    let deltaLabel = '';
    let deltaValue = '';
  
    if (abs > m.tolerance) {
      if (delta < 0) {
        deltaLabel = "Improved by";
        deltaValue = m.format(abs);
        deltaText = `${deltaLabel} ${deltaValue}`;
        className = "delta delta-good";
      } else {
        deltaLabel = "Worsened by";
        deltaValue = m.format(abs);
        deltaText = `${deltaLabel} ${deltaValue}`;
        className = "delta delta-bad";
      }
    }
  
    return {
      withVal,
      withoutVal,
      formatWith: m.format(withVal),
      formatWithout: m.format(withoutVal),
      deltaText,
      className,
      deltaLabel,
      deltaValue,
    };
  };//When the UI renders the metrics table, it takes formatWith, formatWithout, deltaText, and className from here and displays them.

  const buildChartData = (strategyResults) => {
    if (!strategyResults) return [];
    const w = strategyResults.withNitro?.lighthouseResult?.audits || {};
    const wo = strategyResults.withoutNitro?.lighthouseResult?.audits || {};
    const perfWith =
      (strategyResults.withNitro?.lighthouseResult?.categories?.performance
        ?.score || 0) * 100;
    const perfWithout =
      (strategyResults.withoutNitro?.lighthouseResult?.categories?.performance
        ?.score || 0) * 100;

    return [
      {
        metric: "FCP (s)",
        WithNitro:
          Number(w["first-contentful-paint"]?.numericValue || 0) / 1000,
        WithoutNitro:
          Number(wo["first-contentful-paint"]?.numericValue || 0) / 1000,
      },
      {
        metric: "LCP (s)",
        WithNitro:
          Number(w["largest-contentful-paint"]?.numericValue || 0) / 1000,
        WithoutNitro:
          Number(wo["largest-contentful-paint"]?.numericValue || 0) / 1000,
      },
      {
        metric: "TBT (ms)",
        WithNitro: Number(w["total-blocking-time"]?.numericValue || 0),
        WithoutNitro: Number(wo["total-blocking-time"]?.numericValue || 0),
      },
      {
        metric: "CLS",
        WithNitro: Number(w["cumulative-layout-shift"]?.numericValue || 0),
        WithoutNitro: Number(wo["cumulative-layout-shift"]?.numericValue || 0),
      },
      { metric: "Perf. Score", WithNitro: perfWith, WithoutNitro: perfWithout },
    ];
  }; //Turn one device’s results into the array shape charts expects to draw the bars.


  // Visible, PDF bar charts
const CAPS = { 'FCP (s)': 3.0, 'LCP (s)': 4.0, 'TBT (ms)': 400, 'CLS': 0.30, 'Perf. Score': 100 };

const THRESH = {
  'FCP (s)': { good: 1.8, ni: 3.0 },
  'LCP (s)': { good: 2.5, ni: 4.0 },
  'TBT (ms)': { good: 200, ni: 600 },
  'CLS':     { good: 0.10, ni: 0.25 },
  'Perf. Score': { good: 90, ni: 50 },
};

const COLORS = { good: '#10b981', ni: '#f59e0b', poor: '#ef4444' };

function metricQuality(metric, v) {
  const t = THRESH[metric];
  const n = Number(v);
  if (!t || !Number.isFinite(n)) return 'ni';
  if (metric === 'Perf. Score') return n >= t.good ? 'good' : n >= t.ni ? 'ni' : 'poor';
  return n <= t.good ? 'good' : n <= t.ni ? 'ni' : 'poor';
}

function fmtChartValue(metric, v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  if (metric === 'CLS') return n.toFixed(2);
  if (metric.includes('(ms)')) return `${Math.round(n)} ms`;
  if (metric.includes('(s)'))  return `${n.toFixed(2)} s`;
  if (metric.includes('Score')) return `${Math.round(n)}`;
  return String(n);
}


function normalizeForChart(metric, v) {
  const cap = CAPS[metric] ?? 100;
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, (n / cap) * 100));
}

// Turn the existing buildChartData into a display dataset
function rowCap(metric, withRaw, withoutRaw) {
  if (metric === 'Perf. Score') return 100;

  const base = CAPS[metric] ?? 100;
  const maxRaw = Math.max(Number(withRaw) || 0, Number(withoutRaw) || 0);
  return Math.max(base, maxRaw * 1.10);// +10% headroom
}

function makeVisibleChartData(strategyResults) {
  const raw = buildChartData(strategyResults);
  

  return raw.map(r => {
    const cap = rowCap(r.metric, r.WithNitro, r.WithoutNitro);

    const withN = Math.max(0, Math.min(100, (Number(r.WithNitro)   / cap) * 100));
    const withoutN = Math.max(0, Math.min(100, (Number(r.WithoutNitro) / cap) * 100));

    //  zero values will still show a minimum visible bar (2%)
    const minVisibleHeight = 2;
    const finalWithN = withN === 0 ? minVisibleHeight : withN;
    const finalWithoutN = withoutN === 0 ? minVisibleHeight : withoutN;

    return {
      metric: r.metric,
      WithNitro: finalWithN,
      WithoutNitro: finalWithoutN,
      _withRaw: Number(r.WithNitro),
      _withoutRaw: Number(r.WithoutNitro),
    };
  });
}


// Reusable visible chart
function VisualComparisonChart({ data }) {
  const labelRenderer = (series) => (props) => {
    const { x, y, width, index } = props;
    const row = data[index];
    const metric = row?.metric || '';
    const rawVal = series === 'with' ? row._withRaw : row._withoutRaw;
    const color  = COLORS[metricQuality(metric, rawVal)];
    const text   = fmtChartValue(metric, rawVal);
    return (
      <text x={x + width / 2} y={y - 6} textAnchor="middle" fontSize={12} fontWeight={700} fill={color}>
        {text}
      </text>
    );
  };
  

  const tooltipFormatter = (value, name, ctx) => {
    const m = ctx?.payload?.metric || '';
    const raw = name === 'WithNitro' ? ctx?.payload?._withRaw : ctx?.payload?._withoutRaw;
    return [fmtChartValue(m, raw), name === 'WithNitro' ? 'With NitroPack' : 'Without NitroPack'];
  };

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 24, right: 16, left: 8, bottom: 8 }} barCategoryGap={24}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="metric" />
        <YAxis domain={[0, 111]} allowDecimals={false} tickFormatter={(val) => (val === 111 ? '100' : val)}/>
        <Tooltip formatter={tooltipFormatter} labelFormatter={(label) => label} />
        <Legend verticalAlign="top" align="center" height={28}
          formatter={(v) => (v === 'WithNitro' ? 'With NitroPack' : v === 'WithoutNitro' ? 'Without NitroPack' : v)}
        />
        <Bar dataKey="WithNitro" fill="#795dff" isAnimationActive={false} barSize={36}>
          <LabelList dataKey="WithNitro" content={labelRenderer('with')} />
        </Bar>
        <Bar dataKey="WithoutNitro" fill="#626262" isAnimationActive={false} barSize={36}>
          <LabelList dataKey="WithoutNitro" content={labelRenderer('without')} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}


  const stubFromSummary = (row, which) => {
    const suffix = which === "with" ? "with" : "without";
    const perf = Number(row[`perf_${suffix}`]) || 0;
    const fcpS = Number(row[`fcp_${suffix}_s`]) || 0;
    const lcpS = Number(row[`lcp_${suffix}_s`]) || 0;
    const tbt = Number(row[`tbt_${suffix}_ms`]) || 0;
    const cls = Number(row[`cls_${suffix}`]) || 0;

    return {
      lighthouseResult: {
        categories: {
          performance: { score: perf / 100 },
        },
        audits: {
          "first-contentful-paint": { numericValue: fcpS * 1000 },
          "largest-contentful-paint": { numericValue: lcpS * 1000 },
          "total-blocking-time": { numericValue: tbt },
          "cumulative-layout-shift": { numericValue: cls },
          "final-screenshot": { details: { data: null } },
        },
      },
    };
  };
  const asObj = (v) => (typeof v === "object" ? v : v ? JSON.parse(v) : null);

  const buildResultsFromGroup = (rows) => {
    const out = {};
    rows.forEach((r) => {
      const d = String(r.device || "mobile")
        .trim()
        .toLowerCase();

      const withJSON = asObj(r.with_nitro_json) || stubFromSummary(r, "with");
      const withoutJSON =
        asObj(r.without_nitro_json) || stubFromSummary(r, "without");

      out[d] = { withNitro: withJSON, withoutNitro: withoutJSON };
    });
    const meta = rows[0];
    return {
      ...out,
      submittedAt: new Date(meta.created_at),
      reportName: meta.case_id || "",
    };
  }; //Open full run from the search list

  //entry point when we click a search result
  const pickDeviceFrom = (obj) => {
    if (!obj) return "mobile";
    return obj.mobile ? "mobile" : obj.desktop ? "desktop" : "mobile";
  };

  const handleOpenFromSearch = async (payload) => {
    try {
      setResultsBulk(null);
      setActivePageKey(null);
      setResults(null); //clears out any previous report details, so they don’t show stale data while fetching the new one.

      if (payload?.results) {
        const firstRow = payload.rows?.[0] || {};

        const normalized = {};
        if (payload.results.mobile) normalized.mobile = payload.results.mobile;
        if (payload.results.desktop)
          normalized.desktop = payload.results.desktop;
        if (!normalized.mobile && payload.results.Mobile)
          normalized.mobile = payload.results.Mobile;
        if (!normalized.desktop && payload.results.Desktop)
          normalized.desktop = payload.results.Desktop;

        const augmented = {
          ...normalized,
          submittedAt: firstRow.created_at
            ? new Date(firstRow.created_at)
            : payload.results.submittedAt
            ? new Date(payload.results.submittedAt)
            : new Date(),
          reportName: firstRow.case_id || payload.results.reportName || "",
        }; //Adds metadata (submittedAt date, reportName).
        setResults(augmented);
        setSelectedDevice(
          String(payload.focusDevice || pickDeviceFrom(augmented))
            .trim()
            .toLowerCase()
        );
        setLoadedFromDb({ rows: payload.rows || [] });
        if (firstRow.url) setUrl(firstRow.url);
        setTimeout(
          () =>
            resultsRef.current?.scrollIntoView({
              behavior: "smooth",
              block: "start",
            }),
          60
        );
        return;
      }

      if (payload?.withNitro && payload?.withoutNitro) {
        //Raw PSI JSON. Builds the same structure, but only for one device.
        const row = payload.row || {};
        const deviceKey = String(row.device || "mobile")
          .trim()
          .toLowerCase();
        const shaped = {
          [deviceKey]: {
            withNitro: payload.withNitro,
            withoutNitro: payload.withoutNitro,
          },
          submittedAt: row.created_at ? new Date(row.created_at) : new Date(),
          reportName: row.case_id || "",
        };
        setResults(shaped);
        setSelectedDevice(deviceKey);
        setLoadedFromDb({ rows: row ? [row] : [] });
        if (row.url) setUrl(row.url);
        setTimeout(
          () =>
            resultsRef.current?.scrollIntoView({
              behavior: "smooth",
              block: "start",
            }),
          60
        );
        return;
      } //Sets everything as before, but without needing to normalize two devices.

      if (payload?.group_id) {
        const res = await fetch(
          `${GET_URL}?group_id=${encodeURIComponent(payload.group_id)}`
        );
        const rows = await res.json();
        if (!rows || rows.length === 0) return;

        const shaped = buildResultsFromGroup(rows);
        setResults(shaped);
        setSelectedDevice(
          String(payload.device || pickDeviceFrom(shaped))
            .trim()
            .toLowerCase()
        );
        setLoadedFromDb({ rows });
        if (payload.url) setUrl(payload.url);
        setTimeout(
          () =>
            resultsRef.current?.scrollIntoView({
              behavior: "smooth",
              block: "start",
            }),
          60
        );
        return;
      } //Calls the API for all rows in a group.

      console.warn("ReportsSearch.onOpen: unexpected payload", payload);
    } catch (e) {
      console.error("Open from search failed", e);
    }
  };

  const extractSummary = (
    urlValue,
    deviceValue,
    withNitro,
    withoutNitro,
    groupId,
    nitroHeader = null,
    caseId = null
  ) => {
    const w = withNitro?.lighthouseResult;
    const wo = withoutNitro?.lighthouseResult;

    const perf_with = Math.round(
      (w?.categories?.performance?.score || 0) * 100
    );
    const perf_without = Math.round(
      (wo?.categories?.performance?.score || 0) * 100
    );

    const fcp_with_s =
      (safeNum(withNitro, "first-contentful-paint") || 0) / 1000;
    const fcp_without_s =
      (safeNum(withoutNitro, "first-contentful-paint") || 0) / 1000;
    const lcp_with_s =
      (safeNum(withNitro, "largest-contentful-paint") || 0) / 1000;
    const lcp_without_s =
      (safeNum(withoutNitro, "largest-contentful-paint") || 0) / 1000;
    const tbt_with_ms = safeNum(withNitro, "total-blocking-time") || 0;
    const tbt_without_ms = safeNum(withoutNitro, "total-blocking-time") || 0;
    const cls_with = safeNum(withNitro, "cumulative-layout-shift") || 0;
    const cls_without = safeNum(withoutNitro, "cumulative-layout-shift") || 0;

    return {
      group_id: groupId,
      case_id: caseId || null,
      url: urlValue,
      device: deviceValue,
      nitro_header: nitroHeader,
      perf_with,
      perf_without,
      fcp_with_s,
      fcp_without_s,
      lcp_with_s,
      lcp_without_s,
      tbt_with_ms,
      tbt_without_ms,
      cls_with,
      cls_without,
    };
  }; //Convert the big PSI JSON into a compact, DB-friendly row that captures just the key numbers

  async function saveReport(row) {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(row),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Save failed (${res.status}) ${text}`);
    }
    return res.json().catch(() => ({}));
  }

  const runOneUrl = async (theUrl, stratList, groupId, caseId, skipSave = false) => {
    const optimizedURL = theUrl.trim();
    const unoptimizedURL = optimizedURL.includes("?")
      ? `${optimizedURL}&nonitro`
      : `${optimizedURL}?nonitro`; //Prepare the two test URLs, with and without Nitro

    const resultsData = {};
    const debug = {}; //records requested URLs and PSI's final analyzed URLs per device

    await Promise.all(
      stratList.map(async (strat) => {
        const [withNitro, withoutNitro] = await Promise.all([
          fetchPSIReportSmart(optimizedURL, strat, PSI_API_KEY),
          fetchPSIReportSmart(unoptimizedURL, strat, PSI_API_KEY),
        ]); //Run PSI for each device concurrently with smart fallback

        resultsData[strat] = { withNitro, withoutNitro };
        debug[strat] = {
          requested: { withNitro: optimizedURL, withoutNitro: unoptimizedURL },
          final: {
            withNitro:
              withNitro?.lighthouseResult?.finalUrl || withNitro?.id || "(n/a)",
            withoutNitro:
              withoutNitro?.lighthouseResult?.finalUrl ||
              withoutNitro?.id ||
              "(n/a)",
          },
        }; //Store results + debug for UI

        // Only save if not in retry mode or if we have valid PSI data
        if (!skipSave && (withNitro || withoutNitro)) {
          try {
        const row = extractSummary(
          optimizedURL,
          strat,
          withNitro,
          withoutNitro,
          groupId,
          null,
          caseId
        );
        await saveReport(row);
          } catch (saveError) {
            console.warn(`[PSI] Save failed for ${optimizedURL} (${strat}):`, saveError);
            // Continue processing even if save fails
          }
        }
      })
    ); //For every device, we save a single row to the backend with normalized metrics

    return {
      results: { ...resultsData, submittedAt: new Date(), reportName: caseId },
      debug,
    };
  }; //Return all data to the caller

  const handleSubmit = async (e) => {
    e.preventDefault(); //decides which devices to run, single vs bulk mode, handles errors and loading state.

    const strategies = device === "both" ? ["mobile", "desktop"] : [device];

    setResults(null);
    setResultsBulk(null);
    setActivePageKey(null);
    setLoading(true);
    setDebugInfo(null); //Build strategies array from the dropdown. Clear any previous results, turn on the spinner, clear debug.

    try {
      //Decide on the case ID (auto-generate every click unless user typed a custom one)
      const wantAuto = !caseIdTouched || !reportName.trim();
      const desiredId = wantAuto ? "" : reportName.trim();

      const caseId = await getOrMakeCaseId(desiredId);

      if (caseId !== reportName) setReportName(caseId);

      setCaseIdTouched(false);

      if (!bulkMode) {
        const detectedUrls = detectMultipleUrls(url);
        
        if (detectedUrls.length > 1) {
          console.log(`[AUTO-BULK] Detected ${detectedUrls.length} URLs, switching to bulk mode`);
          
          const urlsToUse = detectedUrls.slice(0, 6);//allow max 6 URLs
          const newBulkUrls = [...urlsToUse];
          
          while (newBulkUrls.length < 6) {
            newBulkUrls.push('');
          }
          
          setBulkUrls(newBulkUrls);
          setBulkMode(true);
          setAutoBulkDetected(true);
          
        } else {
        const normalizedUrl = normalizeUrl(url);
        if (!normalizedUrl) {
          setLoading(false);
          alert(
            'Please enter a valid site, e.g. "example.com" or "https://example.com".'
          );
          return;
        }
        const groupId = `${Date.now()}`;
        const { results: singleRes, debug } = await runOneUrl(
          normalizedUrl,
          strategies,
          groupId,
          caseId
        );

        setResults(singleRes);
        setDebugInfo(debug);
        setSelectedDevice(strategies[0]);
        setTimeout(
          () =>
            resultsRef.current?.scrollIntoView({
              behavior: "smooth",
              block: "start",
            }),
          60
        );
        }
      }
      
      // Handle bulk mode
      if (bulkMode) {
        const inputsRaw = bulkUrls.map((s) => s.trim()).filter(Boolean);
        const inputs = inputsRaw.map((u) => normalizeUrl(u)).filter(Boolean);

        if (inputs.length === 0) {
          setLoading(false);
          alert("Please enter at least one valid URL.");
          return;
        }


        const groupBase = Date.now();
        const pageMap = {};

        // Run pages with early failure detection - switch to safe mode when first failure detected
        let safeModeTriggered = false;
        const safeModePages = [];
        
        const promises = inputs.map(async (pageUrl, i) => {
          // Delay the start of each page by 2 seconds to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, i * 2000));
          
          // If safe mode was already triggered, skip this page for now
          if (safeModeTriggered) {
            safeModePages.push(pageUrl);
            return { pageUrl, results: null, debug: null, skipped: true };
          }
          
          const groupId = `${groupBase}-${i + 1}`;
            const pageCaseId = `${caseId}-${i + 1}`;
        
          try {
            const { results: r, debug } = await runOneUrl(
              pageUrl,
              strategies,
              groupId,
              pageCaseId
            );
            
            // Check if this page failed (no PSI data)
            const hasMobile = r.mobile && r.mobile.withNitro && r.mobile.withoutNitro;
            const hasDesktop = r.desktop && r.desktop.withNitro && r.desktop.withoutNitro;
            
            if (!hasMobile && !hasDesktop) {
              // First failure detected - trigger safe mode for remaining pages
              if (!safeModeTriggered) {
                console.log(`[BULK] First failure detected at ${pageUrl} - switching to safe mode for remaining pages...`);
                safeModeTriggered = true;
              }
            }
        
            r.pageUrl = pageUrl;
            return { pageUrl, results: r, debug, success: hasMobile || hasDesktop };
          } catch (error) {
            console.error(`[BULK] Error processing ${pageUrl}:`, error);
            if (!safeModeTriggered) {
              console.log(`[BULK] Error detected at ${pageUrl} - switching to safe mode for remaining pages...`);
              safeModeTriggered = true;
            }
            return { pageUrl, results: null, debug: null, success: false };
          }
        });
        
        const results = await Promise.all(promises);
        results.forEach(({ pageUrl, results: r, debug, skipped }) => {
          if (!skipped && r) {
            pageMap[pageUrl] = { ...r, debug };
          }
        });

        // Process pages that were skipped due to early failure detection
        if (safeModePages.length > 0) {
          console.log(`[BULK] Processing ${safeModePages.length} pages in smart mode (one by one)...`);
          
          for (let i = 0; i < safeModePages.length; i++) {
            const pageUrl = safeModePages[i];
            console.log(`[BULK] Processing ${pageUrl} in smart mode (${i + 1}/${safeModePages.length})...`);
            
            // Wait longer between each page
            if (i > 0) {
              await new Promise(resolve => setTimeout(resolve, 20000 + (i * 10000)));
            }
            
            try {
              const groupId = `${groupBase}-${inputs.indexOf(pageUrl) + 1}`;
              const pageCaseId = `${caseId}-${inputs.indexOf(pageUrl) + 1}`;
              
              const { results: r, debug } = await runOneUrl(
                pageUrl,
                strategies,
                groupId,
                pageCaseId,
                true // Skip save on retry to avoid duplicate saves
              );
              
              r.pageUrl = pageUrl;
              pageMap[pageUrl] = { ...r, debug };
              
              const hasMobile = r.mobile && r.mobile.withNitro && r.mobile.withoutNitro;
              const hasDesktop = r.desktop && r.desktop.withNitro && r.desktop.withoutNitro;
              if (hasMobile || hasDesktop) {
                console.log(`[BULK] Smart mode succeeded for ${pageUrl}`);
              } else {
                console.log(`[BULK] Smart mode failed for ${pageUrl} - likely website blocking`);
              }
            } catch (error) {
              console.error(`[BULK] Smart mode failed for ${pageUrl}:`, error);
            }
          }
        }

        const failedPages = results.filter(({ results: r, skipped }) => {
          if (skipped) return false; // Skip pages that were already processed in safe mode
          if (!r) return true; // Pages that had errors
          
          // Check if both mobile and desktop failed (no PSI data)
          const hasMobile = r.mobile && r.mobile.withNitro && r.mobile.withoutNitro;
          const hasDesktop = r.desktop && r.desktop.withNitro && r.desktop.withoutNitro;
          return !hasMobile && !hasDesktop;
        });

        if (failedPages.length > 0) {
          console.log(`[BULK] ${failedPages.length} additional pages failed - likely website blocking, skipping retries...`);
          
          // Skip retry pages that failed due to website blocking
          const skippedPages = failedPages.map(p => p.pageUrl);
          console.log(`[BULK] Skipping ${skippedPages.length} pages due to website blocking:`, skippedPages);
          
          // Add failed pages to the map with error info
          failedPages.forEach(({ pageUrl }) => {
            pageMap[pageUrl] = {
              mobile: { withNitro: null, withoutNitro: null },
              desktop: { withNitro: null, withoutNitro: null },
              submittedAt: new Date(),
              reportName: `${caseId}-${inputs.indexOf(pageUrl) + 1}`,
              pageUrl,
              error: 'Website blocking detected - PSI cannot access this URL'
            };
          });
        }

        setResultsBulk(pageMap);
        const firstKey = inputs[0];
        setActivePageKey(firstKey);
        setSelectedDevice(strategies[0]);
        setDebugInfo(pageMap[firstKey]?.debug || null);
        setUrl(firstKey);
        setTimeout(
          () =>
            resultsRef.current?.scrollIntoView({
              behavior: "smooth",
              block: "start",
            }),
          60
        );
      }
    } catch (err) {
      console.error(err);
      if (err?.code === "CASE_ID_DUP") {
        alert(err.message);
      } else {
        alert("Saving or PSI failed. See console for details.");
      }
    } finally {
      setLoading(false);
    }
  };

  // PDF Export


  //Format the time Zone
  function formatSofiaTimestamp(ts) {
    const TZ = 'Europe/Sofia';
    const d = new Date(ts);

    const dateStr = new Intl.DateTimeFormat('en-GB', {
      timeZone: TZ,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false
    }).format(d);

    const tzAbbr = new Intl.DateTimeFormat('en-GB', {
      timeZone: TZ, timeZoneName: 'short'
    }).formatToParts(d).find(p => p.type === 'timeZoneName')?.value || 'EET';

    let tzOffset = '';
    try {
      tzOffset = new Intl.DateTimeFormat('en', {
        timeZone: TZ, timeZoneName: 'shortOffset'
      }).formatToParts(d).find(p => p.type === 'timeZoneName')
        ?.value.replace('GMT', 'UTC') || '';
    } catch { /* older browsers: no numeric offset */ }

    return `${dateStr} ${tzAbbr}${tzOffset ? ` (${tzOffset})` : ''}`;
  }

  const exportResultsPDF = async (opts = {}) => {
    const orientation = opts.orientation || "portrait";

    const current = !resultsBulk
      ? results
      : activePageKey
      ? resultsBulk[activePageKey]
      : null;
    const pageUrl = !resultsBulk ? url : activePageKey;
    if (!current) return;

    const doc = new jsPDF({ unit: "pt", format: "a4", orientation });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const marginX = 40;
    const bottomMargin = 40;
    const lineH = 18;

    const title = "Performance Report";
    const runDate = new Date(
      current.submittedAt || Date.now()
    ).toLocaleString();
    const caseId = current.reportName || "—";
    const urlShown = pageUrl || "—";

    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text(title, marginX, 70);

    // where the first device section should begin on page 1
    const firstSectionTop = 110;

    const deviceList = ["desktop", "mobile"].filter((d) => current[d]);

    //Per-device pages
    for (let i = 0; i < deviceList.length; i++) {
      const deviceKey = deviceList[i];
      const data = current[deviceKey];
      if (!data) continue;

      if (i > 0) {
        doc.addPage();
      }

      const headerY = i === 0 ? firstSectionTop : 80;

      // Section header
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text(`${deviceKey.toUpperCase()} Results`, marginX, headerY);

      // URL + Generated time under the section header
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      let y = headerY + 20;
      try {
        // clickable link to the tested URL
        if (urlShown && urlShown !== "—" && doc.textWithLink) {
          doc.setTextColor(33, 111, 219);
          doc.textWithLink(urlShown, marginX, y, { url: urlShown });
        } else {
          doc.text(`URL: ${urlShown}`, marginX, y);
        }
      } catch {
        doc.setTextColor(0, 0, 0);
        doc.text(`URL: ${urlShown}`, marginX, y);
      }
      doc.setTextColor(0, 0, 0);
      const generatedLine = formatSofiaTimestamp(current.submittedAt || Date.now());
      doc.text(`Generated: ${generatedLine}`, marginX, y + lineH);
      y += lineH + 24; // space before gauges

      //Timezone-aware line (Europe/Sofia)
const TZ = 'Europe/Sofia';
const d  = new Date(current.submittedAt || Date.now());

// Date/time in Sofia
const dateStr = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  hour12: false
}).format(d);

//EET / EEST
const tzAbbr = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ, timeZoneName: 'short'
}).formatToParts(d).find(p => p.type === 'timeZoneName')?.value || 'EET';

//UTC+2 / UTC+3 (fallback-safe)
let tzOffset = '';
try {
  tzOffset = new Intl.DateTimeFormat('en', {
    timeZone: TZ, timeZoneName: 'shortOffset'
  }).formatToParts(d).find(p => p.type === 'timeZoneName')?.value.replace('GMT','UTC') || '';
} catch {

}

doc.text(`Generated: ${dateStr} ${tzAbbr}${tzOffset ? ` (${tzOffset})` : ''}`, marginX, y + lineH);

      //GAUGES
      try {
        const gaugesPng = await renderGaugesPNGForStrategy(data);
        if (gaugesPng) {
          const gaugesPxW =
            UI.GAUGE_SIZE * 2 + UI.GAUGES_CENTER_COL + UI.GAUGES_GAP * 2;
          const gaugesPxH = UI.GAUGE_SIZE + 60;
          const [wPt, hPt] = fitPxToPage(gaugesPxW, gaugesPxH, pageW, marginX);
          if (y + hPt > pageH - bottomMargin) {
            doc.addPage();
            y = 60;
          }
          doc.addImage(gaugesPng, "PNG", marginX, y, wPt, hPt);
          y += hPt + 14;
        } else {
          doc.text("Performance gauges unavailable.", marginX, y);
          y += lineH;
        }
      } catch {
        doc.text("Performance gauges unavailable.", marginX, y);
        y += lineH;
      }

      //METRICS TABLE
      const rows = buildChartData(data).map((row) => [
        row.metric,
        row.metric.includes("ms") || row.metric.includes("Score")
          ? Math.round(row.WithNitro)
          : (Number(row.WithNitro) || 0).toFixed(2),
        row.metric.includes("ms") || row.metric.includes("Score")
          ? Math.round(row.WithoutNitro)
          : (Number(row.WithoutNitro) || 0).toFixed(2),
      ]);

      //"Improved by… / Worsened by…" per metric
      const deltaMap = new Map();
      METRICS.forEach((m) => {
        const row = compareMetric(data.withNitro, data.withoutNitro, m);
        if (!row) return;
        const isGood = row.className?.includes("delta-good");
        deltaMap.set((m.label || m.id).toLowerCase(), {
          text: isGood ? row.deltaText : "", // hide worsened text
          good: isGood,
        });
      });

      function getDeltaForTitle(metricTitle) {
        const t = (metricTitle || "").toLowerCase();
        for (const [k, v] of deltaMap.entries()) {
          if (t.startsWith(k)) return v;
        }
        return null;
      }

      //Color helper (keep the existing version if already declared)
      function psiColorFor(metricLabel, rawValue) {
        const n = Number(rawValue);
        if (!Number.isFinite(n)) return [0, 0, 0];
        const is = (s) => metricLabel.toLowerCase().includes(s);
        if (is("fcp")) {
          if (n <= 1.8) return [5, 150, 105];
          if (n <= 3.0) return [245, 158, 11];
          return [220, 38, 38];
        }
        if (is("lcp")) {
          if (n <= 2.5) return [5, 150, 105];
          if (n <= 4.0) return [245, 158, 11];
          return [220, 38, 38];
        }
        if (is("tbt")) {
          if (n <= 200) return [5, 150, 105];
          if (n <= 600) return [245, 158, 11];
          return [220, 38, 38];
        }
        if (is("cls")) {
          if (n <= 0.1) return [5, 150, 105];
          if (n <= 0.25) return [245, 158, 11];
          return [220, 38, 38];
        }
        if (metricLabel.toLowerCase().includes("perf")) {
          if (n >= 90) return [5, 150, 105];
          if (n >= 50) return [245, 158, 11];
          return [220, 38, 38];
        }
        return [0, 0, 0];
      }

      // Tighter, UI-like sizing
      const VAL_FONT_SIZE = 10;
      const DELTA_FONT_SIZE = 8;
      const GAP_PX = 10;
      const BASELINE_NUDGE = -1.5;

      const MINT_TRACK = [234, 244, 242];
      const MINT_LINE = [209, 236, 233];

      autoTable(doc, {
        startY: y,
        margin: { left: marginX, right: marginX },
        head: [["Metric", "With NitroPack", "Without NitroPack"]],
        body: rows,
        theme: "striped",

        styles: {
          font: "helvetica",
          fontStyle: "normal",
          fontSize: VAL_FONT_SIZE,
          lineHeight: 1.25,
          cellPadding: { top: 7, right: 12, bottom: 7, left: 12 },
          valign: "top",
          textColor: [33, 33, 33],
        },
        headStyles: {
          fillColor: [184, 255, 242],
          textColor: 20,
          fontStyle: "bold",
        },
        alternateRowStyles: { fillColor: MINT_TRACK },
        bodyStyles: { minCellHeight: 22 },
        columnStyles: {
          0: { cellWidth: 120 },
          2: { cellWidth: 140 },
        },

        // PSI color for numeric cells
        didParseCell: (c) => {
          if (c.section !== "body") return;
          const col = c.column.index;
          if (col === 0) return;
          const metricLabel = c.row.raw?.[0] || "";
          const raw = c.row.raw?.[col];
          const num = Number(String(raw).replace(/[^\d.]/g, ""));
          if (!Number.isFinite(num)) return;
          const rgb = psiColorFor(metricLabel, num);
          c.cell.styles.textColor = rgb;
          c.cell.styles.fontStyle = "normal";
        },

        didDrawCell: (c) => {
          if (c.section === "body" && c.column.index === 0) {
            const isLast = c.row.index === c.table.body.length - 1;
            if (!isLast) {
              const y = Number(c.cell.y) + Number(c.cell.height);

              const hasTableX = c.table && Number.isFinite(c.table.startX);
              const hasTableW = c.table && Number.isFinite(c.table.width);
              const xLeft = hasTableX ? c.table.startX : Number(c.cell.x);
              const xRight =
                hasTableX && hasTableW
                  ? c.table.startX + c.table.width
                  : Number(c.cell.x) + Number(c.cell.width);

              if (
                Number.isFinite(xLeft) &&
                Number.isFinite(xRight) &&
                Number.isFinite(y)
              ) {
                doc.setDrawColor(MINT_LINE[0], MINT_LINE[1], MINT_LINE[2]);
                doc.setLineWidth(0.6);
                doc.line(xLeft, y, xRight, y);
              }
            }
          }

          if (c.section !== "body" || c.column.index !== 1) return;

          const metricTitle = c.row.raw?.[0] || "";
          const delta = getDeltaForTitle(metricTitle);
          if (!delta?.text) return;

          const padL = c.cell.padding("left") || 0;
          const padR = c.cell.padding("right") || 0;
          const padT = c.cell.padding("top") || 0;

          const valueX = c.cell.x + padL;
          const valueY = c.cell.y + padT + VAL_FONT_SIZE + BASELINE_NUDGE;

          const valueStr =
            c.cell.text && c.cell.text[0]
              ? String(c.cell.text[0])
              : String(c.row.raw?.[1] ?? "");

          const prev = {
            size: doc.getFontSize(),
            font: doc.getFont(),
            color: doc.getTextColor(),
          };

          doc.setFont("helvetica", "normal");
          doc.setFontSize(VAL_FONT_SIZE);
          const valueW = doc.getTextWidth(valueStr);

          doc.setFont("helvetica", "bold");
          doc.setFontSize(DELTA_FONT_SIZE);
          const deltaW = doc.getTextWidth(delta.text);

          const usableW = c.cell.width - padL - padR;

          let dx = valueX + valueW + GAP_PX;
          let dy = valueY;

          if (valueW + GAP_PX + deltaW > usableW) {
            dx = valueX;
            dy = valueY + VAL_FONT_SIZE + 3;
            c.row.height = Math.max(c.row.height, VAL_FONT_SIZE * 2 + 14);
          }

          doc.setTextColor(
            delta.good ? 5 : 220,
            delta.good ? 150 : 38,
            delta.good ? 105 : 38
          );
          doc.text(delta.text, dx, dy);

          doc.setFont(
            prev.font.fontName || "helvetica",
            prev.font.fontStyle || "normal"
          );
          doc.setFontSize(prev.size);
          doc.setTextColor(
            ...(Array.isArray(prev.color) ? prev.color : [0, 0, 0])
          );
        },
      });

      const last = doc.lastAutoTable || doc.autoTable?.previous;
      y = (last ? last.finalY : y) + 32;

      //BAR CHART
      try {
        const chartPng = await renderChartPNGForStrategy(data, buildChartData);
        if (chartPng) {
          const [wPt, hPt] = fitPxToPage(
            UI.CHART_W,
            UI.CHART_H,
            pageW,
            marginX
          );
          if (y + hPt > pageH - bottomMargin) {
            doc.addPage();
            y = 60;
          }
          doc.addImage(chartPng, "PNG", marginX, y, wPt, hPt);
          y += hPt + 12;
        } else {
          doc.text("Chart unavailable.", marginX, y);
          y += lineH;
        }
      } catch {
        doc.text("Chart unavailable.", marginX, y);
        y += lineH;
      }
    }

    const filename = `NitroSnap_${(current.reportName || "report")
      .toString()
      .replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(filename);
  };

  const psiUiUrl = (
    u,
    strat
  ) =>
    `https://pagespeed.web.dev/analysis?url=${encodeURIComponent(
      u
    )}&hl=en&form_factor=${strat}`;

  //Only shown if running in bulk mode
  //On change:Updates the active page key (activePageKey).Updates the current URL in state.
  const renderPageToggle = () => {
    if (!resultsBulk || !Object.keys(resultsBulk).length) return null;
    const keys = Object.keys(resultsBulk);
    return (
      <div className="device-toggle">
        <label>View Page:</label>
        <select
          value={activePageKey || keys[0]}
          onChange={(e) => {
            const k = e.target.value;
            setActivePageKey(k);
            setUrl(k);
            setDebugInfo(resultsBulk[k]?.debug || null);
          }}
        >
          {keys.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </div>
    );
  };

  //Changes selectedDevice state when switched.
  const renderDeviceToggle = (hasBoth) => {
    if (!hasBoth) return null;
    return (
      <div className="device-toggle">
        <label>View Results For:</label>
        <select
          value={selectedDevice}
          onChange={(e) => setSelectedDevice(e.target.value)}
        >
          <option value="mobile">Mobile</option>
          <option value="desktop">Desktop</option>
        </select>
      </div>
    );
  };
  function psiRunHasError(oneRun) {
    if (!oneRun) return true;
    if (oneRun.error) return true;
    const lr = oneRun.lighthouseResult;
    if (!lr) return true;
    const perf = lr?.categories?.performance?.score;
    // treat 0 or missing as error
    return perf == null || perf === 0;
  }
  // Main result display component
  const ResultPanel = ({ data, pageUrl }) => {
    if (!data) return null;

    // Tooltip helpers for the bar charts
    const formatChartValue = (metricLabel, v) => {
      const n = Number(v);
      if (!Number.isFinite(n)) return "—";
      if (metricLabel?.startsWith("TBT") || metricLabel?.startsWith("Perf"))
        return String(Math.round(n));
      if (metricLabel === "CLS") return n.toFixed(3);
      return n.toFixed(2);
    };
    const formatSeriesName = (name) =>
      name === "WithNitro"
        ? "With NitroPack"
        : name === "WithoutNitro"
        ? "Without NitroPack"
        : name;

    // Which device view we’re on
    const hasBoth = data.mobile && data.desktop;
    const strategy = data[selectedDevice]
      ? selectedDevice
      : data.mobile
      ? "mobile"
      : data.desktop
      ? "desktop"
      : "mobile";
    const strategyResults = data?.[strategy];
    const strategyDebug = debugInfo?.[strategy];

    const withErr = psiRunHasError(strategyResults?.withNitro);
    const withoutErr = psiRunHasError(strategyResults?.withoutNitro);
    const anyErr = withErr || withoutErr;

    // Meta + chart data
    const submittedAt =
      data?.submittedAt instanceof Date
        ? data.submittedAt
        : data?.submittedAt
        ? new Date(data.submittedAt)
        : null;

    const perfWith = Math.round(
      (strategyResults?.withNitro?.lighthouseResult?.categories?.performance
        ?.score || 0) * 100
    );
    const perfWithout = Math.round(
      (strategyResults?.withoutNitro?.lighthouseResult?.categories?.performance
        ?.score || 0) * 100
    );
    const diff = perfWith - perfWithout;
    const better = diff >= 0;

    const withFull = perfWith >= 99.5;
    const withoutFull = perfWithout >= 99.5;



    return (
      <div className="results">
        <h2>
          Results for: {pageUrl || url} ({strategy})
        </h2>

        <p>
          <strong>Case ID:</strong> {data.reportName || "—"}
        </p>
        {submittedAt && (
          <p>
            <strong>Submitted at:</strong> {submittedAt.toLocaleString()}
          </p>
        )}

        {strategyDebug && (
          <div className="debug-panel">
            <div>
              <strong>Requested (With Nitro):</strong>{" "}
              {strategyDebug.requested.withNitro}{" "}
              <a
                href={psiUiUrl(strategyDebug.requested.withNitro, strategy)}
                target="_blank"
                rel="noreferrer"
              >
                Open in PSI
              </a>
            </div>
            <div>
              <strong>Requested (Without Nitro):</strong>{" "}
              {strategyDebug.requested.withoutNitro}{" "}
              <a
                href={psiUiUrl(strategyDebug.requested.withoutNitro, strategy)}
                target="_blank"
                rel="noreferrer"
              >
                Open in PSI
              </a>
            </div>
          </div>
        )}

        {renderDeviceToggle(hasBoth)}

        {anyErr && (
          <div className="error-banner">
            ❌ There was an error running PSI{withErr || withoutErr ? ":" : "."}
            <div style={{ marginTop: 6, fontWeight: 500 }}>
              {withErr && (
                <>
                  • With NitroPack failed.{" "}
                    <a
                      href={psiUiUrl(
                      strategyDebug?.requested?.withNitro || pageUrl,
                        strategy
                      )}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        fontWeight: 700,
                        color: "#b91c1c",
                        textDecoration: "underline",
                      }}
                    >
                      Open PSI
                    </a>
                  <br />
                </>
              )}
              {withoutErr && (
                <>
                  • Without NitroPack failed.{" "}
                    <a
                      href={psiUiUrl(
                      strategyDebug?.requested?.withoutNitro || (pageUrl + (pageUrl.includes('?') ? '&' : '?') + 'nonitro'),
                        strategy
                      )}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        fontWeight: 700,
                        color: "#b91c1c",
                        textDecoration: "underline",
                      }}
                    >
                      Open PSI
                    </a>
                </>
              )}
            </div>
            {/* Show blocking explanation if this looks like a security block */}
            {(isBlockingError(withErr) || isBlockingError(withoutErr)) && (
              <div style={{ 
                marginTop: 12, 
                padding: 12, 
                backgroundColor: '#fef3c7', 
                border: '1px solid #f59e0b', 
                borderRadius: 8,
                fontSize: 14
              }}>
                <strong>🔒 Website Security Block Detected</strong><br />
                This website appears to be blocking automated requests from PageSpeed Insights. 
                This is common with sites using Cloudflare or similar security systems.<br />
                <strong>Solution:</strong> Try testing this URL directly in the official PSI tool using the links above.
              </div>
            )}
          </div>
        )}

        {/*Gauges */}
        <div className="gauge-row">
          <div style={{ justifySelf: "center" }}>
            <CircleGauge
              value={perfWith}
              label="With NitroPack"
              progressColor="#15c2b1"
              trackColor="#eaf4f2"
              size={UI.GAUGE_SIZE}
              ringWidth={UI.GAUGE_RING}
              isFull={withFull}
            />
          </div>

          <div
            className={`gauge-delta ${
              better ? "gauge-delta--good" : "gauge-delta--bad"
            }`}
          >
            <div className="delta-num">{Math.abs(diff)}%</div>
            <div className="delta-caption">{better ? "Better" : "Worse"}</div>
          </div>

          <div style={{ justifySelf: "center" }}>
            <CircleGauge
              value={perfWithout}
              label="Without NitroPack"
              progressColor="#f59e0b"
              trackColor="#f7efe1"
              size={UI.GAUGE_SIZE}
              ringWidth={UI.GAUGE_RING}
              isFull={withoutFull}
            />
          </div>
        </div>

        {/* Metrics tables */}
        <div className="comparison">
          <div>
            <table className="metrics-table">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>Value (Δ vs Without)</th>
                </tr>
              </thead>
              <tbody>
                {METRICS.map((m) => {
                  const row = compareMetric(
                    strategyResults?.withNitro,
                    strategyResults?.withoutNitro,
                    m
                  );
                  if (!row) return null;
                  return (
                    <tr key={m.id}>
                      <td>{m.label}</td>
                      <td>
                        <span className="valrow">
                          <span
                            className={`metric-val ${psiClass(
                              m.label,
                              row.withVal
                            )}`}
                          >
                            {row.formatWith}
                          </span>

                          {row.deltaLabel && (
                            <span className={row.className}>
                              {row.deltaLabel}{" "}
                              <span className="num">{row.deltaValue}</span>
                            </span>
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div>
            <table className="metrics-table">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                {METRICS.map((m) => {
                  const row = compareMetric(
                    strategyResults?.withNitro,
                    strategyResults?.withoutNitro,
                    m
                  );
                  if (!row) return null;

                  return (
                    <tr key={m.id}>
                      <td>{m.label}</td>
                      <td>
                        <span
                          className={`metric-val ${psiClass(
                            m.label,
                            row.withoutVal
                          )}`}
                        >
                          {row.formatWithout}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/*Visual Comparison (bar charts)*/}
        <div className="mt-8">
          <h3 className="text-xl font-bold mb-4">Visual Comparison</h3>

          {data.mobile && (
            <div
              ref={chartRefs.mobile}
              className="chart-scroller"
              style={{
                display: !hasBoth || strategy === "mobile" ? "block" : "none",
              }}
            >
              <VisualComparisonChart data={makeVisibleChartData(data.mobile)} />
            </div>
          )}

          {/* Mobile-only note */}
          <p className="chart-scroll-note">
            👉 Scroll sideways to see full comparison
          </p>

          {data.desktop && (
            <div
              ref={chartRefs.desktop}
              className="chart-scroller"
              style={{
                display: !hasBoth || strategy === "desktop" ? "block" : "none",
              }}
            >
              <VisualComparisonChart
                data={makeVisibleChartData(data.desktop)}
              />
            </div>
          )}
        </div>
      </div>
    );
  };

  // render
  return (
    <div className="snapshot-form">
      <h1>NitroSnap - Speed Snapshot</h1>

      {/*Search old reports*/}
      <ReportsSearch onOpen={handleOpenFromSearch} />

      {/*Form. Each input updates its corresponding index in the bulkUrls array.*/}
      <form onSubmit={handleSubmit}>
        {bulkMode ? (
          <div className="bulk-grid">
            {bulkUrls.map((val, i) => (
              <div key={i}>
                <label>Page URL #{i + 1}</label>
                <input
                  type="text"
                  inputMode="url"
                  value={val}
                  onChange={(e) => {
                    const v = e.target.value;
                    setBulkUrls((prev) => {
                      const next = [...prev];
                      next[i] = v;
                      return next;
                    });
                  }}
                  onBlur={(e) => {
                    const n = normalizeUrl(e.target.value);
                    if (n) {
                      setBulkUrls((prev) => {
                        const next = [...prev];
                        next[i] = n;
                        return next;
                      });
                    }
                  }}
                  placeholder="https://example.com"
                />
              </div>
            ))}
          </div>
        ) : (
          <>
            <div>
              <label>Page URL</label>
              <input
                type="text"
                inputMode="url"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  if (!caseIdTouched) setReportName("");
                }}
                onBlur={(e) => {
                  const n = normalizeUrl(e.target.value);
                  if (n) setUrl(n);
                }}
                placeholder="https://example.com"
                required
              />
            </div>
          </>
        )}

        {/*Bulk toggle. Toggling it resets existing results and clears which page is active.*/}
        <div className="bulk-toggle">
          <label className="bulk-label">
            <input
              type="checkbox"
              checked={bulkMode}
              onChange={(e) => {
                const on = e.target.checked;
                setBulkMode(on);
                setResults(null);
                setResultsBulk(null);
                setActivePageKey(null);
                setAutoBulkDetected(false); // Reset auto-bulk detection when manually toggling
              }}
            />
            <span>Run in Bulk (up to 6 URLs)</span>
          </label>
        </div>

        {/* Show auto-bulk detection message */}
        {autoBulkDetected && (
          <div style={{
            margin: '8px 0',
            padding: '8px 12px',
            backgroundColor: '#e0f2fe',
            border: '1px solid #0288d1',
            borderRadius: '6px',
            fontSize: '14px',
            color: '#01579b'
          }}>
            🔄 <strong>Auto-detected multiple URLs</strong> - Automatically switched to bulk mode
          </div>
        )}

        <div>
          <label>Device Type</label>
          <select value={device} onChange={(e) => setDevice(e.target.value)}>
            <option value="mobile">Mobile</option>
            <option value="desktop">Desktop</option>
            <option value="both">Both</option>
          </select>
        </div>

        <div>
          <label>Report Name / Case ID (Optional)</label>
          <input
            type="text"
            value={reportName}
            onChange={(e) => {
              setReportName(e.target.value);
              setCaseIdTouched(Boolean(e.target.value.trim()));
            }}
            placeholder="Case #12345"
          />
        </div>

        <button type="w-full px-4 py-[14px] rounded-[12px] font-extrabold tracking-[0.02em]
            border border-[rgba(5,63,53,0.08)] bg-[var(--accent)] text-[var(--accent-ink)]
            shadow-[0_10px_18px_rgba(184,255,242,0.35)]
            transition-[transform_.04s_ease,box-shadow_.2s_ease,background-color_.15s_ease,filter_.2s_ease]
            hover:bg-[var(--accent-hover)] hover:-translate-y-px hover:shadow-[0_14px_24px_rgba(184,255,242,0.42)]
            active:translate-y-0 active:saturate-[0.98] disabled:opacity-65 disabled:cursor-default
            disabled:translate-y-0 disabled:shadow-none" disabled={loading}>
          {loading ? "Running PSI…" : "Generate Snapshot"}
        </button>
      </form>

      {(results || (resultsBulk && activePageKey)) && (
        <div style={{ margin: "12px 0" }}>
          <button type="button" onClick={exportResultsPDF}>
            Export PDF
          </button>
        </div>
      )}

      {resultsBulk && renderPageToggle()}

      <div ref={resultsRef} />

      {loading && (
        <div className="spinner-overlay">
          <div className="spinner" />
          <div className="spinner-label">Running Lighthouse…</div>
        </div>
      )}

      {!resultsBulk && results && <ResultPanel data={results} pageUrl={url} />}

      {resultsBulk && activePageKey && (
        <>
          {/* Show bulk summary if there are blocked URLs */}
          {(() => {
            const blockedCount = Object.values(resultsBulk).filter(result => 
              result?.error?.includes('Website blocking detected')
            ).length;
            const totalCount = Object.keys(resultsBulk).length;
            
            if (blockedCount > 0) {
              return (
                <div style={{ 
                  margin: '12px 0', 
                  padding: 12, 
                  backgroundColor: '#fef3c7', 
                  border: '1px solid #f59e0b', 
                  borderRadius: 8,
                  fontSize: 14
                }}>
                  <strong>📊 Bulk Test Summary</strong><br />
                  {blockedCount} out of {totalCount} URLs were blocked by website security systems.<br />
                  <strong>Tip:</strong> Try testing blocked URLs directly in the official PSI tool for better results.
                </div>
              );
            }
            return null;
          })()}
        <ResultPanel
          data={resultsBulk[activePageKey]}
          pageUrl={activePageKey}
        />
        </>
      )}
    </div>
  );
}
