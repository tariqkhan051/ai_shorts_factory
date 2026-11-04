/**
 * Package: @ai-shorts-factory/media-engine
 * FFmpeg assembly, probing, and quality gates (Phase 5).
 */

export const PACKAGE_NAME = '@ai-shorts-factory/media-engine' as const;
export const PACKAGE_PHASE = 5 as const;
export const PACKAGE_STATUS = 'active' as const;

export type { MediaToolPaths } from './paths.js';
export type { MediaProbe } from './probe.js';
export type { QualityGateInput, QualityGateResult } from './quality.js';
export type {
  AssemblySceneInput,
  AssembleProjectInput,
  AssembleProjectResult,
} from './assemble.js';
export type {
  SceneCaptionCue,
  TimedCaptionCue,
} from './captions.js';
export type { SynthesizeClipInput } from './synthesize.js';
export type { CommandResult } from './run-command.js';
export type {
  MediaContract,
  MediaContractResult,
  MediaContractViolation,
} from './media-contract.js';

export { resolveMediaToolPaths, assertMediaToolsAvailable } from './paths.js';
export { runCommand } from './run-command.js';
export { probeMedia, isReadableVideo, assertDecodableVideo } from './probe.js';
export { evaluateQualityGates } from './quality.js';
export { synthesizeColorClip, mockSceneColor, MOCK_SCENE_COLORS } from './synthesize.js';
export { assembleProject } from './assemble.js';
export {
  buildSubtitlesFilter,
  buildTimedCaptionCues,
  DEFAULT_CAPTION_FORCE_STYLE,
  escapeSubtitlesFilterPath,
  formatSrtTimestamp,
  renderSrt,
} from './captions.js';
export {
  DEFAULT_FLOW_IMPORT_MEDIA_CONTRACT,
  readMediaContractFromEnv,
  validateBytesAgainstContract,
  validateProbeAgainstContract,
} from './media-contract.js';

export function getPackageMeta() {
  return {
    name: PACKAGE_NAME,
    phase: PACKAGE_PHASE,
    status: PACKAGE_STATUS,
    description: 'FFmpeg assembly, probing, and quality gates',
    maxFinalSeconds: 59,
  } as const;
}
