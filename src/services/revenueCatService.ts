interface RevenueCatEntitlement {
  expires_date?: string | null;
  unsubscribe_detected_at?: string | null;
}

interface RevenueCatSubscriber {
  entitlements?: Record<string, RevenueCatEntitlement>;
}

interface RevenueCatSubscriberResponse {
  subscriber?: RevenueCatSubscriber;
}

export interface RevenueCatVerificationResult {
  configured: boolean;
  entitlementId: string | null;
  isActive: boolean;
  isCancelled: boolean;
  expiresAt: Date | null;
}

export class RevenueCatService {
  private readonly baseUrl = 'https://api.revenuecat.com/v1';

  async verifyActiveEntitlement(userId: string): Promise<RevenueCatVerificationResult> {
    const apiKey = process.env.REVENUECAT_SECRET_API_KEY;
    const entitlementId = process.env.PUBLIC_REVENUECAT_ENTITLEMENT_ID ?? null;

    if (!apiKey || !entitlementId) {
      return {
        configured: false,
        entitlementId,
        isActive: false,
        isCancelled: false,
        expiresAt: null,
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(
        `${this.baseUrl}/subscribers/${encodeURIComponent(userId)}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: 'application/json',
          },
          signal: controller.signal,
        }
      );

      if (response.status === 404) {
        return {
          configured: true,
          entitlementId,
          isActive: false,
          isCancelled: false,
          expiresAt: null,
        };
      }

      if (!response.ok) {
        throw new Error(`RevenueCat verify failed with status ${response.status}`);
      }

      const payload = (await response.json()) as RevenueCatSubscriberResponse;
      const entitlement = payload.subscriber?.entitlements?.[entitlementId] ?? null;

      if (!entitlement) {
        return {
          configured: true,
          entitlementId,
          isActive: false,
          isCancelled: false,
          expiresAt: null,
        };
      }

      const expiresAt = entitlement.expires_date
        ? new Date(entitlement.expires_date)
        : new Date('9999-12-31T23:59:59.000Z');

      if (Number.isNaN(expiresAt.getTime())) {
        return {
          configured: true,
          entitlementId,
          isActive: false,
          isCancelled: false,
          expiresAt: null,
        };
      }

      const isActive = expiresAt.getTime() > Date.now();

      return {
        configured: true,
        entitlementId,
        isActive,
        isCancelled: Boolean(entitlement.unsubscribe_detected_at),
        expiresAt,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
