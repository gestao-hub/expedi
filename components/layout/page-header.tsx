import { cn } from '@/lib/utils';

/**
 * Cabeçalho de página: título + descrição + área de ações.
 * Mantém hierarquia visual consistente entre /vendas, /logistica, /historico etc.
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        'flex flex-col sm:flex-row sm:items-end gap-3 sm:gap-6 pb-2',
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl sm:text-3xl font-heading font-bold text-franzoni-navy dark:text-white tracking-tight">
          {title}
        </h1>
        {description && (
          <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed max-w-2xl">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>
      )}
    </header>
  );
}
