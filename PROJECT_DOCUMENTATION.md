# Smart Inventory & Demand Forecasting System — Project Documentation

## 1. Introduction

Shops and distributors lose money in two opposite ways: they run out of products customers want (lost sales), or they hold too much stock (blocked money, storage cost). Both problems come from not knowing how much will sell in the coming days.

This project is a web application that combines a **database management system** with **machine learning**. It records products, suppliers, sales and stock movements in MongoDB, learns the daily demand of each product from the sales history, forecasts the next 7 and 30 days, and recommends how many units of each product to reorder.

## 2. Problem Statement

Small and medium businesses usually manage inventory with spreadsheets or simple billing software. These tools show what happened in the past but do not answer:

- Which products are about to run out?
- How many units will each product sell next week or next month?
- How many units should be ordered now, and from which supplier?

The problem is to build an integrated system that stores inventory data reliably and uses it to forecast demand and recommend reorder quantities.

## 3. Objectives

1. Design a MongoDB database for suppliers, products, sales and inventory transactions with validated relationships.
2. Import the four real CSV datasets safely (no duplicates, no orphan records).
3. Provide secure REST APIs (JWT authentication) for all operations.
4. Keep stock consistent: a sale must reduce stock and create an OUT transaction atomically.
5. Forecast daily demand per product with a scikit-learn model, evaluated with MAE, RMSE and MAPE.
6. Calculate reorder quantities from the forecast with a transparent formula.
7. Present everything in a React dashboard with live charts.

## 4. Existing System

| Existing approach | Limitation |
|---|---|
| Paper registers / spreadsheets | Manual, error-prone, no validation, no relationships between sheets |
| Simple billing software | Records sales but gives no forecast |
| Fixed minimum-stock rule only | Reacts after stock is already low; ignores how fast a product sells |
| Reordering by experience | Depends on one person's memory; not explainable |

## 5. Proposed System

A four-part system:

- **MongoDB** stores all records.
- **Node.js + Express** provides the REST API, authentication, business rules and the reorder calculation.
- **Python (pandas, scikit-learn)** prepares the data, trains and evaluates models, and predicts future demand.
- **React** shows forms, tables and charts.

Advantages: one consistent source of data, automatic stock updates, demand forecasts with measured accuracy, and reorder recommendations that explain their reason.

## 6. Scope

**In scope:** product and supplier management, sales recording, inventory transaction history, analytics, demand forecasting for 7 and 30 days, reorder recommendations, purchase orders, user login.

**Out of scope:** billing/invoicing, payments, GST, multiple warehouses, barcode scanning, supplier price lists, real-time notifications.

## 7. Functional Requirements

| ID | Requirement |
|---|---|
| FR1 | Users can register and log in; all data APIs require a valid token. |
| FR2 | Users can list, search, filter, sort, add and edit products; administrators can delete them. |
| FR3 | Users can manage suppliers and see how many products each supplies. |
| FR4 | Users can record a sale; the system checks stock, reduces it and records an OUT transaction. |
| FR5 | Users can record manual IN/OUT stock movements and browse the transaction history with filters. |
| FR6 | The system imports the four CSV datasets, rejecting invalid and orphan rows with a report. |
| FR7 | The system computes dashboard and analytics figures from MongoDB. |
| FR8 | Users can run the ML forecast and view history, forecast and accuracy for each product. |
| FR9 | The system recommends reorder quantities with a reason; users can create purchase orders. |
| FR10 | Receiving a purchase order adds stock and records an IN transaction. |

## 8. Non-Functional Requirements

| Category | Requirement |
|---|---|
| Consistency | Multi-step updates (sale, stock movement, order receipt) are atomic. Stock can never go below zero. |
| Security | Passwords are hashed with bcrypt; JWT protects APIs; secrets are in environment variables; inputs are validated; CORS is restricted; error responses do not leak internals. |
| Performance | Indexed queries; dashboard loads in well under a second on the dataset; a forecast run takes about 3 seconds. |
| Usability | Responsive layout, loading/empty/error states, confirmation dialogs, clear messages. |
| Maintainability | Layered backend (routes → controllers → services → models); ML isolated in one Python file. |
| Reliability | Python failures, timeouts and empty data are handled and reported; failed runs never replace a good forecast. |

## 9. Technology Stack

| Layer | Technology | Why |
|---|---|---|
| Frontend | React 18, React Router, Axios, Recharts, CSS, Vite | Component-based UI, simple charting |
| Backend | Node.js, Express, Mongoose | JavaScript end-to-end, natural fit with JSON and MongoDB |
| Security | jsonwebtoken, bcrypt, helmet, cors, express-rate-limit | Standard, small libraries |
| Database | MongoDB 7 | Flexible documents, powerful aggregation pipeline, transactions |
| ML | Python, pandas, NumPy, scikit-learn, pymongo | The standard data-science toolset |

## 10. System Architecture

```
React (browser) ──REST/JSON + JWT──► Express API ──Mongoose──► MongoDB
                                         │
                                         └── spawn() ──► python forecast.py ──► JSON on stdout
                                                              │
                                                              └── reads sales from MongoDB (pymongo)
```

Responsibilities:

| Component | Responsible for |
|---|---|
| MongoDB | Storing products, suppliers, sales, inventory transactions, users, forecasts, purchase orders |
| Python | Data preparation, daily demand aggregation, feature engineering, training, evaluation, prediction |
| Node.js | Authentication, REST APIs, business logic, MongoDB communication, starting Python, reorder calculation |
| React | UI, forms, tables, charts, calling the API |

**Forecast request flow:** the user presses *Run forecast* → React sends `POST /api/forecasts/run` → Express starts `forecast.py` with `child_process.spawn()` → Python reads the sales from MongoDB, trains, evaluates and prints one JSON document → Express validates it, stores the forecasts in MongoDB, and returns a summary → React reloads the charts.

## 11. Database Design

MongoDB is a document database, but the model is deliberately **normalized**: each fact is stored once, and documents refer to each other by stable business keys (`supplierId`, `productId`) — exactly the keys in the CSV files. For example, a sale stores only `productId`, not the product's name or price list.

Design rules:

- Every collection has a **unique index** on its business ID.
- Relationships are checked by the application on import and on every write (MongoDB itself does not enforce foreign keys).
- Records that are referenced cannot be deleted (a product with sales, a supplier with products).
- `products.stock` is the **authoritative current stock**. It comes from the product master CSV and is changed only by sales, inventory transactions and received purchase orders. It is *not* recalculated from the transaction history: in the supplied data the transactions add up to a large negative number for every product (for example P001: IN − OUT = −532 while its stock is 42), because the history does not start from a known opening balance.

## 12. ER / Relationship Explanation

```
SUPPLIER (supplierId) ──1────< PRODUCT (productId, supplierId)
                                  │1
              ┌───────────────────┼─────────────────────┬──────────────────┐
              │<                  │<                    │<                 │<
        SALE (saleId,     INVENTORY_TRANSACTION     FORECAST         PURCHASE_ORDER
        productId)        (transactionId,           (productId,      (orderId, productId,
                           productId)                forecastDate)    supplierId)
```

- One **supplier** supplies many **products**; each product has exactly one supplier (`products.supplierId → suppliers.supplierId`).
- One **product** has many **sales** (`sales.productId → products.productId`).
- One **product** has many **inventory transactions** (`inventory_transactions.productId → products.productId`).
- One **product** has many **forecast** rows, one per future date.
- One **purchase order** is for one product and goes to that product's supplier.

Data flow: Supplier → Products → Sales → Demand Forecast, and Products → Inventory Transactions → Inventory Analytics.

## 13. MongoDB Collections

### suppliers (8 documents)
| Field | Type | Rules |
|---|---|---|
| supplierId | String | required, unique, e.g. `S001` |
| name, address | String | required |
| email | String | required, valid e-mail format |
| phone | String | required, 7–20 digits/symbols |

Indexes: `supplierId` (unique), `name`.

### products (30 documents)
| Field | Type | Rules |
|---|---|---|
| productId | String | required, unique, e.g. `P001` |
| name, category | String | required |
| price | Number | required, ≥ 0 |
| stock | Number | required, whole number ≥ 0 |
| minimumStock | Number | required, whole number ≥ 0 |
| supplierId | String | required, must exist in suppliers |

Indexes: `productId` (unique), `supplierId`, `(category, name)`, `stock`, `name`.

### sales (4,800 documents, 1 Jan 2026 – 30 Jun 2026)
| Field | Type | Rules |
|---|---|---|
| saleId | String | required, unique, e.g. `SALE00001` |
| productId | String | required, must exist in products |
| quantity | Number | required, whole number ≥ 1 |
| totalAmount | Number | required, ≥ 0 (price × quantity) |
| saleDate | Date | required |

Indexes: `saleId` (unique), `saleDate`, compound `(productId, saleDate)` — the compound index serves "daily demand of a product", the core query of forecasting.

### inventory_transactions (4,980 documents: 4,800 OUT + 180 IN)
| Field | Type | Rules |
|---|---|---|
| transactionId | String | required, unique, e.g. `T00001` |
| productId | String | required, must exist in products |
| type | String | `IN` or `OUT` only |
| quantity | Number | required, whole number ≥ 1 |
| date | Date | required |

Indexes: `transactionId` (unique), `date`, compound `(productId, date)`, compound `(type, date)`.

### forecasts (written by the ML pipeline)
`runId`, `productId`, `forecastDate`, `predictedDemand`, `dayAhead` (1 = first forecast day), `model`, `metrics { mae, rmse, mape, wape, testDays }`, `createdAt`.
Indexes: unique `(productId, forecastDate)`, `forecastDate`, `runId`. Each successful run replaces the previous rows.

### forecast_runs
One document per execution of the pipeline (successful or failed): selected model, metrics, comparison of all models, train/validation/test dates, feature list, hold-out actual-vs-predicted values, duration, error message.

### purchase_orders
`orderId`, `productId`, `supplierId`, `quantity`, `status` (`PENDING`, `ORDERED`, `RECEIVED`, `CANCELLED`), `note`, `createdAt`, `receivedAt`.
Indexes: `orderId` (unique), `(productId, status)`, `supplierId`, `(status, createdAt)`.

### users
`name`, `email` (unique), `passwordHash` (bcrypt), `role` (`admin` or `staff`).

### counters
One document per ID sequence; used to generate the next `SALE…`, `T…`, `P…`, `S…`, `PO…` ID atomically.

## 14. API Design

REST principles: nouns for resources, HTTP verbs for actions, JSON bodies, meaningful status codes.

| Resource | Endpoints |
|---|---|
| Auth | `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me` |
| Products | `GET /api/products`, `GET /api/products/:id`, `POST`, `PUT /:id`, `DELETE /:id`, `GET /api/products/categories` |
| Suppliers | `GET /api/suppliers`, `GET /:id`, `POST`, `PUT /:id`, `DELETE /:id`, `GET /api/suppliers/analytics` |
| Sales | `GET /api/sales`, `GET /:id`, `POST`, `GET /api/sales/analytics` |
| Inventory | `GET /api/inventory-transactions`, `GET /:id`, `POST`, `GET /api/inventory/analytics` |
| Dashboard | `GET /api/dashboard` |
| Forecast | `POST /api/forecasts/run`, `GET /api/forecasts`, `GET /api/forecasts/product/:productId`, `/summary`, `/status`, `/runs` |
| Reorder | `GET /api/reorder`, `GET/POST /api/purchase-orders`, `PATCH /api/purchase-orders/:id/status` |

List endpoints support search, filters, sorting and pagination and return `{ data, pagination }`.

**Recording a sale (`POST /api/sales`)** — inside one MongoDB transaction:

1. Decrease stock with a single conditional update: *"decrease stock by q only if stock ≥ q"*. If no document matches, the product is missing (404) or stock is insufficient (409).
2. Generate the next sale ID and insert the sale with `totalAmount = price × quantity`.
3. Generate the next transaction ID and insert an `OUT` inventory transaction.

If any step fails, the transaction aborts and nothing is saved. Because step 1 checks and updates in one operation, two people selling the last units at the same moment cannot both succeed.

**Status codes:** 200 OK, 201 Created, 400 invalid input, 401 not authenticated, 403 not permitted, 404 not found, 409 conflict (duplicate ID, insufficient stock, record in use), 422 not enough data for ML, 500 server error, 502/504 ML process failed / timed out.

## 15. Machine Learning Methodology

**Type of problem:** supervised regression on a time series.

**Target:** units sold per product per day — `sales.quantity` summed by `productId` + `saleDate`. `totalAmount` is not used, because money depends on price and is not demand.

**Pipeline (`backend/ml/forecast.py`):**

```
MongoDB sales → daily demand per product → features → chronological split
→ train 3 models → evaluate → choose best → retrain on all data → forecast 30 days → JSON
```

**Daily demand aggregation.** Sales are grouped into a table with one row per product and one column per day. If a product has no sale on a trading day its demand is **0** (11.6 % of the 5,430 product-days). Two cleaning rules:

- A calendar day with no sale of any product is treated as "no data" (shop closed), not as zero demand.
- Sales dated **today** are left out until tomorrow, because the day is not finished and its partial total would look like a sudden fall in demand.

**One global model.** A single model is trained on the rows of all 30 products (5,220 rows) instead of 30 tiny models with 181 rows each. The lag and rolling-mean features tell the model the typical level of each product.

## 16. Feature Engineering

| Feature | Meaning |
|---|---|
| `day_of_week` | 0 = Monday … 6 = Sunday |
| `day_of_month` | 1 – 31 |
| `month` | 1 – 12 |
| `day_of_year` | 1 – 366 |
| `is_weekend` | 1 on Saturday/Sunday (sales are about 20 % lower on weekends in this data) |
| `lag_1` | demand on the previous day |
| `lag_7` | demand 7 days earlier (same weekday last week) |
| `rolling_mean_7` | average demand of the previous 7 days |
| `rolling_mean_14` | average of the previous 14 days |
| `rolling_mean_30` | average of the previous 30 days |

**No future information (no leakage).** The function that builds the features for a day receives only the days *before* that day, so it is impossible for a feature to contain the value being predicted or anything later. The same function is used for training and for forecasting.

**Missing lag/rolling values.** The first 7 days of the history have no `lag_7`, so those days are not used for training. Rolling means over 14 and 30 days use the days that are available (never fewer than 7) instead of invented values.

## 17. Model Training

Three scikit-learn models are compared, plus a non-ML reference:

| Model | Idea |
|---|---|
| Linear Regression | Weighted sum of the features |
| Random Forest Regressor | Average of 200 decision trees |
| Gradient Boosting Regressor | 150 small trees, each correcting the previous ones |
| Moving average (baseline) | "Tomorrow = average of the last 7 days" — shows whether ML adds anything |

**Chronological split (never shuffled):**

| Part | Dates | Use |
|---|---|---|
| Train | 8 Jan – 1 May 2026 (114 days) | Fit the models |
| Validation | 2 May – 31 May 2026 (30 days) | Choose the best model |
| Test | 1 Jun – 30 Jun 2026 (30 days) | Report accuracy on data never used for any decision |

**Evaluation matches real use.** The application forecasts 30 days ahead, so each model is evaluated the same way: it is given the history up to the start of the window and must forecast all 30 days one after another (*recursive forecasting* — each predicted day is fed back in as the "previous day" for the next one). It never sees the real values inside the window. This is stricter and more honest than one-day-ahead evaluation.

**Selection rule:** lowest MAE on the validation window. The chosen model is then retrained on all 181 days and used to forecast.

## 18. MAE, RMSE and MAPE

Let *actual* be the real units sold and *predicted* the forecast for each product-day.

- **MAE (Mean Absolute Error)** = average of |actual − predicted|. "On average the forecast is wrong by this many units." Easy to interpret, same unit as the data.
- **RMSE (Root Mean Squared Error)** = √(average of (actual − predicted)²). Squaring punishes large errors more, so RMSE ≥ MAE; a big gap between them means some large misses.
- **MAPE (Mean Absolute Percentage Error)** = average of |actual − predicted| ÷ actual × 100. The error as a percentage.

**MAPE and zero demand.** MAPE divides by the actual value, which is impossible when actual = 0. The pipeline therefore computes MAPE only over days with actual demand > 0 and reports how many days were used; if a product had no sales at all in the test window, its MAPE is reported as *not available* instead of crashing or showing infinity. **WAPE** (total absolute error ÷ total actual demand) is reported as a zero-safe companion.

## 19. Forecasting

- Horizon: 30 days are generated per run; the 7-day forecast is the first 7 of them.
- Each forecast row contains `productId`, `forecastDate`, `predictedDemand`, the model name and the product's test metrics.
- Negative predictions are clipped to 0 (demand cannot be negative). Predictions are averages, so they are decimals such as 3.9 units/day.
- Rows are stored in the `forecasts` collection; a new successful run replaces them in one transaction. A failed run leaves the previous forecast untouched and is logged in `forecast_runs`.
- If sales are recorded after a run, the UI shows "forecast is out of date" with a re-run button.
- A product with no sales history gets no forecast; the UI says so instead of showing a made-up number.

**Error handling between Node and Python:** Python always answers with JSON (`status: ok` or `status: error` with a code). Node handles: Python not installed, missing packages, crash, invalid JSON, empty or insufficient data, database unreachable, and timeout (the process is stopped). Each case returns a clear message and a sensible HTTP status; internal details stay in the server log.

## 20. Reorder Logic

Kept separate from the ML model, in `backend/services/reorderService.js`, so that it is easy to read and explain.

```
Safety Stock     = Z × σ(daily demand) × √(lead time in days)
Reorder Quantity = Forecast Demand + Safety Stock − Current Stock − On Order
if Reorder Quantity < 0  →  Reorder Quantity = 0
```

| Term | Source |
|---|---|
| Forecast Demand | Sum of the ML predictions for the next 7 (or 30) days, rounded up |
| σ (standard deviation) | Spread of the product's daily demand over the last 30 trading days, zero-sales days included |
| Z = 1.65 | Factor for a ~95 % service level (`SAFETY_Z`) |
| Lead time = 7 days | Assumed time for a supplier delivery (`LEAD_TIME_DAYS`) — not present in the dataset, so it is configurable |
| Current Stock | Live `products.stock` |
| On Order | Units in purchase orders that are PENDING or ORDERED (so the same need is not ordered twice) |

Real example from the data (7-day horizon): **Webcam (P005)** — forecast 12, safety stock 6, current stock 7, on order 0 → 12 + 6 − 7 = **11 units**. Reason shown: *"Current stock (7) is at or below the minimum stock level (10). Expected demand for the next 7 days is 12 units; with 6 units of safety stock that is 18 units needed, but only 7 are available."*

Priority: **Critical** = out of stock, **High** = at/below minimum stock or stock lower than the forecast demand, **Medium** = only the safety buffer is short.

## 21. Screens / Modules

| Screen | Contents |
|---|---|
| Login | Sign in / register |
| Dashboard | 6 cards (products, sales, units sold, low stock, out of stock, inventory value), sales chart, demand history vs forecast, IN vs OUT, category chart, low-stock table, top products |
| Products | Table with search, filters, sorting, pagination; add/edit/delete; stock status badge |
| Suppliers | Table with product counts; add/edit/delete; supplied-products view |
| Sales | History with filters and totals; record-sale form with automatic total |
| Inventory | Transactions with filters; IN vs OUT chart; movement summary; manual transaction form |
| Forecast | Product selector, 7/30-day switch, model, MAE/RMSE/MAPE, history-vs-forecast chart, forecast table, actual-vs-predicted test chart, model comparison |
| Reorder | Formula, recommendations with reason and calculation, create purchase order, order status changes |
| Analytics | Sales trends, weekday pattern, product/category performance, inventory movement, stock health, suppliers, forecast performance, run history |

## 22. Testing

**Automated API tests** (`npm test` in `backend/`, 65 tests, separate test database):

| Group | Examples |
|---|---|
| Authentication | no token, forged token, wrong password, duplicate e-mail, weak password, bcrypt hash stored |
| Empty database | dashboard with no data, forecast with no sales → 422 |
| Import | correct counts (8 / 30 / 4,800 / 4,980), second import adds nothing, bad rows rejected and reported |
| Products / suppliers | search, filter, sort, pagination, duplicate ID → 409, missing supplier → 400, invalid values → 400, delete rules |
| Sales | stock decreases in MongoDB, OUT transaction created, dashboard changes, unknown product → 404, insufficient stock → 409, invalid quantities/dates → 400 |
| Consistency | two simultaneous sales for the last units → exactly one succeeds; simulated crash mid-sale → nothing saved |
| Inventory | filters, IN/OUT update stock, invalid type/quantity/product |
| ML | Python crash, invalid JSON, missing Python, timeout, real run (900 rows, metrics, chronological split), stale flag, unfinished day excluded |
| Reorder | formula verified for every product against live stock and stored forecasts; purchase order lifecycle; double receive blocked |
| Integrity | no orphans, no duplicate IDs, no negative stock at the end |

The same suite also passes on a standalone MongoDB (no replica set), which exercises the fallback path.

**Browser tests** (headless Chrome, 48 checks): login/invalid login/logout, every page, product CRUD through the forms, recording a sale and seeing stock and the OUT transaction change, running the forecast from the button, reorder reasons, purchase order received, error state with retry, mobile layout, no console errors.

## 23. Results

**Data imported:** 8 suppliers, 30 products, 4,800 sales (16,600 units, ₹2,84,86,800 revenue), 4,980 inventory transactions; 0 invalid rows, 0 orphans, 0 duplicates.

**Model comparison** (all 30 products, 30-day recursive forecast; units per product per day; average daily demand is about 3.1 units):

| Model | Validation MAE | Test MAE | Test RMSE | Test MAPE | 30-day total-demand error |
|---|---|---|---|---|---|
| **Linear Regression (selected)** | **1.38** | 1.43 | 1.94 | 59.6 % | 17.9 % |
| Random Forest | 1.53 | 1.48 | 1.99 | 60.7 % | 22.1 % |
| Gradient Boosting | 1.57 | 1.44 | 2.00 | 55.0 % | 16.5 % |
| Moving average baseline | 1.63 | 1.55 | 2.14 | 63.0 % | 32.0 % |

First 7 days of the test window (selected model): MAE 1.38, RMSE 1.83, MAPE 58.3 %.

**Interpretation.**

- Linear Regression was chosen because it had the lowest validation MAE. All three ML models beat the moving-average baseline.
- A daily MAPE near 60 % looks high, and it should be read correctly: the sales of one product on one day are small whole numbers (often 1–5) that vary almost randomly, so even a perfect estimate of the *average* is far from each day's value in percentage terms. No model can predict that day-to-day noise.
- What matters for reordering is the **total demand over the period**. There the model's error is about **18 %**, against **32 %** for the baseline. That is the practical benefit of the model.
- The model mostly relies on `rolling_mean_30` (the product's recent level) and `is_weekend`.

**Reorder (7-day horizon, initial data):** 21 of 30 products need an order, 94 units in total; 2 are high priority (Webcam, 24-inch Monitor).

## 24. Limitations

1. **Short history.** Only six months of sales exist, so yearly seasonality (festivals, year-end) cannot be learned or tested.
2. **Noisy daily demand.** Per-product daily forecasts are approximate (see §23); totals over a week or month are more reliable.
3. **Calendar features extrapolate.** `month` and `day_of_year` move together, and future months were never seen in training. A linear model handles this consistently, but forecasts far beyond the history become less trustworthy.
4. **No external factors.** Promotions, price changes, holidays and stock-outs (which hide real demand) are not in the data.
5. **Assumed lead time.** Supplier lead time and service level are configuration values, not data.
6. **Estimated order value** uses the selling price because purchase cost is not in the dataset.
7. **Stock is not reconciled with history.** Current stock is taken from the product master; the imported transactions cannot reproduce it.
8. **Backdated single sales.** The model assumes that all sales of a past day are recorded. Entering one sale on an otherwise empty past date creates a day that looks like very low demand.
9. **Simple security model.** Two roles, tokens in browser storage, no password reset or refresh tokens.
10. **On-demand training.** The model is retrained when the button is pressed; there is no scheduler.

## 25. Future Scope

- Add promotions, holidays and price as features; try models designed for time series (Prophet, SARIMA) or count data (Poisson regression).
- Prediction intervals ("between 10 and 16 units") instead of a single number.
- Supplier lead times and purchase cost per product; automatic e-mail of purchase orders.
- Nightly automatic forecast and low-stock alerts.
- Stock reconciliation with opening balances and physical stock counts.
- Multiple warehouses, barcode scanning, role-based permissions, audit log of user actions.
- Deployment with Docker and MongoDB Atlas.

## 26. Conclusion

The project delivers a working, integrated system: a validated MongoDB database loaded from real CSV data, a secure REST API that keeps stock consistent with transactions, a Python machine-learning pipeline that forecasts demand with honestly measured accuracy, and a React dashboard that turns those forecasts into explainable reorder decisions. It demonstrates database design (collections, relationships, indexes, aggregation, transactions) and applied machine learning (feature engineering, chronological validation, model comparison, error metrics) working together to solve a practical business problem.
