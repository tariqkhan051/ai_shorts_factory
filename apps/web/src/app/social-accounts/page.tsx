import Link from 'next/link';
import { SOCIAL_PLATFORMS } from '@ai-shorts-factory/shared-types';
import { requireUser } from '@/lib/auth';
import {
  getBrandRepository,
  getSocialAccountRepository,
} from '@/lib/projects/repository';
import { CreateSocialAccountForm } from '@/components/create-social-account-form';

export default async function SocialAccountsPage() {
  const user = await requireUser();
  const [accounts, brands] = await Promise.all([
    (await getSocialAccountRepository()).listByUser(user.id),
    (await getBrandRepository()).listByUser(user.id),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Social accounts</h1>
        <p className="text-sm text-muted">
          Register destination accounts for distribution planning. Entering a username does{' '}
          <strong className="font-medium text-foreground">not</strong> mean the account is
          connected. Automatic publishing is gated until an official integration exists.
        </p>
      </div>

      <CreateSocialAccountForm
        platforms={[...SOCIAL_PLATFORMS]}
        brands={brands.map((b) => ({ id: b.id, name: b.name }))}
      />

      <section className="space-y-3">
        {accounts.length === 0 ? (
          <p className="text-sm text-muted">No social accounts registered.</p>
        ) : (
          accounts.map((account) => (
            <article
              key={account.id}
              className="rounded-lg border border-border bg-background-elevated/50 p-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-medium">
                  {account.display_name}{' '}
                  <span className="font-mono text-xs text-muted">{account.handle}</span>
                </h2>
                <span className="font-mono text-xs uppercase text-accent">{account.platform}</span>
              </div>
              <dl className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted">Connection</dt>
                  <dd>{account.connection_status}</dd>
                </div>
                <div>
                  <dt className="text-muted">Publishing</dt>
                  <dd>{account.publishing_enabled ? 'enabled' : 'disabled (gated)'}</dd>
                </div>
                <div>
                  <dt className="text-muted">Format</dt>
                  <dd>{account.default_content_format}</dd>
                </div>
                <div>
                  <dt className="text-muted">Secrets</dt>
                  <dd>{account.secret_ref ?? 'none stored'}</dd>
                </div>
              </dl>
            </article>
          ))
        )}
      </section>

      <p className="text-sm text-muted">
        Link accounts to a project from the project dashboard destinations section.{' '}
        <Link href="/brands" className="text-accent hover:underline">
          Manage brands
        </Link>
      </p>
    </div>
  );
}
