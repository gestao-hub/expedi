'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { updateUserRoleAction } from './actions';
import type { UserRole } from '@/lib/types';

export function RoleSelect({
  userId,
  currentRole,
  disabled,
}: {
  userId: string;
  currentRole: UserRole;
  disabled?: boolean;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <div className="flex items-center gap-2">
      <Select
        value={currentRole}
        disabled={disabled || pending}
        onValueChange={(v) =>
          start(async () => {
            if (!v) return;
            const r = await updateUserRoleAction({ id: userId, role: v });
            if ('error' in r) toast.error(r.error);
            else {
              toast.success('Role atualizado');
              router.refresh();
            }
          })
        }
      >
        <SelectTrigger className="w-32 h-8">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="admin">admin</SelectItem>
          <SelectItem value="vendedor">vendedor</SelectItem>
          <SelectItem value="logistica">logistica</SelectItem>
        </SelectContent>
      </Select>
      {pending && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
    </div>
  );
}
