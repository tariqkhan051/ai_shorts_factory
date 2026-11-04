import { BUSINESS_DEFAULTS } from '@ai-shorts-factory/shared-types';

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="max-w-2xl text-muted">
          Editable system settings persist in Phase 1+. Defaults below are the fixed business
          baseline.
        </p>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2">
        {(
          [
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
    </div>
  );
}
