'use client';

import { useEffect, useState } from 'react';

const PX_CM = 96 / 2.54;
const ALVO_CM = 12.8; // altura alvo por via p/ caber 2 numa folha A4 (c/ folga)
const ZOOM_MIN = 0.65; // se precisar encolher mais que isso, pagina (1 via/página)

/**
 * Ajusta a impressão de cada documento (.folha-vias) pra caber SEM cortar:
 * - mede a via na largura real de impressão (A4 − margens = 190mm);
 * - aplica o zoom mínimo necessário p/ as 2 vias caberem na folha;
 * - se o pedido for grande demais (zoom ficaria ilegível), marca .paginado →
 *   1 via por página inteira (nada é cortado).
 * Roda na tela de impressão (single e lote) e reage à troca do check.
 */
function ajustarVias(guiaCliente: boolean) {
  document.querySelectorAll<HTMLElement>('.folha-vias').forEach((doc) => {
    doc.classList.remove('paginado');
    const vias = Array.from(
      doc.querySelectorAll<HTMLElement>('.via-bloco > div.bg-white'),
    );
    if (vias.length === 0) return;

    if (!guiaCliente) {
      // 1 via só (guia inativa): tamanho natural, sem zoom.
      vias.forEach((v) => {
        v.style.zoom = '';
      });
      return;
    }

    // Mede a altura natural de uma via na LARGURA DE IMPRESSÃO (pra bater com o papel).
    vias.forEach((v) => {
      v.style.zoom = '1';
    });
    const larguraAnterior = doc.style.width;
    doc.style.width = '190mm';
    void doc.offsetHeight; // força reflow
    const naturalCm = vias[0].getBoundingClientRect().height / PX_CM;
    doc.style.width = larguraAnterior;
    if (!naturalCm) return;

    const needed = ALVO_CM / naturalCm;
    if (needed >= ZOOM_MIN) {
      // Cabe encolhendo: aplica o zoom mínimo necessário (no máx. 1 = sem encolher).
      const z = Math.min(1, needed);
      vias.forEach((v) => {
        v.style.zoom = String(z);
      });
    } else {
      // Grande demais p/ 2 numa folha → 1 via por página, encolhendo só p/ caber 1 folha.
      doc.classList.add('paginado');
      const zPag = Math.min(1, 25.5 / naturalCm);
      vias.forEach((v) => {
        v.style.zoom = String(zPag);
      });
    }
  });
}

/**
 * Dispara window.print() automaticamente após o carregamento, dando tempo para
 * imagens/fontes renderizarem (e o ajuste de vias rodar).
 */
export function AutoPrint() {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 600);
    return () => clearTimeout(t);
  }, []);
  return null;
}

export function PrintControls({ defaultGuia = true }: { defaultGuia?: boolean }) {
  // Guia do cliente = 2ª via destacável. A escolha já vem da tela do pedido
  // (?guia=1|0); aqui dá pra trocar e reimprimir se precisar.
  // Inativo → adiciona .sem-via-cliente no body e a 2ª via não é impressa.
  const [guiaCliente, setGuiaCliente] = useState(defaultGuia);

  useEffect(() => {
    document.body.classList.toggle('sem-via-cliente', !guiaCliente);
    ajustarVias(guiaCliente);
    // Re-ajusta depois que fontes/imagens assentam (a medição inicial pode mudar).
    const t = setTimeout(() => ajustarVias(guiaCliente), 350);
    return () => clearTimeout(t);
  }, [guiaCliente]);

  // Limpa a classe ao sair da página de impressão.
  useEffect(() => () => document.body.classList.remove('sem-via-cliente'), []);

  return (
    <div className="no-print p-3 border-b flex items-center justify-between gap-4 bg-muted/30 text-sm">
      <button onClick={() => window.close()} className="underline">
        Fechar
      </button>
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={guiaCliente}
          onChange={(e) => setGuiaCliente(e.target.checked)}
          className="h-4 w-4 accent-franzoni-navy"
        />
        <span>
          Guia do cliente{' '}
          <span className="text-muted-foreground">(2ª via destacável)</span>
        </span>
      </label>
      <button onClick={() => window.print()} className="underline">
        Imprimir novamente
      </button>
    </div>
  );
}
