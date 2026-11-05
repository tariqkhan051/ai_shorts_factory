import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { getBrandRepository, getProjectRepository } from '@/lib/projects/repository';
import { CreateBrandForm } from '@/components/create-brand-form';

export default async function BrandsPage() {
  const user = await requireUser();
  const [brands, projects] = await Promise.all([
    (await getBrandRepository()).listByUser(user.id),
    (await getProjectRepository()).listByUser(user.id),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Brands</h1>
        <p className="text-sm text-muted">
          A Brand owns multiple Projects. Social accounts associate to Brands separately from
          production workflows.
        </p>
      </div>

      <CreateBrandForm />

      <section className="space-y-3">
        {brands.length === 0 ? (
          <p className="text-sm text-muted">No brands yet. Creating a project seeds a Personal brand.</p>
        ) : (
          brands.map((brand) => {
            const brandProjects = projects.filter((p) => p.brand_id === brand.id);
            return (
              <article
                key={brand.id}
                className="rounded-lg border border-border bg-background-elevated/50 p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-medium">{brand.name}</h2>
                    <p className="mt-1 text-sm text-muted">{brand.description || 'No description'}</p>
                    <p className="mt-2 text-xs text-muted">
                      Voice: {brand.brand_voice || '—'} · Audience: {brand.target_audience || '—'}
                    </p>
                  </div>
                  <Link
                    href="/social-accounts"
                    className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-background"
                  >
                    Social accounts
                  </Link>
                </div>
                <div className="mt-4">
                  <p className="text-xs uppercase tracking-wide text-muted">Projects</p>
                  {brandProjects.length === 0 ? (
                    <p className="mt-1 text-sm text-muted">No projects linked yet.</p>
                  ) : (
                    <ul className="mt-2 space-y-1">
                      {brandProjects.map((project) => (
                        <li key={project.id}>
                          <Link
                            href={`/projects/${project.id}`}
                            className="text-sm text-accent hover:underline"
                          >
                            {project.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}
