DAKSINA ERP - auth + seed files
================================
1. Unzip into C:\Projects\daksina (merge folders, keep existing app\layout.tsx etc).
   If Next.js created app\page.tsx you can leave it.

2. Install deps (one at a time):
   npm i next-auth@4 bcryptjs@2
   npm i -D @types/bcryptjs@2 tsx

3. Add to .env:
   NEXTAUTH_URL="http://localhost:3000"
   NEXTAUTH_SECRET="<output of: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">"

4. Add to package.json (top level, e.g. after "scripts"):
   "prisma": { "seed": "tsx prisma/seed.ts" },

5. Run:
   npx prisma db seed
   npm run dev

6. Open http://localhost:3000/login
   owner@daksina.local / Admin@123   (change before any deploy)
