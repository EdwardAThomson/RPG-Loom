export interface Env {
  /** Workers AI binding: the free AI pool. */
  AI: Ai;
  /** RPG Loom's Postgres (`rpg_loom` database on the Hetzner games box), via Hyperdrive. */
  HYPERDRIVE: Hyperdrive;
  ENVIRONMENT?: string;
  /** Octonion hub's Supabase project URL; its JWKS verifies sign-ins. */
  OCTONION_SUPABASE_URL?: string;
  /** Octonion hub site, for GET /api/me/entitlements. Defaults to https://octonion.io. */
  HUB_URL?: string;
  /** OpenRouter key for the members AI pool (`wrangler secret put OPENROUTER_API_KEY`). Optional. */
  OPENROUTER_API_KEY?: string;
  /** Comma-separated extra CORS origins (e.g. a custom domain). */
  ALLOWED_ORIGINS?: string;
}

export type AuthVariables = {
  /** Hub user id (JWT `sub`). */
  hubUserId: string;
  /** The verified hub JWT, forwarded to the hub for entitlements. */
  hubJwt: string;
  displayName?: string;
};

export type AppEnv = { Bindings: Env; Variables: AuthVariables };
