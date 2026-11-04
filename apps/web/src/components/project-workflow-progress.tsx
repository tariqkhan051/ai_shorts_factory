import Link from 'next/link';
import type { WorkflowStage } from '@/lib/projects/workflow-progress';

export function ProjectWorkflowProgress({ stages }: { stages: WorkflowStage[] }) {
  return (
    <nav aria-label="Project workflow" className="rounded-lg border border-border bg-background-elevated/40 p-4">
      <ol className="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-stretch">
        {stages.map((stage, index) => {
          const tone =
            stage.status === 'complete'
              ? 'border-success/40 text-success'
              : stage.status === 'current'
                ? 'border-accent/50 text-accent'
                : stage.status === 'blocked'
                  ? 'border-danger/30 text-muted'
                  : 'border-border text-muted';
          const content = (
            <div className={`rounded-md border px-3 py-2 ${tone}`}>
              <p className="font-mono text-[10px] uppercase tracking-wide">
                {index + 1}. {stage.status}
              </p>
              <p className="text-sm font-medium text-foreground">{stage.label}</p>
              <p className="mt-1 text-xs text-muted">{stage.detail}</p>
              {stage.blockedReason ? (
                <p className="mt-1 text-xs text-danger">{stage.blockedReason}</p>
              ) : null}
            </div>
          );
          return (
            <li key={stage.id} className="min-w-[10rem] flex-1">
              {stage.available ? (
                <Link href={stage.href} className="block hover:opacity-90">
                  {content}
                </Link>
              ) : (
                content
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
