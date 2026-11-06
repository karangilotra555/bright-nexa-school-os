CREATE TABLE IF NOT EXISTS public.school_teacher_drafts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE RESTRICT,
 author_school_user_id uuid NOT NULL,
 tool text NOT NULL CHECK (char_length(tool) BETWEEN 1 AND 100),
 class_label text NOT NULL CHECK (char_length(class_label) BETWEEN 1 AND 100),
 subject text NOT NULL CHECK (char_length(subject) BETWEEN 1 AND 120),
 topic text NOT NULL CHECK (char_length(topic) BETWEEN 1 AND 160),
 language text NOT NULL DEFAULT 'English' CHECK (language IN ('English','Hindi','Bilingual')),
 content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 20000),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (author_school_user_id,institution_id) REFERENCES public.school_users(id,institution_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS school_teacher_drafts_author_idx ON public.school_teacher_drafts(institution_id,author_school_user_id,created_at DESC);
ALTER TABLE public.school_teacher_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.school_teacher_drafts FROM PUBLIC,anon;
GRANT SELECT, INSERT ON public.school_teacher_drafts TO authenticated;
CREATE POLICY school_teacher_drafts_own_read ON public.school_teacher_drafts
 FOR SELECT TO authenticated
 USING (EXISTS (
  SELECT 1 FROM public.school_users su WHERE su.id=school_teacher_drafts.author_school_user_id
   AND su.institution_id=school_teacher_drafts.institution_id
   AND su.auth_user_id=(SELECT auth.uid()) AND su.status='active'
   AND su.role IN ('school_admin','principal','teacher')
 ));
CREATE POLICY school_teacher_drafts_own_insert ON public.school_teacher_drafts
 FOR INSERT TO authenticated
 WITH CHECK (EXISTS (
  SELECT 1 FROM public.school_users su WHERE su.id=school_teacher_drafts.author_school_user_id
   AND su.institution_id=school_teacher_drafts.institution_id
   AND su.auth_user_id=(SELECT auth.uid()) AND su.status='active'
   AND su.role IN ('school_admin','principal','teacher')
 ));
COMMENT ON TABLE public.school_teacher_drafts IS 'Private school-scoped working drafts only. The school must approve before publishing. Supabase canonical; no browser primary copies.';
