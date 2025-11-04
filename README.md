# Twilio Backend

TypeScript Node.js backend for Twilio WhatsApp messaging.

## Technology Stack

- **Runtime**: Node.js 20+
- **Language**: TypeScript (strict mode)
- **Framework**: Fastify
- **Messaging Service**: Twilio (WhatsApp)
- **Testing**: Vitest
- **Linting**: ESLint + Prettier

## Project Structure

```
twilio-be/
├── src/
│   └── server.ts           # Fastify server with WhatsApp webhook
├── .gitignore
├── env.example
├── package.json
└── tsconfig.json
```

## Setup

### Prerequisites

- Node.js 20 or higher
- Twilio account with WhatsApp enabled
- npm or pnpm

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd twilio-be
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
```bash
cp env.example .env
```

Edit `.env` and add your Twilio credentials:
```env
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
WA_PHONE_NUMBER=your_whatsapp_number
```

## API Endpoints

### Health Check

**GET** `/`

Returns server status.

**Response:**
```json
{
  "ok": true
}
```

### WhatsApp Webhook

**POST** `/whatsapp`

Receives incoming WhatsApp messages from Twilio and sends automated responses.

**Request Body (Form-encoded):**
```
From: whatsapp:+1234567890
Body: User message text
```

**Response:**
```json
{
  "ok": true
}
```

**Error Response:**
```json
{
  "error": "Missing required fields"
}
```

## Development Commands

```bash
# Run in development mode with hot reload
npm run dev

# Build for production
npm run build

# Start production server
npm run start

# Run tests
npm run test

# Lint code
npm run lint

# Format code
npm run format

# Clean build directory
npm run clean
```

## Running the Server

### Development Mode
```bash
npm run dev
```
Server runs on `http://localhost:3000`

### Production Mode
```bash
npm run build
npm run start
```

## Twilio Webhook Configuration

1. Go to your Twilio Console
2. Navigate to WhatsApp Sandbox or your WhatsApp number
3. Set the webhook URL for incoming messages:
   ```
   https://your-domain.com/whatsapp
   ```
4. Set HTTP method to POST

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `TWILIO_ACCOUNT_SID` | Twilio Account SID | Yes |
| `TWILIO_AUTH_TOKEN` | Twilio Auth Token | Yes |
| `WA_PHONE_NUMBER` | WhatsApp phone number (E.164 format) | Yes |
| `OPENAI_API_KEY` | OpenAI API key | Yes |
| `OPENAI_MODEL` | OpenAI model identifier | Yes |
| `OPENAI_MAX_CONTEXT_TOKENS` | Max tokens tracked per conversation | Yes |
| `CHROMA_API_KEY` | Chroma Cloud API key | Yes |
| `CHROMA_TENANT` | Chroma tenant identifier | Yes |
| `CHROMA_DATABASE` | Chroma database name | Yes |
| `CHROMA_COLLECTION` | Chroma collection name | Yes |

## Testing

Run tests with Vitest:
```bash
npm run test
```

## Deployment

The project is configured for deployment to Railway via GitHub Actions.

### Railway Setup

1. Create a new Railway project
2. Add environment variables in Railway dashboard
3. Connect your GitHub repository
4. Deploy automatically on push to main

### Manual Deployment

```bash
npm run build
npm run start
```

## Project Status

🚧 **In Development**

Current features:
- ✅ WhatsApp webhook endpoint
- ✅ Automated message responses
- ✅ TypeScript strict mode
- ✅ Fastify server setup

Planned improvements:
- Environment validation with Zod
- Modular architecture (routes/handlers/services)
- Unit tests with Vitest
- API documentation
- Error handling improvements

