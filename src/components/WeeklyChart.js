'use strict';
import React from 'react';

export default function WeeklyChart({ data = [] }) {
  if (!data || data.length === 0) {
    return (
      <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
        데이터가 없습니다.
      </div>
    );
  }

  const height = 180;
  const width = 500;
  const padding = { top: 20, right: 20, bottom: 30, left: 30 };

  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Find max value for Y scaling
  const maxVal = Math.max(...data.map(d => d.count), 5); // Minimum y-axis max is 5
  const yMax = Math.ceil(maxVal / 5) * 5; // Round to nearest 5

  // Map data to x, y coordinates
  const points = data.map((d, index) => {
    const x = padding.left + (data.length > 1 ? (index / (data.length - 1)) * chartWidth : chartWidth / 2);
    const y = padding.top + chartHeight - (d.count / yMax) * chartHeight;
    // Mock a second line representing "정상 출근" (지각 제외 출근) for Werker-style dual curve effect
    const onTimeCount = Math.max(0, d.count - Math.floor(d.count * 0.15)); // approx 15% late
    const y2 = padding.top + chartHeight - (onTimeCount / yMax) * chartHeight;
    return { x, y, y2, onTimeCount, ...d };
  });

  // Create SVG path for line 1 (Total Attendance - Blue)
  let linePath = '';
  let areaPath = '';
  
  // Create SVG path for line 2 (On Time Attendance - Green)
  let linePath2 = '';
  let areaPath2 = '';
  
  if (points.length > 0) {
    if (points.length === 1) {
      linePath = `M ${points[0].x - 10} ${points[0].y} L ${points[0].x + 10} ${points[0].y}`;
      areaPath = `M ${points[0].x - 10} ${padding.top + chartHeight} L ${points[0].x - 10} ${points[0].y} L ${points[0].x + 10} ${points[0].y} L ${points[0].x + 10} ${padding.top + chartHeight} Z`;
      
      linePath2 = `M ${points[0].x - 10} ${points[0].y2} L ${points[0].x + 10} ${points[0].y2}`;
      areaPath2 = `M ${points[0].x - 10} ${padding.top + chartHeight} L ${points[0].x - 10} ${points[0].y2} L ${points[0].x + 10} ${points[0].y2} L ${points[0].x + 10} ${padding.top + chartHeight} Z`;
    } else {
      linePath = `M ${points[0].x} ${points[0].y}`;
      areaPath = `M ${points[0].x} ${padding.top + chartHeight} L ${points[0].x} ${points[0].y}`;
      
      linePath2 = `M ${points[0].x} ${points[0].y2}`;
      areaPath2 = `M ${points[0].x} ${padding.top + chartHeight} L ${points[0].x} ${points[0].y2}`;
      
      for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        
        // Curve control points for Line 1 (Blue)
        const cpX1 = prev.x + (curr.x - prev.x) / 3;
        const cpY1 = prev.y;
        const cpX2 = prev.x + 2 * (curr.x - prev.x) / 3;
        const cpY2 = curr.y;
        
        linePath += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${curr.x} ${curr.y}`;
        areaPath += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${curr.x} ${curr.y}`;
        
        // Curve control points for Line 2 (Green)
        const cpY1_2 = prev.y2;
        const cpY2_2 = curr.y2;
        linePath2 += ` C ${cpX1} ${cpY1_2}, ${cpX2} ${cpY2_2}, ${curr.x} ${curr.y2}`;
        areaPath2 += ` C ${cpX1} ${cpY1_2}, ${cpX2} ${cpY2_2}, ${curr.x} ${curr.y2}`;
      }
      
      areaPath += ` L ${points[points.length - 1].x} ${padding.top + chartHeight} Z`;
      areaPath2 += ` L ${points[points.length - 1].x} ${padding.top + chartHeight} Z`;
    }
  }

  // Y-axis grid ticks
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(ratio => Math.round(yMax * ratio));

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} style={{ overflow: 'visible' }}>
        <defs>
          {/* Blue Line Gradient */}
          <linearGradient id="chartGradientBlue" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.0" />
          </linearGradient>
          {/* Green Line Gradient */}
          <linearGradient id="chartGradientGreen" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10B981" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#10B981" stopOpacity="0.0" />
          </linearGradient>
          {/* Glow Filters */}
          <filter id="glowBlue" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <filter id="glowGreen" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Y-Axis Grid Lines */}
        {yTicks.map((tick, i) => {
          const y = padding.top + chartHeight - (tick / yMax) * chartHeight;
          return (
            <g key={i}>
              <line
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                style={{ stroke: 'var(--chart-grid)' }}
                strokeWidth="1"
              />
              <text
                x={padding.left - 8}
                y={y + 3}
                style={{ fill: 'var(--text-3)' }}
                fontSize="8.5"
                fontWeight="600"
                textAnchor="end"
                fontFamily="inherit"
              >
                {tick}
              </text>
            </g>
          );
        })}

        {/* X-Axis Labels */}
        {points.map((pt, i) => (
          <text
            key={i}
            x={pt.x}
            y={height - 6}
            style={{ fill: 'var(--text-2)' }}
            fontSize="8.5"
            fontWeight="600"
            textAnchor="middle"
            fontFamily="inherit"
          >
            {pt.date} ({pt.dayName})
          </text>
        ))}

        {/* Gradient Area Fills */}
        {areaPath && (
          <path 
            d={areaPath} 
            fill="url(#chartGradientBlue)" 
          />
        )}
        {areaPath2 && (
          <path 
            d={areaPath2} 
            fill="url(#chartGradientGreen)" 
          />
        )}

        {/* Curved Paths */}
        {linePath2 && (
          <path 
            d={linePath2} 
            fill="none" 
            stroke="#10B981" 
            strokeWidth="1.8"
            filter="url(#glowGreen)"
            opacity="0.85"
            style={{ transition: 'all 0.5s ease' }}
          />
        )}
        {linePath && (
          <path 
            d={linePath} 
            fill="none" 
            stroke="#3B82F6" 
            strokeWidth="2.2"
            filter="url(#glowBlue)"
            style={{ transition: 'all 0.5s ease' }}
          />
        )}

        {/* Points & Hover Indicators (Using Blue Line) */}
        {points.map((pt, i) => (
          <g key={i} className="chart-point-group" style={{ cursor: 'pointer' }}>
            <circle 
              cx={pt.x} 
              cy={pt.y} 
              r="6" 
              fill="rgba(59, 130, 246, 0.25)" 
              opacity="0" 
              style={{ transition: 'opacity 0.2s ease' }}
              className="point-halo"
            />
            <circle 
              cx={pt.x} 
              cy={pt.y} 
              r="3" 
              fill="#FFFFFF" 
              stroke="#3B82F6" 
              strokeWidth="2" 
            />
            {/* Tooltip on hover */}
            <g className="point-tooltip" style={{ opacity: 0, transition: 'opacity 0.2s ease', pointerEvents: 'none' }}>
              <rect
                x={pt.x - 50}
                y={pt.y - 38}
                width="100"
                height="26"
                rx="6"
                style={{ fill: 'var(--bg-card-2)', stroke: 'var(--border-hover)' }}
                strokeWidth="1"
              />
              <text
                x={pt.x}
                y={pt.y - 22}
                style={{ fill: 'var(--text-1)' }}
                fontSize="8.5"
                fontWeight="700"
                textAnchor="middle"
              >
                출근: {pt.count}명 ({pt.rate}%)
              </text>
            </g>
          </g>
        ))}
      </svg>
      
      {/* Styles for hover effect */}
      <style jsx>{`
        .chart-point-group:hover .point-halo {
          opacity: 1 !important;
        }
        .chart-point-group:hover .point-tooltip {
          opacity: 1 !important;
        }
      `}</style>
    </div>
  );
}
