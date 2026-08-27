# LibreChat Admin Dashboard

[![CI](https://github.com/innFactory/librechat-admin-dashboard/actions/workflows/ci.yml/badge.svg)](https://github.com/innFactory/librechat-admin-dashboard/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A dashboard for monitoring [LibreChat](https://github.com/danny-avila/LibreChat) usage metrics, token consumption, and agent statistics. Right now, it's just a proof of concept. If you find any issues or have feature requests, please open an issue.

![Dashboard Screenshot](docs/screenshot.png)

## Features

- 📊 Real-time metrics (active users, tokens, requests)
- 🤖 Agent and model analytics
- 📈 Interactive charts with MUI X Charts
- 🌙 Dark/Light mode
- 🔐 Password protection
- 🐳 Docker ready

## Quick Start

### Prerequisites

- Node.js >= 20
- MongoDB (LibreChat database)

### Development

```bash
npm install

# Configure environment
cp .env.example .env.local
# Edit .env.local with your MongoDB URI and password

npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Docker

```bash
docker build -t librechat-dashboard .

docker run -p 3000:3000 \
  -e MONGODB_URI="mongodb://host:27017" \
  -e MONGODB_DB_NAME="librechat" \
  -e DASHBOARD_PASSWORD="your-password" \
  librechat-dashboard
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MONGODB_URI` | Yes | — | MongoDB connection string |
| `DASHBOARD_PASSWORD` | Yes | — | Dashboard login password |
| `MONGODB_DB_NAME` | No | _(from URI)_ | Override the database name extracted from `MONGODB_URI` |
| `SESSION_SECRET` | No | _(auto-generated)_ | Session signing secret |
| `NEXT_PUBLIC_BASE_PATH` | No | — | Base path for reverse proxy (e.g., `/dashboard`) |
| `MONGO_MAX_POOL_SIZE` | No | `20` | Maximum number of connections in the MongoDB connection pool |
| `MONGO_MIN_POOL_SIZE` | No | `2` | Minimum number of connections kept open in the pool |
| `MONGO_MAX_IDLE_TIME_MS` | No | `120000` | Milliseconds a connection can remain idle before being closed |
| `MONGO_CONNECT_TIMEOUT_MS` | No | `30000` | Milliseconds to wait when opening a new connection |
| `MONGO_SOCKET_TIMEOUT_MS` | No | `90000` | Milliseconds to wait for a response on an open socket |
| `MONGO_SERVER_SELECTION_TIMEOUT_MS` | No | `30000` | Milliseconds to wait for server selection before erroring |
| `MONGO_QUERY_MAX_TIME_MS` | No | `60000` | Milliseconds the MongoDB server is allowed to spend on a single query (`maxTimeMS`) |

> **Note for pool / timeout variables**: values that are blank, non-numeric, non-integer, zero, or negative are silently ignored and the default is used instead.

## Reverse Proxy / Kubernetes Ingress

The official Docker images are built with `NEXT_PUBLIC_BASE_PATH=/dashboard`, meaning the app expects to run under the `/dashboard` path.

### Kubernetes Ingress Example

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: dashboard-ingress
spec:
  rules:
  - host: your-domain.com
    http:
      paths:
      - path: /dashboard
        pathType: Prefix
        backend:
          service:
            name: dashboard-service
            port:
              number: 3000
```

No `rewrite-target` annotation is needed since the app already expects requests at `/dashboard`.

### Custom Base Path

To use a different base path, rebuild the Docker image:

```bash
docker build --build-arg NEXT_PUBLIC_BASE_PATH=/your-path -t librechat-dashboard .
```

### Local Development

For local development without a base path, simply run:

```bash
npm run dev
```

The app will be available at `http://localhost:3000` (without any path prefix).

> **Note**: `NEXT_PUBLIC_BASE_PATH` is baked into the build at compile time. You must rebuild when changing this value.

## Development Commands

```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run lint         # Run linter
npm run type-check   # TypeScript check
npm test             # Run tests
```

## License

MIT - see [LICENSE](LICENSE)

## Credits

Developed by [innFactory GmbH](https://innfactory.de) & [innFactory AI Consulting GmbH](https://innfactory.ai)

For managed LibreChat hosting with EU GDPR compliance, visit [CompanyGPT](https://company-gpt.com)
