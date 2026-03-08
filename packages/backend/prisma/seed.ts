import { PrismaClient } from '../generated/prisma/index.js';
import { encrypt } from '../src/utils/crypto.js';

const prisma = new PrismaClient();

async function main() {
  // Seed default app settings (no default admin — use /setup wizard instead)
  await prisma.appSetting.upsert({
    where: { key: 'max_music_bots' },
    update: {},
    create: { key: 'max_music_bots', value: '5' },
  });

  // Auto-configure a bundled TeamSpeak server connection when the bundled
  // docker-compose is used. Only creates the config on the very first boot
  // (when no server configs exist yet) so this stays idempotent.
  const autoHost   = process.env.TS_AUTOCONFIG_HOST;
  const autoApiKey = process.env.TS_AUTOCONFIG_APIKEY;

  if (autoHost && autoApiKey) {
    const existing = await prisma.tsServerConfig.count();
    if (existing === 0) {
      await prisma.tsServerConfig.create({
        data: {
          name:         process.env.TS_AUTOCONFIG_NAME   || 'TeamSpeak Server',
          host:         autoHost,
          webqueryPort: parseInt(process.env.TS_AUTOCONFIG_PORT  || '10080'),
          apiKey:       encrypt(autoApiKey),
          useHttps:     process.env.TS_AUTOCONFIG_HTTPS === 'true',
          enabled:      true,
        },
      });
      console.log('[seed] Auto-configured TeamSpeak server connection →', autoHost);
    }
  }

  console.log('Seed completed. Visit /setup to create your admin account.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
