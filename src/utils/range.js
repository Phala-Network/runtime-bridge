export const range = (start, stop, step = 1) =>
  Array(Math.ceil((stop - start + 1) / step))
    .fill(start)
    .map((x, y) => x + y * step)
