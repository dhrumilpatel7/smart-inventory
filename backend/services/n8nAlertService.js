const crypto = require('crypto');
const env = require('../config/env');
const ReorderAlertState = require('../models/ReorderAlertState');
const reorderService = require('./reorderService');

const isEnabled = () => Boolean(env.n8n.webhookUrl && env.n8n.webhookSecret);

function alertPayload(item, horizon) {
  return {
    event: 'inventory.high_priority',
    eventId: crypto.randomUUID(),
    occurredAt: new Date().toISOString(),
    data: {
      productId: item.productId,
      productName: item.name,
      category: item.category,
      priority: item.priority,
      currentStock: item.currentStock,
      minimumStock: item.minimumStock,
      stockStatus: item.stockStatus,
      forecastHorizonDays: horizon,
      forecastDemand: item.forecastDemand,
      forecastDemandExact: item.forecastDemandExact,
      safetyStock: item.safetyStock,
      onOrder: item.onOrder,
      reorderQuantity: item.reorderQuantity,
      estimatedCost: item.estimatedCost,
      reason: item.reason,
    },
  };
}

async function deliverPendingAlerts() {
  if (!isEnabled()) return;
  const pending = await ReorderAlertState.find({ pendingAlert: { $ne: null } }).lean();
  for (const state of pending) {
    const event = state.pendingAlert;
    try {
      const response = await fetch(env.n8n.webhookUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-inventory-webhook-secret': env.n8n.webhookSecret,
          'idempotency-key': event.eventId,
        },
        body: JSON.stringify(event),
        signal: AbortSignal.timeout(env.n8n.timeoutMs),
      });
      if (!response.ok) throw new Error(`n8n webhook returned HTTP ${response.status}`);
      await ReorderAlertState.updateOne(
        { productId: state.productId, 'pendingAlert.eventId': event.eventId },
        { $set: { lastAlertedAt: new Date() }, $unset: { pendingAlert: '' } }
      );
    } catch (err) {
      // Leave the event pending. A later inventory change or restart will retry it.
      console.error(`Could not deliver the n8n reorder alert for ${state.productId}: ${err.message}`);
    }
  }
}

async function initializeBaseline() {
  if (!isEnabled()) return;
  const { items } = await reorderService.recommendations({ horizon: env.n8n.horizonDays });
  if (!items.length) return;
  await ReorderAlertState.bulkWrite(
    items.map((item) => ({
      updateOne: {
        filter: { productId: item.productId },
        update: { $setOnInsert: { productId: item.productId, priority: item.priority } },
        upsert: true,
      },
    }))
  );
  await deliverPendingAlerts();
}

async function checkForTransitions() {
  if (!isEnabled()) return;
  const { items } = await reorderService.recommendations({ horizon: env.n8n.horizonDays });

  for (const item of items) {
    const nextPriority = item.priority;
    const current = await ReorderAlertState.findOne({ productId: item.productId }).lean();
    if (!current) {
      // A product added after startup is baselined; it won't trigger an email until it later transitions.
      await ReorderAlertState.updateOne(
        { productId: item.productId },
        { $setOnInsert: { productId: item.productId, priority: nextPriority } },
        { upsert: true }
      );
      continue;
    }
    if (current.priority === nextPriority) continue;

    const entersAlertPriority = ['HIGH', 'CRITICAL'].includes(nextPriority) &&
      (!['HIGH', 'CRITICAL'].includes(current.priority) || (current.priority === 'HIGH' && nextPriority === 'CRITICAL'));
    const event = entersAlertPriority ? alertPayload(item, env.n8n.horizonDays) : null;
    const changed = await ReorderAlertState.updateOne(
      { productId: item.productId, priority: current.priority },
      { $set: { priority: nextPriority, ...(event ? { pendingAlert: event } : {}) } }
    );
    if (changed.modifiedCount === 0 && changed.matchedCount === 0) continue;
  }

  await deliverPendingAlerts();
}

function checkInBackground() {
  if (!isEnabled()) return;
  setImmediate(() => {
    checkForTransitions().catch((err) => console.error(`Could not evaluate n8n reorder alerts: ${err.message}`));
  });
}

module.exports = { isEnabled, initializeBaseline, checkForTransitions, checkInBackground };
