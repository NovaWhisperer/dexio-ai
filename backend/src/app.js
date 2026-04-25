const express = require("express")
const cookieParser = require("cookie-parser")
const cors = require("cors")

const authRoutes = require("./routers/auth.routes")
const chatRoutes = require("./routers/chat.routes")

const app = express()

app.use(cors({
  // origin: "https://dexio-ai.vercel.app",
  origin: "http://localhost:5173", 
  credentials: true,
}))

app.use(express.json())
app.use(cookieParser())

app.use("/api/auth", authRoutes)
app.use("/api/chat", chatRoutes)

module.exports = app