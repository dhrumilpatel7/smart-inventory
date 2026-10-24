# 🌐 24/7 Free Cloud Deployment Guide for Smart Inventory

Follow this step-by-step guide to keep your website online 24/7 without needing your laptop or terminal open.

---

## Architecture Overview

```
 ┌──────────────────────────┐          ┌──────────────────────────┐          ┌──────────────────────────┐
 │     React Frontend       │  HTTPS   │    Node + Python API     │  Mongoose│      MongoDB Atlas       │
 │   Hosted on Vercel (Free)│ ───────► │   Hosted on Render (Free)│ ───────► │       (Free M0 Cluster)  │
 │  https://your-app.vercel │          │ https://your-api.onrender│          │  Stored in Cloud 24/7    │
 └──────────────────────────┘          └──────────────────────────┘          └──────────────────────────┘
```

---

## Step 1: Set up a Free Cloud Database (MongoDB Atlas)

*Time required: ~5 minutes*

1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas/register) and create a free account.
2. Click **Create Deployment** and select the **M0 Free Tier** (512 MB, free forever, no credit card required).
3. Choose any cloud provider & region close to you (e.g. AWS / Mumbai, Frankfurt, or N. Virginia).
4. **Create a Database User**:
   - Set a username and password (e.g., `admin` and a strong password). Save this password!
5. **Configure Network Access**:
   - Under **Network Access**, click **Add IP Address** -> Select **Allow Access from Anywhere** (`0.0.0.0/0`).
   - Click **Confirm**.
6. **Get your Connection String**:
   - Under **Database**, click **Connect** -> **Drivers** (Node.js).
   - Copy the connection string:
     ```
     mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/smart_inventory?retryWrites=true&w=majority
     ```
   - Replace `<username>` and `<password>` with the credentials you created.
7. **Import the Initial Data into Cloud**:
   - In your local project, open `smart-inventory/backend/.env`.
   - Update `MONGODB_URI` with your new Atlas connection string.
   - In your PowerShell/terminal, run:
     ```bash
     cd smart-inventory/backend
     npm run import
     ```
   - All 4 CSV datasets and the default admin user will be imported into your 24/7 cloud database!

---

## Step 2: Push your Code to GitHub

1. Ensure your latest changes are committed and pushed to your GitHub repository:
   ```bash
   git add .
   git commit -m "Add SDG goals, light/dark theme switch, and deployment files"
   git push origin main
   ```

---

## Step 3: Deploy the Backend (Render - Free)

*Time required: ~5 minutes*

1. Go to [Render.com](https://render.com/) and sign up / log in with your GitHub account.
2. Click **New +** -> **Web Service**.
3. Connect your GitHub repository (`smart-inventory`).
4. Fill in the service details:
   - **Name**: `smart-inventory-api`
   - **Region**: Closest to you (e.g., Singapore, Frankfurt, Oregon)
   - **Root Directory**: `smart-inventory/backend`
   - **Runtime**: **Docker** *(Render automatically detects the Dockerfile we prepared that bundles Node.js + Python 3 scikit-learn!)*
   - **Instance Type**: **Free**
5. Under **Environment Variables**, click **Add Environment Variable** and add:
   - `PORT`: `5000`
   - `NODE_ENV`: `production`
   - `MONGODB_URI`: *(your MongoDB Atlas connection string from Step 1)*
   - `JWT_SECRET`: *(a random 32+ character string, e.g., `s9f82k34jlkasdf98327423984723984723847`)*
   - `CORS_ORIGIN`: `*`
   - `ADMIN_EMAIL`: `admin@smartinventory.local`
   - `ADMIN_PASSWORD`: `AdminPassword123!`
   - `GEMINI_API_KEY`: *(your Google AI Studio API key from a Free Tier project; do not link billing if you need to keep usage at $0)*
   - `GEMINI_MODEL`: `gemini-3.5-flash-lite`
6. Click **Create Web Service**.
7. Once deployed, Render will provide your public backend URL, for example:
   ```
   https://smart-inventory-api.onrender.com
   ```
   *(Test it in your browser: `https://smart-inventory-api.onrender.com/` should respond with JSON!)*

---

## Step 4: Deploy the Frontend (Vercel - Free)

*Time required: ~3 minutes*

1. Go to [Vercel.com](https://vercel.com/) and sign in with GitHub.
2. Click **Add New…** -> **Project**.
3. Select your GitHub repository and click **Import**.
4. Configure the project settings:
   - **Root Directory**: Click **Edit** and select `smart-inventory/frontend`.
   - **Framework Preset**: `Vite` (automatically detected).
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
5. Expand **Environment Variables** and add:
   - **Key**: `VITE_API_URL`
   - **Value**: `https://smart-inventory-api.onrender.com/api` *(replace with your actual Render backend URL from Step 3, with `/api` at the end)*
6. Click **Deploy**.
7. In ~60 seconds, Vercel will give you a public URL:
   ```
   https://smart-inventory.vercel.app
   ```

---

## 🎉 That's it!
- Your website is now live on the internet **24 hours a day, 7 days a week**.
- You can turn off your laptop, share the URL with your professors, teammates, or friends, and view it from any phone or computer!
- Any future `git push` to GitHub will automatically trigger redeployments on both Vercel and Render!
