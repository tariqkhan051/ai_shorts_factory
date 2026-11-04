import Link from 'next/link';
import { ProjectForm } from '@/components/project-form';

export default function NewProjectPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-2">
        <Link href="/projects" className="text-sm text-muted hover:text-foreground">
          ← Projects
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">New project</h1>
        <p className="text-muted">
          Capture the idea, category, style, and creative constraints. Story prompting arrives in
          Phase 2.
        </p>
      </div>
      <div className="rounded-lg border border-border bg-background-elevated/50 p-5">
        <ProjectForm mode="create" />
      </div>
    </div>
  );
}
