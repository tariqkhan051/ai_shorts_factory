import Link from 'next/link';

export default function ProjectNotFound() {
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-semibold tracking-tight">Project not found</h1>
      <p className="text-muted">It may have been deleted or you do not have access.</p>
      <Link href="/projects" className="text-accent hover:underline">
        Back to projects
      </Link>
    </div>
  );
}
