CREATE TABLE public.campaign_saves (
  user_id uuid PRIMARY KEY,
  save_data jsonb NOT NULL,
  saved_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_saves TO authenticated;
GRANT ALL ON public.campaign_saves TO service_role;

ALTER TABLE public.campaign_saves ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players read their own save" ON public.campaign_saves
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Players create their own save" ON public.campaign_saves
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Players update their own save" ON public.campaign_saves
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Players delete their own save" ON public.campaign_saves
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.touch_campaign_saves_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER campaign_saves_touch_updated_at
BEFORE UPDATE ON public.campaign_saves
FOR EACH ROW EXECUTE FUNCTION public.touch_campaign_saves_updated_at();