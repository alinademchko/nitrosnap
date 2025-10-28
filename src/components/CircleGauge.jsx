import React, { useEffect, useState } from 'react';

export default function CircleGauge({
  value = 0,
  label = '',
  size = 240,
  ringWidth = 18,
  trackColor = '#eef2f7',
  progressColor = '#2dd4bf',
  animate = true,
  animateOnMount = true,
  isFull = false,
  className = '',
}) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  const r = (size - ringWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const C = 2 * Math.PI * r;

  const targetOffset = C * (1 - pct / 100);

  const [mounted, setMounted] = React.useState(!animateOnMount);
  React.useEffect(() => {
    if (animateOnMount) {
      const t = setTimeout(() => setMounted(true), 0);
      return () => clearTimeout(t);
    }
  }, [animateOnMount]);

  const forceFull = isFull || pct >= 100;

  const dashOffsetRaw = forceFull ? 0 : targetOffset;
  const dashOffset = animate ? (mounted ? dashOffsetRaw : C) : dashOffsetRaw;
  const lineCap = forceFull ? 'butt' : 'round';

  return (
    <div className={`gauge ${className || ''}`} style={{ width: size, height: size }}>
      <svg className="gauge__svg" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={r} stroke={trackColor} strokeWidth={ringWidth} fill="none" />
        <g transform={`rotate(-90 ${cx} ${cy})`}>
          <circle
            cx={cx} cy={cy} r={r}
            stroke={progressColor}
            strokeWidth={ringWidth}
            strokeLinecap={lineCap}
            fill="none"
            strokeDasharray={C}
            strokeDashoffset={dashOffset}
            style={{ transition: animate ? 'stroke-dashoffset 1.1s ease-in-out' : 'none' }}
          />
        </g>
      </svg>
      <div className="absolute inset-0 flex flex-col text-center items-center justify-center">
        <div className="font-bold text-[42px] leading-[1.1] text-percentage">{pct}</div>
        {label && <div className="mt-1 text-[16px] font-normal leading-none tracking-[0] text-[#1b024e]">{label}</div>}
      </div>
    </div>
  );
}


