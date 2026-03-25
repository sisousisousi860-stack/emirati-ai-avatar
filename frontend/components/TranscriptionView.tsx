import useCombinedTranscriptions from "@hooks/useCombinedTranscriptions";
import * as React from "react";

export default function TranscriptionView() {
  const combinedTranscriptions = useCombinedTranscriptions();
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [combinedTranscriptions]);

  return (
    <div ref={containerRef} className="h-full overflow-y-auto px-3 py-3 flex flex-col gap-2">
      {combinedTranscriptions.length === 0 && (
        <div className="flex-1 flex items-center justify-center text-white/20 text-xs">
          محادثة جديدة · New conversation
        </div>
      )}
      {combinedTranscriptions.map((segment) => {
        const isAssistant = segment.role === "assistant";
        const hasArabic = /[\u0600-\u06FF]/.test(segment.text);
        return (
          <div
            key={segment.id}
            className={`flex flex-col gap-0.5 max-w-[85%] ${isAssistant ? "self-start" : "self-end"}`}
          >
            <span
              className="text-[10px] px-1"
              style={{
                color: isAssistant ? "rgba(201,168,76,0.5)" : "rgba(96,165,250,0.5)",
                textAlign: isAssistant ? "left" : "right",
              }}
            >
              {isAssistant ? "الأفاتار الإماراتي" : "الزائر"}
            </span>
            <div
              className="px-3 py-2 text-sm leading-relaxed"
              style={{
                borderRadius: isAssistant
                  ? "4px 16px 16px 16px"
                  : "16px 4px 16px 16px",
                background: isAssistant
                  ? "rgba(201,168,76,0.1)"
                  : "rgba(59,130,246,0.12)",
                border: isAssistant
                  ? "1px solid rgba(201,168,76,0.18)"
                  : "1px solid rgba(59,130,246,0.18)",
                color: "rgba(255,255,255,0.85)",
                direction: hasArabic ? "rtl" : "ltr",
                textAlign: hasArabic ? "right" : "left",
              }}
            >
              {segment.text}
            </div>
          </div>
        );
      })}
    </div>
  );
}
