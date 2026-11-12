# cPanel / Plesk / DirectAdmin (Phusion Passenger)

For hosts with "Setup Node.js App" (cPanel/CloudLinux), the Plesk Node.js extension or similar Passenger setups.

1. Upload and unpack the release (`npm run release`) into the app folder, outside the public `public_html`.
2. Create the Node.js app in the panel:
   - Node 20.19 or newer (22 LTS recommended);
   - application root = that folder;
   - **startup file `passenger.cjs`** (Passenger loads CommonJS; it starts the ESM server);
   - mode production.
3. Run `npm ci --omit=dev` (panel button or SSH), then `npm run setup`, and restart the app.
4. **Environment variables:** use `.env`, or the panel's variable list (panel values win).

Passenger sets the port itself, so don't configure `PORT` or `HOST`. Because Passenger may use a Unix socket, set `PUBLIC_URL=https://your-domain` for the built-in scheduler. Alternatively, set `JOBS_INTERVAL_MINUTES=0` and add a panel cron job:
`curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://your-domain/api/cron`.
