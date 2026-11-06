ALTER TABLE public.school_users ADD COLUMN IF NOT EXISTS display_name text NOT NULL DEFAULT '';
ALTER TABLE public.school_users ADD CONSTRAINT school_users_display_name_length CHECK (char_length(display_name) <= 120);
GRANT SELECT(display_name), UPDATE(display_name) ON public.school_users TO authenticated;
COMMENT ON COLUMN public.school_users.display_name IS 'Cloud-backed display name, school admins can edit within existing tenant RLS. Self-service users may set Supabase Auth profile metadata; never authorize using display names.';
