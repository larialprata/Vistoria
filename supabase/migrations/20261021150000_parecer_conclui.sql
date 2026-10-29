create or replace function public.decidir_vistoria(p_token text, payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  email_admin text;
  escolha text;
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
      parecer_em = now(),
      status = 'concluida',
      updated_at = now()
  where id = alvo;
end;
$$;
