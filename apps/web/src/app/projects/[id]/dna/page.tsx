import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CONTENT_CATEGORIES, VISUAL_STYLES } from '@ai-shorts-factory/shared-types';
import { requireUser } from '@/lib/auth';
import {
  getProjectDnaRepository,
  getProjectRepository,
} from '@/lib/projects/repository';
import { PublishDnaForm } from '@/components/publish-dna-form';

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function ProjectDnaPage({ params }: PageProps) {
  const { id } = await params;
  const user = await requireUser();
  const projects = await getProjectRepository();
  const project = await projects.getById(user.id, id);
  if (!project) notFound();

  const dnaRepo = await getProjectDnaRepository();
  const [current, versions] = await Promise.all([
    dnaRepo.getCurrent(user.id, id),
    dnaRepo.listVersions(user.id, id),
  ]);
  const snapshot = current?.snapshot;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-2">
        <Link href={`/projects/${id}`} className="text-sm text-muted hover:text-foreground">
          ← {project.name}
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">Project DNA</h1>
        <p className="text-sm text-muted">
          Versioned creative identity. Publishing a new version does not alter approved or
          completed videos.
        </p>
        <p className="font-mono text-xs text-accent">
          Current version: {project.dna_current_version || current?.version || 0}
        </p>
      </div>

      <PublishDnaForm
        projectId={id}
        categories={[...CONTENT_CATEGORIES]}
        visualStyles={[...VISUAL_STYLES]}
        defaults={{
          name: snapshot?.identity.name ?? project.name,
          description: snapshot?.identity.description ?? project.notes,
          content_niche: snapshot?.identity.content_niche ?? project.niche,
          content_purpose: snapshot?.identity.content_purpose ?? project.content_purpose,
          universe_context: snapshot?.identity.universe_context ?? project.universe_context,
          target_audience: snapshot?.identity.target_audience ?? project.target_audience,
          language: snapshot?.identity.language ?? project.language,
          primary_content_category:
            snapshot?.identity.primary_content_category ?? project.category,
          default_visual_style: snapshot?.visual.default_visual_style ?? project.visual_style,
          lighting_direction: snapshot?.visual.lighting_direction ?? '',
          camera_language: snapshot?.visual.camera_language ?? '',
          character_rendering_style: snapshot?.visual.character_rendering_style ?? '',
          environment_style: snapshot?.visual.environment_style ?? '',
          visual_continuity_rules: snapshot?.visual.visual_continuity_rules ?? '',
          color_palette: (snapshot?.visual.color_palette ?? []).join('\n'),
          tone: snapshot?.storytelling.tone ?? '',
          pacing: snapshot?.storytelling.pacing ?? '',
          ending_style: snapshot?.storytelling.ending_style ?? '',
          dialogue_conventions: snapshot?.storytelling.dialogue_conventions ?? '',
          content_restrictions: snapshot?.storytelling.content_restrictions ?? '',
          default_narrative_structure: snapshot?.storytelling.default_narrative_structure ?? '',
          preferred_hooks: (snapshot?.storytelling.preferred_hooks ?? []).join('\n'),
          aspect_ratio: snapshot?.production_defaults.aspect_ratio ?? '9:16',
          target_duration_seconds: String(
            snapshot?.production_defaults.target_duration_seconds ?? 40,
          ),
          captions_on_video:
            snapshot?.production_defaults.captions_on_video ?? project.captions_on_video,
          audio_direction: snapshot?.production_defaults.audio_direction ?? '',
          subtitle_caption_style: snapshot?.production_defaults.subtitle_caption_style ?? '',
          permanent_project_instructions:
            snapshot?.prompt_instructions.permanent_project_instructions ?? '',
          screenplay_generation_instructions:
            snapshot?.prompt_instructions.screenplay_generation_instructions ?? '',
          scene_prompt_instructions:
            snapshot?.prompt_instructions.scene_prompt_instructions ?? '',
          character_continuity_instructions:
            snapshot?.prompt_instructions.character_continuity_instructions ?? '',
          negative_prompt_rules: snapshot?.prompt_instructions.negative_prompt_rules ?? '',
        }}
      />

      <section className="rounded-lg border border-border bg-background-elevated/50 p-5">
        <h2 className="text-lg font-medium">Version history</h2>
        {versions.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No DNA versions yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {[...versions].reverse().map((version) => (
              <li
                key={version.id}
                className="flex flex-wrap items-baseline justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
              >
                <span className="font-mono text-accent">v{version.version}</span>
                <span className="text-muted">{version.note || '—'}</span>
                <span className="font-mono text-xs text-muted">
                  {new Date(version.created_at).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
