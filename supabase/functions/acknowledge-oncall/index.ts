// Supabase Edge Function: Acknowledge On-Call Notification
// Deploy with: supabase functions deploy acknowledge-oncall --no-verify-jwt

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

// Redirect to the roster app with acknowledgement status
const ROSTER_APP_URL = "https://ruthabea.github.io/mod-roster-app";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "*",
      },
    });
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return Response.redirect(`${ROSTER_APP_URL}?ack=error&msg=config`, 302);
    }

    const url = new URL(req.url);
    const token = url.searchParams.get("token");

    if (!token) {
      return Response.redirect(`${ROSTER_APP_URL}?ack=error&msg=invalid`, 302);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: ackRecord, error: fetchError } = await supabase
      .from("acknowledgements")
      .select("*")
      .eq("token", token)
      .single();

    if (fetchError || !ackRecord) {
      return Response.redirect(`${ROSTER_APP_URL}?ack=error&msg=notfound`, 302);
    }

    if (ackRecord.acknowledged) {
      const name = encodeURIComponent(ackRecord.person_name);
      return Response.redirect(`${ROSTER_APP_URL}?ack=already&name=${name}`, 302);
    }

    const acknowledgedAt = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("acknowledgements")
      .update({ acknowledged: true, acknowledged_at: acknowledgedAt })
      .eq("token", token);

    if (updateError) {
      return Response.redirect(`${ROSTER_APP_URL}?ack=error&msg=update`, 302);
    }

    const name = encodeURIComponent(ackRecord.person_name);
    return Response.redirect(`${ROSTER_APP_URL}?ack=success&name=${name}`, 302);

  } catch (error) {
    return Response.redirect(`${ROSTER_APP_URL}?ack=error&msg=exception`, 302);
  }
});
