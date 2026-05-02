import { onMessagePublished } from 'firebase-functions/v2/pubsub';
import { logger } from 'firebase-functions/v2';
import { google } from 'googleapis';

interface BudgetNotification {
  budgetDisplayName?: string;
  alertThresholdExceeded?: number;
  costAmount?: number;
  budgetAmount?: number;
  costIntervalStart?: string;
  currencyCode?: string;
}

export const billingKillSwitch = onMessagePublished('billing-kill-switch', async (event) => {
  const projectId = process.env.GCLOUD_PROJECT;
  if (!projectId) {
    logger.error('GCLOUD_PROJECT not set; cannot disable billing.');
    return;
  }
  const projectName = `projects/${projectId}`;

  const data = event.data.message.json as BudgetNotification | undefined;
  if (!data) {
    logger.warn('Billing notification arrived with no JSON payload.');
    return;
  }

  const cost = data.costAmount ?? 0;
  const budget = data.budgetAmount ?? 0;
  if (cost <= budget) {
    logger.info(`Cost ${cost} ${data.currencyCode ?? ''} within budget ${budget}; no action.`);
    return;
  }

  logger.warn(
    `Cost ${cost} ${data.currencyCode ?? ''} exceeds budget ${budget}; disabling billing for ${projectName}.`,
  );

  const auth = await google.auth.getClient({
    scopes: ['https://www.googleapis.com/auth/cloud-billing'],
  });
  google.options({ auth });

  const billing = google.cloudbilling('v1');
  const info = await billing.projects.getBillingInfo({ name: projectName });
  if (!info.data.billingEnabled) {
    logger.info('Billing already disabled.');
    return;
  }

  await billing.projects.updateBillingInfo({
    name: projectName,
    requestBody: { billingAccountName: '' },
  });

  logger.error(`Disabled billing on ${projectName} after budget overrun.`);
});
