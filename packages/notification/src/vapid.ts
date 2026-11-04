export type VapidConfig = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

export function readVapidConfig(env: NodeJS.ProcessEnv = process.env): VapidConfig | null {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();
  const subject = env.VAPID_SUBJECT?.trim() || 'mailto:ops@example.com';
  if (!publicKey || !privateKey) {
    return null;
  }
  return { publicKey, privateKey, subject };
}

/**
 * Minimal web-push sender using the `web-push` package when installed/configured.
 * Returns null when VAPID is unset so local memory mode stays dependency-light.
 */
export async function createWebPushSender(
  env: NodeJS.ProcessEnv = process.env,
): Promise<import('./publisher.js').WebPushSender | null> {
  const config = readVapidConfig(env);
  if (!config) {
    return null;
  }

  try {
    const webpush = await import('web-push');
    webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
    return {
      async send(subscription, payload) {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: subscription.keys,
          },
          JSON.stringify(payload),
        );
      },
    };
  } catch {
    // web-push may be absent in some installs; in-app notifications still work.
    return null;
  }
}
