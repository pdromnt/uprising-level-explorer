// Transparent key pixels must not contribute magenta to bilinear filtering or
// generated mipmaps. Extend neighboring visible RGB while retaining zero alpha.
export function bleedCutoutEdges(
  rgba: Uint8Array,
  width: number,
  height: number,
) {
  const count = width * height,
    seen = new Uint8Array(count),
    queue = new Uint32Array(count);
  let head = 0,
    tail = 0;
  for (let i = 0; i < count; i++)
    if (rgba[i * 4 + 3]) {
      seen[i] = 1;
      queue[tail++] = i;
    }
  if (!tail) {
    rgba.fill(0);
    return;
  }
  while (head < tail) {
    const from = queue[head++],
      x = from % width,
      y = Math.floor(from / width);
    for (const to of [
      x ? from - 1 : -1,
      x + 1 < width ? from + 1 : -1,
      y ? from - width : -1,
      y + 1 < height ? from + width : -1,
    ]) {
      if (to < 0 || seen[to]) continue;
      seen[to] = 1;
      rgba[to * 4] = rgba[from * 4];
      rgba[to * 4 + 1] = rgba[from * 4 + 1];
      rgba[to * 4 + 2] = rgba[from * 4 + 2];
      queue[tail++] = to;
    }
  }
}
