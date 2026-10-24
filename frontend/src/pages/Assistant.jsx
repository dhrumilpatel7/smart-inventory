import { useEffect, useRef, useState } from 'react';
import { assistantApi, errorMessage } from '../services/api';
import { IconRefresh, IconSparkles } from '../components/Icons';
import AssistantMessage from '../components/AssistantMessage';

const STARTER_PROMPTS = [
  'Which products need attention right now?',
  'Summarize the latest forecast.',
  'What are the most urgent reorder recommendations?',
  'How have monthly sales been trending?',
];

export default function Assistant() {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [configured, setConfigured] = useState(null);
  const [error, setError] = useState('');
  const endRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    assistantApi.status()
      .then((status) => setConfigured(status.configured))
      .catch(() => setConfigured(false));
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, busy]);

  async function send(text = draft) {
    const content = text.trim();
    if (!content || busy) return;
    const previous = messages;
    setMessages((current) => [...current, { role: 'user', content }]);
    setDraft('');
    setError('');
    setBusy(true);
    try {
      const result = await assistantApi.chat({
        message: content,
        history: previous.slice(-8).map(({ role, content: messageContent }) => ({ role, content: messageContent })),
      });
      setMessages((current) => [...current, { role: 'assistant', content: result.answer }]);
    } catch (err) {
      setError(errorMessage(err, 'The Inventory Copilot could not answer. Please try again.'));
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  function clearConversation() {
    setMessages([]);
    setDraft('');
    setError('');
    inputRef.current?.focus();
  }

  return (
    <div className="assistant-page">
      <div className="page-head">
        <div>
          <h1>Inventory AI Copilot</h1>
          <p>Ask questions about your stock, sales, forecasts, and reorder recommendations.</p>
        </div>
        {messages.length > 0 && (
          <div className="page-actions">
            <button type="button" className="btn" onClick={clearConversation} disabled={busy}>
              <IconRefresh /> New conversation
            </button>
          </div>
        )}
      </div>

      {configured === false && (
        <div className="alert warn assistant-setup" role="status">
          <div>
          <strong>AI setup is required.</strong> Add your Google AI Studio key as <code>GEMINI_API_KEY</code> to the backend environment, then redeploy the backend.
          </div>
        </div>
      )}

      <section className="card assistant-card" aria-label="Inventory Copilot chat">
        <div className="assistant-chat-header">
          <div className="assistant-avatar"><IconSparkles /></div>
          <div>
            <h2>Smart Inventory Assistant</h2>
            <p>{configured ? 'Connected to your live inventory data' : 'Ready to help with inventory questions'}</p>
          </div>
          <span className={`assistant-status ${configured ? 'online' : ''}`}>
            <span /> {configured ? 'Online' : 'Setup needed'}
          </span>
        </div>

        <div className="assistant-transcript" aria-live="polite" aria-relevant="additions text">
          {messages.length === 0 ? (
            <div className="assistant-welcome">
              <div className="assistant-welcome-icon"><IconSparkles /></div>
              <h3>How can I help with your inventory?</h3>
              <p>I can explain what the live data says and help you understand what may need attention.</p>
              <div className="assistant-prompts">
                {STARTER_PROMPTS.map((prompt) => (
                  <button key={prompt} type="button" className="assistant-prompt" onClick={() => send(prompt)} disabled={busy}>
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="assistant-messages">
              {messages.map((message, index) => (
                <div className={`assistant-message ${message.role}`} key={`${index}-${message.role}`}>
                  {message.role === 'assistant' && <div className="assistant-message-avatar"><IconSparkles /></div>}
                  <div className="assistant-message-content">
                    <span className="assistant-message-label">{message.role === 'user' ? 'You' : 'Inventory Copilot'}</span>
                    <div className="assistant-message-bubble"><AssistantMessage content={message.content} /></div>
                  </div>
                </div>
              ))}
              {busy && (
                <div className="assistant-message assistant">
                  <div className="assistant-message-avatar"><IconSparkles /></div>
                  <div className="assistant-message-content">
                    <span className="assistant-message-label">Inventory Copilot</span>
                    <div className="assistant-message-bubble assistant-typing"><span /><span /><span /></div>
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>
          )}
        </div>

        <div className="assistant-composer-wrap">
          {error && <div className="alert error assistant-error" role="alert">{error}</div>}
          <form className="assistant-composer" onSubmit={(event) => { event.preventDefault(); send(); }}>
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  send();
                }
              }}
              placeholder="Ask about your inventory…"
              aria-label="Message the Inventory Copilot"
              maxLength={1200}
              rows={2}
              disabled={busy}
            />
            <button type="submit" className="btn btn-primary assistant-send" disabled={busy || !draft.trim()}>
              {busy ? 'Thinking…' : 'Send'}
            </button>
          </form>
          <div className="assistant-composer-foot">
            <span>Enter to send · Shift + Enter for a new line</span>
            <span>{draft.length}/1200</span>
          </div>
        </div>
      </section>

      <p className="assistant-privacy-note">
        Each message is sent to Google Gemini with recent chat turns and a limited live snapshot of inventory, sales, forecasts, and reorder data. Supplier contact details are excluded. Under Google’s free tier, submitted content may be used to improve Google products. The app does not save this conversation; it clears when you refresh or close this page.
      </p>
    </div>
  );
}
