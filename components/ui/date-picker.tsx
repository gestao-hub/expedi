'use client';

import { CalendarIcon, X } from 'lucide-react';
import { format, parse, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useState } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

/**
 * DatePicker no padrão Franzoni: botão estilo input + calendário em popover.
 * Trabalha com strings ISO (YYYY-MM-DD) pra integrar com react-hook-form e Supabase.
 */
export function DatePicker({
  value,
  onChangeAction,
  placeholder = 'Selecionar data',
  disabled,
  className,
}: {
  value?: string | null;
  onChangeAction: (iso: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  // parse ISO → Date
  const selected = value ? parse(value, 'yyyy-MM-dd', new Date()) : undefined;
  const validDate = selected && isValid(selected) ? selected : undefined;

  const handleSelect = (date: Date | undefined) => {
    if (!date) {
      onChangeAction(null);
    } else {
      onChangeAction(format(date, 'yyyy-MM-dd'));
    }
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        className={cn(
          buttonVariants({ variant: 'outline' }),
          'w-full justify-start font-normal h-9 px-3 text-sm',
          !validDate && 'text-muted-foreground',
          'hover:bg-background hover:border-franzoni-orange/40',
          className,
        )}
      >
        <CalendarIcon className="h-4 w-4 mr-2 shrink-0 opacity-60" />
        <span className="flex-1 text-left">
          {validDate ? format(validDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR }) : placeholder}
        </span>
        {validDate && !disabled && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-5 w-5 -mr-1 hover:bg-muted shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onChangeAction(null);
            }}
            aria-label="Limpar data"
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 glass-elevated" align="start" sideOffset={4}>
        <Calendar
          mode="single"
          selected={validDate}
          onSelect={handleSelect}
          locale={ptBR}
          captionLayout="dropdown"
          startMonth={new Date(2020, 0)}
          endMonth={new Date(2030, 11)}
          defaultMonth={validDate ?? new Date()}
          className="rounded-xl"
        />
      </PopoverContent>
    </Popover>
  );
}
