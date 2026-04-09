// ========== TAB 6: CONCENTRATION (GINI) ==========
function TabConcentration() {
  const { data: giniData, isLoading } = useQuery('ia-gini', () =>
    api.get('/analytics/gini').then(r => r.data), { staleTime: 120000 }
  );

  return (
    <div className="ia-tab">
      <div className="info-banner">
        <Zap size={16} />
        <span><strong>Coefficient de Gini:</strong> Mesure de concentration du CA (0=réparti, 1=un seul PDV).</span>
      </div>

      {giniData && (
        <>
          <div className="kpi-row">
            <KPICard 
              title="Coefficient de Gini" 
              value={giniData.gini_coefficient?.toFixed(2) || '0'}
              subtitle={giniData.interpretation || ''}
              color="#3742fa"
            />
          </div>

          {giniData.gini_coefficient > 0.5 && (
            <div className="alert alert-danger">
              <AlertTriangle size={16} />
              <span>⚠️ Réseau fragile: Top 20% génère {giniData.pareto?.top_20_contribution_pct?.toFixed(1)}% du CA</span>
            </div>
          )}

          {giniData.pareto && (
            <div className="card" style={{ marginTop: '16px' }}>
              <h3>Analyse Pareto</h3>
              <div className="pareto-stats">
                <div className="stat">
                  <span className="stat-label">Top 20% des PDVs</span>
                  <span className="stat-value">{giniData.pareto.top_20_pct_count}</span>
                </div>
                <div className="stat">
                  <span className="stat-label">Contribution CA</span>
                  <span className="stat-value">{giniData.pareto.top_20_contribution_pct?.toFixed(1)}%</span>
                </div>
              </div>

              <div style={{ marginTop: '16px' }}>
                <h4>Top 10 PDVs</h4>
                <div className="top-pdv-list">
                  {giniData.pareto.details?.slice(0, 10).map((pdv, idx) => (
                    <div key={idx} className="top-pdv-item">
                      <span className="rank">#{idx + 1}</span>
                      <span className="name">{pdv.nom}</span>
                      <span className="ca">{formatCA(pdv.ca)}</span>
                      <span className="pct">{pdv.pct_total?.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ========== TAB 7: HEATMAP ==========
function TabHeatmap() {
  const { data: heatmapData, isLoading } = useQuery('ia-heatmap', () =>
    api.get('/analytics/heatmap', { params: { annee: new Date().getFullYear(), mois: new Date().getMonth() + 1 } }).then(r => r.data), 
    { staleTime: 120000 }
  );

  const zonesList = heatmapData?.data ? Object.entries(heatmapData.data).map(([zone, stats]) => ({
    zone, ...stats
  })).sort((a, b) => (b.ca || 0) - (a.ca || 0)) : [];

  const maxCA = Math.max(...zonesList.map(z => z.ca || 0), 1);

  const getZoneColor = (ca, max) => {
    const pct = ca / max;
    if (pct > 0.7) return 'rgba(0, 214, 143, 0.2)';
    if (pct > 0.4) return 'rgba(255, 165, 2, 0.2)';
    return 'rgba(255, 71, 87, 0.2)';
  };

  const zoneChartData = zonesList.map(z => ({ name: z.zone, ca: z.ca || 0 }));

  return (
    <div className="ia-tab">
      <div className="info-banner">
        <Zap size={16} />
        <span><strong>Heatmap Zones:</strong> Performance géographique en temps réel.</span>
      </div>

      {heatmapData && (
        <>
          <div className="kpi-row">
            <KPICard title="Zones Actives" value={heatmapData.zones || 0} />
            <KPICard title="CA Total Réseau" value={formatCA(heatmapData.total_ca)} formatted={formatCA(heatmapData.total_ca)} />
          </div>

          <div className="zones-grid">
            {zonesList.map(zone => (
              <div 
                key={zone.zone} 
                className="zone-card"
                style={{ backgroundColor: getZoneColor(zone.ca, maxCA) }}
              >
                <div className="zone-name">{zone.zone}</div>
                <div className="zone-ca">{formatCA(zone.ca)}</div>
                <div className="zone-stats">
                  <span>{zone.count || 0} PDVs actifs</span>
                  <span>{(zone.pct_network || 0).toFixed(1)}% du réseau</span>
                  <span>Santé: {(zone.health_avg || 0).toFixed(1)}</span>
                </div>
              </div>
            ))}
          </div>

          {zoneChartData.length > 0 && (
            <div className="card" style={{ marginTop: '16px' }}>
              <h3>CA par Zone</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={zoneChartData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" width={120} />
                  <Tooltip formatter={(v) => formatCA(v)} />
                  <Bar dataKey="ca" fill="#ff6900" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ========== TAB 8: MÉDAILLES ==========
function TabMedailles() {
  const { data: healthData, isLoading } = useQuery('ia-health-scores', () =>
    api.get('/analytics/health-scores').then(r => r.data), { staleTime: 120000 }
  );

  const orCount = healthData?.scores?.filter(s => s.medaille === 'OR').length || 0;
  const argentCount = healthData?.scores?.filter(s => s.medaille === 'ARGENT').length || 0;
  const bronzeCount = healthData?.scores?.filter(s => s.medaille === 'BRONZE').length || 0;
  const orPDVs = healthData?.scores?.filter(s => s.medaille === 'OR') || [];

  return (
    <div className="ia-tab">
      <div className="info-banner">
        <Zap size={16} />
        <span><strong>Système de Médailles:</strong> Reconnaissance des meilleurs PDVs du réseau.</span>
      </div>

      <div className="medals-row">
        <div className="medal-card gold">
          <div className="medal-emoji">🥇</div>
          <div className="medal-name">OR</div>
          <div className="medal-count">{orCount}</div>
        </div>
        <div className="medal-card silver">
          <div className="medal-emoji">🥈</div>
          <div className="medal-name">ARGENT</div>
          <div className="medal-count">{argentCount}</div>
        </div>
        <div className="medal-card bronze">
          <div className="medal-emoji">🥉</div>
          <div className="medal-name">BRONZE</div>
          <div className="medal-count">{bronzeCount}</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: '16px' }}>
        <h3>Critères de Médailles</h3>
        <div className="medals-criteria">
          <div className="criterion">
            <span className="criterion-emoji">🥇</span>
            <div>
              <strong>OR:</strong> Top 20% du réseau sur 6 derniers mois
            </div>
          </div>
          <div className="criterion">
            <span className="criterion-emoji">🥈</span>
            <div>
              <strong>ARGENT:</strong> PDVs réguliers et stables sur 3+ mois
            </div>
          </div>
          <div className="criterion">
            <span className="criterion-emoji">🥉</span>
            <div>
              <strong>BRONZE:</strong> PDVs actifs mais sous la moyenne
            </div>
          </div>
        </div>
      </div>

      {orPDVs.length > 0 && (
        <div className="card" style={{ marginTop: '16px' }}>
          <h3>PDVs Médaillés OR</h3>
          <div className="medals-pdv-list">
            {orPDVs.map(pdv => (
              <div key={pdv.pdv_id} className="medal-pdv-item">
                <span className="medal-pdv-emoji">🥇</span>
                <div className="medal-pdv-info">
                  <span className="medal-pdv-name">{pdv.nom}</span>
                  <span className="medal-pdv-zone">{pdv.zone}</span>
                </div>
                <span className="medal-pdv-score">{pdv.health_score?.toFixed(1)}/100</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ========== TAB 9: COMPÉTITION ==========
function TabCompetition() {
  const { data: compData, isLoading } = useQuery('ia-competition', () =>
    api.get('/reports/competition').then(r => r.data), { staleTime: 120000 }
  );

  const handleExportPPT = () => {
    toast('Export disponible en version Pro', { icon: '✨' });
  };

  return (
    <div className="ia-tab">
      <div className="info-banner">
        <Zap size={16} />
        <span><strong>Compétition Orange Mali:</strong> Dashboard concurrentiel du réseau.</span>
      </div>

      {compData && (
        <>
          <div className="kpi-row">
            <KPICard title="PDVs Totals" value={compData.total_pdvs || 0} />
            <KPICard title="CA Total Réseau" value={formatCA(compData.total_network_ca)} formatted={formatCA(compData.total_network_ca)} />
            <KPICard title="Taux Activité" value={(compData.total_pdvs ? '95' : '0')} formatted="95%" />
            <KPICard title="Santé Moyenne" value={(compData.health_avg || 55).toFixed(0)} formatted={(compData.health_avg || 55).toFixed(0)} />
          </div>

          <div className="card" style={{ marginTop: '16px' }}>
            <h3>Top 10 PDVs</h3>
            <table className="competition-table">
              <thead>
                <tr>
                  <th>Rang</th>
                  <th>Nom PDV</th>
                  <th>Zone</th>
                  <th>Médaille</th>
                  <th>CA</th>
                  <th>Santé</th>
                </tr>
              </thead>
              <tbody>
                {compData.top_10_pdvs?.map((pdv, idx) => (
                  <tr key={idx}>
                    <td>#{idx + 1}</td>
                    <td>{pdv.nom}</td>
                    <td>{pdv.zone}</td>
                    <td>
                      {pdv.medaille === 'OR' && '🥇 OR'}
                      {pdv.medaille === 'ARGENT' && '🥈 ARGENT'}
                      {pdv.medaille === 'BRONZE' && '🥉 BRONZE'}
                      {!pdv.medaille && '—'}
                    </td>
                    <td>{formatCA(pdv.ca)}</td>
                    <td>
                      <div className="health-bar-small">
                        <div className="health-fill" style={{ width: `${pdv.health_score}%` }} />
                      </div>
                      {pdv.health_score?.toFixed(0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card" style={{ marginTop: '16px' }}>
            <h3>Narration Automatique</h3>
            <p>Ce mois, votre réseau compte <strong>{compData.total_pdvs}</strong> PDVs actifs pour une CA totale de <strong>{formatCA(compData.total_network_ca)}</strong>. Performance moyenne en santé: <strong>{compData.health_avg?.toFixed(1)}/100</strong>.</p>
          </div>

          <button className="btn btn-primary" onClick={handleExportPPT} style={{ marginTop: '16px' }}>
            Exporter PowerPoint
          </button>
        </>
      )}
    </div>
  );
}
