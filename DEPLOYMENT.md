# Railway deployment

This repository is prepared for one Railway Node service and one Railway PostgreSQL database. Express serves both the `/api/*` routes and the built Vite application, including browser-history fallback for public and `/admin` routes.

## Required environment

- `DATABASE_URL=${{Postgres.DATABASE_URL}}`: reference the private connection URL from the Railway Postgres service. Replace `Postgres` only if the database service has a different Railway service name.
- `DIRECT_DATABASE_URL=${{Postgres.DATABASE_URL}}`: use the same Railway Postgres reference. The application supports a distinct direct URL when a provider supplies one, but Railway's standard Postgres service uses the same URL for both.
- `APP_ENV=REAL`: enables the real-business database guard. The server refuses test-named databases in this mode.
- `NODE_ENV=production`: enables static frontend serving and production error behavior.
- `PORT`: supplied automatically by Railway. Do not set a fixed Railway port.

Optional database configuration:

- `SHADOW_DATABASE_URL`: development-only for `prisma migrate dev`; it is not needed by production deployment migrations.

Image configuration:

- Local development: `IMAGE_STORAGE_DRIVER=local` and optionally `LOCAL_UPLOADS_DIR=uploads`.
- Durable S3-compatible storage: `IMAGE_STORAGE_DRIVER=s3`.
- Railway bucket references: `BUCKET`, `ENDPOINT`, `ACCESS_KEY_ID`, `SECRET_ACCESS_KEY`, and `REGION`.
- Portable aliases: `S3_BUCKET_NAME`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, and `S3_REGION`.
- `S3_FORCE_PATH_STYLE=true` is optional when an S3-compatible provider specifically requires path-style requests. Railway normally uses the default virtual-hosted style shown in the bucket Credentials tab.

When both forms are present, the `S3_*` name takes precedence. `S3_REGION`/`REGION` defaults to `auto` when omitted. Use Railway variable references rather than copying bucket credentials into source files.

## Railway commands

- Build: `npm run build`
- Pre-deploy migration: `npm run db:migrate:deploy`
- Start: `npm run start`
- Health check: `GET /api/health`

These commands are committed in `railway.json`. Railway automatically runs them in this order for each deployment:

1. Build the application with `npm run build`.
2. Run `npm run db:migrate:deploy` in Railway's deployment environment, where the Postgres private hostname is reachable.
3. Start the application with `npm run start` only after migration succeeds.
4. Verify the new deployment through `/api/health` before considering it healthy.

No Railway CLI command, local database connection, copied password, or SSH tunnel is required. Commit and push `railway.json`, then trigger or redeploy the app service normally. If the pre-deploy migration exits nonzero or times out, Railway fails the deployment and does not start that release against an unmigrated schema. A five-minute health-check timeout is configured; set a separate Pre-deploy Timeout in Railway's service settings if a migration timeout is desired.

`npm run build` generates the Prisma client, type-checks the app, builds the Vite frontend into `dist`, and bundles the Express server into `dist-server/server.js`. `npm run start` runs compiled JavaScript and does not require the `tsx` development runtime.

The pre-deploy command uses `prisma migrate deploy`, which applies the committed migrations in `prisma/migrations`. It does not create development migrations, seed data, reset data, or recreate the database.

## PostgreSQL and data safety

Attach a standard Railway PostgreSQL service and configure both database variables as Railway references:

```text
DATABASE_URL=${{Postgres.DATABASE_URL}}
DIRECT_DATABASE_URL=${{Postgres.DATABASE_URL}}
APP_ENV=REAL
NODE_ENV=production
```

Do not copy the resolved password or private hostname into the repository. Railway resolves the references inside its network. The runtime and Prisma migration configuration both accept the standard PostgreSQL URL, and the existing database identity checks remain active for application startup and Prisma commands.

Local development remains unchanged: local `.env` and `.env.test` files provide their existing URLs, are ignored by Git, and are not used by Railway. `DIRECT_DATABASE_URL` remains preferred locally for compatibility with the existing Prisma development listener.

Never run these against production:

- `prisma migrate dev`
- `prisma migrate reset`
- `npm run test:setup`
- `npm run test:reset`
- `scripts/reset-business-data.ts`
- test seed scripts or any database reset/recreation command

Do not seed production automatically. Import or migrate existing REAL data only through a separately reviewed backup-and-restore plan.

## Image storage

Product images and site assets use the same `ProductImageStorage` interface with local-filesystem and private S3-compatible implementations. Use `local` for development and `s3` for Railway production. Railway application files are ephemeral, so production uploads must not use the local driver.

Buckets remain private. Product and site asset URLs continue to point at `/api/public/product-images/...` and `/api/public/site-assets/...`. Those routes verify that the key is assigned in PostgreSQL, read the object with server-side credentials, and stream the image to the customer. Bucket endpoints and credentials are never returned to the browser.

Existing local images are not migrated automatically. To migrate later, upload each file under `uploads/` to the bucket using the same relative object key stored in PostgreSQL, such as `products/42/<uuid>.webp` or `site-assets/primary-logo/<uuid>.png`. Verify the bucket copy before enabling `IMAGE_STORAGE_DRIVER=s3`. Keep the local files as a backup until every referenced image has been checked; no database key change is needed when the object keys are preserved.

## Private-first deployment

The application does not currently authenticate `/admin` or the internal admin APIs. Keep the service inaccessible from the public internet during the initial private deployment by withholding a public domain or using Railway/team access controls. Before public launch, add authentication and authorization for `/admin` and every non-public API route; UI route separation alone is not an access-control boundary.

Public customer endpoints remain under `/api/public/*`. Unknown `/api/*` requests return JSON 404 responses and are never rewritten to the React application.
