// src/hooks/useProfile.ts
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type Profile = {
  user_id: string;
  full_name: string | null;
  role: "admin" | "employee";
  active: boolean;
};

export function useProfile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchProfile() {
    const { data: uw } = await supabase.auth.getUser();
    const user = uw?.user;
    if (!user) { setProfile(null); setLoading(false); return; }

    const { data, error } = await supabase.rpc("get_current_profile");
    if (!error && data && data.length > 0) {
      const row = data[0] as any;
      setProfile({
        user_id: row.user_id,
        full_name: row.full_name ?? user.email ?? null,
        role: (row.role ?? "employee") as "admin" | "employee",
        active: row.active ?? true,
      });
    } else {
      // fallback mínimo (ainda mostra algo mesmo sem linha em profiles)
      setProfile({
        user_id: user.id,
        full_name: (user.user_metadata as any)?.full_name || user.email || null,
        role: "employee",
        active: true,
      });
    }
    setLoading(false);
  }

  useEffect(() => {
    setLoading(true);
    fetchProfile();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      setLoading(true);
      fetchProfile();
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return { profile, loading };
}
