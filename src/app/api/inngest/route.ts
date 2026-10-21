import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { functions } from "@/inngest/functions";

// Inngest signs its requests; INNGEST_SIGNING_KEY is verified by the SDK in production.
export const { GET, POST, PUT } = serve({ client: inngest, functions });
