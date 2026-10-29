create or replace function public.excluir_vistoria(p_token text, payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  email_admin text;
  alvo_id text;
begin
  select email into email_admin from public.sessoes_painel where token = coalesce(p_token, '');
  if email_admin is null or not exists (
    select 1 from public.perfis where lower(email) = email_admin and admin
  ) then
    raise exception 'Entre de novo como administrador.';
  end if;

  alvo_id := nullif(payload->>'id', '');
  if alvo_id is null then
    raise exception 'Vistoria sem identificador.';
  end if;

  delete from public.vistoria_respostas
  where vistoria_id in (
    select id from public.vistorias
    where cliente_id = alvo_id or id::text = alvo_id
  );

  delete from public.vistorias
  where cliente_id = alvo_id or id::text = alvo_id;
end;
$$;

revoke all on function public.excluir_vistoria(text, jsonb) from public;
grant execute on function public.excluir_vistoria(text, jsonb) to anon, authenticated;
