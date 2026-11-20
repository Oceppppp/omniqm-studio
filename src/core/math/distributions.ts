export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
  const p =
    d *
    t *
    (0.31938153 +
      t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z >= 0 ? 1 - p : p;
}

export function factorial(n: number): number {
  if (n <= 1) return 1;
  let result = 1;
  for (let i = 2; i <= n; i += 1) {
    result *= i;
  }
  return result;
}

export interface SpcConstants {
  a2: number;
  d3: number;
  d4: number;
  d2: number;
}

const SPC_TABLE: Record<number, SpcConstants> = {
  2: { a2: 1.88, d3: 0, d4: 3.267, d2: 1.128 },
  3: { a2: 1.023, d3: 0, d4: 2.574, d2: 1.693 },
  4: { a2: 0.729, d3: 0, d4: 2.282, d2: 2.059 },
  5: { a2: 0.577, d3: 0, d4: 2.114, d2: 2.326 },
  6: { a2: 0.483, d3: 0, d4: 2.004, d2: 2.534 },
  7: { a2: 0.419, d3: 0.076, d4: 1.924, d2: 2.704 },
  8: { a2: 0.373, d3: 0.136, d4: 1.864, d2: 2.847 },
  9: { a2: 0.337, d3: 0.184, d4: 1.816, d2: 2.97 },
  10: { a2: 0.308, d3: 0.223, d4: 1.777, d2: 3.078 },
  11: { a2: 0.285, d3: 0.256, d4: 1.744, d2: 3.173 },
  12: { a2: 0.266, d3: 0.283, d4: 1.717, d2: 3.258 },
  13: { a2: 0.249, d3: 0.307, d4: 1.693, d2: 3.336 },
  14: { a2: 0.235, d3: 0.328, d4: 1.672, d2: 3.407 },
  15: { a2: 0.223, d3: 0.347, d4: 1.653, d2: 3.472 },
  16: { a2: 0.212, d3: 0.363, d4: 1.637, d2: 3.532 },
  17: { a2: 0.203, d3: 0.378, d4: 1.622, d2: 3.588 },
  18: { a2: 0.194, d3: 0.391, d4: 1.608, d2: 3.64 },
  19: { a2: 0.187, d3: 0.403, d4: 1.597, d2: 3.689 },
  20: { a2: 0.18, d3: 0.415, d4: 1.585, d2: 3.735 },
  21: { a2: 0.173, d3: 0.425, d4: 1.575, d2: 3.778 },
  22: { a2: 0.167, d3: 0.434, d4: 1.566, d2: 3.819 },
  23: { a2: 0.162, d3: 0.443, d4: 1.557, d2: 3.858 },
  24: { a2: 0.157, d3: 0.451, d4: 1.548, d2: 3.895 },
  25: { a2: 0.153, d3: 0.459, d4: 1.541, d2: 3.931 },
};

export function getSpcConstants(n: number): SpcConstants {
  const clamped = Math.max(2, Math.min(25, Math.round(n)));
  return SPC_TABLE[clamped] ?? SPC_TABLE[5];
}
