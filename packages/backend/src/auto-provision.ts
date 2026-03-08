import type { PrismaClient } from '../generated/prisma/index.js';
import { SshQueryClient } from './bot-engine/ssh-query-client.js';
import { encrypt } from './utils/crypto.js';
import { parseQueryResponse } from '@ts6/common';

/**
 * On the very first boot of the bundled stack, auto-provision the TS6 server
 * connection: SSH into the TS6 server query, generate a manage-scoped API key,
 * encrypt it, and persist it as a TsServerConfig.
 *
 * Safe to call every boot — exits immediately if a config for this host already
 * exists. Triggered only when TS_AUTOCONFIG_HOST + TS_AUTOCONFIG_SSH_PASSWORD
 * are set (i.e. in the bundled docker-compose).
 *
 * connectionPool.initialize() runs right after this in index.ts, so we only
 * need to write the DB record here — the pool load happens automatically.
 */
export async function autoProvision(prisma: PrismaClient): Promise<void> {
  const host        = process.env.TS_AUTOCONFIG_HOST;
  const sshPassword = process.env.TS_AUTOCONFIG_SSH_PASSWORD;

  if (!host || !sshPassword) return;

  const sshPort  = parseInt(process.env.TS_AUTOCONFIG_SSH_PORT  || '10022');
  const httpPort = parseInt(process.env.TS_AUTOCONFIG_HTTP_PORT || '10080');
  const name     = process.env.TS_AUTOCONFIG_NAME || 'TeamSpeak Server';

  // Skip if this specific host:port is already in the DB (idempotent on every boot)
  const existing = await prisma.tsServerConfig.findFirst({
    where: { host, webqueryPort: httpPort },
  });
  if (existing) return;

  console.log('[AutoProvision] No config for bundled TS6 server — connecting to generate API key...');

  const ssh = new SshQueryClient({ host, port: sshPort, username: 'serveradmin', password: sshPassword });

  // TS6 may still be initialising — retry SSH with backoff for up to ~90 s
  let connected = false;
  for (let attempt = 1; attempt <= 12; attempt++) {
    try {
      await ssh.connect();
      connected = true;
      break;
    } catch (err: any) {
      if (attempt === 12) {
        console.error('[AutoProvision] Failed to connect to TS6 SSH after 12 attempts:', err.message);
        ssh.destroy();
        return;
      }
      const delay = Math.min(5000 + attempt * 3000, 30000);
      console.log(`[AutoProvision] TS6 SSH not ready (attempt ${attempt}/12), retrying in ${delay / 1000}s…`);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  if (!connected) return;

  try {
    // Generate a never-expiring manage-scope WebQuery API key
    const raw = await ssh.executeCommand('apikeyadd scope=manage lifetime=0');
    const parsed = parseQueryResponse(raw)[0] || {};
    const apiKey = parsed.apikey;

    if (!apiKey) {
      console.error('[AutoProvision] TS6 did not return an apikey in response:', raw);
      return;
    }

    await prisma.tsServerConfig.create({
      data: {
        name,
        host,
        webqueryPort: httpPort,
        apiKey: encrypt(apiKey),
        useHttps: false,
        enabled: true,
      },
    });

    console.log(`[AutoProvision] Done — created server config "${name}" → ${host}:${httpPort}`);
  } catch (err: any) {
    console.error('[AutoProvision] Error during provisioning:', err.message);
  } finally {
    ssh.destroy();
  }
}
