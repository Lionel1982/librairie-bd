# Ma Bibliothèque BD — déploiement Vercel + Supabase

## 1. Supabase (une fois)
1. Ouvre ton projet Supabase > SQL Editor > New query.
2. Colle le contenu de `supabase/schema.sql` et clique **Run** (crée les tables + RLS).
3. Authentication > Providers > Email : active (et décoche "Confirm email" pour un usage perso si tu veux te connecter sans validation mail).

## 2. En local
```
npm install
npm run dev
```
`.env.local` contient déjà VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY.

## 3. Déploiement Vercel
1. Pousse ce dossier sur un dépôt Git (GitHub/GitLab).
2. Sur vercel.com : New Project > importe le dépôt.
3. Framework : **Vite** (auto-détecté). Build: `npm run build`, Output: `dist`.
4. Settings > Environment Variables : ajoute
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Deploy.

## Migration des données locales
Une fois connecté, menu ⚙️ > "⬆️ Migrer mes données locales" pousse la collection
stockée dans le localStorage du navigateur (ancienne version) vers Supabase.
