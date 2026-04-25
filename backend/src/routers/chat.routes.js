const express        = require("express")
const authMiddleware = require("../middleware/auth.middleware")
const chatController = require("../controllers/chat.controller")

const router = express.Router()

router.get("/",                  authMiddleware.authUser, chatController.getChats)
router.post("/",                 authMiddleware.authUser, chatController.createChat)
router.get("/:id/messages",      authMiddleware.authUser, chatController.getChatMessages)
router.patch("/:id/title",       authMiddleware.authUser, chatController.updateChatTitle)
router.delete("/:id",            authMiddleware.authUser, chatController.deleteChat)

module.exports = router