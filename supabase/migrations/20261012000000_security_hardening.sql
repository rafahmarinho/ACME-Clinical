-- Security hardening flagged by the Supabase database linter.
-- * Pin the search_path of the updated_at trigger function.
-- * handle_new_user only runs as an auth trigger; it must not be callable through the API.
-- * current_app_role is used by RLS policies for signed-in users, so only `authenticated` keeps EXECUTE.
alter function public.touch_updated_at() set search_path = '';
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.current_app_role() from public, anon;
grant execute on function public.current_app_role() to authenticated;
