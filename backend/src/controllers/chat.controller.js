const chatModel    = require("../models/chat.model")
const messageModel = require("../models/message.model")

async function createChat(req, res) {
    const { title } = req.body
    const user = req.user

    const chat = await chatModel.create({ user: user._id, title })

    res.status(201).json({
        message: "Chat created successfully",
        chat: {
            _id: chat.id,
            title: chat.title,
            lastActivity: chat.lastActivity,
            user: chat.user
        }
    })
}

async function getChats(req, res) {
    const chats = await chatModel
        .find({ user: req.user._id })
        .sort({ lastActivity: -1 })

    res.status(200).json({ chats })
}

async function getChatMessages(req, res) {
    const { id } = req.params

    const chat = await chatModel.findOne({ _id: id, user: req.user._id })
    if (!chat) return res.status(404).json({ message: "Chat not found" })

    const messages = await messageModel
        .find({ chat: id, role: { $in: ["user", "model"] } })
        .sort({ createdAt: 1 })
        .select("role content createdAt")

    res.status(200).json({ messages })
}

async function updateChatTitle(req, res) {
    const { id } = req.params
    const { title } = req.body

    if (!title || !title.trim()) {
        return res.status(400).json({ message: "Title is required" })
    }

    const chat = await chatModel.findOneAndUpdate(
        { _id: id, user: req.user._id },
        { title: title.trim() },
        { new: true }
    )

    if (!chat) return res.status(404).json({ message: "Chat not found" })

    res.status(200).json({ chat })
}

async function deleteChat(req, res) {
    const { id } = req.params

    const chat = await chatModel.findOne({ _id: id, user: req.user._id })
    if (!chat) return res.status(404).json({ message: "Chat not found" })

    const messages = await messageModel.find({ chat: id }).select("_id")
    const vectorIds = messages.map(m => m._id.toString())

    await Promise.all([
        chatModel.deleteOne({ _id: id }),
        messageModel.deleteMany({ chat: id }),
    ])

    res.status(200).json({ message: "Chat deleted successfully", vectorIds })
}

module.exports = { createChat, getChats, getChatMessages, updateChatTitle, deleteChat }