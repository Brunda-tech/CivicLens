import React, { useState } from 'react';
import { Bot, Loader2, Send, Sparkles, User as UserIcon } from 'lucide-react';
import { api } from '../services/api';
import { useLanguage } from '../context/LanguageContext';
import { useToast } from '../context/ToastContext';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

export function AiAssistantPage() {
  const { t } = useLanguage();
  const { pushToast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const sendQuestion = async (questionText: string) => {
    const trimmed = questionText.trim();
    if (!trimmed || loading) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: trimmed,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await api.askAssistant(trimmed);
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          text: res.answer,
        },
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to query AI Municipal Assistant.';
      pushToast('Assistant error', msg, 'error');
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          text: `Error: ${msg}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendQuestion(input);
  };

  const displayedMessages: ChatMessage[] = [
    {
      id: 'welcome',
      role: 'assistant',
      text: t.assistantWelcome,
    },
    ...messages,
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-950 font-display">
          {t.assistantTitle}
        </h1>
        <p className="text-sm text-slate-600 mt-0.5">
          {t.assistantSubtitle}
        </p>
      </div>

      {/* Quick Executive Prompts */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <p className="text-xs font-semibold text-slate-700 mb-2.5 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-blue-600" />
          <span>{t.assistantBriefingsTitle}</span>
        </p>
        <div className="flex flex-wrap gap-2">
          {t.assistantPrompts.map((q) => (
            <button
              key={q}
              type="button"
              disabled={loading}
              onClick={() => sendQuestion(q)}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-blue-50 hover:text-blue-700 border border-slate-200 hover:border-blue-200 rounded-lg transition-colors text-left"
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Chat Container */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col min-h-[460px] max-h-[620px]">
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {displayedMessages.map((m) => (
            <div
              key={m.id}
              className={`flex items-start gap-3 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {m.role === 'assistant' && (
                <div className="w-8 h-8 rounded-lg bg-slate-950 text-white flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4" />
                </div>
              )}

              <div
                className={`max-w-[82%] rounded-xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-50 border border-slate-200 text-slate-800'
                }`}
              >
                {m.text}
              </div>

              {m.role === 'user' && (
                <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                  <UserIcon className="w-4 h-4" />
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-slate-950 text-white flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4" />
              </div>
              <div className="rounded-xl px-4 py-3 bg-slate-50 border border-slate-200 text-xs text-slate-600 inline-flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                <span>{t.assistantLoading}</span>
              </div>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="p-4 border-t border-slate-200 bg-slate-50/60 flex gap-2.5">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t.assistantPlaceholder}
            className="flex-1 px-4 py-2.5 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="px-4 py-2.5 text-sm font-semibold text-white bg-slate-950 hover:bg-slate-800 disabled:opacity-50 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Send className="w-4 h-4" />
            <span>{t.assistantAskBtn}</span>
          </button>
        </form>
      </div>
    </div>
  );
}

