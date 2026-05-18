'use client';

import { useEffect } from 'react';

/**
 * Dispara window.print() automaticamente ~400ms após o carregamento,
 * dando tempo para imagens/fontes renderizarem.
 */
export function AutoPrint() {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, []);
  return null;
}

export function PrintControls() {
  return (
    <div className="no-print p-3 border-b flex justify-between bg-muted/30 text-sm">
      <button onClick={() => window.close()} className="underline">
        Fechar
      </button>
      <button onClick={() => window.print()} className="underline">
        Imprimir novamente
      </button>
    </div>
  );
}
