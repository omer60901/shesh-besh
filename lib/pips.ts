export function pipLayout(v: number): boolean[] {
  const L: Record<number, number[]> = {
    1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
  };
  return Array.from({ length: 9 }, (_, i) => (L[v] ?? []).includes(i));
}
