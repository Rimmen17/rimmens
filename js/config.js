// Connection to the Supabase project (Project Settings, API). The Rimmens shares the project
// with Krarim and Kririm; the rules in supabase/spaces.sql keep them apart (space "rimmens").
// The publishable key is meant to be public: access is enforced by the row level
// security rules, not by keeping this file secret.
// While supabaseUrl is empty the site runs in demo mode on local browser storage.
export const config = {
  supabaseUrl: 'https://rdabjsryzearizqbafpu.supabase.co',
  supabaseAnonKey: 'sb_publishable_WUhWksp7U4qkCj6kh3yZUg_B6AED-Ee',
  // Logins are by name. Supabase needs an email, so "Joan" signs in as joan@<loginDomain>.
  // The domain also decides the space (rimmens), so changing it later locks everyone out.
  loginDomain: 'rimmens.example',
  // Public half of the push sending key. Empty turns notifications off.
  vapidPublicKey: 'BIOiueA5LG19tYfKfiQZgHyc2GtGscA79XXiAQSxY-d5FDJQxxGo4gf-z1kSFsH4AgF7Zbik1njPAb2r8Czb2eg',
};
