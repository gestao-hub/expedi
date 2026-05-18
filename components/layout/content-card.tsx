import { cn } from '@/lib/utils';

/**
 * Wrapper consistente para blocos de conteúdo.
 * - variant="padded" (default): padding interno, ideal pra forms e blocos de texto.
 * - variant="flush":  zero padding, ideal pra tabelas e listas.
 * - variant="elevated": glass mais opaco, pra blocos em destaque.
 */
export function ContentCard({
  children,
  className,
  variant = 'padded',
  header,
}: {
  children: React.ReactNode;
  className?: string;
  variant?: 'padded' | 'flush' | 'elevated';
  header?: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        variant === 'elevated' ? 'glass-elevated' : 'glass-card',
        'rounded-xl overflow-hidden',
        className,
      )}
    >
      {header && (
        <div className="border-b border-border/40 px-5 py-3.5 flex items-center justify-between gap-3">
          {header}
        </div>
      )}
      <div className={cn(variant === 'flush' ? '' : 'p-5')}>{children}</div>
    </section>
  );
}

export function ContentCardTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-heading text-base font-semibold text-foreground">{children}</h2>
  );
}
