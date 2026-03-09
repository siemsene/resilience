import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, onSnapshot, collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { useGame } from '../../contexts/GameContext';
import type { SessionDoc, PlayerStateDoc, Country } from '../../types';
import { SUPPLIER_KEYS, SUPPLIER_COUNTRY } from '../../types';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceArea,
} from 'recharts';
import s from '../../styles/shared.module.css';
import styles from './ResultsPage.module.css';

export function ResultsPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { clearPlayerIdentity } = useGame();
  const [session, setSession] = useState<SessionDoc | null>(null);
  const [playerStates, setPlayerStates] = useState<PlayerStateDoc[]>([]);
  const [playersLoaded, setPlayersLoaded] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sessionId) return;
    const unsub = onSnapshot(doc(db, 'sessions', sessionId), (snap) => {
      if (snap.exists()) {
        setSession({ id: snap.id, ...snap.data() } as SessionDoc);
      }
    });
    return unsub;
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    getDocs(collection(db, 'sessions', sessionId, 'playerStates')).then(snap => {
      setPlayerStates(snap.docs.map(d => d.data() as PlayerStateDoc));
      setPlayersLoaded(true);
    });
  }, [sessionId]);

  if (!session || !playersLoaded) {
    return <div className={s.loadingPage}><div className={s.spinner} /> Loading results...</div>;
  }

  if (playerStates.length === 0) {
    return (
      <div className={s.pageContainer}>
        <div className={s.card} style={{ textAlign: 'center' }}>
          <h2>No Results Available</h2>
          <p style={{ color: 'var(--text-secondary)', marginTop: '8px' }}>
            This session ended before player result data was generated.
          </p>
          <button className={s.btnPrimary} style={{ marginTop: '16px' }} onClick={() => navigate('/')}>
            Return Home
          </button>
        </div>
      </div>
    );
  }

  const sorted = [...playerStates].sort((a, b) => b.cash - a.cash);
  type ChartPoint = { round: number; [key: string]: number };

  // Build chart data
  const rounds = sorted[0]?.roundHistory?.length || 0;
  const cashData = Array.from({ length: rounds }, (_, i) => {
    const entry: ChartPoint = { round: i + 1 };
    sorted.forEach(p => {
      entry[p.playerName] = p.roundHistory[i]?.cash || 0;
    });
    return entry;
  });

  const demandData = Array.from({ length: rounds }, (_, i) => {
    const entry: ChartPoint = { round: i + 1 };
    sorted.forEach(p => {
      entry[p.playerName] = p.roundHistory[i]?.marketDemand || 0;
    });
    return entry;
  });

  // China source percentage
  const chinaData = Array.from({ length: rounds }, (_, i) => {
    const entry: ChartPoint = { round: i + 1 };
    sorted.forEach(p => {
      const h = p.roundHistory[i];
      if (h) {
        const totalOrdered = SUPPLIER_KEYS.reduce((sum, k) => sum + h.orders[k], 0);
        const chinaOrdered = SUPPLIER_KEYS
          .filter(k => SUPPLIER_COUNTRY[k] === 'china')
          .reduce((sum, k) => sum + h.orders[k], 0);
        entry[p.playerName] = totalOrdered > 0 ? Math.round((chinaOrdered / totalOrdered) * 100) : 0;
      }
      return entry;
    });
    return entry;
  });

  const colors = ['#2980b9', '#c0392b', '#27ae60', '#e67e22', '#8e44ad', '#16a085', '#d35400', '#2c3e50'];

  // Disruption areas
  const disruptionAreas: { country: Country; start: number; end: number }[] = [];
  for (const country of ['china', 'mexico', 'us'] as Country[]) {
    for (const start of session.disruptionSchedule[country] || []) {
      disruptionAreas.push({
        country,
        start,
        end: start + session.params.disruptionDuration - 1,
      });
    }
  }

  const exportCSV = () => {
    const headers = ['Player', 'Round', ...SUPPLIER_KEYS.map(k => `Order_${k}`), ...SUPPLIER_KEYS.map(k => `Alloc_${k}`),
      'Arrivals', 'Demand', 'Sold', 'Unmet', 'ExtraGained', 'Revenue', 'OrderCosts', 'HoldingCosts', 'Profit', 'Inventory', 'Cash', 'MarketDemand'];

    const rows = sorted.flatMap(p =>
      p.roundHistory.map(h => [
        p.playerName, h.round,
        ...SUPPLIER_KEYS.map(k => h.orders[k]),
        ...SUPPLIER_KEYS.map(k => h.allocated[k]),
        h.arrivals, h.demand, h.sold, h.unmetDemand, h.extraDemandGained,
        h.revenue, h.orderCosts.toFixed(2), h.holdingCosts, h.profit.toFixed(2),
        h.inventory, h.cash.toFixed(2), h.marketDemand,
      ].join(','))
    );

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${session.sessionName.replace(/\s+/g, '_')}_results.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = async () => {
    const { default: jsPDF } = await import('jspdf');
    const { default: html2canvas } = await import('html2canvas');

    if (!resultsRef.current) return;

    const canvas = await html2canvas(resultsRef.current, { scale: 1.5, useCORS: true });
    const imgData = canvas.toDataURL('image/png');

    const pdf = new jsPDF('l', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const ratio = Math.min(pageWidth / canvas.width, pageHeight / canvas.height);

    pdf.addImage(imgData, 'PNG', 0, 0, canvas.width * ratio, canvas.height * ratio);
    pdf.save(`${session.sessionName.replace(/\s+/g, '_')}_results.pdf`);
  };

  const handleLeave = () => {
    clearPlayerIdentity();
    navigate('/');
  };

  return (
    <div className={s.pageContainer} ref={resultsRef}>
      <div className={styles.header}>
        <div>
          <h1 className={s.pageTitle}>{session.sessionName} — Results</h1>
          <p className={styles.subtitle}>
            {session.params.totalRounds} rounds completed with {sorted.length} players
          </p>
        </div>
        <div className={styles.actions}>
          <button className={s.btnSecondary} onClick={exportCSV}>Export CSV</button>
          <button className={s.btnSecondary} onClick={exportPDF}>Export PDF</button>
          <button className={s.btnPrimary} onClick={handleLeave}>Return Home</button>
        </div>
      </div>

      {/* Leaderboard */}
      <section className={styles.section}>
        <h2>Leaderboard</h2>
        <table className={s.table}>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Player</th>
              <th>Final Cash</th>
              <th>Final Inventory</th>
              <th>Final Demand</th>
              <th>Total Revenue</th>
              <th>Total Costs</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p, i) => {
              const totalRev = p.roundHistory.reduce((s, h) => s + h.revenue, 0);
              const totalCosts = p.roundHistory.reduce((s, h) => s + h.orderCosts + h.holdingCosts, 0);
              return (
                <tr key={p.playerId}>
                  <td><strong>{i + 1}</strong></td>
                  <td><strong>{p.playerName}</strong></td>
                  <td>${p.cash.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                  <td>{p.inventory.toLocaleString()}</td>
                  <td>{p.marketDemand.toLocaleString()}</td>
                  <td>${totalRev.toLocaleString()}</td>
                  <td>${totalCosts.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* Cash over time */}
      <section className={styles.section}>
        <h2>Cash Over Time</h2>
        <div className={styles.chartContainer}>
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={cashData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="round" />
              <YAxis tickFormatter={(v: number) => `$${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number | string | undefined) => [`$${Number(v ?? 0).toLocaleString()}`, '']} />
              <Legend />
              {disruptionAreas.filter(d => d.country === 'china').map((d, i) => (
                <ReferenceArea key={`ch${i}`} x1={d.start} x2={d.end} fill="rgba(192,57,43,0.1)" />
              ))}
              {sorted.map((p, i) => (
                <Line key={p.playerId} type="monotone" dataKey={p.playerName}
                  stroke={colors[i % colors.length]} strokeWidth={2} dot={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Market demand over time */}
      <section className={styles.section}>
        <h2>Market Demand Over Time</h2>
        <div className={styles.chartContainer}>
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={demandData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="round" />
              <YAxis />
              <Tooltip />
              <Legend />
              {disruptionAreas.filter(d => d.country === 'china').map((d, i) => (
                <ReferenceArea key={`ch${i}`} x1={d.start} x2={d.end} fill="rgba(192,57,43,0.1)" />
              ))}
              {sorted.map((p, i) => (
                <Line key={p.playerId} type="monotone" dataKey={p.playerName}
                  stroke={colors[i % colors.length]} strokeWidth={2} dot={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* China sourcing % */}
      <section className={styles.section}>
        <h2>China Sourcing % Over Time</h2>
        <div className={styles.chartContainer}>
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={chinaData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="round" />
              <YAxis domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} />
              <Tooltip formatter={(v: number | string | undefined) => [`${Number(v ?? 0)}%`, '']} />
              <Legend />
              {disruptionAreas.filter(d => d.country === 'china').map((d, i) => (
                <ReferenceArea key={`ch${i}`} x1={d.start} x2={d.end} fill="rgba(192,57,43,0.15)" label="China Disruption" />
              ))}
              {sorted.map((p, i) => (
                <Line key={p.playerId} type="monotone" dataKey={p.playerName}
                  stroke={colors[i % colors.length]} strokeWidth={2} dot={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}
