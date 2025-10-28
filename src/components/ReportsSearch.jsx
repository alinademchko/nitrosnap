import React, { useState } from 'react';
import './ReportsSearch.css';

const API_BASE =
  process.env.NODE_ENV === 'development'
    ? 'https://darkturquoise-antelope-174249.hostingersite.com'
    : '';

const GET_URL = `${API_BASE}/api/get_report.php`;

export default function ReportsSearch({ onOpen }) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [searched, setSearched] = useState(false);
  const [showAll, setShowAll] = useState(false); // State for show more/less toggle

  async function request(paramsObj) {
    const params = new URLSearchParams(paramsObj);
    const res = await fetch(`${GET_URL}?${params.toString()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json().catch(() => []);
  }//Accepts a plain object 123 etc., converts it to a query string, Tries to parse JSON; on parse failure returns an empty array (so the UI doesn’t crash).

  //The search flow
  async function doSearch(e) {
    e.preventDefault();
    setErr('');
    const needle = q.trim();
    if (!needle) return;
  
    setSearched(true);//mark that a search was run
    setLoading(true);
    setShowAll(false);// Reset showAll state on new search
    try {
      let rows = [];
      const params = { limit: 100 }; // Request up to 100 results
      if (/^\d+$/.test(needle)) {
        rows = await request({ case_id: needle, ...params });
        if (!rows || (Array.isArray(rows) && rows.length === 0)) {
          rows = await request({ id: needle });// fallback if no case_id match
        }
      } else if (/^https?:\/\//i.test(needle)) {
        rows = await request({ url: needle, ...params });// full URL search
      } else {
        rows = await request({ case_id: needle, ...params });// default: case_id
      }
      setItems(Array.isArray(rows) ? rows : rows ? [rows] : []);
    } catch (e) {
      console.error('Search failed:', e);
      setErr('Could not load results. Please try again.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }//Normalize to an array so the UI can map cleanly

  function openFullRun(row) {
    if (!row?.group_id) return;
    onOpen?.({
      group_id: row.group_id,
      device: row.device || 'mobile',
      url: row.url || '',
    });
  }


//Rendering: form + results
  return (
    <section className="my-6 mb-8 py-4 border-b border-[rgba(0,0,0,0.06)]">
      <h2 className="text-[28px] leading-[1.25] mb-1">Find Previous Reports</h2>
      <p className="mb-4 text-[#6b7280]">
        Enter a <b>Case ID</b>, a full <b>URL</b>, or a numeric <b>Report ID</b>
        .
      </p>

      <form onSubmit={doSearch} className="w-full">
        <div className="flex items-center gap-2.5 bg-white border border[#e5e7eb] rounded-[14px] p-2.5 shadow-[0_8px_22px_rgba(17,24,39,0.06)]">
          <span className="text-[16px] opacity-70 ml-1.5" aria-hidden>
            🔎
          </span>
          <input
            className="flex-1 min-w-[120px] text-base border-0 outline-none py-2.5 px-2"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSearched(false);
              if (items !== null) setItems(null);
            }}
            placeholder="Case ID, URL, or numeric Report ID"
            aria-label="Search previous reports"
          />
          <button
            type="submit"
            className="flex-[0_0_50%] w-full px-4 py-[14px] rounded-[12px] font-extrabold tracking-[0.02em]
            border border-[rgba(5,63,53,0.08)] bg-[var(--accent)] text-[var(--accent-ink)]
            shadow-[0_10px_18px_rgba(184,255,242,0.35)]
            transition-[transform_.04s_ease,box-shadow_.2s_ease,background-color_.15s_ease,filter_.2s_ease]
            hover:bg-[var(--accent-hover)] hover:-translate-y-px hover:shadow-[0_14px_24px_rgba(184,255,242,0.42)]
            active:translate-y-0 active:saturate-[0.98] disabled:opacity-65 disabled:cursor-default
            disabled:translate-y-0 disabled:shadow-none"
            disabled={loading}
            aria-busy={loading ? "true" : "false"}
          >
            {loading ? "Searching…" : "Search"}
          </button>
        </div>
        {err && (
          <div
            className="mt-2.5 text-[#b91c1c] bg-[#fee2e2] border border-[#fecaca]
        py-2 px-2.5 rounded-[10px]"
          >
            {err}
          </div>
        )}
      </form>

      {Array.isArray(items) && items.length > 0 && (
        <>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3 mt-5 list-none p-0">
            {(showAll ? items : items.slice(0, 6)).map((r) => (
              <li
                key={r.id}
                className="text-left py-3 px-[14px] border border-[#e5e7eb] rounded-[14px] bg-white 
                cursor-pointer shadow-[0_8px_22px_rgba(17,24,39,0.05)] transition duration-150 ease-out
                hover:-translate-y-px hover:shadow-[0_12px_26px_rgba(17,24,39,0.09)]"
                role="button"
                tabIndex={0}
                onClick={() => openFullRun(r)}
                onKeyDown={(e) =>
                  (e.key === "Enter" || e.key === " ") && openFullRun(r)
                }
                title="Open this report (load the full run)"
              >
                <div className="flex items-center gap-2 mb-1.5 flex-nowrap whitespace-nowrap overflow-hidden min-h-[22px]">
                  <span className="min-w-0 max-w-[45%] truncate bg-[#f1f5f9] text-[#0f172a] rounded-full py-0.5 px-2 font-bold capitalize">
                    {(r.device || "mobile").toLowerCase()}
                  </span>
                  {r.case_id ? (
                    <span className="min-w-0 max-w-[45%] truncate rounded-full bg-[#eef2ff] text-[#3730a3] py-0.5 px-2 font-semibold">Case: {r.case_id}</span>
                  ) : null}
                  <span className="min-w-0 max-w-[45%] truncate rounded-full bg-[#eef2ff] text-[#3730a3] py-0.5 px-2 font-semibold">ID: {r.id}</span>
                  <span className="ml-auto text-xs text-[#6b7280]">
                    {new Date(r.created_at).toLocaleString()}
                  </span>
                </div>

                <div className="text-[14px] text-[#111827] overflow-hidden text-ellipsis whitespace-nowrap mb-[6px]">{r.url}</div>

                <div className="flex gap-2.5 items-center font-semibold">
                  <span className="text-[13px] text-[#059669]">With: {r.perf_with}</span>
                  <span className="text-[13px] text-[#dc2626]">
                    Without: {r.perf_without}
                  </span>
                </div>
              </li>
            ))}
          </ul>

          {/* Show more/less button if there are more than 6 results */}
          {items.length > 6 && (
            <div className="mt-4">
              <button
                className="inline-block w-full py-[14px] px-4 bg-[var(--accent)]
                text-[var(--accent-ink)] border border-[rgba(5,63,53,.08)] rounded-[12px]
                font-extrabold tracking-[0.02em] cursor-pointer transition: all 200ms ease-in-out
                shadow-[0_10px_18px_rgba(184,255,242,.35)] hover:bg-[var(--accent-hover)] hover:-translate-y-[1px] hover:shadow-[0_14px_24px_rgba(184,255,242,.42)]
                active:translate-y-0 active:saturate-[0.98] disabled:opacity-65 disabled:cursor-default disabled:transform-none disabled:shadow-none"
                onClick={() => setShowAll(!showAll)}
                type="button"
              >
                {showAll ? "Show less" : `Show all ${items.length}`}
              </button>
            </div>
          )}
        </>
      )}

      {searched &&
        !loading &&
        Array.isArray(items) &&
        items.length === 0 &&
        q.trim() &&
        !err && (
          <div className="search__hint" style={{ marginTop: 8 }}>
            No results for “{q.trim()}”.
          </div>
        )}
    </section>
  );
}
