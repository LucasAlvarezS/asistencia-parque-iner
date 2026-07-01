# Scripts — alta de técnicos

Cada técnico es una cuenta de **Supabase Auth** (FK a `auth.users`), así que no se puede seedear
solo en SQL. Este script crea, de forma reproducible: la cuenta en Auth (`usuario@checkin.iner`)
+ su fila en `public.tecnicos`.

## Requisitos previos (una vez, en el dashboard de Supabase)

1. Aplicar `supabase/migrations/0001_init.sql` y `supabase/seed.sql` (SQL Editor).
2. **Authentication → Providers → Email:**
   - Apagar **"Confirm email"** (el email sintético `@checkin.iner` no necesita verificarse).
   - Apagar **"Allow new users to sign up"** (solo el admin crea cuentas).

## Alta de técnicos

1. Copiá la plantilla y completá la lista real:
   ```
   cp scripts/tecnicos.example.json scripts/tecnicos.json
   ```
   Campos por técnico:
   - `usuario` — nombre de login, ej. `carlos.naretto` (sin `@`, en minúsculas).
   - `nombre` — nombre que aparece en la **planilla** (ej. `Carlos Naretto`).
   - `subtipo` — `interno` | `inspector_externo`.
   - `pais` — `argentina` | `chile` | `peru` | `uruguay`.
   - `equipo_id` — `ar_x_c` | `ar_f_k` (solo AR interna) o `null`.
   - `password` — contraseña inicial.

   > `scripts/tecnicos.json` está **gitignoreado** (tiene contraseñas). Nunca lo subas.

2. Corré el script (Node 20+; lee las claves de `.env.local`):
   ```
   node --env-file=.env.local scripts/crear-tecnicos.mjs
   ```

3. Verificá en Supabase: los usuarios aparecen en **Authentication → Users** y en la tabla
   `public.tecnicos` con su `usuario`/`subtipo`/`pais`/`equipo_id`.

El script es **idempotente**: si un usuario ya existe, reusa su id y actualiza el perfil (no
duplica). El técnico luego entra en la app escribiendo solo `carlos.naretto` + su contraseña.
