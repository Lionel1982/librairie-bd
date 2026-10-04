import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient.js";

export function useSession() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data?.session || null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess || null);
    });
    return () => { alive = false; sub?.subscription?.unsubscribe?.(); };
  }, []);

  return { session, user: session?.user || null, loading };
}
