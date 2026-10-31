import { test, expect } from 'vitest';
import { drawnCount } from '../src/render/rocks.js';

test('the drawn rock count covers the used slots, in buckets', () => {
  expect(drawnCount(0, 64, 700)).toBe(64);
  expect(drawnCount(65, 64, 700)).toBe(192);
  expect(drawnCount(700, 192, 700)).toBe(700);
});
test('it never reaches 0 (Babylon would draw a plain mesh)', () => {
  expect(drawnCount(0, 700, 700)).toBe(128);
});
test('small moves keep the recording', () => {
  expect(drawnCount(150, 192, 700)).toBe(192);
  expect(drawnCount(70, 192, 700)).toBe(192);
  expect(drawnCount(20, 320, 700)).toBe(128);
});
test('the bucket is per mesh', () => {
  expect(drawnCount(41, 16, 160, 16)).toBe(64);
  expect(drawnCount(64, 64, 160, 16)).toBe(64);
});
