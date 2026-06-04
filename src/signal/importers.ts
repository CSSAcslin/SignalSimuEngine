export type ImportedCsvSignal = {
  values: number[];
  sampleRate?: number;
  startTime?: number;
  warnings: string[];
};

const splitCsvLine = (line: string) => line.split(/[,\t;]+/).map((item) => item.trim());

const parseNumber = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

export const parseCsvSignalData = (text: string, fallbackSampleRate = 1000): ImportedCsvSignal => {
  const warnings: string[] = [];
  const rows = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map(splitCsvLine);

  if (rows.length === 0) throw new Error("CSV file is empty.");

  const numericRows = rows
    .map((row) => row.map(parseNumber))
    .filter((row) => row.some((value) => value !== undefined));

  if (numericRows.length === 0) throw new Error("CSV file does not contain numeric samples.");

  const hasTimeColumn = numericRows.filter((row) => row[0] !== undefined && row[1] !== undefined).length >= Math.max(2, Math.floor(numericRows.length * 0.8));

  if (!hasTimeColumn) {
    const values = numericRows.map((row) => row[0]).filter((value): value is number => value !== undefined);
    if (values.length === 0) throw new Error("CSV file does not contain a value column.");
    return { values, sampleRate: fallbackSampleRate, startTime: 0, warnings };
  }

  const pairs = numericRows
    .map((row) => ({ time: row[0], value: row[1] }))
    .filter((row): row is { time: number; value: number } => row.time !== undefined && row.value !== undefined);

  if (pairs.length === 0) throw new Error("CSV file does not contain valid time,value rows.");

  const deltas = pairs
    .slice(1)
    .map((row, index) => row.time - pairs[index].time)
    .filter((delta) => delta > 0 && Number.isFinite(delta));
  const sampleRate = deltas.length > 0 ? Math.round(1 / median(deltas)) : fallbackSampleRate;
  if (deltas.length < pairs.length - 1) warnings.push("Some time steps are non-increasing; imported values keep file order.");

  return {
    values: pairs.map((row) => row.value),
    sampleRate,
    startTime: Math.max(0, pairs[0].time),
    warnings
  };
};
