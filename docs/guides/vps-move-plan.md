# Production VPS Move & Disaster Recovery Plan

Authoritative operational runbook for deploying, securing, operating, and recovering SmartSpend AI on a dedicated or virtual private server (VPS).

This document details the configuration implemented in `docker-compose.prod.yml`, `docker/nginx/`, and `scripts/vps/`.

---

## 1. System Architecture & Topology

The production stack isolates concerns across container networks and loopback-bound ports to enforce security in depth:

```
                  [ Public Internet (IPv4 / IPv6) ]
                                |
                        Port 80 / Port 443
                                |
             +------------------v------------------+
             |         smartspend-proxy             |
             |       (Nginx 1.27-alpine)           |
             |     TLS Termination & Proxy          |
             +------------------+------------------+
                                | (frontend-network)
                                | Port 3000
             +------------------v------------------+
             |          smartspend-app             |
             |       (Node 22-alpine ESM)          |
             |   API, PWA, Voice WS, Cron Master   |
             +--------+--------------------+-------+
                      |                    |
        (backend-network)        (backend-network)
             Port 3306                    Port 6379
                      |                    |
     +----------------v-------+   +--------v---------------+
     |    smartspend-mysql    |   |    smartspend-redis    |
     |      (MySQL 8.4)       |   |   (Redis 7.4-alpine)   |
     |  3GB Buffer Pool, AOF  |   | 1GB LRU, AOF Sync      |
     +------------------------+   +------------------------+
```

### Services Summary

| Service | Image | Ports | Memory Target | Healthcheck | Role |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`proxy`** | `nginx:1.27-alpine` | `80:80`, `443:443` | ~64 MB | Nginx master process | Public reverse proxy, TLS termination, WebSocket & SSE routing, security headers |
| **`app`** | `smartspend-api:latest` | `127.0.0.1:3000:3000` | ~1 GB | `GET /health` HTTP 200 | Node 22 runtime serving tRPC, PWA static assets, WebSocket `/api/voice/v2`, and background crons |
| **`mysql`** | `mysql:8.4` | `127.0.0.1:3308:3306` | 3.0 GB InnoDB Pool | `mysqladmin ping` via socket | Primary relational database; `utf8mb4_unicode_ci`; application-enforced integrity (no FKs) |
| **`redis`** | `redis:7.4-alpine` | `127.0.0.1:6379:6379` | 1.0 GB Maxmemory | `redis-cli ping` | Shared rate limiters, session cache, outbox locks, AI classification cache |
| **`certbot`** | `certbot/certbot:latest` | None | ~32 MB | Background daemon | Automated Let's Encrypt TLS renewal (12-hour timer) |

---

## 2. Server Sizing & Prerequisites

### Recommended Server Specification

- **Compute**: 4 vCPU (x86_64 architecture).
- **RAM**: 8 GB RAM minimum (3 GB MySQL buffer pool + 1 GB Redis LRU + 1.5 GB Node + 2.5 GB OS/buffers).
- **Storage**: 80 GB NVMe SSD minimum.
- **Operating System**: Ubuntu 24.04 LTS (Noble Numbat) or Debian 12 (Bookworm).
- **Network**: Static public IPv4, optional IPv6, 1 Gbps port.

---

## 3. Host Hardening Baseline

Prior to deploying Docker containers, harden the host Linux operating system:

### 3.1 Non-Root User & SSH Hardening

1. Create a dedicated deploy user with sudo privileges:
   ```bash
   adduser smartspend
   usermod -aG sudo smartspend
   ```
2. Configure SSH keys in `/home/smartspend/.ssh/authorized_keys`.
3. Harden `/etc/ssh/sshd_config`:
   ```sshconfig
   PermitRootLogin no
   PasswordAuthentication no
   X11Forwarding no
   MaxAuthTries 3
   ```
4. Restart SSH service: `sudo systemctl restart ssh`.

### 3.2 Firewall Configuration (UFW)

Only SSH, HTTP, and HTTPS must be accessible from the public internet. All database and internal service ports are bound to `127.0.0.1`:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp comment 'SSH'
sudo ufw allow 80/tcp comment 'HTTP ACME & Redirect'
sudo ufw allow 443/tcp comment 'HTTPS TLS'
sudo ufw enable
```

### 3.3 Fail2ban

Install and enable Fail2ban to block brute-force attempts:
```bash
sudo apt update && sudo apt install -y fail2ban
sudo systemctl enable --now fail2ban
```

---

## 4. Docker Engine & Compose Installation

Install Docker Engine and Docker Compose v2 via the official repository:

```bash
# Add Docker's official GPG key:
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# Add repository to Apt sources:
echo \
  "deb [arch="$(dpkg --print-architecture)" signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  "$(. /etc/os-release && echo "$VERSION_CODENAME")" stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker smartspend
```

Configure Docker daemon logging in `/etc/docker/daemon.json` to prevent disk exhaustion:
```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "50m",
    "max-file": "5"
  }
}
```
Restart Docker: `sudo systemctl restart docker`.

---

## 5. Deployment Setup & Secrets Checklist

1. Clone repository to `/opt/smartspend`:
   ```bash
   sudo mkdir -p /opt/smartspend
   sudo chown -R smartspend:smartspend /opt/smartspend
   cd /opt/smartspend
   git clone <repo_url> .
   git checkout claude/mobile-program
   ```

2. Make VPS disaster recovery scripts executable:
   ```bash
   chmod +x scripts/vps/*.sh
   ```

3. Create the production `.env` file (`chmod 600 .env`):
   Every secret must meet the minimum 32-character complexity threshold:

   | Variable | Requirement | Description |
   | :--- | :--- | :--- |
   | `NODE_ENV` | `production` | Enables production optimizers and redactions |
   | `PORT` | `3000` | Application internal HTTP port |
   | `APP_URL` | `https://smartspend.ai` | Canonical URL for auth redirects & links |
   | `MYSQL_DATABASE` | `smartspend` | Database name |
   | `MYSQL_USER` | `smartspend` | Application database user |
   | `MYSQL_PASSWORD` | `>= 32 chars` | Application database password |
   | `MYSQL_ROOT_PASSWORD` | `>= 32 chars` | MySQL root administrative password |
   | `JWT_SECRET` | `>= 32 chars` | Cryptographic secret for session tokens |
   | `AI_GATEWAY_SECRET` | `>= 32 chars` | Cryptographic key sealing AI provider keys |
   | `PAYMOB_HMAC_SECRET` | Secret string | Paymob webhook validation secret |
   | `ENABLE_CRONS` | `true` | Enables scheduled jobs on this single master node |
   | `TRUST_PROXY` | `true` | Tells Express/Hono to trust Nginx proxy headers |
   | `TRUSTED_PROXY_IPS` | `127.0.0.1,172.16.0.0/12` | Trusted CIDR ranges for proxy headers |

---

## 6. TLS Provisioning (Certbot Bootstrap)

Before launching the full Nginx TLS stack, obtain the initial Let's Encrypt certificate:

```bash
# 1. Start temporary standalone certbot or HTTP Nginx for challenge validation
docker compose -f docker-compose.prod.yml run --rm --entrypoint \
  "certbot certonly --webroot -w /var/www/certbot \
   --email ops@smartspend.ai --agree-tos --no-eff-email \
   -d smartspend.ai -d www.smartspend.ai" certbot

# 2. Verify certificates were generated:
docker compose -f docker-compose.prod.yml run --rm --entrypoint \
  "ls -la /etc/letsencrypt/live/smartspend.ai" certbot
```

---

## 7. Database Initialization & Migration Preflight

Before starting the web application container:

1. Start database and cache services:
   ```bash
   docker compose -f docker-compose.prod.yml up -d mysql redis
   ```
2. Wait for MySQL to report healthy:
   ```bash
   docker compose -f docker-compose.prod.yml ps
   ```
3. Run migration doctor:
   ```bash
   npm run db:doctor
   ```
   - On a new database: run `npm run db:migrate`.
   - On an existing database populated without journal: run `npm run db:doctor -- --baseline`, then `npm run db:migrate`.
4. Validate preflight gates:
   ```bash
   ./scripts/vps/preflight.sh
   ```

---

## 8. Launching the Production Stack

Start all services in detached mode with build:
```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Verify service status:
```bash
docker compose -f docker-compose.prod.yml ps
```
All containers (`smartspend-proxy`, `smartspend-app`, `smartspend-mysql`, `smartspend-redis`) must show status `Up (healthy)`.

Test health check:
```bash
curl -I http://127.0.0.1:3000/health
curl -I https://smartspend.ai/health
```

---

## 9. Automated Backups & Disaster Recovery

### 9.1 Daily Automated Backup Schedule

Configure a system cron job on the VPS host to run every morning at 03:00 Cairo time (01:00 UTC):
```bash
sudo crontab -u smartspend -e
```
Add the following line:
```cron
0 1 * * * /opt/smartspend/scripts/vps/backup.sh >> /var/log/smartspend-backup.log 2>&1
```

### 9.2 Backup Script Features (`scripts/vps/backup.sh`)

- Uses `mysqldump` with `--single-transaction --quick --routines --triggers --events --hex-blob --default-character-set=utf8mb4`.
- Triggers Redis `bgsave` and archives `/data/dump.rdb`.
- Compresses with `gzip -9` -> `smartspend_db_<TIMESTAMP>.sql.gz`.
- Generates JSON metadata (`smartspend_db_<TIMESTAMP>.json`) with SHA-256 checksum and record counts.
- **Retention**: Automatically prunes archives older than 30 days while always keeping at least 3 historical snapshots.
- **Security**: Redacts all passwords and credentials from stdout and logs.

### 9.3 Database Restoration (`scripts/vps/restore.sh`)

To restore from a backup:
```bash
./scripts/vps/restore.sh /opt/smartspend/backups/smartspend_db_20261101_030000.sql.gz
```
The script will:
1. Verify gzip file integrity (`gzip -t`).
2. Verify SHA-256 checksum against companion `.json` metadata.
3. Take an automatic **pre-restore safety snapshot** (`pre_restore_<TIMESTAMP>.sql.gz`) of current state.
4. Stream decompressed SQL into MySQL container.
5. Restart `smartspend-app` and verify `/health` responds with HTTP 200.

### 9.4 Zero-Loss Rollback (`scripts/vps/rollback.sh`)

If a software release or migration introduces an issue:
```bash
# Roll back code to previous commit and restore pre-migration DB snapshot:
./scripts/vps/rollback.sh --git-ref v1.4.2 --db-snapshot /opt/smartspend/backups/pre_migrate_20261101.sql.gz
```

---

## 10. Operational Runbook & Common Incident Scenarios

### Incident 1: Healthcheck Fails on App Container
1. Check logs:
   ```bash
   docker compose -f docker-compose.prod.yml logs --tail=100 app
   ```
2. Check database connectivity:
   ```bash
   docker exec -it smartspend-mysql mysqladmin ping --protocol=socket
   ```
3. Restart application:
   ```bash
   docker compose -f docker-compose.prod.yml restart app
   ```

### Incident 2: MySQL Buffer Pool Pressure or Slow Queries
1. View slow queries:
   ```bash
   docker exec -it smartspend-mysql tail -f /var/lib/mysql/smartspend-slow.log
   ```
2. Verify buffer pool utilization:
   ```bash
   docker exec -it smartspend-mysql mysql -u smartspend -p -e "SHOW ENGINE INNODB STATUS\G"
   ```

### Incident 3: Redis Memory Limit Exceeded
1. Inspect memory usage and keys:
   ```bash
   docker exec -it smartspend-redis redis-cli info memory
   ```
2. Note: Redis is configured with `--maxmemory 1gb` and `--maxmemory-policy allkeys-lru`, which automatically evicts least recently used cache entries under pressure without service disruption.
