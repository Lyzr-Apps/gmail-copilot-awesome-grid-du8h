'use client'

import React, { useState, useEffect, useRef } from 'react'
import { callAIAgent } from '@/lib/aiAgent'
import { getSchedule, getScheduleLogs, pauseSchedule, resumeSchedule, cronToHuman, triggerScheduleNow } from '@/lib/scheduler'
import type { Schedule, ExecutionLog } from '@/lib/scheduler'
import { useLyzrAgentEvents } from '@/lib/lyzrAgentEvents'
import { AgentActivityPanel } from '@/components/AgentActivityPanel'
import { copyToClipboard } from '@/lib/clipboard'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

import { HiOutlineEnvelope, HiOutlineClock, HiOutlineArrowPath, HiOutlinePaperAirplane, HiOutlineBell, HiOutlineCog6Tooth, HiOutlineInboxStack, HiOutlineCheckCircle, HiOutlineQuestionMarkCircle, HiOutlineFlag, HiOutlineXMark, HiOutlineMagnifyingGlass, HiOutlinePencilSquare, HiOutlineCalendarDays, HiOutlinePlay, HiOutlinePause, HiOutlineSignal, HiOutlineChatBubbleLeftRight, HiOutlineSparkles, HiOutlineEye, HiOutlineArchiveBox, HiOutlineUserCircle, HiOutlineAdjustmentsHorizontal } from 'react-icons/hi2'
import { FiLoader, FiCheck, FiX, FiSend, FiCopy, FiRefreshCw, FiZap, FiActivity } from 'react-icons/fi'

// ---- Constants ----
const COPILOT_AGENT_ID = '69976a22d3c472bb58ec2613'
const FOLLOW_UP_AGENT_ID = '69976a212d97052a26fc9891'
const SCHEDULE_ID = '69976a2d399dfadeac37bbbc'

// ---- Types ----
interface EmailItem {
  id: string
  threadId: string
  subject: string
  sender: string
  snippet: string
  timestamp: string
  isUnread: boolean
}

interface CopilotResponse {
  draft_subject?: string
  draft_body?: string
  thread_summary?: string
  suggested_actions?: string[]
  tone?: string
  status?: string
  message?: string
}

interface FollowUpItem {
  email_subject?: string
  sender?: string
  last_activity?: string
  category?: string
  reason?: string
  days_waiting?: number
  thread_id?: string
  has_reminder?: boolean
  reminder_date?: string
  draft_content?: string
}

interface FollowUpResponse {
  follow_up_items?: FollowUpItem[]
  total_count?: number
  categories_summary?: {
    unanswered?: number
    commitments?: number
    questions?: number
    flagged?: number
  }
  scan_timestamp?: string
  status?: string
  message?: string
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  draft?: CopilotResponse
  timestamp: string
}

interface StatusMessage {
  text: string
  type: 'success' | 'error' | 'info'
}

interface AppSettings {
  tone: string
  autoSaveDraft: boolean
  unansweredDays: number
  commitmentDetection: boolean
  questionDetection: boolean
}

type GmailConnectionStatus = 'unknown' | 'connecting' | 'connected' | 'error'

// ---- Sample Data ----
const SAMPLE_EMAILS: EmailItem[] = [
  { id: '1', threadId: 'thread_001', subject: 'Q4 Revenue Projections Review', sender: 'Sarah Chen <sarah.chen@acmecorp.com>', snippet: 'Hi team, I have compiled the Q4 revenue projections and would love to get your feedback before...', timestamp: '2:34 PM', isUnread: true },
  { id: '2', threadId: 'thread_002', subject: 'Partnership Proposal - CloudSync Inc', sender: 'Michael Torres <m.torres@cloudsync.io>', snippet: 'Following up on our call yesterday, I wanted to share the updated partnership terms that we...', timestamp: '11:15 AM', isUnread: true },
  { id: '3', threadId: 'thread_003', subject: 'Re: Marketing Campaign Assets', sender: 'Lisa Wang <lisa@brandforge.com>', snippet: 'Thanks for the feedback! I have made the revisions to the banner designs. Please find attached...', timestamp: 'Yesterday', isUnread: false },
  { id: '4', threadId: 'thread_004', subject: 'Meeting Notes - Product Roadmap', sender: 'David Park <dpark@internalteam.com>', snippet: 'Here are the key takeaways from today\'s product roadmap session. Action items are listed below...', timestamp: 'Yesterday', isUnread: false },
  { id: '5', threadId: 'thread_005', subject: 'Invoice #4892 - Overdue Payment', sender: 'Accounts <accounts@vendorplus.com>', snippet: 'This is a reminder that invoice #4892 dated Nov 15 remains unpaid. The amount of $12,450 was...', timestamp: 'Mon', isUnread: true },
]

const SAMPLE_FOLLOWUPS: FollowUpItem[] = [
  { email_subject: 'Q4 Revenue Projections Review', sender: 'sarah.chen@acmecorp.com', last_activity: '2024-02-15T14:34:00Z', category: 'unanswered', reason: 'No response sent in 4 days. Sarah is waiting for feedback on projections.', days_waiting: 4, thread_id: 'thread_001', has_reminder: false, reminder_date: '', draft_content: 'Hi Sarah, Thank you for putting together the Q4 revenue projections. I have reviewed them and have a few comments...' },
  { email_subject: 'Partnership Proposal - CloudSync Inc', sender: 'm.torres@cloudsync.io', last_activity: '2024-02-14T11:15:00Z', category: 'commitments', reason: 'You committed to reviewing the partnership terms by end of week.', days_waiting: 5, thread_id: 'thread_002', has_reminder: true, reminder_date: '2024-02-19', draft_content: 'Hi Michael, Following up on the CloudSync partnership proposal. I have completed my review of the terms and here are my thoughts...' },
  { email_subject: 'Invoice #4892 - Overdue Payment', sender: 'accounts@vendorplus.com', last_activity: '2024-02-12T09:00:00Z', category: 'flagged', reason: 'Overdue invoice requires immediate attention. Payment was due 7 days ago.', days_waiting: 7, thread_id: 'thread_005', has_reminder: false, reminder_date: '', draft_content: 'Hi Accounts team, I apologize for the delay. I have escalated invoice #4892 to our finance department for immediate processing...' },
  { email_subject: 'Re: Marketing Campaign Assets', sender: 'lisa@brandforge.com', last_activity: '2024-02-14T16:45:00Z', category: 'questions', reason: 'Lisa asked if the revised designs meet your requirements. Awaiting your confirmation.', days_waiting: 5, thread_id: 'thread_003', has_reminder: false, reminder_date: '', draft_content: 'Hi Lisa, The revised banner designs look great! I especially like the updated color palette. A couple of minor tweaks...' },
]

const SAMPLE_CATEGORIES = { unanswered: 1, commitments: 1, questions: 1, flagged: 1 }

// ---- Helpers ----
function generateSessionId() {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

function renderMarkdown(text: string) {
  if (!text) return null
  return (
    <div className="space-y-2">
      {text.split('\n').map((line, i) => {
        if (line.startsWith('### ')) return <h4 key={i} className="font-semibold text-sm mt-3 mb-1">{line.slice(4)}</h4>
        if (line.startsWith('## ')) return <h3 key={i} className="font-semibold text-base mt-3 mb-1">{line.slice(3)}</h3>
        if (line.startsWith('# ')) return <h2 key={i} className="font-bold text-lg mt-4 mb-2">{line.slice(2)}</h2>
        if (line.startsWith('- ') || line.startsWith('* ')) return <li key={i} className="ml-4 list-disc text-sm">{formatInline(line.slice(2))}</li>
        if (/^\d+\.\s/.test(line)) return <li key={i} className="ml-4 list-decimal text-sm">{formatInline(line.replace(/^\d+\.\s/, ''))}</li>
        if (!line.trim()) return <div key={i} className="h-1" />
        return <p key={i} className="text-sm leading-relaxed">{formatInline(line)}</p>
      })}
    </div>
  )
}

function formatInline(text: string) {
  const parts = text.split(/\*\*(.*?)\*\*/g)
  if (parts.length === 1) return text
  return parts.map((part, i) => i % 2 === 1 ? <strong key={i} className="font-semibold">{part}</strong> : part)
}

function getCategoryIcon(category: string) {
  switch (category?.toLowerCase()) {
    case 'unanswered': return <HiOutlineInboxStack className="h-4 w-4" />
    case 'commitments': return <HiOutlineCheckCircle className="h-4 w-4" />
    case 'questions': return <HiOutlineQuestionMarkCircle className="h-4 w-4" />
    case 'flagged': return <HiOutlineFlag className="h-4 w-4" />
    default: return <HiOutlineEnvelope className="h-4 w-4" />
  }
}

function getCategoryColor(category: string) {
  switch (category?.toLowerCase()) {
    case 'unanswered': return 'bg-amber-100 text-amber-800 border-amber-200'
    case 'commitments': return 'bg-blue-100 text-blue-800 border-blue-200'
    case 'questions': return 'bg-purple-100 text-purple-800 border-purple-200'
    case 'flagged': return 'bg-red-100 text-red-800 border-red-200'
    default: return 'bg-gray-100 text-gray-800 border-gray-200'
  }
}

// ---- ErrorBoundary ----
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: '' }
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
          <div className="text-center p-8 max-w-md">
            <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
            <p className="text-muted-foreground mb-4 text-sm">{this.state.error}</p>
            <button onClick={() => this.setState({ hasError: false, error: '' })} className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm">Try again</button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// ---- Sub-components ----

function StatusBar({ statusMessage, onDismiss }: { statusMessage: StatusMessage | null; onDismiss: () => void }) {
  if (!statusMessage) return null
  const colors = statusMessage.type === 'error' ? 'bg-red-50 text-red-700 border-red-200' : statusMessage.type === 'success' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-blue-50 text-blue-700 border-blue-200'
  return (
    <div className={`px-4 py-2 rounded-[0.875rem] text-sm flex items-center justify-between border ${colors}`}>
      <span>{statusMessage.text}</span>
      <button onClick={onDismiss} className="ml-2 opacity-60 hover:opacity-100"><HiOutlineXMark className="h-4 w-4" /></button>
    </div>
  )
}

function EmailSkeleton() {
  return (
    <div className="space-y-3 p-4">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-3 w-full" />
        </div>
      ))}
    </div>
  )
}

function FollowUpSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
      {[1, 2, 3].map(i => (
        <Card key={i} className="glass-card">
          <CardContent className="p-4 space-y-3">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
            <div className="flex gap-2">
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-8 w-20" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

// ---- Main Page ----
export default function Page() {
  // Tab navigation
  const [activeTab, setActiveTab] = useState<'inbox' | 'followup' | 'settings'>('inbox')

  // Sample data toggle
  const [showSampleData, setShowSampleData] = useState(false)

  // Inbox state
  const [emails, setEmails] = useState<EmailItem[]>([])
  const [selectedEmail, setSelectedEmail] = useState<EmailItem | null>(null)
  const [copilotOpen, setCopilotOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [fetchingEmails, setFetchingEmails] = useState(false)
  const [fetchingThread, setFetchingThread] = useState(false)
  const [threadContent, setThreadContent] = useState<string>('')

  // Copilot state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [currentDraft, setCurrentDraft] = useState<CopilotResponse | null>(null)
  const [copilotLoading, setCopilotLoading] = useState(false)
  const [sessionId, setSessionId] = useState(() => generateSessionId())
  const [editingDraft, setEditingDraft] = useState(false)
  const [draftEdit, setDraftEdit] = useState('')

  // Follow-up state
  const [followUpItems, setFollowUpItems] = useState<FollowUpItem[]>([])
  const [followUpResponse, setFollowUpResponse] = useState<FollowUpResponse | null>(null)
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [scanningFollowUps, setScanningFollowUps] = useState(false)
  const [reminderDates, setReminderDates] = useState<Record<string, string>>({})
  const [sendingFollowUp, setSendingFollowUp] = useState<string | null>(null)

  // Settings state
  const [settings, setSettings] = useState<AppSettings>({
    tone: 'professional',
    autoSaveDraft: true,
    unansweredDays: 3,
    commitmentDetection: true,
    questionDetection: true,
  })

  // Schedule state
  const [schedule, setSchedule] = useState<Schedule | null>(null)
  const [scheduleLogs, setScheduleLogs] = useState<ExecutionLog[]>([])
  const [scheduleLoading, setScheduleLoading] = useState(false)
  const [scheduleActionLoading, setScheduleActionLoading] = useState(false)

  // Gmail connection state
  const [gmailStatus, setGmailStatus] = useState<GmailConnectionStatus>('unknown')
  const [gmailConnecting, setGmailConnecting] = useState(false)
  const [gmailError, setGmailError] = useState<string | null>(null)

  // Status & Agent
  const [statusMessage, setStatusMessage] = useState<StatusMessage | null>(null)
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null)
  const [copiedField, setCopiedField] = useState<string | null>(null)

  // Agent activity monitoring
  const agentActivity = useLyzrAgentEvents(sessionId)

  // Chat scroll ref
  const chatScrollRef = useRef<HTMLDivElement>(null)

  // Auto scroll chat
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight
    }
  }, [chatMessages])

  // Load schedule on settings tab
  useEffect(() => {
    if (activeTab === 'settings') {
      loadSchedule()
    }
  }, [activeTab])

  // Apply sample data
  useEffect(() => {
    if (showSampleData) {
      setEmails(SAMPLE_EMAILS)
      setFollowUpItems(SAMPLE_FOLLOWUPS)
      setFollowUpResponse({
        follow_up_items: SAMPLE_FOLLOWUPS,
        total_count: 4,
        categories_summary: SAMPLE_CATEGORIES,
        scan_timestamp: new Date().toISOString(),
        status: 'completed',
        message: '4 emails need follow-up',
      })
    } else {
      setEmails([])
      setFollowUpItems([])
      setFollowUpResponse(null)
      setSelectedEmail(null)
      setCopilotOpen(false)
      setThreadContent('')
      setChatMessages([])
      setCurrentDraft(null)
    }
  }, [showSampleData])

  // Auto-clear status after 5 seconds
  useEffect(() => {
    if (statusMessage) {
      const timer = setTimeout(() => setStatusMessage(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [statusMessage])

  // Helper to safely parse result
  const parseAgentResult = (result: any): any => {
    if (!result?.success) return null
    const data = result?.response?.result
    if (typeof data === 'string') {
      try { return JSON.parse(data) } catch { return { message: data } }
    }
    return data ?? null
  }

  // ---- Inbox handlers ----
  const handleFetchEmails = async () => {
    setFetchingEmails(true)
    setActiveAgentId(COPILOT_AGENT_ID)
    agentActivity.setProcessing(true)
    try {
      const msg = searchQuery ? `Search my Gmail inbox for: ${searchQuery}` : 'Fetch my recent emails from Gmail'
      const result = await callAIAgent(msg, COPILOT_AGENT_ID, { session_id: sessionId })
      agentActivity.setProcessing(false)

      // Check for auth URLs in the response
      const rawStr = JSON.stringify(result ?? '')
      const authUrl = extractAuthUrl(rawStr)
      if (authUrl) {
        setGmailStatus('unknown')
        setStatusMessage({ text: 'Gmail authorization needed. Opening authorization window...', type: 'info' })
        window.open(authUrl, '_blank', 'noopener,noreferrer')
        setFetchingEmails(false)
        setActiveAgentId(null)
        return
      }

      const data = parseAgentResult(result)
      if (data) {
        // Mark Gmail as connected since agent call succeeded
        setGmailStatus('connected')
        setGmailError(null)
        if (data?.message) {
          setStatusMessage({ text: data.message, type: 'info' })
        }
        // Sometimes agent returns emails as a list inside suggested_actions or message
        // Show the text response if no structured list
        if (data?.draft_body || data?.thread_summary) {
          setThreadContent(data.thread_summary ?? data.draft_body ?? data.message ?? '')
        }
      } else {
        setStatusMessage({ text: result?.error ?? 'Failed to fetch emails. You may need to connect Gmail first via Settings.', type: 'error' })
      }
    } catch (err) {
      agentActivity.setProcessing(false)
      setStatusMessage({ text: 'Error fetching emails. Please check your Gmail connection in Settings.', type: 'error' })
    }
    setFetchingEmails(false)
    setActiveAgentId(null)
  }

  const handleSelectEmail = async (email: EmailItem) => {
    setSelectedEmail(email)
    setCopilotOpen(false)
    setFetchingThread(true)
    setActiveAgentId(COPILOT_AGENT_ID)
    agentActivity.setProcessing(true)
    try {
      const result = await callAIAgent(
        `Fetch the full email thread for thread ID: ${email.threadId}. Subject: "${email.subject}" from ${email.sender}`,
        COPILOT_AGENT_ID,
        { session_id: sessionId }
      )
      agentActivity.setProcessing(false)
      const data = parseAgentResult(result)
      if (data) {
        setThreadContent(data?.thread_summary ?? data?.message ?? data?.draft_body ?? '')
      }
    } catch {
      agentActivity.setProcessing(false)
      setStatusMessage({ text: 'Error loading thread', type: 'error' })
    }
    setFetchingThread(false)
    setActiveAgentId(null)
  }

  const handleOpenCopilot = () => {
    if (!selectedEmail) return
    setCopilotOpen(true)
    setChatMessages([])
    setCurrentDraft(null)
    setSessionId(generateSessionId())
    handleGenerateDraft()
  }

  const handleGenerateDraft = async () => {
    if (!selectedEmail) return
    setCopilotLoading(true)
    setActiveAgentId(COPILOT_AGENT_ID)
    agentActivity.setProcessing(true)
    const newSid = generateSessionId()
    setSessionId(newSid)
    try {
      const result = await callAIAgent(
        `Draft a ${settings.tone} reply to this email thread. Subject: "${selectedEmail.subject}". From: ${selectedEmail.sender}. Context: ${threadContent || selectedEmail.snippet}`,
        COPILOT_AGENT_ID,
        { session_id: newSid }
      )
      agentActivity.setProcessing(false)
      const data = parseAgentResult(result)
      if (data) {
        const draft: CopilotResponse = {
          draft_subject: data?.draft_subject ?? `Re: ${selectedEmail.subject}`,
          draft_body: data?.draft_body ?? data?.message ?? '',
          thread_summary: data?.thread_summary ?? '',
          suggested_actions: Array.isArray(data?.suggested_actions) ? data.suggested_actions : [],
          tone: data?.tone ?? settings.tone,
          status: data?.status ?? 'draft_ready',
          message: data?.message ?? '',
        }
        setCurrentDraft(draft)
        setChatMessages(prev => [...prev, {
          role: 'assistant',
          content: 'I have drafted a reply for you. You can edit it directly or ask me to refine it.',
          draft,
          timestamp: new Date().toISOString(),
        }])
      } else {
        setStatusMessage({ text: 'Failed to generate draft', type: 'error' })
      }
    } catch {
      agentActivity.setProcessing(false)
      setStatusMessage({ text: 'Error generating draft', type: 'error' })
    }
    setCopilotLoading(false)
    setActiveAgentId(null)
  }

  const handleCopilotSend = async () => {
    if (!chatInput.trim() || copilotLoading) return
    const userMsg = chatInput.trim()
    setChatInput('')
    setChatMessages(prev => [...prev, { role: 'user', content: userMsg, timestamp: new Date().toISOString() }])
    setCopilotLoading(true)
    setActiveAgentId(COPILOT_AGENT_ID)
    agentActivity.setProcessing(true)
    try {
      const result = await callAIAgent(userMsg, COPILOT_AGENT_ID, { session_id: sessionId })
      agentActivity.setProcessing(false)
      const data = parseAgentResult(result)
      if (data) {
        const draft: CopilotResponse = {
          draft_subject: data?.draft_subject ?? currentDraft?.draft_subject ?? '',
          draft_body: data?.draft_body ?? data?.message ?? '',
          thread_summary: data?.thread_summary ?? currentDraft?.thread_summary ?? '',
          suggested_actions: Array.isArray(data?.suggested_actions) ? data.suggested_actions : [],
          tone: data?.tone ?? currentDraft?.tone ?? '',
          status: data?.status ?? '',
          message: data?.message ?? '',
        }
        if (data?.draft_body) setCurrentDraft(draft)
        setChatMessages(prev => [...prev, {
          role: 'assistant',
          content: data?.message ?? data?.draft_body ?? 'Here is my response.',
          draft: data?.draft_body ? draft : undefined,
          timestamp: new Date().toISOString(),
        }])
      }
    } catch {
      agentActivity.setProcessing(false)
      setStatusMessage({ text: 'Error sending message', type: 'error' })
    }
    setCopilotLoading(false)
    setActiveAgentId(null)
  }

  const handleSendReply = async () => {
    if (!currentDraft?.draft_body || !selectedEmail) return
    setCopilotLoading(true)
    setActiveAgentId(COPILOT_AGENT_ID)
    agentActivity.setProcessing(true)
    try {
      const body = editingDraft ? draftEdit : currentDraft.draft_body
      const result = await callAIAgent(
        `Send this reply to thread ${selectedEmail.threadId}: Subject: "${currentDraft.draft_subject ?? `Re: ${selectedEmail.subject}`}" Body: ${body}`,
        COPILOT_AGENT_ID,
        { session_id: sessionId }
      )
      agentActivity.setProcessing(false)
      const data = parseAgentResult(result)
      setStatusMessage({ text: data?.message ?? 'Reply sent successfully', type: data?.status === 'error' ? 'error' : 'success' })
      setEditingDraft(false)
    } catch {
      agentActivity.setProcessing(false)
      setStatusMessage({ text: 'Error sending reply', type: 'error' })
    }
    setCopilotLoading(false)
    setActiveAgentId(null)
  }

  const handleCopyDraft = async () => {
    const text = editingDraft ? draftEdit : (currentDraft?.draft_body ?? '')
    const success = await copyToClipboard(text)
    if (success) {
      setCopiedField('draft')
      setTimeout(() => setCopiedField(null), 2000)
    }
  }

  // ---- Follow-up handlers ----
  const handleScanFollowUps = async () => {
    setScanningFollowUps(true)
    setActiveAgentId(FOLLOW_UP_AGENT_ID)
    agentActivity.setProcessing(true)
    try {
      const result = await callAIAgent(
        `Scan my inbox for emails that need follow-up. Check for unanswered emails older than ${settings.unansweredDays} days, pending commitments, open questions, and flagged items.`,
        FOLLOW_UP_AGENT_ID,
        { session_id: sessionId }
      )
      agentActivity.setProcessing(false)

      // Check for auth URLs in the response
      const rawScanStr = JSON.stringify(result ?? '')
      const scanAuthUrl = extractAuthUrl(rawScanStr)
      if (scanAuthUrl) {
        setGmailStatus('unknown')
        setStatusMessage({ text: 'Gmail authorization needed. Opening authorization window...', type: 'info' })
        window.open(scanAuthUrl, '_blank', 'noopener,noreferrer')
        setScanningFollowUps(false)
        setActiveAgentId(null)
        return
      }

      const data = parseAgentResult(result)
      if (data) {
        // Mark Gmail as connected since agent call succeeded
        setGmailStatus('connected')
        setGmailError(null)
        const items = Array.isArray(data?.follow_up_items) ? data.follow_up_items : []
        setFollowUpItems(items)
        setFollowUpResponse({
          follow_up_items: items,
          total_count: data?.total_count ?? items.length,
          categories_summary: data?.categories_summary ?? {},
          scan_timestamp: data?.scan_timestamp ?? new Date().toISOString(),
          status: data?.status ?? 'completed',
          message: data?.message ?? '',
        })
        setStatusMessage({ text: data?.message ?? `Found ${items.length} items needing follow-up`, type: 'success' })
      } else {
        setStatusMessage({ text: result?.error ?? 'Failed to scan inbox', type: 'error' })
      }
    } catch {
      agentActivity.setProcessing(false)
      setStatusMessage({ text: 'Error scanning for follow-ups', type: 'error' })
    }
    setScanningFollowUps(false)
    setActiveAgentId(null)
  }

  const handleSendFollowUp = async (item: FollowUpItem) => {
    if (!item.draft_content) {
      setStatusMessage({ text: 'No draft content available for this follow-up', type: 'error' })
      return
    }
    setSendingFollowUp(item.thread_id ?? null)
    setActiveAgentId(COPILOT_AGENT_ID)
    agentActivity.setProcessing(true)
    try {
      const result = await callAIAgent(
        `Send this follow-up email for thread ${item.thread_id}: Subject: "Re: ${item.email_subject}" Body: ${item.draft_content}`,
        COPILOT_AGENT_ID,
        { session_id: sessionId }
      )
      agentActivity.setProcessing(false)
      const data = parseAgentResult(result)
      setStatusMessage({ text: data?.message ?? 'Follow-up sent', type: 'success' })
    } catch {
      agentActivity.setProcessing(false)
      setStatusMessage({ text: 'Error sending follow-up', type: 'error' })
    }
    setSendingFollowUp(null)
    setActiveAgentId(null)
  }

  const handleRefineWithCopilot = (item: FollowUpItem) => {
    setActiveTab('inbox')
    const email: EmailItem = {
      id: item.thread_id ?? '',
      threadId: item.thread_id ?? '',
      subject: item.email_subject ?? '',
      sender: item.sender ?? '',
      snippet: item.reason ?? '',
      timestamp: item.last_activity ?? '',
      isUnread: false,
    }
    setSelectedEmail(email)
    setThreadContent(item.reason ?? '')
    setCopilotOpen(true)
    setCurrentDraft({
      draft_subject: `Re: ${item.email_subject ?? ''}`,
      draft_body: item.draft_content ?? '',
      tone: settings.tone,
      status: 'draft_ready',
    })
    setChatMessages([{
      role: 'assistant',
      content: 'Here is the follow-up draft. You can refine it by sending me instructions.',
      draft: { draft_subject: `Re: ${item.email_subject ?? ''}`, draft_body: item.draft_content ?? '' },
      timestamp: new Date().toISOString(),
    }])
  }

  // ---- Schedule handlers ----
  const loadSchedule = async () => {
    setScheduleLoading(true)
    try {
      const [schedResult, logsResult] = await Promise.all([
        getSchedule(SCHEDULE_ID),
        getScheduleLogs(SCHEDULE_ID, { limit: 5 }),
      ])
      if (schedResult.success && schedResult.schedule) {
        setSchedule(schedResult.schedule)
      }
      if (logsResult.success) {
        setScheduleLogs(Array.isArray(logsResult.executions) ? logsResult.executions : [])
      }
    } catch {
      setStatusMessage({ text: 'Error loading schedule', type: 'error' })
    }
    setScheduleLoading(false)
  }

  const handleToggleSchedule = async () => {
    if (!schedule) return
    setScheduleActionLoading(true)
    try {
      if (schedule.is_active) {
        await pauseSchedule(SCHEDULE_ID)
      } else {
        await resumeSchedule(SCHEDULE_ID)
      }
      // Always refresh the schedule list after toggle to sync UI
      const refreshResult = await getSchedule(SCHEDULE_ID)
      if (refreshResult.success && refreshResult.schedule) {
        setSchedule(refreshResult.schedule)
      }
      setStatusMessage({ text: schedule.is_active ? 'Schedule paused' : 'Schedule resumed', type: 'success' })
    } catch {
      setStatusMessage({ text: 'Error toggling schedule', type: 'error' })
    }
    setScheduleActionLoading(false)
  }

  const handleTriggerNow = async () => {
    setScheduleActionLoading(true)
    try {
      const result = await triggerScheduleNow(SCHEDULE_ID)
      setStatusMessage({ text: result.success ? 'Schedule triggered! Check Follow-Up Hub for results.' : (result.error ?? 'Failed to trigger'), type: result.success ? 'success' : 'error' })
    } catch {
      setStatusMessage({ text: 'Error triggering schedule', type: 'error' })
    }
    setScheduleActionLoading(false)
  }

  // ---- Gmail Connection handler ----
  // Helper to find auth/composio URLs in agent responses
  const extractAuthUrl = (text: string): string | null => {
    if (!text) return null
    // Match URLs that are likely Composio or Google OAuth auth flows
    const urlRegex = /(https?:\/\/[^\s"'<>]+(?:composio|accounts\.google\.com|oauth|auth|connect|redirect)[^\s"'<>]*)/gi
    const match = text.match(urlRegex)
    if (match && match.length > 0) return match[0]
    // Also check for any generic URL that might be a redirect
    const genericUrlRegex = /(https?:\/\/[^\s"'<>]{20,})/gi
    const genericMatch = text.match(genericUrlRegex)
    if (genericMatch && genericMatch.length > 0) {
      // Check if it looks like an auth URL
      const url = genericMatch[0].toLowerCase()
      if (url.includes('auth') || url.includes('oauth') || url.includes('connect') || url.includes('composio') || url.includes('google.com')) {
        return genericMatch[0]
      }
    }
    return null
  }

  const handleConnectGmail = async () => {
    setGmailConnecting(true)
    setGmailError(null)
    setGmailStatus('connecting')
    setStatusMessage({ text: 'Initiating Gmail connection...', type: 'info' })
    try {
      const result = await callAIAgent(
        'Fetch my most recent email from Gmail inbox to verify the connection is working.',
        COPILOT_AGENT_ID,
        { session_id: generateSessionId() }
      )

      // Deep-search the entire response for auth URLs
      const rawStr = JSON.stringify(result ?? '')
      const authUrl = extractAuthUrl(rawStr)

      if (authUrl) {
        // Agent returned an auth URL - open it for the user
        setGmailStatus('unknown')
        setGmailError(null)
        setStatusMessage({ text: 'Opening Gmail authorization window. Please authorize access, then click "Connect Gmail" again.', type: 'info' })
        window.open(authUrl, '_blank', 'noopener,noreferrer')
        setGmailConnecting(false)
        return
      }

      const data = parseAgentResult(result)
      if (data || result?.success) {
        // Check if the response message itself mentions needing auth
        const msgText = (data?.message ?? data?.text ?? result?.response?.message ?? '').toLowerCase()
        if (msgText.includes('authenticate') || msgText.includes('authorize') || msgText.includes('permission') || msgText.includes('connect your') || msgText.includes('not connected')) {
          setGmailStatus('unknown')
          setGmailError('Gmail authorization may be needed. The agent reported: ' + (data?.message ?? data?.text ?? 'authorization required'))
          setStatusMessage({ text: 'Gmail needs authorization. Check the message below.', type: 'info' })
        } else {
          setGmailStatus('connected')
          setGmailError(null)
          setStatusMessage({ text: data?.message ?? 'Gmail connected successfully', type: 'success' })
        }
      } else {
        const errorMsg = result?.error ?? result?.response?.message ?? ''
        const rawResponse = result?.raw_response ?? ''

        // Check raw response for auth URLs too
        const rawAuthUrl = extractAuthUrl(errorMsg + ' ' + rawResponse)
        if (rawAuthUrl) {
          setGmailStatus('unknown')
          setGmailError(null)
          setStatusMessage({ text: 'Opening Gmail authorization window. Please authorize, then click "Connect Gmail" again.', type: 'info' })
          window.open(rawAuthUrl, '_blank', 'noopener,noreferrer')
        } else if (errorMsg.toLowerCase().includes('auth') || errorMsg.toLowerCase().includes('connect') || errorMsg.toLowerCase().includes('permission')) {
          setGmailStatus('unknown')
          setGmailError('Gmail authorization is required. Please try clicking "Connect Gmail" again -- the agent should provide an authorization link.')
        } else {
          setGmailStatus('error')
          setGmailError(errorMsg || 'Failed to connect. Please try again.')
        }
        setStatusMessage({ text: errorMsg || 'Gmail connection issue detected', type: 'error' })
      }
    } catch (err) {
      setGmailStatus('error')
      const msg = err instanceof Error ? err.message : 'Connection failed'
      setGmailError(msg)
      setStatusMessage({ text: msg, type: 'error' })
    }
    setGmailConnecting(false)
  }

  // ---- Derived data ----
  const filteredFollowUps = followUpItems.filter(item => {
    if (categoryFilter === 'all') return true
    return item?.category?.toLowerCase() === categoryFilter
  })

  const catSummary = followUpResponse?.categories_summary ?? {}

  const displayEmails = showSampleData ? SAMPLE_EMAILS : emails

  return (
    <ErrorBoundary>
      <TooltipProvider>
        <div className="min-h-screen bg-gradient-page text-foreground font-sans tracking-tight">
          {/* ---- Top Navigation ---- */}
          <header className="sticky top-0 z-50 glass-card border-b border-border">
            <div className="max-w-[1600px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-[0.875rem] bg-primary flex items-center justify-center">
                  <HiOutlineEnvelope className="h-5 w-5 text-primary-foreground" />
                </div>
                <h1 className="text-lg font-semibold text-foreground hidden sm:block">Gmail Intelligence Hub</h1>
              </div>

              <nav className="flex items-center gap-1">
                {[
                  { key: 'inbox', label: 'Inbox View', icon: <HiOutlineInboxStack className="h-4 w-4" /> },
                  { key: 'followup', label: 'Follow-Up Hub', icon: <HiOutlineBell className="h-4 w-4" /> },
                  { key: 'settings', label: 'Settings', icon: <HiOutlineCog6Tooth className="h-4 w-4" /> },
                ].map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key as any)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-[0.875rem] text-sm font-medium transition-all duration-200 ${activeTab === tab.key ? 'bg-primary text-primary-foreground shadow-md' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`}
                  >
                    {tab.icon}
                    <span className="hidden md:inline">{tab.label}</span>
                  </button>
                ))}
              </nav>

              <div className="flex items-center gap-3">
                <Label htmlFor="sample-toggle" className="text-xs text-muted-foreground hidden sm:block">Sample Data</Label>
                <Switch id="sample-toggle" checked={showSampleData} onCheckedChange={setShowSampleData} />
              </div>
            </div>
          </header>

          {/* ---- Status Bar ---- */}
          <div className="max-w-[1600px] mx-auto px-4 sm:px-6 mt-2">
            <StatusBar statusMessage={statusMessage} onDismiss={() => setStatusMessage(null)} />
          </div>

          {/* ---- Tab Content ---- */}
          <main className="max-w-[1600px] mx-auto px-4 sm:px-6 py-4">
            {/* ==== INBOX VIEW ==== */}
            {activeTab === 'inbox' && (
              <div className="flex gap-4 h-[calc(100vh-140px)]">
                {/* Email List Panel */}
                <div className="w-full md:w-[30%] flex flex-col glass-card rounded-[0.875rem] shadow-md overflow-hidden">
                  <div className="p-3 border-b border-border space-y-2">
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <HiOutlineMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Search Gmail..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleFetchEmails()}
                          className="pl-9 rounded-[0.875rem] bg-secondary/50"
                        />
                      </div>
                    </div>
                    <Button onClick={handleFetchEmails} disabled={fetchingEmails} className="w-full rounded-[0.875rem]" size="sm">
                      {fetchingEmails ? <FiLoader className="h-4 w-4 animate-spin mr-2" /> : <HiOutlineArrowPath className="h-4 w-4 mr-2" />}
                      Fetch Emails
                    </Button>
                  </div>

                  <ScrollArea className="flex-1">
                    {fetchingEmails ? (
                      <EmailSkeleton />
                    ) : displayEmails.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                        <HiOutlineInboxStack className="h-12 w-12 text-muted-foreground/40 mb-3" />
                        <p className="text-sm font-medium text-muted-foreground">No emails loaded</p>
                        {gmailStatus !== 'connected' ? (
                          <div className="mt-3 space-y-2">
                            <p className="text-xs text-muted-foreground/70">Connect your Gmail account first to fetch emails</p>
                            <Button size="sm" className="rounded-[0.875rem]" onClick={handleConnectGmail} disabled={gmailConnecting}>
                              {gmailConnecting ? <FiLoader className="h-3 w-3 animate-spin mr-1" /> : <HiOutlineEnvelope className="h-3 w-3 mr-1" />}
                              {gmailConnecting ? 'Connecting...' : 'Connect Gmail'}
                            </Button>
                            <p className="text-xs text-muted-foreground/50 mt-1">Or turn on "Sample Data" in the header to preview the app</p>
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground/70 mt-1">Click "Fetch Emails" to load your inbox, or turn on Sample Data</p>
                        )}
                      </div>
                    ) : (
                      <div className="divide-y divide-border">
                        {displayEmails.map(email => (
                          <button
                            key={email.id}
                            onClick={() => handleSelectEmail(email)}
                            className={`w-full text-left p-3 hover:bg-secondary/50 transition-colors ${selectedEmail?.id === email.id ? 'bg-secondary' : ''}`}
                          >
                            <div className="flex items-start gap-2">
                              {email.isUnread && <div className="h-2 w-2 rounded-full bg-blue-500 mt-2 flex-shrink-0" />}
                              <div className="min-w-0 flex-1">
                                <p className={`text-sm truncate ${email.isUnread ? 'font-semibold' : 'font-medium'}`}>{email.sender?.split('<')[0]?.trim() ?? 'Unknown'}</p>
                                <p className="text-sm text-foreground truncate">{email.subject}</p>
                                <p className="text-xs text-muted-foreground truncate mt-0.5">{email.snippet}</p>
                              </div>
                              <span className="text-xs text-muted-foreground flex-shrink-0 ml-2">{email.timestamp}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </div>

                {/* Thread Reading Pane */}
                <div className={`flex-1 flex flex-col glass-card rounded-[0.875rem] shadow-md overflow-hidden ${copilotOpen ? 'hidden lg:flex' : ''}`}>
                  {selectedEmail ? (
                    <>
                      <div className="p-4 border-b border-border">
                        <div className="flex items-start justify-between">
                          <div className="min-w-0 flex-1">
                            <h2 className="text-lg font-semibold text-foreground truncate">{selectedEmail.subject}</h2>
                            <div className="flex items-center gap-2 mt-1">
                              <HiOutlineUserCircle className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm text-muted-foreground">{selectedEmail.sender}</span>
                            </div>
                            <span className="text-xs text-muted-foreground">{selectedEmail.timestamp}</span>
                          </div>
                        </div>
                        <div className="flex gap-2 mt-3">
                          <Button onClick={handleOpenCopilot} size="sm" className="rounded-[0.875rem]">
                            <HiOutlineSparkles className="h-4 w-4 mr-1" /> Open Copilot
                          </Button>
                          <Button variant="outline" size="sm" className="rounded-[0.875rem]" onClick={() => {
                            setStatusMessage({ text: 'Email flagged for follow-up', type: 'success' })
                          }}>
                            <HiOutlineFlag className="h-4 w-4 mr-1" /> Flag for Follow-Up
                          </Button>
                        </div>
                      </div>

                      <ScrollArea className="flex-1 p-4">
                        {fetchingThread ? (
                          <div className="space-y-3">
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-3/4" />
                            <Skeleton className="h-4 w-5/6" />
                            <Skeleton className="h-4 w-2/3" />
                          </div>
                        ) : threadContent ? (
                          <div className="prose prose-sm max-w-none text-foreground">{renderMarkdown(threadContent)}</div>
                        ) : (
                          <div className="text-sm text-muted-foreground leading-relaxed">{selectedEmail.snippet}</div>
                        )}
                      </ScrollArea>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-center px-8">
                      <HiOutlineEye className="h-16 w-16 text-muted-foreground/30 mb-4" />
                      <p className="text-lg font-medium text-muted-foreground">Select an email to view the thread</p>
                      <p className="text-sm text-muted-foreground/70 mt-1">Choose an email from the list on the left</p>
                    </div>
                  )}
                </div>

                {/* Copilot Chat Panel */}
                {copilotOpen && (
                  <div className="w-full lg:w-[35%] flex flex-col glass-card rounded-[0.875rem] shadow-md overflow-hidden">
                    <div className="p-3 border-b border-border flex items-center justify-between bg-primary/5">
                      <div className="flex items-center gap-2">
                        <HiOutlineSparkles className="h-5 w-5 text-primary" />
                        <h3 className="text-sm font-semibold">Email Copilot</h3>
                      </div>
                      <button onClick={() => setCopilotOpen(false)} className="p-1 rounded-lg hover:bg-secondary">
                        <HiOutlineXMark className="h-4 w-4" />
                      </button>
                    </div>

                    {/* Draft Display */}
                    {currentDraft?.draft_body && (
                      <div className="p-3 border-b border-border bg-secondary/30">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Draft Reply</span>
                          <div className="flex items-center gap-1">
                            {currentDraft.tone && (
                              <Badge variant="outline" className="text-xs">{currentDraft.tone}</Badge>
                            )}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button onClick={() => { setEditingDraft(!editingDraft); setDraftEdit(currentDraft.draft_body ?? '') }} className="p-1 rounded hover:bg-secondary">
                                  <HiOutlinePencilSquare className="h-3.5 w-3.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>Edit draft</TooltipContent>
                            </Tooltip>
                          </div>
                        </div>
                        {currentDraft.draft_subject && (
                          <p className="text-xs font-medium text-foreground mb-1">Subject: {currentDraft.draft_subject}</p>
                        )}
                        {editingDraft ? (
                          <Textarea
                            value={draftEdit}
                            onChange={(e) => setDraftEdit(e.target.value)}
                            rows={6}
                            className="text-sm rounded-[0.875rem] bg-background"
                          />
                        ) : (
                          <ScrollArea className="max-h-40">
                            <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{currentDraft.draft_body}</div>
                          </ScrollArea>
                        )}
                        <div className="flex gap-2 mt-2">
                          <Button size="sm" className="rounded-[0.875rem] text-xs" onClick={handleSendReply} disabled={copilotLoading}>
                            <HiOutlinePaperAirplane className="h-3 w-3 mr-1" /> Send
                          </Button>
                          <Button size="sm" variant="outline" className="rounded-[0.875rem] text-xs" onClick={handleCopyDraft}>
                            {copiedField === 'draft' ? <FiCheck className="h-3 w-3 mr-1" /> : <FiCopy className="h-3 w-3 mr-1" />}
                            {copiedField === 'draft' ? 'Copied' : 'Copy'}
                          </Button>
                        </div>

                        {/* Suggested Actions */}
                        {Array.isArray(currentDraft.suggested_actions) && currentDraft.suggested_actions.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-border">
                            <p className="text-xs text-muted-foreground mb-1">Suggested:</p>
                            <div className="flex flex-wrap gap-1">
                              {currentDraft.suggested_actions.map((action, i) => (
                                <button
                                  key={i}
                                  onClick={() => { setChatInput(action); }}
                                  className="text-xs px-2 py-1 rounded-full bg-secondary text-secondary-foreground hover:bg-accent transition-colors"
                                >
                                  {action}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Chat Messages */}
                    <ScrollArea className="flex-1">
                      <div ref={chatScrollRef} className="p-3 space-y-3">
                        {chatMessages.length === 0 && !copilotLoading && (
                          <div className="text-center py-8 text-muted-foreground">
                            <HiOutlineChatBubbleLeftRight className="h-8 w-8 mx-auto mb-2 opacity-40" />
                            <p className="text-sm">Generating your draft...</p>
                          </div>
                        )}
                        {chatMessages.map((msg, i) => (
                          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[85%] rounded-[0.875rem] px-3 py-2 text-sm ${msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'}`}>
                              {renderMarkdown(msg.content)}
                            </div>
                          </div>
                        ))}
                        {copilotLoading && (
                          <div className="flex justify-start">
                            <div className="bg-secondary rounded-[0.875rem] px-4 py-3">
                              <div className="flex items-center gap-2">
                                <FiLoader className="h-4 w-4 animate-spin text-primary" />
                                <span className="text-sm text-muted-foreground">Thinking...</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </ScrollArea>

                    {/* Chat Input */}
                    <div className="p-3 border-t border-border">
                      <div className="flex gap-2">
                        <Input
                          value={chatInput}
                          onChange={(e) => setChatInput(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleCopilotSend()}
                          placeholder="Refine the draft..."
                          className="rounded-[0.875rem] bg-secondary/50"
                        />
                        <Button size="sm" onClick={handleCopilotSend} disabled={!chatInput.trim() || copilotLoading} className="rounded-[0.875rem]">
                          <FiSend className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ==== FOLLOW-UP HUB ==== */}
            {activeTab === 'followup' && (
              <div className="space-y-4">
                {/* Category Filter Bar */}
                <Card className="glass-card rounded-[0.875rem] shadow-md">
                  <CardContent className="p-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => setCategoryFilter('all')}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${categoryFilter === 'all' ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-secondary text-secondary-foreground hover:bg-accent'}`}
                        >
                          <HiOutlineArchiveBox className="h-4 w-4" />
                          All
                          {(followUpResponse?.total_count ?? 0) > 0 && (
                            <Badge variant="secondary" className="ml-1 text-xs h-5 min-w-[20px] flex items-center justify-center">{followUpResponse?.total_count ?? 0}</Badge>
                          )}
                        </button>
                        {[
                          { key: 'unanswered', label: 'Unanswered', icon: <HiOutlineInboxStack className="h-4 w-4" />, count: catSummary?.unanswered },
                          { key: 'commitments', label: 'Commitments', icon: <HiOutlineCheckCircle className="h-4 w-4" />, count: catSummary?.commitments },
                          { key: 'questions', label: 'Questions', icon: <HiOutlineQuestionMarkCircle className="h-4 w-4" />, count: catSummary?.questions },
                          { key: 'flagged', label: 'Flagged', icon: <HiOutlineFlag className="h-4 w-4" />, count: catSummary?.flagged },
                        ].map(cat => (
                          <button
                            key={cat.key}
                            onClick={() => setCategoryFilter(cat.key)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${categoryFilter === cat.key ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-secondary text-secondary-foreground hover:bg-accent'}`}
                          >
                            {cat.icon}
                            <span className="hidden sm:inline">{cat.label}</span>
                            {(cat.count ?? 0) > 0 && (
                              <Badge variant="secondary" className="ml-1 text-xs h-5 min-w-[20px] flex items-center justify-center">{cat.count}</Badge>
                            )}
                          </button>
                        ))}
                      </div>

                      <div className="ml-auto">
                        <Button onClick={handleScanFollowUps} disabled={scanningFollowUps} className="rounded-[0.875rem]">
                          {scanningFollowUps ? <FiLoader className="h-4 w-4 animate-spin mr-2" /> : <HiOutlineMagnifyingGlass className="h-4 w-4 mr-2" />}
                          Scan Now
                        </Button>
                      </div>
                    </div>

                    {followUpResponse?.scan_timestamp && (
                      <p className="text-xs text-muted-foreground mt-2">
                        <HiOutlineClock className="h-3 w-3 inline mr-1" />
                        Last scanned: {new Date(followUpResponse.scan_timestamp).toLocaleString()}
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* Follow-Up Cards */}
                {scanningFollowUps ? (
                  <FollowUpSkeleton />
                ) : filteredFollowUps.length === 0 ? (
                  <Card className="glass-card rounded-[0.875rem] shadow-md">
                    <CardContent className="py-16 text-center">
                      <HiOutlineBell className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
                      <p className="text-lg font-medium text-muted-foreground">No follow-ups found</p>
                      {gmailStatus !== 'connected' ? (
                        <div className="mt-3 space-y-2">
                          <p className="text-sm text-muted-foreground/70">Connect your Gmail account first to scan for follow-ups</p>
                          <Button size="sm" className="rounded-[0.875rem]" onClick={handleConnectGmail} disabled={gmailConnecting}>
                            {gmailConnecting ? <FiLoader className="h-3 w-3 animate-spin mr-1" /> : <HiOutlineEnvelope className="h-3 w-3 mr-1" />}
                            {gmailConnecting ? 'Connecting...' : 'Connect Gmail'}
                          </Button>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground/70 mt-1">Click "Scan Now" to check your inbox for emails needing follow-up</p>
                      )}
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filteredFollowUps.map((item, idx) => {
                      const catColor = getCategoryColor(item?.category ?? '')
                      const isThisSending = sendingFollowUp === item.thread_id
                      return (
                        <Card key={item.thread_id ?? idx} className="glass-card rounded-[0.875rem] shadow-md hover:shadow-lg transition-shadow">
                          <CardContent className="p-4 space-y-3">
                            {/* Header */}
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <h3 className="font-semibold text-sm text-foreground truncate">{item.email_subject ?? 'Untitled'}</h3>
                                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                  <HiOutlineUserCircle className="h-3 w-3" />
                                  {item.sender ?? 'Unknown'}
                                </p>
                              </div>
                              <Badge className={`text-xs flex-shrink-0 ${catColor}`}>
                                {getCategoryIcon(item?.category ?? '')}
                                <span className="ml-1 capitalize">{item?.category ?? 'General'}</span>
                              </Badge>
                            </div>

                            {/* Reason */}
                            {item.reason && (
                              <p className="text-sm text-foreground/80 leading-relaxed">{item.reason}</p>
                            )}

                            {/* Meta row */}
                            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <HiOutlineClock className="h-3 w-3" />
                                {(item.days_waiting ?? 0)} days waiting
                              </span>
                              {item.last_activity && (
                                <span>Last activity: {new Date(item.last_activity).toLocaleDateString()}</span>
                              )}
                              {item.has_reminder && (
                                <Badge variant="outline" className="text-xs">
                                  <HiOutlineBell className="h-3 w-3 mr-1" />
                                  {item.reminder_date ? new Date(item.reminder_date).toLocaleDateString() : 'Reminder set'}
                                </Badge>
                              )}
                            </div>

                            {/* Draft Preview */}
                            {item.draft_content && (
                              <div className="bg-secondary/50 rounded-lg p-3 border border-border">
                                <p className="text-xs font-medium text-muted-foreground mb-1">Draft Follow-Up:</p>
                                <p className="text-sm text-foreground leading-relaxed line-clamp-3">{item.draft_content}</p>
                              </div>
                            )}

                            {/* Actions */}
                            <div className="flex flex-wrap gap-2 pt-1">
                              <Button size="sm" className="rounded-[0.875rem] text-xs" onClick={() => handleSendFollowUp(item)} disabled={isThisSending || !item.draft_content}>
                                {isThisSending ? <FiLoader className="h-3 w-3 animate-spin mr-1" /> : <HiOutlinePaperAirplane className="h-3 w-3 mr-1" />}
                                Send Follow-Up
                              </Button>
                              <Button size="sm" variant="outline" className="rounded-[0.875rem] text-xs" onClick={() => handleRefineWithCopilot(item)}>
                                <HiOutlineSparkles className="h-3 w-3 mr-1" /> Refine with Copilot
                              </Button>
                              {/* Set Reminder */}
                              <div className="flex items-center gap-1">
                                <Input
                                  type="date"
                                  value={reminderDates[item.thread_id ?? ''] ?? ''}
                                  onChange={(e) => setReminderDates(prev => ({ ...prev, [item.thread_id ?? '']: e.target.value }))}
                                  className="h-8 text-xs rounded-[0.875rem] w-36"
                                />
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="rounded-[0.875rem] text-xs h-8"
                                  onClick={() => {
                                    const date = reminderDates[item.thread_id ?? '']
                                    if (date) setStatusMessage({ text: `Reminder set for ${new Date(date).toLocaleDateString()}`, type: 'success' })
                                  }}
                                >
                                  <HiOutlineBell className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      )
                    })}
                  </div>
                )}

                {/* Follow-Up Response Summary */}
                {followUpResponse?.message && !scanningFollowUps && (
                  <Card className="glass-card rounded-[0.875rem] shadow-md">
                    <CardContent className="p-4">
                      <div className="text-sm text-foreground">{renderMarkdown(followUpResponse.message)}</div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {/* ==== SETTINGS ==== */}
            {activeTab === 'settings' && (
              <div className="max-w-2xl mx-auto space-y-4">
                {/* Gmail Connection */}
                <Card className="glass-card rounded-[0.875rem] shadow-md">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <HiOutlineSignal className="h-5 w-5" /> Gmail Connection
                    </CardTitle>
                    <CardDescription>Connect your Gmail account to enable email fetching, drafting, and sending</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Connection Status */}
                    <div className="flex items-center gap-3">
                      {gmailStatus === 'connected' ? (
                        <Badge className="bg-green-100 text-green-800 border-green-200 rounded-full">
                          <FiCheck className="h-3 w-3 mr-1" /> Connected
                        </Badge>
                      ) : gmailStatus === 'connecting' ? (
                        <Badge className="bg-blue-100 text-blue-800 border-blue-200 rounded-full">
                          <FiLoader className="h-3 w-3 mr-1 animate-spin" /> Connecting...
                        </Badge>
                      ) : gmailStatus === 'error' ? (
                        <Badge className="bg-red-100 text-red-800 border-red-200 rounded-full">
                          <FiX className="h-3 w-3 mr-1" /> Error
                        </Badge>
                      ) : (
                        <Badge className="bg-amber-100 text-amber-800 border-amber-200 rounded-full">
                          <HiOutlineSignal className="h-3 w-3 mr-1" /> Not Connected
                        </Badge>
                      )}
                      <span className="text-sm text-muted-foreground">
                        {gmailStatus === 'connected' ? 'Gmail API is connected and ready' :
                         gmailStatus === 'connecting' ? 'Establishing Gmail connection...' :
                         gmailStatus === 'error' ? 'Connection failed' :
                         'Click below to connect your Gmail account'}
                      </span>
                    </div>

                    {/* Error message */}
                    {gmailError && (
                      <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                        {gmailError}
                      </div>
                    )}

                    {/* Connection instructions */}
                    {gmailStatus !== 'connected' && (
                      <div className="bg-secondary/50 rounded-[0.875rem] p-4 space-y-3">
                        <p className="text-sm font-medium text-foreground">How Gmail connection works:</p>
                        <div className="space-y-2">
                          <div className="flex items-start gap-2">
                            <div className="h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs flex-shrink-0 mt-0.5">1</div>
                            <p className="text-sm text-muted-foreground">Click "Connect Gmail" below -- this triggers the AI agent to access Gmail via Composio</p>
                          </div>
                          <div className="flex items-start gap-2">
                            <div className="h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs flex-shrink-0 mt-0.5">2</div>
                            <p className="text-sm text-muted-foreground">A new window will open for Google OAuth authorization -- sign in and grant access</p>
                          </div>
                          <div className="flex items-start gap-2">
                            <div className="h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs flex-shrink-0 mt-0.5">3</div>
                            <p className="text-sm text-muted-foreground">After authorizing, come back here and click "Connect Gmail" again to verify the connection</p>
                          </div>
                          <div className="flex items-start gap-2">
                            <div className="h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs flex-shrink-0 mt-0.5">4</div>
                            <p className="text-sm text-muted-foreground">Once connected, all features (Fetch, Copilot, Follow-Up, Schedule) will work automatically</p>
                          </div>
                        </div>
                        <div className="mt-2 p-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
                          <HiOutlineBell className="h-3 w-3 inline mr-1" />
                          <strong>Note:</strong> If no authorization window opens, check your browser&apos;s popup blocker settings and allow popups from this site.
                        </div>
                      </div>
                    )}

                    {/* Connect / Reconnect Button */}
                    <div className="flex gap-2">
                      <Button
                        onClick={handleConnectGmail}
                        disabled={gmailConnecting}
                        className="rounded-[0.875rem]"
                        variant={gmailStatus === 'connected' ? 'outline' : 'default'}
                      >
                        {gmailConnecting ? (
                          <FiLoader className="h-4 w-4 animate-spin mr-2" />
                        ) : gmailStatus === 'connected' ? (
                          <FiRefreshCw className="h-4 w-4 mr-2" />
                        ) : (
                          <HiOutlineEnvelope className="h-4 w-4 mr-2" />
                        )}
                        {gmailStatus === 'connected' ? 'Reconnect Gmail' : gmailConnecting ? 'Connecting...' : 'Connect Gmail'}
                      </Button>
                      {gmailStatus === 'connected' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="rounded-[0.875rem]"
                          onClick={() => { setActiveTab('inbox'); }}
                        >
                          <HiOutlineInboxStack className="h-4 w-4 mr-1" /> Go to Inbox
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Copilot Settings */}
                <Card className="glass-card rounded-[0.875rem] shadow-md">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <HiOutlineSparkles className="h-5 w-5" /> Copilot Settings
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>Default Tone</Label>
                      <Select value={settings.tone} onValueChange={(v) => setSettings(prev => ({ ...prev, tone: v }))}>
                        <SelectTrigger className="rounded-[0.875rem]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="professional">Professional</SelectItem>
                          <SelectItem value="assertive">Assertive</SelectItem>
                          <SelectItem value="friendly">Friendly</SelectItem>
                          <SelectItem value="casual">Casual</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center justify-between">
                      <Label>Auto-Save Drafts</Label>
                      <Switch checked={settings.autoSaveDraft} onCheckedChange={(v) => setSettings(prev => ({ ...prev, autoSaveDraft: v }))} />
                    </div>
                  </CardContent>
                </Card>

                {/* Follow-Up Rules */}
                <Card className="glass-card rounded-[0.875rem] shadow-md">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <HiOutlineAdjustmentsHorizontal className="h-5 w-5" /> Follow-Up Rules
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>Unanswered Threshold (days)</Label>
                      <Input
                        type="number"
                        min={1}
                        max={30}
                        value={settings.unansweredDays}
                        onChange={(e) => setSettings(prev => ({ ...prev, unansweredDays: parseInt(e.target.value) || 3 }))}
                        className="rounded-[0.875rem] w-24"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Commitment Detection</Label>
                        <p className="text-xs text-muted-foreground">Detect emails where you made commitments</p>
                      </div>
                      <Switch checked={settings.commitmentDetection} onCheckedChange={(v) => setSettings(prev => ({ ...prev, commitmentDetection: v }))} />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Question Detection</Label>
                        <p className="text-xs text-muted-foreground">Detect unanswered questions directed at you</p>
                      </div>
                      <Switch checked={settings.questionDetection} onCheckedChange={(v) => setSettings(prev => ({ ...prev, questionDetection: v }))} />
                    </div>
                  </CardContent>
                </Card>

                {/* Schedule Management */}
                <Card className="glass-card rounded-[0.875rem] shadow-md">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <HiOutlineCalendarDays className="h-5 w-5" /> Follow-Up Scanner Schedule
                    </CardTitle>
                    <CardDescription>Automated daily inbox scan for follow-up items</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {scheduleLoading ? (
                      <div className="space-y-3">
                        <Skeleton className="h-5 w-1/2" />
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-8 w-32" />
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between">
                          <div className="space-y-1">
                            <p className="text-sm font-medium">Schedule</p>
                            <p className="text-sm text-muted-foreground">
                              {schedule?.cron_expression ? cronToHuman(schedule.cron_expression) : 'Every day at 8:00'} (America/New_York)
                            </p>
                          </div>
                          <Badge className={schedule?.is_active ? 'bg-green-100 text-green-800 border-green-200' : 'bg-gray-100 text-gray-600 border-gray-200'}>
                            {schedule?.is_active ? 'Active' : 'Paused'}
                          </Badge>
                        </div>

                        {schedule?.next_run_time && (
                          <p className="text-xs text-muted-foreground">
                            Next run: {new Date(schedule.next_run_time).toLocaleString()}
                          </p>
                        )}

                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant={schedule?.is_active ? 'outline' : 'default'}
                            className="rounded-[0.875rem]"
                            onClick={handleToggleSchedule}
                            disabled={scheduleActionLoading}
                          >
                            {scheduleActionLoading ? (
                              <FiLoader className="h-4 w-4 animate-spin mr-1" />
                            ) : schedule?.is_active ? (
                              <HiOutlinePause className="h-4 w-4 mr-1" />
                            ) : (
                              <HiOutlinePlay className="h-4 w-4 mr-1" />
                            )}
                            {schedule?.is_active ? 'Pause Schedule' : 'Resume Schedule'}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-[0.875rem]"
                            onClick={handleTriggerNow}
                            disabled={scheduleActionLoading}
                          >
                            <FiZap className="h-4 w-4 mr-1" /> Run Now
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="rounded-[0.875rem]"
                            onClick={loadSchedule}
                            disabled={scheduleLoading}
                          >
                            <FiRefreshCw className="h-4 w-4" />
                          </Button>
                        </div>

                        {/* Execution Logs */}
                        {scheduleLogs.length > 0 && (
                          <div className="pt-2 border-t border-border">
                            <p className="text-sm font-medium mb-2">Recent Executions</p>
                            <div className="space-y-2">
                              {scheduleLogs.map((log) => (
                                <div key={log.id} className="flex items-center justify-between text-xs p-2 rounded-lg bg-secondary/50">
                                  <div className="flex items-center gap-2">
                                    {log.success ? (
                                      <FiCheck className="h-3 w-3 text-green-600" />
                                    ) : (
                                      <FiX className="h-3 w-3 text-red-600" />
                                    )}
                                    <span className="text-muted-foreground">{new Date(log.executed_at).toLocaleString()}</span>
                                  </div>
                                  <Badge variant="outline" className="text-xs">
                                    {log.success ? 'Success' : 'Failed'}
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>

                {/* Agent Info */}
                <Card className="glass-card rounded-[0.875rem] shadow-md">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <FiActivity className="h-5 w-5" /> Agents
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {[
                        { id: COPILOT_AGENT_ID, name: 'Email Copilot Agent', desc: 'Drafts replies, sends emails, summarizes threads' },
                        { id: FOLLOW_UP_AGENT_ID, name: 'Follow-Up Tracker Agent', desc: 'Scans inbox for emails needing follow-up' },
                      ].map(agent => (
                        <div key={agent.id} className="flex items-center gap-3 p-2 rounded-lg bg-secondary/30">
                          <div className={`h-2 w-2 rounded-full flex-shrink-0 ${activeAgentId === agent.id ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`} />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{agent.name}</p>
                            <p className="text-xs text-muted-foreground">{agent.desc}</p>
                          </div>
                          {activeAgentId === agent.id && (
                            <Badge variant="outline" className="text-xs flex-shrink-0">Active</Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </main>

          {/* Agent Activity Panel */}
          <AgentActivityPanel {...agentActivity} />
        </div>
      </TooltipProvider>
    </ErrorBoundary>
  )
}
