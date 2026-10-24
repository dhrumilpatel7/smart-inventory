# High-priority reorder email alerts with n8n

The backend checks reorder priority after sales, stock movements, purchase-order changes, product changes, and successful forecast runs. It sends an alert when a product enters `HIGH` or `CRITICAL`, and when it escalates from `HIGH` to `CRITICAL`. Existing priority levels are recorded as a baseline when the backend starts, so setup does not email every product already needing a reorder.

The alert contains product name and ID, category, priority, current and minimum stock, stock status, forecast horizon and demand, safety stock, on-order units, reorder quantity, estimated cost, and the reason. Supplier contact details and customer data are not included.

## Create the n8n workflow

1. In n8n, choose **Workflows → Import from File** and select [`n8n-reorder-alerts.json`](./n8n-reorder-alerts.json).
2. Open **Validate Shared Secret**. Replace `REPLACE_WITH_A_LONG_RANDOM_SECRET` with a long random value. Keep it private.
3. Open **Send Reorder Email**. Set the verified sender and recipient email addresses. Configure the node with your SMTP credential. The node runs only after the shared-secret check passes.
4. Save and activate the workflow.
5. Open **Inventory Alert Webhook** and copy its **Production URL**. The workflow must be active for this URL to receive production requests.

## Configure the backend on Render

In the backend web service's **Environment** settings, add:

| Variable | Value |
| --- | --- |
| `N8N_REORDER_WEBHOOK_URL` | Production URL copied from the n8n Webhook node |
| `N8N_REORDER_WEBHOOK_SECRET` | The same private value configured in **Validate Shared Secret** |
| `N8N_REORDER_ALERT_HORIZON_DAYS` | `7` (or `30` if you want priorities based on 30-day demand) |

Save the environment settings and redeploy the backend. Do not put the secret in source control, a frontend variable, or a message. The backend sends a JSON POST with `X-Inventory-Webhook-Secret` and an idempotency key. Failed deliveries remain pending and are retried on a later alert check or backend restart. If n8n accepts a request but the response is lost before the backend receives it, a retry could send a duplicate email.

## Verify delivery

After the backend redeploys, use the n8n webhook's test listener only for a deliberate test payload. For production, create a safe test condition by lowering a test product's available stock, then review n8n **Executions** and the configured email inbox. Restore the test stock afterward. The production workflow responds immediately to the backend and processes the email in the background.

If no email arrives, check that the workflow is active, the Render URL is the **Production URL**, both shared-secret values match exactly, the email node has valid SMTP credentials, and the backend logs do not report a webhook failure.
