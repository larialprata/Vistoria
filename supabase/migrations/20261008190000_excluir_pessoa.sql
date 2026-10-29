create or replace function public.excluir_pessoa(p_token text, payload jsonb)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  email_admin text;
  email_pessoa text;
  usuario uuid;
begin
  select email into email_admin from public.sessoes_painel where token = coalesce(p_token, '');
  if email_admin is null or not exists (
    select 1 from public.perfis where lower(email) = email_admin and admin
  ) then
    raise exception 'Entre de novo como administrador.';
  end if;

  email_pessoa := lower(trim(coalesce(payload->>'email', '')));
  if email_pessoa = '' then
    raise exception 'Usuário não encontrado.';
  end if;
  if email_pessoa = 'admin@exemplo.com' then
    raise exception 'A conta principal não pode ser excluída.';
  end if;
  if email_pessoa = email_admin then
    raise exception 'Você não pode excluir a própria conta.';
  end if;

  select id into usuario from auth.users where lower(email) = email_pessoa;
  if usuario is null then
    return;
  end if;

  if exists (select 1 from public.perfis where id = usuario and admin)
     and not exists (
       select 1 from public.perfis where admin and lower(email) <> email_pessoa
     ) then
    raise exception 'Tem que restar pelo menos um administrador.';
  end if;

  delete from public.sessoes_painel where email = email_pessoa;
  delete from auth.users where id = usuario;
end;
$$;

revoke all on function public.excluir_pessoa(text, jsonb) from public;
grant execute on function public.excluir_pessoa(text, jsonb) to anon, authenticated;
