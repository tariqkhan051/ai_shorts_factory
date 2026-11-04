import { describeFlowProviderStatus } from '@ai-shorts-factory/flow-adapter/status';
import { BUSINESS_DEFAULTS, PHASE } from '@ai-shorts-factory/shared-types';
import { PushEnableButton } from '@/components/push-enable-button';
import { getAppEnv } from '@/lib/env';
import { isWebPushConfigured } from '@/lib/notifications/runtime';
import { getObjectStorage } from '@/lib/storage';

export default function SettingsPage() {
  const env = getAppEnv();
  const storage = getObjectStorage();
  const flow = describeFlowProviderStatus(process.env);
  const webPushConfigured = isWebPushConfigured();

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="max-w-2xl text-muted">
          Runtime configuration overview. Phase {PHASE.current}: mock generation and assembly are
          production-minded; live Google Flow stays canary-gated until Scene 1 is manually reviewed.
        </p>
      </div>

      <dl className="grid gap-3 sm:grid-cols-2">
        {(
          [
            ['Data store', env.database.store],
            ['Object storage', storage.name],
            ['Supabase configured', env.supabaseConfigured ? 'yes' : 'no'],
            ['R2 configured', env.r2Configured ? 'yes' : 'no'],
            ['Timezone', BUSINESS_DEFAULTS.defaultTimezone],
            ['Default model', BUSINESS_DEFAULTS.defaultGenerationModel],
            ['Clip duration', `${BUSINESS_DEFAULTS.defaultGenerationDurationSeconds}s`],
            ['Clip resolution', BUSINESS_DEFAULTS.defaultGenerationResolution],
            ['Aspect ratio', BUSINESS_DEFAULTS.defaultGenerationAspectRatio],
            [
              'Final frame size',
              `${BUSINESS_DEFAULTS.finalVideoTargetWidth}×${BUSINESS_DEFAULTS.finalVideoTargetHeight}`,
            ],
            ['Final FPS', String(BUSINESS_DEFAULTS.finalVideoFps)],
          ] as const
        ).map(([label, value]) => (
          <div
            key={label}
            className="rounded-lg border border-border bg-background-elevated/60 px-4 py-3"
          >
            <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
            <dd className="mt-1 font-mono text-sm text-foreground">{value}</dd>
          </div>
        ))}
      </dl>

      <section className="space-y-4 rounded-lg border border-border bg-background-elevated/50 p-5">
        <div>
          <h2 className="text-lg font-medium">Google Flow integration</h2>
          <p className="mt-1 text-sm text-muted">
            Playwright automation never invents Flow HTTP APIs. CAPTCHA / login walls stop the
            worker for human intervention. CI must keep{' '}
            <span className="font-mono">FLOW_PROVIDER=mock</span>. Passwords are never stored in
            env — only a local browser profile directory.
          </p>
        </div>
        <dl className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ['Configured provider', flow.provider],
              ['Session status', flow.session.status],
              ['Live enabled', flow.liveEnabled ? 'yes' : 'no'],
              ['Canary only', flow.canaryOnly ? 'yes' : 'no'],
              ['Max live scenes / project', String(flow.maxLiveScenesPerProject)],
              ['Selected model', flow.model],
              ['Flow UI model label', flow.modelOptionLabel],
              ['Aspect ratio', flow.aspectRatio],
              ['Resolution', flow.resolution],
              ['Duration', `${flow.durationSeconds}s`],
              ['Daily credit budget', String(flow.maxDailyCreditBudget)],
              ['UI verified flag', flow.uiVerifiedFlag ? 'yes' : 'no'],
              ['Recipe verified', flow.recipeVerified ? 'yes' : 'no'],
              ['Profile configured', flow.profileConfigured ? 'yes' : 'no'],
              ['Live gates', flow.gatesOk ? 'open' : 'closed'],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="rounded-md border border-border bg-background/60 px-3 py-3">
              <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
              <dd className="mt-1 font-mono text-sm">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="text-sm text-muted">{flow.session.message}</p>
        {!flow.gatesOk ? (
          <div className="space-y-2 text-sm text-muted">
            <p className="font-medium text-foreground">Gate reasons</p>
            <ul className="list-disc space-y-1 pl-5">
              {flow.gateReasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
            <p>
              See <span className="font-mono">docs/ops/google-flow-setup.md</span> for browser
              authentication and canary procedure.
            </p>
          </div>
        ) : (
          <p className="text-sm text-success">
            Live gates open for worker canary. Web mock generation remains available. Five-scene
            live stays locked until canary review.
          </p>
        )}
      </section>

      <section className="space-y-4 rounded-lg border border-border bg-background-elevated/50 p-5">
        <div>
          <h2 className="text-lg font-medium">Notifications & PWA</h2>
          <p className="mt-1 text-sm text-muted">
            In-app alerts update over SSE. Optional web push requires VAPID keys. The service worker
            caches the app shell for installability.
          </p>
        </div>
        <dl className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border border-border bg-background/60 px-3 py-3">
            <dt className="text-xs uppercase tracking-wide text-muted">Web push</dt>
            <dd className="mt-1 font-mono text-sm">
              {webPushConfigured ? 'VAPID configured' : 'VAPID not configured'}
            </dd>
          </div>
          <div className="rounded-md border border-border bg-background/60 px-3 py-3">
            <dt className="text-xs uppercase tracking-wide text-muted">Manifest</dt>
            <dd className="mt-1 font-mono text-sm">/manifest.webmanifest</dd>
          </div>
        </dl>
        <PushEnableButton />
      </section>
    </div>
  );
}
