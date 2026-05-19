# Rules

## APIs
- The user login endpoint is `/api/v1/auth/login`.
- The user profile endpoint is `/api/v1/users/:userId/profile`.
- A missing endpoint `/api/v2/ghost/endpoint`.

## Envs
- Required env: `DATABASE_URL`.
- Required env: `REDIS_CACHE_URL`.
- Missing env: `GHOST_ENV_VAR`.

## Files
- Config at `src/config/index.ts`.
- Missing file `src/missing/file.ts`.
