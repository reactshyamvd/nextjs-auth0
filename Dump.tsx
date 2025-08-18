import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query"
//components
import FocusHandler from "@/components/focus-handler"
import InfoCardGroup from "@/components/info-card-group"
import HomeChatEntry from "@/components/chat-starter"
//constants
import { landingpageCards } from "../constants"
//api's
import { focusAreaKeys, focusAreasAPI } from "@/lib/api"

export default async function Home() {
  const queryClient = new QueryClient()
  try {
    await queryClient.prefetchQuery({
      queryKey: focusAreaKeys.all,
      queryFn: focusAreasAPI.getAll,
      staleTime: 10 * 60 * 1000 //optional
    })
  } catch (error) {
    console.error("Error prefetching focus areas:", error)
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <main className="flex flex-col h-full" role="main">
        <FocusHandler />
        <section className="flex-1 overflow-y-auto" aria-labelledby="info-cards-heading">
          <div className="flex flex-col items-center justify-center min-h-full p-6" aria-live="polite">
            <h1 id="info-cards-heading" className="sr-only">Info Cards Section</h1>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-6xl">
              <InfoCardGroup cards={landingpageCards} />
            </div>
          </div>
        </section>
        <div className="p-4" aria-label="Chat input">
          <HomeChatEntry />
        </div>
      </main>
    </HydrationBoundary>
  )
}
"use client"

import { useEffect, useState } from "react"
import ChatView from "@/components/chat-view"

export default function NewChatPage() {
  const [initialMessage, setInitialMessage] = useState<string | null>(null)

  useEffect(() => {
    const raw = sessionStorage.getItem("bootstrap-message")
    if (raw) {
      const parsed = JSON.parse(raw)
      setInitialMessage(parsed.text)
      sessionStorage.removeItem("bootstrap-message")
    }
  }, [])

  return <ChatView initialMessage={initialMessage ?? ""} />
}

"use client"
import { v4 as uuidv4 } from "uuid"
import { useState, useRef, useEffect } from "react"
//import { useRouter } from "next/navigation"
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
    chatPlaceholder = "Type message",
}: {
    id?: string
    chatPlaceholder?: string
}) {
    const isNewChat = !id || id === "new"
    //const router = useRouter()
    const updateUrl = useUpdateUrl()
    const containerRef = useRef<HTMLDivElement>(null)

    const createConversation = useChatInteraction()

    // 1. Load existing messages (only if NOT new chat)
    const { data, isLoading, isFetching } = useConversationMessages(id ?? "", { enabled: !isNewChat })

    const loadedMessages = data?.chat_history ?? []
    const meta = data?.metadata
    const ctx = data?.conversation_context
    const { focusArea: currentFocusArea, setFocusArea: setCurrentFocusArea } =
        usePersistentFocusArea(isNewChat, loadedMessages)

    // 2. Local state to manage new messages (for new + ongoing chats)
    const [localMessages, setLocalMessages] = useState<ChatMessage[]>([])
    const [conversationId, setConversationId] = useState<string>(isNewChat ? uuidv4() : id || "")
    const [pendingAssistantMessage, setPendingAssistantMessage] = useState<Partial<ChatMessage> | null>(null)

    const allMessages = isNewChat ? localMessages : [...loadedMessages, ...localMessages]
    const handleSendMessage = async (queryPayload: ConversationRequest) => {
        try {
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
                // router.replace(`/chat/${response.conversation_id}`)
                updateUrl(`/chat/${response.conversation_id}`)
            }
        } catch (error) {
            console.error("Error sending message:", error)
            setPendingAssistantMessage(null)
        }
    }

    useAutoScrollOnMessage(containerRef, [allMessages.length, pendingAssistantMessage])
    const [initialMessage, setInitialMessage] = useState<string>("")
    useEffect(() => {
        if (isNewChat) {
            const stored = sessionStorage.getItem("bootstrap-message")
            if (stored) {
                try {
                    const parsed = JSON.parse(stored)
                    if (parsed?.text) {
                        setInitialMessage(parsed.text)
                    }
                } catch (e) {
                    console.warn("Invalid bootstrap message", e)
                } finally {
                    sessionStorage.removeItem("bootstrap-message")
                }
            }
        }
    }, [isNewChat])
    
    if (!isNewChat && (isLoading || isFetching)) {
        return <ChatSkeleton />
    }
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
"use client"
import { cn, getFocusAreaFeatures } from "@/lib/utils"
import React, { useState, useRef, useEffect } from "react"
import { useFloating, offset, flip, shift } from "@floating-ui/react"
// Hooks
import useAttachments from "./hooks/use-attachments"
import useCommandMenu from "./hooks/use-command-menu"
import useFilterSettings from "./hooks/use-filter-settings"
//components
import PlusMenu from "./components/plus-menu"
import FocusAreas from "./components/focus-areas"
import SendButton from "./components/send-button"
import CommandMenu from "./components/command-menu"
import TextAreaInput from "./components/textArea-input"
import FilterSelector from "./components/filter-selector"
import AttachmentsList from "./components/attachment-list"
import { FilterButton } from "@/components/integrated-input-chat/components/filter-button"
//interfaces and constants
import { IntegratedChatInputProps } from "@/constants/interfaces"
import { DEFAULT_FOCUS_AREA_LABEL, FILTER_TYPE_DOCUMENTS, FilterType } from "@/constants"
//utils
import { isSendDisabled } from "./utils/index"
import { extractDocumentUrisAndTagIds } from "@/lib/utils"

const defaultQueryPayload = {
  top_k: 5,
  tags: [],
  question: "",
  doc_limit: 20,
  temperature: 0,
  focus_area: [],
  max_tokens: 2000,
  document_uris: [],
  lookback_years: 5,
  excerpt_count: 10,
  conversation_id: "",
  max_total_tokens: 8000,
  aggressiveness_factor: 5,
}

export default function IntegratedChatInput({
  onSend,
  className,
  focusArea,
  conversationId,
  onFocusAreaChange,
  placeholder = "Type message",
}: IntegratedChatInputProps) {
  const MAX_ATTACHMENTS = 5
  const [message, setMessage] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const [isPlusMenuOpen, setIsPlusMenuOpen] = useState(false)
  const [menuType, setMenuType] = useState<"none" | FilterType>("none")
  const isValidFocusArea = focusArea !== DEFAULT_FOCUS_AREA_LABEL
  const features = focusArea ? getFocusAreaFeatures(focusArea) : null
  const { refs, floatingStyles } = useFloating({
    placement: "top-start",
    middleware: [offset(2), flip(), shift()],
  })

  const {
    addTag,
    attachments,
    addDocument,
    removeAttachment,
    attachmentsLoading,
    //filterPreferenceId,
  } = useAttachments(focusArea, 10)

  const { documentUris, tags } = extractDocumentUrisAndTagIds(attachments || [])
  const {
    maxExcerpts,
    yearsToSearch,
    setMaxExcerpts,
    searchIntensity,
    setYearsToSearch,
    setSearchIntensity,
  } = useFilterSettings()

  const handleSend = () => {
    if (message.trim() || (attachments && attachments.length > 0)) {
      const queryPayload = {
        ...defaultQueryPayload,
        tags: tags.map(String),
        document_uris: documentUris,
        question: message.trim(),
        focus_area: [focusArea],
        //...(filterPreferenceId ? { filter_preference_id: filterPreferenceId } : {}),
        lookback_years: yearsToSearch,
        aggressiveness_factor: searchIntensity,
        excerpt_count: maxExcerpts,
      }

      onSend(queryPayload)
      setMessage("")
      if (textareaRef.current) {
        textareaRef.current.style.height = "40px" // Reset to initial height after sending
      }
    }
  }

  const {
    commandMenuRef,
    showCommandMenu,
    setShowCommandMenu,
    commandOptions,
    selectedCommandIndex,
    commandMenuPosition,
    handleKeyDown,
    handleInputChange,
    selectCommand,
    commandQuery,
    setCommandQuery
  } = useCommandMenu(message, setMessage, textareaRef, setMenuType, handleSend, focusArea)

  const togglePlusMenu = () => {
    setIsPlusMenuOpen(!isPlusMenuOpen)
    setMenuType("none")
  }

  const toggleMenu = (type: FilterType) => {
    if (menuType === type) {
      setMenuType("none")
    } else {
      setMenuType(type)
      setCommandQuery("")
    }
    setIsPlusMenuOpen(false)
  }

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  return (
    <>
      <div
        className={cn("flex flex-col border shadow-sm bg-background max-w-[60%] mx-auto", className)}>
        {(isValidFocusArea && !attachmentsLoading) && (
          <AttachmentsList
            attachments={attachments}
            maxAttachments={MAX_ATTACHMENTS}
            removeAttachment={removeAttachment}
          />
        )}
        <div className="px-3 pt-3 relative">
          <TextAreaInput
            ref={textareaRef}
            value={message}
            placeholder={placeholder}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            rows={1}
          />
          {showCommandMenu && (
            <CommandMenu
              onSelect={selectCommand}
              commandQuery={commandQuery}
              position={commandMenuPosition}
              commandOptions={commandOptions}
              commandMenuRef={commandMenuRef}
              setCommandQuery={setCommandQuery}
              selectedIndex={selectedCommandIndex}
              onClose={() => setShowCommandMenu(false)}
            />
          )}
        </div>
        <div className="flex items-center justify-between px-3 pb-3">
          <div className="flex items-center space-x-2">
            <FocusAreas
              focusArea={focusArea}
              setFocusArea={onFocusAreaChange}
            />
            {features?.slidersAvailable &&
              <FilterButton
                maxExcerpts={maxExcerpts}
                yearsToSearch={yearsToSearch}
                onChangeYears={setYearsToSearch}
                searchIntensity={searchIntensity}
                slidersList={features.slidersList}
                onChangeMaxExcerpts={setMaxExcerpts}
                onChangeIntensity={setSearchIntensity}
              />}
            {features?.filtersAvailable &&
              <PlusMenu
                ref={refs.setReference}
                isPlusMenuOpen={isPlusMenuOpen}
                toggleMenu={toggleMenu}
                togglePlusMenu={togglePlusMenu}
                commandQuery={commandQuery}
                setCommandQuery={setCommandQuery}
              />}
          </div>
          <SendButton
            onClick={handleSend}
            disabled={isSendDisabled(message, focusArea)}
          />
        </div>
      </div>
      {menuType !== "none" && (
        <FilterSelector
          type={menuType}
          focusArea={focusArea}
          setFloating={refs.setFloating}
          floatingStyles={floatingStyles}
          onClose={() => setMenuType("none")}
          onSelect={menuType === FILTER_TYPE_DOCUMENTS ? addDocument : addTag}
        />
      )}
    </>
  )
}

