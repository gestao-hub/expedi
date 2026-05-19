import { PageHeader } from '@/components/layout/page-header';
import { TutorialContent } from '@/components/tutorial-content';
import { requireRole } from '@/lib/auth/require-role';

export const dynamic = 'force-dynamic';

export default async function TutorialPage() {
  const profile = await requireRole(['admin', 'vendedor', 'logistica']);

  return (
    <>
      <PageHeader
        title="Tutorial"
        description="Guia rápido das telas e fluxos que você usa no dia a dia."
      />
      <TutorialContent role={profile.role} />
    </>
  );
}
