import { requireUser } from '@/lib/auth';
import { getAssemblyRecordStore } from '@/lib/assembly/runtime';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const user = await requireUser();
  const record = await getAssemblyRecordStore().getByProject(user.id, id);
  if (!record) {
    return Response.json({ ok: false, record: null }, { status: 404 });
  }
  return Response.json({ ok: true, record }, { headers: { 'Cache-Control': 'no-store' } });
}
