"use client"
import { v4 as uuidv4 } from "uuid"
import { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
// Components
import { MessageDisplay } from "./message-display"
import { ChatSkeleton } from "@/components/chat-skeleton"
import IntegratedChatInput from "@/components/integrated-input-chat"
// Interfaces and constants
import { ChatMessage, ConversationRequest } from "@/constants/interfaces"
import { ASSISTANT_PENDING, assistantPendingState } from "@/constants"
// Hooks
import {
    useChatInteraction,
    useConversationMessages,
} from "@/hooks/api/use-conversations"
import { useUpdateUrl } from "@/hooks/use-update-url"
import useAutoScrollOnMessage from "./hooks/use-auto-scroll"
import { usePersistentFocusArea } from "../integrated-input-chat/hooks/use-persistent-focus-area"
import { buildAssistantMessage, buildUserMessage } from "./utils"

export default function ChatView({
    id,
    initialMessage = "",
    chatPlaceholder = "Type message",
    isHomepage = false,
}: {
    id?: string
    initialMessage?: string
    chatPlaceholder?: string
    isHomepage?: boolean
}) {
    const router = useRouter()
    const isNewChat = !id || id === "new"
    const updateUrl = useUpdateUrl()
    const containerRef = useRef<HTMLDivElement>(null)

    const createConversation = useChatInteraction()

    // 1. Load existing messages (only if NOT new chat and NOT homepage)
    const { data, isLoading, isFetching } = useConversationMessages(id ?? "", { 
        enabled: !isNewChat && !isHomepage 
    })

    const loadedMessages = data?.chat_history ?? []
    const meta = data?.metadata
    const ctx = data?.conversation_context
    const { focusArea: currentFocusArea, setFocusArea: setCurrentFocusArea } =
        usePersistentFocusArea(isNewChat || isHomepage, loadedMessages)

    // 2. Local state to manage new messages (for new + ongoing chats)
    const [localMessages, setLocalMessages] = useState<ChatMessage[]>([])
    const [conversationId, setConversationId] = useState<string>(isNewChat ? uuidv4() : id || "")
    const [pendingAssistantMessage, setPendingAssistantMessage] = useState<Partial<ChatMessage> | null>(null)
    const [hasProcessedInitialMessage, setHasProcessedInitialMessage] = useState(false)

    const allMessages = (isNewChat || isHomepage) ? localMessages : [...loadedMessages, ...localMessages]
    
    const handleSendMessage = async (queryPayload: ConversationRequest) => {
        try {
            // If on homepage, navigate to chat page first
            if (isHomepage) {
                // Store the message for the new chat page
                sessionStorage.setItem("bootstrap-message", JSON.stringify({ 
                    text: queryPayload.question 
                }))
                router.push("/chat/new")
                return
            }

            const userMessage: ChatMessage = buildUserMessage(queryPayload, conversationId)
            // Show user message immediately
            setLocalMessages((prev) => [...prev, userMessage])
            setPendingAssistantMessage(assistantPendingState)

            const response = await createConversation.mutateAsync({
                ...queryPayload,
                conversation_id: conversationId,
            })

            const assistantMessage: ChatMessage = buildAssistantMessage(queryPayload, response)
            // Add assistant response
            setLocalMessages((prev) => [...prev.filter(m => m.id !== ASSISTANT_PENDING.ID_STATE), assistantMessage])
            setPendingAssistantMessage(null)

            if (isNewChat && response.conversation_id) {
                setConversationId(response.conversation_id)
                updateUrl(`/chat/${response.conversation_id}`)
            }
        } catch (error) {
            console.error("Error sending message:", error)
            setPendingAssistantMessage(null)
        }
    }

    // Handle initial message from homepage or direct navigation
    useEffect(() => {
        if (!isHomepage && isNewChat && initialMessage && !hasProcessedInitialMessage) {
            // Create a minimal query payload for the initial message
            const queryPayload: ConversationRequest = {
                top_k: 5,
                tags: [],
                question: initialMessage,
                doc_limit: 20,
                temperature: 0,
                focus_area: [currentFocusArea],
                max_tokens: 2000,
                document_uris: [],
                lookback_years: 5,
                excerpt_count: 10,
                conversation_id: conversationId,
                max_total_tokens: 8000,
                aggressiveness_factor: 5,
            }
            
            handleSendMessage(queryPayload)
            setHasProcessedInitialMessage(true)
        }
    }, [initialMessage, isNewChat, hasProcessedInitialMessage, currentFocusArea, conversationId, isHomepage])

    useAutoScrollOnMessage(containerRef, [allMessages.length, pendingAssistantMessage])
    
    if (!isNewChat && !isHomepage && (isLoading || isFetching)) {
        return <ChatSkeleton />
    }

    // Homepage layout - simpler, centered layout
    if (isHomepage) {
        return (
            <div className="flex flex-col h-full">
                <div className="flex-1 flex items-center justify-center">
                    <div className="w-full max-w-[60%]">
                        {/* You can add a welcome message or branding here */}
                        <div className="text-center mb-8">
                            <h2 className="text-2xl font-semibold mb-2">How can I help you today?</h2>
                            <p className="text-muted-foreground">Ask me anything to get started</p>
                        </div>
                        <IntegratedChatInput
                            onSend={handleSendMessage}
                            focusArea={currentFocusArea}
                            placeholder={chatPlaceholder}
                            conversationId={conversationId}
                            onFocusAreaChange={setCurrentFocusArea}
                        />
                    </div>
                </div>
            </div>
        )
    }

    // Regular chat layout
    return (
        <div className="flex flex-col h-full">
            <div className="flex-1 overflow-y-auto" ref={containerRef}>
                <div className="max-w-[60%] mx-auto py-6">
                    {allMessages.map((message) => (
                        <MessageDisplay
                            key={message.id}
                            message={message}
                            conversationId={conversationId}
                        />
                    ))}
                    {pendingAssistantMessage && (
                        <MessageDisplay
                            key={ASSISTANT_PENDING.ID_STATE}
                            message={pendingAssistantMessage}
                        />
                    )}
                </div>
            </div>
            <div className="p-4">
                <IntegratedChatInput
                    onSend={handleSendMessage}
                    focusArea={currentFocusArea}
                    placeholder={chatPlaceholder}
                    conversationId={conversationId}
                    onFocusAreaChange={setCurrentFocusArea}
                />
            </div>
        </div>
    )
}

