// WebGPU permits pack2x16float to round toward zero. Rounding the feedback residual that
// way repeatedly loses positive mass; explicitly choose the nearest half, with even ties.
export const HEIGHT_REMAINDER_WGSL = /* wgsl */ `
fn packHeightRemainder(value: f32) -> u32 {
  let bits = pack2x16float(vec2f(0.0,value)) >> 16u;
  let rounded = unpack2x16float(bits << 16u).y;
  if (rounded == value || (bits & 32767u) >= 31743u) { return bits << 16u; }
  var neighbour = bits + 1u;
  if (abs(rounded) > abs(value)) { neighbour = bits - 1u; }
  let other = unpack2x16float(neighbour << 16u).y;
  let a = abs(value - rounded); let b = abs(value - other);
  if (b < a || (a == b && (neighbour & 1u) == 0u)) { return neighbour << 16u; }
  return bits << 16u;
}
`;
