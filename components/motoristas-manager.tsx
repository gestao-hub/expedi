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
  saveMotoristaAction,
  deleteMotoristaAction,
  type MotoristaInput,
} from '@/app/(app)/admin/motoristas/actions';

type Motorista = {
  id: string;
  nome: string;
  cpf: string | null;
  cnh: string | null;
  telefone: string | null;
  observacoes: string | null;
  ativo: boolean;
};

export function MotoristasManager({ motoristas }: { motoristas: Motorista[] }) {
  const [editing, setEditing] = useState<Motorista | 'new' | null>(null);
  const router = useRouter();
  const ativos = motoristas.filter((m) => m.ativo);
  const inativos = motoristas.filter((m) => !m.ativo);

  return (
    <>
      <div className="px-5 py-3 border-b flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {ativos.length} ativo{ativos.length === 1 ? '' : 's'}
          {inativos.length > 0 && ` · ${inativos.length} inativo${inativos.length === 1 ? '' : 's'}`}
        </p>
        <Button
          size="sm"
          onClick={() => setEditing('new')}
          className="bg-franzoni-orange hover:bg-franzoni-orange-600"
        >
          <Plus className="h-4 w-4 mr-1" /> Novo motorista
        </Button>
      </div>

      <Table className="table-fixed w-full">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[35%] min-w-0 pl-5">Nome</TableHead>
            <TableHead className="w-36">CPF</TableHead>
            <TableHead className="w-36">CNH</TableHead>
            <TableHead className="w-36">Telefone</TableHead>
            <TableHead className="w-20">Ativo</TableHead>
            <TableHead className="w-24 pr-5" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {motoristas.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground py-12">
                Nenhum motorista cadastrado. Clique em &quot;Novo motorista&quot; pra criar o primeiro.
              </TableCell>
            </TableRow>
          ) : (
            motoristas.map((m) => (
              <TableRow key={m.id} className={m.ativo ? '' : 'opacity-60'}>
                <TableCell className="pl-5 font-medium truncate" title={m.nome}>
                  {m.nome}
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {m.cpf || '—'}
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {m.cnh || '—'}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {m.telefone || '—'}
                </TableCell>
                <TableCell>
                  {m.ativo ? (
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
                      onClick={() => setEditing(m)}
                      aria-label="Editar"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <DeleteBtn id={m.id} onDone={() => router.refresh()} />
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {editing && (
        <EditDialog
          motorista={editing === 'new' ? null : editing}
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
        if (!window.confirm('Excluir este motorista?')) return;
        start(async () => {
          const r = await deleteMotoristaAction(id);
          if ('error' in r) toast.error(r.error);
          else {
            toast.success('Motorista excluído');
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
  motorista,
  onClose,
  onSaved,
}: {
  motorista: Motorista | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = !motorista;
  const [form, setForm] = useState<MotoristaInput>({
    id: motorista?.id,
    nome: motorista?.nome ?? '',
    cpf: motorista?.cpf ?? null,
    cnh: motorista?.cnh ?? null,
    telefone: motorista?.telefone ?? null,
    observacoes: motorista?.observacoes ?? null,
    ativo: motorista?.ativo ?? true,
  });
  const [pending, start] = useTransition();
  const set =
    <K extends keyof MotoristaInput>(k: K) =>
    (v: MotoristaInput[K]) =>
      setForm((f) => ({ ...f, [k]: v }));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isNew ? 'Novo Motorista' : 'Editar Motorista'}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 py-2 text-sm">
          <Field label="Nome" cls="col-span-2">
            <Input value={form.nome} onChange={(e) => set('nome')(e.target.value)} />
          </Field>
          <Field label="CPF">
            <Input value={form.cpf ?? ''} onChange={(e) => set('cpf')(e.target.value || null)} />
          </Field>
          <Field label="CNH">
            <Input value={form.cnh ?? ''} onChange={(e) => set('cnh')(e.target.value || null)} />
          </Field>
          <Field label="Telefone" cls="col-span-2">
            <Input
              value={form.telefone ?? ''}
              onChange={(e) => set('telefone')(e.target.value || null)}
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
                const r = await saveMotoristaAction(form);
                if ('error' in r) toast.error(r.error);
                else {
                  toast.success(isNew ? 'Motorista cadastrado' : 'Atualizado');
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
