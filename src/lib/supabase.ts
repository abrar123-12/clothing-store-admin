import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Public project values are baked in as defaults so the store works on a
// fresh Vercel deploy with zero manual env setup. Env vars still override.
// (The anon key is a public browser key — Row Level Security protects data.)
const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://sslrlrcxnojtpwfnjgxz.supabase.co";
const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzbHJscmN4bm9qdHB3Zm5qZ3h6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI3Mjc2MTAsImV4cCI6MjEwODMwMzYxMH0.BYPanMKsaYivRkti36J2JFdF_ojP5D3nFTEvsbMPaMU";

// Safe client: if env vars are missing (fresh deploy), export null instead of
// crashing. The storefront then renders with the built-in sample catalog.
export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null;

export const isSupabaseConfigured = Boolean(url && anonKey);
