# VPS deployment and recovery

This page describes the configuration and helper scripts in this repository, not the state of any deployed server.
Read [deployment](deploy.md) for build, database and environment details. Review the actual host, domains, secrets,
backups and release before using these commands.

## Stack

`docker-compose.prod.yml` runs MySQL 8.4, Redis 7.4, the app, Nginx and Certbot. The app, MySQL and Redis publish
ports 3000, 3308 and 6379 on loopback; Nginx publishes 80 and 443. The app serves the API and admin console, not the
parked website. The compose file enables cron jobs and sets proxy trust for the app. MySQL has a 3 GB InnoDB buffer
pool; Redis uses a 1 GB limit, `volatile-lru` and AOF. Under memory pressure only keys with an expiry are candidates
for eviction; writes can fail if Redis cannot evict enough memory. Size the host for its actual workload.

`docker/nginx/conf.d/smartspend.conf` names `smartspend.ai` and `www.smartspend.ai` and expects certificate files under
`/etc/letsencrypt/live/smartspend.ai/`. Adapt the configuration to the actual domains before deployment. It forwards
the voice WebSocket and disables buffering for the admin event stream.

## Prepare and deploy

1. Install Docker and Compose on the host, restrict access to SSH and public web ports, and protect the `.env` file.
   Use a reviewed release or commit, not a development branch. Configure the variables in [deployment](deploy.md#environment)
   and `docker-compose.prod.yml`; production compose overrides `DATABASE_URL`, `REDIS_URL`, cron and proxy settings
   for the app container. The host-side database tools need their own `DATABASE_URL` pointing to the loopback port.
2. Provision a certificate for the configured domains **before** starting the supplied TLS Nginx configuration: it
   references certificate files on startup. The included Certbot service runs `renew`, not initial issuance. A webroot
   challenge requires an HTTP server actually serving the shared challenge volume; choose and verify a bootstrap
   method for the host and DNS. The renewal loop does not reload Nginx, and `restart: "no"` does not restart it after
   a container or host stop; arrange and test renewal, reload and monitoring separately.
3. Start MySQL and Redis with `docker compose -f docker-compose.prod.yml up -d mysql redis`. From a checkout with
   Node and dependencies installed, check `npm run db:doctor`, then apply reviewed migrations with `npm run db:migrate`.
   Follow the baseline instructions in [deployment](deploy.md#database) for an existing unjournaled database.
4. Run `docker compose -f docker-compose.prod.yml up -d --build`, inspect `docker compose -f docker-compose.prod.yml ps`
   and the logs, and check `GET /health` locally and through the public proxy. Compose defines healthchecks for MySQL,
   Redis and the app; it does not define one for Nginx or Certbot. A health response alone does not verify application
   journeys, backups or certificate renewal.

## Backups and restoration

`scripts/vps/backup.sh` dumps MySQL with `--single-transaction` to `backups/smartspend_db_<timestamp>.sql.gz`, tests
gzip integrity and writes SHA-256 metadata. It tries Redis `BGSAVE`, waits two seconds and copies `dump.rdb`, but
ignores failures and does not wait for completion; the Redis file may be missing or old. It removes MySQL archives
over 30 days old while keeping at least three; Redis snapshots are not rotated by that loop. The metadata's table list
is fixed and contains no row counts. Schedule and monitor backups separately, store copies off-host and test restoration of the actual archives. `scripts/ops/backup-restore-check.sh` creates
a fresh dump and restores it to a scratch database to compare row counts; it does not validate an existing archive. A cron time in UTC does not stay at a fixed
Cairo local hour across daylight-saving changes.

`scripts/vps/restore.sh <archive.sql.gz>` checks gzip and compares SHA-256 only when matching metadata exists. It asks
for confirmation unless `--force` is supplied. It attempts a pre-restore dump but ignores failure, streams the archive
into the configured MySQL database, then restarts the app and checks `/health` if the app container exists. It does not
restore Redis, stop writes before restoring, or guarantee no data loss. Arrange a maintenance window, independently
verify a current backup and understand the writes that will be lost before restoring.

`scripts/vps/rollback.sh --git-ref <ref> --db-snapshot <archive.sql.gz>` optionally restores the database first,
checks out the ref, rebuilds the app and polls health. Either argument may be omitted. A snapshot restore can discard
later writes; test compatibility of the code and schema and retain a verified current backup. The scripts do not provide
a zero-loss guarantee.

`scripts/vps/preflight.sh` checks that MySQL responds, that a `*.sql.gz` file chosen by reverse filename order is less
than 15 minutes old, and that `npm run db:doctor -- --strict` passes. It checks neither the archive's contents nor its
restorability; the strict schema check may also report a mismatch when reviewed migrations are pending.

## Investigating a failure

- Inspect `docker compose -f docker-compose.prod.yml ps` and `docker compose -f docker-compose.prod.yml logs --tail=100 app`.
- Check MySQL with `docker exec smartspend-mysql mysqladmin ping --protocol=socket` and Redis with
  `docker exec smartspend-redis redis-cli info memory`. The compose file enables MySQL's slow query log but does not
  set a custom log filename; query the server's `slow_query_log_file` setting before looking for it.
- The health endpoint only reports whether the app responds. Investigate failing dependencies and the affected journey
  before treating a restart as a fix.
