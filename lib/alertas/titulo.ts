/** Texto do título piscante para N pedidos não vistos. Puro. */
export function formatTituloAlerta(n: number): string {
  return n > 1 ? `🔴 ${n} novos pedidos` : `🔴 ${n} novo pedido`;
}

/**
 * Controlador que pisca document.title entre o título-base e o alerta, até parar.
 * Só roda no browser; chamadas em ambiente sem `document` são no-op.
 */
export function criarPiscaTitulo() {
  let timer: ReturnType<typeof setInterval> | null = null;
  let base = '';
  let mostrandoAlerta = false;

  function parar() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    if (typeof document !== 'undefined' && base) document.title = base;
    mostrandoAlerta = false;
  }

  function piscar(n: number) {
    if (typeof document === 'undefined') return;
    if (!timer) base = document.title;
    const alerta = formatTituloAlerta(n);
    if (timer) clearInterval(timer);
    timer = setInterval(() => {
      mostrandoAlerta = !mostrandoAlerta;
      document.title = mostrandoAlerta ? alerta : base;
    }, 1000);
  }

  return { piscar, parar };
}
