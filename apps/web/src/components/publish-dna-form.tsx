'use client';

import { useActionState } from 'react';
import {
  publishProjectDnaAction,
  type DnaActionState,
} from '@/app/projects/[id]/dna/actions';

const initial: DnaActionState = { ok: false };

type Defaults = Record<string, string | boolean>;

export function PublishDnaForm({
  projectId,
  defaults,
  categories,
  visualStyles,
}: {
  projectId: string;
  defaults: Defaults;
  categories: string[];
  visualStyles: string[];
}) {
  const [state, action, pending] = useActionState(
    publishProjectDnaAction.bind(null, projectId),
    initial,
  );

  return (
    <form action={action} className="space-y-6 rounded-lg border border-border bg-background-elevated/50 p-5">
      {state.message ? (
        <p className={`text-sm ${state.ok ? 'text-accent' : 'text-danger'}`}>{state.message}</p>
      ) : null}
      {state.errors?.length ? (
        <ul className="list-disc space-y-1 pl-5 text-sm text-danger">
          {state.errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : null}

      <Section title="Identity">
        <Field name="name" label="Project name" defaultValue={String(defaults.name ?? '')} required />
        <TextArea name="description" label="Description" defaultValue={String(defaults.description ?? '')} />
        <Field name="content_niche" label="Content niche" defaultValue={String(defaults.content_niche ?? '')} />
        <Field name="content_purpose" label="Content purpose" defaultValue={String(defaults.content_purpose ?? '')} />
        <TextArea name="universe_context" label="Universe / lore" defaultValue={String(defaults.universe_context ?? '')} rows={4} />
        <Field name="target_audience" label="Target audience" defaultValue={String(defaults.target_audience ?? '')} />
        <Field name="language" label="Language" defaultValue={String(defaults.language ?? 'en')} />
        <Select
          name="primary_content_category"
          label="Primary category"
          defaultValue={String(defaults.primary_content_category ?? 'other')}
          options={categories}
        />
      </Section>

      <Section title="Visual identity">
        <Select
          name="default_visual_style"
          label="Default visual style"
          defaultValue={String(defaults.default_visual_style ?? 'automatic')}
          options={visualStyles}
        />
        <TextArea name="color_palette" label="Color palette (one per line)" defaultValue={String(defaults.color_palette ?? '')} />
        <Field name="lighting_direction" label="Lighting direction" defaultValue={String(defaults.lighting_direction ?? '')} />
        <Field name="camera_language" label="Camera language" defaultValue={String(defaults.camera_language ?? '')} />
        <Field name="character_rendering_style" label="Character rendering" defaultValue={String(defaults.character_rendering_style ?? '')} />
        <Field name="environment_style" label="Environment style" defaultValue={String(defaults.environment_style ?? '')} />
        <TextArea name="visual_continuity_rules" label="Visual continuity rules" defaultValue={String(defaults.visual_continuity_rules ?? '')} />
      </Section>

      <Section title="Storytelling">
        <Field name="tone" label="Tone" defaultValue={String(defaults.tone ?? '')} />
        <Field name="pacing" label="Pacing" defaultValue={String(defaults.pacing ?? '')} />
        <Field name="ending_style" label="Ending style" defaultValue={String(defaults.ending_style ?? '')} />
        <TextArea name="preferred_hooks" label="Preferred hooks (one per line)" defaultValue={String(defaults.preferred_hooks ?? '')} />
        <TextArea name="default_narrative_structure" label="Narrative structure" defaultValue={String(defaults.default_narrative_structure ?? '')} />
        <TextArea name="dialogue_conventions" label="Dialogue conventions" defaultValue={String(defaults.dialogue_conventions ?? '')} />
        <TextArea name="content_restrictions" label="Content restrictions" defaultValue={String(defaults.content_restrictions ?? '')} />
      </Section>

      <Section title="Production defaults">
        <Field name="aspect_ratio" label="Aspect ratio" defaultValue={String(defaults.aspect_ratio ?? '9:16')} />
        <Field name="target_duration_seconds" label="Target duration (seconds)" defaultValue={String(defaults.target_duration_seconds ?? '40')} />
        <Field name="audio_direction" label="Audio direction" defaultValue={String(defaults.audio_direction ?? '')} />
        <Field name="subtitle_caption_style" label="Caption style" defaultValue={String(defaults.subtitle_caption_style ?? '')} />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="captions_on_video"
            value="true"
            defaultChecked={Boolean(defaults.captions_on_video)}
          />
          Burn captions on final video
        </label>
      </Section>

      <Section title="Prompt instructions">
        <TextArea name="permanent_project_instructions" label="Permanent project instructions" defaultValue={String(defaults.permanent_project_instructions ?? '')} rows={3} />
        <TextArea name="screenplay_generation_instructions" label="Screenplay generation instructions" defaultValue={String(defaults.screenplay_generation_instructions ?? '')} rows={3} />
        <TextArea name="scene_prompt_instructions" label="Scene prompt instructions" defaultValue={String(defaults.scene_prompt_instructions ?? '')} rows={3} />
        <TextArea name="character_continuity_instructions" label="Character continuity instructions" defaultValue={String(defaults.character_continuity_instructions ?? '')} rows={3} />
        <TextArea name="negative_prompt_rules" label="Negative / avoidance rules" defaultValue={String(defaults.negative_prompt_rules ?? '')} rows={3} />
      </Section>

      <Field name="version_note" label="Version note" defaultValue="" />

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-background hover:bg-accent/90 disabled:opacity-60"
      >
        {pending ? 'Publishing…' : 'Publish new DNA version'}
      </button>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium text-foreground">{title}</legend>
      {children}
    </fieldset>
  );
}

function Field({
  name,
  label,
  defaultValue,
  required,
}: {
  name: string;
  label: string;
  defaultValue: string;
  required?: boolean;
}) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="text-muted">{label}</span>
      <input
        name={name}
        defaultValue={defaultValue}
        required={required}
        className="w-full rounded-md border border-border bg-background px-3 py-2"
      />
    </label>
  );
}

function TextArea({
  name,
  label,
  defaultValue,
  rows = 2,
}: {
  name: string;
  label: string;
  defaultValue: string;
  rows?: number;
}) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="text-muted">{label}</span>
      <textarea
        name={name}
        defaultValue={defaultValue}
        rows={rows}
        className="w-full rounded-md border border-border bg-background px-3 py-2"
      />
    </label>
  );
}

function Select({
  name,
  label,
  defaultValue,
  options,
}: {
  name: string;
  label: string;
  defaultValue: string;
  options: string[];
}) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="text-muted">{label}</span>
      <select
        name={name}
        defaultValue={defaultValue}
        className="w-full rounded-md border border-border bg-background px-3 py-2"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
