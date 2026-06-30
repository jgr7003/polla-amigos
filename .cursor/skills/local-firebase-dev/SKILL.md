---
name: local-firebase-dev
description: >-
  Desarrollo local de Polla Amigos con Firebase Emulator Suite (Firestore + Auth).
  Usar al levantar Docker, depurar login, seed de datos, o errores INVALID_PASSWORD
  / cuenta desactivada en el emulador.
---

# Desarrollo local — Firebase Emulators (Polla Amigos)

## Arquitectura

- **Firestore** y **Firebase Auth** son sistemas separados.
- La colección `users` en Firestore guarda perfiles; el **UID del documento debe coincidir** con el `localId` de Auth.
- `emulator-data/` contiene `firestore_export` y `auth_export`. Los perfiles están en Firestore; las credenciales de login en Auth deben mantenerse sincronizadas (ver `seed-auth-emulator.js`).

## Levantar el entorno

```bash
# Terminal 1 — emuladores (Firestore 8082, Auth 9099, UI 4000)
firebase emulators:start \
  --project polla-amigos-2026-sb \
  --only auth,firestore \
  --import=./emulator-data \
  --export-on-exit=./emulator-data

# Terminal 2 — app (o Docker)
NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true \
NEXT_PUBLIC_FIREBASE_EMULATOR_HOST=localhost \
npm run dev

# Con Docker
docker compose --profile emulator up --build
docker compose up web
```

La app conecta al emulador solo si `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true` (ver `src/lib/firebase.ts`).

## Errores frecuentes

### `INVALID_PASSWORD` en el emulador

- El email **sí existe** en Auth del emulador, pero la contraseña no coincide.
- Suele pasar si alguien creó el usuario en el emulador con otra clave, o si se importó solo Firestore.
- **No** implica que la contraseña de producción sea incorrecta.

### Login OK pero "cuenta desactivada o eliminada"

- Auth devolvió un UID distinto al documento en `users/{uid}`.
- Tras `signup` en el emulador se genera un UID nuevo; el perfil importado queda huérfano.
- Solución: crear el usuario de Auth con el **mismo UID** que el documento en Firestore.

### La app habla con producción

- Falta `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true` al arrancar `next dev`.
- Reiniciar el servidor tras cambiar variables `NEXT_PUBLIC_*`.

## Seed de usuarios Auth (contraseña unificada local)

El script `scripts/seed-auth-emulator.js` lee `users` de Firestore (emulador) y crea
cuentas en Auth con el mismo UID. Contraseña por defecto: `colombia1/`.

```bash
# Con emuladores corriendo
FIRESTORE_EMULATOR_HOST=localhost:8082 \
FIREBASE_AUTH_EMULATOR_HOST=localhost:9099 \
npm run seed:auth-emulator

# Persistir en emulator-data/ (exportar TODO, no solo auth)
firebase emulators:export ./emulator-data --force
```

Verificar `emulator-data/firebase-export-metadata.json`: debe listar `firestore` **y** `auth`.

## Puertos

| Servicio   | Puerto |
|-----------|--------|
| Next.js   | 3000   |
| Emulator UI | 4000 |
| Firestore | 8082   |
| Auth      | 9099   |

## Scripts existentes

- `scripts/seed-matches.js` — partidos (Firestore nube, no emulador)
- `scripts/make-admin.js` — `isAdmin` en Firestore (nube por defecto)
- Conectar scripts al emulador: `FIRESTORE_EMULATOR_HOST=localhost:8082`
