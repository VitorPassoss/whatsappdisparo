import { useState, useRef, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Send, Zap, Users, MessageSquare, CheckCircle2,
  XCircle, Clock, Terminal, RefreshCw, AlertCircle, Plus, AlertTriangle,
  FileText, ChevronDown, Loader2, CalendarClock, Calendar
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type ContactStatus = {
  phone: string;
  status: "pending" | "sent" | "failed";
  error?: string;
  time?: string;
};

// Mantém paridade com `chunkMessage` do backend (server/whatsapp-send.ts).
// Só pra preview de quantos blocos serão disparados — o backend é a fonte
// da verdade no envio.
const WHATSAPP_TEXT_MAX = 4096;
const EXPLICIT_BLOCK_SEPARATOR = /\r?\n[ \t]*---+[ \t]*\r?\n/g;

function previewChunks(text: string, max = WHATSAPP_TEXT_MAX): string[] {
  if (!text || !text.trim()) return [];
  const explicit = text
    .split(EXPLICIT_BLOCK_SEPARATOR)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const segments = explicit.length > 0 ? explicit : [text];

  const out: string[] = [];
  for (const segment of segments) {
    if (segment.length <= max) {
      out.push(segment);
      continue;
    }
    let remaining = segment;
    while (remaining.length > max) {
      let cut = -1;
      const para = remaining.lastIndexOf("\n\n", max);
      if (para > max * 0.5) cut = para + 2;
      if (cut === -1) {
        const sent = Math.max(
          remaining.lastIndexOf(". ", max),
          remaining.lastIndexOf("! ", max),
          remaining.lastIndexOf("? ", max),
          remaining.lastIndexOf("\n", max),
        );
        if (sent > max * 0.5) cut = sent + 1;
      }
      if (cut === -1) {
        const sp = remaining.lastIndexOf(" ", max);
        if (sp > max * 0.5) cut = sp + 1;
      }
      if (cut === -1) cut = max;
      out.push(remaining.slice(0, cut).trimEnd());
      remaining = remaining.slice(cut).trimStart();
    }
    if (remaining.length > 0) out.push(remaining);
  }
  return out;
}

export default function Dispatch() {
  const [, navigate] = useLocation();
  const [sessionId, setSessionId] = useState<string>("");
  const [campaignName, setCampaignName] = useState("");
  const [message, setMessage] = useState("");
  const [rawPhones, setRawPhones] = useState("");
  const [listId, setListId] = useState<string>("");
  const [activeCampaignId, setActiveCampaignId] = useState<number | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [delayMin, setDelayMin] = useState(3);
  const [delayMax, setDelayMax] = useState(8);
  const consoleRef = useRef<HTMLDivElement>(null);

  // Template state
  const [messageMode, setMessageMode] = useState<"free" | "template">("free");
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [templateVariables, setTemplateVariables] = useState<string[]>([]);
  const [templateHeaderImageUrl, setTemplateHeaderImageUrl] = useState("");

  const { data: sessions } = trpc.sessions.list.useQuery();
  const { data: contactLists } = trpc.contactLists.list.useQuery();

  const { data: templates, isLoading: loadingTemplates, error: templatesError } = trpc.templates.list.useQuery(
    { sessionId: parseInt(sessionId) },
    { enabled: !!sessionId && messageMode === "template", retry: false }
  );

  const activeTemplate = templates?.find(t => t.name === selectedTemplate);
  const bodyComponent = activeTemplate?.components.find(c => c.type === "BODY");
  const headerComponent = activeTemplate?.components.find(c => c.type === "HEADER");
  const hasHeaderImage = headerComponent?.format === "IMAGE";
  const bodyText = bodyComponent?.text ?? "";
  const variableCount = (bodyText.match(/\{\{\d+\}\}/g) ?? []).length;

  // Sync variable slots when template changes
  useEffect(() => {
    setTemplateVariables(Array(variableCount).fill(""));
  }, [variableCount, selectedTemplate]);

  const { data: activeCampaign, refetch: refetchCampaign } = trpc.campaigns.get.useQuery(
    { id: activeCampaignId! },
    { enabled: !!activeCampaignId, refetchInterval: activeCampaignId ? 1500 : false }
  );

  const { data: campaignContacts, refetch: refetchContacts } = trpc.campaigns.getContacts.useQuery(
    { campaignId: activeCampaignId! },
    { enabled: !!activeCampaignId, refetchInterval: activeCampaignId ? 1500 : false }
  );

  // Stop polling when campaign is done
  useEffect(() => {
    if (activeCampaign?.status === "completed" || activeCampaign?.status === "failed") {
      setIsSending(false);
    }
  }, [activeCampaign?.status]);

  // Auto-scroll console
  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [campaignContacts]);

  const sendMutation = trpc.campaigns.send.useMutation({
    onSuccess: (data) => {
      setActiveCampaignId(data.campaignId);
      setIsSending(true);
      toast.success("Disparo iniciado com sucesso!");
    },
    onError: (err) => {
      setIsSending(false);
      toast.error(err.message);
    },
  });

  const phoneCount = rawPhones
    .split(/[\n,;]+/)
    .map(s => s.trim().replace(/\D/g, ""))
    .filter(s => s.length >= 8).length;

  const messageBlocks = useMemo(() => previewChunks(message), [message]);
  const blockCount = messageBlocks.length;

  const [showConfirm, setShowConfirm] = useState(false);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");

  const handleSend = () => {
    if (!sessionId) return toast.error("Selecione uma sessão WhatsApp");
    if (!campaignName.trim()) return toast.error("Informe o nome da campanha");
    if (messageMode === "free" && !message.trim()) return toast.error("Informe a mensagem");
    if (messageMode === "template" && !selectedTemplate) return toast.error("Selecione um template");
    if (!rawPhones.trim() && !listId) return toast.error("Adicione números ou selecione uma lista");
    if (scheduleEnabled) {
      if (!scheduledDate) return toast.error("Informe a data do agendamento");
      if (!scheduledTime) return toast.error("Informe o horário do agendamento");
      const scheduled = new Date(`${scheduledDate}T${scheduledTime}`);
      if (scheduled <= new Date()) return toast.error("O horário agendado deve ser no futuro");
    }
    setShowConfirm(true);
  };

  const handleConfirmSend = () => {
    setShowConfirm(false);
    const scheduledAt = scheduleEnabled && scheduledDate && scheduledTime
      ? new Date(`${scheduledDate}T${scheduledTime}`)
      : undefined;
    sendMutation.mutate({
      sessionId: parseInt(sessionId),
      name: campaignName,
      message: messageMode === "template"
        ? (selectedTemplate ? `[Template: ${selectedTemplate}]` : "template")
        : message,
      rawPhones: rawPhones || undefined,
      listId: listId ? parseInt(listId) : undefined,
      delayMin,
      delayMax,
      useTemplate: messageMode === "template",
      templateName: messageMode === "template" ? selectedTemplate : undefined,
      templateLanguage: messageMode === "template" ? (activeTemplate?.language ?? "pt_BR") : undefined,
      templateVariables: messageMode === "template" ? templateVariables : undefined,
      templateHeaderImageUrl: messageMode === "template" && hasHeaderImage ? templateHeaderImageUrl : undefined,
      scheduledAt,
    });
  };

  const handleNewDispatch = () => {
    setActiveCampaignId(null);
    setIsSending(false);
    setCampaignName("");
    setMessage("");
    setRawPhones("");
    setListId("");
  };

  const progress = activeCampaign
    ? activeCampaign.totalContacts > 0
      ? Math.round(((activeCampaign.sentCount) / activeCampaign.totalContacts) * 100)
      : 0
    : 0;

  const statusIcon = (status: string) => {
    switch (status) {
      case "sent": case "delivered": case "read":
        return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
      case "failed":
        return <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />;
      default:
        return <Clock className="w-3.5 h-3.5 text-yellow-400 shrink-0" />;
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Novo Disparo</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Configure e envie mensagens em massa via WhatsApp API
            </p>
          </div>
          {activeCampaignId && (
            <Button variant="outline" onClick={handleNewDispatch} className="gap-2">
              <Plus className="w-4 h-4" />
              Novo Disparo
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Config */}
          <div className="space-y-4">
            {/* Session */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Zap className="w-4 h-4 text-primary" />
                  Configuração da Campanha
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Sessão WhatsApp</Label>
                  {sessions && sessions.length === 0 ? (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                      <AlertCircle className="w-4 h-4 text-yellow-400 shrink-0" />
                      <p className="text-xs text-yellow-400">
                        Nenhuma sessão configurada.{" "}
                        <button onClick={() => navigate("/sessions")} className="underline font-medium">
                          Criar sessão
                        </button>
                      </p>
                    </div>
                  ) : (
                    <Select value={sessionId} onValueChange={setSessionId} disabled={isSending}>
                      <SelectTrigger className="bg-input border-border">
                        <SelectValue placeholder="Selecionar sessão..." />
                      </SelectTrigger>
                      <SelectContent>
                        {sessions?.map(s => (
                          <SelectItem key={s.id} value={String(s.id)}>
                            {s.name} — {s.phoneNumberId}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Nome da Campanha</Label>
                  <Input
                    placeholder="Ex: Promoção de Abril"
                    value={campaignName}
                    onChange={e => setCampaignName(e.target.value)}
                    disabled={isSending}
                    className="bg-input border-border"
                  />
                </div>

                {/* Message mode toggle */}
                <div className="space-y-3">
                  <Label className="text-xs text-muted-foreground">Tipo de Mensagem</Label>
                  <Tabs value={messageMode} onValueChange={(v) => setMessageMode(v as "free" | "template")}>
                    <TabsList className="w-full bg-secondary/50">
                      <TabsTrigger value="free" className="flex-1 gap-1.5 text-xs">
                        <MessageSquare className="w-3.5 h-3.5" />
                        Mensagem Livre
                      </TabsTrigger>
                      <TabsTrigger value="template" className="flex-1 gap-1.5 text-xs">
                        <FileText className="w-3.5 h-3.5" />
                        Template Aprovado
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>

                  {messageMode === "free" ? (
                    <div className="space-y-1.5">
                      <Textarea
                        placeholder={
                          "Digite a copy completa da mensagem. Sem limite de tamanho.\n\n" +
                          "Dica: use uma linha contendo só --- para forçar a quebra entre blocos\n" +
                          "que serão enviados em sequência (ex: bloco 1, separador, bloco 2)."
                        }
                        value={message}
                        onChange={e => setMessage(e.target.value)}
                        disabled={isSending}
                        rows={8}
                        className="bg-input border-border resize-y min-h-[160px] font-mono text-sm"
                      />
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>
                          Mensagens longas são divididas em <strong className="text-foreground">{blockCount || 0} bloco{blockCount === 1 ? "" : "s"}</strong> e entregues em ordem.
                        </span>
                        <span className="font-mono">{message.length.toLocaleString("pt-BR")} caracteres</span>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {!sessionId ? (
                        <p className="text-xs text-yellow-400 p-2 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
                          Selecione uma sessão para carregar os templates
                        </p>
                      ) : loadingTemplates ? (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground p-3">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Carregando templates...
                        </div>
                      ) : templatesError ? (
                        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 space-y-1.5">
                          <div className="flex items-center gap-2 text-xs font-medium text-red-400">
                            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                            Erro ao carregar templates
                          </div>
                          <p className="text-xs text-red-300/80">{templatesError.message}</p>
                          {templatesError.message?.includes("WABA ID") && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Acesse <strong>Sessões WhatsApp</strong> e edite o WABA ID da sessão, ou reconecte pelo botão "Entrar com Facebook".
                            </p>
                          )}
                        </div>
                      ) : !templates?.length ? (
                        <p className="text-xs text-muted-foreground p-3 bg-secondary/30 rounded-lg">
                          Nenhum template aprovado encontrado nessa sessão.
                        </p>
                      ) : (
                        <>
                          <Select value={selectedTemplate} onValueChange={setSelectedTemplate} disabled={isSending}>
                            <SelectTrigger className="bg-input border-border">
                              <SelectValue placeholder="Selecionar template..." />
                            </SelectTrigger>
                            <SelectContent>
                              {templates.map(t => (
                                <SelectItem key={t.id} value={t.name}>
                                  <div className="flex flex-col">
                                    <span className="font-medium">{t.name}</span>
                                    <span className="text-xs text-muted-foreground">{t.language} · {t.category}</span>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          {activeTemplate && (
                            <div className="space-y-3">
                              {/* Template preview */}
                              <div className="p-3 rounded-lg bg-[#075E54]/10 border border-[#075E54]/30">
                                <p className="text-xs text-muted-foreground mb-1.5 font-medium">Preview do Template</p>
                                <div className="bg-[#1a1a1a] rounded-lg p-3 text-sm text-foreground font-mono whitespace-pre-wrap">
                                  {bodyText
                                    ? bodyText.replace(/\{\{(\d+)\}\}/g, (_, i) =>
                                        templateVariables[parseInt(i) - 1]
                                          ? `[${templateVariables[parseInt(i) - 1]}]`
                                          : `{{${i}}}`
                                      )
                                    : "(sem corpo de texto)"}
                                </div>
                              </div>

                              {/* Header image URL if needed */}
                              {hasHeaderImage && (
                                <div className="space-y-1.5">
                                  <Label className="text-xs text-muted-foreground">URL da Imagem do Header</Label>
                                  <Input
                                    placeholder="https://exemplo.com/imagem.jpg"
                                    value={templateHeaderImageUrl}
                                    onChange={e => setTemplateHeaderImageUrl(e.target.value)}
                                    disabled={isSending}
                                    className="bg-input border-border text-xs"
                                  />
                                </div>
                              )}

                              {/* Variable inputs */}
                              {variableCount > 0 && (
                                <div className="space-y-2">
                                  <Label className="text-xs text-muted-foreground">Variáveis do Template</Label>
                                  {Array.from({ length: variableCount }, (_, i) => (
                                    <div key={i} className="flex items-center gap-2">
                                      <span className="text-xs text-primary font-mono w-8 shrink-0">{`{{${i + 1}}}`}</span>
                                      <Input
                                        placeholder={`Valor para {{${i + 1}}}`}
                                        value={templateVariables[i] ?? ""}
                                        onChange={e => {
                                          const updated = [...templateVariables];
                                          updated[i] = e.target.value;
                                          setTemplateVariables(updated);
                                        }}
                                        disabled={isSending}
                                        className="bg-input border-border text-xs"
                                      />
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Contacts */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Users className="w-4 h-4 text-primary" />
                  Contatos
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Lista de Contatos (opcional)</Label>
                  <Select value={listId} onValueChange={setListId} disabled={isSending}>
                    <SelectTrigger className="bg-input border-border">
                      <SelectValue placeholder="Selecionar lista salva..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhuma lista</SelectItem>
                      {contactLists?.map(l => (
                        <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">Números (um por linha)</Label>
                    {phoneCount > 0 && (
                      <Badge variant="outline" className="text-xs text-primary border-primary/30">
                        {phoneCount} número{phoneCount !== 1 ? "s" : ""}
                      </Badge>
                    )}
                  </div>
                  <Textarea
                    placeholder={"5511999999999\n5521988888888\n5531977777777"}
                    value={rawPhones}
                    onChange={e => setRawPhones(e.target.value)}
                    disabled={isSending}
                    rows={6}
                    className="bg-input border-border resize-none font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Cole os números com DDI (ex: 5511999999999). Um por linha, vírgula ou ponto e vírgula.
                  </p>
                </div>

                {/* Scheduling toggle */}
                <div className="rounded-lg border border-border bg-secondary/20 p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CalendarClock className="w-4 h-4 text-primary" />
                      <span className="text-sm font-medium text-foreground">Agendar Disparo</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setScheduleEnabled(v => !v)}
                      disabled={isSending}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                        scheduleEnabled ? "bg-primary" : "bg-muted"
                      }`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                        scheduleEnabled ? "translate-x-4" : "translate-x-1"
                      }`} />
                    </button>
                  </div>
                  {scheduleEnabled && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground flex items-center gap-1">
                          <Calendar className="w-3 h-3" /> Data
                        </Label>
                        <Input
                          type="date"
                          value={scheduledDate}
                          min={new Date().toISOString().split("T")[0]}
                          onChange={e => setScheduledDate(e.target.value)}
                          disabled={isSending}
                          className="bg-input border-border text-sm"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" /> Horário
                        </Label>
                        <Input
                          type="time"
                          value={scheduledTime}
                          onChange={e => setScheduledTime(e.target.value)}
                          disabled={isSending}
                          className="bg-input border-border text-sm"
                        />
                      </div>
                    </div>
                  )}
                  {scheduleEnabled && scheduledDate && scheduledTime && (
                    <p className="text-xs text-primary">
                      ✓ Disparo agendado para {new Date(`${scheduledDate}T${scheduledTime}`).toLocaleString("pt-BR")}
                    </p>
                  )}
                </div>

                <Button
                  onClick={handleSend}
                  disabled={isSending || sendMutation.isPending || !sessionId}
                  className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90 h-11 font-semibold"
                >
                  {isSending || sendMutation.isPending ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      {scheduleEnabled ? "Agendando..." : "Enviando..."}
                    </>
                  ) : scheduleEnabled ? (
                    <>
                      <CalendarClock className="w-4 h-4" />
                      Agendar Disparo
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Iniciar Disparo
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Right: Console + Stats */}
          <div className="space-y-4">
            {/* Progress Stats */}
            {activeCampaign && (
              <Card className="bg-card border-border">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">{activeCampaign.name}</span>
                    <Badge
                      variant="outline"
                      className={
                        activeCampaign.status === "completed" ? "text-emerald-400 border-emerald-400/30" :
                        activeCampaign.status === "running" ? "text-blue-400 border-blue-400/30" :
                        activeCampaign.status === "failed" ? "text-red-400 border-red-400/30" :
                        "text-yellow-400 border-yellow-400/30"
                      }
                    >
                      {activeCampaign.status === "running" && <RefreshCw className="w-3 h-3 mr-1 animate-spin" />}
                      {activeCampaign.status === "completed" ? "Concluído" :
                       activeCampaign.status === "running" ? "Enviando" :
                       activeCampaign.status === "failed" ? "Falhou" : "Pendente"}
                    </Badge>
                  </div>
                  <Progress value={progress} className="h-2" />
                  <div className="grid grid-cols-4 gap-2 text-center">
                    {[
                      { label: "Total", value: activeCampaign.totalContacts, color: "text-foreground" },
                      { label: "Enviados", value: activeCampaign.sentCount, color: "text-primary" },
                      { label: "Sucesso", value: activeCampaign.successCount, color: "text-emerald-400" },
                      { label: "Erros", value: activeCampaign.errorCount, color: "text-red-400" },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="p-2 rounded-lg bg-secondary/50">
                        <p className={`text-lg font-bold ${color}`}>{value}</p>
                        <p className="text-xs text-muted-foreground">{label}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Console */}
            <Card className="bg-card border-border flex flex-col" style={{ minHeight: "400px" }}>
              <CardHeader className="pb-2 shrink-0">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-primary" />
                  Console de Envio
                  {isSending && (
                    <span className="ml-auto flex items-center gap-1.5 text-xs text-emerald-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Ao vivo
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 p-0">
                <div
                  ref={consoleRef}
                  className="h-full overflow-y-auto p-4 font-mono text-xs space-y-1.5"
                  style={{ maxHeight: "500px", minHeight: "350px" }}
                >
                  {!activeCampaignId ? (
                    <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground py-16">
                      <Terminal className="w-10 h-10 opacity-20" />
                      <p>Aguardando disparo...</p>
                      <p className="text-xs opacity-60">Configure e inicie um disparo para ver o progresso aqui</p>
                    </div>
                  ) : (
                    <>
                      <div className="text-muted-foreground pb-2 border-b border-border mb-2">
                        <span className="text-primary">▶</span> Campanha: <span className="text-foreground">{activeCampaign?.name}</span>
                        {" — "}{activeCampaign?.totalContacts} contatos
                      </div>
                      {campaignContacts?.map((contact) => (
                        <div key={contact.id} className="flex items-center gap-2">
                          {statusIcon(contact.status)}
                          <span className="text-muted-foreground">[{
                            contact.sentAt
                              ? format(new Date(contact.sentAt), "HH:mm:ss")
                              : "--:--:--"
                          }]</span>
                          <span className="text-foreground">{contact.phone}</span>
                          {contact.status === "sent" || contact.status === "delivered" ? (
                            <span className="text-emerald-400">✓ enviado</span>
                          ) : contact.status === "failed" ? (
                            <span className="text-red-400">✗ {contact.errorMessage ?? "erro"}</span>
                          ) : (
                            <span className="text-yellow-400">⏳ pendente</span>
                          )}
                        </div>
                      ))}
                      {activeCampaign?.status === "completed" && (
                        <div className="mt-3 pt-3 border-t border-border text-emerald-400">
                          ✓ Disparo concluído — {activeCampaign.successCount} sucessos, {activeCampaign.errorCount} erros
                        </div>
                      )}
                      {activeCampaign?.status === "failed" && (
                        <div className="mt-3 pt-3 border-t border-border text-red-400">
                          ✗ Disparo encerrado com falhas
                        </div>
                      )}
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      {/* Confirm Dispatch Dialog */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-400" />
              Confirmar Disparo
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-secondary/50 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Campanha</span>
                <span className="font-medium text-foreground">{campaignName}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Números</span>
                <span className="font-medium text-primary">{phoneCount} contatos</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Sessão</span>
                <span className="font-medium text-foreground">{sessions?.find(s => String(s.id) === sessionId)?.name}</span>
              </div>
              {messageMode === "free" && blockCount > 1 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Blocos por contato</span>
                  <span className="font-medium text-primary">{blockCount}</span>
                </div>
              )}
            </div>
            <div className="p-3 rounded-lg bg-secondary/30 border border-border">
              <p className="text-xs text-muted-foreground mb-1">
                Mensagem{messageMode === "free" && blockCount > 1 ? ` · ${blockCount} blocos sequenciais` : ""}
              </p>
              <p className="text-sm text-foreground line-clamp-3">{message}</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Ao confirmar, o disparo será iniciado imediatamente para todos os contatos.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirm(false)}>Cancelar</Button>
            <Button
              onClick={handleConfirmSend}
              className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2"
            >
              <Send className="w-4 h-4" />
              Confirmar Disparo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
