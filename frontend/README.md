# Dairy Management Frontend (React + Vite)

A modern, responsive web application for managing dairy operations:
- 📊 **Dashboard:** Key metrics, collected milk today, active cycles, expected payouts
- 👨‍🌾 **Farmers:** Register farmers & inspect active cycle settlement summaries
- 🥛 **Milk Entries:** Record morning and evening milk entries against active cycles
- 🌾 **Feed Records:** Record cattle feed and supply deductions
- 💳 **Cycles & Payments:** Start 15/30-day billing periods, preview settlements, and execute payouts

---

## 🚀 Local Development

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run the development server:
   ```bash
   npm run dev
   ```

4. Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 🌐 Deploy to Vercel

### Option 1: Via Vercel Web Dashboard (Recommended)
1. Go to [vercel.com](https://vercel.com) and click **"Add New Project"**.
2. Import your GitHub repository (`dairy`).
3. In **Root Directory**, click **Edit** and choose `frontend`.
4. Framework Preset will auto-detect as **Vite**.
5. Add the Environment Variable:
   - `VITE_API_URL` = `https://dairy-6g3d.onrender.com`
6. Click **Deploy**.

### Option 2: Via Vercel CLI
```bash
cd frontend
npx vercel
```

---

## ⚙️ Backend CORS Notice
Make sure your Render backend has your frontend deployment domain allowed in the `CORS_ORIGIN` environment variable (e.g. `https://your-app.vercel.app,http://localhost:5173`).
