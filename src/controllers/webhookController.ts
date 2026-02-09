import { NextFunction, Request, Response } from 'express';
import { SubscriptionService } from '../services/subscriptionService';
import { SUBSCRIPTION_STATUSES } from '../config/subscriptionConfig';
import { parseUTCDate } from '../lib/dateUtils';

/**
 * RevenueCat Webhook Event Types
 * @see https://www.revenuecat.com/docs/webhooks
 */
type RevenueCatEventType =
  | 'INITIAL_PURCHASE'
  | 'RENEWAL'
  | 'CANCELLATION'
  | 'UNCANCELLATION'
  | 'NON_RENEWING_PURCHASE'
  | 'SUBSCRIPTION_PAUSED'
  | 'EXPIRATION'
  | 'BILLING_ISSUE'
  | 'PRODUCT_CHANGE'
  | 'TEST';

interface RevenueCatWebhookEvent {
  event: {
    type: RevenueCatEventType;
    id: string;
    app_user_id: string;
    original_app_user_id: string;
    product_id: string;
    entitlement_ids: string[];
    expiration_at_ms: number;
    purchased_at_ms: number;
    store: 'APP_STORE' | 'PLAY_STORE' | 'STRIPE' | 'PROMOTIONAL';
    environment: 'SANDBOX' | 'PRODUCTION';
    presented_offering_id?: string;
    transaction_id?: string;
    original_transaction_id?: string;
    is_family_share?: boolean;
    period_type?: 'NORMAL' | 'TRIAL' | 'INTRO';
    cancel_reason?: string;
  };
  api_version: string;
}

export class WebhookController {
  private subscriptionService: SubscriptionService;

  constructor() {
    this.subscriptionService = new SubscriptionService();
  }

  /**
   * Verify webhook authorization
   * RevenueCat uses Bearer token authorization
   */
  private verifyWebhookAuth(req: Request): boolean {
    const webhookAuthKey = process.env.REVENUECAT_WEBHOOK_AUTH_KEY;

    if (!webhookAuthKey) {
      // eslint-disable-next-line no-console
      console.error('REVENUECAT_WEBHOOK_AUTH_KEY not configured');
      return false;
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return false;
    }

    const token = authHeader.substring(7);
    return token === webhookAuthKey;
  }

  /**
   * POST /api/subscription/webhook
   * Handle RevenueCat webhook events
   */
  handleWebhook = async (
    req: Request,
    res: Response,
    _next: NextFunction
  ): Promise<void> => {
    try {
      // Verify authorization
      if (!this.verifyWebhookAuth(req)) {
        // eslint-disable-next-line no-console
        console.error('Webhook authorization failed');
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const webhookData = req.body as RevenueCatWebhookEvent;
      const { event } = webhookData;

      // Log webhook event for debugging

      // Find the user - app_user_id should match our userId
      const userId =
        this.subscriptionService.findUserByRevenueCatAppUserId(
          event.app_user_id
        );

      if (!userId) {
        // User not found - return 200 to acknowledge receipt
        // Return 200 to acknowledge receipt (RevenueCat will retry on non-2xx)
        res
          .status(200)
          .json({ received: true, processed: false, reason: 'User not found' });
        return;
      }

      // Calculate expiration date (RevenueCat provides milliseconds since epoch)
      const expiresAt = parseUTCDate(
        new Date(event.expiration_at_ms).toISOString(),
        'webhookController.handleRevenueCatWebhook.expiration_at_ms'
      );

      // Create a unique RevenueCat ID from transaction
      const revenueCatId =
        event.original_transaction_id ?? event.transaction_id ?? event.id;

      // Handle different event types
      switch (event.type) {
        case 'INITIAL_PURCHASE':
        case 'RENEWAL':
        case 'UNCANCELLATION':
        case 'NON_RENEWING_PURCHASE':
          await this.handlePurchaseOrRenewal(userId, revenueCatId, expiresAt);
          break;

        case 'CANCELLATION':
          await this.handleCancellation(userId, revenueCatId, expiresAt);
          break;

        case 'EXPIRATION':
        case 'BILLING_ISSUE':
          await this.handleExpiration(userId, revenueCatId);
          break;

        case 'PRODUCT_CHANGE':
          await this.handleProductChange(userId, revenueCatId, expiresAt);
          break;

        case 'SUBSCRIPTION_PAUSED':
          // Treat paused as cancelled for now
          await this.handleCancellation(userId, revenueCatId, expiresAt);
          break;

        case 'TEST':
          // Test event received
          break;

        default:
          // Unhandled event type: ${event.type}
      }

      res.status(200).json({ received: true, processed: true });
    } catch (error) {
      // Error processing webhook
      void error; // Mark error as intentionally unused
      // Return 200 to prevent retries for processing errors
      // RevenueCat will retry on 5xx errors
      res
        .status(200)
        .json({ received: true, processed: false, error: 'Processing error' });
    }
  };

  /**
   * Handle purchase or renewal events
   */
  private async handlePurchaseOrRenewal(
    userId: string,
    revenueCatId: string,
    expiresAt: Date
  ): Promise<void> {
    // Processing purchase/renewal for user

    // Upsert the subscription (will convert internal trial to RevenueCat if exists)
    await this.subscriptionService.upsertRevenueCatSubscription(
      userId,
      revenueCatId,
      expiresAt,
      SUBSCRIPTION_STATUSES.ACTIVE
    );

    // Subscription activated for user
  }

  /**
   * Handle cancellation events
   * User cancelled but still has access until expiration
   */
  private async handleCancellation(
    userId: string,
    revenueCatId: string,
    expiresAt: Date
  ): Promise<void> {
    // Processing cancellation

    const updated = await this.subscriptionService.updateSubscriptionStatus(
      revenueCatId,
      SUBSCRIPTION_STATUSES.CANCELLED,
      expiresAt
    );

    if (!updated) {
      await this.subscriptionService.updateLatestRevenueCatSubscriptionForUser(
        userId,
        SUBSCRIPTION_STATUSES.CANCELLED,
        expiresAt
      );
    }

    // Subscription marked as cancelled
  }

  /**
   * Handle expiration events
   * Subscription has fully expired
   */
  private async handleExpiration(
    userId: string,
    revenueCatId: string
  ): Promise<void> {
    // Processing expiration

    const updated = await this.subscriptionService.updateSubscriptionStatus(
      revenueCatId,
      SUBSCRIPTION_STATUSES.EXPIRED
    );

    if (!updated) {
      await this.subscriptionService.updateLatestRevenueCatSubscriptionForUser(
        userId,
        SUBSCRIPTION_STATUSES.EXPIRED
      );
    }

    // Subscription marked as expired
  }

  /**
   * Handle product change events (upgrade/downgrade)
   */
  private async handleProductChange(
    userId: string,
    revenueCatId: string,
    expiresAt: Date
  ): Promise<void> {
    // Processing product change for user

    // For now, treat product changes as renewals
    await this.subscriptionService.upsertRevenueCatSubscription(
      userId,
      revenueCatId,
      expiresAt,
      SUBSCRIPTION_STATUSES.ACTIVE
    );

    // Product change processed for user
  }
}
