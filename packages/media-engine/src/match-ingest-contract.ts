import { MATCH_INGEST_DEFAULTS } from '@ai-shorts-factory/shared-types';
import type { MediaProbe } from './probe.js';
import type { MediaContract, MediaContractResult, MediaContractViolation } from './media-contract.js';

/**
 * Long-form Match Studio ingest contract.
 * Intentionally separate from DEFAULT_FLOW_IMPORT_MEDIA_CONTRACT (1–20s / 9:16).
 */
export const DEFAULT_MATCH_INGEST_MEDIA_CONTRACT: MediaContract = {
  maxUploadBytes: MATCH_INGEST_DEFAULTS.maxUploadBytes,
  allowedContainers: ['mp4', 'mov,mp4,m4a,3gp,3g2,mj2', 'matroska,webm'],
  allowedVideoCodecs: ['h264', 'hevc', 'h265', 'vp9', 'av1'],
  expectedAspectWidth: 16,
  expectedAspectHeight: 9,
  /** Soft guidance only — Android may be 20:9; validation uses aspectTolerance loosely. */
  aspectTolerance: 2,
  minWidth: MATCH_INGEST_DEFAULTS.minWidth,
  minHeight: MATCH_INGEST_DEFAULTS.minHeight,
  minDurationSeconds: MATCH_INGEST_DEFAULTS.minDurationSeconds,
  maxDurationSeconds: MATCH_INGEST_DEFAULTS.maxDurationSeconds,
  requireAudio: false,
};

export function readMatchIngestContractFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): MediaContract {
  const base = { ...DEFAULT_MATCH_INGEST_MEDIA_CONTRACT };
  const maxUpload = Number(env.MATCH_INGEST_MAX_UPLOAD_BYTES);
  const minDur = Number(env.MATCH_INGEST_MIN_DURATION_SECONDS);
  const maxDur = Number(env.MATCH_INGEST_MAX_DURATION_SECONDS);
  return {
    ...base,
    maxUploadBytes:
      Number.isFinite(maxUpload) && maxUpload > 0 ? maxUpload : base.maxUploadBytes,
    minDurationSeconds:
      Number.isFinite(minDur) && minDur > 0 ? minDur : base.minDurationSeconds,
    maxDurationSeconds:
      Number.isFinite(maxDur) && maxDur > 0 ? maxDur : base.maxDurationSeconds,
  };
}

export function validateMatchIngestBytes(
  byteLength: number,
  contract: MediaContract = DEFAULT_MATCH_INGEST_MEDIA_CONTRACT,
): MediaContractViolation[] {
  const violations: MediaContractViolation[] = [];
  if (byteLength <= 0) violations.push({ code: 'empty', message: 'Upload is empty' });
  if (byteLength > contract.maxUploadBytes) {
    violations.push({
      code: 'oversized',
      message: `Upload exceeds Match Studio max ${contract.maxUploadBytes} bytes`,
    });
  }
  return violations;
}

export function validateMatchIngestProbe(
  probe: MediaProbe,
  contract: MediaContract = DEFAULT_MATCH_INGEST_MEDIA_CONTRACT,
): MediaContractResult {
  const violations: MediaContractViolation[] = [];
  if (!probe.hasVideo) {
    violations.push({ code: 'missing_video', message: 'No video stream' });
  }
  if (probe.durationSeconds < contract.minDurationSeconds) {
    violations.push({
      code: 'duration',
      message: `Duration ${probe.durationSeconds}s below Match Studio minimum ${contract.minDurationSeconds}s`,
    });
  }
  if (probe.durationSeconds > contract.maxDurationSeconds) {
    violations.push({
      code: 'duration',
      message: `Duration ${probe.durationSeconds}s exceeds Match Studio maximum ${contract.maxDurationSeconds}s`,
    });
  }
  const width = probe.width ?? 0;
  const height = probe.height ?? 0;
  if (width < contract.minWidth || height < contract.minHeight) {
    violations.push({
      code: 'resolution',
      message: `Resolution ${width}x${height} below minimum ${contract.minWidth}x${contract.minHeight}`,
    });
  }
  if (violations.length > 0) return { ok: false, violations };
  const aspect =
    height > 0 ? width / height : contract.expectedAspectWidth / contract.expectedAspectHeight;
  return { ok: true, aspectRatio: aspect };
}
