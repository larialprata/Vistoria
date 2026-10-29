alter table public.perfis
  add column if not exists paginas text[] not null
  default array['painel', 'vistorias', 'obras', 'configuracoes'];

alter table public.perfis drop constraint if exists perfis_admin_acesso;
alter table public.perfis add constraint perfis_admin_acesso
  check (admin = false or acesso in ('web', 'ambos'));

alter table public.perfis drop constraint if exists perfis_email_permitido;
alter table public.perfis add constraint perfis_email_permitido
  check (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$');

create table if not exists public.sessoes_painel (
  token text primary key,
  email text not null,
  atualizado_em timestamptz not null default now()
);

alter table public.sessoes_painel enable row level security;

create or replace function public.preparar_usuario_dimensional()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is null then
    raise exception 'Informe um e-mail válido.';
  end if;
  new.email := lower(new.email);
  if current_setting('vistoria.cadastro', true) is distinct from 'painel' then
    if not (
      new.email ~* '^[^@[:space:]]+@dimensionalengenharia\.com$'
      or new.email = 'admin@exemplo.com'
    ) then
      raise exception 'Use o e-mail da Dimensional';
    end if;
  elsif new.email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Informe um e-mail válido.';
  end if;
  if new.email_confirmed_at is null then
    new.email_confirmed_at := now();
  end if;
  return new;
end;
$$;

create or replace function public.registrar_sessao(p_email text, p_senha text, p_token text)
returns void
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  conta auth.users;
  eh_admin boolean;
begin
  if coalesce(trim(p_token), '') = '' then
    raise exception 'Entre de novo como administrador.';
  end if;
  select * into conta
  from auth.users
  where lower(email) = lower(trim(coalesce(p_email, '')));
  if conta.id is null
     or conta.encrypted_password is null
     or conta.encrypted_password <> crypt(p_senha, conta.encrypted_password) then
    raise exception 'E-mail ou senha incorretos.';
  end if;
  select admin into eh_admin from public.perfis where id = conta.id;
  if not coalesce(eh_admin, false) then
    raise exception 'Só um administrador pode cadastrar pessoas.';
  end if;
  delete from public.sessoes_painel where email = lower(conta.email);
  insert into public.sessoes_painel (token, email) values (p_token, lower(conta.email));
end;
$$;

create or replace function public.salvar_pessoa(p_token text, payload jsonb)
returns void
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  email_admin text;
  email_pessoa text;
  nome_pessoa text;
  acesso_pessoa text;
  senha_pessoa text;
  eh_admin boolean;
  paginas_pessoa text[];
  usuario uuid;
  instancia uuid;
begin
  select email into email_admin from public.sessoes_painel where token = coalesce(p_token, '');
  if email_admin is null or not exists (
    select 1 from public.perfis where lower(email) = email_admin and admin
  ) then
    raise exception 'Entre de novo como administrador.';
  end if;

  email_pessoa := lower(trim(coalesce(payload->>'email', '')));
  nome_pessoa := trim(coalesce(payload->>'nome', ''));
  acesso_pessoa := payload->>'acesso';
  senha_pessoa := coalesce(payload->>'senha', '');
  eh_admin := coalesce((payload->>'administrador')::boolean, false);
  if email_pessoa = 'admin@exemplo.com' then
    eh_admin := true;
    acesso_pessoa := 'ambos';
  end if;
  if eh_admin and acesso_pessoa = 'app' then
    raise exception 'O administrador precisa entrar no painel.';
  end if;
  if nome_pessoa = '' then
    raise exception 'Informe o nome.';
  end if;
  if email_pessoa !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Informe um e-mail válido.';
  end if;
  if char_length(senha_pessoa) < 6 then
    raise exception 'A senha precisa ter pelo menos 6 caracteres.';
  end if;
  if acesso_pessoa not in ('web', 'app', 'ambos') then
    raise exception 'Escolha se a pessoa usa a web, o app ou os dois.';
  end if;
  if exists (select 1 from auth.users where lower(email) = email_pessoa) then
    raise exception 'Esse e-mail já está cadastrado.';
  end if;

  select coalesce(array_agg(item), array[]::text[]) into paginas_pessoa
  from jsonb_array_elements_text(coalesce(payload->'paginas', '[]'::jsonb)) as item
  where item in ('painel', 'vistorias', 'obras', 'configuracoes');
  if eh_admin or acesso_pessoa = 'app' or paginas_pessoa = array[]::text[] then
    paginas_pessoa := array['painel', 'vistorias', 'obras', 'configuracoes'];
  end if;

  select instance_id into instancia from auth.users where instance_id is not null limit 1;
  usuario := gen_random_uuid();
  perform set_config('vistoria.cadastro', 'painel', true);
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    coalesce(instancia, '00000000-0000-0000-0000-000000000000'),
    usuario,
    'authenticated',
    'authenticated',
    email_pessoa,
    crypt(senha_pessoa, gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('nome', nome_pessoa),
    now(),
    now(),
    '',
    '',
    '',
    ''
  );
  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id, created_at, updated_at
  ) values (
    gen_random_uuid(),
    usuario,
    jsonb_build_object('sub', usuario::text, 'email', email_pessoa),
    'email',
    usuario::text,
    now(),
    now()
  );

  update public.perfis
  set nome = nome_pessoa,
      acesso = acesso_pessoa,
      admin = eh_admin,
      paginas = paginas_pessoa
  where id = usuario;
  if not found then
    insert into public.perfis (id, nome, email, admin, acesso, paginas)
    values (usuario, nome_pessoa, email_pessoa, eh_admin, acesso_pessoa, paginas_pessoa);
  end if;
end;
$$;

create or replace function public.atualizar_pessoa(p_token text, payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  email_admin text;
  email_pessoa text;
  acesso_pessoa text;
  eh_admin boolean;
  paginas_pessoa text[];
begin
  select email into email_admin from public.sessoes_painel where token = coalesce(p_token, '');
  if email_admin is null or not exists (
    select 1 from public.perfis where lower(email) = email_admin and admin
  ) then
    raise exception 'Entre de novo como administrador.';
  end if;

  email_pessoa := lower(trim(coalesce(payload->>'email', '')));
  acesso_pessoa := payload->>'acesso';
  eh_admin := coalesce((payload->>'administrador')::boolean, false);
  if email_pessoa = 'admin@exemplo.com' then
    eh_admin := true;
    acesso_pessoa := 'ambos';
  end if;
  if eh_admin and acesso_pessoa = 'app' then
    raise exception 'O administrador precisa entrar no painel.';
  end if;
  if acesso_pessoa not in ('web', 'app', 'ambos') then
    raise exception 'Escolha se a pessoa usa a web, o app ou os dois.';
  end if;
  select coalesce(array_agg(item), array[]::text[]) into paginas_pessoa
  from jsonb_array_elements_text(coalesce(payload->'paginas', '[]'::jsonb)) as item
  where item in ('painel', 'vistorias', 'obras', 'configuracoes');
  if eh_admin or acesso_pessoa = 'app' or paginas_pessoa = array[]::text[] then
    paginas_pessoa := array['painel', 'vistorias', 'obras', 'configuracoes'];
  end if;

  update public.perfis
  set acesso = acesso_pessoa,
      admin = eh_admin,
      paginas = paginas_pessoa
  where lower(email) = email_pessoa;
  if not found then
    raise exception 'Usuário não encontrado no banco.';
  end if;
end;
$$;

revoke all on function public.registrar_sessao(text, text, text) from public;
revoke all on function public.salvar_pessoa(text, jsonb) from public;
revoke all on function public.atualizar_pessoa(text, jsonb) from public;
grant execute on function public.registrar_sessao(text, text, text) to anon, authenticated;
grant execute on function public.salvar_pessoa(text, jsonb) to anon, authenticated;
grant execute on function public.atualizar_pessoa(text, jsonb) to anon, authenticated;
