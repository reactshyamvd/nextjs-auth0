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
