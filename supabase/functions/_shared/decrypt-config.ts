/**
 * Shared helper to decrypt integration credentials stored via pgcrypto.
 *
 * Usage:
 *   const config = await decryptIntegrationConfig(supabase, integrationId);
 *
 * Falls back to plaintext `config` column when `config_encrypted` is null
 * (backward compatibility for integrations created before encryption was enabled).
 */

interface SupabaseClient {
  rpc: (fn: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  from: (table: string) => {
    select: (columns: string) => {
      eq: (col: string, val: unknown) => {
        single: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
        eq: (col2: string, val2: unknown) => {
          single: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
        };
      };
    };
  };
}

export async function decryptIntegrationConfig(
  supabase: SupabaseClient,
  integrationId: string,
): Promise<Record<string, unknown>> {
  const { data: row, error } = await supabase
    .from("integrations")
    .select("config, config_encrypted")
    .eq("id", integrationId)
    .single();

  if (error || !row) {
    throw new Error(`Integration not found: ${integrationId}`);
  }

  // If encrypted config exists, decrypt it
  if (row.config_encrypted) {
    const encryptionKey = Deno.env.get("INTEGRATION_ENCRYPTION_KEY");
    if (!encryptionKey) {
      console.warn("INTEGRATION_ENCRYPTION_KEY not set — falling back to plaintext config");
      return (row.config ?? {}) as Record<string, unknown>;
    }

    const { data: decrypted, error: decryptErr } = await supabase.rpc(
      "decrypt_integration_config",
      { encrypted: row.config_encrypted, encryption_key: encryptionKey },
    );

    if (decryptErr) {
      console.error("Decryption failed:", decryptErr.message);
      // Fall back to plaintext config if decryption fails
      return (row.config ?? {}) as Record<string, unknown>;
    }

    return (decrypted ?? {}) as Record<string, unknown>;
  }

  // No encrypted config — use plaintext (backward compat)
  return (row.config ?? {}) as Record<string, unknown>;
}

/**
 * Encrypts and stores config for an integration.
 * Stores encrypted version in config_encrypted and clears plaintext config.
 */
export async function encryptAndStoreConfig(
  supabase: { rpc: SupabaseClient["rpc"]; from: (t: string) => { update: (d: Record<string, unknown>) => { eq: (c: string, v: unknown) => Promise<{ error: { message: string } | null }> } } },
  integrationId: string,
  config: Record<string, unknown>,
): Promise<void> {
  const encryptionKey = Deno.env.get("INTEGRATION_ENCRYPTION_KEY");
  if (!encryptionKey) {
    // No encryption key — store as plaintext (backward compat)
    return;
  }

  const { data: encrypted, error } = await supabase.rpc("encrypt_integration_config", {
    plain_config: config,
    encryption_key: encryptionKey,
  });

  if (error) {
    console.error("Encryption failed:", error.message);
    return;
  }

  await supabase
    .from("integrations")
    .update({ config_encrypted: encrypted, config: {} })
    .eq("id", integrationId);
}
