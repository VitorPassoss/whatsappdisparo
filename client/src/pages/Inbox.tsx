import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Send, MessageSquare, Search, RefreshCw, User } from "lucide-react";
import { cn } from "@/lib/utils";

function formatTime(date: Date | string) {
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 86400000) {
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function formatPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 13) {
    return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 12) {
    return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 8)}-${digits.slice(8)}`;
  }
  return phone;
}

export default function Inbox() {
  const [selectedConvId, setSelectedConvId] = useState<number | null>(null);
  const [replyText, setReplyText] = useState("");
  const [search, setSearch] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const utils = trpc.useUtils();

  const { data: conversations = [], isLoading: loadingConvs, refetch: refetchConvs } =
    trpc.inbox.listConversations.useQuery(
      { sessionId: undefined },
      { refetchInterval: 5000 }
    );

  const { data: messages = [], isLoading: loadingMsgs } =
    trpc.inbox.getMessages.useQuery(
      { conversationId: selectedConvId! },
      { enabled: !!selectedConvId, refetchInterval: 3000 }
    );

  const replyMutation = trpc.inbox.reply.useMutation({
    onSuccess: () => {
      setReplyText("");
      utils.inbox.getMessages.invalidate({ conversationId: selectedConvId! });
      utils.inbox.listConversations.invalidate();
    },
  });

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const filteredConvs = conversations.filter((c) => {
    const q = search.toLowerCase();
    return (
      c.phone.includes(q) ||
      (c.contactName ?? "").toLowerCase().includes(q) ||
      (c.lastMessage ?? "").toLowerCase().includes(q)
    );
  });

  const selectedConv = conversations.find((c) => c.id === selectedConvId);

  const handleSend = () => {
    if (!replyText.trim() || !selectedConvId) return;
    replyMutation.mutate({ conversationId: selectedConvId, message: replyText.trim() });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <DashboardLayout>
      <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
        {/* Sidebar: conversation list */}
        <div className="w-80 flex-shrink-0 border-r border-border flex flex-col bg-card">
          {/* Header */}
          <div className="p-4 border-b border-border">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-foreground flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-primary" />
                Caixa de Entrada
              </h2>
              <Button
                variant="ghost"
                size="icon"
                className="w-7 h-7"
                onClick={() => refetchConvs()}
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </Button>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar conversa..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-sm bg-input border-border"
              />
            </div>
          </div>

          {/* Conversation list */}
          <div className="flex-1 overflow-y-auto">
            {loadingConvs ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                Carregando...
              </div>
            ) : filteredConvs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-center px-4">
                <MessageSquare className="w-10 h-10 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">Nenhuma conversa ainda</p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  As mensagens recebidas aparecerão aqui
                </p>
              </div>
            ) : (
              filteredConvs.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => setSelectedConvId(conv.id)}
                  className={cn(
                    "w-full text-left px-4 py-3 border-b border-border/50 hover:bg-accent/30 transition-colors",
                    selectedConvId === conv.id && "bg-accent/50 border-l-2 border-l-primary"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <User className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-sm font-medium text-foreground truncate">
                          {conv.contactName || formatPhone(conv.phone)}
                        </span>
                        <span className="text-xs text-muted-foreground flex-shrink-0 ml-2">
                          {formatTime(conv.lastMessageAt)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground truncate">
                          {conv.lastMessage || "Sem mensagens"}
                        </p>
                        {conv.unreadCount > 0 && (
                          <Badge className="ml-2 h-4 min-w-4 text-[10px] px-1 bg-primary text-primary-foreground flex-shrink-0">
                            {conv.unreadCount}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Chat area */}
        <div className="flex-1 flex flex-col bg-background">
          {!selectedConv ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
              <MessageSquare className="w-16 h-16 text-muted-foreground/20 mb-4" />
              <h3 className="text-lg font-medium text-muted-foreground mb-2">
                Selecione uma conversa
              </h3>
              <p className="text-sm text-muted-foreground/60 max-w-xs">
                Escolha uma conversa na lista ao lado para ver as mensagens e responder
              </p>
            </div>
          ) : (
            <>
              {/* Chat header */}
              <div className="px-4 py-3 border-b border-border bg-card flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center">
                  <User className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {selectedConv.contactName || formatPhone(selectedConv.phone)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatPhone(selectedConv.phone)}
                  </p>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {loadingMsgs ? (
                  <div className="flex justify-center py-8 text-muted-foreground text-sm">
                    Carregando mensagens...
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex justify-center py-8 text-muted-foreground text-sm">
                    Nenhuma mensagem ainda
                  </div>
                ) : (
                  messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={cn(
                        "flex",
                        msg.direction === "outbound" ? "justify-end" : "justify-start"
                      )}
                    >
                      <div
                        className={cn(
                          "max-w-[70%] px-3 py-2 rounded-2xl text-sm",
                          msg.direction === "outbound"
                            ? "bg-primary text-primary-foreground rounded-br-sm"
                            : "bg-card border border-border text-foreground rounded-bl-sm"
                        )}
                      >
                        <p className="break-words">{msg.body}</p>
                        <p
                          className={cn(
                            "text-[10px] mt-1 text-right",
                            msg.direction === "outbound"
                              ? "text-primary-foreground/70"
                              : "text-muted-foreground"
                          )}
                        >
                          {formatTime(msg.createdAt)}
                          {msg.direction === "outbound" && (
                            <span className="ml-1">
                              {msg.status === "sent" ? "✓" : msg.status === "delivered" ? "✓✓" : msg.status === "read" ? "✓✓" : ""}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Reply input */}
              <div className="px-4 py-3 border-t border-border bg-card">
                <div className="flex gap-2">
                  <Input
                    placeholder="Digite sua resposta..."
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={replyMutation.isPending}
                    className="flex-1 bg-input border-border"
                  />
                  <Button
                    onClick={handleSend}
                    disabled={!replyText.trim() || replyMutation.isPending}
                    className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2"
                  >
                    <Send className="w-4 h-4" />
                    {replyMutation.isPending ? "Enviando..." : "Enviar"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1.5">
                  Pressione Enter para enviar · Shift+Enter para nova linha
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
