'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export type ConfirmOptions = {
  title: string;
  description?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  /** 'destructive' deixa o botão de confirmar vermelho (exclusões, cancelamentos). */
  variant?: 'default' | 'destructive';
};

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = React.createContext<ConfirmFn | null>(null);

/**
 * Substitui window.confirm por um modal da plataforma.
 * Uso: `const confirm = useConfirm(); if (!(await confirm({ title }))) return;`
 */
export function useConfirm(): ConfirmFn {
  const ctx = React.useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm precisa estar dentro de <ConfirmProvider>');
  return ctx;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const [opts, setOpts] = React.useState<ConfirmOptions | null>(null);
  const resolverRef = React.useRef<((value: boolean) => void) | null>(null);

  const confirm = React.useCallback<ConfirmFn>((options) => {
    setOpts(options);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const settle = React.useCallback((value: boolean) => {
    resolverRef.current?.(value);
    resolverRef.current = null;
    setOpen(false);
  }, []);

  // Se o dialog fechar por ESC/backdrop/X, resolve como cancelado
  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (!next && resolverRef.current) settle(false);
      else setOpen(next);
    },
    [settle],
  );

  const isDestructive = opts?.variant === 'destructive';

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{opts?.title}</DialogTitle>
            {opts?.description && <DialogDescription>{opts.description}</DialogDescription>}
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => settle(false)}>
              {opts?.cancelText ?? 'Cancelar'}
            </Button>
            <Button
              onClick={() => settle(true)}
              className={cn(
                isDestructive && 'bg-destructive text-white hover:bg-destructive/90',
              )}
            >
              {opts?.confirmText ?? 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  );
}
