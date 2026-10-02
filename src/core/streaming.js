// Streaming status shared with the dev overlay. Phase 1 fills this from the chunk streamer.
export const streaming = {
  /** Chunks waiting for worker generation or GPU upload. */
  queueDepth: 0,
  /** Bytes uploaded to the GPU this frame (budgeted ~1 ms/frame, BRIEF §14). */
  uploadBytesThisFrame: 0,
};
