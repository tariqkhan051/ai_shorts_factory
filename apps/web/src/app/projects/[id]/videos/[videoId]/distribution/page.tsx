import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import {
  getDistributionRepository,
  getProjectRepository,
  getSocialAccountRepository,
  getVideoRepository,
} from '@/lib/projects/repository';
import { CreateDistributionForm } from '@/components/create-distribution-form';
import { ConfirmManualPublishForm } from '@/components/confirm-manual-publish-form';
import { linkAccountAndCreateDefaultAction } from '@/app/projects/[id]/videos/[videoId]/distribution/actions';

type PageProps = {
  params: Promise<{ id: string; videoId: string }>;
};

export default async function VideoDistributionPage({ params }: PageProps) {
  const { id, videoId } = await params;
  const user = await requireUser();
  const project = await (await getProjectRepository()).getById(user.id, id);
  if (!project) notFound();

  const videos = await getVideoRepository();
  const video = await videos.getById(user.id, videoId);
  if (!video || video.project_id !== id) notFound();

  const social = await getSocialAccountRepository();
  const [allAccounts, linkedAccounts, distributions] = await Promise.all([
    social.listByUser(user.id),
    social.listByProject(user.id, id),
    (await getDistributionRepository()).listByVideo(user.id, videoId),
  ]);

  const unlinked = allAccounts.filter((a) => !linkedAccounts.some((l) => l.id === a.id));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-2">
        <Link
          href={`/projects/${id}/videos/${videoId}`}
          className="text-sm text-muted hover:text-foreground"
        >
          ← {video.title}
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">Distribution</h1>
        <p className="text-sm text-muted">
          Plan multi-platform destinations. The assembled master stays immutable. Automatic
          publishing is not claimed — confirm manually after you publish outside the app.
        </p>
      </div>

      <section className="rounded-lg border border-border bg-background-elevated/40 p-4 text-sm">
        <h2 className="font-medium">Checklist</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted">
          <li>Select destination accounts</li>
          <li>Customize caption / hashtags per platform</li>
          <li>Export or download the master (or a derived asset later)</li>
          <li>Publish manually on the platform</li>
          <li>Record the published URL here</li>
        </ol>
      </section>

      {unlinked.length > 0 ? (
        <section className="space-y-2 rounded-lg border border-border p-4">
          <h2 className="text-sm font-medium">Link project destinations</h2>
          {unlinked.map((account) => (
            <form
              key={account.id}
              action={linkAccountAndCreateDefaultAction.bind(null, id, account.id)}
              className="flex flex-wrap items-center justify-between gap-2"
            >
              <span className="text-sm">
                {account.display_name}{' '}
                <span className="font-mono text-xs text-muted">
                  {account.platform} {account.handle}
                </span>
              </span>
              <button
                type="submit"
                className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-background"
              >
                Link to project
              </button>
            </form>
          ))}
        </section>
      ) : null}

      <CreateDistributionForm
        projectId={id}
        videoId={videoId}
        accounts={linkedAccounts.length > 0 ? linkedAccounts : allAccounts}
      />

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Distribution records</h2>
        {distributions.length === 0 ? (
          <p className="text-sm text-muted">No destinations yet.</p>
        ) : (
          distributions.map((dist) => (
            <article
              key={dist.id}
              className="space-y-3 rounded-lg border border-border bg-background-elevated/50 p-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-medium capitalize">{dist.platform}</h3>
                <span className="font-mono text-xs text-accent">{dist.status}</span>
              </div>
              <p className="text-sm whitespace-pre-wrap">{dist.caption || 'No caption'}</p>
              {dist.hashtags.length > 0 ? (
                <p className="text-xs text-muted">
                  {dist.hashtags.map((tag) => `#${tag}`).join(' ')}
                </p>
              ) : null}
              <p className="text-xs text-muted">Format: {dist.target_format}</p>
              {dist.published_url ? (
                <a
                  href={dist.published_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-accent hover:underline"
                >
                  {dist.published_url}
                </a>
              ) : (
                <ConfirmManualPublishForm
                  projectId={id}
                  videoId={videoId}
                  distributionId={dist.id}
                />
              )}
            </article>
          ))
        )}
      </section>
    </div>
  );
}
