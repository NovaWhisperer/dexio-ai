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
  Trash2, LogOut, MessageSquare, ChevronLeft
} from "lucide-react"

const Background3D      = lazy(() => import("../components/Background3D"))
const SyntaxHighlighter = lazy(() =>
  import("react-syntax-highlighter").then(mod => ({ default: mod.Prism }))
)

// ── Syntax style — load once ──────────────────────────────────────────────
let cachedStyle  = null
let stylePromise = null

function loadStyle() {
  if (cachedStyle) return Promise.resolve(cachedStyle)
  if (!stylePromise) {
    stylePromise = import("react-syntax-highlighter/dist/esm/styles/prism").then(mod => {
      cachedStyle = {
        ...mod.oneDark,
        'pre[class*="language-"]': {
          ...mod.oneDark['pre[class*="language-"]'],
          background: "#0d0d10",
          border: "none",
          boxShadow: "none",
          margin: 0,
          borderRadius: "0 0 10px 10px",
          padding: "16px 18px 20px",
          overflowX: "auto",
          lineHeight: "1.75",
          fontSize: "13px",
          fontFamily: "'JetBrains Mono','Fira Code',monospace",
        },
        'code[class*="language-"]': {
          ...mod.oneDark['code[class*="language-"]'],
          background: "none",
          border: "none",
          fontSize: "13px",
          fontFamily: "'JetBrains Mono','Fira Code',monospace",
        },
      }
      return cachedStyle
    })
  }
  return stylePromise
}

// ── Language dot colours ──────────────────────────────────────────────────
const LANG_COLORS = {
  javascript:"#f7df1e", js:"#f7df1e",
  typescript:"#3178c6", ts:"#3178c6",
  python:"#3572A5",     py:"#3572A5",
  rust:"#dea584",       go:"#00add8",
  java:"#b07219",       css:"#563d7c",
  html:"#e34c26",       bash:"#10b981",
  sh:"#10b981",         shell:"#10b981",
  json:"#f4f4f5",       sql:"#e38c00",
  cpp:"#f34b7d",        c:"#aaaaaa",
  ruby:"#701516",       php:"#4F5D95",
  swift:"#F05138",      kotlin:"#A97BFF",
  jsx:"#61dafb",        tsx:"#61dafb",
  yaml:"#cb171e",       toml:"#9c4221",
}

// ── Code block with header bar ────────────────────────────────────────────
function CodeBlock({ language, children }) {
  const [copied, setCopied] = useState(false)
  const [style, setStyle]   = useState(cachedStyle)

  useEffect(() => { if (!cachedStyle) loadStyle().then(setStyle) }, [])

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(children)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { toast.error("Copy failed") }
  }

  const displayLang = language
    ? language.charAt(0).toUpperCase() + language.slice(1)
    : "Code"
  const dotColor = LANG_COLORS[language?.toLowerCase()] || "#71717a"

  return (
    <div className="code-block-wrap">
      <div className="code-header">
        <div className="code-lang-pill">
          <span className="code-lang-dot" style={{ background: dotColor }} />
          <span className="code-lang-name">{displayLang}</span>
        </div>
        <button className={`btn-copy-code${copied ? " copied" : ""}`} onClick={handleCopy}>
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
      </div>

      <Suspense fallback={<pre className="code-fallback">{children}</pre>}>
        {style ? (
          <SyntaxHighlighter
            style={style}
            language={language || "text"}
            useInlineStyles={true}
            wrapLines={false}
            customStyle={{
              margin: 0,
              padding: "16px 18px 20px",
              background: "#0d0d10",
              border: "none",
              boxShadow: "none",
              borderRadius: "0 0 10px 10px",
              fontSize: "13px",
              lineHeight: "1.75",
              overflowX: "auto",
              WebkitOverflowScrolling: "touch",
              fontFamily: "'JetBrains Mono','Fira Code',monospace",
            }}
            codeTagProps={{ style: { fontFamily: "'JetBrains Mono','Fira Code',monospace", fontSize: "13px" } }}
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

const MarkdownComponents = {
  code({ inline, className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || "")
    const code  = String(children).replace(/\n$/, "")
    return !inline && match
      ? <CodeBlock language={match[1]}>{code}</CodeBlock>
      : <code className={className} {...props}>{children}</code>
  }
}

function formatTime(date) {
  return new Date(date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

const PROMPTS = [
  "Help me write code",
  "Explain a concept",
  "Brainstorm ideas",
  "Summarise something",
]

export default function Chat() {
  const { user, logout } = useAuth()
  const navigate         = useNavigate()

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

  const streamingContentRef = useRef("")
  const socketRef           = useRef(null)
  const bottomRef           = useRef(null)
  const textareaRef         = useRef(null)
  const renameRef           = useRef(null)
  const stoppedRef          = useRef(false)
  const messagesAreaRef     = useRef(null)
  // Track whether user has manually scrolled up — don't hijack scroll
  const userScrolledUpRef   = useRef(false)

  // ── Scroll helpers ────────────────────────────────────────────────────────
  function isNearBottom() {
    const el = messagesAreaRef.current
    if (!el) return true
    return el.scrollHeight - el.scrollTop - el.clientHeight < 180
  }

  function scrollToBottom(smooth = true) {
    bottomRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "instant" })
  }

  // ── Load messages ─────────────────────────────────────────────────────────
  const loadMessages = useCallback(async (chatId) => {
    setLoadingMsgs(true)
    setMessages([])
    userScrolledUpRef.current = false
    try {
      const data = await api.getChatMessages(chatId)
      setMessages(data.messages.map(m => ({
        id: m._id, role: m.role, content: m.content,
        time: m.createdAt || new Date().toISOString(),
      })))
    } catch { toast.error("Failed to load messages") }
    finally { setLoadingMsgs(false) }
  }, [])

  // ── Load chats on mount ───────────────────────────────────────────────────
  useEffect(() => {
    async function loadChats() {
      try {
        const data = await api.getChats()
        setChats(data.chats)
        if (data.chats.length > 0) {
          setActiveChatId(data.chats[0]._id)
          loadMessages(data.chats[0]._id)
        }
      } catch { toast.error("Failed to load chats") }
      finally { setLoadingChats(false) }
    }
    loadChats()
  }, [loadMessages])

  // ── Auto-focus textarea ───────────────────────────────────────────────────
  useEffect(() => {
    if (activeChatId && !loadingMsgs) setTimeout(() => textareaRef.current?.focus(), 100)
  }, [activeChatId, loadingMsgs])

  // ── Scroll to bottom when messages change (if not scrolled up) ────────────
  useEffect(() => {
    if (!userScrolledUpRef.current) scrollToBottom(false)
  }, [messages, waiting])

  // ── Track scroll ──────────────────────────────────────────────────────────
  useEffect(() => {
    const el = messagesAreaRef.current
    if (!el) return
    function handleScroll() {
      const nearBottom = isNearBottom()
      setShowScrollBtn(!nearBottom)
      // If user scrolled up significantly, pause auto-scroll
      userScrolledUpRef.current = !nearBottom
    }
    el.addEventListener("scroll", handleScroll, { passive: true })
    return () => el.removeEventListener("scroll", handleScroll)
  }, [])

  // ── Auto-resize textarea ──────────────────────────────────────────────────
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "26px"
    el.style.height = Math.min(el.scrollHeight, 160) + "px"
  }, [input])

  useEffect(() => { if (renamingId) renameRef.current?.focus() }, [renamingId])

  useEffect(() => {
    function handleOutside(e) {
      if (sidebarOpen && !e.target.closest(".sidebar") && !e.target.closest(".hamburger-btn")) {
        setSidebarOpen(false)
      }
    }
    document.addEventListener("mousedown", handleOutside)
    return () => document.removeEventListener("mousedown", handleOutside)
  }, [sidebarOpen])

  useEffect(() => {
    function handleKeys(e) {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key === "k") { e.preventDefault(); textareaRef.current?.focus() }
      if (mod && e.key === "n") { e.preventDefault(); handleNewChat() }
      if (e.key === "Escape" && sidebarOpen) setSidebarOpen(false)
      if (mod && e.key === "[") { e.preventDefault(); setSidebarCollapsed(p => !p) }
    }
    document.addEventListener("keydown", handleKeys)
    return () => document.removeEventListener("keydown", handleKeys)
  }, [sidebarOpen])

  // ── Socket ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const socket = connectSocket()
    socketRef.current = socket

    socket.on("connect",    () => setConnected(true))
    socket.on("disconnect", () => setConnected(false))

    socket.on("ai-response", ({ content }) => {
      if (stoppedRef.current) { stoppedRef.current = false; return }

      const clean = content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim()
      if (!clean) return

      const msgId = Date.now().toString()
      setStreamingId(msgId)
      streamingContentRef.current = ""
      setMessages(prev => [...prev, {
        id: msgId, role: "model", content: "", time: new Date().toISOString()
      }])
      setWaiting(false)
      userScrolledUpRef.current = false // snap back to bottom for new response

      // ── Streaming: word-chunk based with background-tab fast-flush ──────
      const words  = clean.split(/(\s+)/)   // keep whitespace tokens
      let wordIdx  = 0
      const targetMs = Math.min(4000, Math.max(1800, clean.length * 2.5))
      const delayPer = Math.max(12, targetMs / words.length)

      function typeNext() {
        if (stoppedRef.current) {
          stoppedRef.current = false
          setStreamingId(null)
          return
        }

        // Tab is hidden → flush all remaining text instantly, no delay
        if (document.hidden) {
          streamingContentRef.current = clean
          setMessages(prev =>
            prev.map(m => m.id === msgId ? { ...m, content: clean } : m)
          )
          setStreamingId(null)
          return
        }

        if (wordIdx < words.length) {
          streamingContentRef.current += words[wordIdx]
          const currentText = streamingContentRef.current
          setMessages(prev =>
            prev.map(m => m.id === msgId ? { ...m, content: currentText } : m)
          )
          wordIdx++

          if (!userScrolledUpRef.current) {
            bottomRef.current?.scrollIntoView({ behavior: "instant" })
          }

          const jitter = (Math.random() - 0.5) * delayPer * 0.6
          setTimeout(typeNext, Math.max(8, delayPer + jitter))
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

  // ── Handlers ──────────────────────────────────────────────────────────────
  async function handleNewChat() {
    try {
      const data    = await api.createChat({ title: "New Chat" })
      const newChat = data.chat
      setChats(prev => [newChat, ...prev])
      setActiveChatId(newChat._id)
      setMessages([])
      setSidebarOpen(false)
    } catch { toast.error("Couldn't create chat") }
  }

  function selectChat(chatId) {
    if (chatId === activeChatId) { setSidebarOpen(false); return }
    setActiveChatId(chatId)
    setWaiting(false)
    stoppedRef.current = false
    setSidebarOpen(false)
    loadMessages(chatId)
  }

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
    } catch { toast.error("Couldn't delete chat") }
    finally  { setDeletingId(null) }
  }

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
    } catch { toast.error("Couldn't rename chat") }
  }

  function handleRenameKeyDown(e, chatId) {
    if (e.key === "Enter")  { e.preventDefault(); handleRenameSubmit(chatId) }
    if (e.key === "Escape") { setRenamingId(null) }
  }

  const sendMessage = useCallback(() => {
    const content = input.trim()
    if (!content || !activeChatId || waiting) return
    stoppedRef.current        = false
    userScrolledUpRef.current = false
    setMessages(prev => [...prev, {
      id: Date.now().toString(), role: "user", content, time: new Date().toISOString()
    }])
    setInput("")
    setWaiting(true)
    socketRef.current.emit("ai-message", { chat: activeChatId, content })
  }, [input, activeChatId, waiting])

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage() }
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
    } catch { toast.error("Copy failed") }
  }

  async function handleLogout() {
    disconnectSocket()
    await logout()
    navigate("/login")
  }

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

      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside className={`sidebar${sidebarOpen ? " open" : ""}${sidebarCollapsed ? " collapsed" : ""}`}>
        <div className="sidebar-head">
          {!sidebarCollapsed && <DexioLogo size="sm" />}
          <div className="sidebar-head-actions">
            {!sidebarCollapsed && (
              <button className="btn-new-chat" onClick={handleNewChat}>
                <Plus size={14} /> New chat
              </button>
            )}
            {sidebarCollapsed && (
              <button className="btn-icon" onClick={handleNewChat} title="New chat">
                <Plus size={16} />
              </button>
            )}
            <button
              className="btn-icon collapse-btn"
              onClick={() => setSidebarCollapsed(p => !p)}
              title={sidebarCollapsed ? "Expand" : "Collapse"}
            >
              <ChevronLeft size={16} style={{
                transform: sidebarCollapsed ? "rotate(180deg)" : "none",
                transition: "transform 0.25s"
              }} />
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
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:8 }}>
              <div className="user-avatar">{initials}</div>
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

      {/* ── Main ────────────────────────────────────────────────────────── */}
      <div className="chat-main">

        {/* Topbar */}
        <div className="chat-topbar">
          <button className="btn-icon hamburger-btn" onClick={() => setSidebarOpen(true)}>
            <Menu size={20} />
          </button>
          <div className="topbar-center">
            <div className="status-dot" style={{ background: connected ? "var(--accent)" : "var(--text3)" }} />
            <span className="topbar-title">{activeChat?.title ?? "Dexio AI"}</span>
            {!connected && <span className="reconnecting-text">reconnecting…</span>}
          </div>
        </div>

        {/* Messages */}
        <div className="messages-area" ref={messagesAreaRef}>
          <div className="messages-col">

            {!activeChatId ? (
              <div className="empty-state">
                <div className="empty-logo-wrap"><DexioLogo size="md" showText={false} /></div>
                <h3>How can I help you today?</h3>
                <p>Create a new chat to get started.</p>
                <div className="prompt-chips">
                  {PROMPTS.map(p => (
                    <button key={p} className="prompt-chip" onClick={handleNewChat}>{p}</button>
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
                <div className="empty-logo-wrap"><DexioLogo size="md" showText={false} /></div>
                <h3>Start the conversation</h3>
                <p>Ask me anything — I'm here to help.</p>
                <div className="prompt-chips">
                  {PROMPTS.map(p => (
                    <button key={p} className="prompt-chip" onClick={() => handlePrompt(p)}>{p}</button>
                  ))}
                </div>
              </div>

            ) : (
              <>
                {messages.map((msg, i) => (
                  <div key={msg.id || i} className={`msg-row ${msg.role}`}>

                    {msg.role === "model" ? (
                      <div className="msg-avatar">
                        <DexioLogo size="sm" showText={false} />
                      </div>
                    ) : (
                      <div className="msg-avatar-user"><User size={14} /></div>
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
                          {/* Copy + time row under AI bubble */}
                          <div className="msg-meta">
                            <button className="btn-copy" onClick={() => handleCopyMessage(msg.content)}>
                              <Copy size={11} /> Copy
                            </button>
                            <span className="msg-time">{formatTime(msg.time)}</span>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="msg-bubble-user">{msg.content}</div>
                          <div className="msg-meta msg-meta-user">
                            <span className="msg-time">{formatTime(msg.time)}</span>
                          </div>
                        </>
                      )}
                    </div>

                  </div>
                ))}

                {waiting && (
                  <div className="msg-row model">
                    <div className="msg-avatar"><DexioLogo size="sm" showText={false} /></div>
                    <div className="msg-content">
                      <div className="typing-bubble">
                        <span /><span /><span />
                        <span className="typing-label">Dexio is thinking…</span>
                      </div>
                    </div>
                  </div>
                )}

                <div ref={bottomRef} style={{ height: 1 }} />
              </>
            )}
          </div>
        </div>

        {/* Scroll to bottom */}
        {showScrollBtn && (
          <button
            className="btn-scroll-bottom"
            onClick={() => { userScrolledUpRef.current = false; scrollToBottom() }}
            title="Jump to latest"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        )}

        {/* Input */}
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
                <button className="btn-stop" onClick={handleStop} title="Stop generating">
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
            <p className="input-hint">Dexio AI — ask anything, build anything</p>
          </div>
        </div>

      </div>
    </div>
  )
}