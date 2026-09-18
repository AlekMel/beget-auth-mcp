# Beget Auth MCP Server / MCP-сервер аутентификации Beget

[English](#english) | [Русский](#russian)

---

<a name="english"></a>
## English

### Production-ready MCP server for Beget Authentication API

Network-accessible MCP server that wraps the Beget Authentication API v1.2.1, providing secure JWT-based authentication tools. Designed for deployment on Coolify with network security as a first-class concern.

### ⚠️ Security Model

**This server is designed to be exposed on a public network. Understanding the threat model is critical:**

- **API Key Authentication**: Every MCP request requires a valid API key (`MCP_API_KEY`). Anyone with this key can call Beget auth tools.
- **Rotate Keys Regularly**: Change `MCP_API_KEY` periodically to limit exposure.
- **Dedicated Credentials**: Use separate Beget account credentials for this service, not your main account.
- **TLS Required**: Always deploy behind a reverse proxy with TLS (Coolify/Traefik handles this).
- **Private Network Preferred**: If possible, deploy in a private network or VPN rather than exposing to the internet.
- **No JWT Echo**: Full JWT tokens are NEVER returned in tool responses—only masked tokens (last 4 chars).
- **Memory-Only Storage**: Session tokens are stored only in server process memory, never written to disk.
- **Rate Limiting**: Built-in rate limiting prevents brute-force attacks on auth endpoints.
- **IP Allowlisting**: Optional CIDR-based IP allowlist for additional access control.

### 🔧 Features

- **5 MCP Tools**:
  - `beget_auth_login` — Login with username/password (2FA supported)
  - `beget_auth_refresh` — Refresh stored JWT token
  - `beget_auth_logout` — Logout and clear session
  - `beget_auth_switch` — Switch to different account (multi-account)
  - `beget_auth_key` — Fetch public key for JWT validation

- **Security Hardening**:
  - API key authentication on all MCP endpoints
  - Rate limiting (global + auth-specific)
  - Optional IP allowlist (CIDR ranges)
  - Security headers (Helmet.js)
  - Request size limits
  - Timeout protection
  - No sensitive data logging

- **Production Ready**:
  - TypeScript with strict typing
  - Structured logging (Pino)
  - Health check endpoint
  - Docker + docker-compose
  - Coolify compatible
  - Comprehensive tests

### 📦 Installation

#### Prerequisites
- Node.js 20+
- Docker (for containerized deployment)
- Coolify (optional, for deployment)

#### Local Development

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Edit .env and set MCP_API_KEY
nano .env

# Build
npm run build

# Start
npm start

# Development mode with auto-reload
npm run dev
```

#### Docker Deployment

```bash
# Build image
docker build -t beget-auth-mcp .

# Run with docker-compose
docker-compose up -d
```

### 🔑 Environment Variables

#### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `MCP_API_KEY` | API key for MCP authentication | `your-secure-random-key-here` |

#### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | Server port |
| `BEGET_API_BASE` | `https://api.beget.com` | Beget API base URL |
| `BEGET_LOGIN` | - | Auto-login username (use with caution) |
| `BEGET_PASSWORD` | - | Auto-login password (use with caution) |
| `ALLOWED_CIDRS` | - | Comma-separated CIDR ranges (e.g., `10.0.0.0/8,172.16.0.0/12`) |
| `LOG_LEVEL` | `info` | Log level (trace, debug, info, warn, error) |
| `NODE_ENV` | `production` | Node environment |
| `MAX_REQUEST_SIZE` | `1mb` | Maximum request body size |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit window (ms) |
| `RATE_LIMIT_MAX_REQUESTS` | `100` | Max requests per window |

### 🚀 Coolify Deployment

1. **Create new service in Coolify** → Docker Compose
2. **Upload `docker-compose.yml`** from this repository
3. **Set environment variables**:
   ```
   MCP_API_KEY=generate-strong-random-key-here
   BEGET_API_BASE=https://api.beget.com
   LOG_LEVEL=info
   ALLOWED_CIDRS=your.ip.here/32
   ```
4. **Enable TLS** in Coolify (automatic via Let's Encrypt)
5. **Deploy** and check logs
6. **Test health**: `curl https://your-domain.com/healthz`

### 🔌 Connecting MCP Clients

MCP clients connect via HTTP/SSE transport:

```json
{
  "mcpServers": {
    "beget-auth": {
      "url": "https://your-domain.com/mcp/sse",
      "headers": {
        "Authorization": "Bearer YOUR_MCP_API_KEY"
      }
    }
  }
}
```

Alternative header format:
```json
{
  "headers": {
    "X-API-Key": "YOUR_MCP_API_KEY"
  }
}
```

### 🔐 2FA Flow

When 2FA is enabled on a Beget account:

1. **First call** to `beget_auth_login` without `code`:
   ```json
   {
     "success": false,
     "requires_2fa": true,
     "channel": "EMAIL",
     "error_code": "CODE_REQUIRED_EMAIL"
   }
   ```

2. **Second call** with `code` parameter:
   ```json
   {
     "login": "user@example.com",
     "password": "password",
     "code": "123456"
   }
   ```

3. **Success** returns masked token:
   ```json
   {
     "success": true,
     "operation": "beget_auth_login",
     "requires_2fa": false,
     "raw": {
       "token": "***xyz"
     }
   }
   ```

### 🧪 Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# With coverage
npm test -- --coverage
```

### 📝 API Reference

All tools return normalized response:

```typescript
{
  success: boolean;
  operation: string;           // Tool name
  token: string | null;        // Always null (security)
  error_code: string | null;   // Error code if failed
  requires_2fa: boolean;       // True if 2FA needed
  channel: 'EMAIL' | 'SMS' | 'TOTP' | null;
  raw: Record<string, any>;    // Original response (token masked)
}
```

### 📄 License

MIT

---

<a name="russian"></a>
## Русский

### Production-ready MCP-сервер для Beget Authentication API

Сетевой MCP-сервер, который оборачивает Beget Authentication API v1.2.1, предоставляя безопасные инструменты аутентификации на основе JWT. Разработан для развёртывания на Coolify с приоритетом сетевой безопасности.

### ⚠️ Модель безопасности

**Этот сервер предназначен для публичного доступа. Понимание модели угроз критически важно:**

- **Аутентификация по API-ключу**: Каждый MCP-запрос требует валидный API-ключ (`MCP_API_KEY`). Любой, у кого есть этот ключ, может вызывать инструменты аутентификации Beget.
- **Регулярная ротация ключей**: Периодически меняйте `MCP_API_KEY` для ограничения рисков.
- **Отдельные учётные данные**: Используйте отдельную учётную запись Beget для этого сервиса, а не основную.
- **Обязательный TLS**: Всегда разворачивайте за обратным прокси с TLS (Coolify/Traefik делает это автоматически).
- **Предпочтительна частная сеть**: По возможности разворачивайте в частной сети или VPN, а не в публичном интернете.
- **JWT не возвращаются**: Полные JWT-токены НИКОГДА не возвращаются в ответах инструментов—только замаскированные (последние 4 символа).
- **Хранение только в памяти**: Токены сессий хранятся только в памяти процесса сервера, никогда не записываются на диск.
- **Ограничение частоты запросов**: Встроенное ограничение предотвращает атаки перебором на эндпоинты аутентификации.
- **Белый список IP**: Опциональный белый список IP-адресов на основе CIDR для дополнительного контроля доступа.

### 🔧 Возможности

- **5 MCP-инструментов**:
  - `beget_auth_login` — Вход с логином/паролем (поддержка 2FA)
  - `beget_auth_refresh` — Обновление сохранённого JWT-токена
  - `beget_auth_logout` — Выход и очистка сессии
  - `beget_auth_switch` — Переключение на другой аккаунт (мультиаккаунт)
  - `beget_auth_key` — Получение публичного ключа для валидации JWT

- **Усиленная безопасность**:
  - Аутентификация по API-ключу на всех MCP-эндпоинтах
  - Ограничение частоты запросов (общее + специфичное для аутентификации)
  - Опциональный белый список IP (диапазоны CIDR)
  - Заголовки безопасности (Helmet.js)
  - Ограничения размера запроса
  - Защита от таймаутов
  - Без логирования чувствительных данных

- **Production-ready**:
  - TypeScript со строгой типизацией
  - Структурированное логирование (Pino)
  - Эндпоинт проверки здоровья
  - Docker + docker-compose
  - Совместим с Coolify
  - Комплексные тесты

### 📦 Установка

#### Требования
- Node.js 20+
- Docker (для контейнерного развёртывания)
- Coolify (опционально, для развёртывания)

#### Локальная разработка

```bash
# Установка зависимостей
npm install

# Копирование файла окружения
cp .env.example .env

# Редактирование .env и установка MCP_API_KEY
nano .env

# Сборка
npm run build

# Запуск
npm start

# Режим разработки с автоперезагрузкой
npm run dev
```

#### Развёртывание через Docker

```bash
# Сборка образа
docker build -t beget-auth-mcp .

# Запуск с docker-compose
docker-compose up -d
```

### 🔑 Переменные окружения

#### Обязательные

| Переменная | Описание | Пример |
|------------|----------|--------|
| `MCP_API_KEY` | API-ключ для MCP-аутентификации | `ваш-безопасный-случайный-ключ` |

#### Опциональные

| Переменная | По умолчанию | Описание |
|------------|--------------|----------|
| `PORT` | `8080` | Порт сервера |
| `BEGET_API_BASE` | `https://api.beget.com` | Базовый URL API Beget |
| `BEGET_LOGIN` | - | Логин для автовхода (использовать осторожно) |
| `BEGET_PASSWORD` | - | Пароль для автовхода (использовать осторожно) |
| `ALLOWED_CIDRS` | - | Диапазоны CIDR через запятую (например, `10.0.0.0/8,172.16.0.0/12`) |
| `LOG_LEVEL` | `info` | Уровень логирования (trace, debug, info, warn, error) |
| `NODE_ENV` | `production` | Node-окружение |
| `MAX_REQUEST_SIZE` | `1mb` | Максимальный размер тела запроса |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Окно ограничения частоты (мс) |
| `RATE_LIMIT_MAX_REQUESTS` | `100` | Макс. запросов за окно |

### 🚀 Развёртывание на Coolify

1. **Создать новый сервис в Coolify** → Docker Compose
2. **Загрузить `docker-compose.yml`** из этого репозитория
3. **Установить переменные окружения**:
   ```
   MCP_API_KEY=сгенерируйте-сильный-случайный-ключ
   BEGET_API_BASE=https://api.beget.com
   LOG_LEVEL=info
   ALLOWED_CIDRS=ваш.ip.адрес/32
   ```
4. **Включить TLS** в Coolify (автоматически через Let's Encrypt)
5. **Развернуть** и проверить логи
6. **Тест здоровья**: `curl https://ваш-домен.com/healthz`

### 🔌 Подключение MCP-клиентов

MCP-клиенты подключаются через HTTP/SSE-транспорт:

```json
{
  "mcpServers": {
    "beget-auth": {
      "url": "https://ваш-домен.com/mcp/sse",
      "headers": {
        "Authorization": "Bearer ВАШ_MCP_API_KEY"
      }
    }
  }
}
```

Альтернативный формат заголовка:
```json
{
  "headers": {
    "X-API-Key": "ВАШ_MCP_API_KEY"
  }
}
```

### 🔐 Процесс 2FA

Когда на аккаунте Beget включена 2FA:

1. **Первый вызов** `beget_auth_login` без `code`:
   ```json
   {
     "success": false,
     "requires_2fa": true,
     "channel": "EMAIL",
     "error_code": "CODE_REQUIRED_EMAIL"
   }
   ```

2. **Второй вызов** с параметром `code`:
   ```json
   {
     "login": "user@example.com",
     "password": "password",
     "code": "123456"
   }
   ```

3. **Успех** возвращает замаскированный токен:
   ```json
   {
     "success": true,
     "operation": "beget_auth_login",
     "requires_2fa": false,
     "raw": {
       "token": "***xyz"
     }
   }
   ```

### 🧪 Тестирование

```bash
# Запуск всех тестов
npm test

# Режим наблюдения
npm run test:watch

# С покрытием
npm test -- --coverage
```

### 📝 Справка по API

Все инструменты возвращают нормализованный ответ:

```typescript
{
  success: boolean;
  operation: string;           // Имя инструмента
  token: string | null;        // Всегда null (безопасность)
  error_code: string | null;   // Код ошибки при неудаче
  requires_2fa: boolean;       // True если нужна 2FA
  channel: 'EMAIL' | 'SMS' | 'TOTP' | null;
  raw: Record<string, any>;    // Исходный ответ (токен замаскирован)
}
```

### 📄 Лицензия

MIT
