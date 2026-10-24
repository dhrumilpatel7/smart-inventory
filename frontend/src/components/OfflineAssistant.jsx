import { useEffect, useRef, useState } from 'react';
import { IconClose, IconSparkles } from './Icons';
import AssistantMessage from './AssistantMessage';

const SUGGESTIONS = ['How do I add a product?', 'How do I create a forecast?', 'Where can I review reorder suggestions?'];

function answerLocally(question) {
  const q = question.toLowerCase();
  if (/\b(hello|hi|hey|good morning|good afternoon)\b/.test(q)) return 'Hello! I’m the Offline Assistant. I can guide you around the dashboard without using an external AI service.';
  if (/\b(product|add item|new item|create item|edit item|catalog)\b/.test(q)) return 'Open **Products** from the left navigation. Use **Add product** to create an item, then enter its name, category, price, stock, minimum stock, and supplier details before saving.';
  if (/\b(sale|sales|revenue|record a sale)\b/.test(q)) return 'Open **Sales** to review recorded transactions or add a sale. The Dashboard and Analytics pages summarize sales over time. I cannot see live totals while offline.';
  if (/\b(forecast|prediction|demand|train|model)\b/.test(q)) return 'Open **Forecast** to review demand predictions. If the page offers a **Run forecast** action, use it to retrain from the sales data currently stored by the application. I cannot read live forecast results while offline.';
  if (/\b(reorder|restock|purchase order|buy)\b/.test(q)) return 'Open **Reorder** to review suggested quantities and priority levels. Recommendations are planning guidance; review each item before creating or updating a purchase order.';
  if (/\b(stock|inventory|low stock|out of stock|quantity)\b/.test(q)) return 'Open **Inventory** to review stock activity and **Products** for item details and stock thresholds. This offline assistant does not have access to live stock counts.';
  if (/\b(analytics|chart|graph|dashboard|overview)\b/.test(q)) return 'Use **Dashboard** for a high-level overview and **Analytics** for detailed charts and summaries. Use the available date or category filters to focus the view.';
  if (/\b(supplier|vendor)\b/.test(q)) return 'Open **Suppliers** to review supplier records and their details. You can manage supplier information there and link suppliers to products.';
  if (/\b(help|what can you do|how to use|features)\b/.test(q)) return 'I can guide you to Products, Sales, Inventory, Forecast, Reorder, Suppliers, and Analytics. Ask a how-to question, such as “How do I add a product?” I run locally and do not send your messages or business data anywhere.';
  return 'I’m an offline guide for using this website. I can help with pages and workflows, but I cannot look up live inventory numbers or answer general questions. Try asking how to add a product, review a forecast, or find reorder recommendations.';
}

export default function OfflineAssistant() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState([]);
  const transcriptRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: 'smooth' });
  }, [open, messages]);

  function send(text = draft) {
    const question = text.trim();
    if (!question) return;
    setMessages((current) => [...current, { role: 'user', content: question }, { role: 'assistant', content: answerLocally(question) }]);
    setDraft('');
  }

  if (!open) return <button className="offline-launcher" type="button" onClick={() => setOpen(true)} aria-label="Open offline assistant"><IconSparkles /><span>Help</span></button>;

  return (
    <section className="offline-assistant" aria-label="Offline assistant">
      <header className="offline-assistant-header">
        <div className="offline-assistant-brand"><div className="offline-assistant-avatar"><IconSparkles /></div><div><strong>Offline Assistant</strong><span><i /> Local help · no external AI</span></div></div>
        <button type="button" className="offline-assistant-control" onClick={() => setOpen(false)} aria-label="Minimize assistant" title="Minimize"><span /></button>
        <button type="button" className="offline-assistant-control" onClick={() => { setOpen(false); setMessages([]); setDraft(''); }} aria-label="Close assistant" title="Close"><IconClose /></button>
      </header>
      <div className="offline-assistant-transcript" ref={transcriptRef} aria-live="polite">
        {messages.length === 0 ? <div className="offline-assistant-welcome"><div className="offline-assistant-welcome-icon"><IconSparkles /></div><strong>How can I help?</strong><p>Ask about using the inventory dashboard. This assistant works locally and does not access live records.</p><div className="offline-assistant-suggestions">{SUGGESTIONS.map((prompt) => <button type="button" key={prompt} onClick={() => send(prompt)}>{prompt}</button>)}</div></div>
          : messages.map((message, index) => <div className={`offline-assistant-message ${message.role}`} key={index}>{message.role === 'assistant' ? <AssistantMessage content={message.content} /> : message.content}</div>)}
      </div>
      <form className="offline-assistant-composer" onSubmit={(event) => { event.preventDefault(); send(); }}>
        <input ref={inputRef} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Ask how to use the site…" aria-label="Message the offline assistant" maxLength={500} />
        <button type="submit" disabled={!draft.trim()} aria-label="Send message" title="Send"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12 20 4l-5 16-3-7-8-1Zm8 1 8-9" /></svg></button>
      </form>
      <div className="offline-assistant-foot">Works offline · Messages stay in this browser session</div>
    </section>
  );
}
