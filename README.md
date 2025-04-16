# **AzrovaDash**

AzrovaDash is a sleek, next-gen client dashboard for the [Pterodactyl Panel](https://pterodactyl.io), built with **TypeScript**, powered by **Bun**, and designed for speed, customization, and modern aesthetics.

---

## Prerequisites

Install the following on your **Linux server**:

- [Bun](https://bun.sh/docs/installation)
- Git
- Nginx
- Certbot (for SSL, optional)
- A domain name (e.g. `dash.example.com`)
- Existing Pterodactyl Panel instance with:
  - Base URL
  - Client API Key
  - Admin API Key

---

## Installation

### 1. Clone AzrovaDash

```bash
cd /var/www
git clone https://github.com/Azrova/AzrovaDash.git
cd /var/www/AzrovaDash
```

### 2. Set permissions

```bash
sudo chown -R www-data:www-data /var/www/AzrovaDash
```

### 3. Install dependencies & build CSS

```bash
bun install
bun run build:css
```

---

## Configuration

### 1. Configure `.env`

```bash
mv example.env .env
nano .env
```

### 2. Add environment variables

```env
APP_NAME=AzrovaDash
PORT=3000

# Pterodactyl Panel Settings
PANEL_URL=
PANEL_API_KEY=
PANEL_CLIENT_KEY=

# Session Secret (Generate a random string)
SESSION_SECRET=
```

---

## 🧪 Development Mode (Optional)

```bash
cd /var/www/AzrovaDash
bun run start
```

Visit: `http://<your-server-ip>:3000`

---

## Systemd Service

### 1. Create service file

```bash
sudo nano /etc/systemd/system/azrovadash.service
```

Paste:

```ini
[Unit]
Description=AzrovaDash
After=network.target

[Service]
User=www-data
Group=www-data
ExecStart=/bin/bash -c 'cd /var/www/AzrovaDash && bun run start'
Restart=always

[Install]
WantedBy=multi-user.target
```

### 2. Start service

```bash
sudo systemctl daemon-reload
sudo systemctl enable azrovadash
sudo systemctl start azrovadash
sudo journalctl -u azrovadash -f
```

---

## Nginx Configuration

### Option A: No SSL (HTTP only)

```nginx
server {
    listen 80;
    server_name dash.example.com; # Replace with your actual domain

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Option B: With SSL (HTTPS via Certbot)

```nginx
server {
    listen 80;
    server_name dash.example.com; # Replace with your actual domain
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name dash.example.com; # Replace with your actual domain

    ssl_certificate /etc/letsencrypt/live/dash.example.com/fullchain.pem; # Replace with your actual domain
    ssl_certificate_key /etc/letsencrypt/live/dash.example.com/privkey.pem; # Replace with your actual domain
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Enable and reload Nginx

```bash
sudo ln -s /etc/nginx/sites-available/azrovadash /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## SSL with Certbot

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d dash.example.com
```

---

## You’re Done!

AzrovaDash should now be live at:

- **HTTP**: `http://dash.example.com`
- **HTTPS**: `https://dash.example.com` (if enabled)

If you have any suggestion or an issue, feel free to join my [Discord Server](https://discord.gg/qC9vEY8y25) and ask on the #support channel for support and #suggestions channel for suggestions <3
