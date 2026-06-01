-- 20260601000020_pagamento_estruturado.sql — forma_pagamento/parcelas estruturados
do $$ begin
  create type forma_pagamento_tipo as enum ('credito','pix','debito','dinheiro','boleto');
exception when duplicate_object then null; end $$;

-- forma_pagamento text -> enum (mapeia conhecidos; resto NULL)
alter table public.pedidos
  alter column forma_pagamento type forma_pagamento_tipo
  using (
    case
      when forma_pagamento ilike '%credito%' or forma_pagamento ilike '%crédito%' then 'credito'::forma_pagamento_tipo
      when forma_pagamento ilike '%pix%'     then 'pix'::forma_pagamento_tipo
      when forma_pagamento ilike '%debito%'  or forma_pagamento ilike '%débito%'  then 'debito'::forma_pagamento_tipo
      when forma_pagamento ilike '%dinheiro%' or forma_pagamento ilike '%espécie%' or forma_pagamento ilike '%especie%' then 'dinheiro'::forma_pagamento_tipo
      when forma_pagamento ilike '%boleto%'  then 'boleto'::forma_pagamento_tipo
      else null
    end
  );

-- parcelas text -> smallint (extrai dígitos; clamp 1..12; vazio/0 -> NULL)
alter table public.pedidos
  alter column parcelas type smallint
  using (
    case
      when parcelas ~ '\d+' then least(greatest((regexp_replace(parcelas,'\D','','g'))::int, 1), 12)::smallint
      else null
    end
  );
