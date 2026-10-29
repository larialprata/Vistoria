alter table public.vistorias add column if not exists assinatura text;
alter table public.vistorias add column if not exists assinante text;
alter table public.vistorias add column if not exists situacao text;
alter table public.vistorias add column if not exists responsavel_obra text;
alter table public.vistorias add column if not exists assinatura_obra text;
alter table public.vistorias add column if not exists assinante_obra text;
alter table public.vistorias add column if not exists obra_em timestamptz;

alter table public.vistorias drop constraint if exists vistorias_situacao_check;
alter table public.vistorias
  add constraint vistorias_situacao_check
  check (situacao is null or situacao in ('obra', 'aprovado', 'liberado'));

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
  parecer_valor text;
  parecer_quando timestamptz;
  situacao_valor text;
  assinatura_valor text;
  assinatura_obra_valor text;
  obra_quando timestamptz;
begin
  nome_condominio := trim(coalesce(payload->>'empreendimento', ''));
  if nome_condominio in ('Condomínio IBGE', 'Condominio IBGE', 'IBGE') then
    nome_condominio := 'Mangueira IBGE';
  end if;
  if nome_condominio in ('Mangueira - Cond II', 'Mangueira II', 'Condominio II', 'Condomínio II') then
    nome_condominio := 'Condomínio II';
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
  parecer_valor := case
    when payload->>'parecer' in ('aprovada', 'reprovada') then payload->>'parecer'
    else null
  end;
  parecer_quando := case
    when coalesce(payload->>'parecerEm', '') ~ '^\d{4}-\d{2}-\d{2}' then (payload->>'parecerEm')::timestamptz
    else null
  end;
  situacao_valor := case
    when payload->>'situacao' in ('obra', 'aprovado', 'liberado') then payload->>'situacao'
    else null
  end;
  assinatura_valor := case
    when coalesce(payload->>'assinatura', '') like 'data:image%' then payload->>'assinatura'
    else null
  end;
  assinatura_obra_valor := case
    when coalesce(payload->>'assinaturaObra', '') like 'data:image%' then payload->>'assinaturaObra'
    else null
  end;
  obra_quando := case
    when coalesce(payload->>'obraEm', '') ~ '^\d{4}-\d{2}-\d{2}' then (payload->>'obraEm')::timestamptz
    else null
  end;

  insert into public.vistorias (
    unidade_id, data, revisao, hora_inicio, hora_fim, clima, vistoriador, status,
    parecer, parecer_em, situacao, assinatura, assinante, responsavel_obra,
    assinatura_obra, assinante_obra, obra_em, cliente_id, updated_at
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
    parecer_valor,
    parecer_quando,
    situacao_valor,
    assinatura_valor,
    nullif(payload->>'assinante', ''),
    nullif(payload->>'responsavelObra', ''),
    assinatura_obra_valor,
    nullif(payload->>'assinanteObra', ''),
    obra_quando,
    nullif(payload->>'id', ''),
    now()
  )
  on conflict (unidade_id, data, revisao) do update
    set hora_inicio = excluded.hora_inicio,
        hora_fim = excluded.hora_fim,
        clima = excluded.clima,
        vistoriador = excluded.vistoriador,
        status = case
          when coalesce(excluded.parecer, public.vistorias.parecer) is not null then 'concluida'
          else excluded.status
        end,
        parecer = coalesce(excluded.parecer, public.vistorias.parecer),
        parecer_em = coalesce(excluded.parecer_em, public.vistorias.parecer_em),
        situacao = coalesce(excluded.situacao, public.vistorias.situacao),
        assinatura = coalesce(excluded.assinatura, public.vistorias.assinatura),
        assinante = coalesce(nullif(excluded.assinante, ''), public.vistorias.assinante),
        responsavel_obra = coalesce(nullif(excluded.responsavel_obra, ''), public.vistorias.responsavel_obra),
        assinatura_obra = coalesce(excluded.assinatura_obra, public.vistorias.assinatura_obra),
        assinante_obra = coalesce(nullif(excluded.assinante_obra, ''), public.vistorias.assinante_obra),
        obra_em = coalesce(excluded.obra_em, public.vistorias.obra_em),
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

create or replace function public.decidir_vistoria(p_token text, payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  email_admin text;
  escolha text;
  situacao_valor text;
  alvo bigint;
begin
  select email into email_admin from public.sessoes_painel where token = coalesce(p_token, '');
  if email_admin is null or not exists (
    select 1 from public.perfis where lower(email) = email_admin and admin
  ) then
    raise exception 'Entre de novo como administrador.';
  end if;

  escolha := payload->>'parecer';
  if escolha not in ('aprovada', 'reprovada') then
    raise exception 'Escolha aprovar ou reprovar.';
  end if;
  situacao_valor := case
    when payload->>'situacao' in ('obra', 'aprovado', 'liberado') then payload->>'situacao'
    else 'obra'
  end;

  select id into alvo
  from public.vistorias
  where cliente_id = nullif(payload->>'id', '')
     or id::text = nullif(payload->>'id', '')
  order by case when cliente_id = nullif(payload->>'id', '') then 0 else 1 end
  limit 1;

  if alvo is null then
    raise exception 'Vistoria não encontrada.';
  end if;

  update public.vistorias
  set parecer = escolha,
      parecer_em = coalesce(
        case
          when coalesce(payload->>'parecerEm', '') ~ '^\d{4}-\d{2}-\d{2}' then (payload->>'parecerEm')::timestamptz
          else null
        end,
        parecer_em,
        now()
      ),
      status = 'concluida',
      situacao = situacao_valor,
      assinatura = coalesce(
        case when coalesce(payload->>'assinatura', '') like 'data:image%' then payload->>'assinatura' else null end,
        assinatura
      ),
      assinante = coalesce(nullif(payload->>'assinante', ''), assinante),
      responsavel_obra = coalesce(nullif(payload->>'responsavelObra', ''), responsavel_obra),
      assinatura_obra = coalesce(
        case when coalesce(payload->>'assinaturaObra', '') like 'data:image%' then payload->>'assinaturaObra' else null end,
        assinatura_obra
      ),
      assinante_obra = coalesce(nullif(payload->>'assinanteObra', ''), assinante_obra),
      obra_em = coalesce(
        case
          when coalesce(payload->>'obraEm', '') ~ '^\d{4}-\d{2}-\d{2}' then (payload->>'obraEm')::timestamptz
          else null
        end,
        obra_em
      ),
      updated_at = now()
  where id = alvo;
end;
$$;

revoke all on function public.decidir_vistoria(text, jsonb) from public;
grant execute on function public.decidir_vistoria(text, jsonb) to anon, authenticated;
