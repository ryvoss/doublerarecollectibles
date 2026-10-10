# Railway deployment

This repository is prepared for one Railway Node service and one Railway PostgreSQL database. Express serves both the `/api/*` routes and the built Vite application, including browser-history fallback for public and `/admin` routes.

## Required environment

- `DATABASE_URL`: the PostgreSQL connection URL supplied by Railway.
- `APP_ENV=REAL`: enables the real-business database guard. The server refuses test-named databases in this mode.
- `NODE_ENV=production`: enables static frontend serving and production error behavior.
- `PORT`: supplied automatically by Railway. Do not set a fixed Railway port.

Optional database configuration:

- `DIRECT_DATABASE_URL`: use only when a provider supplies a separate direct connection for migrations. If both URLs include a database name, they must name the same database. The direct URL is also retained for compatibility with the existing local Prisma development listener.
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
- Health check path: `/api/health`

`npm run build` generates the Prisma client, type-checks the app, builds the Vite frontend into `dist`, and bundles the Express server into `dist-server/server.js`. `npm run start` runs compiled JavaScript and does not require the `tsx` development runtime.

The pre-deploy command uses `prisma migrate deploy`, which applies the committed migrations in `prisma/migrations`. It does not create development migrations, seed data, reset data, or recreate the database.

## PostgreSQL and data safety

Attach a standard Railway PostgreSQL service and provide its connection URL as `DATABASE_URL`. The runtime and Prisma migration configuration both accept a normal PostgreSQL URL. Existing database identity checks remain active for application startup and Prisma commands.

Never run these against production:

- `prisma migrate dev`
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
