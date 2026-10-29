alter table public.vistorias add column if not exists cliente_id text;
create unique index if not exists vistorias_cliente_id_key on public.vistorias (cliente_id) where cliente_id is not null;

create or replace function public.gravar_vistoria(payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  nome_condominio text;
  bloco_num smallint;
  apto text;
  unidade bigint;
  vistoria bigint;
  resposta jsonb;
  marca text;
  gravidade text;
  hora_inicio time;
  hora_fim time;
  clima text;
  status_vistoria text;
begin
  nome_condominio := trim(coalesce(payload->>'empreendimento', ''));
  if nome_condominio in ('Condomínio IBGE', 'Condominio IBGE', 'IBGE') then
    nome_condominio := 'Mangueira IBGE';
  end if;
  bloco_num := nullif(substring(coalesce(payload->>'bloco', '') from '[0-9]+'), '')::smallint;
  apto := trim(coalesce(payload->>'unidade', ''));
  select u.id into unidade
  from public.unidades u
  join public.blocos b on b.id = u.bloco_id
  join public.condominios c on c.id = b.condominio_id
  where c.nome = nome_condominio
    and b.numero = bloco_num
    and u.numero = apto;
  if unidade is null then
    raise exception 'Unidade não encontrada';
  end if;

  hora_inicio := case
    when coalesce(payload->>'horaInicio', '') ~ '^\d{2}:\d{2}' then (payload->>'horaInicio')::time
    else null
  end;
  hora_fim := case
    when coalesce(payload->>'horaFim', '') ~ '^\d{2}:\d{2}' then (payload->>'horaFim')::time
    else null
  end;
  clima := case
    when payload->>'clima' in ('sol', 'nublado', 'chuva') then payload->>'clima'
    else null
  end;
  status_vistoria := case
    when payload->>'status' = 'concluida' then 'concluida'
    else 'em_andamento'
  end;

  insert into public.vistorias (
    unidade_id, data, revisao, hora_inicio, hora_fim, clima, vistoriador, status, cliente_id, updated_at
  )
  values (
    unidade,
    case
      when coalesce(payload->>'data', '') ~ '^\d{4}-\d{2}-\d{2}' then (payload->>'data')::date
      else current_date
    end,
    coalesce(nullif(payload->>'revisao', ''), '00'),
    hora_inicio,
    hora_fim,
    clima,
    coalesce(payload->>'vistoriador', ''),
    status_vistoria,
    nullif(payload->>'id', ''),
    now()
  )
  on conflict (unidade_id, data, revisao) do update
    set hora_inicio = excluded.hora_inicio,
        hora_fim = excluded.hora_fim,
        clima = excluded.clima,
        vistoriador = excluded.vistoriador,
        status = excluded.status,
        cliente_id = coalesce(excluded.cliente_id, public.vistorias.cliente_id),
        updated_at = now()
  returning id into vistoria;

  for resposta in
    select jsonb_array_elements(coalesce(payload->'answers', '[]'::jsonb))
  loop
    marca := resposta->>'mark';
    if marca is null or marca = '' then
      marca := resposta->>'marca';
    end if;
    gravidade := coalesce(resposta->>'gravidade', '');
    if marca not in ('C', 'NC', 'NA') then
      continue;
    end if;
    if gravidade not in ('', 'L', 'M', 'C') then
      gravidade := '';
    end if;
    if not exists (select 1 from public.checklist_itens where codigo = resposta->>'codigo') then
      continue;
    end if;
    insert into public.vistoria_respostas (vistoria_id, codigo, marca, observacao, gravidade, sharepoint_path)
    values (
      vistoria,
      resposta->>'codigo',
      marca,
      coalesce(resposta->>'observacao', ''),
      gravidade,
      coalesce(resposta->>'sharepointPath', resposta->>'sharepoint_path', '')
    )
    on conflict (vistoria_id, codigo) do update
      set marca = excluded.marca,
          observacao = excluded.observacao,
          gravidade = excluded.gravidade,
          sharepoint_path = excluded.sharepoint_path;
  end loop;
end;
$$;

revoke all on function public.gravar_vistoria(jsonb) from public;
grant execute on function public.gravar_vistoria(jsonb) to anon, authenticated;

drop policy if exists condominios_anon_select on public.condominios;
create policy condominios_anon_select on public.condominios for select to anon using (true);

drop policy if exists blocos_anon_select on public.blocos;
create policy blocos_anon_select on public.blocos for select to anon using (true);

drop policy if exists unidades_anon_select on public.unidades;
create policy unidades_anon_select on public.unidades for select to anon using (true);

drop policy if exists checklist_itens_anon_select on public.checklist_itens;
create policy checklist_itens_anon_select on public.checklist_itens for select to anon using (true);

drop policy if exists vistorias_anon_select on public.vistorias;
create policy vistorias_anon_select on public.vistorias for select to anon using (true);

drop policy if exists vistoria_respostas_anon_select on public.vistoria_respostas;
create policy vistoria_respostas_anon_select on public.vistoria_respostas for select to anon using (true);
