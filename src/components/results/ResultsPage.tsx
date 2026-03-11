import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, collection, getDoc, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { useGame } from '../../contexts/GameContext';
import type { SessionDoc, PlayerStateDoc, Country } from '../../types';
import { SUPPLIER_KEYS, SUPPLIER_COUNTRY, SUPPLIER_RELIABLE } from '../../types';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceArea, BarChart, Bar,
} from 'recharts';
import s from '../../styles/shared.module.css';
import styles from './ResultsPage.module.css';

type ChartPoint = { round: number; [key: string]: number };
type ExportCapture = { dataUrl: string; width: number; height: number };

type LeaderboardRow = {
  player: PlayerStateDoc;
  adjustedCash: number;
  averagePurchaseCost: number;
  averageSuppliersUsed: number;
  averageInventory: number;
  totalDemandShortfall: number;
  totalRevenue: number;
  totalCosts: number;
  pipelineInventory: number;
  totalOrderedUnits: number;
  unreliableOrderedUnits: number;
  unreliableOrderedPct: number;
};

const PLAYER_COLORS = ['#2980b9', '#c0392b', '#27ae60', '#e67e22', '#8e44ad', '#16a085', '#d35400', '#2c3e50'];
const DISRUPTION_FILL: Record<Country, string> = {
  china: 'rgba(192,57,43,0.12)',
  mexico: 'rgba(39,174,96,0.12)',
  us: 'rgba(41,128,185,0.12)',
};
const AGGREGATE_LINE_COLOR = '#2c3e50';
const EXPORT_SECTION_ORDER = [
  'summary',
  'leaderboard',
  'cash',
  'demand',
  'china',
  'unreliable',
  'purchase',
  'suppliers',
  'inventory',
] as const;

function sumAllocatedUnits(player: PlayerStateDoc, roundIndex?: number) {
  const rounds = roundIndex == null ? player.roundHistory : [player.roundHistory[roundIndex]].filter(Boolean);
  return rounds.reduce((sum, round) => (
    sum + SUPPLIER_KEYS.reduce((supplierSum, key) => supplierSum + (round?.allocated[key] || 0), 0)
  ), 0);
}

function sumOrderedUnits(player: PlayerStateDoc, roundIndex?: number) {
  const rounds = roundIndex == null ? player.roundHistory : [player.roundHistory[roundIndex]].filter(Boolean);
  return rounds.reduce((sum, round) => (
    sum + SUPPLIER_KEYS.reduce((supplierSum, key) => supplierSum + (round?.orders[key] || 0), 0)
  ), 0);
}

function sumUnreliableOrderedUnits(player: PlayerStateDoc, roundIndex?: number) {
  const rounds = roundIndex == null ? player.roundHistory : [player.roundHistory[roundIndex]].filter(Boolean);
  return rounds.reduce((sum, round) => (
    sum + SUPPLIER_KEYS.reduce((supplierSum, key) => (
      supplierSum + (!SUPPLIER_RELIABLE[key] ? (round?.orders[key] || 0) : 0)
    ), 0)
  ), 0);
}

function countOrderedSuppliers(player: PlayerStateDoc, roundIndex?: number) {
  const rounds = roundIndex == null ? player.roundHistory : [player.roundHistory[roundIndex]].filter(Boolean);
  return rounds.reduce((sum, round) => (
    sum + SUPPLIER_KEYS.filter((key) => (round?.orders[key] || 0) > 0).length
  ), 0);
}

function getPipelineInventory(player: PlayerStateDoc) {
  return Object.values(player.transit || {}).reduce(
    (sum, pipeline) => sum + (pipeline || []).reduce((pipelineSum: number, units: number) => pipelineSum + units, 0),
    0,
  );
}

function renderDisruptionAreas(disruptionAreas: { country: Country; start: number; end: number }[]) {
  return disruptionAreas.map((area, index) => (
    <ReferenceArea
      key={`${area.country}-${area.start}-${area.end}-${index}`}
      x1={area.start}
      x2={area.end}
      fill={DISRUPTION_FILL[area.country]}
    />
  ));
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ResultsPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { clearPlayerIdentity } = useGame();
  const [session, setSession] = useState<SessionDoc | null>(null);
  const [playerStates, setPlayerStates] = useState<PlayerStateDoc[]>([]);
  const [playersLoaded, setPlayersLoaded] = useState(false);
  const [exporting, setExporting] = useState<'excel' | 'pdf' | null>(null);
  const exportSectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (!sessionId) {
      return;
    }
    getDoc(doc(db, 'sessions', sessionId)).then((snap) => {
      if (snap.exists()) {
        setSession({ id: snap.id, ...snap.data() } as SessionDoc);
      }
    });
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    getDocs(collection(db, 'sessions', sessionId, 'playerStates')).then((snap) => {
      setPlayerStates(snap.docs.map((d) => d.data() as PlayerStateDoc));
      setPlayersLoaded(true);
    });
  }, [sessionId]);

  const rounds = useMemo(
    () => playerStates.reduce((maxRounds, player) => Math.max(maxRounds, player.roundHistory?.length || 0), 0),
    [playerStates],
  );

  const disruptionAreas = useMemo(() => {
    if (!session) {
      return [] as { country: Country; start: number; end: number }[];
    }
    const areas: { country: Country; start: number; end: number }[] = [];
    for (const country of ['china', 'mexico', 'us'] as Country[]) {
      for (const start of session.disruptionSchedule[country] || []) {
        areas.push({ country, start, end: start + session.params.disruptionDuration - 1 });
      }
    }
    return areas;
  }, [session]);

  const leaderboardRows = useMemo<LeaderboardRow[]>(() => playerStates
    .map((player) => {
      const totalRevenue = player.roundHistory.reduce((sum, round) => sum + round.revenue, 0);
      const totalCosts = player.roundHistory.reduce((sum, round) => sum + round.orderCosts + round.holdingCosts, 0);
      const totalOrderCosts = player.roundHistory.reduce((sum, round) => sum + round.orderCosts, 0);
      const totalAllocatedUnits = sumAllocatedUnits(player);
      const totalOrderedUnits = sumOrderedUnits(player);
      const unreliableOrderedUnits = sumUnreliableOrderedUnits(player);
      const averagePurchaseCost = totalAllocatedUnits > 0 ? totalOrderCosts / totalAllocatedUnits : 0;
      const averageSuppliersUsed = rounds > 0 ? countOrderedSuppliers(player) / rounds : 0;
      const averageInventory = rounds > 0
        ? player.roundHistory.reduce((sum, round) => sum + round.inventory, 0) / rounds
        : 0;
      const totalDemandShortfall = player.roundHistory.reduce((sum, round) => sum + round.unmetDemand, 0);
      const pipelineInventory = getPipelineInventory(player);
      const adjustedCash = player.cash + ((player.inventory + pipelineInventory) * averagePurchaseCost);
      const unreliableOrderedPct = totalOrderedUnits > 0 ? (unreliableOrderedUnits / totalOrderedUnits) * 100 : 0;

      return {
        player,
        adjustedCash,
        averagePurchaseCost,
        averageSuppliersUsed,
        averageInventory,
        totalDemandShortfall,
        totalRevenue,
        totalCosts,
        pipelineInventory,
        totalOrderedUnits,
        unreliableOrderedUnits,
        unreliableOrderedPct,
      };
    })
    .sort((a, b) => b.adjustedCash - a.adjustedCash), [playerStates, rounds]);

  const sortedPlayers = useMemo(() => leaderboardRows.map((row) => row.player), [leaderboardRows]);

  const averageUnreliableUnitsPerTurnOverall = useMemo(() => {
    if (rounds === 0 || playerStates.length === 0) {
      return 0;
    }
    const total = Array.from({ length: rounds }, (_, i) => (
      playerStates.reduce((sum, player) => sum + sumUnreliableOrderedUnits(player, i), 0) / playerStates.length
    )).reduce((sum, value) => sum + value, 0);
    return total / rounds;
  }, [playerStates, rounds]);

  const cashData = useMemo(() => Array.from({ length: rounds }, (_, i) => {
    const entry: ChartPoint = { round: i + 1 };
    sortedPlayers.forEach((player) => { entry[player.playerName] = player.roundHistory[i]?.cash || 0; });
    return entry;
  }), [rounds, sortedPlayers]);

  const demandData = useMemo(() => Array.from({ length: rounds }, (_, i) => {
    const entry: ChartPoint = { round: i + 1 };
    sortedPlayers.forEach((player) => { entry[player.playerName] = player.roundHistory[i]?.marketDemand || 0; });
    return entry;
  }), [rounds, sortedPlayers]);

  const chinaData = useMemo(() => Array.from({ length: rounds }, (_, i) => {
    const entry: ChartPoint = { round: i + 1 };
    sortedPlayers.forEach((player) => {
      const round = player.roundHistory[i];
      if (!round) {
        entry[player.playerName] = 0;
        return;
      }
      const totalOrdered = SUPPLIER_KEYS.reduce((sum, key) => sum + round.orders[key], 0);
      const chinaOrdered = SUPPLIER_KEYS
        .filter((key) => SUPPLIER_COUNTRY[key] === 'china')
        .reduce((sum, key) => sum + round.orders[key], 0);
      entry[player.playerName] = totalOrdered > 0 ? Math.round((chinaOrdered / totalOrdered) * 100) : 0;
    });
    return entry;
  }), [rounds, sortedPlayers]);

  const unreliableOrderData = useMemo(() => Array.from({ length: rounds }, (_, i) => {
    const totalUnreliableUnits = playerStates.reduce((sum, player) => sum + sumUnreliableOrderedUnits(player, i), 0);
    return {
      round: i + 1,
      averageUnreliableUnits: playerStates.length > 0 ? totalUnreliableUnits / playerStates.length : 0,
    };
  }), [playerStates, rounds]);

  const averagePurchaseCostData = useMemo(() => Array.from({ length: rounds }, (_, i) => {
    const totalOrderCosts = playerStates.reduce((sum, player) => sum + (player.roundHistory[i]?.orderCosts || 0), 0);
    const totalAllocatedUnits = playerStates.reduce((sum, player) => sum + sumAllocatedUnits(player, i), 0);
    return {
      round: i + 1,
      averagePurchaseCost: totalAllocatedUnits > 0 ? totalOrderCosts / totalAllocatedUnits : 0,
    };
  }), [playerStates, rounds]);

  const averageSuppliersUsedData = useMemo(() => Array.from({ length: rounds }, (_, i) => {
    const totalSuppliersUsed = playerStates.reduce((sum, player) => sum + countOrderedSuppliers(player, i), 0);
    return {
      round: i + 1,
      averageSuppliersUsed: playerStates.length > 0 ? totalSuppliersUsed / playerStates.length : 0,
    };
  }), [playerStates, rounds]);

  const averageInventoryData = useMemo(() => Array.from({ length: rounds }, (_, i) => {
    const totalInventory = playerStates.reduce((sum, player) => sum + (player.roundHistory[i]?.inventory || 0), 0);
    return {
      round: i + 1,
      averageInventory: playerStates.length > 0 ? totalInventory / playerStates.length : 0,
    };
  }), [playerStates, rounds]);

  const registerExportSection = (key: string) => (node: HTMLDivElement | null) => {
    exportSectionRefs.current[key] = node;
  };

  const captureSection = async (key: string): Promise<ExportCapture> => {
    const element = exportSectionRefs.current[key];
    if (!element) {
      throw new Error(`Missing export section: ${key}`);
    }
    const { default: html2canvas } = await import('html2canvas');
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#f7f2e7',
    });
    return {
      dataUrl: canvas.toDataURL('image/png'),
      width: canvas.width,
      height: canvas.height,
    };
  };

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

  const exportExcel = async () => {
    setExporting('excel');
    try {
      const { Workbook } = await import('exceljs');
      const workbook = new Workbook();
      workbook.creator = 'Codex';
      workbook.created = new Date();
      workbook.modified = new Date();

      const summarySheet = workbook.addWorksheet('Summary', { views: [{ showGridLines: false }] });
      summarySheet.columns = [{ width: 24 }, { width: 18 }, { width: 20 }, { width: 18 }];
      summarySheet.mergeCells('A1:D1');
      summarySheet.getCell('A1').value = `${session.sessionName} Results`;
      summarySheet.getCell('A1').font = { size: 20, bold: true, color: { argb: 'FF2C3E50' } };
      summarySheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5EBD6' } };
      summarySheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
      summarySheet.getRow(1).height = 28;

      const summaryRows = [
        ['Rounds Played', session.params.totalRounds],
        ['Players', leaderboardRows.length],
        ['Average Unreliable Units / Turn', Number(averageUnreliableUnitsPerTurnOverall.toFixed(1))],
        ['Total Market Demand', session.totalMarketDemand],
      ];
      summaryRows.forEach(([label, value], index) => {
        const row = summarySheet.getRow(3 + index);
        row.getCell(1).value = label as string;
        row.getCell(1).font = { bold: true, color: { argb: 'FF5B5141' } };
        row.getCell(2).value = value as string | number;
      });

      summarySheet.getRow(8).getCell(1).value = 'Top Players';
      summarySheet.getRow(8).getCell(1).font = { size: 14, bold: true, color: { argb: 'FF2C3E50' } };
      summarySheet.addRow(['Rank', 'Player', 'Adjusted Cash', 'Unreliable %']);
      leaderboardRows.slice(0, 5).forEach((row, index) => {
        summarySheet.addRow([
          index + 1,
          row.player.playerName,
          row.adjustedCash,
          row.unreliableOrderedPct / 100,
        ]);
      });

      const leaderboardSheet = workbook.addWorksheet('Leaderboard', { views: [{ state: 'frozen', ySplit: 1 }] });
      leaderboardSheet.columns = [
        { header: 'Rank', key: 'rank', width: 8 },
        { header: 'Player', key: 'player', width: 24 },
        { header: 'Adjusted Final Cash', key: 'adjustedCash', width: 18 },
        { header: 'On-Hand Inventory', key: 'inventory', width: 16 },
        { header: 'Pipeline Inventory', key: 'pipelineInventory', width: 16 },
        { header: 'Avg Purchase Cost', key: 'averagePurchaseCost', width: 16 },
        { header: 'Avg Suppliers Used', key: 'averageSuppliersUsed', width: 16 },
        { header: 'Avg Ending Inventory', key: 'averageInventory', width: 16 },
        { header: 'Total Demand Shortfall', key: 'totalDemandShortfall', width: 18 },
        { header: 'Unreliable Ordered %', key: 'unreliableOrderedPct', width: 18 },
        { header: 'Total Revenue', key: 'totalRevenue', width: 16 },
        { header: 'Total Costs', key: 'totalCosts', width: 16 },
      ];
      leaderboardRows.forEach((row, index) => {
        leaderboardSheet.addRow({
          rank: index + 1,
          player: row.player.playerName,
          adjustedCash: row.adjustedCash,
          inventory: row.player.inventory,
          pipelineInventory: row.pipelineInventory,
          averagePurchaseCost: row.averagePurchaseCost,
          averageSuppliersUsed: row.averageSuppliersUsed,
          averageInventory: row.averageInventory,
          totalDemandShortfall: row.totalDemandShortfall,
          unreliableOrderedPct: row.unreliableOrderedPct / 100,
          totalRevenue: row.totalRevenue,
          totalCosts: row.totalCosts,
        });
      });

      const roundDataSheet = workbook.addWorksheet('Round Data', { views: [{ state: 'frozen', ySplit: 1 }] });
      roundDataSheet.columns = [
        { header: 'Player', key: 'player', width: 22 },
        { header: 'Round', key: 'round', width: 10 },
        ...SUPPLIER_KEYS.map((key) => ({ header: `Order_${key}`, key: `order_${key}`, width: 14 })),
        ...SUPPLIER_KEYS.map((key) => ({ header: `Alloc_${key}`, key: `alloc_${key}`, width: 14 })),
        { header: 'Ordered Total', key: 'orderedTotal', width: 14 },
        { header: 'Ordered Unreliable', key: 'orderedUnreliable', width: 18 },
        { header: 'Unreliable %', key: 'unreliablePct', width: 14 },
        { header: 'Arrivals', key: 'arrivals', width: 12 },
        { header: 'Demand', key: 'demand', width: 12 },
        { header: 'Sold', key: 'sold', width: 12 },
        { header: 'Unmet', key: 'unmet', width: 12 },
        { header: 'Extra Gained', key: 'extraGained', width: 14 },
        { header: 'Revenue', key: 'revenue', width: 14 },
        { header: 'Order Costs', key: 'orderCosts', width: 14 },
        { header: 'Holding Costs', key: 'holdingCosts', width: 14 },
        { header: 'Profit', key: 'profit', width: 14 },
        { header: 'Inventory', key: 'inventory', width: 14 },
        { header: 'Cash', key: 'cash', width: 14 },
        { header: 'Market Demand', key: 'marketDemand', width: 16 },
      ];

      sortedPlayers.forEach((player) => {
        player.roundHistory.forEach((round) => {
          const orderedTotal = SUPPLIER_KEYS.reduce((sum, key) => sum + round.orders[key], 0);
          const orderedUnreliable = SUPPLIER_KEYS.reduce((sum, key) => (
            sum + (!SUPPLIER_RELIABLE[key] ? round.orders[key] : 0)
          ), 0);
          roundDataSheet.addRow({
            player: player.playerName,
            round: round.round,
            ...Object.fromEntries(SUPPLIER_KEYS.map((key) => [`order_${key}`, round.orders[key]])),
            ...Object.fromEntries(SUPPLIER_KEYS.map((key) => [`alloc_${key}`, round.allocated[key]])),
            orderedTotal,
            orderedUnreliable,
            unreliablePct: orderedTotal > 0 ? orderedUnreliable / orderedTotal : 0,
            arrivals: round.arrivals,
            demand: round.demand,
            sold: round.sold,
            unmet: round.unmetDemand,
            extraGained: round.extraDemandGained,
            revenue: round.revenue,
            orderCosts: round.orderCosts,
            holdingCosts: round.holdingCosts,
            profit: round.profit,
            inventory: round.inventory,
            cash: round.cash,
            marketDemand: round.marketDemand,
          });
        });
      });

      const styleHeaderRow = (worksheet: { getRow: (row: number) => { font: object; fill: object; alignment: object } }) => {
        const headerRow = worksheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2C3E50' } };
        headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
      };

      styleHeaderRow(leaderboardSheet);
      styleHeaderRow(roundDataSheet);

      [leaderboardSheet, roundDataSheet].forEach((worksheet) => {
        worksheet.eachRow((row, rowNumber) => {
          if (rowNumber === 1) {
            return;
          }
          row.eachCell((cell) => {
            cell.border = {
              top: { style: 'thin', color: { argb: 'FFE5D8C3' } },
              bottom: { style: 'thin', color: { argb: 'FFE5D8C3' } },
            };
            if (typeof cell.value === 'number') {
              cell.alignment = { horizontal: 'right' };
            }
          });
          if (rowNumber % 2 === 0) {
            row.eachCell((cell) => {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9F4EA' } };
            });
          }
        });
      });

      leaderboardSheet.getColumn('adjustedCash').numFmt = '$#,##0';
      leaderboardSheet.getColumn('averagePurchaseCost').numFmt = '$#,##0.00';
      leaderboardSheet.getColumn('averageSuppliersUsed').numFmt = '0.00';
      leaderboardSheet.getColumn('averageInventory').numFmt = '0.0';
      leaderboardSheet.getColumn('unreliableOrderedPct').numFmt = '0.0%';
      leaderboardSheet.getColumn('totalRevenue').numFmt = '$#,##0';
      leaderboardSheet.getColumn('totalCosts').numFmt = '$#,##0';

      roundDataSheet.getColumn('unreliablePct').numFmt = '0.0%';
      roundDataSheet.getColumn('revenue').numFmt = '$#,##0';
      roundDataSheet.getColumn('orderCosts').numFmt = '$#,##0.00';
      roundDataSheet.getColumn('holdingCosts').numFmt = '$#,##0';
      roundDataSheet.getColumn('profit').numFmt = '$#,##0.00';
      roundDataSheet.getColumn('cash').numFmt = '$#,##0.00';

      const chartsSheet = workbook.addWorksheet('Charts', { views: [{ showGridLines: false }] });
      chartsSheet.columns = Array.from({ length: 12 }, () => ({ width: 16 }));
      chartsSheet.getCell('A1').value = 'Results Charts';
      chartsSheet.getCell('A1').font = { size: 18, bold: true, color: { argb: 'FF2C3E50' } };

      let chartRow = 3;
      for (const key of EXPORT_SECTION_ORDER.filter((sectionKey) => !['summary', 'leaderboard'].includes(sectionKey))) {
        const capture = await captureSection(key);
        const titleMap: Record<string, string> = {
          cash: 'Cash Over Time',
          demand: 'Market Demand Over Time',
          china: 'China Sourcing % Over Time',
          unreliable: 'Average Unreliable Units Ordered Per Turn',
          purchase: 'Average Purchase Cost Over Time',
          suppliers: 'Average Suppliers Used Over Time',
          inventory: 'Average Ending Inventory Over Time',
        };
        chartsSheet.getCell(`A${chartRow}`).value = titleMap[key];
        chartsSheet.getCell(`A${chartRow}`).font = { bold: true, color: { argb: 'FF5B5141' } };
        chartRow += 1;

        const imageId = workbook.addImage({ base64: capture.dataUrl, extension: 'png' });
        chartsSheet.addImage(imageId, {
          tl: { col: 0, row: chartRow - 1 },
          ext: {
            width: 920,
            height: Math.round((capture.height / capture.width) * 920),
          },
        });
        chartRow += Math.ceil((capture.height / capture.width) * 42) + 2;
      }

      const buffer = await workbook.xlsx.writeBuffer();
      downloadBlob(
        new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        `${session.sessionName.replace(/\s+/g, '_')}_results.xlsx`,
      );
    } finally {
      setExporting(null);
    }
  };

  const exportPDF = async () => {
    setExporting('pdf');
    try {
      const { default: jsPDF } = await import('jspdf');
      const pdf = new jsPDF('l', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 12;

      pdf.setFillColor(245, 235, 214);
      pdf.rect(0, 0, pageWidth, pageHeight, 'F');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(22);
      pdf.setTextColor(44, 62, 80);
      pdf.text(`${session.sessionName} Results`, margin, 24);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(11);
      pdf.text(`${session.params.totalRounds} rounds completed with ${leaderboardRows.length} players`, margin, 33);
      pdf.text(`Average unreliable units ordered per turn: ${averageUnreliableUnitsPerTurnOverall.toFixed(1)}`, margin, 40);
      pdf.text(`Export generated on ${new Date().toLocaleString()}`, margin, 47);

      const titleMap: Record<string, string> = {
        summary: 'Session Summary',
        leaderboard: 'Leaderboard',
        cash: 'Cash Over Time',
        demand: 'Market Demand Over Time',
        china: 'China Sourcing % Over Time',
        unreliable: 'Average Unreliable Units Ordered Per Turn',
        purchase: 'Average Purchase Cost Over Time',
        suppliers: 'Average Suppliers Used Over Time',
        inventory: 'Average Ending Inventory Over Time',
      };

      for (const key of EXPORT_SECTION_ORDER) {
        const capture = await captureSection(key);
        pdf.addPage('a4', 'l');
        pdf.setFillColor(249, 244, 234);
        pdf.rect(0, 0, pageWidth, pageHeight, 'F');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(16);
        pdf.setTextColor(44, 62, 80);
        pdf.text(titleMap[key], margin, 16);

        const availableWidth = pageWidth - (margin * 2);
        const availableHeight = pageHeight - 28;
        const ratio = Math.min(availableWidth / capture.width, availableHeight / capture.height);
        const renderWidth = capture.width * ratio;
        const renderHeight = capture.height * ratio;
        const x = margin + ((availableWidth - renderWidth) / 2);
        pdf.addImage(capture.dataUrl, 'PNG', x, 22, renderWidth, renderHeight);
      }

      pdf.save(`${session.sessionName.replace(/\s+/g, '_')}_results.pdf`);
    } finally {
      setExporting(null);
    }
  };

  const handleLeave = () => {
    clearPlayerIdentity();
    navigate('/');
  };

  return (
    <div className={s.pageContainer}>
      <div className={styles.header}>
        <div>
          <h1 className={s.pageTitle}>{session.sessionName} Results</h1>
          <p className={styles.subtitle}>
            {session.params.totalRounds} rounds completed with {leaderboardRows.length} players
          </p>
        </div>
        <div className={styles.actions}>
          <button className={s.btnSecondary} onClick={exportExcel} disabled={exporting !== null}>
            {exporting === 'excel' ? 'Exporting Excel...' : 'Export Excel'}
          </button>
          <button className={s.btnSecondary} onClick={exportPDF} disabled={exporting !== null}>
            {exporting === 'pdf' ? 'Exporting PDF...' : 'Export PDF'}
          </button>
          <button className={s.btnPrimary} onClick={handleLeave}>Return Home</button>
        </div>
      </div>

      <section ref={registerExportSection('summary')} className={styles.section}>
        <h2>Session Summary</h2>
        <p className={styles.sectionLead}>
          Endgame view of resilience, cost discipline, and supplier-risk exposure across the full simulation.
        </p>
        <div className={styles.kpiGrid}>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Players</span>
            <strong className={styles.kpiValue}>{leaderboardRows.length.toLocaleString()}</strong>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Rounds Played</span>
            <strong className={styles.kpiValue}>{session.params.totalRounds.toLocaleString()}</strong>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Avg Unreliable Units / Turn</span>
            <strong className={styles.kpiValue}>{averageUnreliableUnitsPerTurnOverall.toFixed(1)}</strong>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Total Market Demand</span>
            <strong className={styles.kpiValue}>{session.totalMarketDemand.toLocaleString()}</strong>
          </div>
        </div>
      </section>

      <section ref={registerExportSection('leaderboard')} className={styles.section}>
        <h2>Leaderboard</h2>
        <div className={styles.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Player</th>
                <th>Adjusted Final Cash</th>
                <th>On-Hand Inventory</th>
                <th>Pipeline Inventory</th>
                <th>Avg Purchase Cost</th>
                <th>Avg Suppliers Used</th>
                <th>Avg Ending Inventory</th>
                <th>Total Demand Shortfall</th>
                <th>Unreliable Ordered %</th>
                <th>Total Revenue</th>
                <th>Total Costs</th>
              </tr>
            </thead>
            <tbody>
              {leaderboardRows.map((row, i) => (
                <tr key={row.player.playerId}>
                  <td><strong>{i + 1}</strong></td>
                  <td><strong>{row.player.playerName}</strong></td>
                  <td>${row.adjustedCash.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                  <td>{row.player.inventory.toLocaleString()}</td>
                  <td>{row.pipelineInventory.toLocaleString()}</td>
                  <td>${row.averagePurchaseCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td>{row.averageSuppliersUsed.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td>{row.averageInventory.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                  <td>{row.totalDemandShortfall.toLocaleString()}</td>
                  <td>{row.unreliableOrderedPct.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%</td>
                  <td>${row.totalRevenue.toLocaleString()}</td>
                  <td>${row.totalCosts.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section ref={registerExportSection('cash')} className={styles.section}>
        <h2>Cash Over Time</h2>
        <div className={styles.chartContainer}>
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={cashData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="round" />
              <YAxis tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number | string | undefined) => [`$${Number(v ?? 0).toLocaleString()}`, '']} />
              <Legend />
              {renderDisruptionAreas(disruptionAreas)}
              {sortedPlayers.map((player, i) => (
                <Line
                  key={player.playerId}
                  type="monotone"
                  dataKey={player.playerName}
                  stroke={PLAYER_COLORS[i % PLAYER_COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section ref={registerExportSection('demand')} className={styles.section}>
        <h2>Market Demand Over Time</h2>
        <div className={styles.chartContainer}>
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={demandData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="round" />
              <YAxis />
              <Tooltip />
              <Legend />
              {renderDisruptionAreas(disruptionAreas)}
              {sortedPlayers.map((player, i) => (
                <Line
                  key={player.playerId}
                  type="monotone"
                  dataKey={player.playerName}
                  stroke={PLAYER_COLORS[i % PLAYER_COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section ref={registerExportSection('china')} className={styles.section}>
        <h2>China Sourcing % Over Time</h2>
        <div className={styles.chartContainer}>
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={chinaData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="round" />
              <YAxis domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} />
              <Tooltip formatter={(v: number | string | undefined) => [`${Number(v ?? 0)}%`, '']} />
              <Legend />
              {renderDisruptionAreas(disruptionAreas)}
              {sortedPlayers.map((player, i) => (
                <Line
                  key={player.playerId}
                  type="monotone"
                  dataKey={player.playerName}
                  stroke={PLAYER_COLORS[i % PLAYER_COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section ref={registerExportSection('unreliable')} className={styles.section}>
        <h2>Average Unreliable Units Ordered Per Turn</h2>
        <div className={styles.chartContainer}>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={unreliableOrderData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="round" />
              <YAxis />
              <Tooltip formatter={(v: number | string | undefined) => [Number(v ?? 0).toFixed(1), 'Avg Unreliable Units']} />
              <Legend />
              {renderDisruptionAreas(disruptionAreas)}
              <Bar dataKey="averageUnreliableUnits" name="Avg Unreliable Units" fill="#c0392b" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section ref={registerExportSection('purchase')} className={styles.section}>
        <h2>Average Purchase Cost Over Time</h2>
        <div className={styles.chartContainer}>
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={averagePurchaseCostData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="round" />
              <YAxis tickFormatter={(v: number) => `$${v.toFixed(0)}`} />
              <Tooltip formatter={(v: number | string | undefined) => [`$${Number(v ?? 0).toFixed(2)}`, 'Avg Purchase Cost']} />
              <Legend />
              {renderDisruptionAreas(disruptionAreas)}
              <Line type="monotone" dataKey="averagePurchaseCost" name="Average Purchase Cost" stroke={AGGREGATE_LINE_COLOR} strokeWidth={3} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section ref={registerExportSection('suppliers')} className={styles.section}>
        <h2>Average Suppliers Used Over Time</h2>
        <div className={styles.chartContainer}>
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={averageSuppliersUsedData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="round" />
              <YAxis allowDecimals />
              <Tooltip formatter={(v: number | string | undefined) => [Number(v ?? 0).toFixed(2), 'Avg Suppliers Used']} />
              <Legend />
              {renderDisruptionAreas(disruptionAreas)}
              <Line type="monotone" dataKey="averageSuppliersUsed" name="Average Suppliers Used" stroke={AGGREGATE_LINE_COLOR} strokeWidth={3} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section ref={registerExportSection('inventory')} className={styles.section}>
        <h2>Average Ending Inventory Over Time</h2>
        <div className={styles.chartContainer}>
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={averageInventoryData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="round" />
              <YAxis />
              <Tooltip formatter={(v: number | string | undefined) => [Number(v ?? 0).toFixed(1), 'Avg Ending Inventory']} />
              <Legend />
              {renderDisruptionAreas(disruptionAreas)}
              <Line type="monotone" dataKey="averageInventory" name="Average Ending Inventory" stroke={AGGREGATE_LINE_COLOR} strokeWidth={3} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}
