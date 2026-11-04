import type { MediaProbe } from './probe.js';

/**
 * Configurable import media contract for human-uploaded Flow clips.
 * Extension alone is never proof of format — probe + decode decide.
 */
export type MediaContract = {
  maxUploadBytes: number;
  allowedContainers: string[];
  allowedVideoCodecs: string[];
  /** Target aspect width/height, e.g. 9/16. */
  expectedAspectWidth: number;
  expectedAspectHeight: number;
  /** Absolute aspect tolerance, e.g. 0.05 ≈ 5%. */
  aspectTolerance: number;
  minWidth: number;
  minHeight: number;
  maxWidth?: number;
  maxHeight?: number;
  minDurationSeconds: number;
  maxDurationSeconds: number;
  requireAudio: boolean;
};

export const DEFAULT_FLOW_IMPORT_MEDIA_CONTRACT: MediaContract = {
  maxUploadBytes: 256 * 1024 * 1024,
  allowedContainers: ['mp4', 'mov,mp4,m4a,3gp,3g2,mj2'],
  allowedVideoCodecs: ['h264'],
  expectedAspectWidth: 9,
  expectedAspectHeight: 16,
  aspectTolerance: 0.05,
  minWidth: 720,
  minHeight: 1280,
  maxWidth: 2160,
  maxHeight: 3840,
  minDurationSeconds: 1,
  maxDurationSeconds: 20,
  requireAudio: false,
};

export type MediaContractViolation = {
  code:
    | 'empty'
    | 'oversized'
    | 'missing_video'
    | 'container'
    | 'codec'
    | 'aspect'
    | 'resolution'
    | 'duration'
    | 'audio_required'
    | 'decode';
  message: string;
};

export type MediaContractResult =
  | { ok: true; aspectRatio: number }
  | { ok: false; violations: MediaContractViolation[] };

export function readMediaContractFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  overrides?: Partial<MediaContract>,
): MediaContract {
  const base = { ...DEFAULT_FLOW_IMPORT_MEDIA_CONTRACT, ...overrides };
  const maxUpload = Number(env.FLOW_IMPORT_MAX_UPLOAD_BYTES);
  const minW = Number(env.FLOW_IMPORT_MIN_WIDTH);
  const minH = Number(env.FLOW_IMPORT_MIN_HEIGHT);
  const maxW = Number(env.FLOW_IMPORT_MAX_WIDTH);
  const maxH = Number(env.FLOW_IMPORT_MAX_HEIGHT);
  const aspectTol = Number(env.FLOW_IMPORT_ASPECT_TOLERANCE);
  const minDur = Number(env.FLOW_IMPORT_MIN_DURATION_SECONDS);
  const maxDur = Number(env.FLOW_IMPORT_MAX_DURATION_SECONDS);
  const codecs = env.FLOW_IMPORT_ALLOWED_CODECS?.split(',')
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);

  return {
    ...base,
    maxUploadBytes: Number.isFinite(maxUpload) && maxUpload > 0 ? maxUpload : base.maxUploadBytes,
    minWidth: Number.isFinite(minW) && minW > 0 ? minW : base.minWidth,
    minHeight: Number.isFinite(minH) && minH > 0 ? minH : base.minHeight,
    maxWidth: Number.isFinite(maxW) && maxW > 0 ? maxW : base.maxWidth,
    maxHeight: Number.isFinite(maxH) && maxH > 0 ? maxH : base.maxHeight,
    aspectTolerance:
      Number.isFinite(aspectTol) && aspectTol > 0 ? aspectTol : base.aspectTolerance,
    minDurationSeconds:
      Number.isFinite(minDur) && minDur > 0 ? minDur : base.minDurationSeconds,
    maxDurationSeconds:
      Number.isFinite(maxDur) && maxDur > 0 ? maxDur : base.maxDurationSeconds,
    allowedVideoCodecs: codecs && codecs.length > 0 ? codecs : base.allowedVideoCodecs,
  };
}

export function validateBytesAgainstContract(
  byteLength: number,
  contract: MediaContract,
): MediaContractViolation[] {
  const violations: MediaContractViolation[] = [];
  if (byteLength <= 0) {
    violations.push({ code: 'empty', message: 'Upload is empty' });
  }
  if (byteLength > contract.maxUploadBytes) {
    violations.push({
      code: 'oversized',
      message: `Upload exceeds max size ${contract.maxUploadBytes} bytes (got ${byteLength})`,
    });
  }
  return violations;
}

export function validateProbeAgainstContract(
  probe: MediaProbe,
  contract: MediaContract,
): MediaContractResult {
  const violations: MediaContractViolation[] = [];

  if (!probe.hasVideo) {
    violations.push({ code: 'missing_video', message: 'No video stream found' });
  }

  const format = (probe.formatName ?? '').toLowerCase();
  const containerOk = contract.allowedContainers.some((allowed) => {
    const token = allowed.toLowerCase();
    return format === token || format.split(',').includes('mp4') || format.includes('mp4');
  });
  if (!containerOk) {
    violations.push({
      code: 'container',
      message: `Unsupported container/format "${probe.formatName ?? 'unknown'}" (expected MP4)`,
    });
  }

  const codec = (probe.videoCodec ?? '').toLowerCase();
  if (!contract.allowedVideoCodecs.includes(codec)) {
    violations.push({
      code: 'codec',
      message: `Unsupported video codec "${probe.videoCodec ?? 'unknown'}" (allowed: ${contract.allowedVideoCodecs.join(', ')})`,
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
  if (
    (contract.maxWidth !== undefined && width > contract.maxWidth) ||
    (contract.maxHeight !== undefined && height > contract.maxHeight)
  ) {
    violations.push({
      code: 'resolution',
      message: `Resolution ${width}x${height} exceeds maximum ${contract.maxWidth}x${contract.maxHeight}`,
    });
  }

  const aspect = height > 0 ? width / height : 0;
  const expected = contract.expectedAspectWidth / contract.expectedAspectHeight;
  if (!(Math.abs(aspect - expected) <= contract.aspectTolerance)) {
    violations.push({
      code: 'aspect',
      message: `Aspect ratio ${aspect.toFixed(4)} is not ~${contract.expectedAspectWidth}:${contract.expectedAspectHeight} (tolerance ${contract.aspectTolerance})`,
    });
  }

  if (
    probe.durationSeconds < contract.minDurationSeconds ||
    probe.durationSeconds > contract.maxDurationSeconds
  ) {
    violations.push({
      code: 'duration',
      message: `Duration ${probe.durationSeconds.toFixed(2)}s outside ${contract.minDurationSeconds}-${contract.maxDurationSeconds}s`,
    });
  }

  if (contract.requireAudio && !probe.hasAudio) {
    violations.push({ code: 'audio_required', message: 'Audio stream required by contract' });
  }

  if (violations.length > 0) {
    return { ok: false, violations };
  }
  return { ok: true, aspectRatio: aspect };
}
