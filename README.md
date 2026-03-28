# Support Agent Full Stack Project

## Structure

- `backend/`: Node.js Express server, Shopify auth/sync, hosted merchant app page
- `frontend/`: React merchant/customer workspace for local development
- `zypher-bot/`: Shopify CLI app + theme app extension for the storefront widget

## Local development

### Backend
1. Navigate to `backend`.
2. Run `npm install`.
3. Start server with `npm start`.

### Frontend
1. Navigate to `frontend`.
2. Run `npm install`.
3. Start the dev UI with `npm start`.

### Shopify embed
1. Navigate to `zypher-bot`.
2. Run `shopify app dev --theme-app-extension-port 9295`.

## Public deployment foundation

The app can now be deployed as a single hosted backend that also serves the built frontend.

### What the host is for

A host is the public server where your app lives on the internet.

For this app, the host is responsible for:
- serving the Shopify in-app merchant page
- serving the built workspace at `/workspace`
- running the backend API and OpenAI calls
- receiving Shopify OAuth callbacks
- storing your app data on the server

In other words, the host replaces:
- `localhost:3001`
- `localhost:3000`
- temporary tunnel URLs for the main merchant flow

### Build the merchant workspace
1. Navigate to `backend`.
2. Run `npm run build:frontend`.

This creates a production frontend bundle in `frontend/dist`.

### Hosted surfaces
- Shopify in-app merchant page: `/`
- Built React workspace: `/workspace`
- Backend health check: `/health`

### Required environment variables
Use `backend/.env.example` as the template.

Important production values:
- `SHOPIFY_APP_URL=https://your-public-backend-url.com`
- `SHOPIFY_AFTER_AUTH_REDIRECT=https://your-public-backend-url.com/workspace?shopify=connected`

### Production direction

For a real public launch, host:
- the backend on a stable HTTPS domain
- the Shopify app URLs on that same stable backend domain
- the theme app extension through the Shopify app project in `zypher-bot`

This removes the dependency on `localhost:3000` for merchant use.

## Render blueprint

This repo now includes [render.yaml](c:/Users/joshm/Downloads/support-agent/render.yaml) for a simple public deployment path on Render.

Render will:
- install backend and frontend dependencies
- build the frontend
- start the backend
- expose the app publicly over HTTPS

After Render gives you a public URL:
1. set `SHOPIFY_APP_URL` to that URL
2. set `SHOPIFY_AFTER_AUTH_REDIRECT` to `https://your-domain/workspace?shopify=connected`
3. update the Shopify app `App URL`
4. update the Shopify allowed redirect URL to `https://your-domain/auth/shopify/callback`
