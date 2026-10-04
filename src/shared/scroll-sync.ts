/**
 * Maps a position on one axis to the other through anchor pairs (e.g. editor and preview offsets of
 * the same source line), linearly between neighbours. Anchors that go backwards on either axis are skipped.
 */
export function interpolate(anchors: Array<[number, number]>, x: number): number {
  const points: Array<[number, number]> = []
  for (const point of anchors) {
    const last = points.at(-1)
    if (!last || (point[0] > last[0] && point[1] >= last[1])) points.push(point)
  }
  if (points.length === 0) return x
  let index = points.findIndex(([at]) => at > x)
  if (index === -1) return points.at(-1)![1]
  if (index === 0) return points[0][1]
  const [x0, y0] = points[index - 1]
  const [x1, y1] = points[index]
  return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0)
}
