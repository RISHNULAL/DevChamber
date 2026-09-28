create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role text not null default 'student' check (role in ('student','teacher','admin')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.classrooms (
  id uuid primary key default gen_random_uuid(), teacher_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 100), subject text, description text, batch text,
  join_code text not null unique, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.classroom_members (
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('teacher','student')), joined_at timestamptz not null default now(),
  primary key (classroom_id,user_id)
);
create table if not exists public.class_sessions (
  id uuid primary key default gen_random_uuid(), classroom_id uuid not null references public.classrooms(id) on delete cascade,
  started_by uuid not null references public.profiles(id), title text not null default 'Live class', started_at timestamptz not null default now(), ended_at timestamptz
);
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(), classroom_id uuid not null references public.classrooms(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade, title text not null default 'My Workspace', created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(classroom_id,owner_id)
);
create table if not exists public.workspace_files (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null, language text not null default 'plaintext', content text not null default '', updated_at timestamptz not null default now(), unique(workspace_id,name)
);
create table if not exists public.workspace_permissions (
  workspace_id uuid not null references public.workspaces(id) on delete cascade, user_id uuid not null references public.profiles(id) on delete cascade,
  permission text not null check(permission in ('owner','viewer','editor')), granted_by uuid references public.profiles(id), created_at timestamptz not null default now(), primary key(workspace_id,user_id)
);
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(), classroom_id uuid not null references public.classrooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade, body text not null check(char_length(body) between 1 and 2000), created_at timestamptz not null default now()
);
create table if not exists public.resources (
  id uuid primary key default gen_random_uuid(), classroom_id uuid not null references public.classrooms(id) on delete cascade,
  created_by uuid not null references public.profiles(id), title text not null, kind text not null check(kind in ('file','link')),
  storage_path text, url text, created_at timestamptz not null default now()
);
create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(), classroom_id uuid not null references public.classrooms(id) on delete cascade,
  created_by uuid not null references public.profiles(id), title text not null, description text not null default '', due_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists public.assessments (
  id uuid primary key default gen_random_uuid(), classroom_id uuid not null references public.classrooms(id) on delete cascade,
  created_by uuid not null references public.profiles(id), title text not null, description text not null default '', duration_minutes int not null default 15 check(duration_minutes between 1 and 360), status text not null default 'draft' check(status in ('draft','published','active','ended')), created_at timestamptz not null default now()
);
create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(), assessment_id uuid not null references public.assessments(id) on delete cascade,
  kind text not null check(kind in ('mcq','short_answer','coding')), prompt text not null, options jsonb not null default '[]'::jsonb,
  answer_key jsonb, points int not null default 1 check(points > 0), position int not null default 0
);
create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(), assessment_id uuid not null references public.assessments(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade, answers jsonb not null default '{}'::jsonb, score numeric, submitted_at timestamptz not null default now(), unique(assessment_id,student_id)
);
create index if not exists classroom_members_user_idx on public.classroom_members(user_id);
create index if not exists workspaces_owner_idx on public.workspaces(owner_id);
create index if not exists messages_classroom_time_idx on public.messages(classroom_id,created_at desc);
create index if not exists assessments_classroom_idx on public.assessments(classroom_id,created_at desc);
create index if not exists submissions_assessment_idx on public.submissions(assessment_id,submitted_at desc);

create or replace function public.create_profile_for_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id,full_name,role) values(new.id,coalesce(new.raw_user_meta_data->>'full_name',''),case when new.raw_user_meta_data->>'role'='teacher' then 'teacher' else 'student' end);
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.create_profile_for_new_user();

create or replace function public.is_classroom_member(target uuid) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.classroom_members where classroom_id=target and user_id=auth.uid()) $$;
create or replace function public.is_classroom_teacher(target uuid) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.classroom_members where classroom_id=target and user_id=auth.uid() and role='teacher') $$;
create or replace function public.is_classroom_owner(target uuid) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.classrooms where id=target and teacher_id=auth.uid()) $$;
create or replace function public.workspace_access(target uuid,write_access boolean default false) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.workspaces w left join public.workspace_permissions p on p.workspace_id=w.id and p.user_id=auth.uid() where w.id=target and (w.owner_id=auth.uid() or p.permission in ('owner','editor') and write_access or p.permission is not null and not write_access or exists(select 1 from public.classroom_members m where m.classroom_id=w.classroom_id and m.user_id=auth.uid() and m.role='teacher')))
$$;
alter table public.profiles enable row level security;
alter table public.classrooms enable row level security;
alter table public.classroom_members enable row level security;
alter table public.class_sessions enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_files enable row level security;
alter table public.workspace_permissions enable row level security;
alter table public.messages enable row level security;
alter table public.resources enable row level security;
alter table public.assignments enable row level security;
alter table public.assessments enable row level security;
alter table public.questions enable row level security;
alter table public.submissions enable row level security;

create policy "profiles readable by classmates" on public.profiles for select using (id=auth.uid() or exists(select 1 from public.classroom_members mine join public.classroom_members theirs using(classroom_id) where mine.user_id=auth.uid() and theirs.user_id=profiles.id));
create policy "users update own profile" on public.profiles for update using(id=auth.uid()) with check(id=auth.uid());
create policy "members view classroom" on public.classrooms for select using(public.is_classroom_member(id));
create policy "teachers create classroom" on public.classrooms for insert with check(teacher_id=auth.uid());
create policy "teachers update classroom" on public.classrooms for update using(public.is_classroom_teacher(id));
create policy "members view members" on public.classroom_members for select using(public.is_classroom_member(classroom_id));
create policy "self join by invitation validated by api" on public.classroom_members for insert with check(user_id=auth.uid() and role='student');
create policy "classroom creator added as teacher" on public.classroom_members for insert with check(user_id=auth.uid() and role='teacher' and public.is_classroom_owner(classroom_id));
create policy "teachers manage members" on public.classroom_members for delete using(public.is_classroom_teacher(classroom_id));
create policy "members view sessions" on public.class_sessions for select using(public.is_classroom_member(classroom_id));
create policy "teachers manage sessions" on public.class_sessions for all using(public.is_classroom_teacher(classroom_id)) with check(public.is_classroom_teacher(classroom_id));
create policy "workspace readers" on public.workspaces for select using(public.workspace_access(id,false));
create policy "members create workspace" on public.workspaces for insert with check(owner_id=auth.uid() and public.is_classroom_member(classroom_id));
create policy "workspace files readers" on public.workspace_files for select using(public.workspace_access(workspace_id,false));
create policy "workspace editors manage files" on public.workspace_files for all using(public.workspace_access(workspace_id,true)) with check(public.workspace_access(workspace_id,true));
create policy "workspace permission readers" on public.workspace_permissions for select using(public.workspace_access(workspace_id,false));
create policy "owners and classroom teachers manage permissions" on public.workspace_permissions for all using(exists(select 1 from public.workspaces w where w.id=workspace_id and (w.owner_id=auth.uid() or public.is_classroom_teacher(w.classroom_id)))) with check(exists(select 1 from public.workspaces w where w.id=workspace_id and (w.owner_id=auth.uid() or public.is_classroom_teacher(w.classroom_id))));
create policy "members view messages" on public.messages for select using(public.is_classroom_member(classroom_id));
create policy "members send messages" on public.messages for insert with check(user_id=auth.uid() and public.is_classroom_member(classroom_id));
create policy "members view resources" on public.resources for select using(public.is_classroom_member(classroom_id));
create policy "teachers manage resources" on public.resources for all using(public.is_classroom_teacher(classroom_id)) with check(public.is_classroom_teacher(classroom_id));
create policy "members view assignments" on public.assignments for select using(public.is_classroom_member(classroom_id));
create policy "teachers manage assignments" on public.assignments for all using(public.is_classroom_teacher(classroom_id)) with check(public.is_classroom_teacher(classroom_id));
create policy "members view published assessments" on public.assessments for select using(public.is_classroom_teacher(classroom_id) or public.is_classroom_member(classroom_id) and status in ('published','active','ended'));
create policy "teachers manage assessments" on public.assessments for all using(public.is_classroom_teacher(classroom_id)) with check(public.is_classroom_teacher(classroom_id));
create policy "members view published questions without keys" on public.questions for select using(exists(select 1 from public.assessments a where a.id=assessment_id and (public.is_classroom_teacher(a.classroom_id) or a.status in ('published','active','ended') and public.is_classroom_member(a.classroom_id))));
create policy "teachers manage questions" on public.questions for all using(exists(select 1 from public.assessments a where a.id=assessment_id and public.is_classroom_teacher(a.classroom_id))) with check(exists(select 1 from public.assessments a where a.id=assessment_id and public.is_classroom_teacher(a.classroom_id)));
create policy "students view own submissions teachers view class submissions" on public.submissions for select using(student_id=auth.uid() or exists(select 1 from public.assessments a where a.id=assessment_id and public.is_classroom_teacher(a.classroom_id)));
create policy "students submit own answers" on public.submissions for insert with check(student_id=auth.uid() and exists(select 1 from public.assessments a where a.id=assessment_id and a.status='active' and public.is_classroom_member(a.classroom_id)));
create policy "students update own submissions" on public.submissions for update using(student_id=auth.uid()) with check(student_id=auth.uid());

-- Students may read question prompts/options, never answer keys.
revoke select on public.questions from authenticated;
grant select(id,assessment_id,kind,prompt,options,points,position) on public.questions to authenticated;
revoke update on public.profiles from authenticated;
grant update(full_name) on public.profiles to authenticated;
revoke update on public.submissions from authenticated;
grant update(answers) on public.submissions to authenticated;
