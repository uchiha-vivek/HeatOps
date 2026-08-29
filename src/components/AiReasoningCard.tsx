import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Bot } from 'lucide-react';

interface AiReasoningCardProps {
  reasoning: string[];
  // Mirrors RiskAnalysisResult.aiEnhanced. Undefined means "not reported"
  // (older cached analyses), which is treated as AI-authored to avoid
  // relabelling history; false means Gemini failed and these bullets came from
  // the deterministic engine.
  aiEnhanced?: boolean;
}

export const AiReasoningCard: React.FC<AiReasoningCardProps> = ({ reasoning, aiEnhanced }) => {
  // A "403 PERMISSION_DENIED" banner directly above a card badged "AI
  // Reasoning" reads as the app lying about its own provenance. When the AI is
  // down, say so on the card itself.
  const isDeterministic = aiEnhanced === false;
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div id="ai-reasoning-card" className="bg-white rounded-2xl border border-neutral-200 p-4 shadow-xs space-y-2">
      <button
        id="btn-toggle-ai-reasoning"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between text-left focus:outline-none cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-neutral-100 text-neutral-800 flex items-center justify-center font-bold text-xs border border-neutral-200">
            <Bot className="w-3.5 h-3.5" />
          </div>
          <h4 className="text-xs font-bold text-neutral-900 tracking-tight flex items-center gap-1.5">
            <span>Why this recommendation</span>
            <span
              className={`text-[10px] font-medium font-mono px-1.5 py-0.2 rounded ${
                isDeterministic
                  ? 'text-amber-800 bg-amber-100 border border-amber-200'
                  : 'text-neutral-500 bg-neutral-100'
              }`}
            >
              {isDeterministic ? 'Deterministic — AI unavailable' : 'AI Reasoning'}
            </span>
          </h4>
        </div>

        <div className="flex items-center gap-1 text-neutral-500 text-xs font-medium">
          <span>{isOpen ? ('Hide') : ('Show')}</span>
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {isOpen && (
        <div className="pt-2 border-t border-neutral-100 space-y-2 text-xs text-neutral-700 animate-fade-in">
          <ul className="space-y-1.5 pl-1">
            {reasoning.map((line, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-neutral-800 shrink-0 mt-1.5" />
                <span className="leading-relaxed">{line}</span>
              </li>
            ))}
          </ul>
          <p className="text-[10px] text-neutral-400 font-mono pt-1">
            Calculated using WBGT thermal strain formula & real-time satellite telemetry.
          </p>
        </div>
      )}
    </div>
  );
};
