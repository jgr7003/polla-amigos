# Polla Amigos — Mundial 2026

App de pronósticos del Mundial 2026 para un grupo de amigos. Stack: **Next.js 16**, **React 19**, **Tailwind 4** y **Firebase** (Auth + Firestore).

## Requisitos

- [Docker](https://docs.docker.com/get-docker/) y Docker Compose (recomendado), **o**
- Node.js 20+ y Java (para los emuladores de Firebase sin Docker)
- [Firebase CLI](https://firebase.google.com/docs/cli) (solo si corres los emuladores fuera de Docker)

## Arranque local (Docker)

Es la forma recomendada. Levanta la app y los emuladores de Firebase con datos precargados.

### 1. Emuladores (Firestore + Auth)

```bash
docker compose --profile emulator up --build
```

Esto inicia:
- **Firestore** en `localhost:8082`
- **Auth** en `localhost:9099`
- **Emulator UI** en http://localhost:4000

Los datos se importan desde `emulator-data/` y se persisten al apagar el contenedor (`--export-on-exit`).

### 2. Aplicación

En otra terminal:

```bash
docker compose up web
```

La app queda en http://localhost:3000

El servicio `web` ya trae configuradas las variables para usar el emulador:

| Variable | Valor |
|----------|-------|
| `NEXT_PUBLIC_USE_FIREBASE_EMULATOR` | `true` |
| `NEXT_PUBLIC_FIREBASE_EMULATOR_HOST` | `localhost` |

> La app consulta Firebase **desde el navegador**, por eso el host es `localhost` (no el nombre del contenedor Docker).

### 3. Iniciar sesión

El entorno local incluye **12 usuarios** con perfiles en Firestore y cuentas en Auth. Todos comparten la misma contraseña de desarrollo:

| Campo | Valor |
|-------|-------|
| Contraseña | `colombia1/` |
| Ejemplo de email | `jgr7003@gmail.com` |

Otros correos disponibles: ver la colección `users` en http://localhost:4000 o en `emulator-data/auth_export/accounts.json`.

---

## Arranque local (sin Docker)

### Terminal 1 — Emuladores

```bash
firebase emulators:start \
  --project polla-amigos-2026-sb \
  --only auth,firestore \
  --import=./emulator-data \
  --export-on-exit=./emulator-data
```

### Terminal 2 — App

```bash
npm install
NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true \
NEXT_PUBLIC_FIREBASE_EMULATOR_HOST=localhost \
npm run dev
```

Abre http://localhost:3000

---

## Puertos

| Servicio | Puerto | URL |
|----------|--------|-----|
| Next.js (dev) | 3000 | http://localhost:3000 |
| Emulator UI | 4000 | http://localhost:4000 |
| Firestore | 8082 | — |
| Auth | 9099 | — |
| Next.js (prod estático) | 8081 | http://localhost:8081/polla-amigos |

---

## Modo producción local (opcional)

Sirve el export estático de Next.js con Nginx, apuntando a Firebase en la nube:

```bash
docker compose --profile prod up --build
```

---

## Scripts útiles

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Servidor de desarrollo Next.js |
| `npm run build` | Build de producción |
| `npm run seed:auth-emulator` | Crea usuarios en Auth emulator desde Firestore (ver abajo) |
| `node scripts/seed-matches.js` | Siembra partidos en Firestore (**producción**) |
| `node scripts/make-admin.js <email>` | Marca un usuario como admin (**producción**) |

### Re-sembrar usuarios de Auth en el emulador

Si el login falla o faltan cuentas en Auth, con los emuladores corriendo:

```bash
FIRESTORE_EMULATOR_HOST=localhost:8082 \
FIREBASE_AUTH_EMULATOR_HOST=localhost:9099 \
npm run seed:auth-emulator

# Persistir cambios en emulator-data/ (exportar TODO)
firebase emulators:export ./emulator-data --force
```

> **Importante:** no uses `--only auth` al exportar; borraría `firestore_export`. Siempre exporta completo con `--force`.

---

## Cambios recientes — entorno de desarrollo local

Resumen de lo incorporado para trabajar en local con datos reales del proyecto:

### Docker

- `Dockerfile` — imagen de desarrollo Next.js con hot-reload
- `Dockerfile.emulators` — Firebase Emulator Suite (Firestore + Auth)
- `Dockerfile.prod` + `nginx.conf` — build estático servido con Nginx
- `docker-compose.yml` — orquesta `web`, `emulators` (perfil `emulator`) y `web-prod` (perfil `prod`)
- `.dockerignore`

### Firebase

- `src/lib/firebase.ts` — conexión opcional al emulador vía `NEXT_PUBLIC_USE_FIREBASE_EMULATOR`
- `firebase.json` — puertos de emuladores: Firestore `8082`, Auth `9099`, UI `4000`
- `emulator-data/` — snapshot local con **Firestore** (partidos, usuarios, predicciones, grupos) y **Auth** (12 cuentas con contraseña `colombia1/`)

### Scripts y documentación

- `scripts/seed-auth-emulator.js` — sincroniza usuarios de Firestore → Auth emulator con UID coincidente
- `DATABASE.md` — modelo de datos (colecciones, campos, reglas de puntaje)
- `.cursor/skills/local-firebase-dev/` — guía interna para el agente de Cursor sobre el flujo local

### Concepto clave: Firestore ≠ Auth

- Los perfiles viven en la colección `users` de Firestore (UID = ID del documento).
- El login lo maneja **Firebase Auth** (colección separada).
- Para que el login funcione en local, el `localId` de Auth debe coincidir con el UID del documento en `users`. El script `seed-auth-emulator.js` garantiza eso.

---

## Problemas frecuentes

### `INVALID_PASSWORD`

El email existe en Auth del emulador pero la contraseña no es `colombia1/`. Vuelve a ejecutar `npm run seed:auth-emulator` y exporta.

### Login OK, pero "cuenta desactivada o eliminada"

El UID de Auth no coincide con el documento en `users/{uid}`. No uses *Registrarse* en local (genera un UID nuevo). Usa las cuentas del seed o corre `seed-auth-emulator`.

### La app parece hablar con producción

Verifica que `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true` esté activo y reinicia el servidor de desarrollo tras cambiar variables `NEXT_PUBLIC_*`.

---

## Documentación adicional

- [DATABASE.md](./DATABASE.md) — esquema de Firestore y reglas de puntaje
- [Firebase Emulator Suite](https://firebase.google.com/docs/emulator-suite)
