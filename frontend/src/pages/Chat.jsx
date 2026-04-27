import { useState, useEffect, useRef, useCallback, lazy, Suspense } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "../context/useAuth"
import { api } from "../services/api"
import { connectSocket, disconnectSocket } from "../services/socket"
import ReactMarkdown from "react-markdown"
import toast from "react-hot-toast"
import { CustomToaster } from "../components/Toast"
import DexioLogo from "../components/DexioLogo"
import {
  User, Menu, X, Plus, Send, Square, Copy,
  Trash2, LogOut, MessageSquare, Search, Type,
  ChevronLeft
} from "lucide-react"

// ── Lazy loaded heavy components ──────────────────────────────────────────
const Background3D = lazy(() => import("../components/Background3D"))
const SyntaxHighlighter = lazy(() =>
  import("react-syntax-highlighter").then(mod => ({ default: mod.Prism }))
)

// ── Load syntax style once at module level ────────────────────────────────
let cachedStyle = null
let stylePromise = null

function loadStyle() {
  if (cachedStyle) return Promise.resolve(cachedStyle)
  if (!stylePromise) {
    stylePromise = import("react-syntax-highlighter/dist/esm/styles/prism")
      .then(mod => {
        cachedStyle = {
          ...mod.oneDark,
          'pre[class*="language-"]': {
            ...mod.oneDark['pre[class*="language-"]'],
            background: "#111115",
            border: "none",
            boxShadow: "none",
            margin: 0,
            borderRadius: "12px",
            padding: "18px 20px",
            overflowX: "auto",
            lineHeight: "1.75",
            fontSize: "13px",
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          },
          'code[class*="language-"]': {
            ...mod.oneDark['code[class*="language-"]'],
            background: "none",
            border: "none",
            fontSize: "13px",
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          },
        }
        return cachedStyle
      })
  }
  return stylePromise
}

// ── Code block with hover copy + language badge ───────────────────────────
function CodeBlock({ language, children }) {
  const [copied, setCopied] = useState(false)
  const [style, setStyle]   = useState(cachedStyle)

  useEffect(() => {
    if (!cachedStyle) loadStyle().then(s => setStyle(s))
  }, [])

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(children)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("Copy failed")
    }
  }

  const displayLang = language
    ? language.charAt(0).toUpperCase() + language.slice(1)
    : "Code"

  return (
    <div className="code-block-wrap">
      {/* Language badge — bottom left */}
      <span className="code-lang-badge">{displayLang}</span>

      {/* Copy button — top right, hover only */}
      <button
        className={`btn-copy-code${copied ? " copied" : ""}`}
        onClick={handleCopy}
      >
        {copied ? (
          <>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Copied!
          </>
        ) : (
          <><Copy size={11} /> Copy</>
        )}
      </button>

      <Suspense fallback={<pre className="code-fallback">{children}</pre>}>
        {style ? (
          <SyntaxHighlighter
            style={style}
            language={language || "text"}
            useInlineStyles={true}
            wrapLines={false}
            customStyle={{
              margin: 0,
              padding: "18px 20px 32px",
              background: "#111115",
              border: "none",
              boxShadow: "none",
              borderRadius: "12px",
              fontSize: "13px",
              lineHeight: "1.75",
              overflowX: "auto",
              WebkitOverflowScrolling: "touch",
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            }}
            codeTagProps={{
              style: { fontFamily: "'JetBrains Mono', 'Fira Code', monospace", fontSize: "13px" }
            }}
          >
            {children}
          </SyntaxHighlighter>
        ) : (
          <pre className="code-fallback">{children}</pre>
        )}
      </Suspense>
    </div>
  )
}

// ── Markdown renderer ─────────────────────────────────────────────────────
const MarkdownComponents = {
  code({ inline, className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || "")
    const code  = String(children).replace(/\n$/, "")
    return !inline && match
      ? <CodeBlock language={match[1]}>{code}</CodeBlock>
      : <code className={className} {...props}>{children}</code>
  }
}

// ── Format timestamp ──────────────────────────────────────────────────────
function formatTime(date) {
  return new Date(date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

// ── Font size options ─────────────────────────────────────────────────────
const FONT_SIZES = ["sm", "md", "lg"]
const FONT_SIZE_MAP = { sm: "13px", md: "15px", lg: "17px" }

// ── Suggested prompts ─────────────────────────────────────────────────────
const PROMPTS = [
  "Help me write code",
  "Explain a concept",
  "Brainstorm ideas",
  "Summarise something",
]

export default function Chat() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  // ── State ────────────────────────────────────────────────────────────────
  const [chats, setChats]               = useState([])
  const [activeChatId, setActiveChatId] = useState(null)
  const [messages, setMessages]         = useState([])
  const [input, setInput]               = useState("")
  const [waiting, setWaiting]           = useState(false)
  const [connected, setConnected]       = useState(false)
  const [loadingChats, setLoadingChats] = useState(true)
  const [loadingMsgs, setLoadingMsgs]   = useState(false)
  const [deletingId, setDeletingId]     = useState(null)
  const [sidebarOpen, setSidebarOpen]   = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [renamingId, setRenamingId]     = useState(null)
  const [renameValue, setRenameValue]   = useState("")
  const [streamingId, setStreamingId]   = useState(null)
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const [searchQuery, setSearchQuery]   = useState("")
  const [showSearch, setShowSearch]     = useState(false)
  const [fontSize, setFontSize]         = useState("md")

  const streamingContentRef = useRef("")
  const socketRef           = useRef(null)
  const bottomRef           = useRef(null)
  const textareaRef         = useRef(null)
  const renameRef           = useRef(null)
  const stoppedRef          = useRef(false)
  const messagesAreaRef     = useRef(null)
  const searchRef           = useRef(null)

  // ── Apply font size to root ───────────────────────────────────────────────
  useEffect(() => {
    document.documentElement.style.setProperty("--chat-font-size", FONT_SIZE_MAP[fontSize])
  }, [fontSize])

  // ── Load messages ────────────────────────────────────────────────────────
  const loadMessages = useCallback(async (chatId) => {
    setLoadingMsgs(true)
    setMessages([])
    try {
      const data = await api.getChatMessages(chatId)
      setMessages(data.messages.map(m => ({
        id: m._id,
        role: m.role,
        content: m.content,
        time: m.createdAt || new Date().toISOString(),
      })))
    } catch {
      toast.error("Failed to load messages")
    } finally {
      setLoadingMsgs(false)
    }
  }, [])

  // ── Load chats on mount ──────────────────────────────────────────────────
  useEffect(() => {
    async function loadChats() {
      try {
        const data = await api.getChats()
        setChats(data.chats)
        if (data.chats.length > 0) {
          setActiveChatId(data.chats[0]._id)
          loadMessages(data.chats[0]._id)
        }
      } catch {
        toast.error("Failed to load chats")
      } finally {
        setLoadingChats(false)
      }
    }
    loadChats()
  }, [loadMessages])

  // ── Auto-focus textarea when chat selected ───────────────────────────────
  useEffect(() => {
    if (activeChatId && !loadingMsgs) {
      setTimeout(() => textareaRef.current?.focus(), 100)
    }
  }, [activeChatId, loadingMsgs])

  // ── Scroll to bottom ─────────────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, waiting])

  // ── Track scroll for scroll-to-bottom button ─────────────────────────────
  useEffect(() => {
    const el = messagesAreaRef.current
    if (!el) return
    function handleScroll() {
      setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 200)
    }
    el.addEventListener("scroll", handleScroll)
    return () => el.removeEventListener("scroll", handleScroll)
  }, [])

  // ── Auto-resize textarea ─────────────────────────────────────────────────
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "26px"
    el.style.height = Math.min(el.scrollHeight, 160) + "px"
  }, [input])

  // ── Focus rename input ───────────────────────────────────────────────────
  useEffect(() => {
    if (renamingId) renameRef.current?.focus()
  }, [renamingId])

  // ── Focus search input ───────────────────────────────────────────────────
  useEffect(() => {
    if (showSearch) searchRef.current?.focus()
  }, [showSearch])

  // ── Close sidebar on outside click ──────────────────────────────────────
  useEffect(() => {
    function handleOutside(e) {
      if (sidebarOpen && !e.target.closest(".sidebar") && !e.target.closest(".hamburger-btn")) {
        setSidebarOpen(false)
      }
    }
    document.addEventListener("mousedown", handleOutside)
    return () => document.removeEventListener("mousedown", handleOutside)
  }, [sidebarOpen])

  // ── Keyboard shortcuts ───────────────────────────────────────────────────
  useEffect(() => {
    function handleKeys(e) {
      const mod = e.metaKey || e.ctrlKey

      // Cmd/Ctrl + K → focus input
      if (mod && e.key === "k") {
        e.preventDefault()
        textareaRef.current?.focus()
      }

      // Cmd/Ctrl + N → new chat
      if (mod && e.key === "n") {
        e.preventDefault()
        handleNewChat()
      }

      // Cmd/Ctrl + F → toggle message search
      if (mod && e.key === "f" && activeChatId) {
        e.preventDefault()
        setShowSearch(prev => !prev)
      }

      // Escape → close search or sidebar
      if (e.key === "Escape") {
        if (showSearch) { setShowSearch(false); setSearchQuery("") }
        if (sidebarOpen) setSidebarOpen(false)
      }

      // [ → toggle sidebar collapse (desktop)
      if (mod && e.key === "[") {
        e.preventDefault()
        setSidebarCollapsed(prev => !prev)
      }
    }
    document.addEventListener("keydown", handleKeys)
    return () => document.removeEventListener("keydown", handleKeys)
  }, [activeChatId, showSearch, sidebarOpen])

  // ── Socket setup ─────────────────────────────────────────────────────────
  useEffect(() => {
    const socket = connectSocket()
    socketRef.current = socket

    socket.on("connect",    () => setConnected(true))
    socket.on("disconnect", () => setConnected(false))

    socket.on("ai-response", ({ content }) => {
      if (stoppedRef.current) { stoppedRef.current = false; return }
      const clean = content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim()

      const msgId = Date.now().toString()
      setStreamingId(msgId)
      streamingContentRef.current = ""
      setMessages(prev => [...prev, { id: msgId, role: "model", content: "", time: new Date().toISOString() }])
      setWaiting(false)

      let i = 0
      const speed = Math.max(8, Math.min(20, Math.floor(15000 / clean.length)))

      function typeNext() {
        if (stoppedRef.current) { stoppedRef.current = false; setStreamingId(null); return }
        if (i < clean.length) {
          streamingContentRef.current += clean[i]
          const currentText = streamingContentRef.current
          setMessages(prev => prev.map(m => m.id === msgId ? { ...m, content: currentText } : m))
          i++
          setTimeout(typeNext, speed)
        } else {
          setStreamingId(null)
        }
      }
      typeNext()
    })

    socket.on("chat-title-updated", ({ chatId, title }) => {
      setChats(prev => prev.map(c => c._id === chatId ? { ...c, title } : c))
    })

    return () => {
      socket.off("connect")
      socket.off("disconnect")
      socket.off("ai-response")
      socket.off("chat-title-updated")
      disconnectSocket()
    }
  }, [])

  // ── New chat ─────────────────────────────────────────────────────────────
  async function handleNewChat() {
    try {
      const data = await api.createChat({ title: "New Chat" })
      const newChat = data.chat
      setChats(prev => [newChat, ...prev])
      setActiveChatId(newChat._id)
      setMessages([])
      setSidebarOpen(false)
    } catch {
      toast.error("Couldn't create chat")
    }
  }

  // ── Select chat ──────────────────────────────────────────────────────────
  function selectChat(chatId) {
    if (chatId === activeChatId) { setSidebarOpen(false); return }
    setActiveChatId(chatId)
    setWaiting(false)
    stoppedRef.current = false
    setSidebarOpen(false)
    setShowSearch(false)
    setSearchQuery("")
    loadMessages(chatId)
  }

  // ── Delete chat ──────────────────────────────────────────────────────────
  async function handleDeleteChat(e, chatId) {
    e.stopPropagation()
    setDeletingId(chatId)
    try {
      await api.deleteChat(chatId)
      const remaining = chats.filter(c => c._id !== chatId)
      setChats(remaining)
      if (chatId === activeChatId) {
        const next = remaining[0] || null
        setActiveChatId(next?._id || null)
        setMessages([])
        if (next) loadMessages(next._id)
      }
      toast.success("Chat deleted")
    } catch {
      toast.error("Couldn't delete chat")
    } finally {
      setDeletingId(null)
    }
  }

  // ── Rename chat ──────────────────────────────────────────────────────────
  function handleDoubleClick(e, chat) {
    e.stopPropagation()
    setRenamingId(chat._id)
    setRenameValue(chat.title)
  }

  async function handleRenameSubmit(chatId) {
    const trimmed = renameValue.trim()
    setRenamingId(null)
    if (!trimmed) return
    try {
      await api.updateChatTitle(chatId, trimmed)
      setChats(prev => prev.map(c => c._id === chatId ? { ...c, title: trimmed } : c))
      toast.success("Chat renamed")
    } catch {
      toast.error("Couldn't rename chat")
    }
  }

  function handleRenameKeyDown(e, chatId) {
    if (e.key === "Enter")  { e.preventDefault(); handleRenameSubmit(chatId) }
    if (e.key === "Escape") { setRenamingId(null) }
  }

  // ── Send message ─────────────────────────────────────────────────────────
  const sendMessage = useCallback(() => {
    const content = input.trim()
    if (!content || !activeChatId || waiting) return
    stoppedRef.current = false
    setMessages(prev => [...prev, { id: Date.now().toString(), role: "user", content, time: new Date().toISOString() }])
    setInput("")
    setWaiting(true)
    socketRef.current.emit("ai-message", { chat: activeChatId, content })
  }, [input, activeChatId, waiting])

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  function scrollToBottom() {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  function handlePrompt(prompt) {
    if (!activeChatId || waiting || streamingId) return
    setInput(prompt)
    textareaRef.current?.focus()
  }

  function handleStop() {
    stoppedRef.current = true
    setWaiting(false)
  }

  async function handleCopyMessage(content) {
    try {
      await navigator.clipboard.writeText(content)
      toast.success("Copied", { duration: 1500 })
    } catch {
      toast.error("Copy failed")
    }
  }

  function cycleFontSize() {
    setFontSize(prev => {
      const idx = FONT_SIZES.indexOf(prev)
      return FONT_SIZES[(idx + 1) % FONT_SIZES.length]
    })
  }

  async function handleLogout() {
    disconnectSocket()
    await logout()
    navigate("/login")
  }

  // ── Filtered messages for search ─────────────────────────────────────────
  const filteredMessages = searchQuery.trim()
    ? messages.filter(m => m.content.toLowerCase().includes(searchQuery.toLowerCase()))
    : messages

  const activeChat = chats.find(c => c._id === activeChatId)
  const initials   = user
    ? `${user.fullName?.firstName?.[0] ?? ""}${user.fullName?.lastName?.[0] ?? ""}`.toUpperCase()
    : "?"

  return (
    <div className="chat-shell">
      <Suspense fallback={null}>
        <Background3D variant="chat" />
      </Suspense>

      <CustomToaster />

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} aria-label="Close sidebar" />
      )}

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside className={`sidebar${sidebarOpen ? " open" : ""}${sidebarCollapsed ? " collapsed" : ""}`}>
        <div className="sidebar-head">
          {!sidebarCollapsed && <DexioLogo size="sm" />}
          <div className="sidebar-head-actions">
            {!sidebarCollapsed && (
              <button className="btn-new-chat" onClick={handleNewChat}>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Plus size={14} /> New chat
                </span>
              </button>
            )}
            {sidebarCollapsed && (
              <button className="btn-icon" onClick={handleNewChat} title="New chat">
                <Plus size={16} />
              </button>
            )}
            {/* Collapse toggle — desktop only */}
            <button
              className="btn-icon collapse-btn"
              onClick={() => setSidebarCollapsed(prev => !prev)}
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <ChevronLeft size={16} style={{ transform: sidebarCollapsed ? "rotate(180deg)" : "none", transition: "transform 0.25s" }} />
            </button>
            <button className="btn-icon sidebar-close-btn" onClick={() => setSidebarOpen(false)}>
              <X size={16} />
            </button>
          </div>
        </div>

        {!sidebarCollapsed && (
          <div className="chat-list">
            {loadingChats ? (
              <div className="chat-list-loading">
                <span className="skeleton" /><span className="skeleton" /><span className="skeleton" />
              </div>
            ) : (
              <>
                {chats.length > 0 && <div className="chat-list-label">Recent History</div>}
                {chats.map(chat => (
                  <div
                    key={chat._id}
                    className={`chat-item${chat._id === activeChatId ? " active" : ""}`}
                    onClick={() => selectChat(chat._id)}
                    onDoubleClick={(e) => handleDoubleClick(e, chat)}
                    title="Double-click to rename"
                  >
                    {renamingId === chat._id ? (
                      <input
                        ref={renameRef}
                        className="rename-input"
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onKeyDown={e => handleRenameKeyDown(e, chat._id)}
                        onBlur={() => handleRenameSubmit(chat._id)}
                        onClick={e => e.stopPropagation()}
                      />
                    ) : (
                      <>
                        <MessageSquare size={13} className="chat-item-icon" />
                        <span className="chat-item-title">{chat.title}</span>
                        <button
                          className="btn-delete-chat"
                          onClick={(e) => handleDeleteChat(e, chat._id)}
                          disabled={deletingId === chat._id}
                          title="Delete"
                        >
                          {deletingId === chat._id ? "…" : <Trash2 size={13} />}
                        </button>
                      </>
                    )}
                  </div>
                ))}
                {chats.length === 0 && <p className="chat-list-empty">No chats yet — start one!</p>}
              </>
            )}
          </div>
        )}

        <div className="sidebar-foot">
          {sidebarCollapsed ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <div className="user-avatar" style={{ margin: "0 auto" }}>{initials}</div>
              <button onClick={handleLogout} title="Logout" className="btn-icon logout-btn">
                <LogOut size={15} />
              </button>
            </div>
          ) : (
            <div className="user-pill">
              <div className="user-avatar">{initials}</div>
              <div className="user-info">
                <div className="user-name">{user?.fullName?.firstName} {user?.fullName?.lastName}</div>
                <div className="user-email">{user?.email}</div>
              </div>
              <button onClick={handleLogout} title="Logout" className="btn-icon logout-btn">
                <LogOut size={15} />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* ── Main area ───────────────────────────────────────────────────── */}
      <div className="chat-main">

        {/* Topbar */}
        <div className="chat-topbar">
          <button className="btn-icon hamburger-btn" onClick={() => setSidebarOpen(true)}>
            <Menu size={20} />
          </button>

          <div className="topbar-center">
            <div className="status-dot" style={{ background: connected ? "var(--accent)" : "var(--text3)" }} />
            <span>{activeChat ? activeChat.title : "Dexio AI"}</span>
            {!connected && <span className="reconnecting-text">— reconnecting…</span>}
          </div>

          {/* Topbar actions */}
          <div className="topbar-actions">
            {activeChatId && (
              <button
                className={`btn-icon${showSearch ? " active" : ""}`}
                onClick={() => { setShowSearch(p => !p); setSearchQuery("") }}
                title="Search messages (⌘F)"
              >
                <Search size={16} />
              </button>
            )}
            <button
              className="btn-icon font-size-btn"
              onClick={cycleFontSize}
              title={`Font size: ${fontSize} (click to cycle)`}
            >
              <Type size={16} />
              <span className="font-size-label">{fontSize.toUpperCase()}</span>
            </button>
          </div>
        </div>

        {/* Search bar */}
        {showSearch && (
          <div className="search-bar">
            <Search size={14} style={{ color: "var(--text3)", flexShrink: 0 }} />
            <input
              ref={searchRef}
              className="search-input"
              placeholder="Search in conversation…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <span className="search-count">
                {filteredMessages.length} result{filteredMessages.length !== 1 ? "s" : ""}
              </span>
            )}
            <button className="btn-icon" onClick={() => { setShowSearch(false); setSearchQuery("") }}>
              <X size={14} />
            </button>
          </div>
        )}

        {/* ── Messages ──────────────────────────────────────────────────── */}
        <div className="messages-area" ref={messagesAreaRef} style={{ fontSize: FONT_SIZE_MAP[fontSize] }}>
          <div className="messages-col">

            {!activeChatId ? (
              <div className="empty-state">
                <div className="empty-logo-wrap">
                  <DexioLogo size="md" showText={false} />
                </div>
                <h3>How can I help you today?</h3>
                <p>Create a new chat to get started with Dexio AI.</p>
                <div className="prompt-chips">
                  {PROMPTS.map(p => (
                    <button key={p} className="prompt-chip" onClick={handleNewChat}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>

            ) : loadingMsgs ? (
              <div className="empty-state">
                <div className="msg-skeleton-wrap">
                  <span className="skeleton skeleton-msg" />
                  <span className="skeleton skeleton-msg short" />
                  <span className="skeleton skeleton-msg" />
                </div>
              </div>

            ) : messages.length === 0 && !waiting ? (
              <div className="empty-state">
                <div className="empty-logo-wrap">
                  <DexioLogo size="md" showText={false} />
                </div>
                <h3>Start the conversation</h3>
                <p>Ask me anything — I'm here to help.</p>
                <div className="prompt-chips">
                  {PROMPTS.map(p => (
                    <button key={p} className="prompt-chip" onClick={() => handlePrompt(p)}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>

            ) : (
              <>
                {searchQuery && filteredMessages.length === 0 ? (
                  <div className="empty-state">
                    <p>No messages matching "<strong>{searchQuery}</strong>"</p>
                  </div>
                ) : (
                  (searchQuery ? filteredMessages : messages).map((msg, i) => (
                    <div key={msg.id || i} className={`msg-row ${msg.role}`}>
                      {msg.role === "model" ? (
                        <div className="msg-avatar">
                          <DexioLogo size="sm" showText={false} />
                        </div>
                      ) : (
                        <div className="msg-avatar-user">
                          <User size={15} />
                        </div>
                      )}

                      <div className="msg-content">
                        {msg.role === "model" ? (
                          <>
                            <div className="msg-bubble-ai">
                              <ReactMarkdown components={MarkdownComponents}>
                                {msg.content}
                              </ReactMarkdown>
                              {streamingId === msg.id && <span className="streaming-cursor" />}
                            </div>
                            <div className="msg-actions">
                              <button className="btn-copy" onClick={() => handleCopyMessage(msg.content)}>
                                <Copy size={11} /> Copy
                              </button>
                            </div>
                          </>
                        ) : (
                          <div className="msg-bubble-user">{msg.content}</div>
                        )}
                        <span className="msg-time">{formatTime(msg.time)}</span>
                      </div>
                    </div>
                  ))
                )}

                {/* Typing indicator */}
                {waiting && (
                  <div className="msg-row model">
                    <div className="msg-avatar">
                      <DexioLogo size="sm" showText={false} />
                    </div>
                    <div className="msg-content">
                      <div className="typing-bubble">
                        <span /><span /><span />
                        <span className="typing-label">Dexio is thinking…</span>
                      </div>
                    </div>
                  </div>
                )}

                <div ref={bottomRef} />
              </>
            )}
          </div>
        </div>

        {/* Scroll to bottom button */}
        {showScrollBtn && (
          <button className="btn-scroll-bottom" onClick={scrollToBottom} title="Scroll to bottom">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        )}

        {/* ── Input ─────────────────────────────────────────────────────── */}
        <div className="input-area">
          <div className="input-col">
            <div className="input-glow" />
            <div className="input-box">
              <textarea
                ref={textareaRef}
                rows={1}
                placeholder={activeChatId ? "Ask Dexio anything…" : "Select or create a chat first"}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={!activeChatId || waiting}
              />
              {waiting ? (
                <button className="btn-stop" onClick={handleStop} title="Stop">
                  <Square size={14} />
                </button>
              ) : (
                <button
                  className="btn-send"
                  onClick={sendMessage}
                  disabled={!input.trim() || !activeChatId}
                  aria-label="Send"
                >
                  <Send size={15} />
                </button>
              )}
            </div>
            <p className="input-hint">
              ⌘K focus · ⌘N new chat · ⌘F search · ⌘[ collapse sidebar
            </p>
          </div>
        </div>

      </div>
    </div>
  )
}