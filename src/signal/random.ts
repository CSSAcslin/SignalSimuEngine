import type { SourceKind } from "./types";

export const isRandomSourceKind = (kind: SourceKind) => kind === "noise" || kind === "photonCounts";

export const createRandomSeed = () => {
  const values = new Uint32Array(1);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(values);
    return values[0] || 1;
  }
  return Math.floor(Math.random() * 0xffffffff) + 1;
};
