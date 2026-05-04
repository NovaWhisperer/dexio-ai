# Dexio AI

Dexio AI is a full-stack conversational AI assistant built for fast, context-aware chats. It combines a React + Vite frontend, an Express + MongoDB backend, real-time Socket.IO messaging, secure cookie-based authentication, and long-term memory powered by Pinecone and AI embeddings.

## Why It Exists

This project is designed to feel like a modern AI companion rather than a basic chat demo. It keeps conversations organized, remembers useful context, responds in real time, and presents everything in a polished interface with markdown rendering and a 3D background.

## Highlights

- Secure email/password authentication with HTTP-only cookies
- Real-time assistant replies through Socket.IO
- Persistent chat history with rename and delete actions
- Auto-generated chat titles from the first user message
- Long-term semantic memory for more relevant answers
- Markdown support with syntax-highlighted code blocks
- Animated 3D UI that stays active across routes

## Tech Stack

- Frontend: React, Vite, React Router, Socket.IO Client, React Markdown, Three.js, React Three Fiber
- Backend: Node.js, Express, Socket.IO, MongoDB, Mongoose
- AI and memory: Sarvam AI, Google Gemini embeddings, Pinecone

## Repository Layout

- `frontend/` - Vite app, UI components, pages, auth context, and browser socket client
- `backend/` - Express API, Socket.IO server, database models, controllers, middleware, and AI services

## Getting Started

### Prerequisites

- Node.js 18 or newer
- MongoDB connection string
- Sarvam API key
- Google Gemini API key
- Pinecone API key
- JWT secret

### Environment Variables

Create `backend/.env` with the following values:

```env
PORT=3000
CLIENT_URL=http://localhost:5173
MONGO_URI=your-mongodb-connection-string
JWT_SECRET=your-jwt-secret
SARVAM_API_KEY=your-sarvam-api-key
GEMINI_API_KEY=your-gemini-api-key
PINECONE_API_KEY=your-pinecone-api-key
NODE_ENV=development
```

If the frontend is deployed separately, set `CLIENT_URL` to the deployed origin so cookies and CORS continue to work.

### Install Dependencies

```bash
cd backend
npm install

cd ../frontend
npm install
```

### Run Locally

Start the backend in one terminal:

```bash
cd backend
npm run dev
```

Start the frontend in another terminal:

```bash
cd frontend
npm run dev
```

By default, the backend runs on `http://localhost:3000` and the frontend runs on `http://localhost:5173`.

## Available Scripts

### Backend

- `npm start` - run the server
- `npm run dev` - run the server with nodemon

### Frontend

- `npm run dev` - start the Vite dev server
- `npm run build` - create a production build
- `npm run preview` - preview the production build locally
- `npm run lint` - run ESLint

## Core API Routes

### Auth

- `POST /api/auth/register` - register a new user
- `POST /api/auth/login` - log in an existing user
- `POST /api/auth/logout` - clear the active session

### Chats

- `GET /api/chat` - list chats for the signed-in user
- `POST /api/chat` - create a new chat
- `GET /api/chat/:id/messages` - fetch chat messages
- `PATCH /api/chat/:id/title` - rename a chat
- `DELETE /api/chat/:id` - delete a chat

## Socket Events

- Client sends `ai-message` with a chat id and message content
- Server emits `ai-response` with the assistant reply
- Server emits `chat-title-updated` after auto-titling the first message

## How It Works

1. The frontend authenticates the user and opens a Socket.IO connection.
2. User messages are stored in MongoDB and embedded for memory retrieval.
3. Relevant long-term memory is fetched from Pinecone and combined with recent chat history.
4. The AI service generates a response and the backend streams it back to the client.
5. Responses and message vectors are stored so future chats can use the same context layer.

## Notes

- The app uses cookie-based auth, so the frontend and backend origins must allow credentials.
- The Pinecone index name used by the backend is `chatgpt-clone`.
- The backend expects the database and AI service credentials to be present before startup.

## Contributing

Pull requests are welcome. If you plan to extend the project, keep changes focused and make sure the frontend and backend environment settings stay in sync.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE).