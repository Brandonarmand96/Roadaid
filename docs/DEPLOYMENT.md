# RoadAid live-testing deployment

This guide deploys the current RoadAid stack to one DigitalOcean Ubuntu Droplet and points the client-owned OneBit domain at it. It intentionally keeps PostgreSQL/PostGIS and Redis on the same USD 12/month, 1-vCPU/2-GB Droplet for controlled early live testing. Caddy is the only public-facing container and obtains/renews HTTPS certificates automatically.

## 1. Accounts and values to collect

Use client-owned accounts, enable two-factor authentication, and record ownership in `docs/HANDOVER.md`.

- DigitalOcean account with a valid payment method.
- OneBit login for `roadaid.ng` DNS management.
- GitHub access to this repository.
- Google Cloud project with billing enabled.
- Supabase project if using Supabase Storage for provider documents.
- Termii, Paystack, Firebase and Sentry credentials when those integrations are being tested.
- A real email address for Caddy/Let's Encrypt certificate notices.

Do not put any secret into Git, screenshots, chat, `EXPO_PUBLIC_*`, or a Google Maps browser key. Browser/mobile Maps keys are public identifiers protected by platform restrictions; server, Supabase service-role, Paystack, Termii, FCM and JWT values are secrets.

## 2. Create the DigitalOcean server

1. Sign in to DigitalOcean and create a Project named `RoadAid Production`.
2. On the local Windows computer, open PowerShell and create an SSH key if one is not already available:

   ```powershell
   ssh-keygen -t ed25519 -C "roadaid-deploy"
   Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub
   ```

3. In DigitalOcean, choose **Create → Droplets**.
4. Select the nearest suitable region to Abuja. Keep all future resources in that region.
5. Select **Ubuntu 24.04 LTS x64**.
6. Select **Basic → Regular → 1 vCPU / 2 GB RAM / 50 GB disk** (`s-1vcpu-2gb`).
7. Choose **SSH Key** authentication and paste the public key from step 2. Do not use password-only root login.
8. Name the Droplet `roadaid-prod-01`, assign it to the RoadAid project, and create it.
9. In DigitalOcean Networking, reserve an IP in the same region and assign it to this Droplet. Record it as `SERVER_IP`. DNS must use this reserved IP, not an address that may change when a Droplet is replaced.
10. Create a DigitalOcean Cloud Firewall and attach it to this Droplet:

    - inbound TCP 22 from the developer's current public IP only;
    - inbound TCP 80 from all IPv4/IPv6 addresses;
    - inbound TCP 443 from all IPv4/IPv6 addresses;
    - inbound UDP 443 from all IPv4/IPv6 addresses (HTTP/3; optional but supported);
    - allow all outbound traffic.

    Never expose 3000, 5432 or 6379.

## 3. Prepare Ubuntu

Connect from PowerShell, replacing the example IP:

```powershell
ssh root@SERVER_IP
```

On the server, update Ubuntu, enable its firewall, create swap, and install Docker:

```bash
apt update
apt upgrade -y
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

fallocate -l 4G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
printf 'vm.swappiness=10\n' > /etc/sysctl.d/99-roadaid.conf
sysctl --system

apt install -y ca-certificates curl git
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo \"$VERSION_CODENAME\") stable" > /etc/apt/sources.list.d/docker.list
apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker
docker compose version
free -h
```

The final `free -h` output must show approximately 4 GB of swap. Swap prevents a short build or migration spike from immediately killing containers; it is not a replacement for RAM.

## 4. Put the repository on the server

For a public repository:

```bash
install -d -m 0755 /opt/roadaid
git clone https://github.com/OWNER/REPOSITORY.git /opt/roadaid
cd /opt/roadaid
git checkout main
```

For a private repository, use a read-only GitHub deploy key. Generate it on the server with `ssh-keygen -t ed25519 -f /root/.ssh/roadaid_deploy -C roadaid-prod`, add the `.pub` value under the repository's **Settings → Deploy keys** without write access, add a matching SSH host entry, then clone the SSH URL. Do not embed a GitHub token in a command or remote URL.

## 5. Create the production environment

On the server:

```bash
cd /opt/roadaid/infrastructure
cp .env.production.example .env.production
chmod 600 .env.production
openssl rand -base64 48
```

Run the `openssl` command separately for the PostgreSQL password, Redis password, JWT access secret and JWT refresh secret. Each value must be unique. URL-encode the PostgreSQL and Redis passwords before inserting them into `DATABASE_URL` and `REDIS_URL`; an easy way to avoid encoding mistakes is to generate alphanumeric values with `openssl rand -hex 32` for those two passwords.

Edit the file:

```bash
nano .env.production
```

At minimum, replace every placeholder and set:

- `ACME_EMAIL` to the client's real operations email;
- `POSTGRES_PASSWORD`, `DATABASE_URL`, `REDIS_PASSWORD`, `REDIS_URL` consistently;
- both unique JWT secrets;
- `NEXT_PUBLIC_API_URL=https://api.roadaid.ng/v1`;
- `PUBLIC_API_URL=https://api.roadaid.ng`;
- `CORS_ORIGINS=https://roadaid.ng,https://www.roadaid.ng`;
- a temporary unique `ADMIN_BOOTSTRAP_PASSWORD`;
- Google, Supabase Storage and integration credentials that are ready.

There must be no `OTP_DEV_FIXED_CODE` in production. Begin payment testing with Paystack test credentials. `CUSTOMER_ONLINE_PAYMENTS_ENABLED=false` keeps customer online charging disabled until the complete test flow is approved.

Validate interpolation without printing the rendered configuration (which contains secrets):

```bash
cd /opt/roadaid
docker compose --env-file infrastructure/.env.production -f infrastructure/docker-compose.prod.yml config --quiet
```

## 6. Configure OneBit DNS

Open the DNS/Zone editor for `roadaid.ng`. Remove conflicting parked-site records for these names, then add:

| Type | Name/Host | Value | TTL |
|---|---|---|---|
| A | `@` | `SERVER_IP` | 300 or Automatic |
| A | `www` | `SERVER_IP` | 300 or Automatic |
| A | `api` | `SERVER_IP` | 300 or Automatic |

Do not change MX/TXT records used for email. Do not add an `/admin` DNS record: `/admin` is a path on the main website, not a subdomain. If OneBit has an AAAA record but the Droplet has no configured IPv6 address, remove that conflicting AAAA record.

From the local Windows computer, wait until all three resolve to `SERVER_IP`:

```powershell
Resolve-DnsName roadaid.ng -Type A
Resolve-DnsName www.roadaid.ng -Type A
Resolve-DnsName api.roadaid.ng -Type A
```

Do not start Caddy before the A records resolve correctly; certificate issuance validates the public domains.

## 7. Configure Google Maps correctly

The Google Play Developer account is not the Maps account. In the client-owned Google Cloud Console:

1. Create/select the `RoadAid Production` project and attach a billing account.
2. Enable **Maps SDK for Android**, **Maps SDK for iOS**, **Maps JavaScript API**, **Places API (New)**, **Geocoding API**, and **Routes API**.
3. Set a conservative billing budget and billing alerts. A budget alerts but does not automatically stop usage.
4. Create separate restricted keys—never reuse one unrestricted key:

   - **Android development key:** application restriction Android; package `co.roadaid.provider`; add the development signing SHA-1; API restriction Maps SDK for Android.
   - **Android production key:** application restriction Android; package `co.roadaid.provider`; add the EAS production keystore SHA-1; API restriction Maps SDK for Android.
   - **iOS key:** application restriction iOS; bundle ID `co.roadaid.provider`; API restriction Maps SDK for iOS.
   - **Browser key:** website restriction with `https://roadaid.ng/*` and `https://www.roadaid.ng/*`; API restriction Maps JavaScript API. Put this in `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`.
   - **Server key:** IP restriction set to `SERVER_IP`; restrict it to Places API (New), Geocoding API and Routes API. Put this in `GOOGLE_MAPS_SERVER_KEY`.

5. If Google offers separate quota controls for enabled APIs, set limits appropriate for live testing.
6. After changing the browser key in `.env.production`, rebuild `admin`; it is compiled into the Next.js browser bundle.

## 8. Configure document storage

The production template uses Supabase Storage, not the Droplet filesystem, so provider documents survive container replacement.

1. In a client-owned Supabase project, create a **private** bucket named `provider-documents`.
2. Copy the project URL and service-role key into `.env.production` as `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
3. Never put the service-role key into mobile code or any `NEXT_PUBLIC_*`/`EXPO_PUBLIC_*` variable.

This does not move PostgreSQL to Supabase. The initial database remains the containerized PostGIS database on the Droplet to stay within the stated budget.

## 9. Build and start RoadAid

On the server:

```bash
cd /opt/roadaid
docker compose --env-file infrastructure/.env.production -f infrastructure/docker-compose.prod.yml build
docker compose --env-file infrastructure/.env.production -f infrastructure/docker-compose.prod.yml up -d
docker compose --env-file infrastructure/.env.production -f infrastructure/docker-compose.prod.yml ps
```

The `migrate` service applies Prisma migrations once before the API starts. The API no longer seeds on every restart.

Create/update the bootstrap admin once:

```bash
docker compose --env-file infrastructure/.env.production -f infrastructure/docker-compose.prod.yml --profile tools run --rm bootstrap-admin
```

Keep the unique, non-default `ADMIN_BOOTSTRAP_PASSWORD` in `.env.production`: production environment validation requires it. The seed is not run during ordinary API restarts, and rerunning it does not overwrite an existing administrator password. Keep the file mode at `600`, restrict server access, and rotate the administrator password through the approved account workflow after initial login when that workflow is available.

Inspect startup without exposing environment variables:

```bash
docker compose --env-file infrastructure/.env.production -f infrastructure/docker-compose.prod.yml logs --tail=100 caddy api admin migrate
```

## 10. Verify the public deployment

From the local computer:

```powershell
curl.exe -I https://roadaid.ng
curl.exe https://api.roadaid.ng/health
curl.exe https://api.roadaid.ng/ready
```

Then manually verify:

1. `https://roadaid.ng/` shows the public homepage.
2. `https://roadaid.ng/admin` shows the staff login and is not linked from the homepage.
3. The browser certificate is valid for all three hostnames.
4. The admin map loads without a key/referrer error.
5. Browser developer tools show API calls only to `https://api.roadaid.ng/v1`, with no mixed-content errors.
6. Ports `3000`, `5432` and `6379` are unreachable from the internet.

If HTTPS fails, first re-check DNS and firewall, then inspect `docker compose ... logs caddy`. Repeated blind restarts can trigger certificate-authority rate limits.

## 11. Configure Paystack, Termii and Firebase

- Paystack test webhook URL: `https://api.roadaid.ng/v1/webhooks/paystack`. Confirm the exact controller route before saving if it is changed in code. Use test keys for live testing; switching to live keys requires explicit client approval and a charging test plan.
- Termii: add the API key and approved sender ID, then test one OTP to a controlled phone number.
- Firebase/FCM: use the client-owned Firebase project, base64-encode the service-account JSON as required by the API configuration, and set `FCM_SERVICE_ACCOUNT_JSON`. Treat it as a secret.
- Sentry: set the production DSN and confirm a controlled test event before relying on alerts.

Restart only affected services after server-side secret changes:

```bash
docker compose --env-file infrastructure/.env.production -f infrastructure/docker-compose.prod.yml up -d --no-deps api
```

## 12. Point EAS mobile builds at production

From `apps/provider-mobile` on the development computer, authenticate to the correct client-owned Expo account and set production-profile variables:

```powershell
pnpm dlx eas-cli@latest whoami
pnpm dlx eas-cli@latest env:create --environment production --name EXPO_PUBLIC_API_URL --value https://api.roadaid.ng/v1 --visibility plaintext
pnpm dlx eas-cli@latest env:create --environment production --name EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY --value YOUR_ANDROID_PRODUCTION_KEY --visibility sensitive
pnpm dlx eas-cli@latest env:create --environment production --name EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY --value YOUR_IOS_KEY --visibility sensitive
pnpm dlx eas-cli@latest build --platform android --profile production
```

Use the development signing SHA-1 and development key for a development-client build. Use the EAS production keystore SHA-1 and production key for the production/closed-testing build. A key restricted to the wrong signing certificate makes the map appear blank even when the code is correct.

## 13. Live-testing gate

Do not call the system production-ready until all applicable checks pass:

- automated lint, typecheck, tests and builds are green for the deployed commit;
- database migrations completed and `/health` plus `/ready` pass;
- customer and provider test accounts can authenticate with real OTP;
- admin access and role restrictions work;
- each of FUEL, TOWING and LOCKOUT completes on physical devices;
- sequential dispatch, decline/timeout fallback and one-active-job protection are observed;
- background/locked-phone offer and location behavior is tested;
- Google maps, route ETA, Paystack test payments/webhook and push notifications work;
- backup and isolated restore drill succeeds;
- logs and Sentry contain no unhandled production errors.

Use `docs/DEVICE_TESTS.md` for device evidence. Keep Paystack in test mode during this gate.

## 14. Backups, updates and rollback

Nightly PostgreSQL backups must leave the Droplet and land in client-owned object storage with 14-day retention. Configure the existing `infrastructure/scripts/backup.sh` only after its destination credentials are set, run it manually once, confirm the remote object exists and is non-empty, then schedule it. Perform an isolated restore drill before live customer data is accepted.

For a normal release:

```bash
cd /opt/roadaid
git fetch --tags origin
git checkout RELEASE_TAG
docker compose --env-file infrastructure/.env.production -f infrastructure/docker-compose.prod.yml build
docker compose --env-file infrastructure/.env.production -f infrastructure/docker-compose.prod.yml up -d
docker compose --env-file infrastructure/.env.production -f infrastructure/docker-compose.prod.yml ps
```

Record the deployed Git tag and image IDs. Never roll a database migration backward blindly. Follow `docs/RUNBOOK.md` for rollback, restore and dispatch incidents.

Monitor at least daily during live testing:

```bash
free -h
df -h
docker stats --no-stream
docker system df
```

Upgrade the Droplet when memory remains near 80%, swap is continuously active, an out-of-memory kill occurs, disk approaches 75%, or measured request/queue performance degrades. A 2-GB Droplet is an intentional low-volume starting point, not an unlimited capacity claim.
