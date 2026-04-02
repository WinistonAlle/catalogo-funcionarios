create table if not exists public.admin_operation_logs (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  status text not null,
  actor_user_id uuid null,
  actor_employee_id uuid null,
  actor_cpf text null,
  actor_name text null,
  actor_role text null,
  target_month_key text null,
  message text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_operation_logs_action_check check (
    action in ('sync_employees', 'restore_employee_balances')
  ),
  constraint admin_operation_logs_status_check check (
    status in ('running', 'success', 'failed', 'blocked')
  )
);

create index if not exists admin_operation_logs_action_created_at_idx
  on public.admin_operation_logs (action, created_at desc);

create index if not exists admin_operation_logs_target_month_key_idx
  on public.admin_operation_logs (target_month_key);

create or replace function public.set_admin_operation_logs_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_admin_operation_logs_updated_at on public.admin_operation_logs;

create trigger trg_admin_operation_logs_updated_at
before update on public.admin_operation_logs
for each row
execute function public.set_admin_operation_logs_updated_at();
