import argparse, json, os, sys, time, warnings
import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor

warnings.filterwarnings("ignore")

SEED = 42
MIN_DAYS = 90
MAX_HORIZON = 60

FEATURES = [
    "day_of_week", "day_of_month", "month", "day_of_year", "is_weekend",
    "lag_1", "lag_2", "lag_3", "lag_7", "lag_14", "lag_28", "lag_365",
    "mean_3", "mean_7", "mean_14", "mean_28",
    "std_7", "std_14", "same_weekday_mean", "history_mean",
]


class PipelineError(Exception):
    def __init__(self, code, message):
        self.code, self.message = code, message


def log(message):
    print(f"[forecast] {message}", file=sys.stderr, flush=True)


# 1. Load MongoDB sales
def load_sales(uri):
    try:
        from pymongo import MongoClient
    except ImportError as exc:
        raise PipelineError("DEPENDENCY_ERROR", "pymongo is not installed") from exc

    client = MongoClient(uri, serverSelectionTimeoutMS=8000)
    try:
        client.admin.command("ping")
        db = None
        try:
            db = client.get_default_database()
        except Exception:
            pass

        target_coll = os.getenv("MONGO_SALES_COLLECTION", "sales")
        if db is None:
            db_name = os.getenv("MONGO_DB")
            if db_name and target_coll in client[db_name].list_collection_names() and client[db_name][target_coll].count_documents({}) > 0:
                db = client[db_name]
            else:
                # Find the database that actually contains the sales records
                for name in client.list_database_names():
                    if name not in ("admin", "local", "config"):
                        try:
                            if target_coll in client[name].list_collection_names() and client[name][target_coll].count_documents({}) > 0:
                                db = client[name]
                                break
                        except Exception:
                            continue
                if db is None:
                    db = client[db_name or "smart_inventory"]

        log(f"Using database: '{db.name}'")
        rows = list(db[target_coll].find(
            {},
            {
                "_id": 0, "productId": 1, "product_id": 1,
                "quantity": 1, "qty": 1,
                "saleDate": 1, "sale_date": 1, "date": 1,
            },
        ))
        log(f"Loaded {len(rows)} sales records from database '{db.name}'.")
        return pd.DataFrame(rows)
    finally:
        client.close()


# 2. Convert sales into a complete daily demand matrix
def prepare(df, today):
    if df.empty:
        raise PipelineError("EMPTY_DATA", "No sales records found")

    df = df.copy()

    if "productId" not in df and "product_id" in df:
        df["productId"] = df["product_id"]
    if "quantity" not in df and "qty" in df:
        df["quantity"] = df["qty"]
    if "saleDate" not in df:
        df["saleDate"] = df.get("sale_date", df.get("date"))

    required = {"productId", "quantity", "saleDate"}
    if not required.issubset(df.columns):
        raise PipelineError("INVALID_DATA", f"Missing columns: {required - set(df.columns)}")

    df["quantity"] = pd.to_numeric(df["quantity"], errors="coerce")
    df["date"] = (
        pd.to_datetime(df["saleDate"], errors="coerce", utc=True)
        .dt.tz_localize(None)
        .dt.normalize()
    )

    df = df.dropna(subset=["productId", "quantity", "date"])
    df = df[(df["quantity"] > 0) & (df["date"] < today)]

    if df.empty:
        raise PipelineError("EMPTY_DATA", "No completed sales available")

    daily = (
        df.groupby(["productId", "date"])["quantity"]
        .sum()
        .unstack(fill_value=0)
        .sort_index()
        .sort_index(axis=1)
    )

    # Missing calendar days become zero-demand days.
    dates = pd.date_range(daily.columns.min(), daily.columns.max(), freq="D")
    daily = daily.reindex(columns=dates, fill_value=0)

    products = [str(x) for x in daily.index]
    matrix = daily.to_numpy(dtype=float)

    summary = {
        "salesRecords": int(len(df)),
        "products": int(len(products)),
        "startDate": dates[0].strftime("%Y-%m-%d"),
        "endDate": dates[-1].strftime("%Y-%m-%d"),
        "calendarDays": int(len(dates)),
        "daysWithSales": int(df["date"].nunique()),
        "totalUnits": float(matrix.sum()),
    }

    return products, pd.DatetimeIndex(dates), matrix, summary


# 3. Features use only data available before the target day
def features(history, date):
    n, days = history.shape

    def lag(k):
        return history[:, -k] if days >= k else history[:, -1]

    def win(k):
        return history[:, -min(k, days):]

    r3, r7, r14, r28 = win(3), win(7), win(14), win(28)

    lag365 = lag(365) if days >= 365 else history.mean(axis=1)

    same_weekday = []
    for i in range(n):
        vals = [history[i, -k] for k in range(7, min(56, days) + 1, 7)]
        same_weekday.append(np.mean(vals) if vals else r7[i].mean())

    return np.column_stack([
        np.full(n, date.dayofweek),
        np.full(n, date.day),
        np.full(n, date.month),
        np.full(n, date.dayofyear),
        np.full(n, int(date.dayofweek >= 5)),
        lag(1), lag(2), lag(3), lag(7), lag(14), lag(28), lag365,
        r3.mean(axis=1), r7.mean(axis=1), r14.mean(axis=1), r28.mean(axis=1),
        r7.std(axis=1), r14.std(axis=1),
        np.asarray(same_weekday),
        history.mean(axis=1),
    ])


# 4. Supervised training data
def build_training_data(matrix, dates, end):
    first = 365 if len(dates) >= 365 else 28
    if end <= first:
        raise PipelineError("INSUFFICIENT_DATA", "Not enough history to train")

    X, y = [], []
    for t in range(first, end):
        X.append(features(matrix[:, :t], dates[t]))
        y.append(matrix[:, t])

    return np.vstack(X), np.concatenate(y)


# 5. Candidate models
def models():
    return {
        "Linear Regression": lambda: LinearRegression(),
        "Random Forest": lambda: RandomForestRegressor(
            n_estimators=600,
            max_depth=22,
            min_samples_leaf=2,
            max_features=0.8,
            random_state=SEED,
            n_jobs=-1,
        ),
        "Gradient Boosting": lambda: GradientBoostingRegressor(
            n_estimators=500,
            learning_rate=0.08,
            max_depth=5,
            min_samples_leaf=2,
            subsample=0.9,
            random_state=SEED,
        ),
    }


# 6. Walk-forward backtest:
#    every target day is unseen, but previous actual days are allowed.
def walk_forward(model, matrix, dates, start, end):
    preds = []
    for t in range(start, end):
        X = features(matrix[:, :t], dates[t])
        preds.append(np.clip(model.predict(X), 0, None))
    return np.column_stack(preds)


# 7. Future forecast
def future_forecast(model, history, future_dates):
    history = history.copy()
    preds = []

    for date in future_dates:
        X = features(history, date)
        pred = np.clip(model.predict(X), 0, None)
        preds.append(pred)
        history = np.column_stack([history, pred])

    return np.column_stack(preds)


def metrics(actual, predicted):
    a = np.asarray(actual, float).ravel()
    p = np.asarray(predicted, float).ravel()
    error = a - p
    ae = np.abs(error)

    mae = float(ae.mean())
    rmse = float(np.sqrt(np.mean(error ** 2)))

    nonzero = a > 0
    mape = float(np.mean(ae[nonzero] / a[nonzero]) * 100) if nonzero.any() else None

    total = float(a.sum())
    wape = float(ae.sum() / total * 100) if total > 0 else None
    accuracy = max(0, 100 - wape) if wape is not None else None

    corr = None
    if len(a) > 1 and np.std(a) > 0 and np.std(p) > 0:
        corr = float(np.corrcoef(a, p)[0, 1])

    return {
        "mae": round(mae, 4),
        "rmse": round(rmse, 4),
        "mape": None if mape is None else round(mape, 2),
        "wape": None if wape is None else round(wape, 2),
        "accuracy": None if accuracy is None else round(accuracy, 2),
        "correlation": None if corr is None else round(corr, 4),
        "samples": int(a.size),
    }


def run_pipeline(df, horizon, today):
    started = time.time()
    products, dates, matrix, summary = prepare(df, today)
    n_days = len(dates)

    if n_days < MIN_DAYS:
        raise PipelineError(
            "INSUFFICIENT_DATA",
            f"Only {n_days} calendar days available; need at least {MIN_DAYS}"
        )

    test_days = 30 if n_days >= 180 else 14
    validation_days = test_days
    test_start = n_days - test_days
    validation_start = test_start - validation_days

    factories = models()
    results = {}
    test_preds = {}

    for name, factory in factories.items():
        started_model = time.time()

        # Validation
        X, y = build_training_data(matrix, dates, validation_start)
        model = factory().fit(X, y)
        val_pred = walk_forward(
            model, matrix, dates,
            validation_start, test_start
        )
        val_actual = matrix[:, validation_start:test_start]
        val_metrics = metrics(val_actual, val_pred)

        # Final unseen test
        X, y = build_training_data(matrix, dates, test_start)
        model = factory().fit(X, y)
        test_pred = walk_forward(
            model, matrix, dates,
            test_start, n_days
        )
        test_actual = matrix[:, test_start:]
        test_metrics = metrics(test_actual, test_pred)

        results[name] = {
            "model": name,
            "validation": val_metrics,
            "test": test_metrics,
            "selectionScore": val_metrics["mae"],
            "selected": False,
            "trainSeconds": round(time.time() - started_model, 2),
        }
        test_preds[name] = test_pred

        log(
            f"{name}: validation MAE={val_metrics['mae']} | "
            f"test MAE={test_metrics['mae']} | "
            f"test correlation={test_metrics['correlation']}"
        )

    selected = min(
        results,
        key=lambda name: (
            results[name]["validation"]["mae"],
            results[name]["validation"]["rmse"],
        ),
    )

    for name in results:
        results[name]["selected"] = name == selected

    # Train selected model on all available history.
    X, y = build_training_data(matrix, dates, n_days)
    final_model = factories[selected]().fit(X, y)

    future_dates = pd.date_range(
        dates[-1] + pd.Timedelta(days=1),
        periods=horizon,
        freq="D",
    )
    future = future_forecast(final_model, matrix, future_dates)

    selected_test = test_preds[selected]
    products_out = []

    for i, product_id in enumerate(products):
        actual = matrix[i, test_start:]
        predicted = selected_test[i]

        product_out = {
            "productId": product_id,
            "metrics": metrics(actual, predicted),
            "historyTotalUnits": round(float(matrix[i].sum()), 2),
            "forecast": [
                {
                    "date": d.strftime("%Y-%m-%d"),
                    "dayAhead": j + 1,
                    "predictedDemand": round(float(v), 2),
                }
                for j, (d, v) in enumerate(
                    zip(future_dates, future[i])
                )
            ],
            "backtest": {
                "dates": [
                    d.strftime("%Y-%m-%d")
                    for d in dates[test_start:]
                ],
                "actual": [float(v) for v in actual],
                "predicted": [round(float(v), 2) for v in predicted],
            },
        }
        product_out["metrics"]["testDays"] = int(test_days)
        products_out.append(product_out)

    return {
        "status": "ok",
        "model": selected,
        "selectedModel": selected,
        "selectionReason": (
            f"{selected} was selected using the lowest "
            f"MAE on chronological validation data "
            f"({results[selected]['validation']['mae']})."
        ),
        "generatedAt": pd.Timestamp.now(tz="UTC").strftime("%Y-%m-%dT%H:%M:%SZ"),
        "target": "units sold per product per day",
        "horizonDays": int(horizon),
        "forecastStartDate": future_dates[0].strftime("%Y-%m-%d"),
        "forecastEndDate": future_dates[-1].strftime("%Y-%m-%d"),
        "dataSummary": summary,
        "features": FEATURES,
        "split": {
            "method": "chronological walk-forward",
            "train": {
                # The model's demand history begins on the first available
                # sales date. Later rows need lag features, but those feature
                # values are built from this full training-history range.
                "startDate": dates[0].strftime("%Y-%m-%d"),
                "endDate": dates[validation_start - 1].strftime("%Y-%m-%d"),
                "days": int(validation_start),
            },
            "validation": {
                "startDate": dates[validation_start].strftime("%Y-%m-%d"),
                "endDate": dates[test_start - 1].strftime("%Y-%m-%d"),
                "days": int(validation_days),
            },
            "test": {
                "startDate": dates[test_start].strftime("%Y-%m-%d"),
                "endDate": dates[-1].strftime("%Y-%m-%d"),
                "days": int(test_days),
            },
        },
        "models": list(results.values()),
        "modelComparison": list(results.values()),
        "selectionCriterion": "lowest validation MAE",
        "metrics": results[selected]["test"],
        "products": products_out,
        "durationSeconds": round(time.time() - started, 2),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--horizon", type=int, default=30)
    parser.add_argument("--mongo-uri", default=os.getenv("MONGODB_URI"))
    parser.add_argument("--today")
    args = parser.parse_args()

    try:
        if not 1 <= args.horizon <= MAX_HORIZON:
            raise PipelineError("INVALID_ARGUMENT", "horizon must be between 1 and 60")

        if not args.mongo_uri:
            raise PipelineError("INVALID_ARGUMENT", "MONGODB_URI is missing")

        today = (
            pd.Timestamp(args.today).normalize()
            if args.today
            else pd.Timestamp.now().normalize()
        )

        result = run_pipeline(
            load_sales(args.mongo_uri),
            args.horizon,
            today,
        )
        code = 0

    except PipelineError as exc:
        result = {
            "status": "error",
            "code": exc.code,
            "message": exc.message,
        }
        code = 2

    except Exception as exc:
        log(f"{type(exc).__name__}: {exc}")
        result = {
            "status": "error",
            "code": "INTERNAL_ERROR",
            "message": f"{type(exc).__name__}: {exc}",
        }
        code = 1

    print(json.dumps(result, allow_nan=False))
    return code


if __name__ == "__main__":
    sys.exit(main())