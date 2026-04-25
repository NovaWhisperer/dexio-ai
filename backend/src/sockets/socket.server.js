const { Server } = require("socket.io")
const cookie = require("cookie")
const jwt = require("jsonwebtoken")
const userModel = require("../models/user.model")
const chatModel = require("../models/chat.model")
const aiService = require("../services/ai.service")
const messageModel = require("../models/message.model")
const { createMemory, queryMemory } = require("../services/vector.service")

function initSocketServer(httpServer) {
    const io = new Server(httpServer, {
        cors: {
            origin: process.env.CLIENT_URL || "http://localhost:5173",
            credentials: true,
        }
    })

    io.use(async (socket, next) => {
        const cookies = cookie.parse(socket.handshake.headers?.cookie || "")
        if (!cookies.token) {
            return next(new Error("Authentication error: No token provided"))
        }
        try {
            const decoded = jwt.verify(cookies.token, process.env.JWT_SECRET)
            const user = await userModel.findById(decoded.id)
            socket.user = user
            next()
        } catch (error) {
            next(new Error("Authentication error: Invalid token"))
        }
    })

    io.on("connection", (socket) => {
        socket.on("ai-message", async (messagePayload) => {
            const userId = socket.user._id.toString()
            const chatId = messagePayload.chat.toString()

            // Check if this is the first message in the chat (for auto-title)
            const existingCount = await messageModel.countDocuments({ chat: messagePayload.chat })
            const isFirstMessage = existingCount === 0

            // STEP 1: Save user message + generate vector in parallel
            const [userMessage, vectors] = await Promise.all([
                messageModel.create({
                    chat: messagePayload.chat,
                    user: socket.user._id,
                    content: messagePayload.content,
                    role: "user"
                }),
                aiService.generateVector(messagePayload.content)
            ])

            // STEP 2: Query long-term memory + store user message vector in parallel
            const [memory] = await Promise.all([
                queryMemory({
                    queryVector: vectors,
                    limit: 5,
                    metadata: { user: userId }
                }),
                createMemory({
                    vectors,
                    metadata: {
                        chat: chatId,
                        user: userId,
                        text: messagePayload.content.toString()
                    },
                    messageId: userMessage._id.toString()
                })
            ])

            // STEP 3: Fetch recent short-term history + build long-term memory context in parallel
            const [chatHistory, memoryContext] = await Promise.all([
                messageModel.find({ chat: messagePayload.chat })
                    .sort({ createdAt: -1 })
                    .limit(4)
                    .lean()
                    .then(msgs => msgs.reverse()),
                Promise.resolve(
                    memory.length > 0
                        ? memory.map(m => m.metadata.text).join("\n")
                        : ""
                )
            ])

            // STEP 4: Build short-term content array
            const shortTermMemory = chatHistory.map(item => ({
                role: item.role === "model" ? "assistant" : item.role,
                content: item.content
            }))

            while (shortTermMemory.length > 0 && shortTermMemory[0].role !== "user") {
                shortTermMemory.shift()
            }

            const filteredMemory = shortTermMemory.filter((msg, i) => {
                if (i === 0) return true
                return msg.role !== shortTermMemory[i - 1].role
            })

            // STEP 5: Generate AI response
            const response = await aiService.generateResponse(filteredMemory, memoryContext)

            // STEP 6: Emit response to client immediately
            socket.emit("ai-response", {
                content: response,
                chat: messagePayload.chat
            })

            // STEP 7: Save AI response + store its vector (non-blocking)
            try {
                const responseMessage = await messageModel.create({
                    chat: messagePayload.chat,
                    user: socket.user._id,
                    content: response,
                    role: "model"
                })

                const responseVectors = await aiService.generateVector(response)

                await createMemory({
                    vectors: responseVectors,
                    messageId: responseMessage._id.toString(),
                    metadata: {
                        chat: chatId,
                        user: userId,
                        text: response.toString()
                    }
                })
            } catch (err) {
                console.error("Failed to store AI response vector:", err.message)
            }

            // STEP 8: Auto-generate chat title from first message (non-blocking)
            if (isFirstMessage) {
                try {
                    const title = await aiService.generateTitle(messagePayload.content)
                    await chatModel.findByIdAndUpdate(chatId, { title })
                    socket.emit("chat-title-updated", { chatId, title })
                } catch (err) {
                    console.error("Auto-title failed:", err.message)
                }
            }
        })
    })
}

module.exports = initSocketServer