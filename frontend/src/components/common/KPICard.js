import React, { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import './KPICard.css';

export default function KPICard({ title, value, formatted, subtitle, icon: Icon, trend, trendValue, color = '#FF6900', loading = false }) {
  const [displayValue, setDisplayValue] = useState(0);
  const numericValue = typeof value === 'number' ? value : parseFloat(String(value).replace(/[^0-9.-]/g, '')) || 0;

  useEffect(() => {
    if (loading || numericValue === 0) return;
    let start = 0;
    const duration = 600;
    const steps = 30;
    const increment = numericValue / steps;
    let step = 0;
    const timer = setInterval(() => {
      step++;
      start += increment;
      if (step >= steps) { setDisplayValue(numericValue); clearInterval(timer); }
      else setDisplayValue(Math.floor(start));
    }, duration / steps);
    return () => clearInterval(timer);
  }, [numericValue, loading]);

  const displayFormatted = formatted || (typeof value === 'string' ? value : displayValue.toLocaleString('en-US').replace(/,/g, ' '));

  return (
    <div className="kpi-card" style={{ '--kpi-color': color }}>
      <div className="kpi-top">
        <span className="kpi-title">{title}</span>
        {Icon && (
          <div className="kpi-icon-wrap">
            <Icon size={18} />
          </div>
        )}
      </div>

      {loading ? (
        <>
          <div className="skeleton" style={{ height: 36, width: '70%', marginTop: 12 }} />
          <div className="skeleton" style={{ height: 14, width: '50%', marginTop: 8 }} />
        </>
      ) : (
        <>
          <div className="kpi-value" style={{ fontSize: displayFormatted.length > 20 ? '16px' : displayFormatted.length > 15 ? '18px' : '22px', lineHeight: 1.2, wordBreak: 'keep-all', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {displayFormatted.includes('FCFA') ? (
              <>
                <span>{displayFormatted.replace(' FCFA', '')}</span>
                <span style={{ fontSize: '11px', display: 'block', color: 'var(--text-secondary)', fontWeight: 500, marginTop: 2 }}>FCFA</span>
              </>
            ) : displayFormatted}
          </div>
          {subtitle && <div className="kpi-subtitle">{subtitle}</div>}
          {trend !== undefined && trendValue !== undefined && (
            <div className={`kpi-trend ${trend >= 0 ? 'up' : 'down'}`}>
              {trend >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
              <span>{Math.abs(trendValue)}% vs mois préc.</span>
            </div>
          )}
        </>
      )}
      <div className="kpi-glow" />
    </div>
  );
}
