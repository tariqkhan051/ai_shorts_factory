import { describeFlowProviderStatus } from '@ai-shorts-factory/flow-adapter/status';
import { BUSINESS_DEFAULTS, PHASE } from '@ai-shorts-factory/shared-types';
import { getAppEnv } from '@/lib/env';
import { getObjectStorage } from '@/lib/storage';

export default function SettingsPage() {
  const env = getAppEnv();
  const storage = getObjectStorage();
  const flow = describeFlowProviderStatus(process.env);

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="max-w-2xl text-muted">
          Runtime configuration overview. Phase {PHASE.current}: live Google Flow stays gated until
          an operator verifies UI selectors. Web generation continues to use the mock provider.
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
          <h2 className="text-lg font-medium">Google Flow (Phase 4)</h2>
          <p className="mt-1 text-sm text-muted">
            Playwright automation never invents Flow HTTP APIs. CAPTCHA / login walls stop the
            worker for human intervention. CI must keep{' '}
            <span className="font-mono">FLOW_PROVIDER=mock</span>.
          </p>
        </div>
        <dl className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ['Configured provider', flow.provider],
              ['Live enabled', flow.liveEnabled ? 'yes' : 'no'],
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
        {!flow.gatesOk ? (
          <div className="space-y-2 text-sm text-muted">
            <p className="font-medium text-foreground">Gate reasons</p>
            <ul className="list-disc space-y-1 pl-5">
              {flow.gateReasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
            <p>
              After inspecting live Flow, fill{' '}
              <span className="font-mono">
                packages/flow-adapter/recipes/google-flow.unverified.json
              </span>
              , set <span className="font-mono">FLOW_UI_VERIFIED=true</span>, then run{' '}
              <span className="font-mono">
                pnpm --filter @ai-shorts-factory/flow-worker verify:scene
              </span>
              .
            </p>
          </div>
        ) : (
          <p className="text-sm text-success">
            Live gates open for worker verify. Web mock generation remains the default product path.
          </p>
        )}
      </section>
    </div>
  );
}
