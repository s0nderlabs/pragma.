'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type MessageRole = 'user' | 'ai' | 'system'

export interface Message {
  id: string
  role: MessageRole
  content: string
  timestamp: number
}

export interface Conversation {
  id: string
  title: string
  messages: Message[]
  createdAt: number
  updatedAt: number
}

interface ChatState {
  conversations: Conversation[]
  activeConversationId: string | null
  isThinking: boolean

  // Actions
  createConversation: () => string
  loadConversation: (id: string) => void
  addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => void
  deleteConversation: (id: string) => void
  setThinking: (thinking: boolean) => void
  clearActiveConversation: () => void
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      conversations: [],
      activeConversationId: null,
      isThinking: false,

      createConversation: () => {
        const id = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
        const newConversation: Conversation = {
          id,
          title: 'New Conversation',
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }

        set((state) => ({
          conversations: [newConversation, ...state.conversations],
          activeConversationId: id,
        }))

        return id
      },

      loadConversation: (id: string) => {
        const { conversations } = get()
        const conversation = conversations.find((c) => c.id === id)

        if (conversation) {
          set({ activeConversationId: id })
        }
      },

      addMessage: (message) => {
        const { activeConversationId, conversations } = get()

        if (!activeConversationId) {
          // Create new conversation if none exists
          const newId = get().createConversation()
          set({ activeConversationId: newId })
        }

        const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
        const timestamp = Date.now()

        const newMessage: Message = {
          id: messageId,
          timestamp,
          ...message,
        }

        set((state) => ({
          conversations: state.conversations.map((conv) =>
            conv.id === state.activeConversationId
              ? {
                  ...conv,
                  messages: [...conv.messages, newMessage],
                  updatedAt: timestamp,
                  // Update title based on first user message
                  title:
                    conv.messages.length === 0 && message.role === 'user'
                      ? message.content.slice(0, 50) + (message.content.length > 50 ? '...' : '')
                      : conv.title,
                }
              : conv
          ),
        }))
      },

      deleteConversation: (id: string) => {
        set((state) => ({
          conversations: state.conversations.filter((c) => c.id !== id),
          activeConversationId:
            state.activeConversationId === id ? null : state.activeConversationId,
        }))
      },

      setThinking: (thinking: boolean) => {
        set({ isThinking: thinking })
      },

      clearActiveConversation: () => {
        set({ activeConversationId: null })
      },
    }),
    {
      name: 'pragma:chat',
      // Only persist conversations, not UI state
      partialize: (state) => ({
        conversations: state.conversations,
        activeConversationId: state.activeConversationId,
      }),
    }
  )
)
