import React from 'react';
import ReactMarkdown from 'react-markdown';

/**
 * Componenta responsabila pentru interfata de chat a aplicatiei.
 * Gestioneaza randarea istoricului conversatiei si captarea input-ului utilizatorului.
 */
const StudyRoom = ({ messages, input, setInput, handleSendMessage, loading, username, messagesEndRef }) => {
  return (
    <div className="flex flex-col h-full w-full max-w-5xl mx-auto overflow-hidden">
      
      {/* Container afisare istoric mesaje (Scrollable viewport) */}
      <div className="flex-1 overflow-y-auto p-8 space-y-6 scrollbar-thin scrollbar-thumb-indigo-500/20">
        {messages.map((msg, index) => (
          <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in-up`}>
            <div className={`max-w-[80%] p-4 rounded-2xl shadow-lg ${
              msg.role === 'user' 
              ? 'bg-indigo-600 text-white rounded-tr-none' 
              : 'bg-[#1e293b] border border-white/5 text-slate-200 rounded-tl-none'
            }`}>
              {/* Parsare si randare format Markdown generat de LLM */}
              <ReactMarkdown className="prose prose-invert text-sm">{msg.text}</ReactMarkdown>
            </div>
          </div>
        ))}
        {/* Element de ancorare pentru functionalitatea de auto-scroll */}
        <div ref={messagesEndRef} />
      </div>

      {/* Container formular de input (Fixat la baza containerului parinte) */}
      <div className="flex-shrink-0 p-8 bg-gradient-to-t from-[#0B0F19] to-transparent">
        <form onSubmit={handleSendMessage} className="relative max-w-3xl mx-auto">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Pune o întrebare..."
            className="w-full bg-[#111827] border border-white/10 rounded-2xl px-6 py-4 focus:outline-none focus:border-indigo-500 transition-all shadow-2xl"
          />
          <button type="submit" disabled={loading} className="absolute right-3 top-2.5 bg-indigo-600 p-2 rounded-xl hover:bg-indigo-500 transition-colors">
            🚀
          </button>
        </form>
        <p className="text-[10px] text-center text-slate-600 mt-4">AI Tutor poate genera erori. Verifică sursele.</p>
      </div>
    </div>
  );
};

export default StudyRoom;