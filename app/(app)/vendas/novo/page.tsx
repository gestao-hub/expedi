'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/layout/page-header';
import { ContentCard, ContentCardTitle } from '@/components/layout/content-card';
import { UploadPdf } from '@/components/upload-pdf';
import { PedidoForm } from '@/components/pedido-form';
import { parsedToFormInput, emptyFormInput } from '@/lib/parser/to-form-input';
import type { PedidoFormInput } from '@/lib/validators/pedido';
import { ArrowLeft } from 'lucide-react';

export default function NovoPedidoPage() {
  const [defaults, setDefaults] = useState<PedidoFormInput | null>(null);

  if (defaults) {
    return (
      <>
        <PageHeader
          title="Revisar Pedido"
          description="Confira os dados extraídos do PDF antes de enviar para a logística."
          actions={
            <Button variant="outline" onClick={() => setDefaults(null)}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
            </Button>
          }
        />
        <PedidoForm defaultValues={defaults} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Novo Pedido"
        description="Faça upload do PDF emitido pelo ERP. Os dados serão extraídos automaticamente."
      />

      <div className="max-w-2xl">
        <ContentCard
          header={<ContentCardTitle>Importar PDF</ContentCardTitle>}
          className="space-y-6"
        >
          <UploadPdf
            onParsedAction={(data) =>
              setDefaults(parsedToFormInput(data.pedido, data.storage_path))
            }
          />

          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <div className="flex-1 border-t border-border/60" />
            <span>ou</span>
            <div className="flex-1 border-t border-border/60" />
          </div>

          <Button
            variant="outline"
            className="w-full"
            onClick={() => setDefaults(emptyFormInput())}
          >
            Preencher manualmente (sem PDF)
          </Button>
        </ContentCard>
      </div>
    </>
  );
}
