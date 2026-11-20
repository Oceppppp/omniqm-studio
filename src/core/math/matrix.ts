const EPS = 1e-10;

export function roundTo(value: number, decimals = 4): number {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** decimals;
  const rounded = Math.round((value + Math.sign(value) * Number.EPSILON) * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function formatNum(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return String(value);
  return roundTo(value, decimals).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

export function multiplyMatrices(a: number[][], b: number[][]): number[][] {
  const rowsA = a.length;
  const colsA = a[0]?.length ?? 0;
  const colsB = b[0]?.length ?? 0;
  const result = Array.from({ length: rowsA }, () => Array<number>(colsB).fill(0));
  for (let i = 0; i < rowsA; i += 1) {
    for (let k = 0; k < colsA; k += 1) {
      const aik = a[i][k];
      if (Math.abs(aik) < EPS) continue;
      for (let j = 0; j < colsB; j += 1) {
        result[i][j] += aik * b[k][j];
      }
    }
  }
  return result;
}

export function multiplyVectorMatrix(v: number[], m: number[][]): number[] {
  const cols = m[0]?.length ?? 0;
  const result = Array<number>(cols).fill(0);
  for (let i = 0; i < v.length; i += 1) {
    for (let j = 0; j < cols; j += 1) {
      result[j] += v[i] * m[i][j];
    }
  }
  return result;
}

export function solveLinearSystem(a: number[][], b: number[]): number[] | null {
  const n = a.length;
  if (n === 0 || b.length !== n) return null;

  const aug = a.map((row, idx) => [...row, b[idx]]);

  for (let col = 0; col < n; col += 1) {
    let pivotRow = col;
    let maxAbs = Math.abs(aug[col][col]);
    for (let r = col + 1; r < n; r += 1) {
      const val = Math.abs(aug[r][col]);
      if (val > maxAbs) {
        maxAbs = val;
        pivotRow = r;
      }
    }

    if (maxAbs < EPS) {
      return null;
    }

    if (pivotRow !== col) {
      const tmp = aug[col];
      aug[col] = aug[pivotRow];
      aug[pivotRow] = tmp;
    }

    const pivot = aug[col][col];
    for (let j = col; j <= n; j += 1) {
      aug[col][j] /= pivot;
    }

    for (let r = 0; r < n; r += 1) {
      if (r === col) continue;
      const factor = aug[r][col];
      if (Math.abs(factor) < EPS) continue;
      for (let j = col; j <= n; j += 1) {
        aug[r][j] -= factor * aug[col][j];
      }
    }
  }

  return aug.map((row) => row[n]);
}

export function invertMatrix(matrix: number[][]): number[][] | null {
  const n = matrix.length;
  if (n === 0 || matrix.some((r) => r.length !== n)) return null;

  const aug = matrix.map((row, i) => [
    ...row,
    ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  ]);

  for (let col = 0; col < n; col += 1) {
    let pivotRow = col;
    let maxAbs = Math.abs(aug[col][col]);
    for (let r = col + 1; r < n; r += 1) {
      const val = Math.abs(aug[r][col]);
      if (val > maxAbs) {
        maxAbs = val;
        pivotRow = r;
      }
    }

    if (maxAbs < EPS) return null;
    if (pivotRow !== col) {
      const tmp = aug[col];
      aug[col] = aug[pivotRow];
      aug[pivotRow] = tmp;
    }

    const pivot = aug[col][col];
    for (let j = 0; j < 2 * n; j += 1) {
      aug[col][j] /= pivot;
    }

    for (let r = 0; r < n; r += 1) {
      if (r === col) continue;
      const factor = aug[r][col];
      if (Math.abs(factor) < EPS) continue;
      for (let j = 0; j < 2 * n; j += 1) {
        aug[r][j] -= factor * aug[col][j];
      }
    }
  }

  return aug.map((row) => row.slice(n));
}
