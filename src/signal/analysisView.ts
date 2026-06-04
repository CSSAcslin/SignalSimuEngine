import type { TimeFrequencyAnalysisResult } from "./types";

export type TimeFrequencyViewCell = {
  row: number;
  column: number;
  frequency: number;
  time: number;
  value: number;
  intensity: number;
};

export type TimeFrequencyView = {
  rowCount: number;
  columnCount: number;
  cells: TimeFrequencyViewCell[];
  peak: { frequency: number; time: number; value: number };
  xLabels: string[];
  yLabels: string[];
};

const formatAxisValue = (value: number, unit: string) => {
  if (!Number.isFinite(value)) return `0 ${unit}`;
  const rounded = Math.abs(value) >= 1000 || (Math.abs(value) > 0 && Math.abs(value) < 0.001) ? value.toExponential(2) : String(Number(value.toPrecision(4)));
  return `${rounded} ${unit}`;
};

const sampledIndex = (index: number, sourceCount: number, targetCount: number) => {
  if (sourceCount <= 0) return 0;
  if (targetCount <= 1) return 0;
  return Math.min(sourceCount - 1, Math.round((index / (targetCount - 1)) * (sourceCount - 1)));
};

export const createTimeFrequencyView = (
  analysis: TimeFrequencyAnalysisResult,
  options: { maxRows?: number; maxColumns?: number } = {}
): TimeFrequencyView => {
  const rowCount = analysis.frequency.length;
  const columnCount = analysis.time.length;
  const maxRows = Math.max(1, options.maxRows ?? 48);
  const maxColumns = Math.max(1, options.maxColumns ?? 96);
  const displayRows = Math.min(rowCount, maxRows);
  const displayColumns = Math.min(columnCount, maxColumns);
  const flat = analysis.power.flat().filter(Number.isFinite);
  const max = Math.max(...flat, 0);
  let peak = { frequency: 0, time: 0, value: 0 };

  analysis.power.forEach((row, rowIndex) => {
    row.forEach((value, columnIndex) => {
      if (Number.isFinite(value) && value > peak.value) {
        peak = {
          frequency: analysis.frequency[rowIndex] ?? 0,
          time: analysis.time[columnIndex] ?? 0,
          value
        };
      }
    });
  });

  const cells: TimeFrequencyViewCell[] = [];
  for (let row = 0; row < displayRows; row += 1) {
    const sourceRow = sampledIndex(row, rowCount, displayRows);
    for (let column = 0; column < displayColumns; column += 1) {
      const sourceColumn = sampledIndex(column, columnCount, displayColumns);
      const value = analysis.power[sourceRow]?.[sourceColumn] ?? 0;
      cells.push({
        row,
        column,
        frequency: analysis.frequency[sourceRow] ?? 0,
        time: analysis.time[sourceColumn] ?? 0,
        value,
        intensity: max > 0 && Number.isFinite(value) ? Math.max(0, Math.min(1, value / max)) : 0
      });
    }
  }

  return {
    rowCount,
    columnCount,
    cells,
    peak,
    xLabels: [
      formatAxisValue(analysis.time[0] ?? 0, "s"),
      formatAxisValue(((analysis.time[0] ?? 0) + (analysis.time[analysis.time.length - 1] ?? 0)) / 2, "s"),
      formatAxisValue(analysis.time[analysis.time.length - 1] ?? 0, "s")
    ],
    yLabels: [
      formatAxisValue(analysis.frequency[0] ?? 0, "Hz"),
      formatAxisValue(analysis.frequency[analysis.frequency.length - 1] ?? 0, "Hz")
    ]
  };
};
