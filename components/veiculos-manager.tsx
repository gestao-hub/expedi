'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, Loader2, Power, PowerOff } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  saveVeiculoAction,
  deleteVeiculoAction,
  type VeiculoInput,
} from '@/app/(app)/admin/veiculos/actions';

type Veiculo = {
  id: string;
  placa: string;
  modelo: string | null;
  marca: string | null;
  capacidade_kg: number | null;
  observacoes: string | null;
  ativo: boolean;
};

export function VeiculosManager({ veiculos }: { veiculos: Veiculo[] }) {
  const [editing, setEditing] = useState<Veiculo | 'new' | null>(null);
  const router = useRouter();

  return (
    <>
      <div className="px-5 py-3 border-b flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{veiculos.length} cadastrado{veiculos.length === 1 ? '' : 's'}</p>
        <Button
          size="sm"
          onClick={() => setEditing('new')}
          className="bg-franzoni-orange hover:bg-franzoni-orange-600"
        >
          <Plus className="h-4 w-4 mr-1" /> Novo veículo
        </Button>
      </div>

      <Table className="table-fixed w-full">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-32 pl-5">Placa</TableHead>
            <TableHead className="w-[28%] min-w-0">Modelo</TableHead>
            <TableHead className="w-[18%] min-w-0">Marca</TableHead>
            <TableHead className="w-32">Capacidade</TableHead>
            <TableHead className="w-20">Ativo</TableHead>
            <TableHead className="w-24 pr-5" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {veiculos.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground py-12">
                Nenhum veículo cadastrado.
              </TableCell>
            </TableRow>
          ) : (
            veiculos.map((v) => (
              <TableRow key={v.id} className={v.ativo ? '' : 'opacity-60'}>
                <TableCell className="pl-5 font-mono font-semibold">{v.placa}</TableCell>
                <TableCell className="truncate" title={v.modelo ?? ''}>
                  {v.modelo || '—'}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground truncate">
                  {v.marca || '—'}
                </TableCell>
                <TableCell className="text-sm">
                  {v.capacidade_kg ? `${Number(v.capacidade_kg).toLocaleString('pt-BR')} kg` : '—'}
                </TableCell>
                <TableCell>
                  {v.ativo ? (
                    <Power className="h-3.5 w-3.5 text-status-finalizado" />
                  ) : (
                    <PowerOff className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </TableCell>
                <TableCell className="text-right pr-5">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setEditing(v)}
                      aria-label="Editar"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <DeleteBtn id={v.id} onDone={() => router.refresh()} />
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {editing && (
        <EditDialog
          veiculo={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function DeleteBtn({ id, onDone }: { id: string; onDone: () => void }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8 text-destructive hover:bg-destructive/10"
      disabled={pending}
      onClick={() => {
        if (!window.confirm('Excluir este veículo?')) return;
        start(async () => {
          const r = await deleteVeiculoAction(id);
          if ('error' in r) toast.error(r.error);
          else {
            toast.success('Veículo excluído');
            onDone();
          }
        });
      }}
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
    </Button>
  );
}

function EditDialog({
  veiculo,
  onClose,
  onSaved,
}: {
  veiculo: Veiculo | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = !veiculo;
  const [form, setForm] = useState<VeiculoInput>({
    id: veiculo?.id,
    placa: veiculo?.placa ?? '',
    modelo: veiculo?.modelo ?? null,
    marca: veiculo?.marca ?? null,
    capacidade_kg: veiculo?.capacidade_kg ?? null,
    observacoes: veiculo?.observacoes ?? null,
    ativo: veiculo?.ativo ?? true,
  });
  const [pending, start] = useTransition();
  const set =
    <K extends keyof VeiculoInput>(k: K) =>
    (v: VeiculoInput[K]) =>
      setForm((f) => ({ ...f, [k]: v }));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isNew ? 'Novo Veículo' : 'Editar Veículo'}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 py-2 text-sm">
          <Field label="Placa">
            <Input
              value={form.placa}
              onChange={(e) => set('placa')(e.target.value.toUpperCase())}
              className="font-mono uppercase"
            />
          </Field>
          <Field label="Capacidade (kg)">
            <Input
              type="number"
              step="0.01"
              value={form.capacidade_kg ?? ''}
              onChange={(e) =>
                set('capacidade_kg')(e.target.value ? Number(e.target.value) : null)
              }
            />
          </Field>
          <Field label="Modelo">
            <Input
              value={form.modelo ?? ''}
              onChange={(e) => set('modelo')(e.target.value || null)}
            />
          </Field>
          <Field label="Marca">
            <Input
              value={form.marca ?? ''}
              onChange={(e) => set('marca')(e.target.value || null)}
            />
          </Field>
          <Field label="Observações" cls="col-span-2">
            <Textarea
              rows={2}
              value={form.observacoes ?? ''}
              onChange={(e) => set('observacoes')(e.target.value || null)}
            />
          </Field>
          <label className="col-span-2 flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.ativo}
              onChange={(e) => set('ativo')(e.target.checked)}
              className="h-4 w-4 rounded accent-franzoni-orange"
            />
            Ativo (aparece como sugestão na baixa)
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button
            onClick={() =>
              start(async () => {
                const r = await saveVeiculoAction(form);
                if ('error' in r) toast.error(r.error);
                else {
                  toast.success(isNew ? 'Veículo cadastrado' : 'Atualizado');
                  onSaved();
                }
              })
            }
            disabled={pending}
            className="bg-franzoni-orange hover:bg-franzoni-orange-600"
          >
            {pending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, cls, children }: { label: string; cls?: string; children: React.ReactNode }) {
  return (
    <div className={cls}>
      <Label className="text-xs text-muted-foreground mb-1.5 block">{label}</Label>
      {children}
    </div>
  );
}
