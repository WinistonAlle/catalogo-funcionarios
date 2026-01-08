// src/hooks/useIsAdmin.ts
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export function useIsAdmin() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reason, setReason] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data: userData, error: uErr } = await supabase.auth.getUser();
      if (uErr) console.warn("getUser error:", uErr.message);

      if (!userData?.user) {
        if (mounted) {
          setIsAdmin(false);
          setReason("sem usuário logado");
          setLoading(false);
        }
        return;
      }

      const { data, error } = await supabase.rpc("is_current_admin");
      if (mounted) {
        if (error) {
          console.warn("RPC is_current_admin error:", error.message);
          setIsAdmin(false);
          setReason("erro RPC");
        } else {
          setIsAdmin(Boolean(data));
          setReason(Boolean(data) ? null : "não é admin");
        }
        setLoading(false);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async () => {
      const { data, error } = await supabase.rpc("is_current_admin");
      if (error) {
        setIsAdmin(false);
        setReason("erro RPC");
      } else {
        setIsAdmin(Boolean(data));
        setReason(Boolean(data) ? null : "não é admin");
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  return { isAdmin, loading, reason };
}
