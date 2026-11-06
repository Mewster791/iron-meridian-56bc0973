import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import type { Json } from "@/integrations/supabase/types";
import { CampaignSave, isValidCampaignSave } from "./campaignSaveSystem";

export async function fetchCloudSave(userId: string): Promise<CampaignSave | null> {
  const { data, error } = await supabase
    .from("campaign_saves")
    .select("save_data")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return isValidCampaignSave(data.save_data) ? (data.save_data as unknown as CampaignSave) : null;
}

export async function pushCloudSave(userId: string, save: CampaignSave): Promise<boolean> {
  const { error } = await supabase.from("campaign_saves").upsert({
    user_id: userId,
    save_data: save as unknown as Json,
    saved_at: save.savedAt,
  });
  return !error;
}

export async function signInWithGoogle(): Promise<string | null> {
  const result = await lovable.auth.signInWithOAuth("google", {
    redirect_uri: window.location.origin,
  });
  if (result.error) return result.error.message ?? "Sign-in failed";
  return null;
}

export async function signOutPlayer(): Promise<void> {
  await supabase.auth.signOut();
}

/** Signed-in player (or null for guests). Listens once for sign-in / sign-out. */
export function usePlayerAccount(): { user: User | null; ready: boolean } {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) {
        setUser(data.user ?? null);
        setReady(true);
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      setUser(session?.user ?? null);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { user, ready };
}
