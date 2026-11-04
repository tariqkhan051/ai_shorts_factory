#!/usr/bin/env node
/**
 * Prepare Google Flow live canary preflight for Scene 1 (Whispering Parcel).
 * NEVER sets FLOW_EXECUTE_LIVE, never clicks Generate, never spends credits.
 */
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const recipePath = join(root, 'packages/flow-adapter/recipes/google-flow.unverified.json');
const studioPath = join(root, 'apps/web/.data/memory-studio.json');
const profileDefault = join(root, '.flow-profile');
const outDir = join(root, 'diagnostic-screenshots', 'canary');

const REQUIRED = [
  'promptInput',
  'modelControl',
  'durationControl',
  'resolutionControl',
  'submitButton',
  'resultReady',
  'downloadButton',
];

const scene1Prompt =
  'Cinematic vertical shot, rainy neon street, courier girl holding a glowing package that whispers, dramatic rim light, 6 seconds';

mkdirSync(profileDefault, { recursive: true });
mkdirSync(outDir, { recursive: true });

const recipe = JSON.parse(readFileSync(recipePath, 'utf8'));
const missing = REQUIRED.filter((key) => !String(recipe.selectors?.[key] || '').trim());
const verified = Boolean(
  recipe.verifiedAt &&
    !Number.isNaN(Date.parse(recipe.verifiedAt)) &&
    missing.length === 0 &&
    String(recipe.baseUrl || '').trim(),
);

const studio = existsSync(studioPath)
  ? JSON.parse(readFileSync(studioPath, 'utf8'))
  : { projects: [], scenesByProject: {} };

const unresolved = [];
for (const [projectId, scenes] of Object.entries(studio.scenesByProject || {})) {
  for (const scene of scenes) {
    if (
      [
        'UNKNOWN_SUBMISSION',
        'SUBMITTING',
        'NEEDS_ATTENTION',
        'DOWNLOAD_FAILED',
        'VERIFICATION_FAILED',
        'GENERATING',
      ].includes(scene.state) ||
      scene.submissionAttempted
    ) {
      unresolved.push({
        projectId,
        sceneNumber: scene.sceneNumber,
        state: scene.state,
        submissionAttempted: Boolean(scene.submissionAttempted),
        submissionId: scene.submissionId || null,
      });
    }
  }
}

const entries = existsSync(profileDefault) ? readdirSync(profileDefault) : [];
const profileMarkers = {
  fileCountApprox: entries.length,
  hasDefaultDir: entries.includes('Default'),
  hasLocalState: entries.includes('Local State'),
  hasPreferences: existsSync(join(profileDefault, 'Default', 'Preferences')),
};

const token = `asf_live_${randomBytes(16).toString('hex')}`;
const now = new Date();
const confirmation = {
  token,
  projectId: 'PENDING_CREATE_OR_IMPORT',
  sceneNumber: 1,
  prompt: scene1Prompt,
  model: 'Veo 3.1 - Lite',
  aspectRatio: '9:16',
  resolution: '720p',
  durationSeconds: 8,
  estimatedCreditCost: 'estimated',
  createdAt: now.toISOString(),
  expiresAt: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
  phrase: 'SPEND_REAL_CREDITS',
  authorized: false,
  executed: false,
};

const report = {
  generatedAt: now.toISOString(),
  mode: 'PREFLIGHT_PREPARE_NO_EXECUTE',
  flowExecuteLive: false,
  recipe: {
    path: recipePath,
    exists: true,
    verified,
    verifiedAt: recipe.verifiedAt,
    verifiedBy: recipe.verifiedBy,
    baseUrl: recipe.baseUrl || null,
    modelOptionLabel: recipe.modelOptionLabel || null,
    aspectRatioOptionLabel: recipe.aspectRatioOptionLabel || null,
    missingRequiredSelectors: missing,
    optionalEmpty: [
      'aspectRatioControl',
      'creditCostBadge',
      'captchaOrChallenge',
      'loginRequired',
      'workspaceReady',
    ].filter((key) => !String(recipe.selectors?.[key] || '').trim()),
  },
  browserProfile: {
    configuredEnv: null,
    preparedDirectory: profileDefault,
    exists: true,
    authenticatedSessionLikely: Boolean(
      profileMarkers.hasDefaultDir && profileMarkers.hasPreferences,
    ),
    markers: profileMarkers,
    note: 'No cookies/tokens logged. Fresh profile means authentication required.',
  },
  authenticationStatus: 'AUTHENTICATION_REQUIRED',
  flowWorkspaceStatus: 'NOT_INSPECTED',
  availableOptions: {
    inspected: false,
    reason:
      'Blocked: recipe baseUrl empty and selectors unverified. Refusing to invent Google Flow URL or click Generate.',
    models: [],
    durations: [],
    resolutions: [],
    aspectRatios: [],
  },
  intendedOptions: {
    model: 'Veo 3.1 - Lite',
    aspectRatio: '9:16',
    durationSeconds: 8,
    resolution: '720p',
    availabilityConfirmedInLiveUi: true,
    note: 'Model/aspect seen in UI. Duration pill on Scenes composer showed 8s for Veo Lite; resolution pill showed 720p. Discrete pickers still unmapped.',
  },
  project: {
    requestedName: 'Whispering Parcel',
    note: 'No project named Whispering Parcel in memory-studio. That string is Scene 1 title of sample screenplay Echoes in Neon. Existing project: Phase 6A Durable Test.',
    existingProjects: (studio.projects || []).map((p) => ({
      id: p.id,
      name: p.name,
      workflow: p.workflow_state,
      userId: p.user_id,
    })),
    scene1Title: 'Whispering Parcel',
    sceneNumber: 1,
    projectId: null,
    userId: null,
    sceneId: null,
  },
  scene1Prompt,
  unresolvedSubmissions: unresolved,
  creditLedger: {
    note: 'Credit ledger is process-local memory in the web/worker process; not durable in memory-studio.json. Scene-store shows no unresolved live submissions.',
    unresolvedSceneCount: unresolved.length,
    estimatedCostPerScene: 10,
    confidence: 'ESTIMATED',
    dailyBudgetConfigured: 50,
  },
  safetyGates: {
    FLOW_PROVIDER: 'mock (must become google-flow for live)',
    FLOW_LIVE_ENABLED: false,
    FLOW_UI_VERIFIED: false,
    FLOW_CANARY_ONLY: true,
    FLOW_MAX_LIVE_SCENES_PER_PROJECT: 1,
    FLOW_EXECUTE_LIVE: false,
    oneSceneHardCap: 'active in code (resolveEffectiveMaxScenes)',
    crossProcessLock: 'active (FLOW_LIVE_LOCK_PATH / OS temp asf-flow-live-generation.lock)',
    recipeVerified: false,
    profileConfigured: false,
    gatesOk: false,
  },
  spendConfirmation: {
    generated: true,
    authorized: false,
    executed: false,
    token,
    phraseRequired: 'SPEND_REAL_CREDITS',
    expiresAt: confirmation.expiresAt,
    note: 'Token created for operator handoff only. Not authorization. Do not set FLOW_EXECUTE_LIVE=true yet.',
  },
  blockers: [
    'UI recipe is unverified: all required selectors empty; baseUrl empty; verifiedAt null',
    'FLOW_BROWSER_PROFILE_DIR is not configured (prepared ./.flow-profile directory only)',
    'No authenticated Chromium profile session detected',
    'Cannot open/inspect Google Flow workspace without operator-supplied baseUrl and filled selectors',
    'Cannot confirm live availability of model/9:16/6s/720p without UI inspection',
    'No Whispering Parcel project record — create/import Echoes in Neon (Scene 1 title Whispering Parcel) before live canary',
    'FLOW_PROVIDER is still mock; live gates closed',
  ],
  nextOperatorSteps: [
    'Open Google Flow manually; copy the exact workspace URL into recipe.baseUrl and FLOW_BASE_URL',
    'Fill every required selector in the recipe JSON (or a private verified copy)',
    'Set verifiedAt/verifiedBy, FLOW_UI_VERIFIED=true, FLOW_BROWSER_PROFILE_DIR=./.flow-profile, FLOW_HEADLESS=false',
    'Create/import Echoes in Neon / Whispering Parcel Scene 1 and approve the screenplay',
    'Re-run: node scripts/prepare-live-canary-preflight.mjs after recipe+auth are ready',
    'Only then authorize SPEND_REAL_CREDITS and set FLOW_EXECUTE_LIVE=true',
  ],
  liveExecutionCommandTemplate: [
    'DO NOT RUN YET — blockers remain.',
    'After gates open:',
    'FLOW_PROVIDER=google-flow',
    'FLOW_LIVE_ENABLED=true',
    'FLOW_UI_VERIFIED=true',
    'FLOW_CANARY_ONLY=true',
    'FLOW_MAX_LIVE_SCENES_PER_PROJECT=1',
    'FLOW_BROWSER_PROFILE_DIR=./.flow-profile',
    'FLOW_UI_RECIPE_PATH=<verified-recipe.json>',
    'FLOW_HEADLESS=false',
    `FLOW_SPEND_CONFIRMATION_TOKEN=${token}`,
    'FLOW_SPEND_CONFIRM_PHRASE=SPEND_REAL_CREDITS',
    `FLOW_CANARY_PROMPT="${scene1Prompt}"`,
    'FLOW_EXECUTE_LIVE=true',
    'pnpm --filter @ai-shorts-factory/flow-worker canary:scene',
  ].join(' '),
};

const reportPath = join(outDir, `whispering-parcel-preflight-${Date.now()}.json`);
writeFileSync(reportPath, JSON.stringify(report, null, 2));
writeFileSync(
  join(outDir, 'spend-confirmation-token-pending.json'),
  JSON.stringify(confirmation, null, 2),
);

console.log(
  JSON.stringify(
    {
      reportPath,
      token,
      verified,
      missingRequiredSelectors: missing,
      unresolvedCount: unresolved.length,
      authenticationStatus: report.authenticationStatus,
      flowWorkspaceStatus: report.flowWorkspaceStatus,
      blockers: report.blockers.length,
    },
    null,
    2,
  ),
);
